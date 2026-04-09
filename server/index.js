import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  getDb,
  normalizePhone,
  normalizeNickname,
  findUserByPhone,
  findUserByNickname,
  findUserById,
  findUserWithSecretByNickname,
  createUser,
  mapPublicUser,
  setUserAvatarPath,
} from './db.js';
import { uploadsRoot, avatarUpload } from './avatarUpload.js';
import { hashPassword, verifyPassword, validatePasswordStrength } from './password.js';
import {
  resolveTargetUser,
  createFriendRequest,
  listIncomingFriendRequests,
  getFriendRequestById,
  acceptFriendRequest,
  rejectFriendRequest,
  listDirectChatsForUser,
  listMessagesForChat,
  insertDirectMessage,
  markChatRead,
  countTotalUnreadMessages,
  listPeerUserIds,
  listFeedPostsForViewer,
  createPost,
  listStoryBucketsForViewer,
  listActiveStoryItems,
  listArchivedStoriesForViewer,
  createStory,
  areFriends,
} from './social.js';
import { storyImageUpload, storyMediaRelativePath } from './storyUpload.js';

const PORT = Number(process.env.PORT) || 3001;

getDb();

const app = express();
app.use(cors({ origin: true, allowedHeaders: ['Content-Type', 'X-User-Id'] }));
app.use(express.json());
app.use('/uploads', express.static(uploadsRoot));

/** userId -> Set<WebSocket> */
const socketsByUser = new Map();

function sendToUser(userId, obj) {
  const set = socketsByUser.get(userId);
  if (!set) return;
  const raw = JSON.stringify(obj);
  for (const ws of set) {
    if (ws.readyState === 1) ws.send(raw);
  }
}

function notifyPeers(userId, event) {
  for (const pid of listPeerUserIds(userId)) {
    sendToUser(pid, event);
  }
  sendToUser(userId, event);
}

function requireUser(req, res) {
  const uid = req.headers['x-user-id'];
  if (!uid || typeof uid !== 'string' || !uid.trim()) {
    res.status(401).json({ error: 'Нужен вход' });
    return null;
  }
  const u = findUserById(uid.trim());
  if (!u) {
    res.status(401).json({ error: 'Сессия недействительна' });
    return null;
  }
  return u.id;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'monastir-crew-message' });
});

app.get('/api/auth/user/:id', (req, res) => {
  const user = findUserById(req.params.id);
  if (!user) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }
  res.json({ user });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !username.trim()) {
    res.status(400).json({ error: 'Укажите никнейм' });
    return;
  }
  if (typeof password !== 'string' || !password) {
    res.status(400).json({ error: 'Укажите пароль' });
    return;
  }

  const nickname = normalizeNickname(username);
  if (!nickname) {
    res.status(400).json({ error: 'Никнейм: 3–30 символов латиницы, цифр и _' });
    return;
  }

  const row = findUserWithSecretByNickname(nickname);
  if (!row?.passwordHash || !verifyPassword(password, row.passwordHash)) {
    res.status(401).json({ error: 'Неверный никнейм или пароль' });
    return;
  }

  const user = mapPublicUser(row);
  res.json({ user });
});

app.post('/api/auth/register', (req, res) => {
  const { phone: rawPhone, firstName, lastName, nickname: rawNick, password } = req.body || {};

  if (typeof rawPhone !== 'string' || !rawPhone.trim()) {
    res.status(400).json({ error: 'Укажите номер телефона' });
    return;
  }
  if (typeof firstName !== 'string' || !firstName.trim()) {
    res.status(400).json({ error: 'Укажите имя' });
    return;
  }
  if (typeof lastName !== 'string' || !lastName.trim()) {
    res.status(400).json({ error: 'Укажите фамилию' });
    return;
  }
  if (typeof rawNick !== 'string' || !rawNick.trim()) {
    res.status(400).json({ error: 'Укажите никнейм' });
    return;
  }
  if (typeof password !== 'string' || !password) {
    res.status(400).json({ error: 'Укажите пароль' });
    return;
  }

  const pwdErr = validatePasswordStrength(password);
  if (pwdErr) {
    res.status(400).json({ error: pwdErr });
    return;
  }

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    res.status(400).json({ error: 'Некорректный номер: нужно от 10 до 15 цифр' });
    return;
  }

  const nickname = normalizeNickname(rawNick);
  if (!nickname) {
    res.status(400).json({
      error: 'Ник: 3–30 символов латиницы, цифр и _, формат @nickname',
    });
    return;
  }

  if (firstName.trim().length > 80 || lastName.trim().length > 80) {
    res.status(400).json({ error: 'Имя и фамилия не длиннее 80 символов' });
    return;
  }

  if (findUserByPhone(phone)) {
    res.status(409).json({ error: 'Этот номер уже зарегистрирован' });
    return;
  }
  if (findUserByNickname(nickname)) {
    res.status(409).json({ error: 'Этот никнейм уже занят' });
    return;
  }

  try {
    const passwordHash = hashPassword(password);
    const user = createUser({ phone, firstName, lastName, nickname, passwordHash });
    res.status(201).json({ user });
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) {
      res.status(409).json({ error: 'Номер или никнейм уже заняты' });
      return;
    }
    throw e;
  }
});

/** Заявка в друзья по нику или телефону. */
app.post('/api/friends/request', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const { target } = req.body || {};
  if (typeof target !== 'string' || !target.trim()) {
    res.status(400).json({ error: 'Укажите ник или телефон' });
    return;
  }
  const targetUser = resolveTargetUser(target);
  if (!targetUser) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }
  const result = createFriendRequest(userId, targetUser.id);
  if (result.error) {
    res.status(409).json({ error: result.error });
    return;
  }
  sendToUser(targetUser.id, {
    type: 'friendRequest:new',
    payload: {
      requestId: result.request.id,
      fromUser: result.request.fromUser,
    },
  });
  res.status(201).json(result);
});

app.get('/api/friends/requests/incoming', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  res.json({ requests: listIncomingFriendRequests(userId) });
});

app.post('/api/friends/requests/:id/accept', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const frBefore = getFriendRequestById(req.params.id);
  const out = acceptFriendRequest(req.params.id, userId);
  if (out.error) {
    res.status(out.error.includes('не найдена') ? 404 : 403).json({ error: out.error });
    return;
  }
  const senderId = frBefore?.fromUserId;
  if (senderId && senderId !== userId) {
    sendToUser(senderId, {
      type: 'friendRequest:accepted',
      payload: { chatId: out.chatId },
    });
  }
  res.json({ ok: true, chatId: out.chatId });
});

app.post('/api/friends/requests/:id/reject', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = rejectFriendRequest(req.params.id, userId);
  if (out.error) {
    res.status(out.error.includes('не найдена') ? 404 : 403).json({ error: out.error });
    return;
  }
  res.json({ ok: true });
});

app.get('/api/feed', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  res.json({ posts: listFeedPostsForViewer(userId) });
});

app.post('/api/feed', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = createPost(userId, req.body?.body);
  if (out.error) {
    res.status(400).json({ error: out.error });
    return;
  }
  notifyPeers(userId, { type: 'feed:new', payload: { postId: out.post.id } });
  res.status(201).json({ post: out.post });
});

app.get('/api/users/:targetId/profile', (req, res) => {
  const viewerId = requireUser(req, res);
  if (!viewerId) return;
  const targetId = req.params.targetId;
  const target = findUserById(targetId);
  if (!target) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }
  if (viewerId === targetId) {
    res.json({ user: target, isSelf: true });
    return;
  }
  if (!areFriends(viewerId, targetId)) {
    res.status(403).json({ error: 'Профиль доступен только друзьям' });
    return;
  }
  const { phone: _p, ...user } = target;
  res.json({ user, isSelf: false });
});

app.get('/api/chats', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  res.json({ chats: listDirectChatsForUser(userId) });
});

app.get('/api/chats/unread-total', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  res.json({ total: countTotalUnreadMessages(userId) });
});

app.post('/api/chats/:chatId/read', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = markChatRead(userId, req.params.chatId);
  if (out.error) {
    res.status(403).json({ error: out.error });
    return;
  }
  res.json({ ok: true });
});

app.post('/api/users/me/avatar', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Ошибка загрузки' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Выберите файл изображения' });
      return;
    }
    const rel = `avatars/${req.file.filename}`;
    setUserAvatarPath(userId, rel);
    const user = findUserById(userId);
    res.json({ user });
  });
});

app.get('/api/chats/:chatId/messages', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const msgs = listMessagesForChat(req.params.chatId, userId);
  if (msgs === null) {
    res.status(404).json({ error: 'Чат не найден или нет доступа' });
    return;
  }
  res.json({ messages: msgs });
});

app.post('/api/chats/:chatId/messages', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const result = insertDirectMessage(req.params.chatId, userId, req.body?.body);
  if (result.error) {
    const code = result.error.includes('доступ') ? 403 : 400;
    res.status(code).json({ error: result.error });
    return;
  }
  sendToUser(result.peerId, {
    type: 'chat:message:new',
    payload: {
      chatId: req.params.chatId,
      message: result.message,
    },
  });
  res.status(201).json({ message: result.message });
});

app.get('/api/rooms', (_req, res) => {
  res.json({ rooms: [] });
});

app.get('/api/stories', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  res.json({ buckets: listStoryBucketsForViewer(userId) });
});

app.get('/api/stories/archive', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  res.json({ items: listArchivedStoriesForViewer(userId) });
});

app.get('/api/stories/author/:authorId', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const items = listActiveStoryItems(userId, req.params.authorId);
  if (items === null) {
    res.status(403).json({ error: 'Нет доступа' });
    return;
  }
  res.json({ items });
});

app.post('/api/stories', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = createStory(userId, { body: req.body?.body, mediaPath: '' });
  if (out.error) {
    res.status(400).json({ error: out.error });
    return;
  }
  notifyPeers(userId, { type: 'stories:new', payload: { authorId: userId } });
  res.status(201).json(out);
});

app.post('/api/stories/upload', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  storyImageUpload.single('media')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Ошибка загрузки' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Прикрепите изображение' });
      return;
    }
    const rel = storyMediaRelativePath(req.file.filename);
    const caption = typeof req.body?.body === 'string' ? req.body.body : '';
    const out = createStory(userId, { body: caption, mediaPath: rel });
    if (out.error) {
      res.status(400).json({ error: out.error });
      return;
    }
    notifyPeers(userId, { type: 'stories:new', payload: { authorId: userId } });
    res.status(201).json(out);
  });
});

app.get('/api/users/presence', (_req, res) => {
  res.json({ users: [] });
});

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(obj, except = null) {
  const raw = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState !== 1) continue;
    if (client === except) continue;
    client.send(raw);
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const userId = url.searchParams.get('userId') || 'guest-' + randomUUID().slice(0, 8);

  if (!socketsByUser.has(userId)) socketsByUser.set(userId, new Set());
  socketsByUser.get(userId).add(ws);

  ws.send(
    JSON.stringify({
      type: 'hello',
      payload: { userId, serverTime: Date.now() },
    })
  );

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    const { type, payload } = msg || {};

    if (type === 'typing' && payload?.chatId) {
      broadcast(
        {
          type: 'typing',
          payload: { chatId: payload.chatId, userId, active: Boolean(payload.active) },
        },
        ws
      );
    }

    if (type === 'story:progress' && payload?.storyId != null) {
      broadcast(
        {
          type: 'story:progress',
          payload: {
            storyId: payload.storyId,
            userId,
            index: payload.index,
            total: payload.total,
          },
        },
        ws
      );
    }

    if (type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', payload: { t: Date.now() } }));
    }
  });

  ws.on('close', () => {
    const set = socketsByUser.get(userId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) socketsByUser.delete(userId);
    }
  });
});

/** В production (или SERVE_SPA=1) отдаём собранный Vite-клиент с этого же процесса. */
const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
const serveSpa = process.env.NODE_ENV === 'production' || process.env.SERVE_SPA === '1';
if (serveSpa && fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get(/.*/, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`API + WS http://localhost:${PORT}  (WS path /ws)${serveSpa ? ' + SPA' : ''}`);
});

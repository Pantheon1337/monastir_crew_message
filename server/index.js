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
  setUserAbout,
  setUserRealNames,
  tryChangeUserNickname,
  stripNicknameChangeMeta,
  setUserDisplayRole,
  setUserAffiliationEmoji,
  normalizeAffiliationEmoji,
  setUserLastSeenAt,
  setUserHideLastSeen,
  userHidesLastSeen,
} from './db.js';
import { uploadsRoot, avatarUpload } from './avatarUpload.js';
import { chatVoiceUpload, chatVideoNoteUpload, chatAttachmentUpload, chatMediaRelativePath } from './chatMediaUpload.js';
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
  updateDirectMessage,
  insertChatMediaMessage,
  getMessageByIdForChat,
  markChatRead,
  getPeerIdInDirectChat,
  countTotalUnreadMessages,
  listPeerUserIds,
  listFeedPostsForViewer,
  createPost,
  updateFeedPost,
  deleteFeedPost,
  listStoryBucketsForViewer,
  listActiveStoryItems,
  listArchivedStoriesForViewer,
  archiveStoryForFeed,
  unarchiveStoryForFeed,
  deleteStoryByAuthor,
  listOwnStoriesForManagement,
  createStory,
  areFriends,
  haveDirectChatLink,
  removeFriendship,
  blockUser,
  unblockUser,
  getFriendshipMetaForProfile,
  recordStoryView,
  insertStoryReactionMessage,
  toggleMessageReaction,
  hideDirectMessageForViewer,
  revokeDirectMessageForEveryone,
  hideRoomMessageForViewer,
  revokeRoomMessageForEveryone,
  forwardMessageToDirectChat,
  forwardMessageToRoom,
  listFriendPeersForUser,
  listUsersDirectoryForViewer,
  listRoomsForUser,
  getRoomByIdForUser,
  createRoom,
  updateRoom,
  addRoomMembers,
  listRoomMessages,
  insertRoomMessage,
  updateRoomMessage,
  insertRoomMediaMessage,
  insertChatAttachmentMessage,
  insertRoomAttachmentMessage,
  getMessageByIdForRoom,
  markRoomRead,
  toggleRoomMessageReaction,
  listRoomMemberUserIds,
  togglePostReaction,
  listPostReactionUsers,
  listMessageReactionUsers,
  listPostComments,
  createPostComment,
  updatePostComment,
  deletePostComment,
  pinDirectMessage,
  unpinDirectMessage,
} from './social.js';
import { storyImageUpload, storyMediaRelativePath } from './storyUpload.js';
import { feedPostUpload, feedMediaRelativePath } from './feedPostUpload.js';

const PORT = Number(process.env.PORT) || 3001;

getDb();

const app = express();
app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-User-Id', 'Authorization'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);
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

/** WS: всем вошедшим пользователям (обновление ленты/историй для «общей» видимости). */
function broadcastToAllAuthenticatedUsers(event) {
  for (const uid of socketsByUser.keys()) {
    if (uid.startsWith('guest-')) continue;
    sendToUser(uid, event);
  }
}

function broadcastRoom(roomId, event) {
  for (const uid of listRoomMemberUserIds(roomId)) {
    sendToUser(uid, event);
  }
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

app.post('/api/friends/remove', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const peerId = req.body?.peerUserId;
  if (typeof peerId !== 'string' || !peerId.trim()) {
    res.status(400).json({ error: 'Укажите пользователя' });
    return;
  }
  const out = removeFriendship(userId, peerId.trim());
  if (out.error) {
    res.status(400).json({ error: out.error });
    return;
  }
  res.json({ ok: true });
});

app.post('/api/friends/block', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const peerId = req.body?.peerUserId;
  if (typeof peerId !== 'string' || !peerId.trim()) {
    res.status(400).json({ error: 'Укажите пользователя' });
    return;
  }
  const out = blockUser(userId, peerId.trim());
  if (out.error) {
    res.status(400).json({ error: out.error });
    return;
  }
  res.json({ ok: true });
});

app.post('/api/friends/unblock', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const peerId = req.body?.peerUserId;
  if (typeof peerId !== 'string' || !peerId.trim()) {
    res.status(400).json({ error: 'Укажите пользователя' });
    return;
  }
  unblockUser(userId, peerId.trim());
  res.json({ ok: true });
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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json({ posts: listFeedPostsForViewer(userId) });
});

app.post('/api/feed/upload', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  feedPostUpload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Ошибка загрузки' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Выберите файл' });
      return;
    }
    res.json({ mediaPath: feedMediaRelativePath(req.file.filename) });
  });
});

app.post('/api/feed', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = createPost(userId, {
    body: req.body?.body,
    mediaPath: req.body?.mediaPath,
    friendsOnly: req.body?.friendsOnly,
  });
  if (out.error) {
    res.status(400).json({ error: out.error });
    return;
  }
  broadcastToAllAuthenticatedUsers({ type: 'feed:new', payload: { postId: out.post.id } });
  res.status(201).json({ post: out.post });
});

app.patch('/api/feed/:postId', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = updateFeedPost(req.params.postId, userId, req.body?.body);
  if (out.error) {
    const st = out.error.includes('не найден') ? 404 : out.error.includes('Нет доступа') ? 403 : 400;
    res.status(st).json({ error: out.error });
    return;
  }
  broadcastToAllAuthenticatedUsers({ type: 'feed:changed', payload: { postId: req.params.postId } });
  res.json({ ok: true, editedAt: out.editedAt });
});

app.delete('/api/feed/:postId', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = deleteFeedPost(req.params.postId, userId);
  if (out.error) {
    const st = out.error.includes('не найден') ? 404 : out.error.includes('Нет доступа') ? 403 : 400;
    res.status(st).json({ error: out.error });
    return;
  }
  if (out.mediaPath) {
    try {
      const full = path.join(uploadsRoot, out.mediaPath);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch {
      /* ignore */
    }
  }
  broadcastToAllAuthenticatedUsers({ type: 'feed:changed', payload: { postId: req.params.postId, deleted: true } });
  res.json({ ok: true });
});

app.post('/api/feed/:postId/reaction', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const reaction = typeof req.body?.reaction === 'string' ? req.body.reaction.trim() : '';
  const out = togglePostReaction(req.params.postId, userId, reaction);
  if (out.error) {
    const st =
      out.error.includes('не найден') ? 404 : out.error.includes('Нет доступа') ? 403 : out.error.includes('Неизвестная') ? 400 : 400;
    res.status(st).json({ error: out.error });
    return;
  }
  broadcastToAllAuthenticatedUsers({ type: 'feed:changed', payload: { postId: req.params.postId } });
  res.json({ ok: true, reactions: out.reactions });
});

app.get('/api/feed/:postId/reactions', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = listPostReactionUsers(req.params.postId, userId);
  if (out.error) {
    const st = out.error.includes('не найден') ? 404 : 403;
    res.status(st).json({ error: out.error });
    return;
  }
  res.json(out);
});

app.get('/api/feed/:postId/comments', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = listPostComments(req.params.postId, userId);
  if (out.error) {
    const st = out.error.includes('не найден') ? 404 : 403;
    res.status(st).json({ error: out.error });
    return;
  }
  res.json(out);
});

app.post('/api/feed/:postId/comments', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = createPostComment(req.params.postId, userId, req.body?.body, {
    parentCommentId: req.body?.parentCommentId,
  });
  if (out.error) {
    const st = out.error.includes('не найден') ? 404 : out.error.includes('Нет доступа') ? 403 : 400;
    res.status(st).json({ error: out.error });
    return;
  }
  broadcastToAllAuthenticatedUsers({ type: 'feed:changed', payload: { postId: req.params.postId } });
  res.status(201).json(out);
});

app.patch('/api/feed/:postId/comments/:commentId', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = updatePostComment(req.params.commentId, userId, req.body?.body);
  if (out.error) {
    const st = out.error.includes('не найден') ? 404 : out.error.includes('Нет доступа') ? 403 : 400;
    res.status(st).json({ error: out.error });
    return;
  }
  broadcastToAllAuthenticatedUsers({ type: 'feed:changed', payload: { postId: req.params.postId } });
  res.json(out);
});

app.delete('/api/feed/:postId/comments/:commentId', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = deletePostComment(req.params.commentId, userId);
  if (out.error) {
    const st = out.error.includes('не найден') ? 404 : out.error.includes('Нет доступа') ? 403 : 400;
    res.status(st).json({ error: out.error });
    return;
  }
  broadcastToAllAuthenticatedUsers({ type: 'feed:changed', payload: { postId: req.params.postId } });
  res.json({ ok: true });
});

app.get('/api/chats/:chatId/messages/:messageId/reactions', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = listMessageReactionUsers(req.params.messageId, userId);
  if (out.error) {
    const st = out.error.includes('не найден') ? 404 : 403;
    res.status(st).json({ error: out.error });
    return;
  }
  res.json(out);
});

app.get('/api/rooms/:roomId/messages/:messageId/reactions', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = listMessageReactionUsers(req.params.messageId, userId);
  if (out.error) {
    const st = out.error.includes('не найден') ? 404 : 403;
    res.status(st).json({ error: out.error });
    return;
  }
  res.json(out);
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
  if (!areFriends(viewerId, targetId) && !haveDirectChatLink(viewerId, targetId)) {
    res.status(403).json({ error: 'Профиль доступен только друзьям' });
    return;
  }
  const { phone: _p, ...user } = stripNicknameChangeMeta(target);
  const friendship = getFriendshipMetaForProfile(viewerId, targetId);
  res.json({ user, isSelf: false, friendship });
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
  const chatId = req.params.chatId;
  const out = markChatRead(userId, chatId);
  if (out.error) {
    res.status(403).json({ error: out.error });
    return;
  }
  const peerId = getPeerIdInDirectChat(chatId, userId);
  if (peerId && peerId !== userId && out.readAt != null) {
    sendToUser(peerId, {
      type: 'chat:peerRead',
      payload: { chatId, readAt: out.readAt },
    });
  }
  res.json({ ok: true, readAt: out.readAt });
});

app.patch('/api/users/me', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const about = req.body?.about;
  if (about !== undefined && about !== null && typeof about !== 'string') {
    res.status(400).json({ error: 'Поле «о себе» должно быть строкой' });
    return;
  }
  if (typeof about === 'string' && about.length > 100) {
    res.status(400).json({ error: 'Не больше 100 символов' });
    return;
  }
  if (typeof about === 'string') {
    setUserAbout(userId, about);
  }
  const roleRaw = req.body?.displayRole;
  if (roleRaw !== undefined && roleRaw !== null) {
    if (typeof roleRaw !== 'string') {
      res.status(400).json({ error: 'Роль должна быть строкой' });
      return;
    }
    const r = roleRaw.toLowerCase();
    if (r !== 'user' && r !== 'beta') {
      res.status(400).json({ error: 'Можно выбрать только «Пользователь» или «Бета-тестер»' });
      return;
    }
    setUserDisplayRole(userId, r);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'affiliationEmoji')) {
    const raw = req.body?.affiliationEmoji;
    if (raw === null || raw === '') {
      setUserAffiliationEmoji(userId, null);
    } else if (typeof raw !== 'string') {
      res.status(400).json({ error: 'Смайлик принадлежности должен быть строкой или пустым' });
      return;
    } else {
      const n = normalizeAffiliationEmoji(raw);
      if (raw.trim() && !n) {
        res.status(400).json({ error: 'Выберите смайлик из предложенного списка' });
        return;
      }
      setUserAffiliationEmoji(userId, n);
    }
  }

  const body = req.body || {};
  const hasFirst = Object.prototype.hasOwnProperty.call(body, 'firstName');
  const hasLast = Object.prototype.hasOwnProperty.call(body, 'lastName');
  if (hasFirst || hasLast) {
    if (!hasFirst || !hasLast) {
      res.status(400).json({ error: 'Укажите и имя, и фамилию' });
      return;
    }
    if (typeof body.firstName !== 'string' || typeof body.lastName !== 'string') {
      res.status(400).json({ error: 'Имя и фамилия должны быть строками' });
      return;
    }
    const nameOut = setUserRealNames(userId, body.firstName, body.lastName);
    if (nameOut.error) {
      res.status(400).json({ error: nameOut.error });
      return;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'nickname')) {
    const rawNick = body.nickname;
    if (rawNick !== null && typeof rawNick !== 'string') {
      res.status(400).json({ error: 'Username должен быть строкой' });
      return;
    }
    const nickOut = tryChangeUserNickname(userId, rawNick ?? '');
    if (nickOut.error) {
      res.status(400).json({ error: nickOut.error });
      return;
    }
  }

  const user = findUserById(userId);
  res.json({ user });
});

app.get('/api/users/lookup/:nickname', (req, res) => {
  const viewerId = requireUser(req, res);
  if (!viewerId) return;
  const nick = normalizeNickname(req.params.nickname);
  if (!nick) {
    res.status(400).json({ error: 'Некорректный никнейм' });
    return;
  }
  const target = findUserByNickname(nick);
  if (!target) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }
  if (target.id === viewerId) {
    res.json({ user: { id: target.id, nickname: target.nickname } });
    return;
  }
  if (!areFriends(viewerId, target.id) && !haveDirectChatLink(viewerId, target.id)) {
    res.status(403).json({ error: 'Упоминание: профиль доступен только друзьям' });
    return;
  }
  res.json({ user: { id: target.id, nickname: target.nickname } });
});

app.post('/api/users/me/avatar', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Файл слишком большой (максимум 8 МБ). Выберите другое фото или уменьшите его в галерее.'
          : err.message || 'Ошибка загрузки';
      res.status(400).json({ error: msg });
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

app.post('/api/chats/:chatId/messages/:messageId/pin', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const scope = req.body?.scope === 'both' ? 'both' : 'self';
  const out = pinDirectMessage(req.params.chatId, userId, req.params.messageId, scope);
  if (out.error) {
    const st = out.error.includes('Нет доступа') ? 403 : out.error.includes('не найден') ? 404 : 400;
    res.status(st).json({ error: out.error });
    return;
  }
  const peerId = out.peerId;
  if (peerId && peerId !== userId && scope === 'both') {
    sendToUser(peerId, { type: 'chat:pinsChanged', payload: { chatId: req.params.chatId } });
  }
  res.json({ ok: true });
});

app.post('/api/chats/:chatId/messages/:messageId/unpin', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const scope = req.body?.scope === 'both' ? 'both' : 'self';
  const out = unpinDirectMessage(req.params.chatId, userId, req.params.messageId, scope);
  if (out.error) {
    res.status(403).json({ error: out.error });
    return;
  }
  const peerId = out.peerId;
  if (peerId && peerId !== userId && scope === 'both') {
    sendToUser(peerId, { type: 'chat:pinsChanged', payload: { chatId: req.params.chatId } });
  }
  res.json({ ok: true });
});

app.post('/api/chats/:chatId/messages', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const result = insertDirectMessage(req.params.chatId, userId, req.body?.body, { replyToId: req.body?.replyToId });
  if (result.error) {
    const code = result.error.includes('доступ') ? 403 : 400;
    res.status(code).json({ error: result.error });
    return;
  }
  const chatId = req.params.chatId;
  const msgOut =
    getMessageByIdForChat(chatId, result.message.id, userId) || result.message;
  sendToUser(result.peerId, {
    type: 'chat:message:new',
    payload: {
      chatId,
      message: msgOut,
    },
  });
  res.status(201).json({ message: msgOut });
});

app.patch('/api/chats/:chatId/messages/:messageId', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = updateDirectMessage(req.params.chatId, userId, req.params.messageId, req.body?.body);
  if (out.error) {
    const st = out.error.includes('не найден')
      ? 404
      : out.error.includes('Нет доступа') || out.error.includes('только')
        ? 403
        : 400;
    res.status(st).json({ error: out.error });
    return;
  }
  const chatId = req.params.chatId;
  const messageId = req.params.messageId;
  const peerId = out.peerId;
  const msgPeer = peerId ? getMessageByIdForChat(chatId, messageId, peerId) : null;
  const msgSelf = getMessageByIdForChat(chatId, messageId, userId);
  if (peerId && msgPeer) {
    sendToUser(peerId, { type: 'chat:message:updated', payload: { chatId, message: msgPeer } });
  }
  if (msgSelf) {
    sendToUser(userId, { type: 'chat:message:updated', payload: { chatId, message: msgSelf } });
  }
  res.json({ message: msgSelf || msgPeer });
});

app.post('/api/chats/:chatId/messages/voice', (req, res) => {
  chatVoiceUpload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Ошибка загрузки' });
      return;
    }
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!req.file) {
      res.status(400).json({ error: 'Нет аудиофайла' });
      return;
    }
    const durationMs = parseInt(String(req.body?.durationMs ?? ''), 10);
    const rel = chatMediaRelativePath(req.file.filename);
    const result = insertChatMediaMessage(req.params.chatId, userId, 'voice', rel, durationMs);
    if (result.error) {
      const code = result.error.includes('доступ') ? 403 : 400;
      res.status(code).json({ error: result.error });
      return;
    }
    const chatId = req.params.chatId;
    const msgOut = getMessageByIdForChat(chatId, result.message.id, userId) || result.message;
    sendToUser(result.peerId, {
      type: 'chat:message:new',
      payload: {
        chatId,
        message: msgOut,
      },
    });
    res.status(201).json({ message: msgOut });
  });
});

app.post('/api/chats/:chatId/messages/video-note', (req, res) => {
  chatVideoNoteUpload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Ошибка загрузки' });
      return;
    }
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!req.file) {
      res.status(400).json({ error: 'Нет видеофайла' });
      return;
    }
    const durationMs = parseInt(String(req.body?.durationMs ?? ''), 10);
    const rel = chatMediaRelativePath(req.file.filename);
    const result = insertChatMediaMessage(req.params.chatId, userId, 'video_note', rel, durationMs);
    if (result.error) {
      const code = result.error.includes('доступ') ? 403 : 400;
      res.status(code).json({ error: result.error });
      return;
    }
    const chatId = req.params.chatId;
    const msgOut = getMessageByIdForChat(chatId, result.message.id, userId) || result.message;
    sendToUser(result.peerId, {
      type: 'chat:message:new',
      payload: {
        chatId,
        message: msgOut,
      },
    });
    res.status(201).json({ message: msgOut });
  });
});

app.post('/api/chats/:chatId/messages/media', (req, res) => {
  chatAttachmentUpload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Ошибка загрузки' });
      return;
    }
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!req.file) {
      res.status(400).json({ error: 'Нет файла' });
      return;
    }
    const mime = (req.file.mimetype || '').toLowerCase();
    const kind = mime.startsWith('image/') ? 'image' : 'file';
    const rel = chatMediaRelativePath(req.file.filename);
    const rawName = String(req.file.originalname || 'файл').replace(/[<>"]/g, '').trim() || 'файл';
    const caption = typeof req.body?.caption === 'string' ? req.body.caption : '';
    const bodyField = kind === 'image' ? caption : rawName.slice(0, 400);
    const result = insertChatAttachmentMessage(req.params.chatId, userId, kind, rel, bodyField);
    if (result.error) {
      const code = result.error.includes('доступ') ? 403 : 400;
      res.status(code).json({ error: result.error });
      return;
    }
    const chatId = req.params.chatId;
    const msgOut = getMessageByIdForChat(chatId, result.message.id, userId) || result.message;
    sendToUser(result.peerId, {
      type: 'chat:message:new',
      payload: {
        chatId,
        message: msgOut,
      },
    });
    res.status(201).json({ message: msgOut });
  });
});

app.post('/api/chats/:chatId/messages/:messageId/reaction', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const reaction = req.body?.reaction;
  if (typeof reaction !== 'string' || !reaction.trim()) {
    res.status(400).json({ error: 'Нет реакции' });
    return;
  }
  const result = toggleMessageReaction(req.params.chatId, userId, req.params.messageId, reaction.trim());
  if (result.error) {
    const code = result.error.includes('доступ') ? 403 : 400;
    res.status(code).json({ error: result.error });
    return;
  }
  const { chatId, messageId } = req.params;
  sendToUser(result.peerId, {
    type: 'chat:message:reaction',
    payload: { chatId, messageId, reactions: result.reactions },
  });
  sendToUser(userId, {
    type: 'chat:message:reaction',
    payload: { chatId, messageId, reactions: result.reactions },
  });
  res.json({ reactions: result.reactions });
});

app.post('/api/chats/:chatId/messages/:messageId/delete-for-me', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const { chatId, messageId } = req.params;
  const out = hideDirectMessageForViewer(chatId, userId, messageId);
  if (out.error) {
    res.status(out.error.includes('не найден') ? 404 : 403).json({ error: out.error });
    return;
  }
  res.json({ ok: true });
});

app.post('/api/chats/:chatId/messages/:messageId/delete-for-everyone', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const { chatId, messageId } = req.params;
  const out = revokeDirectMessageForEveryone(chatId, userId, messageId);
  if (out.error) {
    const st = out.error.includes('не найден') ? 404 : out.error.includes('Нет доступа') ? 403 : 400;
    res.status(st).json({ error: out.error });
    return;
  }
  const peerId = out.peerId;
  const msgPeer = peerId ? getMessageByIdForChat(chatId, messageId, peerId) : null;
  const msgSelf = getMessageByIdForChat(chatId, messageId, userId);
  if (peerId && msgPeer) sendToUser(peerId, { type: 'chat:message:updated', payload: { chatId, message: msgPeer } });
  if (msgSelf) sendToUser(userId, { type: 'chat:message:updated', payload: { chatId, message: msgSelf } });
  res.json({ ok: true, message: msgSelf || msgPeer });
});

app.post('/api/chats/:chatId/forward', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const { fromChatId, fromRoomId, messageId } = req.body || {};
  const out = forwardMessageToDirectChat(req.params.chatId, userId, fromChatId, fromRoomId, messageId);
  if (out.error) {
    res.status(400).json({ error: out.error });
    return;
  }
  const chatId = req.params.chatId;
  const msgOut = getMessageByIdForChat(chatId, out.messageId, userId);
  sendToUser(out.peerId, {
    type: 'chat:message:new',
    payload: { chatId, message: msgOut },
  });
  res.status(201).json({ message: msgOut });
});

app.post('/api/stories/view', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const storyId = req.body?.storyId;
  if (!storyId || typeof storyId !== 'string') {
    res.status(400).json({ error: 'Нет storyId' });
    return;
  }
  const result = recordStoryView(userId, storyId);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

app.post('/api/stories/react', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const storyId = req.body?.storyId;
  const reaction = req.body?.reaction;
  if (!storyId || typeof storyId !== 'string') {
    res.status(400).json({ error: 'Нет storyId' });
    return;
  }
  if (typeof reaction !== 'string' || !reaction.trim()) {
    res.status(400).json({ error: 'Нет реакции' });
    return;
  }
  const result = insertStoryReactionMessage(userId, storyId, reaction.trim());
  if (result.error) {
    const code = result.error.includes('доступ') ? 403 : 400;
    res.status(code).json({ error: result.error });
    return;
  }
  const chatId = result.message.chatId;
  const msgOut = getMessageByIdForChat(chatId, result.message.id, userId) || result.message;
  sendToUser(result.peerId, {
    type: 'chat:message:new',
    payload: {
      chatId,
      message: msgOut,
    },
  });
  res.status(201).json({ message: msgOut });
});

app.get('/api/friends/peers', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  res.json({ peers: listFriendPeersForUser(userId) });
});

/** Каталог пользователей для «Возможно друзья»; query q — поиск по нику, имени или цифрам телефона. */
app.get('/api/friends/directory', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  res.json({ users: listUsersDirectoryForViewer(userId, q) });
});

app.get('/api/rooms', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  res.json({ rooms: listRoomsForUser(userId) });
});

/** POST до маршрута с :roomId, чтобы прокси/порядок маршрутов не мешали созданию. */
app.post('/api/rooms', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const { title, description, memberIds } = req.body || {};
  const out = createRoom(userId, { title, description, memberIds });
  if (out.error) {
    res.status(400).json({ error: out.error });
    return;
  }
  res.status(201).json(out);
});

app.get('/api/rooms/:roomId/messages', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const msgs = listRoomMessages(req.params.roomId, userId);
  if (msgs === null) {
    res.status(404).json({ error: 'Комната не найдена или нет доступа' });
    return;
  }
  res.json({ messages: msgs });
});

app.post('/api/rooms/:roomId/messages', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const result = insertRoomMessage(req.params.roomId, userId, req.body?.body, { replyToId: req.body?.replyToId });
  if (result.error) {
    const code = result.error.includes('доступ') ? 403 : 400;
    res.status(code).json({ error: result.error });
    return;
  }
  const roomId = req.params.roomId;
  const msgOut = getMessageByIdForRoom(roomId, result.message.id, userId) || result.message;
  broadcastRoom(roomId, {
    type: 'room:message:new',
    payload: { roomId, message: msgOut },
  });
  res.status(201).json({ message: msgOut });
});

app.patch('/api/rooms/:roomId/messages/:messageId', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const roomId = req.params.roomId;
  const messageId = req.params.messageId;
  const out = updateRoomMessage(roomId, userId, messageId, req.body?.body);
  if (out.error) {
    const st = out.error.includes('не найден')
      ? 404
      : out.error.includes('Нет доступа') || out.error.includes('только')
        ? 403
        : 400;
    res.status(st).json({ error: out.error });
    return;
  }
  for (const uid of listRoomMemberUserIds(roomId)) {
    const m = getMessageByIdForRoom(roomId, messageId, uid);
    if (m) sendToUser(uid, { type: 'room:message:updated', payload: { roomId, message: m } });
  }
  const msgSelf = getMessageByIdForRoom(roomId, messageId, userId);
  res.json({ message: msgSelf });
});

app.post('/api/rooms/:roomId/read', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = markRoomRead(userId, req.params.roomId);
  if (out.error) {
    res.status(403).json({ error: out.error });
    return;
  }
  res.json({ ok: true, readAt: out.readAt });
});

app.post('/api/rooms/:roomId/messages/voice', (req, res) => {
  chatVoiceUpload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Ошибка загрузки' });
      return;
    }
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!req.file) {
      res.status(400).json({ error: 'Нет аудиофайла' });
      return;
    }
    const durationMs = parseInt(String(req.body?.durationMs ?? ''), 10);
    const rel = chatMediaRelativePath(req.file.filename);
    const result = insertRoomMediaMessage(req.params.roomId, userId, 'voice', rel, durationMs);
    if (result.error) {
      const code = result.error.includes('доступ') ? 403 : 400;
      res.status(code).json({ error: result.error });
      return;
    }
    const roomId = req.params.roomId;
    const msgOut = getMessageByIdForRoom(roomId, result.message.id, userId) || result.message;
    broadcastRoom(roomId, {
      type: 'room:message:new',
      payload: { roomId, message: msgOut },
    });
    res.status(201).json({ message: msgOut });
  });
});

app.post('/api/rooms/:roomId/messages/video-note', (req, res) => {
  chatVideoNoteUpload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Ошибка загрузки' });
      return;
    }
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!req.file) {
      res.status(400).json({ error: 'Нет видеофайла' });
      return;
    }
    const durationMs = parseInt(String(req.body?.durationMs ?? ''), 10);
    const rel = chatMediaRelativePath(req.file.filename);
    const result = insertRoomMediaMessage(req.params.roomId, userId, 'video_note', rel, durationMs);
    if (result.error) {
      const code = result.error.includes('доступ') ? 403 : 400;
      res.status(code).json({ error: result.error });
      return;
    }
    const roomId = req.params.roomId;
    const msgOut = getMessageByIdForRoom(roomId, result.message.id, userId) || result.message;
    broadcastRoom(roomId, {
      type: 'room:message:new',
      payload: { roomId, message: msgOut },
    });
    res.status(201).json({ message: msgOut });
  });
});

app.post('/api/rooms/:roomId/messages/media', (req, res) => {
  chatAttachmentUpload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Ошибка загрузки' });
      return;
    }
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!req.file) {
      res.status(400).json({ error: 'Нет файла' });
      return;
    }
    const mime = (req.file.mimetype || '').toLowerCase();
    const kind = mime.startsWith('image/') ? 'image' : 'file';
    const rel = chatMediaRelativePath(req.file.filename);
    const rawName = String(req.file.originalname || 'файл').replace(/[<>"]/g, '').trim() || 'файл';
    const caption = typeof req.body?.caption === 'string' ? req.body.caption : '';
    const bodyField = kind === 'image' ? caption : rawName.slice(0, 400);
    const result = insertRoomAttachmentMessage(req.params.roomId, userId, kind, rel, bodyField);
    if (result.error) {
      const code = result.error.includes('доступ') ? 403 : 400;
      res.status(code).json({ error: result.error });
      return;
    }
    const roomId = req.params.roomId;
    const msgOut = getMessageByIdForRoom(roomId, result.message.id, userId) || result.message;
    broadcastRoom(roomId, {
      type: 'room:message:new',
      payload: { roomId, message: msgOut },
    });
    res.status(201).json({ message: msgOut });
  });
});

app.post('/api/rooms/:roomId/messages/:messageId/reaction', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const reaction = req.body?.reaction;
  if (typeof reaction !== 'string' || !reaction.trim()) {
    res.status(400).json({ error: 'Нет реакции' });
    return;
  }
  const roomId = req.params.roomId;
  const result = toggleRoomMessageReaction(roomId, userId, req.params.messageId, reaction.trim());
  if (result.error) {
    const code = result.error.includes('доступ') ? 403 : 400;
    res.status(code).json({ error: result.error });
    return;
  }
  const { messageId } = req.params;
  broadcastRoom(roomId, {
    type: 'room:message:reaction',
    payload: { roomId, messageId, reactions: result.reactions },
  });
  res.json({ reactions: result.reactions });
});

app.post('/api/rooms/:roomId/messages/:messageId/delete-for-me', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const { roomId, messageId } = req.params;
  const out = hideRoomMessageForViewer(roomId, userId, messageId);
  if (out.error) {
    res.status(out.error.includes('не найден') ? 404 : 403).json({ error: out.error });
    return;
  }
  res.json({ ok: true });
});

app.post('/api/rooms/:roomId/messages/:messageId/delete-for-everyone', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const { roomId, messageId } = req.params;
  const out = revokeRoomMessageForEveryone(roomId, userId, messageId);
  if (out.error) {
    const st = out.error.includes('не найден') ? 404 : out.error.includes('Нет доступа') ? 403 : 400;
    res.status(st).json({ error: out.error });
    return;
  }
  for (const uid of listRoomMemberUserIds(roomId)) {
    const m = getMessageByIdForRoom(roomId, messageId, uid);
    sendToUser(uid, { type: 'room:message:updated', payload: { roomId, message: m } });
  }
  const msgSelf = getMessageByIdForRoom(roomId, messageId, userId);
  res.json({ ok: true, message: msgSelf });
});

app.post('/api/rooms/:roomId/forward', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const { fromChatId, fromRoomId, messageId } = req.body || {};
  const out = forwardMessageToRoom(req.params.roomId, userId, fromChatId, fromRoomId, messageId);
  if (out.error) {
    res.status(400).json({ error: out.error });
    return;
  }
  const roomId = req.params.roomId;
  const msgOut = getMessageByIdForRoom(roomId, out.messageId, userId);
  broadcastRoom(roomId, {
    type: 'room:message:new',
    payload: { roomId, message: msgOut },
  });
  res.status(201).json({ message: msgOut });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const room = getRoomByIdForUser(req.params.roomId, userId);
  if (!room) {
    res.status(404).json({ error: 'Комната не найдена' });
    return;
  }
  res.json({ room });
});

app.patch('/api/rooms/:roomId', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const { title, description } = req.body || {};
  const out = updateRoom(req.params.roomId, userId, { title, description });
  if (out.error) {
    const code = out.error.includes('доступ') ? 403 : 400;
    res.status(code).json({ error: out.error });
    return;
  }
  res.json({ room: out.room });
});

app.post('/api/rooms/:roomId/members', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = addRoomMembers(req.params.roomId, userId, req.body?.memberIds);
  if (out.error) {
    const code = out.error.includes('доступ') ? 403 : 400;
    res.status(code).json({ error: out.error });
    return;
  }
  res.json({ room: out.room, addedCount: out.addedCount });
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

app.get('/api/stories/me/manage', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  res.json({ items: listOwnStoriesForManagement(userId) });
});

app.post('/api/stories/:storyId/unarchive', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = unarchiveStoryForFeed(req.params.storyId, userId);
  if (out.error) {
    const st = out.error.includes('Нет доступа') ? 403 : out.error.includes('не найден') ? 404 : 400;
    res.status(st).json({ error: out.error });
    return;
  }
  broadcastToAllAuthenticatedUsers({ type: 'stories:new', payload: { authorId: userId } });
  res.json({ ok: true });
});

app.delete('/api/stories/:storyId', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = deleteStoryByAuthor(req.params.storyId, userId);
  if (out.error) {
    const st = out.error.includes('Нет доступа') ? 403 : out.error.includes('не найден') ? 404 : 400;
    res.status(st).json({ error: out.error });
    return;
  }
  broadcastToAllAuthenticatedUsers({ type: 'stories:new', payload: { authorId: userId } });
  res.json({ ok: true });
});

app.get('/api/stories/author/:authorId', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const profileGrid = req.query.profileGrid === '1' || req.query.profileGrid === 'true';
  const items = listActiveStoryItems(userId, req.params.authorId, { profileGridOnly: profileGrid });
  res.json({ items: items || [] });
});

app.post('/api/stories/:storyId/archive', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = archiveStoryForFeed(req.params.storyId, userId);
  if (out.error) {
    const st = out.error.includes('Нет доступа') ? 403 : out.error.includes('не найден') ? 404 : 400;
    res.status(st).json({ error: out.error });
    return;
  }
  broadcastToAllAuthenticatedUsers({ type: 'stories:new', payload: { authorId: userId } });
  res.json({ ok: true });
});

app.post('/api/stories', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const out = createStory(userId, { body: req.body?.body, mediaPath: '', showInProfile: req.body?.showInProfile });
  if (out.error) {
    res.status(400).json({ error: out.error });
    return;
  }
  broadcastToAllAuthenticatedUsers({ type: 'stories:new', payload: { authorId: userId } });
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
    let sip = req.body?.showInProfile;
    if (typeof sip === 'string') sip = sip === '1' || sip === 'true';
    const out = createStory(userId, { body: caption, mediaPath: rel, showInProfile: sip });
    if (out.error) {
      res.status(400).json({ error: out.error });
      return;
    }
    broadcastToAllAuthenticatedUsers({ type: 'stories:new', payload: { authorId: userId } });
    res.status(201).json(out);
  });
});

app.get('/api/users/presence', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const raw = req.query.ids;
  if (!raw || typeof raw !== 'string') {
    res.json({ online: {}, lastSeenAt: {}, lastSeenHidden: {} });
    return;
  }
  const ids = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const online = {};
  const lastSeenAt = {};
  const lastSeenHidden = {};
  const stmt = getDb().prepare(`SELECT last_seen_at AS lastSeenAt, hide_last_seen AS hideLastSeen FROM users WHERE id = ?`);
  for (const id of ids) {
    const set = socketsByUser.get(id);
    online[id] = Boolean(set && set.size > 0);
    if (!online[id]) {
      const row = stmt.get(id);
      if (row?.hideLastSeen === 1) {
        lastSeenHidden[id] = true;
      } else if (row?.lastSeenAt != null) {
        lastSeenAt[id] = row.lastSeenAt;
      }
    }
  }
  res.json({ online, lastSeenAt, lastSeenHidden });
});

app.patch('/api/users/me/privacy', (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const hide = req.body?.hideLastSeen;
  if (typeof hide !== 'boolean') {
    res.status(400).json({ error: 'Ожидается hideLastSeen: boolean' });
    return;
  }
  setUserHideLastSeen(userId, hide);
  const user = findUserById(userId);
  res.json({ user });
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
  const setBefore = socketsByUser.get(userId);
  const wasOnline = setBefore.size > 0;
  setBefore.add(ws);

  if (!wasOnline && !userId.startsWith('guest-') && findUserById(userId)) {
    notifyPeers(userId, { type: 'presence', payload: { userId, online: true } });
  }

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
      if (set.size === 0) {
        socketsByUser.delete(userId);
        if (!userId.startsWith('guest-') && findUserById(userId)) {
          const ts = Date.now();
          setUserLastSeenAt(userId, ts);
          const hide = userHidesLastSeen(userId);
          notifyPeers(
            userId,
            hide
              ? { type: 'presence', payload: { userId, online: false, lastSeenHidden: true } }
              : { type: 'presence', payload: { userId, online: false, lastSeenAt: ts } },
          );
        }
      }
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

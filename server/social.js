import { randomUUID } from 'crypto';
import { getDb } from './db.js';
import { normalizePhone, normalizeNickname, findUserByPhone, findUserByNickname } from './db.js';

export function sortUserPair(id1, id2) {
  return id1 < id2 ? [id1, id2] : [id2, id1];
}

/** @ник или телефон (цифры, +, пробелы). */
export function resolveTargetUser(target) {
  const raw = String(target ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  const looksLikePhone = /^[\d\s+().-]+$/.test(raw) && digits.length >= 10 && digits.length <= 15;
  if (looksLikePhone) {
    return findUserByPhone(digits);
  }
  const nick = normalizeNickname(raw);
  if (nick) return findUserByNickname(nick);
  if (digits.length >= 10 && digits.length <= 15) return findUserByPhone(digits);
  return null;
}

function findDirectChatByPair(userA, userB) {
  const [a, b] = sortUserPair(userA, userB);
  return getDb()
    .prepare(`SELECT id, user_a AS userA, user_b AS userB, created_at AS createdAt FROM direct_chats WHERE user_a = ? AND user_b = ?`)
    .get(a, b);
}

export function areFriends(userId1, userId2) {
  return Boolean(findDirectChatByPair(userId1, userId2));
}

export function getPendingRequestBetween(fromId, toId) {
  return getDb()
    .prepare(
      `SELECT id, from_user_id AS fromUserId, to_user_id AS toUserId, status, created_at AS createdAt FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'`
    )
    .get(fromId, toId);
}

export function createFriendRequest(fromUserId, toUserId) {
  if (fromUserId === toUserId) {
    return { error: 'Нельзя добавить самого себя' };
  }
  if (areFriends(fromUserId, toUserId)) {
    return { error: 'Вы уже в друзьях' };
  }
  if (getPendingRequestBetween(fromUserId, toUserId)) {
    return { error: 'Заявка уже отправлена' };
  }
  const reverse = getPendingRequestBetween(toUserId, fromUserId);
  if (reverse) {
    return { error: 'У вас есть входящая заявка от этого пользователя — откройте профиль' };
  }

  const id = randomUUID();
  const createdAt = Date.now();
  getDb()
    .prepare(
      `INSERT INTO friend_requests (id, from_user_id, to_user_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)`
    )
    .run(id, fromUserId, toUserId, createdAt);

  const fromUser = getDb()
    .prepare(`SELECT id, nickname, first_name AS firstName, last_name AS lastName FROM users WHERE id = ?`)
    .get(fromUserId);

  return {
    request: {
      id,
      fromUserId,
      toUserId,
      createdAt,
      fromUser: fromUser
      ? {
          id: fromUser.id,
          nickname: fromUser.nickname,
          firstName: fromUser.firstName,
          lastName: fromUser.lastName,
        }
      : null,
    },
  };
}

export function listIncomingFriendRequests(userId) {
  const rows = getDb()
    .prepare(
      `SELECT fr.id, fr.from_user_id AS fromUserId, fr.created_at AS createdAt,
        u.nickname AS fromNickname, u.first_name AS fromFirstName, u.last_name AS fromLastName
      FROM friend_requests fr
      JOIN users u ON u.id = fr.from_user_id
      WHERE fr.to_user_id = ? AND fr.status = 'pending'
      ORDER BY fr.created_at DESC`
    )
    .all(userId);

  return rows.map((r) => ({
    id: r.id,
    fromUserId: r.fromUserId,
    createdAt: r.createdAt,
    from: {
      nickname: r.fromNickname,
      firstName: r.fromFirstName,
      lastName: r.fromLastName,
    },
  }));
}

export function getFriendRequestById(requestId) {
  return (
    getDb()
      .prepare(
        `SELECT id, from_user_id AS fromUserId, to_user_id AS toUserId, status, created_at AS createdAt FROM friend_requests WHERE id = ?`
      )
      .get(requestId) || null
  );
}

function getLastMessageForChat(chatId) {
  return getDb()
    .prepare(
      `SELECT body, created_at AS createdAt FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(chatId);
}

function formatChatTime(ts) {
  if (ts == null) return '';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function listDirectChatsForUser(userId) {
  const rows = getDb()
    .prepare(
      `SELECT dc.id AS chatId, dc.created_at AS chatCreatedAt,
        CASE WHEN dc.user_a = ? THEN dc.user_b ELSE dc.user_a END AS peerId
      FROM direct_chats dc
      WHERE dc.user_a = ? OR dc.user_b = ?
      ORDER BY dc.created_at DESC`
    )
    .all(userId, userId, userId);

  const out = [];
  for (const row of rows) {
    const peer = getDb()
      .prepare(
        `SELECT id, nickname, first_name AS firstName, last_name AS lastName, avatar_path AS avatarPath FROM users WHERE id = ?`
      )
      .get(row.peerId);
    if (!peer) continue;
    const last = getLastMessageForChat(row.chatId);
    const peerAvatarUrl = peer.avatarPath ? `/uploads/${peer.avatarPath}` : null;
    out.push({
      id: row.chatId,
      kind: 'direct',
      name: peer.nickname ? `@${peer.nickname}` : peer.firstName,
      lastMessage: last?.body ?? 'Нет сообщений',
      time: last ? formatChatTime(last.createdAt) : '',
      typing: false,
      peerUserId: peer.id,
      peerAvatarUrl,
    });
  }
  return out;
}

export function acceptFriendRequest(requestId, actingUserId) {
  const fr = getFriendRequestById(requestId);
  if (!fr) return { error: 'Заявка не найдена' };
  if (fr.toUserId !== actingUserId) return { error: 'Нет доступа' };
  if (fr.status !== 'pending') return { error: 'Заявка уже обработана' };

  const [a, b] = sortUserPair(fr.fromUserId, fr.toUserId);
  const db = getDb();
  const tx = db.transaction(() => {
    let chat = findDirectChatByPair(fr.fromUserId, fr.toUserId);
    let chatId;
    if (chat) {
      chatId = chat.id;
    } else {
      chatId = randomUUID();
      db.prepare(`INSERT INTO direct_chats (id, user_a, user_b, created_at) VALUES (?, ?, ?, ?)`).run(
        chatId,
        a,
        b,
        Date.now()
      );
    }
    const now = Date.now();
    db.prepare(
      `INSERT INTO chat_last_read (user_id, chat_id, last_read_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id, chat_id) DO UPDATE SET last_read_at = excluded.last_read_at`
    ).run(fr.fromUserId, chatId, now);
    db.prepare(
      `INSERT INTO chat_last_read (user_id, chat_id, last_read_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id, chat_id) DO UPDATE SET last_read_at = excluded.last_read_at`
    ).run(fr.toUserId, chatId, now);
    db.prepare(`UPDATE friend_requests SET status = 'accepted' WHERE id = ?`).run(requestId);
    return chatId;
  });

  try {
    const chatId = tx();
    return { ok: true, chatId };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

export function rejectFriendRequest(requestId, actingUserId) {
  const fr = getFriendRequestById(requestId);
  if (!fr) return { error: 'Заявка не найдена' };
  if (fr.toUserId !== actingUserId) return { error: 'Нет доступа' };
  if (fr.status !== 'pending') return { error: 'Заявка уже обработана' };
  getDb().prepare(`UPDATE friend_requests SET status = 'rejected' WHERE id = ?`).run(requestId);
  return { ok: true };
}

function getDirectChatRow(chatId) {
  return getDb()
    .prepare(`SELECT id, user_a AS userA, user_b AS userB FROM direct_chats WHERE id = ?`)
    .get(chatId);
}

export function userInDirectChat(chatId, userId) {
  const row = getDirectChatRow(chatId);
  if (!row) return false;
  return row.userA === userId || row.userB === userId;
}

export function getPeerIdInDirectChat(chatId, userId) {
  const row = getDirectChatRow(chatId);
  if (!row) return null;
  if (row.userA === userId) return row.userB;
  if (row.userB === userId) return row.userA;
  return null;
}

export function listMessagesForChat(chatId, userId, limit = 200) {
  if (!userInDirectChat(chatId, userId)) return null;
  const rows = getDb()
    .prepare(
      `SELECT m.id, m.sender_id AS senderId, m.body, m.created_at AS createdAt,
        u.nickname AS senderNickname
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.chat_id = ?
      ORDER BY m.created_at ASC
      LIMIT ?`
    )
    .all(chatId, limit);
  return rows;
}

export function markChatRead(userId, chatId) {
  if (!userInDirectChat(chatId, userId)) return { error: 'Нет доступа к чату' };
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO chat_last_read (user_id, chat_id, last_read_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id, chat_id) DO UPDATE SET last_read_at = excluded.last_read_at`
    )
    .run(userId, chatId, now);
  return { ok: true };
}

export function countTotalUnreadMessages(userId) {
  const db = getDb();
  const chats = db.prepare(`SELECT id FROM direct_chats WHERE user_a = ? OR user_b = ?`).all(userId, userId);
  let total = 0;
  for (const ch of chats) {
    const chatId = ch.id;
    const lr = db.prepare(`SELECT last_read_at FROM chat_last_read WHERE user_id = ? AND chat_id = ?`).get(userId, chatId);
    const since = lr?.last_read_at ?? 0;
    const r = db
      .prepare(
        `SELECT COUNT(*) AS c FROM messages WHERE chat_id = ? AND sender_id != ? AND created_at > ?`
      )
      .get(chatId, userId, since);
    total += r?.c ?? 0;
  }
  return total;
}

export function insertDirectMessage(chatId, userId, body) {
  const trimmed = String(body ?? '').trim();
  if (!trimmed) return { error: 'Пустое сообщение' };
  if (trimmed.length > 4000) return { error: 'Сообщение не длиннее 4000 символов' };
  const peerId = getPeerIdInDirectChat(chatId, userId);
  if (peerId == null) return { error: 'Нет доступа к чату' };

  const id = randomUUID();
  const createdAt = Date.now();
  getDb()
    .prepare(`INSERT INTO messages (id, chat_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(id, chatId, userId, trimmed, createdAt);

  const sn = getDb().prepare(`SELECT nickname FROM users WHERE id = ?`).get(userId);

  return {
    message: {
      id,
      chatId,
      senderId: userId,
      body: trimmed,
      createdAt,
      senderNickname: sn?.nickname ?? null,
    },
    peerId,
  };
}

/** Собеседники из direct_chats (принятые друзья). */
export function listPeerUserIds(userId) {
  const rows = getDb()
    .prepare(
      `SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS peerId
       FROM direct_chats WHERE user_a = ? OR user_b = ?`
    )
    .all(userId, userId, userId);
  return rows.map((r) => r.peerId);
}

export function listFeedPostsForViewer(viewerId) {
  const peers = listPeerUserIds(viewerId);
  const ids = [viewerId, ...peers];
  if (ids.length === 0) return [];
  const ph = ids.map(() => '?').join(',');
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.author_id AS authorId, p.body, p.created_at AS createdAt,
        u.nickname AS authorNickname, u.first_name AS firstName, u.last_name AS lastName, u.avatar_path AS avatarPath
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.author_id IN (${ph})
      ORDER BY p.created_at DESC
      LIMIT 200`
    )
    .all(...ids);
  return rows.map((r) => ({
    id: r.id,
    authorId: r.authorId,
    body: r.body,
    createdAt: r.createdAt,
    authorNickname: r.authorNickname,
    authorName: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || '—',
    authorAvatarUrl: r.avatarPath ? `/uploads/${r.avatarPath}` : null,
  }));
}

export function createPost(authorId, body) {
  const t = String(body ?? '').trim();
  if (!t) return { error: 'Пустой пост' };
  if (t.length > 8000) return { error: 'Пост не длиннее 8000 символов' };
  const id = randomUUID();
  const createdAt = Date.now();
  getDb()
    .prepare(`INSERT INTO posts (id, author_id, body, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, authorId, t, createdAt);
  return { ok: true, post: { id, authorId, body: t, createdAt } };
}

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

export function createStory(userId, { body, mediaPath }) {
  const b = body != null ? String(body).trim() : '';
  const media = mediaPath ? String(mediaPath).trim() : '';
  if (!b && !media) return { error: 'Добавьте текст или изображение' };
  if (b.length > 4000) return { error: 'Текст не длиннее 4000 символов' };
  const id = randomUUID();
  const createdAt = Date.now();
  const expiresAt = createdAt + STORY_TTL_MS;
  getDb()
    .prepare(`INSERT INTO stories (id, user_id, body, media_path, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, userId, b || null, media || null, createdAt, expiresAt);
  return {
    ok: true,
    story: {
      id,
      userId,
      body: b || null,
      mediaUrl: media ? `/uploads/${media}` : null,
      createdAt,
      expiresAt,
    },
  };
}

/** Кружки историй: только друзья + вы, с неистёкшими историями. */
export function listStoryBucketsForViewer(viewerId) {
  const now = Date.now();
  const peers = listPeerUserIds(viewerId);
  const ids = [viewerId, ...peers];
  if (ids.length === 0) return [];
  const ph = ids.map(() => '?').join(',');
  const rows = getDb()
    .prepare(
      `SELECT user_id AS userId, COUNT(*) AS cnt, MAX(created_at) AS lastAt
       FROM stories
       WHERE expires_at > ? AND user_id IN (${ph})
       GROUP BY user_id
       ORDER BY lastAt DESC`
    )
    .all(now, ...ids);

  const db = getDb();
  const out = [];
  for (const r of rows) {
    const u = db
      .prepare(`SELECT id, nickname, first_name AS firstName, last_name AS lastName, avatar_path AS avatarPath FROM users WHERE id = ?`)
      .get(r.userId);
    if (!u) continue;
    out.push({
      userId: r.userId,
      label: u.nickname ? `@${u.nickname}` : u.firstName || '—',
      avatarUrl: u.avatarPath ? `/uploads/${u.avatarPath}` : null,
      itemCount: r.cnt,
      lastAt: r.lastAt,
      isSelf: r.userId === viewerId,
    });
  }
  out.sort((a, b) => {
    if (a.isSelf && !b.isSelf) return -1;
    if (!a.isSelf && b.isSelf) return 1;
    return (b.lastAt ?? 0) - (a.lastAt ?? 0);
  });
  return out;
}

export function listActiveStoryItems(viewerId, authorId) {
  if (viewerId !== authorId && !areFriends(viewerId, authorId)) return null;
  const now = Date.now();
  const rows = getDb()
    .prepare(
      `SELECT id, body, media_path AS mediaPath, created_at AS createdAt, expires_at AS expiresAt
       FROM stories WHERE user_id = ? AND expires_at > ? ORDER BY created_at ASC`
    )
    .all(authorId, now);
  return rows.map((s) => ({
    id: s.id,
    body: s.body || '',
    mediaUrl: s.mediaPath ? `/uploads/${s.mediaPath}` : null,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
  }));
}

/** Истёкшие истории друзей и свои — «архив». */
export function listArchivedStoriesForViewer(viewerId, limit = 80) {
  const peers = listPeerUserIds(viewerId);
  const ids = [viewerId, ...peers];
  const now = Date.now();
  const ph = ids.map(() => '?').join(',');
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.user_id AS userId, s.body, s.media_path AS mediaPath, s.created_at AS createdAt, s.expires_at AS expiresAt,
        u.nickname AS nickname, u.first_name AS firstName, u.last_name AS lastName, u.avatar_path AS avatarPath
      FROM stories s
      JOIN users u ON u.id = s.user_id
      WHERE s.expires_at <= ? AND s.user_id IN (${ph})
      ORDER BY s.expires_at DESC
      LIMIT ?`
    )
    .all(now, ...ids, limit);
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    body: r.body || '',
    mediaUrl: r.mediaPath ? `/uploads/${r.mediaPath}` : null,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    authorLabel: r.nickname ? `@${r.nickname}` : `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(),
    authorAvatarUrl: r.avatarPath ? `/uploads/${r.avatarPath}` : null,
  }));
}

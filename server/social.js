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
      `SELECT body, created_at AS createdAt, kind, media_path AS mediaPath
       FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(chatId);
}

function formatLastMessagePreview(last) {
  if (!last) return 'Нет сообщений';
  const k = last.kind || 'text';
  if (k === 'voice') return 'Голосовое сообщение';
  if (k === 'video_note') return 'Видеосообщение';
  if (k === 'image') return 'Фото';
  if (k === 'file') return 'Файл';
  if (k === 'story_reaction') return 'Реакция на историю';
  return String(last.body ?? '').trim() || 'Сообщение';
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
    const lr = getDb()
      .prepare(`SELECT last_read_at AS lastReadAt FROM chat_last_read WHERE user_id = ? AND chat_id = ?`)
      .get(userId, row.chatId);
    const since = lr?.lastReadAt ?? 0;
    const unreadRow = getDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM messages WHERE chat_id = ? AND sender_id != ? AND created_at > ?`
      )
      .get(row.chatId, userId, since);
    const unreadCount = unreadRow?.c ?? 0;
    out.push({
      id: row.chatId,
      kind: 'direct',
      name: peer.nickname ? `@${peer.nickname}` : peer.firstName,
      lastMessage: formatLastMessagePreview(last),
      time: last ? formatChatTime(last.createdAt) : '',
      typing: false,
      peerUserId: peer.id,
      peerAvatarUrl,
      unreadCount,
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

export const MESSAGE_REACTION_KEYS = ['up', 'down', 'fire', 'poop'];

export function reactionEmoji(key) {
  const m = { up: '👍', down: '👎', fire: '🔥', poop: '💩' };
  return m[key] || '·';
}

function loadReactionSummaryForMessages(messageIds, viewerId) {
  if (messageIds.length === 0) {
    return () => ({ counts: { up: 0, down: 0, fire: 0, poop: 0 }, mine: null });
  }
  const ph = messageIds.map(() => '?').join(',');
  const raw = getDb()
    .prepare(
      `SELECT message_id AS messageId, user_id AS userId, reaction FROM message_reactions WHERE message_id IN (${ph})`
    )
    .all(...messageIds);
  const byMsg = new Map();
  for (const x of raw) {
    if (!byMsg.has(x.messageId)) byMsg.set(x.messageId, []);
    byMsg.get(x.messageId).push(x);
  }
  return (msgId) => {
    const arr = byMsg.get(msgId) || [];
    const counts = { up: 0, down: 0, fire: 0, poop: 0 };
    let mine = null;
    for (const x of arr) {
      if (counts[x.reaction] != null) counts[x.reaction]++;
      if (x.userId === viewerId) mine = x.reaction;
    }
    return { counts, mine };
  };
}

function mapMessageRow(r, getReactions) {
  if (!r) return null;
  const refPath = r.refStoryMediaPath;
  const out = {
    id: r.id,
    senderId: r.senderId,
    body: r.body ?? '',
    kind: r.kind || 'text',
    mediaUrl: r.mediaPath ? `/uploads/${r.mediaPath}` : null,
    durationMs: r.durationMs != null ? r.durationMs : null,
    createdAt: r.createdAt,
    senderNickname: r.senderNickname,
    refStoryId: r.refStoryId ?? null,
    storyReactionKey: r.storyReactionKey ?? null,
    refStoryPreviewUrl: refPath ? `/uploads/${refPath}` : null,
  };
  if (getReactions) out.reactions = getReactions(r.id);
  return out;
}

/** Одна строка для WS / API — тот же формат, что и в ленте (важно для kind + mediaUrl у собеседника). */
export function getMessageByIdForChat(chatId, messageId, viewerId = null) {
  const row = getDb()
    .prepare(
      `SELECT m.id, m.sender_id AS senderId, m.body, m.kind, m.media_path AS mediaPath, m.duration_ms AS durationMs,
        m.created_at AS createdAt, u.nickname AS senderNickname,
        m.ref_story_id AS refStoryId, m.story_reaction_key AS storyReactionKey,
        rs.media_path AS refStoryMediaPath
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN stories rs ON rs.id = m.ref_story_id
      WHERE m.chat_id = ? AND m.id = ?`
    )
    .get(chatId, messageId);
  if (!row) return null;
  const getReact = viewerId != null ? loadReactionSummaryForMessages([row.id], viewerId) : null;
  const out = mapMessageRow(row, getReact);
  if (viewerId && row.senderId === viewerId) {
    const peerId = getPeerIdInDirectChat(chatId, viewerId);
    const peerReadRow = peerId
      ? getDb()
          .prepare(`SELECT last_read_at AS t FROM chat_last_read WHERE user_id = ? AND chat_id = ?`)
          .get(peerId, chatId)
      : null;
    const peerReadAt = peerReadRow?.t ?? 0;
    out.readByPeer = peerReadAt >= (row.createdAt ?? 0);
  }
  return out;
}

export function listMessagesForChat(chatId, userId, limit = 200) {
  if (!userInDirectChat(chatId, userId)) return null;
  const peerId = getPeerIdInDirectChat(chatId, userId);
  const peerReadRow = peerId
    ? getDb()
        .prepare(`SELECT last_read_at AS t FROM chat_last_read WHERE user_id = ? AND chat_id = ?`)
        .get(peerId, chatId)
    : null;
  const peerReadAt = peerReadRow?.t ?? 0;

  const rows = getDb()
    .prepare(
      `SELECT m.id, m.sender_id AS senderId, m.body, m.kind, m.media_path AS mediaPath, m.duration_ms AS durationMs,
        m.created_at AS createdAt, u.nickname AS senderNickname,
        m.ref_story_id AS refStoryId, m.story_reaction_key AS storyReactionKey,
        rs.media_path AS refStoryMediaPath
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN stories rs ON rs.id = m.ref_story_id
      WHERE m.chat_id = ?
      ORDER BY m.created_at ASC
      LIMIT ?`
    )
    .all(chatId, limit);
  const ids = rows.map((r) => r.id);
  const getReact = loadReactionSummaryForMessages(ids, userId);
  return rows.map((r) => {
    const base = mapMessageRow(r, getReact);
    if (r.senderId === userId) {
      base.readByPeer = peerReadAt >= (r.createdAt ?? 0);
    }
    return base;
  });
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
  return { ok: true, readAt: now };
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
  const roomRows = db.prepare(`SELECT room_id AS roomId FROM room_members WHERE user_id = ?`).all(userId);
  for (const row of roomRows) {
    const rid = row.roomId;
    const lr = db.prepare(`SELECT last_read_at AS t FROM room_last_read WHERE user_id = ? AND room_id = ?`).get(userId, rid);
    const since = lr?.t ?? 0;
    const r = db
      .prepare(
        `SELECT COUNT(*) AS c FROM room_messages WHERE room_id = ? AND sender_id != ? AND created_at > ?`
      )
      .get(rid, userId, since);
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
      kind: 'text',
      mediaUrl: null,
      durationMs: null,
      createdAt,
      senderNickname: sn?.nickname ?? null,
    },
    peerId,
  };
}

const MAX_MEDIA_MS = 15000;
const MIN_MEDIA_MS = 400;

export function insertChatMediaMessage(chatId, userId, kind, mediaRelativePath, durationMs) {
  if (kind !== 'voice' && kind !== 'video_note') {
    return { error: 'Некорректный тип вложения' };
  }
  const peerId = getPeerIdInDirectChat(chatId, userId);
  if (peerId == null) return { error: 'Нет доступа к чату' };

  const d = Math.round(Number(durationMs));
  if (!Number.isFinite(d) || d < MIN_MEDIA_MS || d > MAX_MEDIA_MS) {
    return { error: `Длительность от ${MIN_MEDIA_MS / 1000} до ${MAX_MEDIA_MS / 1000} с` };
  }
  const media = String(mediaRelativePath ?? '').trim();
  if (!media) return { error: 'Нет файла' };

  const id = randomUUID();
  const createdAt = Date.now();
  getDb()
    .prepare(
      `INSERT INTO messages (id, chat_id, sender_id, body, created_at, kind, media_path, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, chatId, userId, '', createdAt, kind, media, d);

  const sn = getDb().prepare(`SELECT nickname FROM users WHERE id = ?`).get(userId);

  return {
    message: {
      id,
      chatId,
      senderId: userId,
      body: '',
      kind,
      mediaUrl: `/uploads/${media}`,
      durationMs: d,
      createdAt,
      senderNickname: sn?.nickname ?? null,
    },
    peerId,
  };
}

const MAX_IMAGE_CAPTION = 2000;
const MAX_FILE_LABEL = 400;

/** Фото или файл в личном чате (body — подпись к фото или имя файла). */
export function insertChatAttachmentMessage(chatId, userId, kind, mediaRelativePath, body) {
  if (kind !== 'image' && kind !== 'file') {
    return { error: 'Некорректный тип вложения' };
  }
  const peerId = getPeerIdInDirectChat(chatId, userId);
  if (peerId == null) return { error: 'Нет доступа к чату' };

  const media = String(mediaRelativePath ?? '').trim();
  if (!media) return { error: 'Нет файла' };

  let bodyText = String(body ?? '');
  if (kind === 'image') {
    bodyText = bodyText.trim();
    if (bodyText.length > MAX_IMAGE_CAPTION) {
      return { error: 'Подпись не длиннее 2000 символов' };
    }
  } else {
    bodyText = bodyText.trim().slice(0, MAX_FILE_LABEL);
    if (!bodyText) bodyText = 'файл';
  }

  const id = randomUUID();
  const createdAt = Date.now();
  getDb()
    .prepare(
      `INSERT INTO messages (id, chat_id, sender_id, body, created_at, kind, media_path, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
    )
    .run(id, chatId, userId, bodyText, createdAt, kind, media);

  const sn = getDb().prepare(`SELECT nickname FROM users WHERE id = ?`).get(userId);

  return {
    message: {
      id,
      chatId,
      senderId: userId,
      body: bodyText,
      kind,
      mediaUrl: `/uploads/${media}`,
      durationMs: null,
      createdAt,
      senderNickname: sn?.nickname ?? null,
    },
    peerId,
  };
}

/** Просмотр кадра истории (для кольца «все просмотрено»). */
export function recordStoryView(viewerId, storyId) {
  const st = getDb()
    .prepare(`SELECT id, user_id AS userId, expires_at AS expiresAt FROM stories WHERE id = ?`)
    .get(storyId);
  if (!st) return { error: 'История не найдена' };
  if (st.expiresAt <= Date.now()) return { error: 'История недоступна' };
  const authorId = st.userId;
  if (String(authorId) !== String(viewerId) && !areFriends(viewerId, authorId)) {
    return { error: 'Нет доступа' };
  }
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO story_views (viewer_id, story_id, viewed_at) VALUES (?, ?, ?)
       ON CONFLICT(viewer_id, story_id) DO UPDATE SET viewed_at = excluded.viewed_at`
    )
    .run(viewerId, storyId, now);
  return { ok: true };
}

/** Реакция на чужую историю — сообщение в личный чат автору. */
export function insertStoryReactionMessage(viewerId, storyId, reactionKey) {
  if (!MESSAGE_REACTION_KEYS.includes(reactionKey)) {
    return { error: 'Неизвестная реакция' };
  }
  const st = getDb()
    .prepare(`SELECT id, user_id AS userId, expires_at AS expiresAt FROM stories WHERE id = ?`)
    .get(storyId);
  if (!st) return { error: 'История не найдена' };
  if (st.expiresAt <= Date.now()) return { error: 'История недоступна' };
  const authorId = st.userId;
  if (String(authorId) === String(viewerId)) {
    return { error: 'Нельзя реагировать на свою историю' };
  }
  if (!areFriends(viewerId, authorId)) {
    return { error: 'Только для друзей' };
  }
  const chat = findDirectChatByPair(viewerId, authorId);
  if (!chat) return { error: 'Чат не найден' };

  const id = randomUUID();
  const createdAt = Date.now();
  const bodyText = `${reactionEmoji(reactionKey)} · история`;
  getDb()
    .prepare(
      `INSERT INTO messages (id, chat_id, sender_id, body, created_at, kind, ref_story_id, story_reaction_key, media_path, duration_ms)
       VALUES (?, ?, ?, ?, ?, 'story_reaction', ?, ?, NULL, NULL)`
    )
    .run(id, chat.id, viewerId, bodyText, createdAt, storyId, reactionKey);

  const sn = getDb().prepare(`SELECT nickname FROM users WHERE id = ?`).get(viewerId);
  const sp = getDb().prepare(`SELECT media_path AS mediaPath FROM stories WHERE id = ?`).get(storyId);
  const refStoryPreviewUrl = sp?.mediaPath ? `/uploads/${sp.mediaPath}` : null;

  return {
    message: {
      id,
      chatId: chat.id,
      senderId: viewerId,
      body: bodyText,
      kind: 'story_reaction',
      mediaUrl: null,
      durationMs: null,
      createdAt,
      senderNickname: sn?.nickname ?? null,
      refStoryId: storyId,
      storyReactionKey: reactionKey,
      refStoryPreviewUrl,
    },
    peerId: authorId,
  };
}

/** Реакция на сообщение в чате (одна на пользователя; повтор — снять). */
export function toggleMessageReaction(chatId, userId, messageId, reactionKey) {
  if (!MESSAGE_REACTION_KEYS.includes(reactionKey)) {
    return { error: 'Неизвестная реакция' };
  }
  if (!userInDirectChat(chatId, userId)) return { error: 'Нет доступа к чату' };
  const msg = getDb()
    .prepare(`SELECT id FROM messages WHERE id = ? AND chat_id = ?`)
    .get(messageId, chatId);
  if (!msg) return { error: 'Сообщение не найдено' };

  const db = getDb();
  const existing = db
    .prepare(`SELECT reaction FROM message_reactions WHERE message_id = ? AND user_id = ?`)
    .get(messageId, userId);
  const now = Date.now();

  if (existing?.reaction === reactionKey) {
    db.prepare(`DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?`).run(messageId, userId);
  } else if (existing) {
    db.prepare(`UPDATE message_reactions SET reaction = ?, created_at = ? WHERE message_id = ? AND user_id = ?`).run(
      reactionKey,
      now,
      messageId,
      userId
    );
  } else {
    db.prepare(`INSERT INTO message_reactions (message_id, user_id, reaction, created_at) VALUES (?, ?, ?, ?)`).run(
      messageId,
      userId,
      reactionKey,
      now
    );
  }

  const peerId = getPeerIdInDirectChat(chatId, userId);
  const getReact = loadReactionSummaryForMessages([messageId], userId);
  return {
    ok: true,
    messageId,
    reactions: getReact(messageId),
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

/** Лента: все посты вас и друзей по времени, без отсечки «только после принятия заявки». */
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

/**
 * Кружки историй в ленте: только вы и друзья (никакой публичной ленты).
 * Неистёкшие истории; своя история попадает сюда же, если есть активные кадры.
 */
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
    let allViewed = true;
    if (String(r.userId) !== String(viewerId) && r.cnt > 0) {
      const unseen = db
        .prepare(
          `SELECT COUNT(*) AS c FROM stories s
           WHERE s.user_id = ? AND s.expires_at > ?
           AND NOT EXISTS (SELECT 1 FROM story_views v WHERE v.viewer_id = ? AND v.story_id = s.id)`
        )
        .get(r.userId, now, viewerId);
      allViewed = (unseen?.c ?? 0) === 0;
    }
    out.push({
      userId: r.userId,
      label: u.nickname ? `@${u.nickname}` : u.firstName || '—',
      avatarUrl: u.avatarPath ? `/uploads/${u.avatarPath}` : null,
      itemCount: r.cnt,
      lastAt: r.lastAt,
      isSelf: String(r.userId) === String(viewerId),
      allViewed,
    });
  }
  out.sort((a, b) => {
    if (a.isSelf && !b.isSelf) return -1;
    if (!a.isSelf && b.isSelf) return 1;
    return (b.lastAt ?? 0) - (a.lastAt ?? 0);
  });
  return out;
}

/** Просмотр чужих историй — только для друзей; свои — всегда. */
export function listActiveStoryItems(viewerId, authorId) {
  if (String(viewerId) !== String(authorId) && !areFriends(viewerId, authorId)) return null;
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

function formatParticipantsRu(n) {
  const x = n % 100;
  if (x >= 11 && x <= 14) return `${n} участников`;
  const m = n % 10;
  if (m === 1) return `${n} участник`;
  if (m >= 2 && m <= 4) return `${n} участника`;
  return `${n} участников`;
}

function formatRoomActivity(ts) {
  if (ts == null) return '—';
  try {
    return new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

/** Друзья для выбора при создании комнаты (как в Telegram). */
export function listFriendPeersForUser(viewerId) {
  const peerIds = listPeerUserIds(viewerId);
  if (peerIds.length === 0) return [];
  const ph = peerIds.map(() => '?').join(',');
  const rows = getDb()
    .prepare(
      `SELECT id, nickname, first_name AS firstName, last_name AS lastName, avatar_path AS avatarPath
       FROM users WHERE id IN (${ph}) ORDER BY nickname`
    )
    .all(...peerIds);
  return rows.map((r) => ({
    id: r.id,
    nickname: r.nickname,
    firstName: r.firstName,
    lastName: r.lastName,
    avatarUrl: r.avatarPath ? `/uploads/${r.avatarPath}` : null,
  }));
}

export function listRoomMemberUserIds(roomId) {
  const rows = getDb().prepare(`SELECT user_id AS userId FROM room_members WHERE room_id = ?`).all(roomId);
  return rows.map((x) => x.userId);
}

function userInRoom(roomId, userId) {
  return Boolean(
    getDb().prepare(`SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?`).get(roomId, userId)
  );
}

export function listRoomsForUser(userId) {
  const rows = getDb()
    .prepare(
      `SELECT r.id, r.title, r.created_at AS createdAt,
       (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) AS memberCount,
       (SELECT body FROM room_messages rm2 WHERE rm2.room_id = r.id ORDER BY rm2.created_at DESC LIMIT 1) AS lastBody,
       (SELECT kind FROM room_messages rm3 WHERE rm3.room_id = r.id ORDER BY rm3.created_at DESC LIMIT 1) AS lastKind,
       (SELECT created_at FROM room_messages rm4 WHERE rm4.room_id = r.id ORDER BY rm4.created_at DESC LIMIT 1) AS lastMsgAt
       FROM rooms r
       INNER JOIN room_members m ON m.room_id = r.id AND m.user_id = ?
       ORDER BY COALESCE((SELECT MAX(created_at) FROM room_messages x WHERE x.room_id = r.id), r.created_at) DESC`
    )
    .all(userId);
  const db = getDb();
  return rows.map((r) => {
    const lr = db.prepare(`SELECT last_read_at AS t FROM room_last_read WHERE user_id = ? AND room_id = ?`).get(userId, r.id);
    const since = lr?.t ?? 0;
    const unreadRow = db
      .prepare(`SELECT COUNT(*) AS c FROM room_messages WHERE room_id = ? AND sender_id != ? AND created_at > ?`)
      .get(r.id, userId, since);
    const unreadCount = unreadRow?.c ?? 0;
    const last = r.lastMsgAt != null ? { body: r.lastBody, kind: r.lastKind, createdAt: r.lastMsgAt } : null;
    const lastMessage = last ? formatLastMessagePreview(last) : 'Нет сообщений';
    const t = r.lastMsgAt ?? r.createdAt;
    const d = new Date(t);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return {
      id: r.id,
      name: r.title,
      members: formatParticipantsRu(r.memberCount || 0),
      lastActive: formatRoomActivity(r.createdAt),
      lastMessage,
      time,
      unreadCount,
    };
  });
}

export function getRoomByIdForUser(roomId, userId) {
  const ok = getDb().prepare(`SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?`).get(roomId, userId);
  if (!ok) return null;
  const room = getDb()
    .prepare(`SELECT id, title, description, created_by AS createdBy, created_at AS createdAt FROM rooms WHERE id = ?`)
    .get(roomId);
  if (!room) return null;
  const members = getDb()
    .prepare(
      `SELECT u.id, u.nickname, u.first_name AS firstName, u.last_name AS lastName, u.avatar_path AS avatarPath, rm.role
       FROM room_members rm JOIN users u ON u.id = rm.user_id WHERE rm.room_id = ? ORDER BY rm.role DESC, rm.joined_at`
    )
    .all(roomId);
  return {
    id: room.id,
    title: room.title,
    description: room.description,
    createdBy: room.createdBy,
    createdAt: room.createdAt,
    members: members.map((m) => ({
      id: m.id,
      nickname: m.nickname,
      firstName: m.firstName,
      lastName: m.lastName,
      avatarUrl: m.avatarPath ? `/uploads/${m.avatarPath}` : null,
      role: m.role,
    })),
  };
}

export function createRoom(creatorId, { title, description, memberIds }) {
  const t = String(title ?? '').trim();
  if (!t || t.length > 80) return { error: 'Название комнаты: 1–80 символов' };
  const descRaw = description != null ? String(description).trim() : '';
  const desc = descRaw.length > 500 ? descRaw.slice(0, 500) : descRaw;
  const allowed = new Set(listPeerUserIds(creatorId));
  const rawIds = Array.isArray(memberIds) ? memberIds : [];
  const uniqueMembers = [...new Set(rawIds.map(String))].filter((id) => id && id !== creatorId);
  for (const uid of uniqueMembers) {
    if (!allowed.has(uid)) {
      return { error: 'В комнату можно добавить только друзей' };
    }
  }
  const roomId = randomUUID();
  const now = Date.now();
  const db = getDb();
  const insRoom = db.prepare(
    `INSERT INTO rooms (id, title, description, created_by, created_at) VALUES (?, ?, ?, ?, ?)`
  );
  const insMem = db.prepare(`INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`);
  try {
    db.transaction(() => {
      insRoom.run(roomId, t, desc || null, creatorId, now);
      insMem.run(roomId, creatorId, 'owner', now);
      for (const uid of uniqueMembers) {
        insMem.run(roomId, uid, 'member', now);
      }
    })();
  } catch {
    return { error: 'Не удалось создать комнату' };
  }
  return { ok: true, room: getRoomByIdForUser(roomId, creatorId) };
}

function roomMemberRole(roomId, userId) {
  const row = getDb()
    .prepare(`SELECT role FROM room_members WHERE room_id = ? AND user_id = ?`)
    .get(roomId, userId);
  return row?.role ?? null;
}

/** Только создатель комнаты может менять название и описание. */
export function updateRoom(roomId, editorId, { title, description }) {
  if (!userInRoom(roomId, editorId)) return { error: 'Нет доступа к комнате' };
  if (roomMemberRole(roomId, editorId) !== 'owner') {
    return { error: 'Только создатель может редактировать комнату' };
  }
  const updates = [];
  const vals = [];
  if (title !== undefined) {
    const t = String(title ?? '').trim();
    if (!t || t.length > 80) return { error: 'Название комнаты: 1–80 символов' };
    updates.push('title = ?');
    vals.push(t);
  }
  if (description !== undefined) {
    const descRaw = description != null ? String(description).trim() : '';
    const desc = descRaw.length > 500 ? descRaw.slice(0, 500) : descRaw;
    updates.push('description = ?');
    vals.push(desc || null);
  }
  if (updates.length === 0) return { error: 'Укажите название или описание' };
  vals.push(roomId);
  getDb()
    .prepare(`UPDATE rooms SET ${updates.join(', ')} WHERE id = ?`)
    .run(...vals);
  return { ok: true, room: getRoomByIdForUser(roomId, editorId) };
}

/**
 * Участник комнаты добавляет своих друзей (ещё не в комнате).
 * Каждый приглашённый должен быть в списке друзей приглашающего.
 */
export function addRoomMembers(roomId, inviterId, memberIds) {
  if (!userInRoom(roomId, inviterId)) return { error: 'Нет доступа к комнате' };
  const allowed = new Set(listPeerUserIds(inviterId));
  const rawIds = Array.isArray(memberIds) ? memberIds : [];
  const existingRows = getDb().prepare(`SELECT user_id AS userId FROM room_members WHERE room_id = ?`).all(roomId);
  const existing = new Set(existingRows.map((r) => String(r.userId)));
  const unique = [...new Set(rawIds.map(String))].filter((id) => id && id !== inviterId && !existing.has(id));
  if (unique.length === 0) {
    return { ok: true, room: getRoomByIdForUser(roomId, inviterId), addedCount: 0 };
  }
  for (const uid of unique) {
    if (!allowed.has(uid)) {
      return { error: 'В комнату можно добавить только своих друзей' };
    }
  }
  const now = Date.now();
  const ins = getDb().prepare(
    `INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`
  );
  try {
    const db = getDb();
    db.transaction(() => {
      for (const uid of unique) {
        ins.run(roomId, uid, now);
      }
    })();
  } catch {
    return { error: 'Не удалось добавить участников' };
  }
  return { ok: true, room: getRoomByIdForUser(roomId, inviterId), addedCount: unique.length };
}

export function listRoomMessages(roomId, userId, limit = 200) {
  if (!userInRoom(roomId, userId)) return null;
  const rows = getDb()
    .prepare(
      `SELECT m.id, m.sender_id AS senderId, m.body, m.kind, m.media_path AS mediaPath, m.duration_ms AS durationMs,
        m.created_at AS createdAt, u.nickname AS senderNickname,
        m.ref_story_id AS refStoryId, m.story_reaction_key AS storyReactionKey,
        rs.media_path AS refStoryMediaPath
       FROM room_messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN stories rs ON rs.id = m.ref_story_id
       WHERE m.room_id = ?
       ORDER BY m.created_at ASC
       LIMIT ?`
    )
    .all(roomId, limit);
  const ids = rows.map((r) => r.id);
  const getReact = loadReactionSummaryForMessages(ids, userId);
  return rows.map((r) => mapMessageRow(r, getReact));
}

export function getMessageByIdForRoom(roomId, messageId, viewerId = null) {
  const row = getDb()
    .prepare(
      `SELECT m.id, m.sender_id AS senderId, m.body, m.kind, m.media_path AS mediaPath, m.duration_ms AS durationMs,
        m.created_at AS createdAt, u.nickname AS senderNickname,
        m.ref_story_id AS refStoryId, m.story_reaction_key AS storyReactionKey,
        rs.media_path AS refStoryMediaPath
       FROM room_messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN stories rs ON rs.id = m.ref_story_id
       WHERE m.room_id = ? AND m.id = ?`
    )
    .get(roomId, messageId);
  if (!row) return null;
  const getReact = viewerId != null ? loadReactionSummaryForMessages([row.id], viewerId) : null;
  return mapMessageRow(row, getReact);
}

export function insertRoomMessage(roomId, userId, body) {
  const trimmed = String(body ?? '').trim();
  if (!trimmed) return { error: 'Пустое сообщение' };
  if (trimmed.length > 4000) return { error: 'Сообщение не длиннее 4000 символов' };
  if (!userInRoom(roomId, userId)) return { error: 'Нет доступа к комнате' };

  const id = randomUUID();
  const createdAt = Date.now();
  getDb()
    .prepare(
      `INSERT INTO room_messages (id, room_id, sender_id, body, created_at, kind) VALUES (?, ?, ?, ?, ?, 'text')`
    )
    .run(id, roomId, userId, trimmed, createdAt);

  const sn = getDb().prepare(`SELECT nickname FROM users WHERE id = ?`).get(userId);
  return {
    message: {
      id,
      roomId,
      senderId: userId,
      body: trimmed,
      kind: 'text',
      mediaUrl: null,
      durationMs: null,
      createdAt,
      senderNickname: sn?.nickname ?? null,
    },
    memberIds: listRoomMemberUserIds(roomId),
  };
}

export function insertRoomMediaMessage(roomId, userId, kind, mediaRelativePath, durationMs) {
  if (kind !== 'voice' && kind !== 'video_note') {
    return { error: 'Некорректный тип вложения' };
  }
  if (!userInRoom(roomId, userId)) return { error: 'Нет доступа к комнате' };

  const d = Math.round(Number(durationMs));
  if (!Number.isFinite(d) || d < MIN_MEDIA_MS || d > MAX_MEDIA_MS) {
    return { error: `Длительность от ${MIN_MEDIA_MS / 1000} до ${MAX_MEDIA_MS / 1000} с` };
  }
  const media = String(mediaRelativePath ?? '').trim();
  if (!media) return { error: 'Нет файла' };

  const id = randomUUID();
  const createdAt = Date.now();
  getDb()
    .prepare(
      `INSERT INTO room_messages (id, room_id, sender_id, body, created_at, kind, media_path, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, roomId, userId, '', createdAt, kind, media, d);

  const sn = getDb().prepare(`SELECT nickname FROM users WHERE id = ?`).get(userId);

  return {
    message: {
      id,
      roomId,
      senderId: userId,
      body: '',
      kind,
      mediaUrl: `/uploads/${media}`,
      durationMs: d,
      createdAt,
      senderNickname: sn?.nickname ?? null,
    },
    memberIds: listRoomMemberUserIds(roomId),
  };
}

/** Фото или файл в комнате. */
export function insertRoomAttachmentMessage(roomId, userId, kind, mediaRelativePath, body) {
  if (kind !== 'image' && kind !== 'file') {
    return { error: 'Некорректный тип вложения' };
  }
  if (!userInRoom(roomId, userId)) return { error: 'Нет доступа к комнате' };

  const media = String(mediaRelativePath ?? '').trim();
  if (!media) return { error: 'Нет файла' };

  let bodyText = String(body ?? '');
  if (kind === 'image') {
    bodyText = bodyText.trim();
    if (bodyText.length > MAX_IMAGE_CAPTION) {
      return { error: 'Подпись не длиннее 2000 символов' };
    }
  } else {
    bodyText = bodyText.trim().slice(0, MAX_FILE_LABEL);
    if (!bodyText) bodyText = 'файл';
  }

  const id = randomUUID();
  const createdAt = Date.now();
  getDb()
    .prepare(
      `INSERT INTO room_messages (id, room_id, sender_id, body, created_at, kind, media_path, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
    )
    .run(id, roomId, userId, bodyText, createdAt, kind, media);

  const sn = getDb().prepare(`SELECT nickname FROM users WHERE id = ?`).get(userId);

  return {
    message: {
      id,
      roomId,
      senderId: userId,
      body: bodyText,
      kind,
      mediaUrl: `/uploads/${media}`,
      durationMs: null,
      createdAt,
      senderNickname: sn?.nickname ?? null,
    },
    memberIds: listRoomMemberUserIds(roomId),
  };
}

export function markRoomRead(userId, roomId) {
  if (!userInRoom(roomId, userId)) return { error: 'Нет доступа к комнате' };
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO room_last_read (user_id, room_id, last_read_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id, room_id) DO UPDATE SET last_read_at = excluded.last_read_at`
    )
    .run(userId, roomId, now);
  return { ok: true, readAt: now };
}

export function toggleRoomMessageReaction(roomId, userId, messageId, reactionKey) {
  if (!MESSAGE_REACTION_KEYS.includes(reactionKey)) {
    return { error: 'Неизвестная реакция' };
  }
  if (!userInRoom(roomId, userId)) return { error: 'Нет доступа к комнате' };
  const msg = getDb()
    .prepare(`SELECT id FROM room_messages WHERE id = ? AND room_id = ?`)
    .get(messageId, roomId);
  if (!msg) return { error: 'Сообщение не найдено' };

  const db = getDb();
  const existing = db
    .prepare(`SELECT reaction FROM message_reactions WHERE message_id = ? AND user_id = ?`)
    .get(messageId, userId);
  const now = Date.now();

  if (existing?.reaction === reactionKey) {
    db.prepare(`DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?`).run(messageId, userId);
  } else if (existing) {
    db.prepare(`UPDATE message_reactions SET reaction = ?, created_at = ? WHERE message_id = ? AND user_id = ?`).run(
      reactionKey,
      now,
      messageId,
      userId
    );
  } else {
    db.prepare(`INSERT INTO message_reactions (message_id, user_id, reaction, created_at) VALUES (?, ?, ?, ?)`).run(
      messageId,
      userId,
      reactionKey,
      now
    );
  }

  const getReact = loadReactionSummaryForMessages([messageId], userId);
  return {
    ok: true,
    messageId,
    reactions: getReact(messageId),
    memberIds: listRoomMemberUserIds(roomId),
  };
}

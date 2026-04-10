import { randomUUID } from 'crypto';
import { getDb } from './db.js';
import {
  normalizePhone,
  normalizeNickname,
  findUserByPhone,
  findUserByNickname,
  mapPublicUser,
  computeEffectiveDisplayRole,
  effectiveAffiliationEmoji,
} from './db.js';

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
    .prepare(
      `SELECT id, user_a AS userA, user_b AS userB, created_at AS createdAt,
        COALESCE(friends_active, 1) AS friendsActive FROM direct_chats WHERE user_a = ? AND user_b = ?`
    )
    .get(a, b);
}

/** Есть общий личный чат (в т.ч. после «удалить из друзья»). */
export function haveDirectChatLink(userId1, userId2) {
  return Boolean(findDirectChatByPair(userId1, userId2));
}

export function areFriends(userId1, userId2) {
  const row = findDirectChatByPair(userId1, userId2);
  return Boolean(row && row.friendsActive === 1);
}

function isUserBlockedBy(blockerId, blockedId) {
  return Boolean(
    getDb()
      .prepare(`SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?`)
      .get(blockerId, blockedId)
  );
}

/** Отправитель не может писать, если peer заблокировал отправителя. */
export function assertCanSendDirectMessage(chatId, senderId) {
  const peerId = getPeerIdInDirectChat(chatId, senderId);
  if (peerId == null) return { error: 'Нет доступа к чату' };
  const row = getDb().prepare(`SELECT friends_active AS friendsActive FROM direct_chats WHERE id = ?`).get(chatId);
  if (!row || row.friendsActive !== 1) {
    return { error: 'Вы не в друзьях — отправка недоступна' };
  }
  if (isUserBlockedBy(peerId, senderId)) {
    return { error: 'Пользователь ограничил вам сообщения' };
  }
  return { ok: true, peerId };
}

export function removeFriendship(viewerId, peerId) {
  if (viewerId === peerId) return { error: 'Некорректно' };
  const chat = findDirectChatByPair(viewerId, peerId);
  if (!chat) return { error: 'Чат не найден' };
  getDb().prepare(`UPDATE direct_chats SET friends_active = 0 WHERE id = ?`).run(chat.id);
  return { ok: true };
}

export function blockUser(blockerId, blockedId) {
  if (blockerId === blockedId) return { error: 'Некорректно' };
  const now = Date.now();
  getDb()
    .prepare(`INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)`)
    .run(blockerId, blockedId, now);
  return { ok: true };
}

export function unblockUser(blockerId, blockedId) {
  getDb().prepare(`DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?`).run(blockerId, blockedId);
  return { ok: true };
}

export function getFriendshipMetaForProfile(viewerId, targetId) {
  const chat = findDirectChatByPair(viewerId, targetId);
  if (!chat) {
    return {
      hasDirectChat: false,
      friendsActive: false,
      youBlockedThem: isUserBlockedBy(viewerId, targetId),
      theyBlockedYou: isUserBlockedBy(targetId, viewerId),
    };
  }
  const youBlockedThem = isUserBlockedBy(viewerId, targetId);
  const theyBlockedYou = isUserBlockedBy(targetId, viewerId);
  const friendsActive = chat.friendsActive === 1;
  const canMessage = friendsActive && !theyBlockedYou;
  return {
    hasDirectChat: true,
    friendsActive,
    youBlockedThem,
    theyBlockedYou,
    canMessage,
  };
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
    .prepare(
      `SELECT id, nickname, first_name AS firstName, last_name AS lastName, display_role AS displayRole, display_role_emoji AS displayRoleEmoji FROM users WHERE id = ?`
    )
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
            affiliationEmoji: effectiveAffiliationEmoji(
              fromUser.nickname,
              fromUser.displayRole,
              fromUser.displayRoleEmoji
            ),
          }
        : null,
    },
  };
}

export function listIncomingFriendRequests(userId) {
  const rows = getDb()
    .prepare(
      `SELECT fr.id, fr.from_user_id AS fromUserId, fr.created_at AS createdAt,
        u.nickname AS fromNickname, u.first_name AS fromFirstName, u.last_name AS fromLastName,
        u.display_role AS fromRole, u.display_role_emoji AS fromEmoji
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
      affiliationEmoji: effectiveAffiliationEmoji(r.fromNickname, r.fromRole, r.fromEmoji),
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

function getLastMessageForChat(chatId, viewerId) {
  return getDb()
    .prepare(
      `SELECT m.body, m.created_at AS createdAt, m.kind, m.media_path AS mediaPath, m.revoked_for_all AS revokedForAll
       FROM messages m
       WHERE m.chat_id = ?
       AND NOT EXISTS (SELECT 1 FROM direct_message_hide h WHERE h.message_id = m.id AND h.user_id = ?)
       ORDER BY m.created_at DESC LIMIT 1`
    )
    .get(chatId, viewerId);
}

function formatLastMessagePreview(last) {
  if (!last) return 'Нет сообщений';
  if (last.revokedForAll === 1) return 'Сообщение удалено';
  const k = last.kind || 'text';
  if (k === 'voice') return 'Голосовое сообщение';
  if (k === 'video_note') return 'Видеосообщение';
  if (k === 'image') return 'Фото';
  if (k === 'file') return 'Файл';
  if (k === 'story_reaction') return 'Реакция на историю';
  if (k === 'revoked') return 'Сообщение удалено';
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
        COALESCE(dc.friends_active, 1) AS friendsActive,
        CASE WHEN dc.user_a = ? THEN dc.user_b ELSE dc.user_a END AS peerId
      FROM direct_chats dc
      WHERE dc.user_a = ? OR dc.user_b = ?`
    )
    .all(userId, userId, userId);

  const out = [];
  for (const row of rows) {
    const peer = getDb()
      .prepare(
        `SELECT id, nickname, first_name AS firstName, last_name AS lastName, avatar_path AS avatarPath,
          display_role AS displayRole, display_role_emoji AS displayRoleEmoji FROM users WHERE id = ?`
      )
      .get(row.peerId);
    if (!peer) continue;
    const last = getLastMessageForChat(row.chatId, userId);
    const lastActivityAt = last?.createdAt != null ? last.createdAt : row.chatCreatedAt;
    const peerAvatarUrl = peer.avatarPath ? `/uploads/${peer.avatarPath}` : null;
    const lr = getDb()
      .prepare(`SELECT last_read_at AS lastReadAt FROM chat_last_read WHERE user_id = ? AND chat_id = ?`)
      .get(userId, row.chatId);
    const since = lr?.lastReadAt ?? 0;
    const unreadRow = getDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM messages m
         WHERE m.chat_id = ? AND m.sender_id != ? AND m.created_at > ?
         AND NOT EXISTS (SELECT 1 FROM direct_message_hide h WHERE h.message_id = m.id AND h.user_id = ?)`
      )
      .get(row.chatId, userId, since, userId);
    const unreadCount = unreadRow?.c ?? 0;
    const friendsActive = row.friendsActive === 1;
    const theyBlockedYou = isUserBlockedBy(row.peerId, userId);
    const canMessage = friendsActive && !theyBlockedYou;
    const peerAff = effectiveAffiliationEmoji(peer.nickname, peer.displayRole, peer.displayRoleEmoji);
    out.push({
      id: row.chatId,
      kind: 'direct',
      peerNickname: peer.nickname || null,
      name: peer.nickname ? `@${peer.nickname}` : peer.firstName,
      peerAffiliationEmoji: peerAff,
      lastMessage: formatLastMessagePreview(last),
      time: last ? formatChatTime(last.createdAt) : '',
      typing: false,
      peerUserId: peer.id,
      peerAvatarUrl,
      unreadCount,
      friendsActive,
      canMessage,
      _sortAt: lastActivityAt,
    });
  }
  out.sort((a, b) => (b._sortAt ?? 0) - (a._sortAt ?? 0));
  return out.map(({ _sortAt: _s, ...rest }) => rest);
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
      db.prepare(`UPDATE direct_chats SET friends_active = 1 WHERE id = ?`).run(chatId);
    } else {
      chatId = randomUUID();
      db.prepare(`INSERT INTO direct_chats (id, user_a, user_b, created_at, friends_active) VALUES (?, ?, ?, ?, 1)`).run(
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

function loadPostReactionSummaryForPosts(postIds, viewerId) {
  if (postIds.length === 0) {
    return () => ({ counts: { up: 0, down: 0, fire: 0, poop: 0 }, mine: null });
  }
  const ph = postIds.map(() => '?').join(',');
  const raw = getDb()
    .prepare(
      `SELECT post_id AS postId, user_id AS userId, reaction FROM post_reactions WHERE post_id IN (${ph})`
    )
    .all(...postIds);
  const byPost = new Map();
  for (const x of raw) {
    if (!byPost.has(x.postId)) byPost.set(x.postId, []);
    byPost.get(x.postId).push(x);
  }
  return (postId) => {
    const arr = byPost.get(postId) || [];
    const counts = { up: 0, down: 0, fire: 0, poop: 0 };
    let mine = null;
    for (const x of arr) {
      if (counts[x.reaction] != null) counts[x.reaction]++;
      if (x.userId === viewerId) mine = x.reaction;
    }
    return { counts, mine };
  };
}

function assertViewerCanSeePost(viewerId, postId) {
  const row = getDb().prepare(`SELECT author_id AS authorId FROM posts WHERE id = ?`).get(postId);
  if (!row) return { error: 'Пост не найден' };
  if (String(row.authorId) === String(viewerId)) return { ok: true, authorId: row.authorId };
  if (!areFriends(viewerId, row.authorId)) return { error: 'Нет доступа' };
  return { ok: true, authorId: row.authorId };
}

function previewLineForMessage(kind, body) {
  const k = kind || 'text';
  if (k === 'revoked') return 'Сообщение удалено';
  if (k === 'text') return String(body ?? '').trim().slice(0, 120) || '·';
  if (k === 'voice') return '🎤 Голосовое';
  if (k === 'video_note') return '🎬 Видеокружок';
  if (k === 'image') return body?.trim() ? `🖼 ${String(body).slice(0, 60)}` : '🖼 Фото';
  if (k === 'file') return body?.trim() ? `📎 ${String(body).slice(0, 60)}` : '📎 Файл';
  if (k === 'story_reaction') return 'Реакция на историю';
  return 'Сообщение';
}

function attachReplyForward(out, r, revoked) {
  let forwardFrom = null;
  if (!revoked && r.forwardJson) {
    try {
      forwardFrom = JSON.parse(r.forwardJson);
    } catch {
      /* */
    }
  }
  out.forwardFrom = forwardFrom;
  let replyTo = null;
  if (!revoked && r.replyToIdRaw && r.replyRefId) {
    const gone = r.replyParentRevoked === 1;
    replyTo = {
      id: r.replyRefId,
      senderNickname: r.replyToSenderNick || 'user',
      kind: gone ? 'revoked' : r.replyToKindRaw || 'text',
      preview: gone ? 'Сообщение удалено' : previewLineForMessage(r.replyToKindRaw, r.replyToBodyRaw),
    };
  }
  out.replyTo = replyTo;
}

function mapMessageRow(r, getReactions) {
  if (!r) return null;
  const refPath = r.refStoryMediaPath;
  const revoked = r.revokedForAll === 1;
  const aff = effectiveAffiliationEmoji(r.senderNickname, r.senderStoredRole, r.senderEmoji);
  const out = {
    id: r.id,
    senderId: r.senderId,
    body: revoked ? 'Сообщение удалено' : (r.body ?? ''),
    kind: revoked ? 'revoked' : r.kind || 'text',
    mediaUrl: revoked ? null : r.mediaPath ? `/uploads/${r.mediaPath}` : null,
    durationMs: revoked ? null : r.durationMs != null ? r.durationMs : null,
    createdAt: r.createdAt,
    editedAt: revoked || r.editedAt == null ? null : r.editedAt,
    senderNickname: r.senderNickname,
    senderAffiliationEmoji: aff,
    refStoryId: revoked ? null : (r.refStoryId ?? null),
    storyReactionKey: revoked ? null : (r.storyReactionKey ?? null),
    refStoryPreviewUrl: revoked ? null : refPath ? `/uploads/${refPath}` : null,
    revokedForAll: revoked,
  };
  if (getReactions) out.reactions = getReactions(r.id);
  attachReplyForward(out, r, revoked);
  return out;
}

/** Одна строка для WS / API — тот же формат, что и в ленте (важно для kind + mediaUrl у собеседника). */
export function getMessageByIdForChat(chatId, messageId, viewerId = null) {
  let sql = `SELECT m.id, m.sender_id AS senderId, m.body, m.kind, m.media_path AS mediaPath, m.duration_ms AS durationMs,
        m.created_at AS createdAt, m.edited_at AS editedAt, m.revoked_for_all AS revokedForAll,
        m.reply_to_id AS replyToIdRaw, m.forward_json AS forwardJson,
        u.nickname AS senderNickname, u.display_role AS senderStoredRole, u.display_role_emoji AS senderEmoji,
        m.ref_story_id AS refStoryId, m.story_reaction_key AS storyReactionKey,
        rs.media_path AS refStoryMediaPath,
        rp.id AS replyRefId, rp.revoked_for_all AS replyParentRevoked,
        ru.nickname AS replyToSenderNick, rp.body AS replyToBodyRaw, rp.kind AS replyToKindRaw
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN stories rs ON rs.id = m.ref_story_id
      LEFT JOIN messages rp ON rp.id = m.reply_to_id AND rp.chat_id = m.chat_id
      LEFT JOIN users ru ON ru.id = rp.sender_id
      WHERE m.chat_id = ? AND m.id = ?`;
  const params = [chatId, messageId];
  if (viewerId != null) {
    sql += ` AND NOT EXISTS (SELECT 1 FROM direct_message_hide h WHERE h.message_id = m.id AND h.user_id = ?)`;
    params.push(viewerId);
  }
  const row = getDb().prepare(sql).get(...params);
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
        m.created_at AS createdAt, m.edited_at AS editedAt, m.revoked_for_all AS revokedForAll,
        m.reply_to_id AS replyToIdRaw, m.forward_json AS forwardJson,
        u.nickname AS senderNickname, u.display_role AS senderStoredRole, u.display_role_emoji AS senderEmoji,
        m.ref_story_id AS refStoryId, m.story_reaction_key AS storyReactionKey,
        rs.media_path AS refStoryMediaPath,
        rp.id AS replyRefId, rp.revoked_for_all AS replyParentRevoked,
        ru.nickname AS replyToSenderNick, rp.body AS replyToBodyRaw, rp.kind AS replyToKindRaw
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN stories rs ON rs.id = m.ref_story_id
      LEFT JOIN messages rp ON rp.id = m.reply_to_id AND rp.chat_id = m.chat_id
      LEFT JOIN users ru ON ru.id = rp.sender_id
      WHERE m.chat_id = ?
      AND NOT EXISTS (SELECT 1 FROM direct_message_hide h WHERE h.message_id = m.id AND h.user_id = ?)
      ORDER BY m.created_at ASC
      LIMIT ?`
    )
    .all(chatId, userId, limit);
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
        `SELECT COUNT(*) AS c FROM messages m
         WHERE m.chat_id = ? AND m.sender_id != ? AND m.created_at > ?
         AND NOT EXISTS (SELECT 1 FROM direct_message_hide h WHERE h.message_id = m.id AND h.user_id = ?)`
      )
      .get(chatId, userId, since, userId);
    total += r?.c ?? 0;
  }
  const roomRows = db.prepare(`SELECT room_id AS roomId FROM room_members WHERE user_id = ?`).all(userId);
  for (const row of roomRows) {
    const rid = row.roomId;
    const lr = db.prepare(`SELECT last_read_at AS t FROM room_last_read WHERE user_id = ? AND room_id = ?`).get(userId, rid);
    const since = lr?.t ?? 0;
    const r = db
      .prepare(
        `SELECT COUNT(*) AS c FROM room_messages m
         WHERE m.room_id = ? AND m.sender_id != ? AND m.created_at > ?
         AND NOT EXISTS (SELECT 1 FROM room_message_hide h WHERE h.message_id = m.id AND h.user_id = ?)`
      )
      .get(rid, userId, since, userId);
    total += r?.c ?? 0;
  }
  return total;
}

export function insertDirectMessage(chatId, userId, body, options = {}) {
  const trimmed = String(body ?? '').trim();
  if (!trimmed) return { error: 'Пустое сообщение' };
  if (trimmed.length > 4000) return { error: 'Сообщение не длиннее 4000 символов' };
  const gate = assertCanSendDirectMessage(chatId, userId);
  if (gate.error) return gate;
  const peerId = gate.peerId;

  let replyToId = null;
  if (options.replyToId != null && String(options.replyToId).trim()) {
    replyToId = String(options.replyToId).trim();
    const rp = getDb()
      .prepare(`SELECT id FROM messages WHERE id = ? AND chat_id = ? AND COALESCE(revoked_for_all,0) = 0`)
      .get(replyToId, chatId);
    if (!rp) return { error: 'Ответ: исходное сообщение не найдено' };
  }

  const id = randomUUID();
  const createdAt = Date.now();
  getDb()
    .prepare(
      `INSERT INTO messages (id, chat_id, sender_id, body, created_at, reply_to_id) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, chatId, userId, trimmed, createdAt, replyToId);

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
  const gate = assertCanSendDirectMessage(chatId, userId);
  if (gate.error) return gate;
  const peerId = gate.peerId;

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
  const gate = assertCanSendDirectMessage(chatId, userId);
  if (gate.error) return gate;
  const peerId = gate.peerId;

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
  const chat = findDirectChatByPair(viewerId, authorId);
  if (!chat || chat.friendsActive !== 1) {
    return { error: 'Только для друзей' };
  }
  const gateStory = assertCanSendDirectMessage(chat.id, viewerId);
  if (gateStory.error) return { error: gateStory.error };

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
  const gateReact = assertCanSendDirectMessage(chatId, userId);
  if (gateReact.error) return { error: gateReact.error };
  const msg = getDb()
    .prepare(`SELECT id, revoked_for_all AS r FROM messages WHERE id = ? AND chat_id = ?`)
    .get(messageId, chatId);
  if (!msg) return { error: 'Сообщение не найдено' };
  if (msg.r === 1) return { error: 'Сообщение удалено' };

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

export function hideDirectMessageForViewer(chatId, viewerId, messageId) {
  if (!userInDirectChat(chatId, viewerId)) return { error: 'Нет доступа к чату' };
  const row = getDb().prepare(`SELECT id FROM messages WHERE id = ? AND chat_id = ?`).get(messageId, chatId);
  if (!row) return { error: 'Сообщение не найдено' };
  getDb().prepare(`INSERT OR IGNORE INTO direct_message_hide (message_id, user_id) VALUES (?, ?)`).run(messageId, viewerId);
  return { ok: true, peerId: getPeerIdInDirectChat(chatId, viewerId) };
}

export function revokeDirectMessageForEveryone(chatId, userId, messageId) {
  if (!userInDirectChat(chatId, userId)) return { error: 'Нет доступа к чату' };
  const row = getDb()
    .prepare(`SELECT sender_id AS senderId, revoked_for_all AS r FROM messages WHERE id = ? AND chat_id = ?`)
    .get(messageId, chatId);
  if (!row) return { error: 'Сообщение не найдено' };
  if (row.r === 1) return { error: 'Уже удалено' };
  if (String(row.senderId) !== String(userId)) return { error: 'Можно удалить только свои сообщения' };
  getDb()
    .prepare(
      `UPDATE messages SET revoked_for_all = 1, body = '', media_path = NULL, ref_story_id = NULL, story_reaction_key = NULL WHERE id = ?`
    )
    .run(messageId);
  getDb().prepare(`DELETE FROM message_reactions WHERE message_id = ?`).run(messageId);
  return { ok: true, peerId: getPeerIdInDirectChat(chatId, userId) };
}

export function updateDirectMessage(chatId, userId, messageId, body) {
  const trimmed = String(body ?? '').trim();
  if (!trimmed) return { error: 'Пустое сообщение' };
  if (trimmed.length > 4000) return { error: 'Сообщение не длиннее 4000 символов' };
  if (!userInDirectChat(chatId, userId)) return { error: 'Нет доступа к чату' };
  const row = getDb()
    .prepare(
      `SELECT sender_id AS senderId, kind, revoked_for_all AS revoked FROM messages WHERE id = ? AND chat_id = ?`
    )
    .get(messageId, chatId);
  if (!row) return { error: 'Сообщение не найдено' };
  if (String(row.senderId) !== String(userId)) return { error: 'Можно изменить только свои сообщения' };
  if (row.revoked === 1) return { error: 'Сообщение удалено' };
  if ((row.kind || 'text') !== 'text') return { error: 'Можно изменить только текст' };
  const editedAt = Date.now();
  getDb()
    .prepare(`UPDATE messages SET body = ?, edited_at = ? WHERE id = ? AND chat_id = ?`)
    .run(trimmed, editedAt, messageId, chatId);
  return { ok: true, peerId: getPeerIdInDirectChat(chatId, userId) };
}

function getForwardableDirectMessage(chatId, messageId) {
  return getDb()
    .prepare(
      `SELECT m.sender_id AS senderId, m.body, m.kind, m.media_path AS mediaPath, m.duration_ms AS durationMs,
        m.ref_story_id AS refStoryId, m.story_reaction_key AS storyReactionKey,
        u.nickname AS senderNickname
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.chat_id = ? AND m.id = ? AND COALESCE(m.revoked_for_all,0) = 0`
    )
    .get(chatId, messageId);
}

function getForwardableRoomMessage(roomId, messageId) {
  return getDb()
    .prepare(
      `SELECT m.sender_id AS senderId, m.body, m.kind, m.media_path AS mediaPath, m.duration_ms AS durationMs,
        m.ref_story_id AS refStoryId, m.story_reaction_key AS storyReactionKey,
        u.nickname AS senderNickname
       FROM room_messages m JOIN users u ON u.id = m.sender_id
       WHERE m.room_id = ? AND m.id = ? AND COALESCE(m.revoked_for_all,0) = 0`
    )
    .get(roomId, messageId);
}

function buildForwardJson(row) {
  return JSON.stringify({
    originalAuthorId: row.senderId,
    originalAuthorNickname: row.senderNickname,
    originalKind: row.kind || 'text',
    preview: previewLineForMessage(row.kind, row.body),
  });
}

export function forwardMessageToDirectChat(targetChatId, userId, fromChatId, fromRoomId, messageId) {
  if (!messageId) return { error: 'Нет сообщения' };
  const fc = fromChatId ? String(fromChatId).trim() : '';
  const fr = fromRoomId ? String(fromRoomId).trim() : '';
  if (!!fc === !!fr) return { error: 'Укажите источник: чат или комната' };
  let src;
  if (fc) {
    if (!userInDirectChat(fc, userId)) return { error: 'Нет доступа к исходному чату' };
    src = getForwardableDirectMessage(fc, messageId);
  } else {
    if (!userInRoom(fr, userId)) return { error: 'Нет доступа к исходной комнате' };
    src = getForwardableRoomMessage(fr, messageId);
  }
  if (!src) return { error: 'Сообщение не найдено' };
  const gate = assertCanSendDirectMessage(targetChatId, userId);
  if (gate.error) return gate;
  const peerId = gate.peerId;
  const id = randomUUID();
  const createdAt = Date.now();
  const fwd = buildForwardJson(src);
  getDb()
    .prepare(
      `INSERT INTO messages (id, chat_id, sender_id, body, created_at, kind, media_path, duration_ms, ref_story_id, story_reaction_key, forward_json, reply_to_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    )
    .run(
      id,
      targetChatId,
      userId,
      src.body || '',
      createdAt,
      src.kind || 'text',
      src.mediaPath || null,
      src.durationMs ?? null,
      src.refStoryId || null,
      src.storyReactionKey || null,
      fwd
    );
  return { ok: true, peerId, messageId: id };
}

export function forwardMessageToRoom(targetRoomId, userId, fromChatId, fromRoomId, messageId) {
  if (!messageId) return { error: 'Нет сообщения' };
  const fc = fromChatId ? String(fromChatId).trim() : '';
  const fr = fromRoomId ? String(fromRoomId).trim() : '';
  if (!!fc === !!fr) return { error: 'Укажите источник: чат или комната' };
  let src;
  if (fc) {
    if (!userInDirectChat(fc, userId)) return { error: 'Нет доступа к исходному чату' };
    src = getForwardableDirectMessage(fc, messageId);
  } else {
    if (!userInRoom(fr, userId)) return { error: 'Нет доступа к исходной комнате' };
    src = getForwardableRoomMessage(fr, messageId);
  }
  if (!src) return { error: 'Сообщение не найдено' };
  if (!userInRoom(targetRoomId, userId)) return { error: 'Нет доступа к комнате' };
  const id = randomUUID();
  const createdAt = Date.now();
  const fwd = buildForwardJson(src);
  getDb()
    .prepare(
      `INSERT INTO room_messages (id, room_id, sender_id, body, created_at, kind, media_path, duration_ms, ref_story_id, story_reaction_key, forward_json, reply_to_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    )
    .run(
      id,
      targetRoomId,
      userId,
      src.body || '',
      createdAt,
      src.kind || 'text',
      src.mediaPath || null,
      src.durationMs ?? null,
      src.refStoryId || null,
      src.storyReactionKey || null,
      fwd
    );
  return { ok: true, memberIds: listRoomMemberUserIds(targetRoomId), messageId: id };
}

/** Собеседники из direct_chats (принятые друзья). */
export function listPeerUserIds(userId) {
  const rows = getDb()
    .prepare(
      `SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS peerId
       FROM direct_chats WHERE (user_a = ? OR user_b = ?) AND COALESCE(friends_active, 1) = 1`
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
      `SELECT p.id, p.author_id AS authorId, p.body, p.created_at AS createdAt, p.media_path AS mediaPath, p.edited_at AS editedAt,
        u.nickname AS authorNickname, u.first_name AS firstName, u.last_name AS lastName, u.avatar_path AS avatarPath,
        u.display_role AS authorStoredRole, u.display_role_emoji AS authorEmoji,
        (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id) AS commentCount
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.author_id IN (${ph})
      ORDER BY p.created_at DESC
      LIMIT 200`
    )
    .all(...ids);
  const postIds = rows.map((x) => x.id);
  const getPostReact = loadPostReactionSummaryForPosts(postIds, viewerId);
  return rows.map((r) => {
    const react = getPostReact(r.id);
    const cts = react?.counts ?? {};
    return {
      id: r.id,
      authorId: r.authorId,
      body: r.body,
      createdAt: r.createdAt,
      editedAt: r.editedAt ?? null,
      mediaUrl: r.mediaPath ? `/uploads/${r.mediaPath}` : null,
      authorNickname: r.authorNickname,
      authorName: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || '—',
      authorAvatarUrl: r.avatarPath ? `/uploads/${r.avatarPath}` : null,
      authorBadge: computeEffectiveDisplayRole(r.authorNickname, r.authorStoredRole),
      authorAffiliationEmoji: effectiveAffiliationEmoji(r.authorNickname, r.authorStoredRole, r.authorEmoji),
      commentCount: Number(r.commentCount) || 0,
      reactions: {
        counts: {
          up: Number(cts.up) || 0,
          down: Number(cts.down) || 0,
          fire: Number(cts.fire) || 0,
          poop: Number(cts.poop) || 0,
        },
        mine: react?.mine ?? null,
      },
    };
  });
}

export function createPost(authorId, { body, mediaPath }) {
  const t = String(body ?? '').trim();
  const media = mediaPath ? String(mediaPath).trim() : '';
  if (!t && !media) return { error: 'Добавьте текст или файл' };
  if (t.length > 8000) return { error: 'Пост не длиннее 8000 символов' };
  const id = randomUUID();
  const createdAt = Date.now();
  getDb()
    .prepare(`INSERT INTO posts (id, author_id, body, created_at, media_path) VALUES (?, ?, ?, ?, ?)`)
    .run(id, authorId, t || '', createdAt, media || null);
  return {
    ok: true,
    post: {
      id,
      authorId,
      body: t || '',
      createdAt,
      mediaUrl: media ? `/uploads/${media}` : null,
      editedAt: null,
    },
  };
}

export function updateFeedPost(postId, authorId, body) {
  const row = getDb()
    .prepare(`SELECT author_id AS authorId, media_path AS mediaPath FROM posts WHERE id = ?`)
    .get(postId);
  if (!row) return { error: 'Пост не найден' };
  if (String(row.authorId) !== String(authorId)) return { error: 'Нет доступа' };
  const t = String(body ?? '').trim();
  const hasMedia = !!(row.mediaPath && String(row.mediaPath).trim());
  if (!t && !hasMedia) return { error: 'Пустой пост' };
  if (t.length > 8000) return { error: 'Пост не длиннее 8000 символов' };
  const editedAt = Date.now();
  getDb().prepare(`UPDATE posts SET body = ?, edited_at = ? WHERE id = ?`).run(t, editedAt, postId);
  return { ok: true, editedAt };
}

export function deleteFeedPost(postId, authorId) {
  const row = getDb()
    .prepare(`SELECT author_id AS authorId, media_path AS mediaPath FROM posts WHERE id = ?`)
    .get(postId);
  if (!row) return { error: 'Пост не найден' };
  if (String(row.authorId) !== String(authorId)) return { error: 'Нет доступа' };
  const db = getDb();
  db.prepare(`DELETE FROM post_reactions WHERE post_id = ?`).run(postId);
  db.prepare(`DELETE FROM post_comments WHERE post_id = ?`).run(postId);
  db.prepare(`DELETE FROM posts WHERE id = ?`).run(postId);
  return { ok: true, mediaPath: row.mediaPath || null };
}

export function togglePostReaction(postId, userId, reactionKey) {
  if (!MESSAGE_REACTION_KEYS.includes(reactionKey)) {
    return { error: 'Неизвестная реакция' };
  }
  const gate = assertViewerCanSeePost(userId, postId);
  if (gate.error) return { error: gate.error };

  const db = getDb();
  const existing = db
    .prepare(`SELECT reaction FROM post_reactions WHERE post_id = ? AND user_id = ?`)
    .get(postId, userId);
  const now = Date.now();

  if (existing?.reaction === reactionKey) {
    db.prepare(`DELETE FROM post_reactions WHERE post_id = ? AND user_id = ?`).run(postId, userId);
  } else if (existing) {
    db.prepare(`UPDATE post_reactions SET reaction = ?, created_at = ? WHERE post_id = ? AND user_id = ?`).run(
      reactionKey,
      now,
      postId,
      userId
    );
  } else {
    db.prepare(`INSERT INTO post_reactions (post_id, user_id, reaction, created_at) VALUES (?, ?, ?, ?)`).run(
      postId,
      userId,
      reactionKey,
      now
    );
  }

  const getReact = loadPostReactionSummaryForPosts([postId], userId);
  return {
    ok: true,
    postId,
    reactions: getReact(postId),
  };
}

export function listPostReactionUsers(postId, viewerId) {
  const gate = assertViewerCanSeePost(viewerId, postId);
  if (gate.error) return { error: gate.error };
  const rows = getDb()
    .prepare(
      `SELECT pr.user_id AS userId, pr.reaction, u.nickname AS authorNickname,
        u.display_role AS authorStoredRole, u.display_role_emoji AS authorEmoji
       FROM post_reactions pr
       JOIN users u ON u.id = pr.user_id
       WHERE pr.post_id = ?
       ORDER BY pr.created_at ASC`
    )
    .all(postId);
  return {
    ok: true,
    users: rows.map((r) => ({
      userId: r.userId,
      reaction: r.reaction,
      nickname: r.authorNickname,
      affiliationEmoji: effectiveAffiliationEmoji(r.authorNickname, r.authorStoredRole, r.authorEmoji),
    })),
  };
}

export function listMessageReactionUsers(messageId, viewerId) {
  const chatRow = getDb().prepare(`SELECT chat_id AS cid FROM messages WHERE id = ?`).get(messageId);
  if (chatRow) {
    if (!userInDirectChat(chatRow.cid, viewerId)) return { error: 'Нет доступа' };
  } else {
    const roomRow = getDb().prepare(`SELECT room_id AS rid FROM room_messages WHERE id = ?`).get(messageId);
    if (!roomRow) return { error: 'Сообщение не найдено' };
    if (!userInRoom(roomRow.rid, viewerId)) return { error: 'Нет доступа' };
  }
  const rows = getDb()
    .prepare(
      `SELECT mr.user_id AS userId, mr.reaction, u.nickname AS authorNickname,
        u.display_role AS authorStoredRole, u.display_role_emoji AS authorEmoji
       FROM message_reactions mr
       JOIN users u ON u.id = mr.user_id
       WHERE mr.message_id = ?
       ORDER BY mr.created_at ASC`
    )
    .all(messageId);
  return {
    ok: true,
    users: rows.map((r) => ({
      userId: r.userId,
      reaction: r.reaction,
      nickname: r.authorNickname,
      affiliationEmoji: effectiveAffiliationEmoji(r.authorNickname, r.authorStoredRole, r.authorEmoji),
    })),
  };
}

export function listPostComments(postId, viewerId) {
  const gate = assertViewerCanSeePost(viewerId, postId);
  if (gate.error) return { error: gate.error };
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.author_id AS authorId, c.body, c.created_at AS createdAt, c.edited_at AS editedAt,
        u.nickname AS authorNickname, u.first_name AS firstName, u.last_name AS lastName, u.avatar_path AS avatarPath,
        u.display_role AS authorStoredRole, u.display_role_emoji AS authorEmoji
       FROM post_comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.post_id = ?
       ORDER BY c.created_at ASC
       LIMIT 500`
    )
    .all(postId);
  return {
    ok: true,
    comments: rows.map((r) => ({
      id: r.id,
      authorId: r.authorId,
      body: r.body,
      createdAt: r.createdAt,
      editedAt: r.editedAt ?? null,
      authorNickname: r.authorNickname,
      authorName: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || '—',
      authorAvatarUrl: r.avatarPath ? `/uploads/${r.avatarPath}` : null,
      authorBadge: computeEffectiveDisplayRole(r.authorNickname, r.authorStoredRole),
      authorAffiliationEmoji: effectiveAffiliationEmoji(r.authorNickname, r.authorStoredRole, r.authorEmoji),
    })),
  };
}

export function createPostComment(postId, authorId, body) {
  const gate = assertViewerCanSeePost(authorId, postId);
  if (gate.error) return { error: gate.error };
  const t = String(body ?? '').trim();
  if (!t) return { error: 'Пустой комментарий' };
  if (t.length > 4000) return { error: 'Не длиннее 4000 символов' };
  const id = randomUUID();
  const createdAt = Date.now();
  getDb()
    .prepare(`INSERT INTO post_comments (id, post_id, author_id, body, created_at, edited_at) VALUES (?, ?, ?, ?, ?, NULL)`)
    .run(id, postId, authorId, t, createdAt);
  const list = listPostComments(postId, authorId);
  const c = list.comments?.find((x) => x.id === id);
  return { ok: true, comment: c };
}

export function updatePostComment(commentId, userId, body) {
  const row = getDb()
    .prepare(
      `SELECT c.id, c.post_id AS postId, c.author_id AS authorId FROM post_comments c WHERE c.id = ?`
    )
    .get(commentId);
  if (!row) return { error: 'Комментарий не найден' };
  if (String(row.authorId) !== String(userId)) return { error: 'Нет доступа' };
  const gate = assertViewerCanSeePost(userId, row.postId);
  if (gate.error) return { error: gate.error };
  const t = String(body ?? '').trim();
  if (!t) return { error: 'Пустой комментарий' };
  if (t.length > 4000) return { error: 'Не длиннее 4000 символов' };
  const editedAt = Date.now();
  getDb().prepare(`UPDATE post_comments SET body = ?, edited_at = ? WHERE id = ?`).run(t, editedAt, commentId);
  const list = listPostComments(row.postId, userId);
  const c = list.comments?.find((x) => x.id === commentId);
  return { ok: true, comment: c };
}

export function deletePostComment(commentId, userId) {
  const row = getDb()
    .prepare(`SELECT id, post_id AS postId, author_id AS authorId FROM post_comments WHERE id = ?`)
    .get(commentId);
  if (!row) return { error: 'Комментарий не найден' };
  if (String(row.authorId) !== String(userId)) return { error: 'Нет доступа' };
  const gate = assertViewerCanSeePost(userId, row.postId);
  if (gate.error) return { error: gate.error };
  getDb().prepare(`DELETE FROM post_comments WHERE id = ?`).run(commentId);
  return { ok: true, postId: row.postId };
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
      .prepare(
        `SELECT id, nickname, first_name AS firstName, last_name AS lastName, avatar_path AS avatarPath,
          display_role AS displayRole, display_role_emoji AS displayRoleEmoji FROM users WHERE id = ?`
      )
      .get(r.userId);
    if (!u) continue;
    let allViewed = true;
    if (r.cnt > 0) {
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
      affiliationEmoji: effectiveAffiliationEmoji(u.nickname, u.displayRole, u.displayRoleEmoji),
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
        u.nickname AS nickname, u.first_name AS firstName, u.last_name AS lastName, u.avatar_path AS avatarPath,
        u.display_role AS authorRole, u.display_role_emoji AS authorEmoji
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
    authorAffiliationEmoji: effectiveAffiliationEmoji(r.nickname, r.authorRole, r.authorEmoji),
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

/**
 * Каталог пользователей («Возможно друзья»): все, кроме просматривающего.
 * Поиск по подстроке ника, имени, фамилии или цифрам телефона. Телефон в ответе не отдаём.
 */
export function listUsersDirectoryForViewer(viewerId, query) {
  const db = getDb();
  const q = String(query ?? '').trim();
  const params = [viewerId];
  let sql = `
    SELECT id, phone, first_name AS firstName, last_name AS lastName, nickname, created_at AS createdAt, avatar_path AS avatarPath,
      about, display_role AS displayRole, display_role_emoji AS displayRoleEmoji
    FROM users
    WHERE id != ?
  `;
  if (q) {
    const qNick = q.replace(/^@/, '').trim();
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 3) {
      sql += ` AND (
        LOWER(nickname) LIKE LOWER(?) OR
        phone LIKE ? OR
        first_name LIKE ? OR
        last_name LIKE ?
      )`;
      const patNick = `%${qNick}%`;
      const patDig = `%${digits}%`;
      params.push(patNick, patDig, `%${q}%`, `%${q}%`);
    } else {
      sql += ` AND (
        LOWER(nickname) LIKE LOWER(?) OR
        first_name LIKE ? OR
        last_name LIKE ?
      )`;
      const pat = `%${qNick}%`;
      params.push(pat, `%${q}%`, `%${q}%`);
    }
  }
  sql += ` ORDER BY LOWER(nickname) ASC LIMIT 400`;
  const rows = db.prepare(sql).all(...params);
  return rows.map((row) => {
    const u = mapPublicUser(row);
    let relationship = 'none';
    let incomingRequestId = null;
    if (areFriends(viewerId, row.id)) {
      relationship = 'friend';
    } else {
      const out = getPendingRequestBetween(viewerId, row.id);
      if (out) {
        relationship = 'pending_out';
      } else {
        const inc = getPendingRequestBetween(row.id, viewerId);
        if (inc) {
          relationship = 'pending_in';
          incomingRequestId = inc.id;
        }
      }
    }
    return {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      nickname: u.nickname,
      createdAt: u.createdAt,
      avatarUrl: u.avatarUrl,
      affiliationEmoji: u.affiliationEmoji,
      relationship,
      incomingRequestId,
    };
  });
}

/** Друзья для выбора при создании комнаты. */
export function listFriendPeersForUser(viewerId) {
  const peerIds = listPeerUserIds(viewerId);
  if (peerIds.length === 0) return [];
  const ph = peerIds.map(() => '?').join(',');
  const rows = getDb()
    .prepare(
      `SELECT id, nickname, first_name AS firstName, last_name AS lastName, avatar_path AS avatarPath,
        display_role AS displayRole, display_role_emoji AS displayRoleEmoji
       FROM users WHERE id IN (${ph}) ORDER BY nickname`
    )
    .all(...peerIds);
  return rows.map((r) => ({
    id: r.id,
    nickname: r.nickname,
    firstName: r.firstName,
    lastName: r.lastName,
    avatarUrl: r.avatarPath ? `/uploads/${r.avatarPath}` : null,
    affiliationEmoji: effectiveAffiliationEmoji(r.nickname, r.displayRole, r.displayRoleEmoji),
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
      `SELECT u.id, u.nickname, u.first_name AS firstName, u.last_name AS lastName, u.avatar_path AS avatarPath,
        u.display_role AS displayRole, u.display_role_emoji AS displayRoleEmoji, rm.role
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
      affiliationEmoji: effectiveAffiliationEmoji(m.nickname, m.displayRole, m.displayRoleEmoji),
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
        m.created_at AS createdAt, m.edited_at AS editedAt, m.revoked_for_all AS revokedForAll,
        m.reply_to_id AS replyToIdRaw, m.forward_json AS forwardJson,
        u.nickname AS senderNickname, u.display_role AS senderStoredRole, u.display_role_emoji AS senderEmoji,
        m.ref_story_id AS refStoryId, m.story_reaction_key AS storyReactionKey,
        rs.media_path AS refStoryMediaPath,
        rp.id AS replyRefId, rp.revoked_for_all AS replyParentRevoked,
        ru.nickname AS replyToSenderNick, rp.body AS replyToBodyRaw, rp.kind AS replyToKindRaw
       FROM room_messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN stories rs ON rs.id = m.ref_story_id
       LEFT JOIN room_messages rp ON rp.id = m.reply_to_id AND rp.room_id = m.room_id
       LEFT JOIN users ru ON ru.id = rp.sender_id
       WHERE m.room_id = ?
       AND NOT EXISTS (SELECT 1 FROM room_message_hide h WHERE h.message_id = m.id AND h.user_id = ?)
       ORDER BY m.created_at ASC
       LIMIT ?`
    )
    .all(roomId, userId, limit);
  const ids = rows.map((r) => r.id);
  const getReact = loadReactionSummaryForMessages(ids, userId);
  return rows.map((r) => mapMessageRow(r, getReact));
}

export function getMessageByIdForRoom(roomId, messageId, viewerId = null) {
  let sql = `SELECT m.id, m.sender_id AS senderId, m.body, m.kind, m.media_path AS mediaPath, m.duration_ms AS durationMs,
        m.created_at AS createdAt, m.edited_at AS editedAt, m.revoked_for_all AS revokedForAll,
        m.reply_to_id AS replyToIdRaw, m.forward_json AS forwardJson,
        u.nickname AS senderNickname, u.display_role AS senderStoredRole, u.display_role_emoji AS senderEmoji,
        m.ref_story_id AS refStoryId, m.story_reaction_key AS storyReactionKey,
        rs.media_path AS refStoryMediaPath,
        rp.id AS replyRefId, rp.revoked_for_all AS replyParentRevoked,
        ru.nickname AS replyToSenderNick, rp.body AS replyToBodyRaw, rp.kind AS replyToKindRaw
       FROM room_messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN stories rs ON rs.id = m.ref_story_id
       LEFT JOIN room_messages rp ON rp.id = m.reply_to_id AND rp.room_id = m.room_id
       LEFT JOIN users ru ON ru.id = rp.sender_id
       WHERE m.room_id = ? AND m.id = ?`;
  const params = [roomId, messageId];
  if (viewerId != null) {
    sql += ` AND NOT EXISTS (SELECT 1 FROM room_message_hide h WHERE h.message_id = m.id AND h.user_id = ?)`;
    params.push(viewerId);
  }
  const row = getDb().prepare(sql).get(...params);
  if (!row) return null;
  const getReact = viewerId != null ? loadReactionSummaryForMessages([row.id], viewerId) : null;
  return mapMessageRow(row, getReact);
}

export function insertRoomMessage(roomId, userId, body, options = {}) {
  const trimmed = String(body ?? '').trim();
  if (!trimmed) return { error: 'Пустое сообщение' };
  if (trimmed.length > 4000) return { error: 'Сообщение не длиннее 4000 символов' };
  if (!userInRoom(roomId, userId)) return { error: 'Нет доступа к комнате' };

  let replyToId = null;
  if (options.replyToId != null && String(options.replyToId).trim()) {
    replyToId = String(options.replyToId).trim();
    const rp = getDb()
      .prepare(`SELECT id FROM room_messages WHERE id = ? AND room_id = ? AND COALESCE(revoked_for_all,0) = 0`)
      .get(replyToId, roomId);
    if (!rp) return { error: 'Ответ: исходное сообщение не найдено' };
  }

  const id = randomUUID();
  const createdAt = Date.now();
  getDb()
    .prepare(
      `INSERT INTO room_messages (id, room_id, sender_id, body, created_at, kind, reply_to_id) VALUES (?, ?, ?, ?, ?, 'text', ?)`
    )
    .run(id, roomId, userId, trimmed, createdAt, replyToId);

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

export function updateRoomMessage(roomId, userId, messageId, body) {
  const trimmed = String(body ?? '').trim();
  if (!trimmed) return { error: 'Пустое сообщение' };
  if (trimmed.length > 4000) return { error: 'Сообщение не длиннее 4000 символов' };
  if (!userInRoom(roomId, userId)) return { error: 'Нет доступа к комнате' };
  const row = getDb()
    .prepare(
      `SELECT sender_id AS senderId, kind, revoked_for_all AS revoked FROM room_messages WHERE id = ? AND room_id = ?`
    )
    .get(messageId, roomId);
  if (!row) return { error: 'Сообщение не найдено' };
  if (String(row.senderId) !== String(userId)) return { error: 'Можно изменить только свои сообщения' };
  if (row.revoked === 1) return { error: 'Сообщение удалено' };
  if ((row.kind || 'text') !== 'text') return { error: 'Можно изменить только текст' };
  const editedAt = Date.now();
  getDb()
    .prepare(`UPDATE room_messages SET body = ?, edited_at = ? WHERE id = ? AND room_id = ?`)
    .run(trimmed, editedAt, messageId, roomId);
  return { ok: true, memberIds: listRoomMemberUserIds(roomId) };
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

export function hideRoomMessageForViewer(roomId, viewerId, messageId) {
  if (!userInRoom(roomId, viewerId)) return { error: 'Нет доступа к комнате' };
  const row = getDb().prepare(`SELECT id FROM room_messages WHERE id = ? AND room_id = ?`).get(messageId, roomId);
  if (!row) return { error: 'Сообщение не найдено' };
  getDb().prepare(`INSERT OR IGNORE INTO room_message_hide (message_id, user_id) VALUES (?, ?)`).run(messageId, viewerId);
  return { ok: true, memberIds: listRoomMemberUserIds(roomId) };
}

export function revokeRoomMessageForEveryone(roomId, userId, messageId) {
  if (!userInRoom(roomId, userId)) return { error: 'Нет доступа к комнате' };
  const row = getDb()
    .prepare(`SELECT sender_id AS senderId, revoked_for_all AS r FROM room_messages WHERE id = ? AND room_id = ?`)
    .get(messageId, roomId);
  if (!row) return { error: 'Сообщение не найдено' };
  if (row.r === 1) return { error: 'Уже удалено' };
  if (String(row.senderId) !== String(userId)) return { error: 'Можно удалить только свои сообщения' };
  getDb()
    .prepare(
      `UPDATE room_messages SET revoked_for_all = 1, body = '', media_path = NULL, ref_story_id = NULL, story_reaction_key = NULL WHERE id = ?`
    )
    .run(messageId);
  getDb().prepare(`DELETE FROM message_reactions WHERE message_id = ?`).run(messageId);
  return { ok: true, memberIds: listRoomMemberUserIds(roomId) };
}

export function toggleRoomMessageReaction(roomId, userId, messageId, reactionKey) {
  if (!MESSAGE_REACTION_KEYS.includes(reactionKey)) {
    return { error: 'Неизвестная реакция' };
  }
  if (!userInRoom(roomId, userId)) return { error: 'Нет доступа к комнате' };
  const msg = getDb()
    .prepare(`SELECT id, revoked_for_all AS r FROM room_messages WHERE id = ? AND room_id = ?`)
    .get(messageId, roomId);
  if (!msg) return { error: 'Сообщение не найдено' };
  if (msg.r === 1) return { error: 'Сообщение удалено' };

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

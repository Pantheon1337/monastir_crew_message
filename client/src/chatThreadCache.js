/**
 * Последние сообщения личного чата / комнаты — показ сразу при входе, затем актуализация с сервера.
 * Картинки в сообщениях кэшируются браузером по URL (/uploads/...).
 */

const PREFIX = 'mcm_thread_v1_';
const MAX_BYTES = 2_000_000;

function keyDirect(userId, chatId) {
  return `${PREFIX}${userId}_d_${chatId}`;
}

function keyRoom(userId, roomId) {
  return `${PREFIX}${userId}_r_${roomId}`;
}

export function loadDirectThreadCache(userId, chatId) {
  if (!userId || !chatId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(keyDirect(userId, chatId));
    if (!raw) return null;
    const o = JSON.parse(raw);
    return Array.isArray(o?.messages) ? o.messages : null;
  } catch {
    return null;
  }
}

export function saveDirectThreadCache(userId, chatId, messages) {
  if (!userId || !chatId || !Array.isArray(messages) || typeof localStorage === 'undefined') return;
  try {
    const payload = JSON.stringify({ messages, savedAt: Date.now() });
    if (payload.length > MAX_BYTES) return;
    localStorage.setItem(keyDirect(userId, chatId), payload);
  } catch {
    /* */
  }
}

export function loadRoomThreadCache(userId, roomId) {
  if (!userId || !roomId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(keyRoom(userId, roomId));
    if (!raw) return null;
    const o = JSON.parse(raw);
    return Array.isArray(o?.messages) ? o.messages : null;
  } catch {
    return null;
  }
}

export function saveRoomThreadCache(userId, roomId, messages) {
  if (!userId || !roomId || !Array.isArray(messages) || typeof localStorage === 'undefined') return;
  try {
    const payload = JSON.stringify({ messages, savedAt: Date.now() });
    if (payload.length > MAX_BYTES) return;
    localStorage.setItem(keyRoom(userId, roomId), payload);
  } catch {
    /* */
  }
}

export function clearChatCachesForUser(userId) {
  if (!userId || typeof localStorage === 'undefined') return;
  const p = `${PREFIX}${userId}_`;
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(p)) toRemove.push(k);
  }
  for (const k of toRemove) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* */
    }
  }
}

/**
 * Кэш основного экрана (лента, чаты, комнаты, истории) в localStorage —
 * при следующем открытии данные показываются сразу, затем подменяются ответом сервера.
 */
import { clearChatCachesForUser } from './chatThreadCache.js';

const PREFIX = 'ruscord_crew_app_v1_';
const MAX_BYTES = 4_500_000;

export function loadAppDataCache(userId) {
  if (!userId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${PREFIX}${userId}`);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    return o;
  } catch {
    return null;
  }
}

export function saveAppDataCache(userId, snapshot) {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    const payload = JSON.stringify({ ...snapshot, savedAt: Date.now() });
    if (payload.length > MAX_BYTES) return;
    localStorage.setItem(`${PREFIX}${userId}`, payload);
  } catch {
    /* квота или приватный режим */
  }
}

export function clearAppDataCache(userId) {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(`${PREFIX}${userId}`);
  } catch {
    /* */
  }
  clearChatCachesForUser(userId);
}

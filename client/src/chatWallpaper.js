import { mediaPublicUrl } from './api.js';

const PREFIX = 'chatWallpaper';

/** Фрагмент для CSS background-image: корректный url("…") при пробелах, скобках и т.д. в пути */
export function cssUrlForBackground(href) {
  if (href == null || href === '') return 'none';
  const s = String(href);
  return `url("${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
}

export function getChatWallpaperRelPath(userId) {
  if (userId == null || typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(`${PREFIX}:${userId}`);
  if (!raw || raw === 'default') return null;
  return raw;
}

/** relPath от корня uploads, например fon_chat/photo.jpg */
export function setChatWallpaperRelPath(userId, relPath) {
  if (userId == null || typeof localStorage === 'undefined') return;
  const k = `${PREFIX}:${userId}`;
  if (!relPath) localStorage.removeItem(k);
  else localStorage.setItem(k, relPath);
  try {
    window.dispatchEvent(new CustomEvent('chatWallpaperChanged'));
  } catch {
    /* ignore */
  }
}

/** Стили для .chat-scaffold-timeline при пользовательском фоне */
export function getChatWallpaperTimelineStyle(userId) {
  const rel = getChatWallpaperRelPath(userId);
  if (!rel) return undefined;
  const path = `/uploads/${rel.split('/').map(encodeURIComponent).join('/')}`;
  const url = mediaPublicUrl(path);
  return {
    backgroundColor: 'var(--chat-timeline-bg)',
    backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), ${cssUrlForBackground(url)}`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}

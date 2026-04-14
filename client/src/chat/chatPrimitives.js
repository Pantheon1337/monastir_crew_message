/** Общие константы и утилиты экранов чата (Direct + Room). */

export const POST_LOAD_STICK_MS = 320;

/** Лента: flex-колонка снизу вверх, интервал между сообщениями */
export const CHAT_TIMELINE_STACK_STYLE = {
  flex: '1 1 auto',
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  boxSizing: 'border-box',
  gap: 12,
};

export function formatChatMessageTime(ts) {
  if (ts == null) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function looksLikeVideoFileName(name) {
  if (!name || typeof name !== 'string') return false;
  return /\.(mp4|webm|mov|m4v|mkv|ogv)$/i.test(name.trim());
}

export function getCopyTextForMessage(m) {
  const k = m.kind || 'text';
  if (k === 'revoked') return 'Сообщение удалено';
  if (k === 'text') return m.body || '';
  if (k === 'voice') return 'Голосовое сообщение';
  if (k === 'video_note') return 'Видеосообщение';
  if (k === 'image') return m.body?.trim() ? `Фото: ${m.body}` : 'Фото';
  if (k === 'file') return m.body?.trim() ? `Файл: ${m.body}` : 'Файл';
  if (k === 'story_reaction') return m.body || 'Реакция на историю';
  if (k === 'sticker') return m.body?.trim() ? `Стикер ${m.body}` : 'Стикер';
  return m.body || '';
}

/** Единый формат сообщения с API / WS */
export function normalizeChatMessage(m) {
  if (!m || typeof m !== 'object') return m;
  const durationMs = m.durationMs != null ? m.durationMs : m.duration_ms ?? null;
  const rawPath = m.media_path ?? m.mediaPath;
  let mediaUrl = m.mediaUrl;
  if (!mediaUrl && rawPath) {
    const p = String(rawPath).replace(/^\/+/, '');
    mediaUrl = p.startsWith('uploads/') ? `/${p}` : `/uploads/${p}`;
  }
  if (mediaUrl && typeof window !== 'undefined' && !/^https?:\/\//i.test(String(mediaUrl))) {
    try {
      mediaUrl = new URL(String(mediaUrl), window.location.origin).href;
    } catch {
      /* */
    }
  }
  const kind = m.kind || 'text';
  let refStoryPreviewUrl = m.refStoryPreviewUrl;
  if (refStoryPreviewUrl && typeof window !== 'undefined' && !/^https?:\/\//i.test(String(refStoryPreviewUrl))) {
    try {
      refStoryPreviewUrl = new URL(String(refStoryPreviewUrl), window.location.origin).href;
    } catch {
      /* */
    }
  }
  return {
    ...m,
    kind,
    mediaUrl: mediaUrl ?? null,
    durationMs,
    refStoryId: m.refStoryId ?? null,
    refStoryPreviewUrl: refStoryPreviewUrl ?? null,
    storyReactionKey: m.storyReactionKey ?? null,
    reactions: m.reactions ?? null,
    readByPeer: m.readByPeer === true,
    deliveredToPeer: m.readByPeer === true || m.deliveredToPeer !== false,
    pending: m.pending === true,
    senderAffiliationEmoji: m.senderAffiliationEmoji ?? null,
    revokedForAll: m.revokedForAll === true,
    replyTo: m.replyTo ?? null,
    forwardFrom: m.forwardFrom ?? null,
    editedAt: m.editedAt != null ? m.editedAt : null,
    pinnedForMe: m.pinnedForMe === true,
    pinnedShared: m.pinnedShared === true,
  };
}

/** Позиция контекст-меню у сообщения */
export function clampChatMenuPosition(x, y, w, h, opts = {}) {
  const gapX = opts.gapX ?? 32;
  const gapY = opts.gapY ?? 22;
  if (typeof window === 'undefined') return { left: x - w - gapX, top: y - h - gapY };
  const vv = window.visualViewport;
  if (!vv) {
    const left = Math.max(8, Math.min(x - w - gapX, window.innerWidth - w - 8));
    const top = Math.max(8, Math.min(y - h - gapY, window.innerHeight - h - 8));
    return { left, top };
  }
  const ox = vv.offsetLeft;
  const oy = vv.offsetTop;
  const vw = vv.width;
  const vh = vv.height;
  const left = Math.max(ox + 8, Math.min(x - w - gapX, ox + vw - w - 8));
  let top = y - h - gapY;
  if (top < oy + 8) top = y + gapY;
  return { left, top: Math.max(oy + 8, Math.min(top, oy + vh - h - 8)) };
}

export function pinChipPreview(m) {
  const k = m.kind || 'text';
  if (k === 'voice') return '🎤 Голосовое';
  if (k === 'video_note') return '🎬 Видео';
  if (k === 'image') return '🖼 Фото';
  if (k === 'file') return '📎 Файл';
  if (k === 'story_reaction') return 'История';
  return (m.body || '').trim().slice(0, 36) || '…';
}

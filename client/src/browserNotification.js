/** Обёртка над Notification API (новые сообщения, заявки в друзья). */

export function isNotificationApiAvailable() {
  return typeof Notification !== 'undefined';
}

export async function requestNotificationPermission() {
  if (!isNotificationApiAvailable()) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function showBrowserNotification(title, body, { tag } = {}) {
  if (!isNotificationApiAvailable() || Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body: body || '',
      tag: tag || title,
      icon: '/favicon.svg',
    });
  } catch {
    /* ignore */
  }
}

export function previewTextForChatMessage(m) {
  if (!m) return 'Новое сообщение';
  const k = m.kind || 'text';
  if (k === 'text') {
    const t = (m.body || '').trim();
    return t ? (t.length > 140 ? `${t.slice(0, 137)}…` : t) : 'Новое сообщение';
  }
  if (k === 'voice') return '🎤 Голосовое сообщение';
  if (k === 'video_note') return '🎬 Видеосообщение';
  if (k === 'image') return m.body?.trim() ? `🖼 ${m.body}` : '🖼 Фото';
  if (k === 'file') return m.body?.trim() ? `📎 ${m.body}` : '📎 Файл';
  if (k === 'story_reaction') return m.body?.trim() || 'Реакция на историю';
  return 'Новое сообщение';
}

/** Подпись «онлайн / был(а) в сети …» для шапки чата и мини-профиля. */

export function formatRuSeenAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 60_000) return 'только что';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(diff / 3_600_000);
  const minsRem = Math.floor((diff % 3_600_000) / 60_000);
  if (diff < 86_400_000) {
    if (minsRem < 2) return `${hours} ч назад`;
    return `${hours} ч ${minsRem} мин назад`;
  }
  try {
    return new Date(ts).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'давно';
  }
}

export function peerPresenceSubtitle(online, lastSeenAt, lastSeenHidden) {
  if (online === true) return 'онлайн';
  if (lastSeenHidden) return 'был(а) недавно';
  if (online === false && typeof lastSeenAt === 'number' && lastSeenAt > 0) {
    return `был(а) в сети · ${formatRuSeenAgo(lastSeenAt)}`;
  }
  if (online === false) return 'не в сети';
  return null;
}

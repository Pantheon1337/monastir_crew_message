/**
 * Ключи реакций (как в Telegram) + лимит на пользователя.
 * Должно совпадать с server/social.js MESSAGE_REACTION_KEYS
 */
export const REACTION_KEYS = ['like', 'heart', 'lol', 'fire', 'party', 'wow', 'sad', 'pray', 'down', 'hundred'];

export const REACTION_ICONS = {
  like: '👍',
  heart: '❤️',
  lol: '😂',
  fire: '🔥',
  party: '🎉',
  wow: '😮',
  sad: '😢',
  pray: '🙏',
  down: '👎',
  hundred: '💯',
};

/** Не больше столько реакций одним пользователем на пост/сообщение */
export const MAX_REACTIONS_PER_USER = 3;

export function emptyReactionCounts() {
  return Object.fromEntries(REACTION_KEYS.map((k) => [k, 0]));
}

/** Сервер может отдать mine строкой (старое) или массивом */
export function normalizeReactionMine(raw) {
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/** Фоны шапки профиля (как в Telegram — приглушённые градиенты). Индекс 0…LENGTH-1. */
export const PROFILE_HERO_TINTS = [
  { label: 'Тёмный', bg: 'linear-gradient(180deg, #25252c 0%, #16161b 100%)' },
  { label: 'Синий', bg: 'linear-gradient(180deg, #2c3848 0%, #1e2835 100%)' },
  { label: 'Бирюза', bg: 'linear-gradient(180deg, #243d3d 0%, #1a2e2e 100%)' },
  { label: 'Тёплый', bg: 'linear-gradient(180deg, #3d362e 0%, #262018 100%)' },
  { label: 'Пурпур', bg: 'linear-gradient(180deg, #332d3d 0%, #221a2a 100%)' },
  { label: 'Оливковый', bg: 'linear-gradient(180deg, #2d3228 0%, #1a1e16 100%)' },
  { label: 'Индиго', bg: 'linear-gradient(180deg, #2a2d42 0%, #1a1c2e 100%)' },
  { label: 'Океан', bg: 'linear-gradient(180deg, #1e3538 0%, #152428 100%)' },
  { label: 'Розовый', bg: 'linear-gradient(180deg, #3d2c34 0%, #261a20 100%)' },
  { label: 'Янтарь', bg: 'linear-gradient(180deg, #3d3426 0%, #282018 100%)' },
];

/** Макс. допустимый индекс (синхронизировать с сервером). */
export const PROFILE_HERO_TINT_MAX_INDEX = PROFILE_HERO_TINTS.length - 1;

/** Смайлик флага РФ из списка принадлежности — под него показываем триколор. */
export const RUSSIAN_FLAG_AFFILIATION_EMOJI = '🇷🇺';

/**
 * Приглушённый триколор (полосы сверху вниз: белый / синий / красный), чтобы светлый текст шапки читался.
 */
export const PROFILE_HERO_RUSSIA_BG =
  'linear-gradient(180deg, #4a5568 0%, #4a5568 33.33%, #15428c 33.33%, #15428c 66.66%, #a32121 66.66%, #a32121 100%)';

export function clampProfileHeroTint(i) {
  const n = Number(i);
  if (!Number.isFinite(n)) return 0;
  return Math.min(PROFILE_HERO_TINTS.length - 1, Math.max(0, Math.floor(n)));
}

export function profileHeroTintBg(index) {
  return PROFILE_HERO_TINTS[clampProfileHeroTint(index)]?.bg ?? PROFILE_HERO_TINTS[0].bg;
}

export function isRussianFlagAffiliationEmoji(affiliationEmoji) {
  if (affiliationEmoji == null || typeof affiliationEmoji !== 'string') return false;
  return affiliationEmoji.trim() === RUSSIAN_FLAG_AFFILIATION_EMOJI;
}

/**
 * Фон шапки профиля: при смайлике 🇷🇺 — триколор; иначе — выбранный градиент.
 */
export function profileHeroBackground(profileHeroTint, affiliationEmoji) {
  if (isRussianFlagAffiliationEmoji(affiliationEmoji)) {
    return PROFILE_HERO_RUSSIA_BG;
  }
  return profileHeroTintBg(profileHeroTint);
}

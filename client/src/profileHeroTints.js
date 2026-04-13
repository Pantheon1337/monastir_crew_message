/** Фоны шапки профиля (как в Telegram — приглушённые градиенты). Индекс 0…LENGTH-1. */
export const PROFILE_HERO_TINTS = [
  { label: 'Тёмный', bg: 'linear-gradient(180deg, #25252c 0%, #16161b 100%)' },
  { label: 'Синий', bg: 'linear-gradient(180deg, #2c3848 0%, #1e2835 100%)' },
  { label: 'Бирюза', bg: 'linear-gradient(180deg, #243d3d 0%, #1a2e2e 100%)' },
  { label: 'Тёплый', bg: 'linear-gradient(180deg, #3d362e 0%, #262018 100%)' },
  { label: 'Пурпур', bg: 'linear-gradient(180deg, #332d3d 0%, #221a2a 100%)' },
];

export function clampProfileHeroTint(i) {
  const n = Number(i);
  if (!Number.isFinite(n)) return 0;
  return Math.min(PROFILE_HERO_TINTS.length - 1, Math.max(0, Math.floor(n)));
}

export function profileHeroTintBg(index) {
  return PROFILE_HERO_TINTS[clampProfileHeroTint(index)]?.bg ?? PROFILE_HERO_TINTS[0].bg;
}

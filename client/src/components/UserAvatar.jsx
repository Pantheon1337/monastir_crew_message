import { AVATAR_PLACEHOLDER_SRC } from '../avatarPlaceholder.js';

/**
 * Аватар пользователя или общая заглушка из public, если нет своего фото.
 * @param {string | null | undefined} src
 * @param {number} [size] — пиксели (квадрат), если не задано — задайте width/height через style
 * @param {boolean} [borderless] — без обводки (напр. внутри кольца историй)
 */
export default function UserAvatar({ src, size, style, className, borderless = false }) {
  const resolved =
    src != null && String(src).trim() !== '' ? String(src).trim() : AVATAR_PLACEHOLDER_SRC;
  const dim = typeof size === 'number' ? { width: size, height: size } : {};
  return (
    <img
      className={className}
      src={resolved}
      alt=""
      style={{
        borderRadius: '50%',
        objectFit: 'cover',
        flexShrink: 0,
        display: 'block',
        border: borderless ? 'none' : '1px solid var(--border)',
        ...dim,
        ...style,
      }}
    />
  );
}

import { AVATAR_PLACEHOLDER_SRC } from '../avatarPlaceholder.js';

/**
 * Аватар пользователя или общая заглушка из public, если нет своего фото.
 * @param {string | null | undefined} src
 * @param {number} [size] — пиксели (квадрат), если не задано — задайте width/height через style
 * @param {boolean} [borderless] — без обводки (напр. внутри кольца историй)
 * @param {boolean} [presenceOnline] — если задано: зелёный/серый индикатор (сессия в приложении)
 */
export default function UserAvatar({ src, size, style, className, borderless = false, presenceOnline }) {
  const resolved =
    src != null && String(src).trim() !== '' ? String(src).trim() : AVATAR_PLACEHOLDER_SRC;
  const dim = typeof size === 'number' ? { width: size, height: size } : {};
  const img = (
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
  if (typeof presenceOnline !== 'boolean') return img;
  return (
    <span style={{ position: 'relative', display: 'inline-block', flexShrink: 0, lineHeight: 0 }}>
      {img}
      <span
        aria-hidden
        title={presenceOnline ? 'в сети' : 'не в сети'}
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 11,
          height: 11,
          borderRadius: '50%',
          background: presenceOnline ? 'var(--online)' : 'rgba(160, 160, 170, 0.85)',
          border: '2px solid var(--bg)',
          boxSizing: 'border-box',
        }}
      />
    </span>
  );
}

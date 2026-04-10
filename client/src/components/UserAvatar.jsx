import { AVATAR_PLACEHOLDER_SRC } from '../avatarPlaceholder.js';

/**
 * Аватар пользователя или общая заглушка из public, если нет своего фото.
 * @param {string | null | undefined} src
 * @param {number} [size] — пиксели (квадрат), если не задано — задайте width/height через style
 * @param {boolean} [borderless] — без обводки (напр. внутри кольца историй)
 * @param {boolean} [presenceOnline] — если задано: зелёный/серый индикатор (сессия в приложении)
 * @param {() => void} [onOpen] — открыть крупно (лайтбокс)
 */
export default function UserAvatar({
  src,
  size,
  style,
  className,
  borderless = false,
  presenceOnline,
  onOpen,
  ariaLabel = 'Просмотр аватара',
}) {
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

  const withPresence =
    typeof presenceOnline === 'boolean' ? (
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
    ) : (
      img
    );

  if (typeof onOpen === 'function') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        aria-label={ariaLabel}
        style={{
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          lineHeight: 0,
          display: 'inline-block',
          flexShrink: 0,
        }}
      >
        {withPresence}
      </button>
    );
  }

  return withPresence;
}

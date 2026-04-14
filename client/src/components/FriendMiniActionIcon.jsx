import { useState } from 'react';

const FILES = {
  chat: 'message.png',
  media: 'media.png',
  profile: 'profile.png',
};

function friendMiniIconCacheVer() {
  const env = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_FRIEND_MINI_ICONS;
  if (env !== undefined && env !== null && String(env).trim() !== '') return String(env).trim();
  return '1';
}

const FALLBACK = { chat: '💬', media: '🖼', profile: '👤' };

/**
 * Иконки кнопок «Чат / Медиа / Профиль» в шапке мини-карточки: public/chat-composer/message.png, media.png, profile.png
 */
export default function FriendMiniActionIcon({ kind, size = 16, style, ...rest }) {
  const [broken, setBroken] = useState(false);
  const file = FILES[kind];
  if (!file) return null;
  const v = friendMiniIconCacheVer();
  const src = `/chat-composer/${file}?v=${encodeURIComponent(v)}`;

  if (broken) {
    return (
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          fontSize: Math.round(size * 0.95),
          lineHeight: 1,
          ...style,
        }}
        {...rest}
      >
        {FALLBACK[kind] ?? '•'}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      style={{
        display: 'block',
        objectFit: 'contain',
        flexShrink: 0,
        ...style,
      }}
      {...rest}
    />
  );
}

import { useState } from 'react';

/** Имена файлов в public/chat-composer/ (как на сервере: file.png, sticker.png, …). */
const CHAT_COMPOSER_FILE = {
  attach: 'file.png',
  stickers: 'sticker.png',
  video: 'video.png',
  mic: 'mic.png',
};

/**
 * Версия в URL сбрасывает кэш PNG. По умолчанию 1; при замене иконок задайте VITE_CHAT_COMPOSER_ICONS=2 в client/.env или поменяйте число по умолчанию ниже.
 */
function chatComposerIconCacheVer() {
  const env = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_CHAT_COMPOSER_ICONS;
  if (env !== undefined && env !== null && String(env).trim() !== '') return String(env).trim();
  return '2';
}

/**
 * Иконка из /chat-composer/*.png; при отсутствии файла — запасной символ.
 * name: attach | stickers | video | mic
 */
export default function ChatComposerIcon({ name, fallback, alt = '', size = 22, style, ...rest }) {
  const [broken, setBroken] = useState(false);
  const file = CHAT_COMPOSER_FILE[name] || `icon-${name}.png`;
  const v = chatComposerIconCacheVer();
  const src = `/chat-composer/${file}?v=${encodeURIComponent(v)}`;

  if (broken) {
    return (
      <span
        aria-hidden={!alt}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          fontSize: Math.round(size * 0.82),
          lineHeight: 1,
          ...style,
        }}
        {...rest}
      >
        {fallback}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
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
        pointerEvents: 'none',
        ...style,
      }}
      {...rest}
    />
  );
}

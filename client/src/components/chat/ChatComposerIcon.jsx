import { useState } from 'react';

/**
 * Иконка из /chat-composer/icon-{name}.png; при отсутствии файла — запасной символ.
 * name: attach | stickers | video | mic
 */
export default function ChatComposerIcon({ name, fallback, alt = '', size = 22, style, ...rest }) {
  const [broken, setBroken] = useState(false);
  const src = `/chat-composer/icon-${name}.png`;

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

import { useEffect, useState } from 'react';

/**
 * Синхронизация с window.visualViewport (аналог WindowInsets + imePadding в мобильных клиентах).
 * Паттерн как в Element X: область чата совпадает с видимым viewport при открытой клавиатуре.
 *
 * @param {() => void} [onLayout] — после обновления прямоугольника (скролл таймлайна и т.д.).
 */
function pickVvSize(vv) {
  let w = vv.width;
  let h = vv.height;
  if (typeof window !== 'undefined' && (w < 32 || h < 32)) {
    w = window.innerWidth;
    h = window.innerHeight;
  }
  return { width: w, height: h };
}

export function useVisualViewportRect(onLayout) {
  const [vvRect, setVvRect] = useState(() =>
    typeof window !== 'undefined' && window.visualViewport
      ? (() => {
          const vv = window.visualViewport;
          const { width, height } = pickVvSize(vv);
          return {
            top: vv.offsetTop,
            left: vv.offsetLeft,
            width,
            height,
          };
        })()
      : null,
  );

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined;

    const sync = () => {
      const { width, height } = pickVvSize(vv);
      setVvRect({
        top: vv.offsetTop,
        left: vv.offsetLeft,
        width,
        height,
      });
      onLayout?.();
    };

    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, [onLayout]);

  return vvRect;
}

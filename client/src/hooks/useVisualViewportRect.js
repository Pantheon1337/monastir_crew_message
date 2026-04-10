import { useEffect, useState } from 'react';

/**
 * Синхронизация с window.visualViewport (аналог WindowInsets + imePadding в мобильных клиентах).
 * Паттерн как в Element X: область чата совпадает с видимым viewport при открытой клавиатуре.
 *
 * @param {() => void} [onLayout] — после обновления прямоугольника (скролл таймлайна и т.д.).
 */
export function useVisualViewportRect(onLayout) {
  const [vvRect, setVvRect] = useState(() =>
    typeof window !== 'undefined' && window.visualViewport
      ? {
          top: window.visualViewport.offsetTop,
          left: window.visualViewport.offsetLeft,
          width: window.visualViewport.width,
          height: window.visualViewport.height,
        }
      : null,
  );

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined;

    const sync = () => {
      setVvRect({
        top: vv.offsetTop,
        left: vv.offsetLeft,
        width: vv.width,
        height: vv.height,
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

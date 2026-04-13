import { useEffect, useRef, useState } from 'react';

const EPS = 0.75;

function rectsMeaningfullyEqual(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return (
    Math.abs(a.top - b.top) <= EPS &&
    Math.abs(a.left - b.left) <= EPS &&
    Math.abs(a.width - b.width) <= EPS &&
    Math.abs(a.height - b.height) <= EPS
  );
}

/**
 * Синхронизация с window.visualViewport (как WindowInsets + IME в нативных клиентах).
 * Сравниваем прямоугольник с ε: на мобильных VV шлёт resize/scroll очень часто — иначе каждый тик
 * перерисовывает весь экран чата (дерганье). Паттерн близок к Element Web / Matrix React SDK.
 *
 * @param {() => void} [onLayout] — когда прямоугольник реально изменился (подкрутка ленты к низу и т.д.).
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

  const lastEmittedRef = useRef(vvRect);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined;

    const syncAndLayout = () => {
      const next = {
        top: vv.offsetTop,
        left: vv.offsetLeft,
        width: vv.width,
        height: vv.height,
      };
      if (rectsMeaningfullyEqual(lastEmittedRef.current, next)) return;
      lastEmittedRef.current = next;
      setVvRect(next);
      onLayout?.();
    };

    syncAndLayout();
    vv.addEventListener('resize', syncAndLayout);
    vv.addEventListener('scroll', syncAndLayout);
    window.addEventListener('orientationchange', syncAndLayout);
    return () => {
      vv.removeEventListener('resize', syncAndLayout);
      vv.removeEventListener('scroll', syncAndLayout);
      window.removeEventListener('orientationchange', syncAndLayout);
    };
  }, [onLayout]);

  return vvRect;
}

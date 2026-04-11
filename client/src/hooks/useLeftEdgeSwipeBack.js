import { useEffect, useRef } from 'react';

/** Зона от левого края (px): на тач-устройствах удобнее шире, чем узкая полоска. */
const EDGE_PX = 40;
const MIN_DX = 52;

/**
 * Жест «назад» как в Telegram: горизонтальный свайп от левого края экрана.
 * Pointer — для мыши/пера; touch — для iOS/Android (часть браузеров ведёт себя иначе с pointer).
 */
export function useLeftEdgeSwipeBack(onBack, { disabled = false } = {}) {
  const onBackRef = useRef(onBack);
  const disabledRef = useRef(disabled);
  onBackRef.current = onBack;
  disabledRef.current = disabled;

  useEffect(() => {
    if (typeof onBackRef.current !== 'function') return undefined;

    let start = null;
    let lastBackAt = 0;

    const fire = () => {
      const now = Date.now();
      if (now - lastBackAt < 420) return;
      lastBackAt = now;
      const fn = onBackRef.current;
      if (typeof fn === 'function') fn();
    };

    const maybeTrigger = (dx, dy) => {
      if (disabledRef.current) return;
      if (dx > MIN_DX && dx > Math.abs(dy) * 0.55) fire();
    };

    const onPointerDown = (e) => {
      if (disabledRef.current) return;
      if (e.pointerType === 'touch') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.clientX > EDGE_PX) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, kind: 'pointer' };
    };

    const onPointerUp = (e) => {
      if (e.pointerType === 'touch') return;
      if (!start || start.kind !== 'pointer') return;
      if (e.pointerId !== start.id) {
        start = null;
        return;
      }
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      maybeTrigger(dx, dy);
    };

    const onPointerCancel = () => {
      if (start?.kind === 'pointer') start = null;
    };

    const onTouchStart = (e) => {
      if (disabledRef.current) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX > EDGE_PX) return;
      start = { x: t.clientX, y: t.clientY, id: t.identifier, kind: 'touch' };
    };

    const onTouchEnd = (e) => {
      if (!start || start.kind !== 'touch') return;
      const touch = [...e.changedTouches].find((x) => x.identifier === start.id);
      if (!touch) {
        start = null;
        return;
      }
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      start = null;
      maybeTrigger(dx, dy);
    };

    const onTouchCancel = () => {
      if (start?.kind === 'touch') start = null;
    };

    const root = document.documentElement;
    root.addEventListener('pointerdown', onPointerDown, { capture: true });
    root.addEventListener('pointerup', onPointerUp, { capture: true });
    root.addEventListener('pointercancel', onPointerCancel, { capture: true });
    root.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    root.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    root.addEventListener('touchcancel', onTouchCancel, { capture: true });

    return () => {
      root.removeEventListener('pointerdown', onPointerDown, { capture: true });
      root.removeEventListener('pointerup', onPointerUp, { capture: true });
      root.removeEventListener('pointercancel', onPointerCancel, { capture: true });
      root.removeEventListener('touchstart', onTouchStart, { capture: true });
      root.removeEventListener('touchend', onTouchEnd, { capture: true });
      root.removeEventListener('touchcancel', onTouchCancel, { capture: true });
    };
  }, []);
}

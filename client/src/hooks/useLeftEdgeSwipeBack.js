import { useEffect } from 'react';

const EDGE_PX = 28;
const MIN_DX = 72;

/**
 * Жест «назад» как в Telegram: горизонтальный свайп от левого края экрана.
 */
export function useLeftEdgeSwipeBack(onBack, { disabled = false } = {}) {
  useEffect(() => {
    if (disabled || typeof onBack !== 'function') return undefined;

    let start = null;

    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.clientX > EDGE_PX) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };

    const finish = (e) => {
      if (!start || e.pointerId !== start.id) {
        start = null;
        return;
      }
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (dx > MIN_DX && dx > Math.abs(dy) * 0.55) {
        onBack();
      }
    };

    const onPointerUp = (e) => finish(e);
    const onPointerCancel = () => {
      start = null;
    };

    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('pointerup', onPointerUp, { capture: true });
    window.addEventListener('pointercancel', onPointerCancel, { capture: true });

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('pointerup', onPointerUp, { capture: true });
      window.removeEventListener('pointercancel', onPointerCancel, { capture: true });
    };
  }, [disabled, onBack]);
}

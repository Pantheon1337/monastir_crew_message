import { useState, useRef, useCallback, useEffect } from 'react';

const MAX_DRAG = 72;
const COMMIT_PX = 46;
const AXIS_LOCK_PX = 10;

/**
 * Свайп влево по сообщению → колбэк ответа; пузырь сдвигается и возвращается с анимацией.
 */
export default function SwipeToReplyRow({ children, disabled, onReply }) {
  const [tx, setTx] = useState(0);
  const [smooth, setSmooth] = useState(true);
  const drag = useRef(null);

  const cleanupWindow = useRef(() => {});

  const endGesture = useCallback(
    (clientX, clientY) => {
      cleanupWindow.current();
      cleanupWindow.current = () => {};

      const d = drag.current;
      drag.current = null;

      let fireReply = false;
      if (d && d.mode === 'horizontal' && !disabled) {
        const dx = clientX - d.x0;
        const dy = clientY - d.y0;
        if (dx < -COMMIT_PX && Math.abs(dx) >= Math.abs(dy) * 0.65) {
          fireReply = true;
        }
      }

      setSmooth(true);
      setTx(0);

      if (fireReply) onReply?.();
    },
    [disabled, onReply],
  );

  const onPointerDownCapture = useCallback(
    (e) => {
      if (disabled || e.button !== 0) return;
      setSmooth(false);
      drag.current = {
        x0: e.clientX,
        y0: e.clientY,
        mode: 'undecided',
      };

      const onMove = (ev) => {
        const d0 = drag.current;
        if (!d0) return;
        const dx = ev.clientX - d0.x0;
        const dy = ev.clientY - d0.y0;

        if (d0.mode === 'undecided' && (Math.abs(dx) > AXIS_LOCK_PX || Math.abs(dy) > AXIS_LOCK_PX)) {
          if (Math.abs(dy) > Math.abs(dx) * 1.2) {
            d0.mode = 'vertical';
            cleanupWindow.current();
            cleanupWindow.current = () => {};
            drag.current = null;
            setSmooth(true);
            setTx(0);
            return;
          }
          d0.mode = 'horizontal';
        }
        if (d0.mode === 'vertical') return;
        if (dx >= 0) {
          setTx(0);
          return;
        }
        setTx(Math.max(dx, -MAX_DRAG));
      };

      const onUp = (ev) => {
        endGesture(ev.clientX, ev.clientY);
      };

      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onUp, { passive: true });
      window.addEventListener('pointercancel', onUp, { passive: true });

      cleanupWindow.current = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
    },
    [disabled, endGesture],
  );

  useEffect(() => () => cleanupWindow.current(), []);

  return (
    <div
      style={{
        overflow: 'hidden',
        maxWidth: '100%',
        touchAction: 'pan-y',
      }}
      onPointerDownCapture={onPointerDownCapture}
    >
      <div
        style={{
          transform: `translateX(${tx}px)`,
          transition: smooth ? 'transform 0.22s cubic-bezier(0.25, 0.82, 0.2, 1)' : 'none',
          willChange: smooth ? 'auto' : 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}

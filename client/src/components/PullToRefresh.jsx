import { useRef, useState, useCallback, useEffect } from 'react';

const THRESHOLD = 52;
const MAX_PULL = 84;
const RESISTANCE = 0.42;

/**
 * Потянуть вниз в верхней точке списка — обновить данные (как в ленте мессенджеров).
 * Touch-события вешаются на прокручиваемый узел; горизонтальный жест отдаём свайпам (истории и т.д.).
 */
export default function PullToRefresh({ children, onRefresh, navKey, disabled = false }) {
  const scrollRef = useRef(null);
  const pullRef = useRef(0);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startRef = useRef(null);
  const armedRef = useRef(false);

  const setPullBoth = useCallback((v) => {
    const x = Math.max(0, v);
    pullRef.current = x;
    setPull(x);
  }, []);

  const touchStart = useCallback(
    (e) => {
      if (disabled || refreshing) return;
      const el = scrollRef.current;
      if (!el || el.scrollTop > 2) {
        armedRef.current = false;
        return;
      }
      const t = e.touches[0];
      if (!t) return;
      startRef.current = { x: t.clientX, y: t.clientY };
      armedRef.current = true;
    },
    [disabled, refreshing],
  );

  const touchMove = useCallback(
    (e) => {
      if (disabled || !armedRef.current || refreshing) return;
      const el = scrollRef.current;
      if (!el || el.scrollTop > 2) {
        armedRef.current = false;
        setPullBoth(0);
        return;
      }
      const t = e.touches[0];
      if (!t || !startRef.current) return;
      const dx = t.clientX - startRef.current.x;
      const dy = t.clientY - startRef.current.y;
      if (dy <= 0) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.12 && Math.abs(dx) > 12) {
        armedRef.current = false;
        setPullBoth(0);
        return;
      }
      if (dy < 6) return;
      e.preventDefault();
      const p = Math.min(MAX_PULL, dy * RESISTANCE);
      setPullBoth(p);
    },
    [disabled, refreshing, setPullBoth],
  );

  const touchEnd = useCallback(async () => {
    if (disabled) return;
    startRef.current = null;
    const wasArmed = armedRef.current;
    armedRef.current = false;
    if (refreshing) return;
    const p = pullRef.current;
    if (wasArmed && p >= THRESHOLD) {
      setRefreshing(true);
      setPullBoth(THRESHOLD * 0.5);
      try {
        await onRefresh?.();
      } finally {
        setRefreshing(false);
        setPullBoth(0);
      }
    } else {
      setPullBoth(0);
    }
  }, [disabled, refreshing, onRefresh, setPullBoth]);

  useEffect(() => {
    if (disabled) return undefined;
    const el = scrollRef.current;
    if (!el) return undefined;
    el.addEventListener('touchstart', touchStart, { passive: true });
    el.addEventListener('touchmove', touchMove, { passive: false });
    const end = () => {
      void touchEnd();
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', touchStart);
      el.removeEventListener('touchmove', touchMove);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [disabled, touchStart, touchMove, touchEnd]);

  useEffect(() => {
    setPullBoth(0);
    setRefreshing(false);
  }, [navKey, setPullBoth]);

  const indicatorH = disabled ? 0 : refreshing ? 40 : pull;

  return (
    <div className="pull-to-refresh-root">
      <div
        className="pull-to-refresh-indicator"
        aria-hidden
        style={{
          height: indicatorH,
          minHeight: indicatorH,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {!disabled && (pull > 6 || refreshing) && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            {refreshing ? 'Обновление…' : pull >= THRESHOLD ? 'Отпустите для обновления' : 'Потяните для обновления'}
          </span>
        )}
      </div>
      <div
        ref={scrollRef}
        className="pull-to-refresh-scroll"
        aria-busy={refreshing}
      >
        {children}
      </div>
    </div>
  );
}

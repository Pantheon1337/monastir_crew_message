import { useMemo } from 'react';

/**
 * Каркас экрана чата по схеме Element / Matrix: шапка → таймлайн (flex:1) → композер.
 * Область совпадает с visualViewport, safe-area только у «полки» композера (без дубля с полем).
 */
export default function ChatScaffold({ vvRect, zIndex = 60, top, timelineRef, timeline, footer, errorBanner }) {
  const shellStyle =
    vvRect != null
      ? {
          position: 'fixed',
          top: vvRect.top,
          left: vvRect.left,
          width: vvRect.width,
          height: vvRect.height,
          zIndex,
          background: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }
      : {
          position: 'fixed',
          inset: 0,
          zIndex,
          background: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          height: '100dvh',
          maxHeight: '100dvh',
          overflow: 'hidden',
        };

  /** Клавиатура / IME: узкий viewport — уменьшаем внутренние отступы композера к нижнему краю. */
  const imeTight = useMemo(() => {
    if (typeof window === 'undefined' || vvRect == null) return false;
    const ih = window.innerHeight;
    if (ih <= 0) return false;
    /* Клавиатура / IME: узкий viewport или смещение — убираем лишний отступ у композера */
    return vvRect.height < ih * 0.92 || vvRect.top > 8;
  }, [vvRect]);

  return (
    <div className="chat-scaffold" style={shellStyle}>
      {top}
      <div
        ref={timelineRef}
        className="chat-scaffold-timeline"
        role="region"
        aria-label="Сообщения чата"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          padding: '10px 8px',
        }}
      >
        {timeline}
      </div>
      {errorBanner}
      <div
        className={`chat-scaffold-composer-host${imeTight ? ' chat-scaffold-composer-host--ime' : ''}`}
      >
        {footer}
      </div>
    </div>
  );
}

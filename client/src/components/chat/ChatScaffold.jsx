/**
 * Каркас экрана чата по схеме Element X MessagesView:
 * верхняя панель → прокручиваемый таймлайн (flex:1) → нижний композер.
 * Не копирует код element-x-android (Kotlin/Compose); только аналогичная компоновка для веба.
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

  return (
    <div className="chat-scaffold" style={shellStyle}>
      {top}
      <div
        ref={timelineRef}
        className="chat-scaffold-timeline"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          padding: '12px 14px',
        }}
      >
        {timeline}
      </div>
      {errorBanner}
      <div className="chat-scaffold-composer-host">{footer}</div>
    </div>
  );
}

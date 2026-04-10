/**
 * Плавающая стрелка «к последним сообщениям» при прокрутке вверх по ленте чата.
 */
export default function ChatScrollDownFab({ visible, scrollRef, bottomOffsetPx = 92 }) {
  if (!visible) return null;
  return (
    <button
      type="button"
      aria-label="К последним сообщениям"
      onClick={() => {
        const el = scrollRef?.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }}
      style={{
        position: 'fixed',
        zIndex: 61,
        right: 14,
        bottom: `calc(${bottomOffsetPx}px + env(safe-area-inset-bottom, 0px))`,
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(26, 28, 32, 0.42)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        color: 'var(--text)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

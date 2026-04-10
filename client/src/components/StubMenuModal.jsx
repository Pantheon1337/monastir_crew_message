/** Заглушка для пунктов меню (настройки и т.д.). */
export default function StubMenuModal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stub-menu-title"
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 105,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
      }}
      onClick={onClose}
    >
      <div
        className="block modal-panel"
        style={{
          width: '100%',
          maxWidth: 400,
          padding: 16,
          borderRadius: 'var(--radius)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span id="stub-menu-title" style={{ fontSize: 14, fontWeight: 600 }}>
            {title}
          </span>
          <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.45 }}>
          {children || 'Раздел в разработке — скоро здесь появятся настройки.'}
        </p>
      </div>
    </div>
  );
}

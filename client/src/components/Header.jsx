import { useState, useEffect, useRef } from 'react';
import AddFriendModal from './AddFriendModal.jsx';

export default function Header({
  userId,
  onSocialChanged,
  onOpenAppStatus,
  onOpenSettings,
  onOpenPrivacy,
  onOpenSecurity,
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close, { passive: true });
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [menuOpen]);

  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '14px', fontWeight: 600, letterSpacing: '-0.02em' }}>
          Monastir Crew Message
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Добавить в друзья"
            onClick={() => setAddOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v8M8 12h8" />
            </svg>
          </button>
          <button type="button" className="icon-btn" aria-label="Поиск">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3-3" />
            </svg>
          </button>
          <div ref={menuWrapRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="icon-btn"
              aria-label="Меню"
              aria-expanded={menuOpen}
              aria-haspopup="true"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="6" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="12" cy="18" r="1.5" />
              </svg>
            </button>
            {menuOpen ? (
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 6,
                  zIndex: 60,
                  minWidth: 220,
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg)',
                  boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
                  padding: 4,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="header-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenAppStatus?.();
                  }}
                >
                  Статус приложения
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="header-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSettings?.();
                  }}
                >
                  Настройки
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="header-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenPrivacy?.();
                  }}
                >
                  Конфиденциальность
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="header-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSecurity?.();
                  }}
                >
                  Безопасность
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <AddFriendModal
        userId={userId}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => onSocialChanged?.()}
      />
    </>
  );
}

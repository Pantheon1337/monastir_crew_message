import { useState } from 'react';
import AddFriendModal from './AddFriendModal.jsx';

export default function Header({ userId, onSocialChanged }) {
  const [addOpen, setAddOpen] = useState(false);

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
        <div style={{ display: 'flex', gap: 8 }}>
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
          <button type="button" className="icon-btn" aria-label="Меню">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="6" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="18" r="1.5" />
            </svg>
          </button>
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

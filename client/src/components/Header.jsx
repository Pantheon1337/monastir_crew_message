import { useState } from 'react';
import AddFriendModal from './AddFriendModal.jsx';

const TITLES = {
  home: 'Главная',
  chats: 'Чаты',
  rooms: 'Комнаты',
  profile: 'Профиль',
};

export default function Header({ userId, onSocialChanged, onOpenSearch, nav = 'home' }) {
  const [addOpen, setAddOpen] = useState(false);
  const title = TITLES[nav] ?? 'Ruscord - Crew';

  return (
    <>
      <header
        className="app-top-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--header-bg)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '14px', fontWeight: 600, letterSpacing: '-0.02em' }}>{title}</h1>
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
          <button type="button" className="icon-btn" aria-label="Поиск" onClick={() => onOpenSearch?.()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3-3" />
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

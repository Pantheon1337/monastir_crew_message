const items = [
  { id: 'home', label: 'Главная', icon: 'home' },
  { id: 'chats', label: 'Чаты', icon: 'chat' },
  { id: 'create', label: 'Создать', icon: 'plus' },
  { id: 'rooms', label: 'Комнаты', icon: 'hash' },
  { id: 'profile', label: 'Профиль', icon: 'user' },
];

function Icon({ name, active }) {
  const stroke = active ? 'var(--accent)' : 'var(--muted)';
  const props = { width: 22, height: 22, fill: 'none', stroke, strokeWidth: 2 };
  switch (name) {
    case 'home':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z" />
        </svg>
      );
    case 'chat':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
      );
    case 'plus':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
    case 'hash':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M7 8l-2 8M17 8l-2 8M5 12h14M10 6l-1 12M15 6l-1 12" />
        </svg>
      );
    case 'user':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c1.5-4 4-5 7-5s5.5 1 7 5" />
        </svg>
      );
    default:
      return null;
  }
}

function NavBadge({ count }) {
  if (!count || count < 1) return null;
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: -2,
        right: -4,
        minWidth: 14,
        height: 14,
        padding: '0 4px',
        borderRadius: 7,
        background: '#c45c5c',
        color: '#fff',
        fontSize: 9,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
      }}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

export default function BottomNav({
  active = 'home',
  onChange,
  profileFriendRequests = 0,
  chatUnread = 0,
}) {
  return (
    <nav
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        maxWidth: 480,
        margin: '0 auto',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        padding: '8px 4px calc(8px + env(safe-area-inset-bottom))',
        zIndex: 50,
      }}
    >
      {items.map((it) => {
        const on = active === it.id;
        const profileBadge = it.id === 'profile' && profileFriendRequests > 0;
        const chatBadge = it.id === 'chats' && chatUnread > 0;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange?.(it.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              fontSize: 9,
              color: on ? 'var(--accent)' : 'var(--muted)',
              minWidth: 44,
              position: 'relative',
            }}
            aria-current={on ? 'page' : undefined}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon name={it.icon} active={on} />
              {profileBadge ? <NavBadge count={profileFriendRequests} /> : null}
              {chatBadge ? <NavBadge count={chatUnread} /> : null}
            </span>
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}

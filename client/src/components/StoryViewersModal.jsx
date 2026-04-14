import { createPortal } from 'react-dom';
import UserAvatar from './UserAvatar.jsx';
import NicknameWithBadge from './NicknameWithBadge.jsx';

function formatViewedAt(ts) {
  if (ts == null) return '—';
  return new Date(Number(ts)).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function StoryViewersModal({ open, viewers = [], loading, onClose }) {
  if (!open) return null;

  const ui = (
    <>
      <div
        role="presentation"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 220,
          background: 'rgba(0,0,0,0.45)',
        }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Просмотры истории"
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 221,
          width: 'min(380px, calc(100vw - 32px))',
          maxHeight: 'min(460px, 72dvh)',
          overflow: 'auto',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 12,
          boxShadow: '0 12px 48px rgba(0,0,0,0.45)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Просмотры</div>
          <button type="button" className="icon-btn" aria-label="Закрыть" style={{ width: 32, height: 32 }} onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: 10, lineHeight: 1.4 }}>
          У каждого пользователя показывается время первого просмотра этого кадра.
        </p>
        {loading ? (
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Загрузка…
          </p>
        ) : viewers.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Пока никто не смотрел (кроме вас).
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {viewers.map((u) => (
              <li
                key={u.userId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 13,
                }}
              >
                <UserAvatar src={u.avatarUrl} size={36} borderless />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <NicknameWithBadge nickname={u.nickname || 'user'} affiliationEmoji={u.authorAffiliationEmoji} />
                </div>
                {u.likedStory ? (
                  <span
                    aria-label="Лайкнул историю"
                    title="Лайкнул этот кадр"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: '#ff5a7a',
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                      <path
                        fill="currentColor"
                        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                      />
                    </svg>
                  </span>
                ) : null}
                <span className="muted" style={{ fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {formatViewedAt(u.viewedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(ui, document.body);
}

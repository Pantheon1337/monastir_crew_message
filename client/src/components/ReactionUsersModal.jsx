import { createPortal } from 'react-dom';
import { REACTION_ICONS } from '../reactionConstants.js';
import NicknameWithBadge from './NicknameWithBadge.jsx';

export default function ReactionUsersModal({ open, title = 'Реакции', users = [], onClose }) {
  if (!open) return null;

  const ui = (
    <>
      <div
        role="presentation"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 120,
          background: 'rgba(0,0,0,0.45)',
        }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 121,
          width: 'min(360px, calc(100vw - 32px))',
          maxHeight: 'min(420px, 70dvh)',
          overflow: 'auto',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 12,
          boxShadow: '0 12px 48px rgba(0,0,0,0.45)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
          <button type="button" className="icon-btn" aria-label="Закрыть" style={{ width: 32, height: 32 }} onClick={onClose}>
            ✕
          </button>
        </div>
        {users.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Пока никто не отреагировал.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {users.map((u) => (
              <li
                key={`${u.userId}-${u.reaction}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 13,
                }}
              >
                <NicknameWithBadge nickname={u.nickname || 'user'} affiliationEmoji={u.affiliationEmoji} />
                <span style={{ fontSize: 16 }} title={u.reaction} aria-hidden>
                  {REACTION_ICONS[u.reaction] ?? '·'}
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

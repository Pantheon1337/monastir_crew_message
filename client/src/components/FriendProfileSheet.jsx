import { useEffect, useState } from 'react';
import { api } from '../api.js';

function formatJoined(ts) {
  if (ts == null) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function FriendProfileSheet({ targetUserId, viewerId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isSelf, setIsSelf] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      const { ok, data } = await api(`/api/users/${encodeURIComponent(targetUserId)}/profile`, { userId: viewerId });
      if (cancelled) return;
      if (!ok) {
        setErr(data?.error || 'Не удалось загрузить');
        setLoading(false);
        return;
      }
      setProfile(data.user);
      setIsSelf(Boolean(data.isSelf));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [targetUserId, viewerId]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
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
          maxWidth: 420,
          maxHeight: 'min(85dvh, 640px)',
          overflow: 'auto',
          padding: 16,
          borderRadius: 'var(--radius)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Профиль</span>
          <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        {loading ? (
          <p className="muted" style={{ fontSize: 12 }}>
            Загрузка…
          </p>
        ) : err ? (
          <p style={{ fontSize: 12, color: '#c45c5c' }}>{err}</p>
        ) : profile ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }}
              />
            ) : (
              <div
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: '50%',
                  border: '1px solid var(--border)',
                  background: '#252830',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--muted)',
                  fontSize: 28,
                }}
              >
                {(profile.nickname || profile.firstName || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {profile.firstName} {profile.lastName}
              </div>
              <div style={{ fontSize: 13, color: 'var(--accent)', marginTop: 4 }}>
                {profile.nickname ? `@${profile.nickname}` : '—'}
              </div>
            </div>
            {isSelf && profile.phone && (
              <div className="muted" style={{ fontSize: 11 }}>
                тел. {profile.phone}
              </div>
            )}
            <div className="muted" style={{ fontSize: 11 }}>
              в сервисе с {formatJoined(profile.createdAt)}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function StoriesArchiveModal({ userId, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { ok, data } = await api('/api/stories/archive', { userId });
      if (cancelled) return;
      if (!ok) {
        setErr(data?.error || 'Ошибка');
        setLoading(false);
        return;
      }
      setItems(data.items || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 105,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 12,
      }}
      onClick={onClose}
    >
      <div
        className="block"
        style={{
          width: '100%',
          maxWidth: 420,
          maxHeight: '80dvh',
          overflow: 'auto',
          padding: 14,
          marginBottom: 'env(safe-area-inset-bottom)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Архив историй</span>
          <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted" style={{ fontSize: 11, margin: '0 0 12px' }}>
          Истёкшие за 24 часа, доступны вам и друзьям как владельцам контента.
        </p>
        {loading ? (
          <p className="muted" style={{ fontSize: 12 }}>
            Загрузка…
          </p>
        ) : err ? (
          <p style={{ fontSize: 12, color: '#c45c5c' }}>{err}</p>
        ) : items.length === 0 ? (
          <p className="muted" style={{ fontSize: 12 }}>
            Пока пусто
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map((it) => (
              <li
                key={it.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: it.mediaUrl ? '56px 1fr' : '1fr',
                  gap: 10,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 12,
                }}
              >
                {it.mediaUrl ? (
                  <img src={it.mediaUrl} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
                ) : null}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{it.authorLabel}</div>
                  {it.body ? <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{it.body}</div> : null}
                  <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>
                    истекла {new Date(it.expiresAt).toLocaleString('ru-RU')}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { api } from '../api.js';

export default function AddFriendModal({ userId, open, onClose, onSuccess }) {
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  function reset() {
    setTarget('');
    setError(null);
    setDone(false);
    setLoading(false);
  }

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { ok, data } = await api('/api/friends/request', {
      method: 'POST',
      body: { target: target.trim() },
      userId,
    });
    setLoading(false);
    if (!ok) {
      setError(data?.error || 'Не удалось отправить заявку');
      return;
    }
    setDone(true);
    onSuccess?.();
    window.setTimeout(() => {
      reset();
      onClose?.();
    }, 1200);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '48px 16px 16px',
      }}
      onClick={() => !loading && (reset(), onClose?.())}
      onKeyDown={(e) => e.key === 'Escape' && !loading && (reset(), onClose?.())}
    >
      <div
        className="block"
        style={{ width: '100%', maxWidth: 360, padding: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Добавить в друзья</span>
          <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => !loading && (reset(), onClose?.())} aria-label="Закрыть">
            ×
          </button>
        </div>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 11 }}>
          Введите @ник или номер телефона пользователя. Ему придёт заявка в профиль.
        </p>
        {done ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--online)' }}>Заявка отправлена</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              className="text-input"
              style={{ width: '100%', marginBottom: 10 }}
              placeholder="@username или +216…"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              autoFocus
            />
            {error ? (
              <p style={{ margin: '0 0 10px', fontSize: 11, color: '#c45c5c' }}>{error}</p>
            ) : null}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Отправка…' : 'Отправить заявку'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function CreateRoomModal({ userId, open, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [peers, setPeers] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [loadingPeers, setLoadingPeers] = useState(false);
  const [peersErr, setPeersErr] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open || !userId) return;
    setErr(null);
    setPeersErr(null);
    setTitle('');
    setDescription('');
    setSelected(new Set());
    let cancelled = false;
    (async () => {
      setLoadingPeers(true);
      const { ok, data, status } = await api('/api/friends/peers', { userId });
      if (cancelled) return;
      setLoadingPeers(false);
      if (ok) {
        setPeers(data.peers || []);
        setPeersErr(null);
      } else {
        setPeers([]);
        const raw = data?.error || '';
        const noRoute =
          typeof raw === 'string' &&
          (raw.includes('Cannot GET') || raw.includes('404') || status === 404);
        setPeersErr(
          noRoute
            ? 'Список друзей недоступен: укажите при сборке client переменную VITE_API_ORIGIN на URL вашего API (если фронт без прокси /api) и перезапустите backend с актуальным кодом.'
            : raw || `Ошибка загрузки (${status})`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  function togglePeer(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    const t = title.trim();
    if (!t) {
      setErr('Укажите название комнаты');
      return;
    }
    setLoading(true);
    const { ok, data, status } = await api('/api/rooms', {
      method: 'POST',
      userId,
      body: {
        title: t,
        description: description.trim() || undefined,
        memberIds: [...selected],
      },
    });
    setLoading(false);
    if (!ok) {
      const raw = data?.error || '';
      const cannotPost =
        typeof raw === 'string' &&
        (/cannot post/i.test(raw) || /can not post/i.test(raw) || raw.includes('Cannot POST'));
      setErr(
        cannotPost
          ? 'Создание комнаты недоступно: задайте VITE_API_ORIGIN на URL API при сборке (если статика без прокси), проверьте POST /api/rooms на сервере и перезапустите backend.'
          : raw || `Не удалось создать комнату (${status})`,
      );
      return;
    }
    onCreated?.(data.room);
    onClose?.();
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-room-title"
      className="modal-overlay create-room-modal-overlay"
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
        className="block modal-panel create-room-modal-panel"
        style={{
          width: '100%',
          maxWidth: 440,
          maxHeight: 'min(85dvh, 680px)',
          overflow: 'auto',
          padding: 16,
          borderRadius: 'var(--radius)',
          WebkitOverflowScrolling: 'touch',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span id="create-room-title" style={{ fontSize: 14, fontWeight: 600 }}>
            Новая комната
          </span>
          <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <p className="muted" style={{ fontSize: 11, margin: '0 0 14px', lineHeight: 1.4 }}>
          Задайте имя и при необходимости описание. Добавьте друзей — в комнату можно пригласить только тех, кто у вас в контактах.
        </p>

        <form onSubmit={submit}>
          <label className="muted" style={{ fontSize: 10, display: 'block', marginBottom: 4 }}>
            Название
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например, Команда проекта"
            maxLength={80}
            autoComplete="off"
            enterKeyHint="done"
            style={{
              width: '100%',
              padding: '10px 12px',
              marginBottom: 12,
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 16,
              lineHeight: 1.35,
            }}
          />

          <label className="muted" style={{ fontSize: 10, display: 'block', marginBottom: 4 }}>
            Описание (необязательно)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Коротко о теме комнаты"
            maxLength={500}
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              marginBottom: 14,
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 16,
              lineHeight: 1.35,
              resize: 'vertical',
            }}
          />

          <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 8px' }}>Друзья в комнате</p>
          {peersErr ? (
            <p style={{ fontSize: 11, color: '#c45c5c', margin: '0 0 10px', lineHeight: 1.4 }}>{peersErr}</p>
          ) : null}
          {loadingPeers ? (
            <p className="muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
              Загрузка…
            </p>
          ) : peers.length === 0 ? (
            <p className="muted" style={{ fontSize: 12, margin: '0 0 12px', lineHeight: 1.4 }}>
              Пока нет друзей для добавления. Сначала примите заявки или отправьте свою.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: '0 0 14px', padding: 0, maxHeight: 220, overflow: 'auto' }}>
              {peers.map((p) => (
                <li key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 4px',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => togglePeer(p.id)}
                      style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
                    />
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#252830', border: '1px solid var(--border)' }} />
                    )}
                    <span style={{ minWidth: 0 }}>
                      <span style={{ color: 'var(--accent)' }}>@{p.nickname}</span>
                      <span className="muted" style={{ display: 'block', fontSize: 10 }}>
                        {p.firstName} {p.lastName}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {err ? (
            <p style={{ fontSize: 12, color: '#c45c5c', margin: '0 0 10px' }}>{err}</p>
          ) : null}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-outline" style={{ padding: '8px 14px', width: 'auto' }} onClick={onClose} disabled={loading}>
              Отмена
            </button>
            <button type="submit" className="btn-primary" style={{ padding: '8px 14px', width: 'auto' }} disabled={loading}>
              {loading ? 'Создание…' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

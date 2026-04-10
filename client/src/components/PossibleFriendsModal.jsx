import { useEffect, useState } from 'react';
import { api } from '../api.js';
import UserAvatar from './UserAvatar.jsx';
import NicknameWithBadge from './NicknameWithBadge.jsx';

/**
 * Каталог пользователей: поиск по нику / телефону / имени, заявки в друзья.
 */
export default function PossibleFriendsModal({ open, userId, onClose, onFriendsChanged }) {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [actionId, setActionId] = useState(null);

  useEffect(() => {
    if (!open) return;
    setQInput('');
    setQ('');
    setErr(null);
    setUsers([]);
  }, [open]);

  useEffect(() => {
    const delay = qInput === '' ? 0 : 320;
    const t = window.setTimeout(() => setQ(qInput), delay);
    return () => window.clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    if (!open || !userId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
      const { ok, data } = await api(`/api/friends/directory${qs}`, { userId });
      if (cancelled) return;
      setLoading(false);
      if (!ok) {
        setErr(data?.error || 'Не удалось загрузить список');
        setUsers([]);
        return;
      }
      setUsers(data.users || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId, q]);

  async function sendRequest(u) {
    if (!userId || !u?.nickname) return;
    setActionId(u.id);
    const { ok, data } = await api('/api/friends/request', {
      method: 'POST',
      body: { target: u.nickname },
      userId,
    });
    setActionId(null);
    if (!ok) {
      alert(data?.error || 'Не удалось отправить заявку');
      return;
    }
    setUsers((prev) =>
      prev.map((x) => (x.id === u.id ? { ...x, relationship: 'pending_out', incomingRequestId: null } : x)),
    );
    onFriendsChanged?.();
  }

  async function acceptRequest(u) {
    if (!userId || !u.incomingRequestId) return;
    setActionId(u.id);
    const { ok, data } = await api(`/api/friends/requests/${encodeURIComponent(u.incomingRequestId)}/accept`, {
      method: 'POST',
      userId,
    });
    setActionId(null);
    if (!ok) {
      alert(data?.error || 'Не удалось принять');
      return;
    }
    setUsers((prev) =>
      prev.map((x) => (x.id === u.id ? { ...x, relationship: 'friend', incomingRequestId: null } : x)),
    );
    onFriendsChanged?.();
  }

  async function rejectRequest(u) {
    if (!userId || !u.incomingRequestId) return;
    setActionId(u.id);
    const { ok, data } = await api(`/api/friends/requests/${encodeURIComponent(u.incomingRequestId)}/reject`, {
      method: 'POST',
      userId,
    });
    setActionId(null);
    if (!ok) {
      alert(data?.error || 'Не удалось отклонить');
      return;
    }
    setUsers((prev) =>
      prev.map((x) => (x.id === u.id ? { ...x, relationship: 'none', incomingRequestId: null } : x)),
    );
    onFriendsChanged?.();
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="possible-friends-title"
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 110,
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
        className="block modal-panel possible-friends-modal-panel"
        style={{
          width: '100%',
          maxWidth: 440,
          maxHeight: 'min(90dvh, 720px)',
          padding: 16,
          borderRadius: 'var(--radius)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
          <span id="possible-friends-title" style={{ fontSize: 14, fontWeight: 600 }}>
            Возможно друзья
          </span>
          <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: 10, lineHeight: 1.4, flexShrink: 0 }}>
          Все зарегистрированные пользователи. Поиск по нику, имени или цифрам телефона.
        </p>
        <input
          type="search"
          className="text-input"
          placeholder="Поиск: @username или +216…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          style={{ width: '100%', marginBottom: 10, flexShrink: 0 }}
          autoComplete="off"
        />
        {err ? (
          <p style={{ fontSize: 11, color: '#c45c5c', margin: '0 0 8px' }}>{err}</p>
        ) : null}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', marginTop: 4 }}>
          {loading && users.length === 0 ? (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Загрузка…
            </p>
          ) : users.length === 0 ? (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              {q.trim() ? 'Никого не найдено' : 'Пока нет других пользователей'}
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {users.map((u) => {
                const busy = actionId === u.id;
                const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || '—';
                return (
                  <li
                    key={u.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 0',
                      borderBottom: '1px solid var(--border)',
                      fontSize: 12,
                    }}
                  >
                    <UserAvatar src={u.avatarUrl} size={40} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                      <div className="muted" style={{ fontSize: 10 }}>
                        {u.nickname ? (
                          <NicknameWithBadge nickname={u.nickname} affiliationEmoji={u.affiliationEmoji} />
                        ) : (
                          '—'
                        )}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                      {u.relationship === 'friend' ? (
                        <span className="muted" style={{ fontSize: 10 }}>
                          Друзья
                        </span>
                      ) : u.relationship === 'pending_out' ? (
                        <span className="muted" style={{ fontSize: 10 }}>
                          Заявка отправлена
                        </span>
                      ) : u.relationship === 'pending_in' ? (
                        <>
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ padding: '6px 10px', width: 'auto', fontSize: 11 }}
                            disabled={busy}
                            onClick={() => void acceptRequest(u)}
                          >
                            Принять
                          </button>
                          <button
                            type="button"
                            className="btn-outline"
                            style={{ padding: '4px 8px', width: 'auto', fontSize: 10 }}
                            disabled={busy}
                            onClick={() => void rejectRequest(u)}
                          >
                            Отклонить
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn-outline"
                          style={{ padding: '6px 12px', width: 'auto', fontSize: 11 }}
                          disabled={busy}
                          onClick={() => void sendRequest(u)}
                        >
                          Добавить
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

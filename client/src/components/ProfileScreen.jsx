import { useEffect, useState, useCallback, useRef } from 'react';
import { clearStoredUser, setStoredUser } from '../authStorage.js';
import { api, apiUpload } from '../api.js';

export default function ProfileScreen({ user, onLogout, socialTick = 0, onFriendsChanged, onUserUpdated }) {
  const fileRef = useRef(null);
  const [incoming, setIncoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);

  const loadIncoming = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { ok, data } = await api('/api/friends/requests/incoming', { userId: user.id });
    if (ok) setIncoming(data.requests || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadIncoming();
  }, [loadIncoming, socialTick]);

  async function accept(id) {
    setActionId(id);
    const { ok, data } = await api(`/api/friends/requests/${encodeURIComponent(id)}/accept`, {
      method: 'POST',
      userId: user.id,
    });
    setActionId(null);
    if (!ok) {
      alert(data?.error || 'Не удалось принять');
      return;
    }
    await loadIncoming();
    onFriendsChanged?.();
  }

  async function reject(id) {
    setActionId(id);
    const { ok, data } = await api(`/api/friends/requests/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      userId: user.id,
    });
    setActionId(null);
    if (!ok) {
      alert(data?.error || 'Не удалось отклонить');
      return;
    }
    await loadIncoming();
    onFriendsChanged?.();
  }

  const displayPhone = user?.phone ? '+' + String(user.phone).replace(/(.{3})(?=.)/g, '$1 ') : '';

  async function onPickAvatar(e) {
    const f = e.target.files?.[0];
    if (!f || !user?.id) return;
    const { ok, data } = await apiUpload('/api/users/me/avatar', { file: f, userId: user.id });
    e.target.value = '';
    if (!ok || !data?.user) {
      alert(data?.error || 'Не удалось загрузить аватар');
      return;
    }
    setStoredUser(data.user);
    onUserUpdated?.(data.user);
  }

  return (
    <section style={{ padding: 16 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Профиль</h2>

      <div className="block" style={{ padding: 14, marginBottom: 12 }}>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden onChange={onPickAvatar} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '1px solid var(--border)',
              }}
            />
          ) : (
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                border: '1px solid var(--border)',
                background: '#252830',
              }}
            />
          )}
          <button type="button" className="btn-outline" style={{ width: 'auto', padding: '8px 12px' }} onClick={() => fileRef.current?.click()}>
            Аватар
          </button>
        </div>

        <p style={{ margin: '0 0 4px', fontSize: 11 }} className="muted">
          Никнейм
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--accent)' }}>@{user?.nickname}</p>

        <p style={{ margin: '0 0 4px', fontSize: 11 }} className="muted">
          Имя и фамилия
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 13 }}>
          {user?.firstName} {user?.lastName}
        </p>

        <p style={{ margin: '0 0 4px', fontSize: 11 }} className="muted">
          Телефон
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 13 }}>{displayPhone || user?.phone}</p>

        <p className="muted" style={{ margin: 0, fontSize: 10 }}>
          Подтверждение номера по SMS будет добавлено позже.
        </p>

        <button
          type="button"
          className="btn-outline"
          style={{ marginTop: 16 }}
          onClick={() => {
            clearStoredUser();
            onLogout?.();
          }}
        >
          Выйти из аккаунта
        </button>
      </div>

      <div className="block" style={{ padding: 14 }}>
        <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600 }}>Заявки в друзья</p>
        {loading ? (
          <p className="muted" style={{ margin: 0, fontSize: 11 }}>
            Загрузка…
          </p>
        ) : incoming.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 11 }}>
            Нет входящих заявок
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {incoming.map((r) => (
              <li
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>
                    @{r.from?.nickname}
                  </div>
                  <div className="muted" style={{ fontSize: 10 }}>
                    {r.from?.firstName} {r.from?.lastName}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 36, height: 36, color: 'var(--online)' }}
                    disabled={actionId === r.id}
                    aria-label="Принять"
                    onClick={() => accept(r.id)}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 36, height: 36, color: '#c45c5c' }}
                    disabled={actionId === r.id}
                    aria-label="Отклонить"
                    onClick={() => reject(r.id)}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

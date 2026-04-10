import { useEffect, useState, useCallback, useRef } from 'react';
import { clearStoredUser, setStoredUser } from '../authStorage.js';
import { api, apiUpload } from '../api.js';
import { requestNotificationPermission } from '../browserNotification.js';
import UserAvatar from './UserAvatar.jsx';
import NicknameWithBadge from './NicknameWithBadge.jsx';
import { AFFILIATION_EMOJI_CHOICES } from '../affiliationConstants.js';
import { formatPhoneRu } from '../formatPhone.js';

const MAX_ABOUT = 100;

function profileRoleCaption(displayRole) {
  if (displayRole === 'developer') return 'Разработчик';
  if (displayRole === 'beta') return 'Бета-тестер';
  return 'Пользователь';
}

export default function ProfileScreen({ user, onLogout, socialTick = 0, onFriendsChanged, onUserUpdated, onOpenArchive }) {
  const fileRef = useRef(null);
  const [incoming, setIncoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [notifPerm, setNotifPerm] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );
  const [aboutDraft, setAboutDraft] = useState('');
  const [aboutSaving, setAboutSaving] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);
  const [emojiSaving, setEmojiSaving] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const emojiPickerRef = useRef(null);

  useEffect(() => {
    setAboutDraft(user?.about != null ? String(user.about) : '');
  }, [user?.id, user?.about]);

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

  useEffect(() => {
    const sync = () => {
      if (typeof Notification !== 'undefined') setNotifPerm(Notification.permission);
    };
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  useEffect(() => {
    if (!emojiPickerOpen) return;
    function onDoc(e) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) setEmojiPickerOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [emojiPickerOpen]);

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

  const displayPhone = user?.phone ? formatPhoneRu(user.phone) : '';

  async function saveAbout() {
    if (!user?.id) return;
    setAboutSaving(true);
    const { ok, data } = await api('/api/users/me', {
      method: 'PATCH',
      body: { about: aboutDraft },
      userId: user.id,
    });
    setAboutSaving(false);
    if (!ok) {
      alert(data?.error || 'Не удалось сохранить');
      return;
    }
    if (data?.user) {
      setStoredUser(data.user);
      onUserUpdated?.(data.user);
    }
  }

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
          <UserAvatar src={user?.avatarUrl} size={72} />
          <button type="button" className="btn-outline" style={{ width: 'auto', padding: '8px 12px' }} onClick={() => fileRef.current?.click()}>
            Аватар
          </button>
        </div>

        <p style={{ margin: '0 0 4px', fontSize: 11 }} className="muted">
          Никнейм
        </p>
        <div style={{ margin: '0 0 12px' }}>
          <div style={{ fontSize: 14, color: 'var(--accent)' }}>
            {user?.nickname ? (
              <NicknameWithBadge nickname={user.nickname} affiliationEmoji={user?.affiliationEmoji} />
            ) : (
              '—'
            )}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            {profileRoleCaption(user?.displayRole)}
          </p>
        </div>

        <p style={{ margin: '0 0 4px', fontSize: 11 }} className="muted">
          {user?.displayRole === 'developer' ? 'Роль' : 'Сменить роль'}
        </p>
        {user?.displayRole === 'developer' ? (
          <p style={{ margin: '0 0 12px', fontSize: 12 }} className="muted">
            Назначается автоматически для аккаунта разработчика.
          </p>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <select
              className="text-input"
              style={{ width: '100%', fontSize: 13, padding: '8px 10px' }}
              value={user?.displayRole === 'beta' ? 'beta' : 'user'}
              disabled={roleSaving}
              onChange={(e) => {
                const displayRole = e.target.value;
                void (async () => {
                  if (!user?.id) return;
                  setRoleSaving(true);
                  const { ok, data } = await api('/api/users/me', {
                    method: 'PATCH',
                    body: { displayRole },
                    userId: user.id,
                  });
                  setRoleSaving(false);
                  if (!ok) {
                    alert(data?.error || 'Не удалось сохранить роль');
                    return;
                  }
                  if (data?.user) {
                    setStoredUser(data.user);
                    onUserUpdated?.(data.user);
                  }
                })();
              }}
            >
              <option value="user">Пользователь 👤</option>
              <option value="beta">Бета-тестер 🧪</option>
            </select>
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 10 }}>
              Роль «Разработчик» недоступна для выбора и отображается только у отмеченных аккаунтов.
            </p>
          </div>
        )}

        <p style={{ margin: '0 0 6px', fontSize: 11 }} className="muted">
          Смайлик у ника (набор совместим с iOS)
        </p>
        <div ref={emojiPickerRef} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12, position: 'relative' }}>
          <button
            type="button"
            className="btn-outline"
            style={{
              width: 'auto',
              padding: '6px 10px',
              fontSize: 12,
              opacity: emojiSaving ? 0.6 : 1,
              borderColor: user?.customAffiliationEmoji == null ? 'var(--accent)' : undefined,
            }}
            disabled={emojiSaving}
            onClick={() => {
              void (async () => {
                if (!user?.id) return;
                setEmojiSaving(true);
                setEmojiPickerOpen(false);
                const { ok, data } = await api('/api/users/me', {
                  method: 'PATCH',
                  body: { affiliationEmoji: '' },
                  userId: user.id,
                });
                setEmojiSaving(false);
                if (!ok) {
                  alert(data?.error || 'Не удалось сохранить');
                  return;
                }
                if (data?.user) {
                  setStoredUser(data.user);
                  onUserUpdated?.(data.user);
                }
              })();
            }}
          >
            По умолчанию
          </button>
          <button
            type="button"
            className="btn-outline"
            aria-expanded={emojiPickerOpen}
            aria-haspopup="listbox"
            style={{
              minWidth: 44,
              height: 40,
              padding: '0 12px',
              fontSize: 22,
              lineHeight: 1,
              opacity: emojiSaving ? 0.6 : 1,
              borderColor: user?.customAffiliationEmoji != null ? 'var(--accent)' : undefined,
            }}
            disabled={emojiSaving}
            title="Выбрать смайлик"
            onClick={() => setEmojiPickerOpen((v) => !v)}
          >
            {user?.customAffiliationEmoji != null ? user.customAffiliationEmoji : '☺'}
          </button>
          {emojiPickerOpen ? (
            <div
              role="listbox"
              style={{
                position: 'absolute',
                left: 0,
                top: '100%',
                marginTop: 6,
                zIndex: 30,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                padding: 10,
                maxWidth: 320,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
              }}
            >
              {AFFILIATION_EMOJI_CHOICES.map((em) => (
                <button
                  key={em}
                  type="button"
                  className="btn-outline"
                  title={em}
                  style={{
                    width: 40,
                    height: 40,
                    padding: 0,
                    fontSize: 20,
                    lineHeight: 1,
                    opacity: emojiSaving ? 0.6 : 1,
                    borderColor: user?.customAffiliationEmoji === em ? 'var(--accent)' : undefined,
                  }}
                  disabled={emojiSaving}
                  onClick={() => {
                    void (async () => {
                      if (!user?.id) return;
                      setEmojiSaving(true);
                      const { ok, data } = await api('/api/users/me', {
                        method: 'PATCH',
                        body: { affiliationEmoji: em },
                        userId: user.id,
                      });
                      setEmojiSaving(false);
                      if (!ok) {
                        alert(data?.error || 'Не удалось сохранить');
                        return;
                      }
                      if (data?.user) {
                        setStoredUser(data.user);
                        onUserUpdated?.(data.user);
                      }
                      setEmojiPickerOpen(false);
                    })();
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <p style={{ margin: '0 0 4px', fontSize: 11 }} className="muted">
          Имя и фамилия
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 13 }}>
          {user?.firstName} {user?.lastName}
        </p>

        <p style={{ margin: '0 0 4px', fontSize: 11 }} className="muted">
          Телефон
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 13 }}>{displayPhone || '—'}</p>

        <p style={{ margin: '0 0 4px', fontSize: 11 }} className="muted">
          О себе
        </p>
        <textarea
          className="text-input profile-about-textarea"
          value={aboutDraft}
          onChange={(e) => setAboutDraft(e.target.value.slice(0, MAX_ABOUT))}
          maxLength={MAX_ABOUT}
          rows={3}
          placeholder="До 100 символов"
          style={{
            marginBottom: 8,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span className="muted" style={{ fontSize: 10 }}>
            {aboutDraft.length}/{MAX_ABOUT}
          </span>
          <button
            type="button"
            className="btn-outline"
            style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
            disabled={
              aboutSaving ||
              aboutDraft.trim() === (user?.about != null ? String(user.about).trim() : '')
            }
            onClick={() => void saveAbout()}
          >
            {aboutSaving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>

        {typeof Notification !== 'undefined' && notifPerm === 'default' ? (
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="btn-outline"
              style={{ width: '100%' }}
              onClick={() => {
                void (async () => {
                  const p = await requestNotificationPermission();
                  setNotifPerm(p);
                })();
              }}
            >
              Включить уведомления
            </button>
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 10, lineHeight: 1.35 }}>
              О новых сообщениях и заявках в друзья, когда вкладка в фоне или открыт другой раздел.
            </p>
            {typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent) ? (
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 10, lineHeight: 1.35 }}>
                На iPhone и iPad запрос разрешения надёжнее срабатывает в приложении на экране «Домой»: Поделиться → На экран
                «Домой», затем откройте ярлык и нажмите кнопку выше. В обычном Safari уведомления сайта могут быть
                недоступны.
              </p>
            ) : null}
          </div>
        ) : null}
        {typeof Notification !== 'undefined' && notifPerm === 'denied' ? (
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 10 }}>
            Уведомления отключены в настройках браузера для этого сайта.
          </p>
        ) : null}

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

      {onOpenArchive ? (
        <div className="block" style={{ padding: 14, marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600 }}>Истории</p>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 10, lineHeight: 1.4 }}>
            Активные истории видят только друзья. Здесь — архив истёкших (вы и друзья).
          </p>
          <button type="button" className="btn-outline" onClick={() => onOpenArchive()}>
            Архив историй
          </button>
        </div>
      ) : null}

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
                    {r.from?.nickname ? (
                      <NicknameWithBadge nickname={r.from.nickname} affiliationEmoji={r.from?.affiliationEmoji} />
                    ) : (
                      '—'
                    )}
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

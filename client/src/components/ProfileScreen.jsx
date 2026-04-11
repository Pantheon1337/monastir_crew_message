import { useEffect, useState, useCallback, useRef } from 'react';
import { clearStoredUser, setStoredUser } from '../authStorage.js';
import { api, apiUpload } from '../api.js';
import { requestNotificationPermission } from '../browserNotification.js';
import UserAvatar from './UserAvatar.jsx';
import NicknameWithBadge from './NicknameWithBadge.jsx';
import { AFFILIATION_EMOJI_CHOICES } from '../affiliationConstants.js';
import { formatPhoneRu } from '../formatPhone.js';

const MAX_ABOUT = 100;

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path
        d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function profileRoleCaption(displayRole) {
  if (displayRole === 'developer') return 'Разработчик';
  if (displayRole === 'beta') return 'Бета-тестер';
  return 'Пользователь';
}

export default function ProfileScreen({
  user,
  onLogout,
  socialTick = 0,
  onFriendsChanged,
  onUserUpdated,
  onOpenArchive,
  onViewAvatar,
  onPreviewOwnProfile,
}) {
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
  /** null | 'firstName' | 'lastName' | 'nickname' */
  const [profileFieldModal, setProfileFieldModal] = useState(null);
  const [modalDraft, setModalDraft] = useState('');
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState(null);

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

  function nicknameChangeAllowed(u) {
    if (!u) return false;
    const rem = u.nicknameChangesRemaining ?? 0;
    if (rem <= 0) return false;
    const cnt = u.nicknameChangeCount ?? 0;
    if (cnt === 0) return true;
    const last = u.nicknameLastChangedAt;
    if (last == null) return true;
    return Date.now() - Number(last) >= 7 * 24 * 60 * 60 * 1000;
  }

  function nextNicknameChangeAfter(u) {
    const last = u?.nicknameLastChangedAt;
    if (last == null) return null;
    return new Date(Number(last) + 7 * 24 * 60 * 60 * 1000);
  }

  function openProfileFieldModal(kind) {
    if (!user?.id) return;
    setModalError(null);
    setProfileFieldModal(kind);
    if (kind === 'firstName') setModalDraft(String(user.firstName ?? ''));
    else if (kind === 'lastName') setModalDraft(String(user.lastName ?? ''));
    else setModalDraft(String(user.nickname ?? ''));
  }

  function closeProfileFieldModal() {
    if (modalSaving) return;
    setProfileFieldModal(null);
    setModalError(null);
  }

  async function submitProfileFieldModal() {
    if (!user?.id || !profileFieldModal) return;
    setModalError(null);

    if (profileFieldModal === 'firstName') {
      const f = modalDraft.trim().slice(0, 60);
      const l = String(user.lastName ?? '').trim().slice(0, 60);
      if (f === String(user.firstName ?? '').trim()) {
        closeProfileFieldModal();
        return;
      }
      if (!f) {
        setModalError('Введите имя');
        return;
      }
      if (!l) {
        setModalError('Фамилия не может быть пустой');
        return;
      }
      setModalSaving(true);
      const { ok, data } = await api('/api/users/me', {
        method: 'PATCH',
        body: { firstName: f, lastName: l },
        userId: user.id,
      });
      setModalSaving(false);
      if (!ok) {
        setModalError(data?.error || 'Не удалось сохранить');
        return;
      }
      if (data?.user) {
        setStoredUser(data.user);
        onUserUpdated?.(data.user);
      }
      closeProfileFieldModal();
      return;
    }

    if (profileFieldModal === 'lastName') {
      const f = String(user.firstName ?? '').trim().slice(0, 60);
      const l = modalDraft.trim().slice(0, 60);
      if (l === String(user.lastName ?? '').trim()) {
        closeProfileFieldModal();
        return;
      }
      if (!f) {
        setModalError('Имя не может быть пустым');
        return;
      }
      if (!l) {
        setModalError('Введите фамилию');
        return;
      }
      setModalSaving(true);
      const { ok, data } = await api('/api/users/me', {
        method: 'PATCH',
        body: { firstName: f, lastName: l },
        userId: user.id,
      });
      setModalSaving(false);
      if (!ok) {
        setModalError(data?.error || 'Не удалось сохранить');
        return;
      }
      if (data?.user) {
        setStoredUser(data.user);
        onUserUpdated?.(data.user);
      }
      closeProfileFieldModal();
      return;
    }

    const raw = modalDraft.trim().replace(/^@/, '').toLowerCase().slice(0, 30);
    if (raw === (user.nickname || '').toLowerCase()) {
      closeProfileFieldModal();
      return;
    }
    if (!nicknameChangeAllowed(user)) {
      setModalError('Сейчас нельзя сменить username');
      return;
    }
    setModalSaving(true);
    const { ok, data } = await api('/api/users/me', {
      method: 'PATCH',
      body: { nickname: raw },
      userId: user.id,
    });
    setModalSaving(false);
    if (!ok) {
      setModalError(data?.error || 'Не удалось сменить username');
      return;
    }
    if (data?.user) {
      setStoredUser(data.user);
      onUserUpdated?.(data.user);
    }
    closeProfileFieldModal();
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

  const nicknameEditBlocked =
    (user?.nicknameChangesRemaining ?? 0) <= 0 ||
    (user && !nicknameChangeAllowed(user) && (user.nicknameChangesRemaining ?? 0) > 0);

  const modalTitle =
    profileFieldModal === 'firstName'
      ? 'Редактировать имя'
      : profileFieldModal === 'lastName'
        ? 'Редактировать фамилию'
        : profileFieldModal === 'nickname'
          ? 'Редактировать username'
          : '';

  return (
    <>
    <section style={{ padding: '12px 14px 28px', maxWidth: 520, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Профиль</h2>
      <p className="muted" style={{ margin: '0 0 16px', fontSize: 12, lineHeight: 1.4 }}>
        Данные аккаунта и отображение в чатах
      </p>

      <p className="profile-settings-section-title">Аккаунт</p>
      <div className="profile-settings-card" style={{ marginBottom: 12 }}>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden onChange={onPickAvatar} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <UserAvatar
            src={user?.avatarUrl}
            size={72}
            onOpen={user?.avatarUrl && typeof onViewAvatar === 'function' ? () => onViewAvatar(user.avatarUrl) : undefined}
          />
          <button type="button" className="btn-outline" style={{ width: 'auto', padding: '8px 12px' }} onClick={() => fileRef.current?.click()}>
            Сменить фото
          </button>
        </div>
        {typeof onPreviewOwnProfile === 'function' ? (
          <button type="button" className="btn-outline" style={{ width: '100%', marginBottom: 12 }} onClick={() => onPreviewOwnProfile()}>
            Как меня видят другие
          </button>
        ) : null}

        <div className="profile-settings-divider" />

        <div style={{ marginBottom: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 140px', minWidth: 0 }}>
              <p style={{ margin: '0 0 2px', fontSize: 11 }} className="muted">
                Имя
              </p>
              <p style={{ margin: 0, fontSize: 14, wordBreak: 'break-word' }}>{user?.firstName?.trim() || '—'}</p>
            </div>
            <button
              type="button"
              className="btn-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '8px 12px', flexShrink: 0 }}
              onClick={() => openProfileFieldModal('firstName')}
            >
              <PencilIcon />
              Редактировать
            </button>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 140px', minWidth: 0 }}>
              <p style={{ margin: '0 0 2px', fontSize: 11 }} className="muted">
                Фамилия
              </p>
              <p style={{ margin: 0, fontSize: 14, wordBreak: 'break-word' }}>{user?.lastName?.trim() || '—'}</p>
            </div>
            <button
              type="button"
              className="btn-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '8px 12px', flexShrink: 0 }}
              onClick={() => openProfileFieldModal('lastName')}
            >
              <PencilIcon />
              Редактировать
            </button>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 140px', minWidth: 0 }}>
              <p style={{ margin: '0 0 2px', fontSize: 11 }} className="muted">
                Username
              </p>
              <p style={{ margin: 0, fontSize: 14, wordBreak: 'break-all' }}>
                {user?.nickname ? (
                  <>
                    <span style={{ color: 'var(--muted)' }}>@</span>
                    {user.nickname}
                  </>
                ) : (
                  '—'
                )}
              </p>
            </div>
            <button
              type="button"
              className="btn-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '8px 12px', flexShrink: 0 }}
              disabled={nicknameEditBlocked}
              title={
                nicknameEditBlocked
                  ? (user?.nicknameChangesRemaining ?? 0) <= 0
                    ? 'Лимит смен username исчерпан'
                    : nextNicknameChangeAfter(user)
                      ? `Следующая смена: ${nextNicknameChangeAfter(user).toLocaleString('ru-RU')}`
                      : 'Сейчас нельзя сменить username'
                  : undefined
              }
              onClick={() => openProfileFieldModal('nickname')}
            >
              <PencilIcon />
              Редактировать
            </button>
          </div>
        </div>
      </div>

      <p className="profile-settings-section-title">Отображение в приложении</p>
      <div className="profile-settings-card" style={{ marginBottom: 12 }}>
        <div style={{ margin: '0 0 12px' }}>
          <p style={{ margin: '0 0 4px', fontSize: 11 }} className="muted">
            Ник и смайлик в чатах
          </p>
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

        <div className="profile-settings-divider" />

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

        <p style={{ margin: '12px 0 6px', fontSize: 11 }} className="muted">
          Смайлик у ника
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

      </div>

      <p className="profile-settings-section-title">Контакты и о себе</p>
      <div className="profile-settings-card" style={{ marginBottom: 12 }}>
        <p style={{ margin: '0 0 4px', fontSize: 11 }} className="muted">
          Телефон
        </p>
        <p style={{ margin: '0 0 14px', fontSize: 13 }}>{displayPhone || '—'}</p>

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

      </div>

      <p className="profile-settings-section-title">Уведомления</p>
      <div className="profile-settings-card" style={{ marginBottom: 12 }}>
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
      </div>

      <p className="profile-settings-section-title">Сессия</p>
      <div className="profile-settings-card" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="btn-outline"
          style={{ width: '100%' }}
          onClick={() => {
            clearStoredUser();
            onLogout?.();
          }}
        >
          Выйти из аккаунта
        </button>
      </div>

      {onOpenArchive ? (
        <>
          <p className="profile-settings-section-title">Истории</p>
          <div className="profile-settings-card" style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600 }}>Архив</p>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 10, lineHeight: 1.4 }}>
            В ленте кружков — 24 часа. В профиле кадры висят, пока не уберёте в архив или не удалите. Архив — снятые с ленты и истёкшие без показа в профиле.
          </p>
          <button type="button" className="btn-outline" onClick={() => onOpenArchive()}>
            Открыть архив
          </button>
        </div>
        </>
      ) : null}

      <p className="profile-settings-section-title">Заявки в друзья</p>
      <div className="profile-settings-card" style={{ padding: 14 }}>
        <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600 }}>Входящие</p>
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
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    {[r.from?.firstName, r.from?.lastName].filter(Boolean).join(' ').trim() ||
                      (r.from?.nickname ? `@${r.from.nickname}` : '—')}
                  </div>
                  <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>
                    {[r.from?.firstName, r.from?.lastName].filter(Boolean).join(' ').trim() && r.from?.nickname ? (
                      <NicknameWithBadge nickname={r.from.nickname} affiliationEmoji={r.from?.affiliationEmoji} />
                    ) : null}
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

    {profileFieldModal ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-field-modal-title"
        className="modal-overlay profile-field-modal-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          paddingTop: 'max(48px, env(safe-area-inset-top))',
        }}
        onClick={() => closeProfileFieldModal()}
        onKeyDown={(e) => e.key === 'Escape' && closeProfileFieldModal()}
      >
        <div
          className="block modal-panel profile-field-modal-panel"
          style={{ width: '100%', maxWidth: 380, padding: 16 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span id="profile-field-modal-title" style={{ fontSize: 14, fontWeight: 600 }}>
              {modalTitle}
            </span>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 36, height: 36 }}
              disabled={modalSaving}
              onClick={() => closeProfileFieldModal()}
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>

          {profileFieldModal === 'nickname' ? (
            <p className="muted" style={{ margin: '0 0 12px', fontSize: 11, lineHeight: 1.45 }}>
              Латиница, цифры и символ _. Длина 3–30. Осталось смен:{' '}
              <strong style={{ color: 'var(--text)' }}>{user?.nicknameChangesRemaining ?? 0}</strong> из 2. Не чаще одного раза
              в 7 дней.
              {user && !nicknameChangeAllowed(user) && (user.nicknameChangesRemaining ?? 0) > 0 && nextNicknameChangeAfter(user) ? (
                <>
                  {' '}
                  Следующая смена: {nextNicknameChangeAfter(user).toLocaleString('ru-RU')}.
                </>
              ) : null}
              {(user?.nicknameChangesRemaining ?? 0) <= 0 ? <> Лимит смен исчерпан.</> : null}
            </p>
          ) : (
            <p className="muted" style={{ margin: '0 0 12px', fontSize: 11, lineHeight: 1.45 }}>
              До 60 символов. Пустые значения не допускаются.
            </p>
          )}

          {profileFieldModal === 'nickname' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 16, color: 'var(--muted)', flexShrink: 0 }}>@</span>
              <input
                className="text-input"
                style={{ flex: 1, minWidth: 0, fontSize: 16 }}
                value={modalDraft}
                onChange={(e) => setModalDraft(e.target.value.replace(/^@/, '').toLowerCase().slice(0, 30))}
                placeholder="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={modalSaving || nicknameEditBlocked}
                autoFocus
              />
            </div>
          ) : (
            <input
              className="text-input"
              style={{ width: '100%', fontSize: 16, marginBottom: 10 }}
              value={modalDraft}
              onChange={(e) => setModalDraft(e.target.value.slice(0, 60))}
              placeholder={profileFieldModal === 'firstName' ? 'Имя' : 'Фамилия'}
              autoComplete={profileFieldModal === 'firstName' ? 'given-name' : 'family-name'}
              disabled={modalSaving}
              autoFocus
            />
          )}

          {modalError ? (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#c45c5c' }}>{modalError}</p>
          ) : null}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn-outline" disabled={modalSaving} onClick={() => closeProfileFieldModal()}>
              Отмена
            </button>
            <button
              type="button"
              className="btn-outline"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              disabled={
                modalSaving ||
                (profileFieldModal === 'firstName' &&
                  modalDraft.trim() === String(user?.firstName ?? '').trim()) ||
                (profileFieldModal === 'lastName' &&
                  modalDraft.trim() === String(user?.lastName ?? '').trim()) ||
                (profileFieldModal === 'nickname' &&
                  (nicknameEditBlocked ||
                    modalDraft.trim().replace(/^@/, '').toLowerCase() === (user?.nickname || '').toLowerCase()))
              }
              onClick={() => void submitProfileFieldModal()}
            >
              {modalSaving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

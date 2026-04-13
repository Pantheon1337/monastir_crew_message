import { useEffect, useState, useCallback, useRef } from 'react';
import { clearStoredUser, setStoredUser } from '../authStorage.js';
import { api, apiUpload } from '../api.js';
import { requestNotificationPermission } from '../browserNotification.js';
import UserAvatar from './UserAvatar.jsx';
import NicknameWithBadge from './NicknameWithBadge.jsx';
import { AFFILIATION_EMOJI_CHOICES } from '../affiliationConstants.js';
import { formatPhoneRu } from '../formatPhone.js';

const MAX_ABOUT = 100;

function TgGridIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="7" cy="7" r="2.2" />
      <circle cx="17" cy="7" r="2.2" />
      <circle cx="7" cy="17" r="2.2" />
      <circle cx="17" cy="17" r="2.2" />
    </svg>
  );
}

function TgRowIconSmile() {
  return (
    <span className="profile-tg-row__icon" aria-hidden>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" strokeLinecap="round" />
        <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

function TgRowIconSparkle() {
  return (
    <span className="profile-tg-row__icon profile-tg-row__icon--accent" aria-hidden>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3l1.2 4.2L17 8.5l-4.2 1.2L12 14l-1.2-4.2L7 8.5l4.2-1.2L12 3z" />
        <circle cx="8" cy="16" r="2" />
        <path d="M17 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
      </svg>
    </span>
  );
}

function TgRowIconCamera() {
  return (
    <span className="profile-tg-row__icon profile-tg-row__icon--accent" aria-hidden>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="7" width="18" height="12" rx="2" />
        <circle cx="12" cy="13" r="3" />
        <path d="M8 7V5a1 1 0 011-1h6a1 1 0 011 1v2" />
        <path d="M17 11h2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function TgRowIconPerson() {
  return (
    <span className="profile-tg-row__icon" aria-hidden>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e57373" strokeWidth="2">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M6 20v-1a4 4 0 014-4h4a4 4 0 014 4v1" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function TgRowIconUsers() {
  return (
    <span className="profile-tg-row__icon" aria-hidden>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
        <circle cx="9" cy="8" r="2.5" />
        <path d="M4 19v-1a3 3 0 013-3h4a3 3 0 013 3v1" />
        <circle cx="17" cy="9" r="2" />
        <path d="M21 19v-1a2.5 2.5 0 00-2-2.4" />
      </svg>
    </span>
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
  presenceOnline = {},
  onOpenChatWithFriend,
  onOpenFriendProfile,
  onOpenAppStatus,
  onOpenPossibleFriends,
  onOpenSettings,
  onOpenPrivacy,
  onOpenSecurity,
  onOpenBugReport,
}) {
  const fileRef = useRef(null);
  const [incoming, setIncoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [notifPerm, setNotifPerm] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );
  const [roleSaving, setRoleSaving] = useState(false);
  const [emojiSaving, setEmojiSaving] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const emojiPickerRef = useRef(null);
  /** main — карточка профиля; friends — список друзей */
  const [profileSubview, setProfileSubview] = useState('main');
  const [fullEditorOpen, setFullEditorOpen] = useState(false);
  const [edFirst, setEdFirst] = useState('');
  const [edLast, setEdLast] = useState('');
  const [edNick, setEdNick] = useState('');
  const [edAbout, setEdAbout] = useState('');
  const [edSaving, setEdSaving] = useState(false);
  const [edErr, setEdErr] = useState(null);
  const [peers, setPeers] = useState([]);
  const [peersLoading, setPeersLoading] = useState(false);
  const [friendMenuId, setFriendMenuId] = useState(null);
  const friendMenuRef = useRef(null);

  const loadPeers = useCallback(async () => {
    if (!user?.id) return;
    setPeersLoading(true);
    const { ok, data } = await api('/api/friends/peers', { userId: user.id });
    setPeersLoading(false);
    if (ok) setPeers(data.peers || []);
  }, [user?.id]);

  useEffect(() => {
    void loadPeers();
  }, [loadPeers, socialTick]);

  useEffect(() => {
    if (!friendMenuId) return;
    function onDoc(e) {
      if (friendMenuRef.current && !friendMenuRef.current.contains(e.target)) setFriendMenuId(null);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [friendMenuId]);

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

  async function removeFriendPeer(peerId) {
    setFriendMenuId(null);
    if (!user?.id || !peerId) return;
    if (
      !window.confirm(
        'Убрать из друзей? Личный чат останется; при необходимости можно снова отправить заявку.',
      )
    )
      return;
    const { ok, data } = await api('/api/friends/remove', {
      method: 'POST',
      body: { peerUserId: peerId },
      userId: user.id,
    });
    if (!ok) {
      alert(data?.error || 'Не удалось');
      return;
    }
    await loadPeers();
    onFriendsChanged?.();
  }

  async function blockFriendPeer(peerId) {
    setFriendMenuId(null);
    if (!user?.id || !peerId) return;
    if (!window.confirm('Заблокировать пользователя? Он не сможет писать вам и исчезнет из списка друзей.')) return;
    const { ok, data } = await api('/api/friends/block', {
      method: 'POST',
      body: { peerUserId: peerId },
      userId: user.id,
    });
    if (!ok) {
      alert(data?.error || 'Не удалось');
      return;
    }
    await loadPeers();
    onFriendsChanged?.();
  }

  const displayPhone = user?.phone ? formatPhoneRu(user.phone) : '';

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

  function openFullEditor() {
    if (!user?.id) return;
    setEdFirst(String(user.firstName ?? '').trim());
    setEdLast(String(user.lastName ?? '').trim());
    setEdNick(String(user.nickname ?? '').trim());
    setEdAbout(user?.about != null ? String(user.about) : '');
    setEdErr(null);
    setFullEditorOpen(true);
  }

  function closeFullEditor() {
    if (edSaving) return;
    setFullEditorOpen(false);
    setEdErr(null);
  }

  async function saveFullProfile() {
    if (!user?.id) return;
    setEdErr(null);
    const f = edFirst.trim().slice(0, 60);
    const l = edLast.trim().slice(0, 60);
    const rawNick = edNick.trim().replace(/^@/, '').toLowerCase().slice(0, 30);
    const aboutStr = edAbout.slice(0, MAX_ABOUT);
    if (!f || !l) {
      setEdErr('Укажите имя и фамилию');
      return;
    }
    if (rawNick !== (user.nickname || '').toLowerCase() && !nicknameChangeAllowed(user)) {
      setEdErr(
        (user?.nicknameChangesRemaining ?? 0) <= 0
          ? 'Лимит смен username исчерпан'
          : 'Сейчас нельзя сменить username',
      );
      return;
    }
    setEdSaving(true);
    const { ok, data } = await api('/api/users/me', {
      method: 'PATCH',
      body: { firstName: f, lastName: l, nickname: rawNick, about: aboutStr },
      userId: user.id,
    });
    setEdSaving(false);
    if (!ok) {
      setEdErr(data?.error || 'Не удалось сохранить');
      return;
    }
    if (data?.user) {
      setStoredUser(data.user);
      onUserUpdated?.(data.user);
    }
    setFullEditorOpen(false);
  }

  function scrollToAffiliationEmoji() {
    document.getElementById('profile-affiliation-block')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  const displayNameLine = [user?.firstName, user?.lastName].filter((x) => x && String(x).trim()).join(' ').trim() || '—';

  return (
    <>
    {profileSubview === 'friends' ? (
      <section style={{ padding: '12px 14px 28px', maxWidth: 520, margin: '0 auto' }}>
        <button type="button" className="profile-tg-back" onClick={() => setProfileSubview('main')}>
          ← Назад
        </button>
        <p className="profile-settings-section-title" style={{ marginTop: 12 }}>
          Друзья
        </p>
        <div className="profile-settings-card" style={{ padding: 14, marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600 }}>Ваши друзья</p>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 10, lineHeight: 1.4 }}>
            Нажмите на строку — открыть чат. Аватар — полный профиль. Меню «⋯» — убрать из друзей или заблокировать.
          </p>
          {peersLoading ? (
            <p className="muted" style={{ margin: 0, fontSize: 11 }}>
              Загрузка…
            </p>
          ) : peers.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 11 }}>
              Пока нет друзей — примите заявку или отправьте свою из поиска.
            </p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {peers.map((peer) => {
                const fullName = [peer.firstName, peer.lastName].filter(Boolean).join(' ').trim();
                const online =
                  peer.id != null && Object.prototype.hasOwnProperty.call(presenceOnline, String(peer.id))
                    ? Boolean(presenceOnline[String(peer.id)])
                    : undefined;
                return (
                  <li key={peer.id} style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div
                        onClick={() => onOpenChatWithFriend?.(peer)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 10px',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          background: 'var(--bg)',
                          color: 'inherit',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <UserAvatar
                          src={peer.avatarUrl}
                          size={40}
                          presenceOnline={typeof online === 'boolean' ? online : undefined}
                          onOpen={
                            typeof onOpenFriendProfile === 'function'
                              ? () => onOpenFriendProfile(peer.id)
                              : undefined
                          }
                          ariaLabel="Профиль"
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>
                            {peer.nickname ? (
                              <NicknameWithBadge nickname={peer.nickname} affiliationEmoji={peer.affiliationEmoji} />
                            ) : (
                              '—'
                            )}
                          </div>
                          {fullName ? (
                            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                              {fullName}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div ref={friendMenuId === peer.id ? friendMenuRef : null} style={{ position: 'relative', flexShrink: 0 }}>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Действия"
                          aria-expanded={friendMenuId === peer.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFriendMenuId((id) => (id === peer.id ? null : peer.id));
                          }}
                          style={{ width: 36, height: 36 }}
                        >
                          ⋯
                        </button>
                        {friendMenuId === peer.id ? (
                          <div
                            role="menu"
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: '100%',
                              marginTop: 4,
                              minWidth: 200,
                              padding: '6px 0',
                              background: 'var(--bg)',
                              border: '1px solid var(--border)',
                              borderRadius: 8,
                              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                              zIndex: 25,
                            }}
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void removeFriendPeer(peer.id)}
                              style={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                padding: '8px 12px',
                                border: 'none',
                                background: 'none',
                                color: 'inherit',
                                fontSize: 13,
                                cursor: 'pointer',
                              }}
                            >
                              Убрать из друзей
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void blockFriendPeer(peer.id)}
                              style={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                padding: '8px 12px',
                                border: 'none',
                                background: 'none',
                                color: '#c45c5c',
                                fontSize: 13,
                                cursor: 'pointer',
                              }}
                            >
                              Заблокировать
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    ) : (
    <section style={{ padding: '0 0 28px', maxWidth: 520, margin: '0 auto' }}>
      <header className="profile-tg-hero">
        <div className="profile-tg-hero-pattern" aria-hidden />
        <div className="profile-tg-hero-bar">
          <button type="button" className="profile-tg-square-btn" aria-label="Меню" onClick={() => onOpenSettings?.()}>
            <TgGridIcon />
          </button>
          <button type="button" className="profile-tg-pill-btn" onClick={openFullEditor}>
            Изм.
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden onChange={onPickAvatar} />
        <div className="profile-tg-avatar-wrap">
          <UserAvatar
            src={user?.avatarUrl}
            size={104}
            onOpen={user?.avatarUrl && typeof onViewAvatar === 'function' ? () => onViewAvatar(user.avatarUrl) : undefined}
          />
        </div>
        <h1 className="profile-tg-display-name">{displayNameLine}</h1>
        <div className="profile-tg-subline">
          <span>{displayPhone || '—'}</span>
          {user?.nickname ? (
            <>
              <span className="profile-tg-dot">·</span>
              <span className="profile-tg-username">@{user.nickname}</span>
            </>
          ) : null}
        </div>
      </header>

      <div style={{ padding: '12px 14px 0' }}>
        <div className="profile-settings-card profile-tg-compact-card" style={{ padding: 0, marginBottom: 12, overflow: 'hidden' }}>
          <button type="button" className="profile-tg-row" onClick={scrollToAffiliationEmoji}>
            <TgRowIconSmile />
            <span className="profile-tg-row__label profile-tg-row__label--accent">Сменить эмодзи-статус</span>
            <span className="profile-tg-row__chev" aria-hidden>
              ›
            </span>
          </button>
          <div className="profile-tg-row-divider" />
          <button
            type="button"
            className="profile-tg-row"
            onClick={() => document.getElementById('profile-display-block')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            <TgRowIconSparkle />
            <span className="profile-tg-row__label profile-tg-row__label--accent">Изменить цвет профиля</span>
            <span className="profile-tg-row__chev" aria-hidden>
              ›
            </span>
          </button>
          <div className="profile-tg-row-divider" />
          <button type="button" className="profile-tg-row" onClick={() => fileRef.current?.click()}>
            <TgRowIconCamera />
            <span className="profile-tg-row__label profile-tg-row__label--accent">Изменить фотографию</span>
            <span className="profile-tg-row__chev" aria-hidden>
              ›
            </span>
          </button>
        </div>

        <div className="profile-settings-card profile-tg-compact-card" style={{ padding: 0, marginBottom: 12, overflow: 'hidden' }}>
          {typeof onPreviewOwnProfile === 'function' ? (
            <button type="button" className="profile-tg-row" onClick={() => onPreviewOwnProfile()}>
              <TgRowIconPerson />
              <span className="profile-tg-row__label">Мой профиль</span>
              <span className="profile-tg-row__chev" aria-hidden>
                ›
              </span>
            </button>
          ) : null}
          {typeof onPreviewOwnProfile === 'function' ? <div className="profile-tg-row-divider" /> : null}
          <button type="button" className="profile-tg-row" onClick={() => setProfileSubview('friends')}>
            <TgRowIconUsers />
            <span className="profile-tg-row__label">Друзья</span>
            <span className="profile-tg-row__chev" aria-hidden>
              ›
            </span>
          </button>
        </div>

        <p className="profile-settings-section-title" style={{ marginTop: 0 }}>
          Сервис и настройки
        </p>
        <div className="profile-settings-card" style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
          <button type="button" className="profile-service-row" onClick={() => onOpenAppStatus?.()}>
            <span>Статус приложения</span>
            <span className="profile-service-row__chev" aria-hidden>
              ›
            </span>
          </button>
          <button type="button" className="profile-service-row" onClick={() => onOpenPossibleFriends?.()}>
            <span>Возможно друзья</span>
            <span className="profile-service-row__chev" aria-hidden>
              ›
            </span>
          </button>
          <button type="button" className="profile-service-row" onClick={() => onOpenSettings?.()}>
            <span>Настройки</span>
            <span className="profile-service-row__chev" aria-hidden>
              ›
            </span>
          </button>
          <button type="button" className="profile-service-row" onClick={() => onOpenPrivacy?.()}>
            <span>Конфиденциальность</span>
            <span className="profile-service-row__chev" aria-hidden>
              ›
            </span>
          </button>
          <button type="button" className="profile-service-row" onClick={() => onOpenSecurity?.()}>
            <span>Безопасность</span>
            <span className="profile-service-row__chev" aria-hidden>
              ›
            </span>
          </button>
          <button type="button" className="profile-service-row" onClick={() => onOpenBugReport?.()}>
            <span>Сообщить о баге</span>
            <span className="profile-service-row__chev" aria-hidden>
              ›
            </span>
          </button>
        </div>

        <p className="muted" style={{ margin: '0 0 14px', fontSize: 12, lineHeight: 1.4 }}>
          Данные аккаунта и отображение в чатах
        </p>

      <p className="profile-settings-section-title">Отображение в приложении</p>
      <div id="profile-display-block" className="profile-settings-card" style={{ marginBottom: 12 }}>
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

        <p id="profile-affiliation-block" style={{ margin: '12px 0 6px', fontSize: 11 }} className="muted">
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
        <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {user?.about != null && String(user.about).trim() ? String(user.about) : '—'}
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 10 }}>
          Редактирование — кнопка «Изм.» в шапке профиля.
        </p>

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
      </div>
    </section>
    )}

    {fullEditorOpen ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-full-editor-title"
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
        onClick={() => closeFullEditor()}
        onKeyDown={(e) => e.key === 'Escape' && closeFullEditor()}
      >
        <div
          className="block modal-panel profile-field-modal-panel"
          style={{ width: '100%', maxWidth: 420, padding: 16, maxHeight: 'min(90vh, 640px)', overflow: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span id="profile-full-editor-title" style={{ fontSize: 15, fontWeight: 700 }}>
              Редактировать профиль
            </span>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 36, height: 36 }}
              disabled={edSaving}
              onClick={() => closeFullEditor()}
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>

          <label className="muted" style={{ display: 'block', fontSize: 11, marginBottom: 4 }}>
            Имя
          </label>
          <input
            className="text-input"
            style={{ width: '100%', fontSize: 15, marginBottom: 10 }}
            value={edFirst}
            onChange={(e) => setEdFirst(e.target.value.slice(0, 60))}
            autoComplete="given-name"
            disabled={edSaving}
          />
          <label className="muted" style={{ display: 'block', fontSize: 11, marginBottom: 4 }}>
            Фамилия
          </label>
          <input
            className="text-input"
            style={{ width: '100%', fontSize: 15, marginBottom: 10 }}
            value={edLast}
            onChange={(e) => setEdLast(e.target.value.slice(0, 60))}
            autoComplete="family-name"
            disabled={edSaving}
          />

          <p className="muted" style={{ margin: '0 0 8px', fontSize: 11, lineHeight: 1.45 }}>
            Username: латиница, цифры и _. До 30 символов. Осталось смен:{' '}
            <strong style={{ color: 'var(--text)' }}>{user?.nicknameChangesRemaining ?? 0}</strong> из 2.
            {user && !nicknameChangeAllowed(user) && (user.nicknameChangesRemaining ?? 0) > 0 && nextNicknameChangeAfter(user) ? (
              <> Следующая смена: {nextNicknameChangeAfter(user).toLocaleString('ru-RU')}.</>
            ) : null}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 16, color: 'var(--muted)', flexShrink: 0 }}>@</span>
            <input
              className="text-input"
              style={{ flex: 1, minWidth: 0, fontSize: 15 }}
              value={edNick}
              onChange={(e) => setEdNick(e.target.value.replace(/^@/, '').toLowerCase().slice(0, 30))}
              placeholder="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={edSaving || nicknameEditBlocked}
            />
          </div>

          <label className="muted" style={{ display: 'block', fontSize: 11, marginBottom: 4 }}>
            О себе (до {MAX_ABOUT} символов)
          </label>
          <textarea
            className="text-input profile-about-textarea"
            value={edAbout}
            onChange={(e) => setEdAbout(e.target.value.slice(0, MAX_ABOUT))}
            maxLength={MAX_ABOUT}
            rows={4}
            placeholder="Коротко о себе"
            style={{ width: '100%', marginBottom: 10, resize: 'vertical', minHeight: 88 }}
            disabled={edSaving}
          />

          {edErr ? <p style={{ margin: '0 0 10px', fontSize: 12, color: '#c45c5c' }}>{edErr}</p> : null}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn-outline" disabled={edSaving} onClick={() => closeFullEditor()}>
              Отмена
            </button>
            <button
              type="button"
              className="btn-outline"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              disabled={edSaving}
              onClick={() => void saveFullProfile()}
            >
              {edSaving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

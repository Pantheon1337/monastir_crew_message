import { useEffect, useState, useCallback, useRef } from 'react';
import { clearStoredUser, setStoredUser } from '../authStorage.js';
import { api, apiUpload } from '../api.js';
import UserAvatar from './UserAvatar.jsx';
import NicknameWithBadge from './NicknameWithBadge.jsx';
import { AFFILIATION_EMOJI_CHOICES } from '../affiliationConstants.js';
import { formatPhoneRu } from '../formatPhone.js';

const MAX_ABOUT = 100;

/** Фон шапки профиля (как в Telegram — приглушённые градиенты) */
const PROFILE_HERO_TINTS = [
  { label: 'Тёмный', bg: 'linear-gradient(180deg, #25252c 0%, #16161b 100%)' },
  { label: 'Синий', bg: 'linear-gradient(180deg, #2c3848 0%, #1e2835 100%)' },
  { label: 'Бирюза', bg: 'linear-gradient(180deg, #243d3d 0%, #1a2e2e 100%)' },
  { label: 'Тёплый', bg: 'linear-gradient(180deg, #3d362e 0%, #262018 100%)' },
  { label: 'Пурпур', bg: 'linear-gradient(180deg, #332d3d 0%, #221a2a 100%)' },
];

function profileHeroTintKey(userId) {
  return userId != null ? `profileHeroTint:${userId}` : null;
}

function readProfileHeroTint(userId) {
  const k = profileHeroTintKey(userId);
  if (!k || typeof localStorage === 'undefined') return 0;
  const n = parseInt(localStorage.getItem(k), 10);
  if (Number.isNaN(n) || n < 0 || n >= PROFILE_HERO_TINTS.length) return 0;
  return n;
}

function writeProfileHeroTint(userId, index) {
  const k = profileHeroTintKey(userId);
  if (!k || typeof localStorage === 'undefined') return;
  localStorage.setItem(k, String(index));
}

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

function ProfileIncomingRequests({ loading, incoming, actionId, onAccept, onReject }) {
  return (
    <div className="profile-settings-card" style={{ padding: 14, marginBottom: 12 }}>
      <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600 }}>Входящие заявки</p>
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
                  onClick={() => onAccept(r.id)}
                >
                  ✓
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 36, height: 36, color: '#c45c5c' }}
                  disabled={actionId === r.id}
                  aria-label="Отклонить"
                  onClick={() => onReject(r.id)}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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
  const [roleSaving, setRoleSaving] = useState(false);
  const [emojiSaving, setEmojiSaving] = useState(false);
  const [emojiSheetOpen, setEmojiSheetOpen] = useState(false);
  const [profileColorSheetOpen, setProfileColorSheetOpen] = useState(false);
  const [heroTintIndex, setHeroTintIndex] = useState(0);
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
    setHeroTintIndex(readProfileHeroTint(user?.id));
  }, [user?.id]);

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
    await loadPeers();
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

  async function applyAffiliationEmoji(raw) {
    if (!user?.id) return;
    setEmojiSaving(true);
    const { ok, data } = await api('/api/users/me', {
      method: 'PATCH',
      body: { affiliationEmoji: raw },
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
    setEmojiSheetOpen(false);
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
  const heroBg = PROFILE_HERO_TINTS[Math.min(heroTintIndex, PROFILE_HERO_TINTS.length - 1)]?.bg ?? PROFILE_HERO_TINTS[0].bg;
  const incomingCount = incoming.length;

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
        <ProfileIncomingRequests
          loading={loading}
          incoming={incoming}
          actionId={actionId}
          onAccept={accept}
          onReject={reject}
        />
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
      <header className="profile-tg-hero" style={{ background: heroBg }}>
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
          <button type="button" className="profile-tg-row" onClick={() => setEmojiSheetOpen(true)}>
            <TgRowIconSmile />
            <span className="profile-tg-row__label profile-tg-row__label--accent">Сменить эмодзи-статус</span>
            <span className="profile-tg-row__chev" aria-hidden>
              ›
            </span>
          </button>
          <div className="profile-tg-row-divider" />
          <button type="button" className="profile-tg-row" onClick={() => setProfileColorSheetOpen(true)}>
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
            {incomingCount > 0 ? (
              <span className="profile-tg-incoming-badge" aria-label={`Входящих заявок: ${incomingCount}`}>
                {incomingCount > 99 ? '99+' : incomingCount}
              </span>
            ) : null}
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

      </div>
    </section>
    )}

    {emojiSheetOpen ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-emoji-sheet-title"
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
        onClick={() => !emojiSaving && setEmojiSheetOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && !emojiSaving && setEmojiSheetOpen(false)}
      >
        <div
          className="block modal-panel profile-emoji-sheet-panel"
          style={{ width: '100%', maxWidth: 360, padding: 16, maxHeight: 'min(85vh, 520px)', overflow: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span id="profile-emoji-sheet-title" style={{ fontSize: 15, fontWeight: 700 }}>
              Смайлик у ника
            </span>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 36, height: 36 }}
              disabled={emojiSaving}
              onClick={() => setEmojiSheetOpen(false)}
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>
          <button
            type="button"
            className="btn-outline"
            style={{ width: '100%', marginBottom: 12, opacity: emojiSaving ? 0.6 : 1 }}
            disabled={emojiSaving}
            onClick={() => void applyAffiliationEmoji('')}
          >
            По умолчанию (как у роли)
          </button>
          <div className="profile-emoji-sheet-grid">
            {AFFILIATION_EMOJI_CHOICES.map((em) => (
              <button
                key={em}
                type="button"
                className="profile-emoji-sheet-cell btn-outline"
                title={em}
                disabled={emojiSaving}
                style={{
                  borderColor: user?.customAffiliationEmoji === em ? 'var(--accent)' : undefined,
                }}
                onClick={() => void applyAffiliationEmoji(em)}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
      </div>
    ) : null}

    {profileColorSheetOpen ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-color-sheet-title"
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
        onClick={() => setProfileColorSheetOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setProfileColorSheetOpen(false)}
      >
        <div
          className="block modal-panel"
          style={{ width: '100%', maxWidth: 360, padding: 16 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span id="profile-color-sheet-title" style={{ fontSize: 15, fontWeight: 700 }}>
              Цвет профиля
            </span>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 36, height: 36 }}
              onClick={() => setProfileColorSheetOpen(false)}
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>
          <p className="muted" style={{ margin: '0 0 14px', fontSize: 12, lineHeight: 1.45 }}>
            Фон за аватаром в шапке. Сохраняется на этом устройстве.
          </p>
          <div className="profile-hero-tint-grid">
            {PROFILE_HERO_TINTS.map((t, i) => (
              <button
                key={t.label}
                type="button"
                className="profile-hero-tint-swatch"
                title={t.label}
                aria-label={t.label}
                aria-pressed={heroTintIndex === i}
                style={{ background: t.bg }}
                onClick={() => {
                  setHeroTintIndex(i);
                  if (user?.id) writeProfileHeroTint(user.id, i);
                  setProfileColorSheetOpen(false);
                }}
              >
                {heroTintIndex === i ? <span className="profile-hero-tint-swatch__check">✓</span> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    ) : null}

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

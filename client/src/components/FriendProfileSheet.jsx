import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../api.js';
import UserAvatar from './UserAvatar.jsx';
import { formatPhoneRu } from '../formatPhone.js';
import { profileHeroTintBg } from '../profileHeroTints.js';
import { peerPresenceSubtitle } from '../presenceSubtitle.js';

function formatJoined(ts) {
  if (ts == null) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function profileRoleCaption(displayRole) {
  if (displayRole === 'developer') return 'Разработчик';
  if (displayRole === 'beta') return 'Бета-тестер';
  return 'Пользователь';
}

function presenceLineForPeer(peerId, presenceOnline, presenceLastSeen, presenceLastSeenHidden) {
  if (peerId == null) return null;
  const id = String(peerId);
  const hasO = Object.prototype.hasOwnProperty.call(presenceOnline, id);
  const online = hasO ? Boolean(presenceOnline[id]) : undefined;
  const lastAt = presenceLastSeen[id];
  const hidden = presenceLastSeenHidden[id] === true;
  return peerPresenceSubtitle(online, lastAt, hidden);
}

export default function FriendProfileSheet({
  targetUserId,
  viewerId,
  onClose,
  onFriendshipChanged,
  onViewAvatar,
  onViewFullProfile,
  presenceOnline = {},
  presenceLastSeen = {},
  presenceLastSeenHidden = {},
  onOpenDirectChat,
}) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isSelf, setIsSelf] = useState(false);
  const [friendship, setFriendship] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const { ok, data } = await api(`/api/users/${encodeURIComponent(targetUserId)}/profile`, { userId: viewerId });
    if (!ok) {
      setErr(data?.error || 'Не удалось загрузить');
      setLoading(false);
      return;
    }
    setProfile(data.user);
    setIsSelf(Boolean(data.isSelf));
    setFriendship(data.friendship ?? null);
    setLoading(false);
  }, [targetUserId, viewerId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const heroBg = useMemo(() => profileHeroTintBg(profile?.profileHeroTint ?? 0), [profile?.profileHeroTint]);

  const presenceText = useMemo(
    () => presenceLineForPeer(targetUserId, presenceOnline, presenceLastSeen, presenceLastSeenHidden),
    [targetUserId, presenceOnline, presenceLastSeen, presenceLastSeenHidden],
  );

  const displayName = profile
    ? [profile.firstName, profile.lastName].filter((x) => x && String(x).trim()).join(' ').trim() || '—'
    : '';

  async function doRemoveFriend() {
    if (!viewerId || !targetUserId) return;
    if (!window.confirm('Удалить из друзья? Переписка сохранится, но писать друг другу будет нельзя, пока снова не станете друзьями.')) {
      return;
    }
    setBusy(true);
    const { ok, data } = await api('/api/friends/remove', {
      method: 'POST',
      body: { peerUserId: targetUserId },
      userId: viewerId,
    });
    setBusy(false);
    if (!ok) {
      alert(data?.error || 'Не удалось');
      return;
    }
    await onFriendshipChanged?.();
    await load();
  }

  async function doBlock() {
    if (!viewerId || !targetUserId) return;
    if (!window.confirm('Заблокировать? Этот человек не сможет писать вам; вы сможете писать ему, если он вас не заблокировал.')) {
      return;
    }
    setBusy(true);
    const { ok, data } = await api('/api/friends/block', {
      method: 'POST',
      body: { peerUserId: targetUserId },
      userId: viewerId,
    });
    setBusy(false);
    if (!ok) {
      alert(data?.error || 'Не удалось');
      return;
    }
    await onFriendshipChanged?.();
    await load();
  }

  async function doUnblock() {
    if (!viewerId || !targetUserId) return;
    setBusy(true);
    const { ok, data } = await api('/api/friends/unblock', {
      method: 'POST',
      body: { peerUserId: targetUserId },
      userId: viewerId,
    });
    setBusy(false);
    if (!ok) {
      alert(data?.error || 'Не удалось');
      return;
    }
    await onFriendshipChanged?.();
    await load();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="modal-overlay friend-mini-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        paddingTop: 'max(12px, env(safe-area-inset-top))',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      }}
      onClick={onClose}
    >
      <div
        className="friend-mini-sheet block"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Загрузка…
            </p>
          </div>
        ) : err ? (
          <div style={{ padding: 24 }}>
            <p style={{ fontSize: 13, color: '#c45c5c', margin: 0 }}>{err}</p>
          </div>
        ) : profile ? (
          <>
            <header className="friend-mini-hero" style={{ background: heroBg }}>
              <div className="friend-mini-hero-pattern" aria-hidden />
              <div className="friend-mini-hero-top">
                <button type="button" className="friend-mini-circle-btn" onClick={onClose} aria-label="Закрыть">
                  ‹
                </button>
                <div style={{ flex: 1 }} />
              </div>
              <div className="friend-mini-hero-main">
                <UserAvatar
                  src={profile.avatarUrl}
                  size={96}
                  onOpen={
                    profile.avatarUrl && typeof onViewAvatar === 'function' ? () => onViewAvatar(profile.avatarUrl) : undefined
                  }
                />
                <h2 className="friend-mini-name">
                  <span className="friend-mini-name__text">{displayName}</span>
                  {profile.affiliationEmoji ? (
                    <span className="friend-mini-name__emoji" aria-hidden>
                      {profile.affiliationEmoji}
                    </span>
                  ) : null}
                </h2>
                {presenceText ? <p className="friend-mini-presence">{presenceText}</p> : null}

                <div className="friend-mini-actions friend-mini-actions--compact">
                  {!isSelf && typeof onOpenDirectChat === 'function' ? (
                    <button type="button" className="friend-mini-action-btn friend-mini-action-btn--sm" onClick={onOpenDirectChat} title="Чат">
                      <span className="friend-mini-action-btn__icon" aria-hidden>
                        💬
                      </span>
                      <span className="friend-mini-action-btn__label">Чат</span>
                    </button>
                  ) : null}
                  {!isSelf && typeof onViewFullProfile === 'function' ? (
                    <button type="button" className="friend-mini-action-btn friend-mini-action-btn--sm" onClick={onViewFullProfile} title="Профиль">
                      <span className="friend-mini-action-btn__icon" aria-hidden>
                        👤
                      </span>
                      <span className="friend-mini-action-btn__label">Профиль</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </header>

            <div className="friend-mini-card">
              {isSelf && profile.phone ? (
                <div className="friend-mini-row">
                  <span className="friend-mini-row__label">мобильный</span>
                  <span className="friend-mini-row__value friend-mini-row__value--accent">{formatPhoneRu(profile.phone)}</span>
                </div>
              ) : null}
              {profile.nickname ? (
                <div className="friend-mini-row">
                  <span className="friend-mini-row__label">имя пользователя</span>
                  <span className="friend-mini-row__value friend-mini-row__value--accent">@{profile.nickname}</span>
                </div>
              ) : null}
              <div className="friend-mini-row">
                <span className="friend-mini-row__label">роль</span>
                <span className="friend-mini-row__value">{profileRoleCaption(profile.displayRole)}</span>
              </div>
              {profile.about ? (
                <div className="friend-mini-about">
                  <span className="friend-mini-row__label">о себе</span>
                  <p className="friend-mini-about__text">{profile.about}</p>
                </div>
              ) : null}
              <p className="friend-mini-meta-muted">в сервисе с {formatJoined(profile.createdAt)}</p>
            </div>

            {!isSelf && friendship?.hasDirectChat ? (
              <div className="friend-mini-footer-actions">
                {friendship.theyBlockedYou ? (
                  <p className="muted" style={{ fontSize: 10, margin: '0 0 10px', lineHeight: 1.4 }}>
                    Этот пользователь ограничил вам сообщения.
                  </p>
                ) : null}
                {friendship.friendsActive ? (
                  <button
                    type="button"
                    className="btn-outline"
                    style={{ width: '100%', marginBottom: 8, color: '#c45c5c', borderColor: 'rgba(196,92,92,0.5)' }}
                    disabled={busy}
                    onClick={() => void doRemoveFriend()}
                  >
                    Удалить из друзей
                  </button>
                ) : (
                  <p className="muted" style={{ fontSize: 10, margin: '0 0 10px', lineHeight: 1.4 }}>
                    Вы не в друзьях. История чата сохранена; чтобы снова писать, отправьте заявку в друзья.
                  </p>
                )}
                {friendship.youBlockedThem ? (
                  <button type="button" className="btn-outline" style={{ width: '100%' }} disabled={busy} onClick={() => void doUnblock()}>
                    Разблокировать
                  </button>
                ) : (
                  <button type="button" className="btn-outline" style={{ width: '100%' }} disabled={busy} onClick={() => void doBlock()}>
                    Заблокировать
                  </button>
                )}
                <p className="muted" style={{ fontSize: 9, margin: '10px 0 0', lineHeight: 1.35 }}>
                  Блокировка не удаляет из друзей: собеседник не сможет писать вам, пока вы его заблокировали.
                </p>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

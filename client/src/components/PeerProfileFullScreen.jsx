import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, mediaPublicUrl } from '../api.js';
import UserAvatar from './UserAvatar.jsx';
import FriendMiniActionIcon from './FriendMiniActionIcon.jsx';
import { formatPhoneRu } from '../formatPhone.js';
import { profileHeroBackground } from '../profileHeroTints.js';
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

/**
 * Полноэкранный профиль другого пользователя: шапка, истории в ряд (как в ленте), о себе, действия дружбы.
 */
export default function PeerProfileFullScreen({
  targetUserId,
  viewerId,
  onClose,
  onFriendshipChanged,
  onViewAvatar,
  onOpenStory,
  onStoriesUpdated,
  viewerPreview = false,
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
  const [storyItems, setStoryItems] = useState([]);
  const [manageItems, setManageItems] = useState([]);
  const [storyBusyId, setStoryBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [profRes, storyRes] = await Promise.all([
      api(`/api/users/${encodeURIComponent(targetUserId)}/profile`, { userId: viewerId }),
      api(`/api/stories/author/${encodeURIComponent(targetUserId)}?profileGrid=1`, { userId: viewerId }),
    ]);
    if (!profRes.ok) {
      setErr(profRes.data?.error || 'Не удалось загрузить');
      setLoading(false);
      return;
    }
    const self = Boolean(profRes.data.isSelf);
    setProfile(profRes.data.user);
    setIsSelf(self);
    setFriendship(profRes.data.friendship ?? null);
    if (storyRes.ok) setStoryItems(storyRes.data?.items || []);
    else setStoryItems([]);
    if (self) {
      const m = await api('/api/stories/me/manage', { userId: viewerId });
      setManageItems(m.ok ? m.data?.items || [] : []);
    } else {
      setManageItems([]);
    }
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

  /** В сетке: у себя — кадры «в профиле», не убранные в архив с ленты; у других — то же по API (без лимита 24 ч). */
  const gridStories = useMemo(() => {
    if (isSelf && !viewerPreview) return manageItems;
    return storyItems;
  }, [isSelf, viewerPreview, manageItems, storyItems]);

  const hasStoriesGrid = gridStories.length > 0;

  const heroBg = useMemo(
    () => profileHeroBackground(profile?.profileHeroTint ?? 0, profile?.affiliationEmoji),
    [profile?.profileHeroTint, profile?.affiliationEmoji],
  );

  const displayName = profile
    ? [profile.firstName, profile.lastName].filter((x) => x && String(x).trim()).join(' ').trim() || '—'
    : '';

  const presenceText = useMemo(
    () =>
      !isSelf && profile
        ? presenceLineForPeer(targetUserId, presenceOnline, presenceLastSeen, presenceLastSeenHidden)
        : null,
    [isSelf, profile, targetUserId, presenceOnline, presenceLastSeen, presenceLastSeenHidden],
  );

  async function doRemoveFriend() {
    if (!viewerId || !targetUserId) return;
    if (
      !window.confirm(
        'Удалить из друзья? Переписка сохранится, но писать друг другу будет нельзя, пока снова не станете друзьями.',
      )
    ) {
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

  async function storyHideFromProfile(storyId) {
    if (!viewerId) return;
    setStoryBusyId(storyId);
    const { ok, data } = await api(`/api/stories/${encodeURIComponent(storyId)}/hide-from-profile`, {
      method: 'POST',
      userId: viewerId,
    });
    setStoryBusyId(null);
    if (!ok) {
      alert(data?.error || 'Не удалось');
      return;
    }
    onStoriesUpdated?.();
    await load();
  }

  async function storyDeleteForever(storyId) {
    if (!viewerId) return;
    if (!window.confirm('Удалить этот кадр безвозвратно?')) return;
    setStoryBusyId(storyId);
    const { ok, data } = await api(`/api/stories/${encodeURIComponent(storyId)}`, { method: 'DELETE', userId: viewerId });
    setStoryBusyId(null);
    if (!ok) {
      alert(data?.error || 'Не удалось');
      return;
    }
    onStoriesUpdated?.();
    await load();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Профиль"
      className="modal-overlay peer-profile-full-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 130,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        paddingTop: 'max(0px, env(safe-area-inset-top))',
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {loading ? (
          <p className="muted" style={{ fontSize: 12, padding: 16 }}>
            Загрузка…
          </p>
        ) : err ? (
          <p style={{ fontSize: 12, color: '#c45c5c', padding: 16 }}>{err}</p>
        ) : profile ? (
          <>
            {viewerPreview && isSelf ? (
              <p
                className="muted"
                style={{
                  fontSize: 11,
                  textAlign: 'center',
                  margin: '12px 14px 0',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  lineHeight: 1.45,
                }}
              >
                Предпросмотр: так ваш профиль видят другие (без телефона и служебных данных).
              </p>
            ) : null}

            <header className="friend-mini-hero peer-profile-full-hero" style={{ background: heroBg }}>
              <div className="friend-mini-hero-pattern" aria-hidden />
              <div className="friend-mini-hero-top">
                <button type="button" className="friend-mini-circle-btn" onClick={onClose} aria-label="Назад">
                  ‹
                </button>
                <div style={{ flex: 1 }} />
              </div>
              <div className="friend-mini-hero-main">
                <UserAvatar
                  src={profile.avatarUrl}
                  size={104}
                  onOpen={profile.avatarUrl && onViewAvatar ? () => onViewAvatar(profile.avatarUrl) : undefined}
                />
                <h1 className="friend-mini-name" style={{ fontSize: 22 }}>
                  <span className="friend-mini-name__text">{displayName}</span>
                  {profile.affiliationEmoji ? (
                    <span className="friend-mini-name__emoji" aria-hidden>
                      {profile.affiliationEmoji}
                    </span>
                  ) : null}
                </h1>
                {!isSelf && presenceText ? <p className="friend-mini-presence">{presenceText}</p> : null}

                <div className="friend-mini-actions">
                  {!isSelf &&
                  friendship?.hasDirectChat &&
                  typeof onOpenDirectChat === 'function' &&
                  friendship.canMessage !== false &&
                  !friendship.theyBlockedYou ? (
                    <button type="button" className="friend-mini-action-btn" onClick={() => void onOpenDirectChat()} title="Написать">
                      <span className="friend-mini-action-btn__icon friend-mini-action-btn__icon--img" aria-hidden>
                        <FriendMiniActionIcon kind="chat" size={20} />
                      </span>
                      <span className="friend-mini-action-btn__label">Написать</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </header>

            <div className="friend-mini-card peer-profile-full-card">
              {isSelf && profile.phone && !viewerPreview ? (
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

            <div style={{ marginTop: 8, width: '100%', padding: '0 14px 24px' }}>
              <p className="muted" style={{ fontSize: 10, margin: '0 0 10px', fontWeight: 600 }}>
                Публикации
              </p>
              {hasStoriesGrid ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: 8,
                    alignItems: 'stretch',
                  }}
                >
                  {gridStories.map((s) => (
                    <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                      <button
                        type="button"
                        onClick={() => onOpenStory?.(targetUserId, s.id, { profileReel: true })}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          overflow: 'hidden',
                          padding: 0,
                          margin: 0,
                          background: 'var(--panel)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          color: 'inherit',
                          font: 'inherit',
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: 0,
                        }}
                      >
                        <div
                          style={{
                            width: '100%',
                            aspectRatio: '3 / 4',
                            background: 'var(--border)',
                            position: 'relative',
                            flexShrink: 0,
                          }}
                        >
                          {s.mediaUrl ? (
                            <img
                              src={mediaPublicUrl(s.mediaUrl)}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '100%',
                                height: '100%',
                                padding: 8,
                                fontSize: 10,
                                lineHeight: 1.35,
                                overflow: 'hidden',
                                wordBreak: 'break-word',
                                display: '-webkit-box',
                                WebkitLineClamp: 8,
                                WebkitBoxOrient: 'vertical',
                              }}
                            >
                              {s.body || ' '}
                            </div>
                          )}
                        </div>
                        {s.mediaUrl && s.body ? (
                          <div
                            className="muted"
                            style={{
                              fontSize: 9,
                              lineHeight: 1.3,
                              padding: '6px 8px',
                              maxHeight: 42,
                              overflow: 'hidden',
                              wordBreak: 'break-word',
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            {s.body}
                          </div>
                        ) : null}
                      </button>
                      {isSelf && !viewerPreview ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <button
                            type="button"
                            className="btn-outline"
                            style={{ fontSize: 9, padding: '4px 6px', width: '100%' }}
                            disabled={storyBusyId === s.id}
                            title="Кадр исчезнет из сетки на вашей странице у гостей; в приложении останется в ленте/архиве по общим правилам"
                            onClick={(e) => {
                              e.stopPropagation();
                              void storyHideFromProfile(s.id);
                            }}
                          >
                            Убрать с профиля
                          </button>
                          <button
                            type="button"
                            className="btn-outline"
                            style={{
                              fontSize: 9,
                              padding: '4px 6px',
                              width: '100%',
                              color: '#c45c5c',
                              borderColor: 'rgba(196,92,92,0.45)',
                            }}
                            disabled={storyBusyId === s.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void storyDeleteForever(s.id);
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.4 }}>
                  Нет публикаций в профиле.
                </p>
              )}
            </div>

            {!isSelf && friendship?.hasDirectChat ? (
              <div
                style={{
                  width: '100%',
                  marginTop: 0,
                  padding: '12px 14px 28px',
                  borderTop: '1px solid var(--border)',
                  textAlign: 'left',
                }}
              >
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

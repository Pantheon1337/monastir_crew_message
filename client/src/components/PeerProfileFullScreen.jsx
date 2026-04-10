import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../api.js';
import UserAvatar from './UserAvatar.jsx';
import NicknameWithBadge from './NicknameWithBadge.jsx';
import { AvatarRing } from './StoriesBar.jsx';
import { formatPhoneRu } from '../formatPhone.js';

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
  storyBuckets = [],
  presenceOnline = {},
}) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isSelf, setIsSelf] = useState(false);
  const [friendship, setFriendship] = useState(null);
  const [busy, setBusy] = useState(false);
  const [storyItems, setStoryItems] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [profRes, storyRes] = await Promise.all([
      api(`/api/users/${encodeURIComponent(targetUserId)}/profile`, { userId: viewerId }),
      api(`/api/stories/author/${encodeURIComponent(targetUserId)}`, { userId: viewerId }),
    ]);
    if (!profRes.ok) {
      setErr(profRes.data?.error || 'Не удалось загрузить');
      setLoading(false);
      return;
    }
    setProfile(profRes.data.user);
    setIsSelf(Boolean(profRes.data.isSelf));
    setFriendship(profRes.data.friendship ?? null);
    if (storyRes.ok) setStoryItems(storyRes.data?.items || []);
    else setStoryItems([]);
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

  const bucket = useMemo(
    () => storyBuckets.find((b) => String(b.userId) === String(targetUserId)),
    [storyBuckets, targetUserId],
  );

  const hasStories = storyItems.length > 0;
  const ringVariant = useMemo(() => {
    if (!bucket) return hasStories ? 'new' : 'seen';
    if (bucket.allViewed) return 'seen';
    if (bucket.isSelf || String(targetUserId) === String(viewerId)) return 'self';
    return 'new';
  }, [bucket, hasStories, targetUserId, viewerId]);

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

  const peerOn = profile && !isSelf ? Boolean(presenceOnline[String(targetUserId)]) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Профиль"
      className="modal-overlay"
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
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <button type="button" className="icon-btn" style={{ width: 40, height: 40 }} onClick={onClose} aria-label="Назад">
          ←
        </button>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Профиль</span>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '16px 14px 32px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {loading ? (
          <p className="muted" style={{ fontSize: 12 }}>
            Загрузка…
          </p>
        ) : err ? (
          <p style={{ fontSize: 12, color: '#c45c5c' }}>{err}</p>
        ) : profile ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
              <UserAvatar
                src={profile.avatarUrl}
                size={112}
                onOpen={profile.avatarUrl && onViewAvatar ? () => onViewAvatar(profile.avatarUrl) : undefined}
              />
              <div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>
                  {profile.firstName} {profile.lastName}
                </div>
                <div style={{ fontSize: 14, color: 'var(--accent)', marginTop: 6, display: 'flex', justifyContent: 'center' }}>
                  {profile.nickname ? (
                    <NicknameWithBadge nickname={profile.nickname} affiliationEmoji={profile.affiliationEmoji} />
                  ) : (
                    '—'
                  )}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)' }}>{profileRoleCaption(profile.displayRole)}</p>
              </div>
              {isSelf && profile.phone && (
                <div className="muted" style={{ fontSize: 11 }}>
                  тел. {formatPhoneRu(profile.phone)}
                </div>
              )}
            </div>

            <div style={{ marginTop: 22, width: '100%' }}>
              <p className="muted" style={{ fontSize: 10, margin: '0 0 10px', fontWeight: 600 }}>
                Истории
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: 14,
                  overflowX: 'auto',
                  paddingBottom: 6,
                  scrollbarWidth: 'thin',
                  touchAction: 'pan-x',
                }}
              >
                {hasStories ? (
                  <button
                    type="button"
                    onClick={() => onOpenStory?.(targetUserId)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 8,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: 'var(--text)',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ position: 'relative', width: 56, flexShrink: 0 }}>
                      <AvatarRing variant={ringVariant}>
                        <UserAvatar src={profile.avatarUrl} borderless style={{ width: '100%', height: '100%' }} />
                      </AvatarRing>
                      {peerOn != null ? (
                        <span
                          aria-hidden
                          title={peerOn ? 'в сети' : 'не в сети'}
                          style={{
                            position: 'absolute',
                            right: 2,
                            bottom: 2,
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            background: peerOn ? 'var(--online)' : 'rgba(160, 160, 170, 0.85)',
                            border: '2px solid var(--bg)',
                            boxSizing: 'border-box',
                            pointerEvents: 'none',
                          }}
                        />
                      ) : null}
                    </div>
                    <span className="muted" style={{ fontSize: 10, maxWidth: 88, textAlign: 'center' }}>
                      {isSelf ? 'Вы' : profile.nickname ? `@${profile.nickname}` : 'История'}
                    </span>
                  </button>
                ) : (
                  <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.4 }}>
                    Нет активных историй (последние 24 часа).
                  </p>
                )}
              </div>
            </div>

            {profile.about ? (
              <div style={{ width: '100%', textAlign: 'left', marginTop: 18 }}>
                <p className="muted" style={{ fontSize: 10, margin: '0 0 6px' }}>
                  О себе
                </p>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {profile.about}
                </p>
              </div>
            ) : null}

            <div className="muted" style={{ fontSize: 11, marginTop: 16, textAlign: 'center' }}>
              в сервисе с {formatJoined(profile.createdAt)}
            </div>

            {!isSelf && friendship?.hasDirectChat ? (
              <div style={{ width: '100%', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', textAlign: 'left' }}>
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

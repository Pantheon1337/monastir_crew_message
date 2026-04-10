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
  onStoriesUpdated,
  storyBuckets = [],
  presenceOnline = {},
  viewerPreview = false,
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
      api(`/api/stories/author/${encodeURIComponent(targetUserId)}`, { userId: viewerId }),
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

  async function storyToArchive(storyId) {
    if (!viewerId) return;
    setStoryBusyId(storyId);
    const { ok, data } = await api(`/api/stories/${encodeURIComponent(storyId)}/archive`, { method: 'POST', userId: viewerId });
    setStoryBusyId(null);
    if (!ok) {
      alert(data?.error || 'Не удалось');
      return;
    }
    onStoriesUpdated?.();
    await load();
  }

  async function storyFromArchive(storyId) {
    if (!viewerId) return;
    setStoryBusyId(storyId);
    const { ok, data } = await api(`/api/stories/${encodeURIComponent(storyId)}/unarchive`, { method: 'POST', userId: viewerId });
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
            {viewerPreview && isSelf ? (
              <p
                className="muted"
                style={{
                  fontSize: 11,
                  textAlign: 'center',
                  margin: '0 0 14px',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  lineHeight: 1.45,
                }}
              >
                Предпросмотр: так ваш профиль видят другие (без телефона и служебных данных).
              </p>
            ) : null}
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
              {isSelf && profile.phone && !viewerPreview && (
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

            {isSelf && manageItems.length > 0 && !viewerPreview ? (
              <div style={{ marginTop: 20, width: '100%' }}>
                <p className="muted" style={{ fontSize: 10, margin: '0 0 10px', fontWeight: 600 }}>
                  Мои кадры (24 ч)
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {manageItems.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        padding: 10,
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)',
                        background: 'var(--panel)',
                      }}
                    >
                      {s.mediaUrl ? (
                        <img
                          src={s.mediaUrl}
                          alt=""
                          style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 8,
                            background: 'var(--border)',
                            flexShrink: 0,
                            fontSize: 20,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          aria-hidden
                        >
                          ✎
                        </div>
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11, lineHeight: 1.35, wordBreak: 'break-word' }}>
                          {s.body ? s.body.slice(0, 120) : ' '}
                          {s.feedHidden ? (
                            <span className="muted" style={{ display: 'block', marginTop: 4, fontSize: 10 }}>
                              В архиве
                            </span>
                          ) : null}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {s.feedHidden ? (
                            <button
                              type="button"
                              className="btn-outline"
                              style={{ fontSize: 10, padding: '4px 8px', width: 'auto' }}
                              disabled={storyBusyId === s.id}
                              onClick={() => void storyFromArchive(s.id)}
                            >
                              В ленту
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-outline"
                              style={{ fontSize: 10, padding: '4px 8px', width: 'auto' }}
                              disabled={storyBusyId === s.id}
                              onClick={() => void storyToArchive(s.id)}
                            >
                              В архив
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-outline"
                            style={{
                              fontSize: 10,
                              padding: '4px 8px',
                              width: 'auto',
                              color: '#c45c5c',
                              borderColor: 'rgba(196,92,92,0.45)',
                            }}
                            disabled={storyBusyId === s.id}
                            onClick={() => void storyDeleteForever(s.id)}
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

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

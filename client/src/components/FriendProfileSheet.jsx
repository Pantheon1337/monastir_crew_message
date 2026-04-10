import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import UserAvatar from './UserAvatar.jsx';
import NicknameWithBadge from './NicknameWithBadge.jsx';
import { formatPhoneRu } from '../formatPhone.js';

function formatJoined(ts) {
  if (ts == null) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function FriendProfileSheet({ targetUserId, viewerId, onClose, onFriendshipChanged }) {
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
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
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
        className="block modal-panel"
        style={{
          width: '100%',
          maxWidth: 420,
          maxHeight: 'min(85dvh, 640px)',
          overflow: 'auto',
          padding: 16,
          borderRadius: 'var(--radius)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Профиль</span>
          <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        {loading ? (
          <p className="muted" style={{ fontSize: 12 }}>
            Загрузка…
          </p>
        ) : err ? (
          <p style={{ fontSize: 12, color: '#c45c5c' }}>{err}</p>
        ) : profile ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <UserAvatar src={profile.avatarUrl} size={88} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {profile.firstName} {profile.lastName}
              </div>
              <div style={{ fontSize: 13, color: 'var(--accent)', marginTop: 4, display: 'flex', justifyContent: 'center' }}>
                {profile.nickname ? (
                  <NicknameWithBadge nickname={profile.nickname} affiliationEmoji={profile.affiliationEmoji} />
                ) : (
                  '—'
                )}
              </div>
            </div>
            {isSelf && profile.phone && (
              <div className="muted" style={{ fontSize: 11 }}>
                тел. {formatPhoneRu(profile.phone)}
              </div>
            )}
            {profile.about ? (
              <div style={{ width: '100%', textAlign: 'left', marginTop: 4 }}>
                <p className="muted" style={{ fontSize: 10, margin: '0 0 4px' }}>
                  О себе
                </p>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {profile.about}
                </p>
              </div>
            ) : null}
            <div className="muted" style={{ fontSize: 11 }}>
              в сервисе с {formatJoined(profile.createdAt)}
            </div>

            {!isSelf && friendship?.hasDirectChat ? (
              <div style={{ width: '100%', marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border)', textAlign: 'left' }}>
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
                  <button
                    type="button"
                    className="btn-outline"
                    style={{ width: '100%', marginTop: friendship.friendsActive ? 0 : 0 }}
                    disabled={busy}
                    onClick={() => void doBlock()}
                  >
                    Заблокировать
                  </button>
                )}
                <p className="muted" style={{ fontSize: 9, margin: '10px 0 0', lineHeight: 1.35 }}>
                  Блокировка не удаляет из друзей: собеседник не сможет писать вам, пока вы его заблокировали.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

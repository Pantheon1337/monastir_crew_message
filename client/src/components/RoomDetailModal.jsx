import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import UserAvatar from './UserAvatar.jsx';
import NicknameWithBadge from './NicknameWithBadge.jsx';

export default function RoomDetailModal({ userId, roomId, onClose, onRoomUpdated }) {
  const [room, setRoom] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  const [peers, setPeers] = useState([]);
  const [peersLoading, setPeersLoading] = useState(false);
  const [peersErr, setPeersErr] = useState(null);
  const [selectedPeers, setSelectedPeers] = useState(() => new Set());
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState(null);

  const loadRoom = useCallback(async () => {
    if (!userId || !roomId) return;
    setLoading(true);
    setErr(null);
    const { ok, data } = await api(`/api/rooms/${encodeURIComponent(roomId)}`, { userId });
    setLoading(false);
    if (!ok) {
      setErr(data?.error || 'Не удалось загрузить');
      setRoom(null);
      return;
    }
    const r = data.room;
    setRoom(r);
    setEditTitle(r.title ?? '');
    setEditDescription(r.description ?? '');
  }, [userId, roomId]);

  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);

  useEffect(() => {
    if (!userId || !roomId) return undefined;
    let cancelled = false;
    (async () => {
      setPeersLoading(true);
      setPeersErr(null);
      const { ok, data, status } = await api('/api/friends/peers', { userId });
      if (cancelled) return;
      setPeersLoading(false);
      if (ok) {
        setPeers(data.peers || []);
      } else {
        setPeers([]);
        setPeersErr(data?.error || `Ошибка (${status})`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, roomId]);

  const memberIds = useMemo(() => new Set((room?.members || []).map((m) => String(m.id))), [room]);

  const isOwner = useMemo(() => {
    const me = room?.members?.find((m) => String(m.id) === String(userId));
    return me?.role === 'owner';
  }, [room, userId]);

  const peersToInvite = useMemo(
    () => peers.filter((p) => !memberIds.has(String(p.id))),
    [peers, memberIds],
  );

  function togglePeer(id) {
    setSelectedPeers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveEdits(e) {
    e.preventDefault();
    setSaveErr(null);
    const t = editTitle.trim();
    if (!t) {
      setSaveErr('Укажите название');
      return;
    }
    setSaving(true);
    const { ok, data } = await api(`/api/rooms/${encodeURIComponent(roomId)}`, {
      method: 'PATCH',
      userId,
      body: { title: t, description: editDescription.trim() || null },
    });
    setSaving(false);
    if (!ok) {
      setSaveErr(data?.error || 'Не удалось сохранить');
      return;
    }
    const r = data.room;
    setRoom(r);
    setEditTitle(r.title ?? '');
    setEditDescription(r.description ?? '');
    onRoomUpdated?.(r);
  }

  async function addFriends(e) {
    e.preventDefault();
    setAddErr(null);
    const ids = [...selectedPeers];
    setAdding(true);
    const { ok, data } = await api(`/api/rooms/${encodeURIComponent(roomId)}/members`, {
      method: 'POST',
      userId,
      body: { memberIds: ids },
    });
    setAdding(false);
    if (!ok) {
      setAddErr(data?.error || 'Не удалось добавить');
      return;
    }
    const r = data.room;
    setRoom(r);
    setEditTitle(r.title ?? '');
    setEditDescription(r.description ?? '');
    setSelectedPeers(new Set());
    onRoomUpdated?.(r);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 105,
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
          maxWidth: 440,
          maxHeight: 'min(85dvh, 640px)',
          overflow: 'auto',
          padding: 16,
          borderRadius: 'var(--radius)',
          WebkitOverflowScrolling: 'touch',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            <span style={{ color: 'var(--accent)' }}>#</span> {room?.title ?? 'Комната'}
          </span>
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
        ) : room ? (
          <>
            {isOwner ? (
              <form onSubmit={saveEdits} style={{ marginBottom: 18 }}>
                <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 8px' }}>Редактирование</p>
                <label className="muted" style={{ fontSize: 10, display: 'block', marginBottom: 4 }}>
                  Название
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={80}
                  autoComplete="off"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    marginBottom: 10,
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 16,
                  }}
                />
                <label className="muted" style={{ fontSize: 10, display: 'block', marginBottom: 4 }}>
                  Описание
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Коротко о теме комнаты"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    marginBottom: 10,
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 16,
                    resize: 'vertical',
                  }}
                />
                {saveErr ? (
                  <p style={{ fontSize: 11, color: '#c45c5c', margin: '0 0 8px' }}>{saveErr}</p>
                ) : null}
                <button type="submit" className="btn-primary" style={{ padding: '8px 14px', width: 'auto' }} disabled={saving}>
                  {saving ? 'Сохранение…' : 'Сохранить'}
                </button>
              </form>
            ) : (
              <>
                {room.description ? (
                  <p style={{ fontSize: 12, margin: '0 0 14px', lineHeight: 1.45 }}>{room.description}</p>
                ) : (
                  <p className="muted" style={{ fontSize: 11, margin: '0 0 14px' }}>
                    Без описания
                  </p>
                )}
              </>
            )}

            <form onSubmit={addFriends}>
              <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 8px' }}>Пригласить друзей</p>
              <p className="muted" style={{ fontSize: 10, margin: '0 0 10px', lineHeight: 1.4 }}>
                Можно добавить только друзей из ваших контактов, которых ещё нет в комнате.
              </p>
              {peersErr ? (
                <p style={{ fontSize: 11, color: '#c45c5c', margin: '0 0 10px' }}>{peersErr}</p>
              ) : null}
              {peersLoading ? (
                <p className="muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
                  Загрузка…
                </p>
              ) : peersToInvite.length === 0 ? (
                <p className="muted" style={{ fontSize: 12, margin: '0 0 12px', lineHeight: 1.4 }}>
                  Нет друзей для приглашения (все уже в комнате или список друзей пуст).
                </p>
              ) : (
                <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, maxHeight: 200, overflow: 'auto' }}>
                  {peersToInvite.map((p) => (
                    <li key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 4px',
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedPeers.has(p.id)}
                          onChange={() => togglePeer(p.id)}
                          style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
                        />
                        <UserAvatar src={p.avatarUrl} size={32} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ color: 'var(--accent)' }}>
                            <NicknameWithBadge nickname={p.nickname} affiliationEmoji={p.affiliationEmoji} />
                          </span>
                          <span className="muted" style={{ display: 'block', fontSize: 10 }}>
                            {p.firstName} {p.lastName}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {addErr ? (
                <p style={{ fontSize: 11, color: '#c45c5c', margin: '0 0 8px' }}>{addErr}</p>
              ) : null}
              {peersToInvite.length > 0 ? (
                <button
                  type="submit"
                  className="btn-outline"
                  style={{ padding: '8px 14px', width: 'auto' }}
                  disabled={adding || selectedPeers.size === 0}
                >
                  {adding ? 'Добавление…' : `Добавить${selectedPeers.size ? ` (${selectedPeers.size})` : ''}`}
                </button>
              ) : null}
            </form>

            <p style={{ fontSize: 12, fontWeight: 600, margin: '18px 0 8px' }}>Участники</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {room.members.map((m) => (
                <li
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 12,
                  }}
                >
                  <UserAvatar src={m.avatarUrl} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>
                      <span style={{ color: 'var(--accent)' }}>
                        <NicknameWithBadge nickname={m.nickname} affiliationEmoji={m.affiliationEmoji} />
                      </span>
                      {m.role === 'owner' ? (
                        <span className="muted" style={{ marginLeft: 8, fontSize: 10 }}>
                          создатель
                        </span>
                      ) : null}
                    </div>
                    <div className="muted" style={{ fontSize: 10 }}>
                      {m.firstName} {m.lastName}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}

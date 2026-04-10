import { useEffect, useState } from 'react';
import { api } from '../api.js';
import NicknameWithBadge from './NicknameWithBadge.jsx';

/**
 * Пересылка сообщения в другой личный чат или комнату.
 * @param {{ type: 'chat', id: string } | { type: 'room', id: string }} source — текущий контекст (исключаем из списка).
 */
export default function ForwardMessageModal({ open, onClose, userId, source, messageId, onAfterForward }) {
  const [chats, setChats] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setBusy(false);
    void (async () => {
      const [c, r] = await Promise.all([api('/api/chats', { userId }), api('/api/rooms', { userId })]);
      if (c.ok) setChats(c.data.chats || []);
      if (r.ok) setRooms(r.data.rooms || []);
    })();
  }, [open, userId]);

  if (!open) return null;

  const chatTargets = chats.filter((c) => !(source.type === 'chat' && String(c.id) === String(source.id)));
  const roomTargets = rooms.filter((r) => !(source.type === 'room' && String(r.id) === String(source.id)));

  const bodyFromSource = () =>
    source.type === 'chat'
      ? { fromChatId: source.id, messageId }
      : { fromRoomId: source.id, messageId };

  async function forwardToChat(targetChatId) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const { ok, data } = await api(`/api/chats/${encodeURIComponent(targetChatId)}/forward`, {
      method: 'POST',
      body: bodyFromSource(),
      userId,
    });
    setBusy(false);
    if (!ok) {
      setErr(data?.error || 'Не удалось переслать');
      return;
    }
    onAfterForward?.();
    onClose?.();
  }

  async function forwardToRoom(targetRoomId) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const { ok, data } = await api(`/api/rooms/${encodeURIComponent(targetRoomId)}/forward`, {
      method: 'POST',
      body: bodyFromSource(),
      userId,
    });
    setBusy(false);
    if (!ok) {
      setErr(data?.error || 'Не удалось переслать');
      return;
    }
    onAfterForward?.();
    onClose?.();
  }

  const empty = chatTargets.length === 0 && roomTargets.length === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="forward-modal-title"
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
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
          maxWidth: 400,
          maxHeight: 'min(72vh, 520px)',
          display: 'flex',
          flexDirection: 'column',
          padding: 16,
          borderRadius: 'var(--radius)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span id="forward-modal-title" style={{ fontSize: 14, fontWeight: 600 }}>
            Переслать в…
          </span>
          <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: 10, lineHeight: 1.4 }}>
          Сообщение будет отправлено в выбранный чат или комнату.
        </p>
        {err ? (
          <p style={{ margin: '0 0 10px', fontSize: 11, color: '#c45c5c' }}>{err}</p>
        ) : null}
        <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
          {empty ? (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Нет других чатов или комнат для пересылки.
            </p>
          ) : (
            <>
              {chatTargets.length > 0 ? (
                <p className="muted" style={{ fontSize: 10, margin: '0 0 6px' }}>
                  Личные чаты
                </p>
              ) : null}
              {chatTargets.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void forwardToChat(c.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    marginBottom: 6,
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'inherit',
                    fontSize: 13,
                    cursor: busy ? 'wait' : 'pointer',
                  }}
                >
                  {c.peerNickname ? (
                    <NicknameWithBadge nickname={c.peerNickname} affiliationEmoji={c.peerAffiliationEmoji} />
                  ) : (
                    c.name || 'Чат'
                  )}
                </button>
              ))}
              {roomTargets.length > 0 ? (
                <p className="muted" style={{ fontSize: 10, margin: '10px 0 6px' }}>
                  Комнаты
                </p>
              ) : null}
              {roomTargets.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void forwardToRoom(r.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    marginBottom: 6,
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'inherit',
                    fontSize: 13,
                    cursor: busy ? 'wait' : 'pointer',
                  }}
                >
                  <span style={{ color: 'var(--accent)' }}>#</span> {r.name}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

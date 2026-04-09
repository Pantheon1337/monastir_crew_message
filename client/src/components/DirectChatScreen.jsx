import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../api.js';

function AvatarPlaceholder({ label }) {
  const ch = (label || '?').replace('@', '').slice(0, 1).toUpperCase();
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        border: '1px solid var(--border)',
        background: '#252830',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        color: 'var(--muted)',
      }}
    >
      {ch}
    </div>
  );
}

export default function DirectChatScreen({
  userId,
  chatId,
  peerLabel,
  peerUserId,
  peerAvatarUrl,
  onClose,
  lastEvent,
  onAfterChange,
  onOpenPeerProfile,
}) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await api(`/api/chats/${encodeURIComponent(chatId)}/messages`, { userId });
    if (!ok) {
      setErr(data?.error || 'Не удалось загрузить чат');
      setLoading(false);
      return;
    }
    setMessages(data.messages || []);
    setErr(null);
    setLoading(false);
  }, [chatId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!chatId || !userId) return;
    let cancelled = false;
    (async () => {
      await api(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST', userId });
      if (!cancelled) onAfterChange?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, userId, onAfterChange]);

  useEffect(() => {
    if (lastEvent?.type !== 'chat:message:new') return;
    if (lastEvent.payload?.chatId !== chatId) return;
    const m = lastEvent.payload?.message;
    if (!m?.id) return;
    setMessages((prev) => {
      if (prev.some((x) => x.id === m.id)) return prev;
      return [
        ...prev,
        {
          id: m.id,
          senderId: m.senderId,
          body: m.body,
          createdAt: m.createdAt,
          senderNickname: m.senderNickname,
        },
      ];
    });
    (async () => {
      await api(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST', userId });
      onAfterChange?.();
    })();
  }, [lastEvent, chatId, userId, onAfterChange]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function handleSubmit(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const { ok, data } = await api(`/api/chats/${encodeURIComponent(chatId)}/messages`, {
      method: 'POST',
      body: { body: t },
      userId,
    });
    if (!ok) {
      setErr(data?.error || 'Не отправлено');
      return;
    }
    setText('');
    setErr(null);
    const m = data.message;
    setMessages((prev) => {
      if (prev.some((x) => x.id === m.id)) return prev;
      return [
        ...prev,
        {
          id: m.id,
          senderId: m.senderId,
          body: m.body,
          createdAt: m.createdAt,
          senderNickname: m.senderNickname,
        },
      ];
    });
    await api(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST', userId });
    onAfterChange?.();
  }

  function formatTime(ts) {
    if (ts == null) return '';
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <button type="button" className="icon-btn" style={{ width: 40, height: 40 }} onClick={onClose} aria-label="Назад">
          ‹
        </button>
        <button
          type="button"
          onClick={() => peerUserId && onOpenPeerProfile?.()}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
            background: 'none',
            border: 'none',
            color: 'inherit',
            padding: '4px 0',
            cursor: peerUserId && onOpenPeerProfile ? 'pointer' : 'default',
          }}
          disabled={!peerUserId || !onOpenPeerProfile}
        >
          <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {peerLabel || 'Чат'}
          </div>
          {peerUserId && onOpenPeerProfile ? (
            <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>
              открыть профиль
            </div>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => peerUserId && onOpenPeerProfile?.()}
          aria-label="Профиль собеседника"
          style={{
            padding: 0,
            border: 'none',
            background: 'none',
            cursor: peerUserId && onOpenPeerProfile ? 'pointer' : 'default',
            borderRadius: '50%',
            flexShrink: 0,
          }}
          disabled={!peerUserId || !onOpenPeerProfile}
        >
          {peerAvatarUrl ? (
            <img
              src={peerAvatarUrl}
              alt=""
              style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }}
            />
          ) : (
            <AvatarPlaceholder label={peerLabel} />
          )}
        </button>
      </header>

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
        {loading ? (
          <p className="muted" style={{ fontSize: 12 }}>
            Загрузка…
          </p>
        ) : err && messages.length === 0 ? (
          <p style={{ fontSize: 12, color: '#c45c5c' }}>{err}</p>
        ) : messages.length === 0 ? (
          <p className="muted" style={{ fontSize: 12 }}>
            Нет сообщений — напишите первым.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === userId;
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  justifyContent: mine ? 'flex-end' : 'flex-start',
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    maxWidth: '85%',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '8px 10px',
                    fontSize: 13,
                    background: mine ? 'rgba(193, 123, 75, 0.12)' : 'transparent',
                  }}
                >
                  {!mine && (
                    <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>
                      @{m.senderNickname || 'user'}
                    </div>
                  )}
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
                  <div className="muted" style={{ fontSize: 9, marginTop: 4, textAlign: mine ? 'right' : 'left' }}>
                    {formatTime(m.createdAt)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          borderTop: '1px solid var(--border)',
          padding: '10px 12px',
          display: 'flex',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <input
          className="text-input"
          style={{ flex: 1 }}
          placeholder="Сообщение…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
        />
        <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '10px 14px' }}>
          Отпр.
        </button>
      </form>
    </div>
  );
}

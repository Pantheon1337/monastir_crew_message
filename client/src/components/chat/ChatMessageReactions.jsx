import { memo, useState } from 'react';
import { api } from '../../api.js';
import ReactionUsersModal from '../ReactionUsersModal.jsx';
import { REACTION_KEYS, REACTION_ICONS, emptyReactionCounts, normalizeReactionMine } from '../../reactionConstants.js';

/**
 * Реакции на сообщение (личный чат: chatId; комната: roomId).
 */
const ChatMessageReactions = memo(function ChatMessageReactions({
  chatId,
  roomId,
  messageId,
  userId,
  reactions,
  onUpdate,
  align = 'flex-start',
}) {
  const [whoOpen, setWhoOpen] = useState(false);
  const [whoList, setWhoList] = useState([]);
  const counts = { ...emptyReactionCounts(), ...(reactions?.counts || {}) };
  for (const k of REACTION_KEYS) counts[k] = Number(counts[k]) || 0;
  const mineList = normalizeReactionMine(reactions?.mine);
  const keysToShow = REACTION_KEYS.filter((k) => (counts[k] ?? 0) > 0);
  if (keysToShow.length === 0) return null;
  const totalReactions = REACTION_KEYS.reduce((a, k) => a + (counts[k] ?? 0), 0);

  async function pick(key) {
    const path = roomId
      ? `/api/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}/reaction`
      : `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/reaction`;
    const { ok, data } = await api(path, {
      method: 'POST',
      body: { reaction: key },
      userId,
    });
    if (!ok) {
      if (data?.error) alert(data.error);
      return;
    }
    if (data?.reactions) onUpdate?.(data.reactions);
  }

  async function openWho() {
    const path = roomId
      ? `/api/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}/reactions`
      : `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/reactions`;
    const { ok, data } = await api(path, { userId });
    if (ok) setWhoList(data?.users || []);
    setWhoOpen(true);
  }

  return (
    <>
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          gap: 4,
          marginTop: 6,
          flexWrap: 'wrap',
          justifyContent: align,
          alignItems: 'center',
        }}
      >
        {keysToShow.map((key) => {
          const n = counts[key] ?? 0;
          const active = mineList.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => void pick(key)}
              style={{
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 999,
                background: active ? 'rgba(193, 123, 75, 0.2)' : 'transparent',
                padding: '2px 8px',
                fontSize: 13,
                cursor: 'pointer',
                color: 'inherit',
                lineHeight: 1.3,
              }}
            >
              {REACTION_ICONS[key]}
              {n > 0 ? <span className="muted" style={{ fontSize: 10, marginLeft: 2 }}>{n}</span> : null}
            </button>
          );
        })}
        {totalReactions > 0 ? (
          <button
            type="button"
            className="btn-outline"
            style={{ fontSize: 10, padding: '2px 8px', minHeight: 0 }}
            onClick={() => void openWho()}
          >
            Кто
          </button>
        ) : null}
      </div>
      <ReactionUsersModal open={whoOpen} users={whoList} onClose={() => setWhoOpen(false)} />
    </>
  );
});

export default ChatMessageReactions;

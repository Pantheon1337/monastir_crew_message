import { useEffect } from 'react';
import { useLeftEdgeSwipeBack } from '../../hooks/useLeftEdgeSwipeBack.js';
import { useNewChatSelfThread } from '../../chat/newChat/NewChatLogic.js';
import '../../chat/newChat/newChat.css';

function formatTime(ts) {
  if (ts == null) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Экспериментальный полноэкранный чат: тот же поток «Избранное» (чат с собой), новый UI и логика в NewChatLogic.
 */
export default function TestChatScreen({ userId, userNickname, lastEvent, onClose, onAfterChange }) {
  const {
    chatId,
    resolveErr,
    messages,
    loading,
    sendErr,
    text,
    setText,
    sendText,
    scrollRef,
    messagesEndRef,
  } = useNewChatSelfThread({ userId, lastEvent, onAfterChange });

  useLeftEdgeSwipeBack(onClose);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, loading, scrollRef]);

  const canSend = Boolean(text.trim()) && Boolean(chatId);

  return (
    <div className="newchat-screen" role="dialog" aria-label="Тестовый чат">
      <header className="newchat-screen__header">
        <button type="button" className="newchat-screen__back" onClick={onClose} aria-label="Закрыть">
          ←
        </button>
        <div className="newchat-screen__titles">
          <div className="newchat-screen__title">Тестовый чат</div>
          <div className="newchat-screen__subtitle">
            Новый интерфейс · диалог с собой (Избранное){userNickname ? ` · ${userNickname}` : ''}
          </div>
        </div>
      </header>

      {resolveErr ? (
        <div className="newchat-banner">{resolveErr}</div>
      ) : null}
      {sendErr ? (
        <div className="newchat-banner">{sendErr}</div>
      ) : null}

      <div className="newchat-screen__body">
        <div ref={scrollRef} className="newchat-timeline">
          {loading && !resolveErr ? (
            <p className="newchat-muted">Загрузка…</p>
          ) : messages.length === 0 && !loading ? (
            <p className="newchat-muted">Напишите сообщение — оно сохранится в «Избранном» с новым оформлением.</p>
          ) : (
            messages.map((m) => {
              const kind = m.kind || 'text';
              let body = m.body;
              if (kind !== 'text' && kind !== 'revoked') {
                body = body?.trim() ? `${kind}: ${body}` : `· ${kind}`;
              }
              if (kind === 'revoked') body = 'Сообщение удалено';
              return (
                <div key={m.id} className="newchat-row">
                  <div className="newchat-bubble">
                    <div>{body || ' '}</div>
                    <div className="newchat-bubble__meta">
                      <span>{formatTime(m.createdAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} style={{ height: 1, flexShrink: 0 }} aria-hidden />
        </div>

        <div className="newchat-composer">
          <textarea
            className="newchat-composer__field text-input"
            rows={1}
            placeholder="Сообщение…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendText();
              }
            }}
          />
          <button type="button" className="newchat-composer__send" disabled={!canSend} onClick={() => void sendText()}>
            Отпр.
          </button>
        </div>
      </div>
    </div>
  );
}

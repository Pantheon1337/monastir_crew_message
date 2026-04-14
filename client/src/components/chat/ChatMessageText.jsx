import { memo, Fragment } from 'react';
import { splitMentions } from '../../chat/mentionParts.js';

/**
 * Текст сообщения: один поток переносов (white-space: pre-wrap в .chat-message-text).
 * Без @ — один дочерний текстовый узел внутри span (как один текстовый узел в innerHTML).
 * С @ — фрагменты текста и inline-кнопки упоминаний без лишней обёртки вокруг всей строки.
 */
function ChatMessageTextInner({ text, onMentionClick }) {
  const s =
    text == null
      ? ''
      : String(text)
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n');
  const parts = splitMentions(s);

  if (parts.length === 0) {
    return null;
  }

  if (parts.length === 1 && parts[0].type === 'text') {
    return (
      <span className="chat-message-text" data-chat-body="plain">
        {parts[0].value}
      </span>
    );
  }

  return (
    <span className="chat-message-text" data-chat-body="mentions">
      {parts.map((p, i) =>
        p.type === 'text' ? (
          <Fragment key={`t-${i}`}>{p.value}</Fragment>
        ) : (
          <button
            key={`m-${i}`}
            type="button"
            className="chat-mention"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onMentionClick?.(p.nick);
            }}
          >
            @{p.label}
          </button>
        ),
      )}
    </span>
  );
}

const ChatMessageText = memo(ChatMessageTextInner);
ChatMessageText.displayName = 'ChatMessageText';
export default ChatMessageText;

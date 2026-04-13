import { memo } from 'react';

/**
 * Текст с подсветкой @username; клик — открытие профиля (если родитель обрабатывает).
 */
const MENTION_RE = /@([a-z0-9_]{3,30})\b/gi;

function splitMentions(text) {
  if (text == null || text === '') return [];
  const s = String(text);
  const parts = [];
  let last = 0;
  let m;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(s)) !== null) {
    if (m.index > last) {
      parts.push({ type: 'text', value: s.slice(last, m.index) });
    }
    parts.push({ type: 'mention', nick: m[1].toLowerCase(), label: m[1] });
    last = m.index + m[0].length;
  }
  if (last < s.length) {
    parts.push({ type: 'text', value: s.slice(last) });
  }
  return parts;
}

function MentionTextInner({ text, onMentionClick }) {
  const parts = splitMentions(text);
  if (parts.length === 0) {
    return <span className="chat-message-text">{text}</span>;
  }
  return (
    <span className="chat-message-text">
      {parts.map((p, i) => {
        if (p.type === 'text') {
          return <span key={i}>{p.value}</span>;
        }
        return (
          <button
            key={i}
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
        );
      })}
    </span>
  );
}

const MentionText = memo(MentionTextInner);
MentionText.displayName = 'MentionText';
export default MentionText;

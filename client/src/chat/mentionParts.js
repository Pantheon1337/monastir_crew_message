/** Разбор @nickname для чата (3–30 символов, как на сервере). */

export const MENTION_RE = /@([a-z0-9_]{3,30})\b/gi;

/**
 * @returns {Array<{ type: 'text', value: string } | { type: 'mention', nick: string, label: string }>}
 */
export function splitMentions(text) {
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

import { useMemo } from 'react';

/** Активный фрагмент @ник от курсора (без пробелов в запросе). */
export function getActiveMention(text, cursorPos) {
  if (cursorPos == null || cursorPos < 0) return null;
  const before = text.slice(0, cursorPos);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  const frag = before.slice(at + 1);
  if (/[\s\n]/.test(frag)) return null;
  return { start: at, query: frag.toLowerCase(), end: cursorPos };
}

/**
 * Подсказки @упоминания: candidates — { nickname, label? }.
 * Родитель: position relative, список снизу вверх от поля.
 */
export default function MentionAutocomplete({ candidates = [], text, caretPos, onPick }) {
  const state = useMemo(() => getActiveMention(text, caretPos), [text, caretPos]);
  const filtered = useMemo(() => {
    if (!state || !candidates.length) return [];
    const q = state.query;
    return candidates.filter((c) => {
      const n = String(c.nickname || '').toLowerCase();
      return !q || n.startsWith(q);
    });
  }, [state, candidates]);

  if (!state || filtered.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Упоминание по нику"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '100%',
        marginBottom: 6,
        maxHeight: 200,
        overflowY: 'auto',
        zIndex: 50,
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--bg)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
        fontSize: 12,
      }}
    >
      {filtered.map((c, i) => (
        <button
          key={c.id ? String(c.id) : c.nickname}
          type="button"
          role="option"
          onMouseDown={(e) => {
            e.preventDefault();
            onPick?.(c.nickname, state);
          }}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '8px 10px',
            border: 'none',
            borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontWeight: 600 }}>@{c.nickname}</span>
          {c.label ? (
            <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
              {c.label}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

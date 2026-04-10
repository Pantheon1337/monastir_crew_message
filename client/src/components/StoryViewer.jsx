import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

const SLIDE_MS = 4800;

const REACTION_ICONS = { up: '👍', down: '👎', fire: '🔥', poop: '💩' };
const REACTION_KEYS = ['up', 'down', 'fire', 'poop'];

/** До архива: при остатке ≥ 1 ч — в часах, иначе в минутах. */
function formatStoryArchiveEta(expiresAt) {
  if (expiresAt == null) return null;
  const msLeft = expiresAt - Date.now();
  if (msLeft <= 0) return null;
  const hoursLeft = msLeft / 3600000;
  if (hoursLeft >= 1) {
    const h = Math.max(1, Math.round(hoursLeft));
    return `≈ ${h} ч до архива`;
  }
  const minLeft = msLeft / 60000;
  if (minLeft < 1) return 'меньше минуты до архива';
  const m = Math.max(1, Math.ceil(minLeft));
  return `≈ ${m} мин до архива`;
}

export default function StoryViewer({ story, userId, onClose, onProgress, onAfterLastItem }) {
  const [slide, setSlide] = useState(0);
  const items = story?.items ?? [];
  const total = items.length;

  /** Следующий кадр или переход к следующему автору (не закрывать просмотр сразу). */
  const advance = useCallback(() => {
    setSlide((s) => {
      if (total === 0) return 0;
      if (s < total - 1) return s + 1;
      queueMicrotask(() => {
        const next = onAfterLastItem ?? onClose;
        next();
      });
      return s;
    });
  }, [onAfterLastItem, onClose, total]);

  useEffect(() => {
    if (!story || total === 0) return undefined;
    const t = window.setTimeout(advance, SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [slide, advance, story, total]);

  useEffect(() => {
    setSlide(0);
  }, [story?.authorId, story?.items]);

  useEffect(() => {
    const cur = items[slide];
    onProgress?.({
      authorId: story?.authorId,
      itemId: cur?.id,
      index: slide,
      total,
    });
  }, [slide, items, onProgress, story?.authorId, total]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!story || total === 0) return null;

  const cur = items[slide];

  const archiveEta = cur?.expiresAt != null ? formatStoryArchiveEta(cur.expiresAt) : null;

  const canReact = Boolean(userId) && !story.isSelf;

  async function sendReact(k) {
    if (!userId || !cur?.id) return;
    await api('/api/stories/react', {
      method: 'POST',
      body: { storyId: cur.id, reaction: k },
      userId,
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: '#0c0d10',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '10px 12px', display: 'flex', gap: 4 }}>
        {items.map((it, i) => (
          <div
            key={`${it.id}-${i}`}
            style={{
              flex: 1,
              height: 3,
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 1,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: i < slide ? '100%' : i === slide ? '100%' : '0%',
                background: 'var(--accent)',
                transformOrigin: 'left',
                transform: i === slide ? 'scaleX(0)' : i < slide ? 'scaleX(1)' : 'scaleX(0)',
                animation: i === slide ? `storySeg ${SLIDE_MS}ms linear forwards` : undefined,
              }}
            />
          </div>
        ))}
      </div>
      <style>{`
        @keyframes storySeg {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>

      <div
        style={{
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {story.avatarUrl ? (
          <img src={story.avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#252830',
              border: '1px solid var(--border)',
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{story.label}</div>
          {archiveEta ? (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>{archiveEta}</div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 'var(--radius)',
            padding: '6px 10px',
            fontSize: 11,
            background: 'transparent',
            color: 'inherit',
          }}
        >
          Закрыть
        </button>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          textAlign: 'center',
          overflow: 'auto',
        }}
      >
        {cur.mediaUrl ? (
          <img
            src={cur.mediaUrl}
            alt=""
            style={{ maxWidth: '100%', maxHeight: '62dvh', objectFit: 'contain', borderRadius: 8 }}
          />
        ) : null}
        {cur.body ? (
          <p style={{ margin: cur.mediaUrl ? '14px 0 0' : 0, maxWidth: 420, fontSize: 15, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
            {cur.body}
          </p>
        ) : null}
      </div>

      {canReact ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 10,
            padding: '12px 16px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span style={{ width: '100%', textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
            Реакция уйдёт в чат автору
          </span>
          {REACTION_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => void sendReact(k)}
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.06)',
                fontSize: 20,
                cursor: 'pointer',
                color: 'inherit',
              }}
              aria-label={`Реакция ${k}`}
            >
              {REACTION_ICONS[k]}
            </button>
          ))}
        </div>
      ) : null}

      <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          type="button"
          style={{ flex: 1, padding: 14, borderRight: '1px solid rgba(255,255,255,0.08)', fontSize: 12, background: 'transparent', color: 'inherit' }}
          onClick={() => setSlide((s) => Math.max(0, s - 1))}
        >
          Назад
        </button>
        <button type="button" style={{ flex: 1, padding: 14, fontSize: 12, background: 'transparent', color: 'inherit' }} onClick={advance}>
          Далее
        </button>
      </div>
    </div>
  );
}

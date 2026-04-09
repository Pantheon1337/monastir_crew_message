import { useEffect, useState, useCallback } from 'react';

const SLIDE_MS = 4800;

export default function StoryViewer({ story, onClose, onProgress }) {
  const [slide, setSlide] = useState(0);
  const items = story?.items ?? [];
  const total = items.length;

  const advance = useCallback(() => {
    setSlide((s) => {
      if (total === 0) return 0;
      if (s >= total - 1) {
        onClose();
        return 0;
      }
      return s + 1;
    });
  }, [onClose, total]);

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
    onProgress?.({ storyId: story?.authorId, index: slide, total });
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
  const expiresIn =
    cur?.expiresAt != null ? Math.max(0, Math.floor((cur.expiresAt - Date.now()) / 60000)) : null;

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
          {expiresIn != null ? (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>
              {expiresIn < 1 ? 'меньше минуты' : `≈ ${expiresIn} мин до архива`}
            </div>
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

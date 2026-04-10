import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api.js';
import UserAvatar from './UserAvatar.jsx';

const SLIDE_MS = 4800;

const REACTION_ICONS = { up: '👍', down: '👎', fire: '🔥', poop: '💩' };
const REACTION_KEYS = ['up', 'down', 'fire', 'poop'];

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
  const [isHolding, setIsHolding] = useState(false);
  const items = story?.items ?? [];
  const total = items.length;
  const stagePtrStartX = useRef(null);

  const goNext = useCallback(() => {
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

  const goPrev = useCallback(() => {
    setSlide((s) => Math.max(0, s - 1));
  }, []);

  useEffect(() => {
    if (!story || total === 0) return undefined;
    if (isHolding) return undefined;
    const t = window.setTimeout(goNext, SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [slide, goNext, story, total, isHolding]);

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
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, goPrev, goNext]);

  function onStagePointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    stagePtrStartX.current = e.clientX;
    setIsHolding(true);
  }

  function onStagePointerUp(e) {
    const start = stagePtrStartX.current;
    stagePtrStartX.current = null;
    setIsHolding(false);
    if (start == null) return;
    const dx = e.clientX - start;
    const threshold = 48;
    if (dx < -threshold) goNext();
    else if (dx > threshold) goPrev();
  }

  function onStagePointerCancel() {
    stagePtrStartX.current = null;
    setIsHolding(false);
  }

  if (!story || total === 0) return null;

  const cur = items[slide];
  const archiveEta = cur?.expiresAt != null ? formatStoryArchiveEta(cur.expiresAt) : null;
  const canReact = Boolean(userId) && !story.isSelf;
  const pct = total > 0 ? (slide / total) * 100 : 0;

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
      className="story-viewer-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div className="story-viewer-chrome" style={{ padding: '10px 12px', display: 'flex', gap: 4 }}>
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
                animationPlayState: i === slide && isHolding ? 'paused' : 'running',
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
        className="story-viewer-chrome"
        style={{
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <UserAvatar src={story.avatarUrl} size={36} borderless />
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
        className="story-viewer-stage"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          position: 'relative',
          touchAction: 'pan-y',
        }}
        onPointerDown={onStagePointerDown}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerCancel}
      >
        <div
          className="story-viewer-strip"
          style={{
            display: 'flex',
            height: '100%',
            width: `${total * 100}%`,
            transform: `translateX(-${pct}%)`,
            transition: 'transform 0.38s cubic-bezier(0.25, 0.82, 0.2, 1)',
            willChange: 'transform',
          }}
        >
          {items.map((it) => (
            <div
              key={it.id}
              style={{
                flex: `0 0 ${100 / total}%`,
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
                textAlign: 'center',
                overflow: 'auto',
              }}
            >
              {it.mediaUrl ? (
                <img
                  src={it.mediaUrl}
                  alt=""
                  loading="eager"
                  decoding="async"
                  style={{ maxWidth: '100%', maxHeight: '58dvh', objectFit: 'contain', borderRadius: 8 }}
                />
              ) : null}
              {it.body ? (
                <p
                  style={{
                    margin: it.mediaUrl ? '14px 0 0' : 0,
                    maxWidth: 420,
                    fontSize: 15,
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.45,
                  }}
                >
                  {it.body}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {canReact ? (
        <div
          className="story-viewer-chrome"
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

      <div className="story-viewer-chrome" style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          type="button"
          style={{
            flex: 1,
            padding: 14,
            borderRight: '1px solid rgba(255,255,255,0.08)',
            fontSize: 12,
            background: 'transparent',
            color: 'inherit',
          }}
          onClick={goPrev}
        >
          ← Назад
        </button>
        <button
          type="button"
          style={{ flex: 1, padding: 14, fontSize: 12, background: 'transparent', color: 'inherit' }}
          onClick={goNext}
        >
          Вперёд →
        </button>
      </div>
    </div>
  );
}

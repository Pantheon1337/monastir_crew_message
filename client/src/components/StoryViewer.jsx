import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api.js';
import UserAvatar from './UserAvatar.jsx';
import { REACTION_ICONS, REACTION_KEYS } from '../reactionConstants.js';

const SLIDE_MS = 4800;

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

export default function StoryViewer({ story, userId, onClose, onProgress, onAfterLastItem, onStoryArchived }) {
  const [slide, setSlide] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [reactionBarOpen, setReactionBarOpen] = useState(false);
  const [reactionToast, setReactionToast] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const reactionToastTimerRef = useRef(null);
  const items = story?.items ?? [];
  const total = items.length;
  const stagePtrStart = useRef(null);

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
    return () => {
      if (reactionToastTimerRef.current != null) {
        window.clearTimeout(reactionToastTimerRef.current);
      }
    };
  }, []);

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
    stagePtrStart.current = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
    };
    setIsHolding(true);
  }

  function onStagePointerMove(e) {
    const s = stagePtrStart.current;
    if (!s || e.pointerId !== s.pointerId) return;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
  }

  function onStagePointerUp(e) {
    const start = stagePtrStart.current;
    stagePtrStart.current = null;
    setIsHolding(false);
    if (start == null || e.pointerId !== start.pointerId) return;
    const endX = start.lastX != null ? start.lastX : e.clientX;
    const endY = start.lastY != null ? start.lastY : e.clientY;
    const dx = endX - start.x;
    const dy = endY - start.y;
    const move = Math.hypot(dx, dy);
    const swipeTh = 40;
    const tapMax = 22;

    if (Math.abs(dx) >= swipeTh && Math.abs(dx) >= Math.abs(dy) * 0.55) {
      if (dx < 0) goNext();
      else goPrev();
      return;
    }

    if (move < tapMax && Math.abs(dy) < 28) {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = (endX - rect.left) / Math.max(rect.width, 1);
      if (relX < 0.28) goPrev();
      else if (relX > 0.72) goNext();
    }
  }

  function onStagePointerCancel() {
    stagePtrStart.current = null;
    setIsHolding(false);
  }

  function onStageLostPointerCapture() {
    stagePtrStart.current = null;
    setIsHolding(false);
  }

  if (!story || total === 0) return null;

  const cur = items[slide];
  const archiveEta = cur?.expiresAt != null ? formatStoryArchiveEta(cur.expiresAt) : null;
  const canReact = Boolean(userId) && !story.isSelf;
  const pct = total > 0 ? (slide / total) * 100 : 0;

  async function archiveCurrentToFeed() {
    if (!userId || !cur?.id || !story?.isSelf) return;
    setArchiving(true);
    const { ok, data } = await api(`/api/stories/${encodeURIComponent(cur.id)}/archive`, {
      method: 'POST',
      userId,
    });
    setArchiving(false);
    if (!ok) {
      alert(data?.error || 'Не удалось архивировать');
      return;
    }
    onStoryArchived?.(story.authorId);
  }

  async function sendReact(k) {
    if (!userId || !cur?.id) return;
    const { ok } = await api('/api/stories/react', {
      method: 'POST',
      body: { storyId: cur.id, reaction: k },
      userId,
    });
    if (ok) {
      if (reactionToastTimerRef.current != null) window.clearTimeout(reactionToastTimerRef.current);
      setReactionToast('Реакция отправлена');
      reactionToastTimerRef.current = window.setTimeout(() => {
        reactionToastTimerRef.current = null;
        setReactionToast(null);
      }, 1500);
    }
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
          {story.isSelf ? (
            <button
              type="button"
              disabled={archiving}
              onClick={() => void archiveCurrentToFeed()}
              style={{
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 'var(--radius)',
                padding: '6px 10px',
                fontSize: 11,
                background: 'rgba(255,255,255,0.06)',
                color: 'inherit',
                opacity: archiving ? 0.6 : 1,
              }}
              title="Убрать этот кадр из ленты кружков; останется в архиве до истечения 24 ч"
            >
              {archiving ? '…' : 'Архивировать'}
            </button>
          ) : null}
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
      </div>

      <div
        className="story-viewer-stage"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          position: 'relative',
          touchAction: 'none',
        }}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerCancel}
        onLostPointerCapture={onStageLostPointerCapture}
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
                touchAction: 'manipulation',
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
                    whiteSpace: 'pre-line',
                    lineHeight: 1.5,
                    wordBreak: 'break-word',
                    overflowWrap: 'break-word',
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
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            padding: '12px 16px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span style={{ width: '100%', textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
            Реакция уйдёт в чат автору
          </span>
          <button
            type="button"
            aria-expanded={reactionBarOpen}
            onClick={() => setReactionBarOpen((v) => !v)}
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.08)',
              fontSize: 22,
              cursor: 'pointer',
              color: 'inherit',
            }}
            title="Реакции"
          >
            ☺
          </button>
          {reactionBarOpen ? (
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10 }}>
              {REACTION_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    void sendReact(k);
                    setReactionBarOpen(false);
                  }}
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

      {reactionToast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 200,
            padding: '10px 18px',
            borderRadius: 10,
            background: 'rgba(30, 32, 38, 0.92)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
            fontSize: 14,
            fontWeight: 500,
            pointerEvents: 'none',
            maxWidth: 'min(320px, calc(100vw - 32px))',
            textAlign: 'center',
          }}
        >
          {reactionToast}
        </div>
      ) : null}
    </div>
  );
}

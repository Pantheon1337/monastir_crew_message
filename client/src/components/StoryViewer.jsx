import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { api } from '../api.js';
import UserAvatar from './UserAvatar.jsx';
import { REACTION_ICONS, REACTION_KEYS } from '../reactionConstants.js';
import StoryViewersModal from './StoryViewersModal.jsx';

const SLIDE_MS = 4800;
/** Короче и с transitionend — без лишней задержки после свайпа. */
const STORY_DISMISS_MS = 200;
const STORY_DISMISS_EASE = 'cubic-bezier(0.33, 1, 0.32, 1)';
const STORY_VERTICAL_THRESHOLD = 88;
const STORY_AXIS_LOCK_PX = 14;

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

export default function StoryViewer({
  story,
  userId,
  onClose,
  onProgress,
  onAfterLastItem,
  onBeforeFirstItem,
  onStoryArchived,
}) {
  const [slide, setSlide] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [reactionBarOpen, setReactionBarOpen] = useState(false);
  const [reactionToast, setReactionToast] = useState(null);
  const [replyToast, setReplyToast] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [viewersList, setViewersList] = useState([]);
  const reactionToastTimerRef = useRef(null);
  const replyToastTimerRef = useRef(null);
  /** Не сбрасывать слайд при каждом новом массиве items (архив, refetch) — только при новом «сеансе» просмотра. */
  const sessionKeyRef = useRef('');
  const items = story?.items ?? [];
  const total = items.length;
  const stagePtrStart = useRef(null);
  /** null | 'vertical' | 'horizontal' — после порога движения */
  const stageAxisRef = useRef(null);
  const [sheetY, setSheetY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const closingRef = useRef(false);
  const closeFallbackTimerRef = useRef(null);

  const sessionKey = useMemo(() => {
    if (!story?.authorId) return '';
    const p = story.profileReel === true ? 'p' : 'f';
    const i0 = story.initialSlide ?? 0;
    return `${story.authorId}|${p}|${i0}`;
  }, [story?.authorId, story?.initialSlide, story?.profileReel]);

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

  const finishClose = useCallback(() => {
    if (closeFallbackTimerRef.current != null) {
      window.clearTimeout(closeFallbackTimerRef.current);
      closeFallbackTimerRef.current = null;
    }
    if (!closingRef.current) return;
    closingRef.current = false;
    onClose();
  }, [onClose]);

  const closeAnimated = useCallback(
    (direction) => {
      const h = typeof window !== 'undefined' ? window.innerHeight : 800;
      closingRef.current = true;
      setSheetDragging(false);
      setSheetY(direction === 'down' ? h : -h);
      if (closeFallbackTimerRef.current != null) window.clearTimeout(closeFallbackTimerRef.current);
      closeFallbackTimerRef.current = window.setTimeout(() => {
        closeFallbackTimerRef.current = null;
        if (closingRef.current) finishClose();
      }, STORY_DISMISS_MS + 80);
    },
    [finishClose],
  );

  function onDismissTransitionEnd(e) {
    if (e.propertyName !== 'transform') return;
    finishClose();
  }

  const goPrev = useCallback(() => {
    setSlide((s) => {
      if (total === 0) return 0;
      if (s <= 0) {
        queueMicrotask(() => {
          if (story.profileReel !== true && typeof onBeforeFirstItem === 'function') {
            onBeforeFirstItem();
          } else {
            onClose();
          }
        });
        return 0;
      }
      return s - 1;
    });
  }, [onClose, onBeforeFirstItem, story.profileReel, total]);

  useEffect(() => {
    if (!story || total === 0) return undefined;
    if (isHolding) return undefined;
    const t = window.setTimeout(goNext, SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [slide, goNext, story, total, isHolding]);

  /** Стартовый слайд только при смене сеанса (автор / режим / стартовый индекс), не при обновлении списка кадров. */
  useEffect(() => {
    if (!story?.items?.length) {
      setSlide(0);
      return;
    }
    const n = story.items.length;
    const raw = story.initialSlide;
    const start = typeof raw === 'number' && raw >= 0 && raw < n ? raw : 0;
    if (sessionKeyRef.current !== sessionKey) {
      sessionKeyRef.current = sessionKey;
      setSlide(start);
    }
  }, [sessionKey, story?.items?.length]);

  /** Сжать индекс, если кадров стало меньше (архив и т.д.). */
  useEffect(() => {
    const n = story?.items?.length ?? 0;
    if (n === 0) return;
    setSlide((s) => Math.min(Math.max(0, s), n - 1));
  }, [story?.items?.length]);

  useEffect(() => {
    return () => {
      if (reactionToastTimerRef.current != null) {
        window.clearTimeout(reactionToastTimerRef.current);
      }
      if (replyToastTimerRef.current != null) {
        window.clearTimeout(replyToastTimerRef.current);
      }
      if (closeFallbackTimerRef.current != null) {
        window.clearTimeout(closeFallbackTimerRef.current);
      }
      closingRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      sessionKeyRef.current = '';
    };
  }, []);

  useEffect(() => {
    if (!viewersOpen || !userId || !story.isSelf) return undefined;
    const id = items[slide]?.id;
    if (!id) return undefined;
    let cancelled = false;
    setViewersLoading(true);
    (async () => {
      const { ok, data } = await api(`/api/stories/${encodeURIComponent(id)}/viewers`, { userId });
      if (cancelled) return;
      setViewersLoading(false);
      if (ok) setViewersList(data.viewers || []);
      else {
        setViewersList([]);
        if (data?.error) alert(data.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewersOpen, slide, items, story.isSelf, userId]);

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
      if (e.key === 'Backspace') {
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
    stageAxisRef.current = null;
    stagePtrStart.current = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
    };
    setIsHolding(true);
    setSheetDragging(true);
  }

  function onStagePointerMove(e) {
    const s = stagePtrStart.current;
    if (!s || e.pointerId !== s.pointerId) return;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    const dy = e.clientY - s.y;
    const dx = e.clientX - s.x;
    if (stageAxisRef.current == null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < STORY_AXIS_LOCK_PX) return;
      if (Math.abs(dy) >= Math.abs(dx) * 1.05) {
        stageAxisRef.current = 'vertical';
      } else {
        stageAxisRef.current = 'horizontal';
        setSheetY(0);
      }
    }
    if (stageAxisRef.current === 'vertical') {
      const h = typeof window !== 'undefined' ? window.innerHeight : 600;
      const rubber = dy * 0.55;
      const cap = h * 0.42;
      setSheetY(Math.max(-cap, Math.min(cap, rubber)));
    }
  }

  function onStagePointerUp(e) {
    const start = stagePtrStart.current;
    stagePtrStart.current = null;
    setIsHolding(false);
    setSheetDragging(false);
    if (start == null || e.pointerId !== start.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const endX = start.lastX != null ? start.lastX : e.clientX;
    const endY = start.lastY != null ? start.lastY : e.clientY;
    const dx = endX - start.x;
    const dy = endY - start.y;
    const move = Math.hypot(dx, dy);
    const swipeTh = 40;
    const tapMax = 22;
    const axis = stageAxisRef.current;
    stageAxisRef.current = null;

    const verticalIntent =
      axis === 'vertical' ||
      (axis == null && Math.abs(dy) >= 52 && Math.abs(dy) >= Math.abs(dx) * 0.82);
    if (verticalIntent) {
      const thr = axis === 'vertical' ? Math.max(72, STORY_VERTICAL_THRESHOLD - 16) : STORY_VERTICAL_THRESHOLD;
      if (Math.abs(dy) >= thr && Math.abs(dy) >= Math.abs(dx) * 0.65) {
        closeAnimated(dy > 0 ? 'down' : 'up');
        return;
      }
      setSheetY(0);
      return;
    }

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
    stageAxisRef.current = null;
    setIsHolding(false);
    setSheetDragging(false);
    setSheetY(0);
  }

  function onStageLostPointerCapture() {
    stagePtrStart.current = null;
    stageAxisRef.current = null;
    setIsHolding(false);
    setSheetDragging(false);
    setSheetY(0);
  }

  if (!story || total === 0) return null;

  const cur = items[slide];
  const archiveEta = cur?.expiresAt != null ? formatStoryArchiveEta(cur.expiresAt) : null;
  const canInteract = Boolean(userId) && !story.isSelf;
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
    onStoryArchived?.(story.authorId, story.profileReel === true);
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

  async function sendReply() {
    const t = replyText.trim();
    if (!userId || !cur?.id || !t || replyBusy) return;
    setReplyBusy(true);
    const { ok, data } = await api('/api/stories/reply', {
      method: 'POST',
      body: { storyId: cur.id, body: t },
      userId,
    });
    setReplyBusy(false);
    if (!ok) {
      alert(data?.error || 'Не удалось отправить');
      return;
    }
    setReplyText('');
    setReactionBarOpen(false);
    if (replyToastTimerRef.current != null) window.clearTimeout(replyToastTimerRef.current);
    setReplyToast('Ответ отправлен в чат');
    replyToastTimerRef.current = window.setTimeout(() => {
      replyToastTimerRef.current = null;
      setReplyToast(null);
    }, 1600);
  }

  const safeBottom = 'max(12px, env(safe-area-inset-bottom, 0px))';
  const hWin = typeof window !== 'undefined' ? window.innerHeight : 640;
  const sheetOpacity = 1 - Math.min(Math.abs(sheetY) / (hWin * 0.52), 0.22);
  const captionBottomPad = canInteract
    ? 'max(100px, calc(92px + env(safe-area-inset-bottom, 0px)))'
    : 'max(28px, env(safe-area-inset-bottom, 0px))';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="story-viewer-root"
      onTransitionEnd={onDismissTransitionEnd}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: '#000',
        overflow: 'hidden',
        transform: `translateY(${sheetY}px) translateZ(0)`,
        opacity: sheetOpacity,
        transition: sheetDragging
          ? 'none'
          : `transform ${STORY_DISMISS_MS}ms ${STORY_DISMISS_EASE}, opacity ${STORY_DISMISS_MS}ms ${STORY_DISMISS_EASE}`,
      }}
    >
      <p
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        Закрыть: свайп вверх или вниз по кадру. Клавиши со стрелками — между кадрами, Escape — выход.
      </p>

      {/* Кадр на весь экран (под шапкой и панелями) */}
      <div
        className="story-viewer-stage"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          overflow: 'hidden',
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
                height: '100%',
                minHeight: 0,
                boxSizing: 'border-box',
                position: 'relative',
                overflow: 'hidden',
                background: '#070708',
              }}
            >
              {it.mediaUrl ? (
                <img
                  src={it.mediaUrl}
                  alt=""
                  loading="eager"
                  decoding="async"
                  draggable={false}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: 'center',
                    display: 'block',
                    userSelect: 'none',
                    WebkitUserDrag: 'none',
                  }}
                />
              ) : null}
              {it.body ? (
                <div
                  style={{
                    ...(it.mediaUrl
                      ? {
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 0,
                          padding: `12px 14px ${captionBottomPad}`,
                          background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 55%, transparent 100%)',
                          textAlign: 'left',
                          zIndex: 2,
                        }
                      : {
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 24,
                          textAlign: 'center',
                        }),
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      maxWidth: it.mediaUrl ? 'none' : 420,
                      width: '100%',
                      fontSize: it.mediaUrl ? 15 : 17,
                      fontWeight: it.mediaUrl ? 500 : 600,
                      whiteSpace: 'pre-line',
                      lineHeight: 1.45,
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      color: '#fff',
                      textShadow: it.mediaUrl ? '0 1px 8px rgba(0,0,0,0.75)' : undefined,
                    }}
                  >
                    {it.body}
                  </p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes storySeg {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>

      {/* Шапка поверх кадра: прогресс и автор (касания не блокируют свайп по кадру) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          pointerEvents: 'none',
        }}
      >
        <div style={{ paddingTop: 'max(8px, env(safe-area-inset-top, 0px))', paddingLeft: 12, paddingRight: 12, paddingBottom: 6 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {items.map((it, i) => (
              <div
                key={`${it.id}-${i}`}
                style={{
                  flex: 1,
                  height: 3,
                  background: 'rgba(255,255,255,0.2)',
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
        </div>
        <div
          className="story-viewer-chrome"
          style={{
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.08) 100%)',
            pointerEvents: 'auto',
          }}
        >
          <UserAvatar src={story.avatarUrl} size={36} borderless />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{story.label}</div>
            {archiveEta ? (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{archiveEta}</div>
            ) : null}
          </div>
          {story.isSelf ? (
            <button
              type="button"
              disabled={archiving}
              onClick={() => void archiveCurrentToFeed()}
              style={{
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 'var(--radius)',
                padding: '6px 10px',
                fontSize: 11,
                background: 'rgba(0,0,0,0.35)',
                color: '#fff',
                opacity: archiving ? 0.6 : 1,
                flexShrink: 0,
              }}
              title="Убрать этот кадр из ленты кружков; останется в архиве до истечения 24 ч"
            >
              {archiving ? '…' : 'Архивировать'}
            </button>
          ) : null}
        </div>
      </div>

      {story.isSelf ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setViewersOpen(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: 12,
            bottom: safeBottom,
            zIndex: 55,
            border: '1px solid rgba(255,255,255,0.22)',
            borderRadius: 999,
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 600,
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
          title="Кто и когда впервые открыл этот кадр"
        >
          <span aria-hidden style={{ opacity: 0.9 }}>
            👁
          </span>
          Просмотры
        </button>
      ) : null}

      {canInteract ? (
        <div
          className="story-viewer-chrome"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 45,
            borderTop: '1px solid rgba(255,255,255,0.12)',
            paddingBottom: safeBottom,
            background: 'linear-gradient(to top, rgba(8,10,14,0.98) 0%, rgba(8,10,14,0.9) 55%, rgba(8,10,14,0.55) 100%)',
            color: '#fff',
          }}
        >
          {reactionBarOpen ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                flexWrap: 'wrap',
                gap: 10,
                width: '100%',
                maxHeight: 'min(200px, 36vh)',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                padding: '10px 12px 0',
              }}
            >
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
            }}
          >
            <button
              type="button"
              aria-expanded={reactionBarOpen}
              aria-label="Реакции"
              onClick={() => setReactionBarOpen((v) => !v)}
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(255,255,255,0.08)',
                fontSize: 22,
                cursor: 'pointer',
                color: 'inherit',
                flexShrink: 0,
              }}
              title="Реакции"
            >
              ☺
            </button>
            <input
              type="text"
              className="story-viewer-reply-input"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendReply();
                }
              }}
              placeholder="Ответить…"
              maxLength={4000}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '10px 12px',
                borderRadius: 20,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.06)',
                color: 'inherit',
                fontSize: 16,
                outline: 'none',
              }}
            />
            <button
              type="button"
              disabled={replyBusy || !replyText.trim()}
              onClick={() => void sendReply()}
              style={{
                flexShrink: 0,
                padding: '10px 14px',
                borderRadius: 20,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 14,
                cursor: replyBusy || !replyText.trim() ? 'default' : 'pointer',
                opacity: replyBusy || !replyText.trim() ? 0.45 : 1,
              }}
            >
              {replyBusy ? '…' : 'Отпр.'}
            </button>
          </div>
          <p
            className="muted"
            style={{
              margin: '0 12px 10px',
              fontSize: 10,
              textAlign: 'center',
              lineHeight: 1.35,
              opacity: 0.75,
            }}
          >
            Ответ и реакция уходят в личный чат автору
          </p>
        </div>
      ) : null}

      <StoryViewersModal
        open={viewersOpen}
        loading={viewersLoading}
        viewers={viewersList}
        onClose={() => setViewersOpen(false)}
      />

      {reactionToast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 220,
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

      {replyToast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 220,
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
          {replyToast}
        </div>
      ) : null}
    </div>
  );
}

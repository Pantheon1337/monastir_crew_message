import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { api } from '../api.js';
import UserAvatar from './UserAvatar.jsx';
import { REACTION_ICONS, REACTION_KEYS } from '../reactionConstants.js';
import StoryViewersModal from './StoryViewersModal.jsx';

const SLIDE_MS = 4800;
/** Во время жеста — плавное сопротивление; по отпускании при закрытии вызывается onClose сразу, без ожидания анимации */
const STORY_DISMISS_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const STORY_SNAP_BACK_MS = 220;
const STORY_VERTICAL_THRESHOLD = 72;
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

function formatStorySlideTime(ts) {
  if (ts == null) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (dayDiff === 0) return `сегодня в ${timeStr}`;
  if (dayDiff === 1) return `вчера в ${timeStr}`;
  if (dayDiff === 2) return `позавчера в ${timeStr}`;
  return (
    d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ` в ${timeStr}`
  );
}

export default function StoryViewer({
  story,
  userId,
  onClose,
  onProgress,
  onAfterLastItem,
  onBeforeFirstItem,
  onStoryArchived,
  onOpenAuthorProfile,
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
  const [likeLocal, setLikeLocal] = useState(null);
  const [likeBusy, setLikeBusy] = useState(false);
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
    };
  }, []);

  useEffect(() => {
    return () => {
      sessionKeyRef.current = '';
    };
  }, []);

  useEffect(() => {
    setLikeLocal(null);
  }, [slide]);

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
      const sign = dy >= 0 ? 1 : -1;
      const ady = Math.abs(dy);
      const rubber = sign * Math.min(ady * 0.4 + ady * ady * 0.0012, h * 0.36);
      setSheetY(Math.max(-h * 0.36, Math.min(h * 0.36, rubber)));
    }
  }

  function onStagePointerUp(e) {
    const start = stagePtrStart.current;
    stagePtrStart.current = null;
    if (start == null || e.pointerId !== start.pointerId) {
      setIsHolding(false);
      setSheetDragging(false);
      return;
    }
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
      const thr = axis === 'vertical' ? Math.max(64, STORY_VERTICAL_THRESHOLD - 12) : STORY_VERTICAL_THRESHOLD;
      if (Math.abs(dy) >= thr && Math.abs(dy) >= Math.abs(dx) * 0.65) {
        onClose();
        return;
      }
      setIsHolding(false);
      setSheetDragging(false);
      setSheetY(0);
      return;
    }

    setIsHolding(false);
    setSheetDragging(false);

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

  async function toggleStoryLike() {
    if (!userId || !cur?.id || likeBusy) return;
    setLikeBusy(true);
    const { ok, data } = await api('/api/stories/like', {
      method: 'POST',
      body: { storyId: cur.id },
      userId,
    });
    setLikeBusy(false);
    if (!ok) {
      alert(data?.error || 'Не удалось поставить лайк');
      return;
    }
    setLikeLocal({
      storyId: cur.id,
      liked: Boolean(data.liked),
      count: Number(data.likeCount) || 0,
    });
  }

  const liked =
    likeLocal?.storyId === cur.id ? likeLocal.liked : Boolean(cur.likedByMe);
  const likeCount =
    likeLocal?.storyId === cur.id ? likeLocal.count : Number(cur.likeCount) || 0;

  const safeBottom = 'max(12px, env(safe-area-inset-bottom, 0px))';
  const hWin = typeof window !== 'undefined' ? window.innerHeight : 640;
  const dragProgress = Math.min(1, Math.abs(sheetY) / Math.max(hWin * 0.42, 1));
  const sheetScale = 1 - dragProgress * 0.14;
  const sheetRadius = Math.min(14, 8 + Math.abs(sheetY) * 0.055);
  const sheetOpacity = 1 - Math.min(Math.abs(sheetY) / (hWin * 0.5), 0.28);
  /** У своих историй снизу кнопка «Просмотры» — подпись не должна заезжать под неё */
  const captionBottomPad = canInteract
    ? 'max(90px, calc(80px + env(safe-area-inset-bottom, 0px)))'
    : story.isSelf
      ? 'max(96px, calc(84px + env(safe-area-inset-bottom, 0px)))'
      : 'max(28px, env(safe-area-inset-bottom, 0px))';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="story-viewer-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: '#000',
        overflow: 'hidden',
        transform: `translateY(${sheetY}px) scale(${sheetScale}) translateZ(0)`,
        transformOrigin: 'center top',
        opacity: sheetOpacity,
        borderRadius: sheetRadius > 0.5 ? `${sheetRadius}px` : 0,
        transition: sheetDragging
          ? 'none'
          : `transform ${STORY_SNAP_BACK_MS}ms ${STORY_DISMISS_EASE}, opacity ${STORY_SNAP_BACK_MS}ms ${STORY_DISMISS_EASE}, border-radius ${STORY_SNAP_BACK_MS}ms ${STORY_DISMISS_EASE}`,
        boxShadow:
          sheetRadius > 1
            ? '0 32px 100px rgba(0,0,0,0.65), 0 0 0 0.5px rgba(255,255,255,0.08)'
            : 'none',
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
                <div
                  className="story-viewer-media-frame"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#000',
                  }}
                >
                  <img
                    src={it.mediaUrl}
                    alt=""
                    loading="eager"
                    decoding="async"
                    draggable={false}
                    className="story-viewer-media-img"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      width: 'auto',
                      height: 'auto',
                      objectFit: 'contain',
                      objectPosition: 'center',
                      display: 'block',
                      userSelect: 'none',
                      WebkitUserDrag: 'none',
                    }}
                  />
                </div>
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
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.12) 100%)',
            pointerEvents: 'auto',
          }}
        >
          {typeof onOpenAuthorProfile === 'function' && story?.authorId ? (
            <button
              type="button"
              className="story-viewer-profile-hit"
              aria-label="Открыть профиль"
              onClick={(e) => {
                e.stopPropagation();
                onOpenAuthorProfile();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 0,
                margin: 0,
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
                textAlign: 'left',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <UserAvatar src={story.avatarUrl} size={36} borderless />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', lineHeight: 1.25 }}>{story.label}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 2 }}>
                  {formatStorySlideTime(cur.createdAt)}
                </div>
                {story.isSelf && archiveEta ? (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{archiveEta}</div>
                ) : null}
              </div>
            </button>
          ) : (
            <>
              <UserAvatar src={story.avatarUrl} size={36} borderless />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', lineHeight: 1.25 }}>{story.label}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 2 }}>
                  {formatStorySlideTime(cur.createdAt)}
                </div>
                {story.isSelf && archiveEta ? (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{archiveEta}</div>
                ) : null}
              </div>
            </>
          )}
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
          <button
            type="button"
            aria-label="Закрыть"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              flexShrink: 0,
              width: 40,
              height: 40,
              marginRight: -4,
              border: 'none',
              borderRadius: 10,
              background: 'transparent',
              color: '#fff',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              opacity: 0.92,
            }}
          >
            ×
          </button>
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
          className="story-viewer-chrome story-viewer-reply-dock"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 45,
            paddingTop: 4,
            paddingBottom: `max(10px, env(safe-area-inset-bottom, 0px))`,
            background:
              'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.35) 35%, rgba(0,0,0,0.82) 70%, rgba(0,0,0,0.94) 100%)',
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
              padding: '6px 12px 4px',
            }}
          >
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
              placeholder="Ответить сообщением…"
              maxLength={4000}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '11px 14px',
                borderRadius: 22,
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(255,255,255,0.07)',
                color: 'inherit',
                fontSize: 16,
                outline: 'none',
              }}
            />
            <button
              type="button"
              aria-pressed={liked}
              aria-label={liked ? 'Убрать лайк' : 'Лайкнуть историю'}
              disabled={likeBusy}
              onClick={() => void toggleStoryLike()}
              style={{
                position: 'relative',
                width: 46,
                height: 46,
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.22)',
                background: liked ? 'rgba(255,59,92,0.22)' : 'rgba(255,255,255,0.06)',
                cursor: likeBusy ? 'default' : 'pointer',
                color: liked ? '#ff5a7a' : 'rgba(255,255,255,0.92)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: likeBusy ? 0.65 : 1,
              }}
              title="Лайк"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill={liked ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.65"
                  strokeLinejoin="round"
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                />
              </svg>
              {likeCount > 0 ? (
                <span
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.75)',
                    fontSize: 10,
                    fontWeight: 700,
                    lineHeight: '16px',
                    color: '#fff',
                  }}
                >
                  {likeCount > 99 ? '99+' : likeCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              aria-expanded={reactionBarOpen}
              aria-label="Реакции"
              onClick={() => setReactionBarOpen((v) => !v)}
              style={{
                width: 46,
                height: 46,
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.25)',
                background: reactionBarOpen ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)',
                fontSize: 22,
                cursor: 'pointer',
                color: 'inherit',
                flexShrink: 0,
              }}
              title="Реакции"
            >
              ☺
            </button>
          </div>
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

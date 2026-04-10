import { useRef, useCallback, useState, useEffect } from 'react';

const R = 47;
const RING_LEN = 2 * Math.PI * R;

/**
 * Статичное превью (кадр без воспроизведения) → по тапу воспроизведение со звуком.
 * Без автолупа: после окончания снова статичный кадр (как в Telegram по UX).
 */
export default function VideoNoteInChat({ src, durationMs }) {
  const ref = useRef(null);
  const outerRef = useRef(null);
  const boostedRef = useRef(false);
  const userStartedRef = useRef(false);
  const [boosted, setBoosted] = useState(false);
  const [paused, setPaused] = useState(true);
  const [pauseFlashAnim, setPauseFlashAnim] = useState(false);
  const [progress, setProgress] = useState(0);
  const [posterReady, setPosterReady] = useState(false);

  const syncProgress = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    const d = v.duration;
    let p = 0;
    if (d && Number.isFinite(d) && d > 0) {
      p = v.currentTime / d;
    } else if (durationMs != null && durationMs > 0) {
      p = v.currentTime / (durationMs / 1000);
    }
    setProgress(Math.min(1, Math.max(0, p)));
  }, [durationMs]);

  const paintPosterFrame = useCallback(() => {
    const v = ref.current;
    if (!v || userStartedRef.current) return;
    try {
      if (v.readyState >= 2) {
        v.currentTime = Math.min(0.04, (v.duration && v.duration > 0 ? v.duration * 0.01 : 0.04));
        v.pause();
        setPosterReady(true);
      }
    } catch {
      /* */
    }
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    const onTime = () => syncProgress();
    const onMeta = () => {
      paintPosterFrame();
      syncProgress();
    };
    const onLoadedData = () => paintPosterFrame();
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('loadeddata', onLoadedData);
    v.addEventListener('seeked', onTime);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('loadeddata', onLoadedData);
      v.removeEventListener('seeked', onTime);
    };
  }, [src, syncProgress, paintPosterFrame]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    let raf = 0;
    const loop = () => {
      syncProgress();
      const vid = ref.current;
      if (vid && !vid.paused && !vid.ended) {
        raf = requestAnimationFrame(loop);
      }
    };
    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    const onPauseOrEnd = () => {
      cancelAnimationFrame(raf);
      syncProgress();
    };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPauseOrEnd);
    v.addEventListener('ended', onPauseOrEnd);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPauseOrEnd);
      v.removeEventListener('ended', onPauseOrEnd);
    };
  }, [src, syncProgress]);

  /** Пока не в зоне видимости — не тянем файл; затем только метаданные + первый кадр. */
  useEffect(() => {
    const root = outerRef.current;
    const v = ref.current;
    if (!root || !v || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          try {
            v.preload = 'metadata';
            v.load();
          } catch {
            /* */
          }
          io.disconnect();
        }
      },
      { root: null, rootMargin: '120px', threshold: 0 },
    );
    io.observe(root);
    return () => io.disconnect();
  }, [src]);

  const resetToStaticPoster = useCallback(() => {
    const v = ref.current;
    boostedRef.current = false;
    setBoosted(false);
    setPaused(true);
    setPauseFlashAnim(false);
    setProgress(0);
    if (v) {
      v.muted = true;
      v.currentTime = 0;
      v.pause();
      paintPosterFrame();
    }
  }, [paintPosterFrame]);

  const handleTap = useCallback(
    (e) => {
      e.stopPropagation();
      e.preventDefault();
      const v = ref.current;
      if (!v) return;
      if (!boostedRef.current) {
        userStartedRef.current = true;
        boostedRef.current = true;
        setBoosted(true);
        try {
          v.preload = 'auto';
        } catch {
          /* */
        }
        v.muted = false;
        void v.play().catch(() => {});
        requestAnimationFrame(() => syncProgress());
        return;
      }
      if (v.paused) {
        void v.play().catch(() => {});
      } else {
        v.pause();
      }
    },
    [syncProgress],
  );

  const handleEnded = useCallback(() => {
    if (boostedRef.current) {
      resetToStaticPoster();
    }
  }, [resetToStaticPoster]);

  const dashOffset = RING_LEN * (1 - progress);
  const showPlayHint = !boosted && posterReady;

  return (
    <div ref={outerRef} className="chat-video-note-outer">
      <div
        className={`chat-video-note-wrap${boosted ? ' chat-video-note-wrap--boosted' : ''}`}
        role="button"
        tabIndex={0}
        onClick={handleTap}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleTap(e);
          }
        }}
        aria-label={boosted ? 'Видеокружок: пауза или воспроизведение' : 'Видеокружок: нажмите для воспроизведения'}
      >
        <div className="chat-video-note-inner">
          <video
            ref={ref}
            className="chat-video-note"
            src={src}
            preload="none"
            muted={!boosted}
            loop={false}
            playsInline
            onEnded={handleEnded}
            onPlay={() => {
              setPaused(false);
              syncProgress();
            }}
            onPause={(ev) => {
              const vid = ev.currentTarget;
              if (vid.ended) return;
              setPaused(true);
              syncProgress();
              if (boostedRef.current) {
                setPauseFlashAnim(true);
              }
            }}
          />
        </div>
        {showPlayHint ? (
          <div className="chat-video-note-play-hint" aria-hidden>
            <span className="chat-video-note-play-hint-icon">▶</span>
          </div>
        ) : null}
        <svg className="chat-video-note-ring-svg" viewBox="0 0 100 100" aria-hidden>
          <circle className="chat-video-note-ring-track" cx="50" cy="50" r={R} />
          <circle
            className="chat-video-note-ring-progress"
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeDasharray={RING_LEN}
            strokeDashoffset={dashOffset}
          />
        </svg>
        {boosted && paused ? (
          <div
            className={
              pauseFlashAnim
                ? 'chat-video-note-pause-overlay chat-video-note-pause-overlay--visible chat-video-note-pause-overlay--flash'
                : 'chat-video-note-pause-overlay chat-video-note-pause-overlay--visible'
            }
            aria-hidden
            onAnimationEnd={(e) => {
              if (e.animationName === 'chatVideoPauseFlash') {
                setPauseFlashAnim(false);
              }
            }}
          >
            <svg className="chat-video-note-pause-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="5" y="4" width="5" height="16" rx="1" />
              <rect x="14" y="4" width="5" height="16" rx="1" />
            </svg>
          </div>
        ) : null}
      </div>
    </div>
  );
}

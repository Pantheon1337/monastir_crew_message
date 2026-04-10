import { useRef, useCallback, useState } from 'react';

/**
 * Видеокружок в чате: прогресс по кругу как в Telegram, первый тап — увеличение и звук.
 */
export default function VideoNoteInChat({ src, durationMs }) {
  const ref = useRef(null);
  const boostedRef = useRef(false);
  const [boosted, setBoosted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pauseFlashAnim, setPauseFlashAnim] = useState(false);
  const [progress, setProgress] = useState(0);

  const resetToSilentPreview = useCallback(() => {
    const v = ref.current;
    boostedRef.current = false;
    setBoosted(false);
    setPaused(false);
    setPauseFlashAnim(false);
    setProgress(0);
    if (v) {
      v.muted = true;
      v.currentTime = 0;
      void v.play().catch(() => {});
    }
  }, []);

  const handleTap = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    const v = ref.current;
    if (!v) return;
    if (!boostedRef.current) {
      boostedRef.current = true;
      setBoosted(true);
      v.muted = false;
      void v.play().catch(() => {});
      return;
    }
    if (v.paused) {
      void v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, []);

  const handleEnded = useCallback(() => {
    if (boostedRef.current) {
      resetToSilentPreview();
    }
  }, [resetToSilentPreview]);

  const onTimeUpdate = useCallback((e) => {
    const v = e.currentTarget;
    const d = v.duration;
    if (!d || !Number.isFinite(d) || d <= 0) {
      if (durationMs != null && durationMs > 0) {
        setProgress(Math.min(1, v.currentTime / (durationMs / 1000)));
      }
      return;
    }
    setProgress(Math.min(1, v.currentTime / d));
  }, [durationMs]);

  return (
    <div
      className={`chat-video-note-wrap${boosted ? ' chat-video-note-wrap--boosted' : ''}`}
      style={{
        margin: '0 auto',
        position: 'relative',
        flexShrink: 0,
      }}
      role="button"
      tabIndex={0}
      onClick={handleTap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleTap(e);
        }
      }}
      aria-label={boosted ? 'Видеокружок: пауза или воспроизведение' : 'Видеокружок: нажмите для увеличения и звука'}
    >
      <svg
        className="chat-video-note-ring-svg"
        viewBox="0 0 100 100"
        aria-hidden
      >
        <circle className="chat-video-note-ring-track" cx="50" cy="50" r="46" />
        <circle
          className="chat-video-note-ring-progress"
          cx="50" cy="50"
          r="46"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - progress * 100}
        />
      </svg>
      <div className="chat-video-note-inner">
        <video
          ref={ref}
          className="chat-video-note"
          src={src}
          muted={!boosted}
          loop={!boosted}
          playsInline
          autoPlay
          onEnded={handleEnded}
          onTimeUpdate={onTimeUpdate}
          onPlay={() => setPaused(false)}
          onPause={(ev) => {
            const v = ev.currentTarget;
            if (v.ended) return;
            setPaused(true);
            if (boostedRef.current) {
              setPauseFlashAnim(true);
            }
          }}
        />
      </div>
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
  );
}

import { useEffect, useRef, useState, useCallback } from 'react';

function formatClock(sec) {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}:${String(rs).padStart(2, '0')}`;
}

/** Голосовое без «квадратного» chrome: плашка как в Telegram (плей + прогресс). */
export default function VoiceMessagePlayer({ src, durationMs, mine }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);
  const [durSec, setDurSec] = useState(durationMs != null ? durationMs / 1000 : null);

  const syncDuration = useCallback(() => {
    const a = audioRef.current;
    if (!a?.duration || !Number.isFinite(a.duration)) return;
    setDurSec(a.duration);
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return undefined;
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      setCurrentSec(0);
    };
    const onTime = () => {
      if (!a.duration || !Number.isFinite(a.duration)) return;
      setProgress(a.currentTime / a.duration);
      setCurrentSec(a.currentTime);
    };
    const onMeta = () => syncDuration();
    a.addEventListener('ended', onEnded);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    return () => {
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
    };
  }, [src, syncDuration]);

  function toggle(e) {
    e.stopPropagation();
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      void a.play()
        .then(() => setPlaying(true))
        .catch(() => {});
    }
  }

  const totalLabel = formatClock(durSec ?? (durationMs != null ? durationMs / 1000 : 0));
  const curLabel = formatClock(playing ? currentSec : 0);

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 200,
        maxWidth: 300,
        padding: '6px 10px 6px 6px',
        borderRadius: 22,
        background: mine ? 'rgba(193, 123, 75, 0.28)' : 'rgba(255, 255, 255, 0.08)',
        border: 'none',
        boxSizing: 'border-box',
      }}
    >
      <audio ref={audioRef} src={src} preload="metadata" style={{ display: 'none' }} />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: 'none',
          flexShrink: 0,
          background: mine ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.12)',
          color: 'inherit',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 15,
          lineHeight: 1,
          padding: 0,
        }}
      >
        {playing ? <span style={{ fontSize: 13 }}>⏸</span> : <span style={{ marginLeft: 3 }}>▶</span>}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            height: 3,
            borderRadius: 2,
            background: 'rgba(255,255,255,0.14)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, progress * 100)}%`,
              background: 'var(--accent)',
              borderRadius: 2,
            }}
          />
        </div>
        <div
          className="muted"
          style={{
            fontSize: 10,
            marginTop: 5,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            minHeight: 14,
          }}
        >
          <span style={{ visibility: playing ? 'visible' : 'hidden', flexShrink: 0 }}>{curLabel}</span>
          <span>{totalLabel}</span>
        </div>
      </div>
    </div>
  );
}

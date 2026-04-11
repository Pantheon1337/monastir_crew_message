import { useEffect, useRef, useState, useCallback } from 'react';
import { getOrCreateVideoNoteStream, scheduleReleaseCameraStream, releaseCameraStreamNow } from '../../cameraSession.js';
import {
  pickVideoMime,
  buildVideoNoteFile,
  formatVideoNoteTimer,
  MAX_VIDEO_NOTE_MS,
  MIN_VIDEO_NOTE_MS,
  VIDEO_RING_LEN,
  VIDEO_RING_R,
} from './videoNoteUtils.js';

/** Внутреннее разрешение canvas: ниже — меньше нагрузка на CPU/GPU при rAF + MediaRecorder. */
const CANVAS_SIZE = 480;
const CAPTURE_FPS = 24;

/**
 * object-fit: cover + горизонтальное отражение для селфи (как в Telegram: превью и запись с одного кадра).
 * Для environment отражение выключено.
 */
function drawVideoNoteFrame(video, canvas, flipHorizontal) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cw = canvas.width;
  const ch = canvas.height;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || cw < 2 || ch < 2) return;

  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  if (flipHorizontal) {
    ctx.translate(cw, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, vw, vh, dx, dy, dw, dh);
  ctx.restore();
}

function useRecordingClock() {
  const recStartRef = useRef(0);
  const pausedMsRef = useRef(0);
  const pauseBeginRef = useRef(null);

  const reset = useCallback(() => {
    recStartRef.current = 0;
    pausedMsRef.current = 0;
    pauseBeginRef.current = null;
  }, []);

  const beginRecording = useCallback(() => {
    recStartRef.current = Date.now();
    pausedMsRef.current = 0;
    pauseBeginRef.current = null;
  }, []);

  const snapshotElapsed = useCallback(() => {
    const start = recStartRef.current;
    if (!start) return 0;
    let extraPause = 0;
    if (pauseBeginRef.current != null) {
      extraPause = Date.now() - pauseBeginRef.current;
    }
    return Math.min(MAX_VIDEO_NOTE_MS, Date.now() - start - pausedMsRef.current - extraPause);
  }, []);

  const onPauseBegin = useCallback(() => {
    if (pauseBeginRef.current == null) pauseBeginRef.current = Date.now();
  }, []);

  const onPauseEnd = useCallback(() => {
    if (pauseBeginRef.current != null) {
      pausedMsRef.current += Date.now() - pauseBeginRef.current;
      pauseBeginRef.current = null;
    }
  }, []);

  const sealPauseIntoTotal = useCallback(() => {
    if (pauseBeginRef.current != null) {
      pausedMsRef.current += Date.now() - pauseBeginRef.current;
      pauseBeginRef.current = null;
    }
  }, []);

  return {
    recStartRef,
    reset,
    beginRecording,
    snapshotElapsed,
    onPauseBegin,
    onPauseEnd,
    sealPauseIntoTotal,
  };
}

/**
 * Полноэкранная запись видеокружка: превью → запись с таймером, пауза, смена камеры, вспышка (если есть), отправка.
 */
export default function VideoNoteRecordModal({ open, onClose, onSend, errorBanner = null }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const maxDurTimerRef = useRef(null);
  const masterRafRef = useRef(null);
  const ringRef = useRef(null);
  const phaseRef = useRef('preview');
  const facingModeRef = useRef('user');
  const snapshotElapsedRef = useRef(() => 0);
  const clock = useRecordingClock();

  const [phase, setPhase] = useState('preview'); // preview | recording | paused
  const [facingMode, setFacingMode] = useState('user');
  const [torchOn, setTorchOn] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [loadErr, setLoadErr] = useState(null);
  const [inlineErr, setInlineErr] = useState(null);
  const [sending, setSending] = useState(false);

  const cleanupStream = useCallback(() => {
    if (masterRafRef.current) {
      cancelAnimationFrame(masterRafRef.current);
      masterRafRef.current = null;
    }
    if (maxDurTimerRef.current) {
      clearTimeout(maxDurTimerRef.current);
      maxDurTimerRef.current = null;
    }
    const ctx = recRef.current;
    if (ctx?.mr) {
      try {
        ctx.mr.stop();
      } catch {
        /* */
      }
    }
    recRef.current = null;
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const c = canvasRef.current;
    if (c) {
      const cx = c.getContext('2d');
      if (cx) cx.clearRect(0, 0, c.width || 1, c.height || 1);
    }
    scheduleReleaseCameraStream();
  }, []);

  const resetState = useCallback(() => {
    setPhase('preview');
    setTorchOn(false);
    setElapsedMs(0);
    setLoadErr(null);
    setInlineErr(null);
    setSending(false);
    clock.reset();
  }, [clock]);

  useEffect(() => {
    if (!open) {
      cleanupStream();
      resetState();
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadErr(null);
      const canvasEarly = canvasRef.current;
      if (canvasEarly) {
        canvasEarly.width = CANVAS_SIZE;
        canvasEarly.height = CANVAS_SIZE;
      }
      try {
        const stream = await getOrCreateVideoNoteStream(facingMode);
        if (cancelled) return;
        streamRef.current = stream;
        const el = videoRef.current;
        const canvas = canvasRef.current;
        if (el) {
          el.srcObject = stream;
          el.muted = true;
          el.playsInline = true;
          await el.play().catch(() => {});
        }
        if (canvas) {
          canvas.width = CANVAS_SIZE;
          canvas.height = CANVAS_SIZE;
        }
      } catch (e) {
        if (!cancelled) setLoadErr(e?.message || 'Нет доступа к камере');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, facingMode, cleanupStream, resetState]);

  /** Один rAF: кадр в canvas + кольцо и таймер при записи (без setInterval + второго rAF). */
  useEffect(() => {
    if (!open || loadErr) return undefined;
    let frameIdx = 0;
    const loop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        drawVideoNoteFrame(video, canvas, facingModeRef.current === 'user');
      }
      const ph = phaseRef.current;
      if (ph === 'recording' || ph === 'paused') {
        const t = snapshotElapsedRef.current();
        if (frameIdx++ % 2 === 0) setElapsedMs(t);
        const el = ringRef.current;
        if (el) {
          const p = Math.min(1, t / MAX_VIDEO_NOTE_MS);
          el.setAttribute('stroke-dashoffset', String(VIDEO_RING_LEN * (1 - p)));
        }
      }
      masterRafRef.current = requestAnimationFrame(loop);
    };
    masterRafRef.current = requestAnimationFrame(loop);
    return () => {
      if (masterRafRef.current) cancelAnimationFrame(masterRafRef.current);
      masterRafRef.current = null;
    };
  }, [open, loadErr]);

  const stopMediaRecorder = useCallback(async () => {
    const ctx = recRef.current;
    recRef.current = null;
    if (!ctx) return null;
    const { mr, chunks } = ctx;
    try {
      if (typeof mr.requestData === 'function') mr.requestData();
    } catch {
      /* */
    }
    await new Promise((r) => {
      mr.onstop = r;
      try {
        mr.stop();
      } catch {
        r();
      }
    });
    clock.sealPauseIntoTotal();
    const elapsed = clock.snapshotElapsed();
    const blob = new Blob(chunks, { type: mr.mimeType || 'video/webm' });
    return { blob, mr, elapsed: Math.max(0, elapsed) };
  }, [clock]);

  const finalizeUpload = useCallback(
    async (blob, mr, elapsed) => {
      if (elapsed < MIN_VIDEO_NOTE_MS) {
        setInlineErr('Слишком коротко');
        return;
      }
      if (!blob?.size) {
        setInlineErr('Пустая запись');
        return;
      }
      const file = buildVideoNoteFile(blob, mr);
      setSending(true);
      setInlineErr(null);
      try {
        await onSend(file, elapsed);
        onClose();
      } catch (e) {
        setInlineErr(e?.message || 'Не удалось отправить');
      } finally {
        setSending(false);
      }
    },
    [onSend, onClose],
  );

  const handleSendPress = useCallback(async () => {
    if (sending) return;
    if (phase !== 'recording' && phase !== 'paused') return;
    if (maxDurTimerRef.current) {
      clearTimeout(maxDurTimerRef.current);
      maxDurTimerRef.current = null;
    }
    setPhase('preview');
    const pack = await stopMediaRecorder();
    if (!pack) return;
    await finalizeUpload(pack.blob, pack.mr, pack.elapsed);
  }, [sending, phase, stopMediaRecorder, finalizeUpload]);

  const handleStartRecording = useCallback(() => {
    const stream = streamRef.current;
    const canvas = canvasRef.current;
    if (!stream || !canvas || recRef.current) return;

    let recordStream = stream;
    try {
      const cap = canvas.captureStream(CAPTURE_FPS);
      const vt = cap.getVideoTracks()[0];
      const audio = stream.getAudioTracks();
      if (vt) {
        recordStream = audio.length ? new MediaStream([vt, ...audio]) : new MediaStream([vt]);
      }
    } catch {
      recordStream = stream;
    }

    const mime = pickVideoMime();
    const opts = { videoBitsPerSecond: 1_800_000, audioBitsPerSecond: 128_000 };
    if (mime) opts.mimeType = mime;
    let mr;
    try {
      mr = new MediaRecorder(recordStream, opts);
    } catch {
      try {
        mr = new MediaRecorder(recordStream, mime ? { mimeType: mime } : {});
      } catch {
        mr = new MediaRecorder(recordStream);
      }
    }
    const chunks = [];
    mr.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };
    mr.start(200);
    recRef.current = { mr, chunks };
    clock.beginRecording();
    setElapsedMs(0);
    setInlineErr(null);
    setPhase('recording');

    maxDurTimerRef.current = setTimeout(() => {
      void (async () => {
        setPhase('preview');
        const pack = await stopMediaRecorder();
        if (pack) await finalizeUpload(pack.blob, pack.mr, pack.elapsed);
      })();
    }, MAX_VIDEO_NOTE_MS);
  }, [clock, stopMediaRecorder, finalizeUpload]);

  const togglePause = useCallback(() => {
    const ctx = recRef.current;
    if (!ctx?.mr) return;
    if (phase === 'recording') {
      if (typeof ctx.mr.pause !== 'function') return;
      try {
        ctx.mr.pause();
      } catch {
        return;
      }
      clock.onPauseBegin();
      setPhase('paused');
    } else if (phase === 'paused') {
      try {
        ctx.mr.resume();
      } catch {
        return;
      }
      clock.onPauseEnd();
      setPhase('recording');
    }
  }, [phase, clock]);

  const flipCamera = useCallback(async () => {
    if (phase !== 'preview' || sending) return;
    setFacingMode((m) => (m === 'user' ? 'environment' : 'user'));
    setTorchOn(false);
  }, [phase, sending]);

  const toggleTorch = useCallback(async () => {
    const stream = streamRef.current;
    const track = stream?.getVideoTracks?.()?.[0];
    if (!track || facingMode !== 'environment') return;
    try {
      await track.applyConstraints({
        advanced: [{ torch: !torchOn }],
      });
      setTorchOn((v) => !v);
    } catch {
      /* */
    }
  }, [facingMode, torchOn]);

  const handleCancel = useCallback(() => {
    if (sending) return;
    if (maxDurTimerRef.current) {
      clearTimeout(maxDurTimerRef.current);
      maxDurTimerRef.current = null;
    }
    cleanupStream();
    resetState();
    releaseCameraStreamNow();
    onClose();
  }, [sending, cleanupStream, resetState, onClose]);

  const canPause = typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.prototype?.pause === 'function';

  snapshotElapsedRef.current = clock.snapshotElapsed;
  phaseRef.current = phase;
  facingModeRef.current = facingMode;

  if (!open) return null;

  const circleSize = 'min(88vmin, 380px)';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Видеокружок"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 95,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'max(12px, env(safe-area-inset-top)) 12px max(16px, env(safe-area-inset-bottom))',
        background: 'rgba(15, 16, 20, 0.88)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
      }}
    >
      {errorBanner}
      {loadErr ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 }}>
          <p style={{ margin: 0, fontSize: 14, textAlign: 'center', color: '#e8e8ea' }}>{loadErr}</p>
          <button type="button" className="btn-primary" onClick={handleCancel}>
            Закрыть
          </button>
        </div>
      ) : (
        <>
          {inlineErr ? (
            <div
              style={{
                width: '100%',
                maxWidth: 420,
                marginBottom: 8,
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(196, 92, 92, 0.2)',
                border: '1px solid rgba(196, 92, 92, 0.45)',
                fontSize: 12,
                color: '#f0d0d0',
                textAlign: 'center',
              }}
            >
              {inlineErr}
            </div>
          ) : null}
          <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
            <div style={{ position: 'relative', width: circleSize, height: circleSize, maxWidth: '100%' }}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: '#000',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
                  position: 'relative',
                }}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    opacity: 0,
                    pointerEvents: 'none',
                  }}
                />
                <canvas
                  ref={canvasRef}
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    objectFit: 'cover',
                  }}
                />
              </div>
              <svg
                viewBox="0 0 240 240"
                width="calc(100% + 24px)"
                height="calc(100% + 24px)"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%) rotate(-90deg)',
                  pointerEvents: 'none',
                }}
                aria-hidden
              >
                <circle cx="120" cy="120" r={VIDEO_RING_R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="5" />
                <circle
                  ref={ringRef}
                  cx="120"
                  cy="120"
                  r={VIDEO_RING_R}
                  fill="none"
                  stroke="var(--accent, #c17b4b)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={VIDEO_RING_LEN}
                  strokeDashoffset={VIDEO_RING_LEN}
                />
              </svg>
            </div>

            {phase === 'preview' ? (
              <p className="muted" style={{ marginTop: 16, fontSize: 12, textAlign: 'center', maxWidth: 320, color: 'rgba(255,255,255,0.55)' }}>
                «Запись», затем «Отправить» ↑ или автостоп через {Math.round(MAX_VIDEO_NOTE_MS / 1000)} с
              </p>
            ) : null}
          </div>

          <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 4px' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  disabled={phase !== 'preview' || sending}
                  onClick={() => void flipCamera()}
                  title="Сменить камеру"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    border: '1px solid var(--border)',
                    background: 'var(--panel)',
                    fontSize: 18,
                    cursor: phase === 'preview' ? 'pointer' : 'default',
                    opacity: phase === 'preview' ? 1 : 0.45,
                    color: 'var(--text)',
                  }}
                >
                  ⇄
                </button>
                <button
                  type="button"
                  disabled={phase !== 'preview' || sending || facingMode !== 'environment'}
                  onClick={() => void toggleTorch()}
                  title="Вспышка"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    border: '1px solid var(--border)',
                    background: 'var(--panel)',
                    fontSize: 18,
                    cursor: facingMode === 'environment' ? 'pointer' : 'default',
                    opacity: facingMode === 'environment' ? 1 : 0.35,
                    color: 'var(--text)',
                  }}
                >
                  {torchOn ? '⚡' : '⚡̸'}
                </button>
              </div>
              {phase === 'recording' || phase === 'paused' ? (
                <button
                  type="button"
                  disabled={!canPause}
                  onClick={togglePause}
                  title={phase === 'paused' ? 'Продолжить' : 'Пауза'}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    border: '1px solid var(--border)',
                    background: 'var(--panel)',
                    fontSize: 14,
                    cursor: canPause ? 'pointer' : 'not-allowed',
                    color: 'var(--text)',
                    opacity: canPause ? 1 : 0.4,
                  }}
                >
                  {phase === 'paused' ? '▶' : '❚❚'}
                </button>
              ) : (
                <span style={{ width: 44 }} />
              )}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 999,
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
              }}
            >
              {(phase === 'recording' || phase === 'paused') && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} aria-hidden />
                  <span
                    style={{
                      fontSize: 14,
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--text)',
                      fontWeight: 600,
                    }}
                  >
                    {formatVideoNoteTimer(elapsedMs)}
                  </span>
                </span>
              )}
              {phase === 'preview' && (
                <button
                  type="button"
                  disabled={sending}
                  onClick={handleStartRecording}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: 999,
                    border: '1px solid var(--accent)',
                    background: 'var(--accent)',
                    color: 'var(--bg)',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  Запись
                </button>
              )}
              <button
                type="button"
                disabled={sending}
                onClick={handleCancel}
                style={{
                  padding: '8px 12px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--muted)',
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={sending || phase === 'preview'}
                onClick={() => void handleSendPress()}
                title="Отправить"
                style={{
                  width: 52,
                  height: 52,
                  marginLeft: 'auto',
                  borderRadius: '50%',
                  border: '1px solid var(--accent)',
                  background: 'var(--accent)',
                  color: 'var(--bg)',
                  fontSize: 22,
                  cursor: phase === 'preview' ? 'not-allowed' : 'pointer',
                  opacity: phase === 'preview' ? 0.45 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                }}
              >
                {sending ? '…' : '↑'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

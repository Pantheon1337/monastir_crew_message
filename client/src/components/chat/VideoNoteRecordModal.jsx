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
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const maxDurTimerRef = useRef(null);
  const rafRingRef = useRef(null);
  const ringRef = useRef(null);
  const clock = useRecordingClock();

  const [phase, setPhase] = useState('preview'); // preview | recording | paused
  const [facingMode, setFacingMode] = useState('user');
  const [torchOn, setTorchOn] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [loadErr, setLoadErr] = useState(null);
  const [inlineErr, setInlineErr] = useState(null);
  const [sending, setSending] = useState(false);

  const cleanupStream = useCallback(() => {
    if (maxDurTimerRef.current) {
      clearTimeout(maxDurTimerRef.current);
      maxDurTimerRef.current = null;
    }
    if (rafRingRef.current) {
      cancelAnimationFrame(rafRingRef.current);
      rafRingRef.current = null;
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
      try {
        const stream = await getOrCreateVideoNoteStream(facingMode);
        if (cancelled) return;
        streamRef.current = stream;
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          el.muted = true;
          el.playsInline = true;
          await el.play().catch(() => {});
        }
      } catch (e) {
        if (!cancelled) setLoadErr(e?.message || 'Нет доступа к камере');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, facingMode, cleanupStream, resetState]);

  useEffect(() => {
    if (!open || phase === 'preview') return undefined;
    const id = window.setInterval(() => {
      setElapsedMs(clock.snapshotElapsed());
    }, 80);
    return () => clearInterval(id);
  }, [open, phase, clock]);

  useEffect(() => {
    if (!open || phase !== 'recording') return undefined;
    const tick = () => {
      const el = ringRef.current;
      if (!el) return;
      const t = clock.snapshotElapsed();
      const p = Math.min(1, t / MAX_VIDEO_NOTE_MS);
      el.setAttribute('stroke-dashoffset', String(VIDEO_RING_LEN * (1 - p)));
      if (p < 1) rafRingRef.current = requestAnimationFrame(tick);
    };
    rafRingRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRingRef.current) cancelAnimationFrame(rafRingRef.current);
    };
  }, [open, phase, clock]);

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
    if (!stream || recRef.current) return;
    const mime = pickVideoMime();
    const opts = { videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 };
    if (mime) opts.mimeType = mime;
    let mr;
    try {
      mr = new MediaRecorder(stream, opts);
    } catch {
      mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
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
                }}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: 'none',
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
                    border: '1px solid rgba(255,255,255,0.25)',
                    background: 'rgba(255,255,255,0.1)',
                    fontSize: 18,
                    cursor: phase === 'preview' ? 'pointer' : 'default',
                    opacity: phase === 'preview' ? 1 : 0.45,
                    color: '#fff',
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
                    border: '1px solid rgba(255,255,255,0.25)',
                    background: 'rgba(255,255,255,0.1)',
                    fontSize: 18,
                    cursor: facingMode === 'environment' ? 'pointer' : 'default',
                    opacity: facingMode === 'environment' ? 1 : 0.35,
                    color: '#fff',
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
                    border: '1px solid rgba(255,255,255,0.25)',
                    background: 'rgba(255,255,255,0.1)',
                    fontSize: 14,
                    cursor: canPause ? 'pointer' : 'not-allowed',
                    color: '#fff',
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
                background: 'rgba(246, 246, 247, 0.98)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
              }}
            >
              {(phase === 'recording' || phase === 'paused') && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e53935', flexShrink: 0 }} aria-hidden />
                  <span style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', color: '#111', fontWeight: 600 }}>
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
                    border: 'none',
                    background: '#e53935',
                    color: '#fff',
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
                  color: '#007aff',
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
                  border: 'none',
                  background: 'linear-gradient(180deg, #3d9aed, #2b8ae8)',
                  color: '#fff',
                  fontSize: 22,
                  cursor: phase === 'preview' ? 'not-allowed' : 'pointer',
                  opacity: phase === 'preview' ? 0.45 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(43,138,232,0.45)',
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

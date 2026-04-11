import { useState, useRef, useEffect, useCallback } from 'react';
import { api, apiUpload } from '../api.js';

const MAX_EDGE = 1920;
const DISMISS_DRAG_THRESHOLD_PX = 88;
const DISMISS_AXIS_LOCK_PX = 10;
const DISMISS_ANIM_MS = 320;
const DISMISS_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

function HiddenGalleryInput({ inputRef, onPick }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp"
      style={{ display: 'none' }}
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) onPick(f);
      }}
    />
  );
}

function captureFrameFromVideo(video) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return Promise.resolve(null);
  let w = vw;
  let h = vh;
  if (w > MAX_EDGE || h > MAX_EDGE) {
    const r = Math.min(MAX_EDGE / w, MAX_EDGE / h);
    w = Math.round(w * r);
    h = Math.round(h * r);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(video, 0, 0, w, h);
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve(new File([blob], `story-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.88
    );
  });
}

/** live = камера сразу; preview = фото + подпись; textOnly = только текст */
export default function StoryCreateModal({ userId, onClose, onCreated }) {
  const [mode, setMode] = useState('live');
  const [text, setText] = useState('');
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pickedFile, setPickedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [facing, setFacing] = useState('environment');
  /** Показывать кадр в сетке профиля у гостей; иначе только в ленте кружков, затем в архив */
  const [showInProfile, setShowInProfile] = useState(true);
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);
  /** Сдвиг экрана при жесте закрытия (свайп вверх/вниз) */
  const [sheetY, setSheetY] = useState(0);
  /** Идёт перетаскивание — без transition; иначе плавный возврат или уход */
  const [sheetDragging, setSheetDragging] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const galleryRef = useRef(null);
  const sheetDragRef = useRef(null);

  const stopStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const closeAnimated = useCallback(
    (direction) => {
      const h = typeof window !== 'undefined' ? window.innerHeight : 800;
      setSheetDragging(false);
      setSheetY(direction === 'down' ? h : -h);
      window.setTimeout(() => {
        stopStream();
        onClose();
      }, DISMISS_ANIM_MS);
    },
    [onClose, stopStream],
  );

  function canStartSheetDismiss(e) {
    if (confirmPublishOpen || saving) return false;
    const t = e.target;
    if (t.closest('button') || t.closest('input') || t.closest('label')) return false;
    if (t.closest('textarea')) return false;
    return true;
  }

  function onSheetPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!canStartSheetDismiss(e)) return;
    sheetDragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startX: e.clientX,
      axis: null,
    };
    setSheetDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onSheetPointerMove(e) {
    const d = sheetDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    const dx = e.clientX - d.startX;
    if (d.axis == null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DISMISS_AXIS_LOCK_PX) return;
      if (Math.abs(dx) >= Math.abs(dy)) {
        sheetDragRef.current = null;
        setSheetDragging(false);
        setSheetY(0);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }
      d.axis = 'y';
    }
    const h = typeof window !== 'undefined' ? window.innerHeight : 600;
    const rubber = dy * 0.58;
    const max = h * 0.45;
    setSheetY(Math.max(-max, Math.min(max, rubber)));
  }

  function onSheetPointerUp(e) {
    const d = sheetDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    sheetDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const dy = e.clientY - d.startY;
    setSheetDragging(false);
    if (d.axis === 'y' && Math.abs(dy) >= DISMISS_DRAG_THRESHOLD_PX) {
      closeAnimated(dy > 0 ? 'down' : 'up');
      return;
    }
    setSheetY(0);
  }

  function onSheetPointerCancel(e) {
    const d = sheetDragRef.current;
    if (d && d.pointerId === e.pointerId) {
      sheetDragRef.current = null;
      setSheetDragging(false);
      setSheetY(0);
    }
  }

  useEffect(() => {
    function onKey(ev) {
      if (ev.key !== 'Escape') return;
      if (confirmPublishOpen) {
        setConfirmPublishOpen(false);
        return;
      }
      closeAnimated('down');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmPublishOpen, closeAnimated]);

  useEffect(() => {
    if (mode !== 'live') {
      stopStream();
      return undefined;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Камера недоступна в этом браузере');
      return undefined;
    }
    if (!window.isSecureContext) {
      setCameraError('Камера доступна только по HTTPS');
      return undefined;
    }

    let cancelled = false;
    setCameraError(null);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          el.playsInline = true;
          await el.play().catch(() => {});
        }
      } catch {
        if (!cancelled) setCameraError('Нет доступа к камере');
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [mode, facing, stopStream]);

  useEffect(() => {
    return () => {
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl, stopStream]);

  function goPreviewWithFile(f) {
    setErr(null);
    setPickedFile(f);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setMode('preview');
    stopStream();
  }

  function retake() {
    setPickedFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setText('');
    setErr(null);
    setMode('live');
  }

  async function shutter() {
    const v = videoRef.current;
    if (!v) return;
    const file = await captureFrameFromVideo(v);
    if (!file) {
      setErr('Не удалось снять кадр');
      return;
    }
    goPreviewWithFile(file);
  }

  async function submitTextOnly() {
    const t = text.trim();
    if (!t) {
      setErr('Введите текст');
      return;
    }
    setSaving(true);
    setErr(null);
    const { ok, data } = await api('/api/stories', {
      method: 'POST',
      body: { body: t, showInProfile },
      userId,
    });
    setSaving(false);
    if (!ok) {
      setErr(data?.error || 'Не сохранено');
      return;
    }
    setConfirmPublishOpen(false);
    onCreated?.();
    onClose();
  }

  async function submitWithFile() {
    const t = text.trim();
    if (!pickedFile && !t) {
      setErr('Добавьте фото или текст');
      return;
    }
    if (pickedFile) {
      setSaving(true);
      setErr(null);
      const { ok, data } = await apiUpload('/api/stories/upload', {
        file: pickedFile,
        userId,
        fieldName: 'media',
        extraFields: { body: t, showInProfile: showInProfile ? '1' : '0' },
      });
      setSaving(false);
      if (!ok) {
        setErr(data?.error || 'Не сохранено');
        return;
      }
      setConfirmPublishOpen(false);
      onCreated?.();
      onClose();
      return;
    }
    await submitTextOnly();
  }

  function requestPublish() {
    const t = text.trim();
    if (mode === 'textOnly') {
      if (!t) {
        setErr('Введите текст');
        return;
      }
    } else if (mode === 'preview') {
      if (!pickedFile && !t) {
        setErr('Добавьте фото или текст');
        return;
      }
    }
    setErr(null);
    setConfirmPublishOpen(true);
  }

  const canUseCamera =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext;

  const hWin = typeof window !== 'undefined' ? window.innerHeight : 640;
  const sheetOpacity = 1 - Math.min(Math.abs(sheetY) / (hWin * 0.55), 0.22);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-create-title"
      aria-describedby="story-create-dismiss-hint"
      onPointerDown={onSheetPointerDown}
      onPointerMove={onSheetPointerMove}
      onPointerUp={onSheetPointerUp}
      onPointerCancel={onSheetPointerCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 110,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        touchAction: sheetDragging ? 'none' : 'auto',
        transform: `translateY(${sheetY}px)`,
        opacity: sheetOpacity,
        transition: sheetDragging ? 'none' : `transform ${DISMISS_ANIM_MS}ms ${DISMISS_EASE}, opacity ${DISMISS_ANIM_MS}ms ${DISMISS_EASE}`,
      }}
    >
      <p
        id="story-create-dismiss-hint"
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
        Закрыть: свайп вверх или вниз по экрану, или клавиша Escape.
      </p>
      <HiddenGalleryInput inputRef={galleryRef} onPick={goPreviewWithFile} />

      {mode === 'live' && (
        <>
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 5,
              padding: '10px 12px',
              paddingTop: 'max(10px, env(safe-area-inset-top))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)',
            }}
          >
            <span id="story-create-title" style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
              История
            </span>
          </div>

          <div style={{ flex: 1, position: 'relative', background: '#000', minHeight: 0 }}>
            {canUseCamera && !cameraError ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 24,
                  textAlign: 'center',
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: 13,
                }}
              >
                <p style={{ margin: '0 0 16px' }}>{cameraError || 'Камера недоступна'}</p>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  style={{
                    padding: '12px 20px',
                    borderRadius: 'var(--radius)',
                    border: '1px solid rgba(255,255,255,0.45)',
                    background: 'rgba(255,255,255,0.1)',
                    color: '#fff',
                    fontSize: 13,
                  }}
                >
                  Выбрать из галереи
                </button>
              </div>
            )}
          </div>

          <div
            style={{
              flexShrink: 0,
              minHeight: 108,
              paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
              background: 'linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0.25))',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', minHeight: 88, padding: '0 8px' }}>
              {/* Галерея — слева снизу */}
              <button
                type="button"
                aria-label="Открыть галерею"
                onClick={() => galleryRef.current?.click()}
                style={{
                  position: 'absolute',
                  left: 'max(12px, env(safe-area-inset-left))',
                  bottom: 'max(20px, env(safe-area-inset-bottom))',
                  minWidth: 56,
                  padding: '8px 10px',
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.45)',
                  background: 'rgba(30,30,35,0.95)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  lineHeight: 1.2,
                }}
              >
                Галерея
              </button>

              <button
                type="button"
                aria-label="Снять"
                disabled={!canUseCamera || Boolean(cameraError)}
                onClick={() => void shutter()}
                style={{
                  width: 76,
                  height: 76,
                  marginBottom: 8,
                  borderRadius: '50%',
                  border: '4px solid #fff',
                  background: 'transparent',
                  padding: 4,
                  cursor: !canUseCamera || cameraError ? 'not-allowed' : 'pointer',
                  opacity: !canUseCamera || cameraError ? 0.45 : 1,
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    background: '#fff',
                  }}
                />
              </button>

              <button
                type="button"
                aria-label="Переключить камеру"
                disabled={!canUseCamera || Boolean(cameraError)}
                onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
                style={{
                  position: 'absolute',
                  right: 'max(12px, env(safe-area-inset-right))',
                  bottom: 'max(24px, env(safe-area-inset-bottom))',
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.4)',
                  background: 'rgba(0,0,0,0.45)',
                  color: '#fff',
                  fontSize: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ⟲
              </button>
            </div>

            <div style={{ textAlign: 'center', padding: '0 12px 4px' }}>
              <button
                type="button"
                onClick={() => {
                  stopStream();
                  setText('');
                  setErr(null);
                  setMode('textOnly');
                }}
                style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.65)',
                  textDecoration: 'underline',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Только текст, без фото
              </button>
            </div>
          </div>
        </>
      )}

      {mode === 'textOnly' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg)',
            padding: 16,
            paddingTop: 'max(16px, env(safe-area-inset-top))',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Текстовая история</span>
          </div>
          <textarea
            className="text-input"
            style={{ width: '100%', flex: 1, minHeight: 120, resize: 'none', marginBottom: 12 }}
            placeholder="Текст…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
          />
          {err ? <p style={{ fontSize: 11, color: '#c45c5c', margin: '0 0 8px' }}>{err}</p> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-primary" style={{ flex: 1 }} disabled={saving} onClick={() => requestPublish()}>
              {saving ? '…' : 'Опубликовать'}
            </button>
            <button
              type="button"
              className="btn-outline"
              style={{ flex: 1 }}
              onClick={() => {
                setErr(null);
                setMode('live');
              }}
            >
              К камере
            </button>
          </div>
        </div>
      )}

      {mode === 'preview' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            background: '#0c0d10',
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              paddingTop: 'max(10px, env(safe-area-inset-top))',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>Публикация</span>
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12,
            }}
          >
            {previewUrl ? (
              <img src={previewUrl} alt="" style={{ maxWidth: '100%', maxHeight: '48dvh', objectFit: 'contain', borderRadius: 8 }} />
            ) : null}
          </div>
          <form
            className="block"
            style={{ margin: 12, padding: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              requestPublish();
            }}
          >
            <textarea
              className="text-input"
              style={{ width: '100%', minHeight: 64, resize: 'vertical', marginBottom: 8 }}
              placeholder="Подпись…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={4000}
            />
            {err ? <p style={{ fontSize: 11, color: '#c45c5c', margin: '0 0 8px' }}>{err}</p> : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={saving}>
                {saving ? '…' : 'Дальше'}
              </button>
              <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={retake}>
                Переснять
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmPublishOpen ? (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 120,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => !saving && setConfirmPublishOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="story-confirm-title"
            className="block"
            style={{
              width: '100%',
              maxWidth: 360,
              padding: 16,
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p id="story-confirm-title" style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600 }}>
              Выложить историю?
            </p>
            <p className="muted" style={{ margin: '0 0 14px', fontSize: 12, lineHeight: 1.45 }}>
              Кадр появится у друзей в ленте кружков на сутки. Потом — в архиве, пока не истечёт срок.
            </p>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                cursor: saving ? 'default' : 'pointer',
                marginBottom: 16,
                fontSize: 13,
                lineHeight: 1.4,
              }}
            >
              <input
                type="checkbox"
                checked={showInProfile}
                disabled={saving}
                onChange={(e) => setShowInProfile(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: 'var(--accent)' }}
              />
              <span>
                Показывать в профиле
                <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 4 }}>
                  Если включено — кадр сразу виден в сетке на вашей странице. Если выключено — только в ленте историй, в профиле у гостей не отображается (после снятия с ленты попадёт в архив как обычно).
                </span>
              </span>
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-outline" disabled={saving} onClick={() => setConfirmPublishOpen(false)}>
                Отмена
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={saving}
                onClick={() => void (mode === 'textOnly' ? submitTextOnly() : submitWithFile())}
              >
                {saving ? 'Публикация…' : 'Выложить'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

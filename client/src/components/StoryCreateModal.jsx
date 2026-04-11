import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { api, apiUpload } from '../api.js';

const MAX_EDGE = 1920;
/** Экспорт истории: вертикальный кадр как в Instagram / Telegram */
const STORY_EXPORT_W = 1080;
const STORY_EXPORT_H = 1920;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

const closeBtnDark = {
  border: '1px solid rgba(255,255,255,0.35)',
  borderRadius: 'var(--radius)',
  padding: '4px 8px',
  fontSize: 11,
  lineHeight: 1.2,
  background: 'rgba(0,0,0,0.35)',
  color: '#fff',
};

const closeBtnLight = {
  width: 'auto',
  padding: '4px 8px',
  fontSize: 11,
  lineHeight: 1.2,
};

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

/**
 * Вырезает из исходного изображения видимую область 9:16 (масштаб и сдвиг как в редакторе).
 * @param {HTMLImageElement} img — загруженное изображение
 * @param {{ w: number, h: number }} view — размер окна предпросмотра (px)
 * @param {{ iw: number, ih: number }} nat — naturalWidth/Height
 * @param {number} zoom — множитель масштаба (>=1)
 * @param {number} panX — сдвиг по X от центра (px)
 * @param {number} panY — сдвиг по Y от центра (px)
 */
function renderStoryCropToBlob(img, view, nat, zoom, panX, panY) {
  const { w: vw, h: vh } = view;
  const { iw, ih } = nat;
  if (!vw || !vh || !iw || !ih) return Promise.resolve(null);

  const baseScale = Math.max(vw / iw, vh / ih);
  const k = baseScale * zoom;
  const left = vw / 2 + panX - (iw * k) / 2;
  const top = vh / 2 + panY - (ih * k) / 2;
  const srcX = (0 - left) / k;
  const srcY = (0 - top) / k;
  const srcW = vw / k;
  const srcH = vh / k;

  const canvas = document.createElement('canvas');
  canvas.width = STORY_EXPORT_W;
  canvas.height = STORY_EXPORT_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);

  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, STORY_EXPORT_W, STORY_EXPORT_H);

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
      0.92
    );
  });
}

function clampPan(panX, panY, iw, ih, vw, vh, baseScale, zoom) {
  const k = baseScale * zoom;
  const W = iw * k;
  const H = ih * k;
  const maxX = Math.max(0, (W - vw) / 2);
  const maxY = Math.max(0, (H - vh) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, panX)),
    y: Math.min(maxY, Math.max(-maxY, panY)),
  };
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

  /** Редактор кадра 9:16 в режиме preview */
  const [storyZoom, setStoryZoom] = useState(1);
  const [storyPan, setStoryPan] = useState({ x: 0, y: 0 });
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  const [imgNat, setImgNat] = useState({ iw: 0, ih: 0 });

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const galleryRef = useRef(null);
  const cropViewportRef = useRef(null);
  const previewImgRef = useRef(null);
  const panStartRef = useRef(null);
  const touchPinchRef = useRef(null);

  const stopStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

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

  useLayoutEffect(() => {
    if (mode !== 'preview' || !previewUrl) return undefined;
    const el = cropViewportRef.current;
    if (!el) return undefined;
    const apply = () => {
      const r = el.getBoundingClientRect();
      setViewSize({ w: r.width, h: r.height });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, previewUrl]);

  useEffect(() => {
    const { iw, ih } = imgNat;
    const { w: vw, h: vh } = viewSize;
    if (!iw || !ih || !vw || !vh) return;
    const baseScale = Math.max(vw / iw, vh / ih);
    setStoryPan((p) => clampPan(p.x, p.y, iw, ih, vw, vh, baseScale, storyZoom));
  }, [imgNat.iw, imgNat.ih, viewSize.w, viewSize.h, storyZoom]);

  useEffect(() => {
    const el = cropViewportRef.current;
    if (mode !== 'preview' || !el) return undefined;
    const onTouchMove = (e) => {
      if (e.touches.length === 2) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, [mode, previewUrl]);

  useEffect(() => {
    const el = cropViewportRef.current;
    if (mode !== 'preview' || !el) return undefined;
    const wheel = (ev) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      const delta = -ev.deltaY * 0.008;
      setStoryZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * (1 + delta))));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [mode, previewUrl]);

  const storyZoomRef = useRef(1);
  storyZoomRef.current = storyZoom;

  function goPreviewWithFile(f) {
    setErr(null);
    setStoryZoom(1);
    setStoryPan({ x: 0, y: 0 });
    setImgNat({ iw: 0, ih: 0 });
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
    setStoryZoom(1);
    setStoryPan({ x: 0, y: 0 });
    setImgNat({ iw: 0, ih: 0 });
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
      let fileToUpload = pickedFile;
      const img = previewImgRef.current;
      if (img?.complete && viewSize.w > 0 && imgNat.iw > 0) {
        const cropped = await renderStoryCropToBlob(img, viewSize, imgNat, storyZoom, storyPan.x, storyPan.y);
        if (cropped) fileToUpload = cropped;
      }
      const { ok, data } = await apiUpload('/api/stories/upload', {
        file: fileToUpload,
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

  const { iw, ih } = imgNat;
  const { w: vw, h: vh } = viewSize;
  const baseScalePreview = iw && ih && vw && vh ? Math.max(vw / iw, vh / ih) : 0;
  const innerW = baseScalePreview && iw ? iw * baseScalePreview * storyZoom : 0;
  const innerH = baseScalePreview && ih ? ih * baseScalePreview * storyZoom : 0;

  function onCropPointerDown(e) {
    if (e.button !== 0) return;
    panStartRef.current = { x: e.clientX, y: e.clientY, pan: { ...storyPan } };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onCropPointerMove(e) {
    if (!panStartRef.current) return;
    const { iw: iiw, ih: iih } = imgNat;
    const { w: rvw, h: rvh } = viewSize;
    if (!iiw || !iih || !rvw || !rvh) return;
    const bs = Math.max(rvw / iiw, rvh / iih);
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    const p0 = panStartRef.current.pan;
    setStoryPan(clampPan(p0.x + dx, p0.y + dy, iiw, iih, rvw, rvh, bs, storyZoomRef.current));
  }

  function onCropPointerUp() {
    panStartRef.current = null;
  }

  function onCropTouchStart(e) {
    if (e.touches.length === 2) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const d = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      touchPinchRef.current = { d0: d, z0: storyZoomRef.current };
      panStartRef.current = null;
    }
  }

  function onCropTouchMove(e) {
    if (e.touches.length === 2 && touchPinchRef.current && touchPinchRef.current.d0 > 0) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const d = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const z = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, touchPinchRef.current.z0 * (d / touchPinchRef.current.d0)),
      );
      setStoryZoom(z);
    }
  }

  function onCropTouchEnd(e) {
    if (e.touches.length < 2) touchPinchRef.current = null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-create-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 110,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
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
              justifyContent: 'space-between',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)',
            }}
          >
            <span id="story-create-title" style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
              История
            </span>
            <button type="button" onClick={onClose} style={closeBtnDark}>
              Закрыть
            </button>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Текстовая история</span>
            <button type="button" className="btn-outline" style={closeBtnLight} onClick={onClose}>
              Закрыть
            </button>
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
              padding: '8px 12px',
              paddingTop: 'max(8px, env(safe-area-inset-top))',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>Кадр</span>
            <button type="button" className="btn-outline" style={closeBtnLight} onClick={onClose}>
              Закрыть
            </button>
          </div>
          <p
            className="muted"
            style={{
              margin: '8px 12px 0',
              fontSize: 11,
              lineHeight: 1.35,
              textAlign: 'center',
            }}
          >
            Сдвиг — перетаскивание · масштаб — ползунок, щипок двумя пальцами или Ctrl + колёсико
          </p>
          <div
            ref={cropViewportRef}
            onPointerDown={onCropPointerDown}
            onPointerMove={onCropPointerMove}
            onPointerUp={onCropPointerUp}
            onPointerCancel={onCropPointerUp}
            onTouchStart={onCropTouchStart}
            onTouchMove={onCropTouchMove}
            onTouchEnd={onCropTouchEnd}
            style={{
              flex: 1,
              minHeight: 140,
              width: '100%',
              maxWidth: 440,
              margin: '10px auto 6px',
              aspectRatio: '9 / 16',
              maxHeight: 'min(52dvh, 520px)',
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 12,
              background: '#111',
              touchAction: 'none',
            }}
          >
            {previewUrl ? (
              <img
                ref={previewImgRef}
                src={previewUrl}
                alt=""
                draggable={false}
                onLoad={(e) => {
                  const im = e.currentTarget;
                  setImgNat({ iw: im.naturalWidth, ih: im.naturalHeight });
                }}
                style={
                  imgNat.iw > 0 && vw > 0 && vh > 0 && innerW > 0
                    ? {
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        width: innerW,
                        height: innerH,
                        transform: `translate(calc(-50% + ${storyPan.x}px), calc(-50% + ${storyPan.y}px))`,
                        objectFit: 'fill',
                        display: 'block',
                        userSelect: 'none',
                        pointerEvents: 'none',
                        willChange: 'transform',
                      }
                    : {
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        opacity: 0.4,
                        pointerEvents: 'none',
                      }
                }
              />
            ) : null}
          </div>
          <div style={{ padding: '0 16px 8px', maxWidth: 440, margin: '0 auto', width: '100%' }}>
            <label className="muted" style={{ fontSize: 10, display: 'block', marginBottom: 4 }}>
              Масштаб
            </label>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.02}
              value={storyZoom}
              onChange={(e) => setStoryZoom(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
          </div>
          <form
            className="block"
            style={{ margin: '0 12px 12px', padding: 12 }}
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

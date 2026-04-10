import { useState, useRef, useEffect, useCallback } from 'react';
import { api, apiUpload } from '../api.js';

const MAX_EDGE = 1920;

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

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const galleryRef = useRef(null);

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
    const { ok, data } = await api('/api/stories', { method: 'POST', body: { body: t }, userId });
    setSaving(false);
    if (!ok) {
      setErr(data?.error || 'Не сохранено');
      return;
    }
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
        extraFields: { body: t },
      });
      setSaving(false);
      if (!ok) {
        setErr(data?.error || 'Не сохранено');
        return;
      }
      onCreated?.();
      onClose();
      return;
    }
    await submitTextOnly();
  }

  const canUseCamera =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext;

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
            <button
              type="button"
              onClick={onClose}
              style={{
                border: '1px solid rgba(255,255,255,0.35)',
                borderRadius: 'var(--radius)',
                padding: '8px 12px',
                fontSize: 12,
                background: 'rgba(0,0,0,0.35)',
                color: '#fff',
              }}
            >
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
            <button type="button" className="btn-outline" style={{ width: 'auto', padding: '8px 12px' }} onClick={onClose}>
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
            <button type="button" className="btn-primary" style={{ flex: 1 }} disabled={saving} onClick={() => void submitTextOnly()}>
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
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>Публикация</span>
            <button type="button" className="btn-outline" style={{ width: 'auto', padding: '8px 12px' }} onClick={onClose}>
              Закрыть
            </button>
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
              void submitWithFile();
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
                {saving ? '…' : 'Опубликовать'}
              </button>
              <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={retake}>
                Переснять
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

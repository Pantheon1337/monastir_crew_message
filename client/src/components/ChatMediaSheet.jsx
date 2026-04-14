import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, mediaPublicUrl } from '../api.js';
import AvatarLightbox from './AvatarLightbox.jsx';
import { looksLikeVideoFileName } from '../chat/chatPrimitives.js';

/** Сетка вложений личного чата (мини-профиль и т.п.): только фото и видео, без стикеров. */
export default function ChatMediaSheet({ open, onClose, chatId, viewerId, title = 'Медиа' }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [err, setErr] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!open || !chatId || !viewerId) return;
    setItems([]);
    setHasMore(false);
    setErr(null);
    setImagePreviewUrl(null);
    setVideoPreviewUrl(null);
    let cancelled = false;
    (async () => {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('limit', '48');
      const { ok, data } = await api(`/api/chats/${encodeURIComponent(chatId)}/media?${params.toString()}`, {
        userId: viewerId,
      });
      if (cancelled) return;
      setLoading(false);
      if (!ok) {
        setErr(data?.error || 'Не удалось загрузить');
        return;
      }
      setItems(data.messages || []);
      setHasMore(Boolean(data.hasMore));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, chatId, viewerId]);

  const gridItems = useMemo(() => {
    const isPhotoOrVideo = (m) => {
      const k = m.kind || 'text';
      if (k === 'image' || k === 'video_note') return true;
      if (k === 'file' && looksLikeVideoFileName(m.body)) return true;
      return false;
    };
    return [...items].filter(isPhotoOrVideo).reverse();
  }, [items]);

  const tryLoadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore || items.length === 0) return;
    const oldest = items[0];
    setLoadingMore(true);
    const params = new URLSearchParams();
    params.set('limit', '48');
    params.set('beforeCreatedAt', String(oldest.createdAt ?? ''));
    params.set('beforeId', String(oldest.id ?? ''));
    void (async () => {
      const { ok, data } = await api(`/api/chats/${encodeURIComponent(chatId)}/media?${params.toString()}`, {
        userId: viewerId,
      });
      setLoadingMore(false);
      if (!ok) return;
      const raw = data.messages || [];
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...raw.filter((x) => x.id && !seen.has(x.id)), ...prev];
      });
      setHasMore(Boolean(data.hasMore));
    })();
  }, [hasMore, loading, loadingMore, items, chatId, viewerId]);

  useEffect(() => {
    if (!open || !hasMore) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) tryLoadMore();
      },
      { root: null, rootMargin: '120px', threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [open, hasMore, tryLoadMore, gridItems.length]);

  const onCellActivate = useCallback((m) => {
    const raw = m.mediaUrl;
    const url = raw ? mediaPublicUrl(raw) : null;
    if (!url) return;
    const k = m.kind || 'text';
    if (k === 'image') {
      setImagePreviewUrl(url);
      return;
    }
    if (k === 'video_note' || (k === 'file' && looksLikeVideoFileName(m.body))) {
      setVideoPreviewUrl(url);
      return;
    }
    if (k === 'file') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  if (!open) return null;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 130,
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'center',
          padding: 0,
          background: 'rgba(0,0,0,0.45)',
        }}
        onClick={onClose}
      >
        <div
          className="block"
          style={{
            width: '100%',
            maxWidth: 440,
            margin: 'max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))',
            background: 'var(--bg)',
            borderRadius: 'var(--radius)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'min(92dvh, 720px)',
            overflow: 'hidden',
            border: '1px solid var(--border)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
            <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
            {loading ? (
              <p className="muted" style={{ margin: 16, fontSize: 13, textAlign: 'center' }}>
                Загрузка…
              </p>
            ) : err ? (
              <p style={{ margin: 16, fontSize: 13, color: '#c45c5c', textAlign: 'center' }}>{err}</p>
            ) : gridItems.length === 0 ? (
              <p className="muted" style={{ margin: 16, fontSize: 13, textAlign: 'center' }}>
                В этом чате пока нет медиа.
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 6,
                }}
              >
                {gridItems.map((m) => {
                  const url = m.mediaUrl ? mediaPublicUrl(m.mediaUrl) : null;
                  const k = m.kind || 'text';
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onCellActivate(m)}
                      style={{
                        position: 'relative',
                        aspectRatio: '1',
                        padding: 0,
                        border: 'none',
                        borderRadius: 8,
                        overflow: 'hidden',
                        cursor: url ? 'pointer' : 'default',
                        background: 'var(--panel, rgba(127,127,127,0.12))',
                      }}
                    >
                      {k === 'image' ? (
                        url ? (
                          <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                        ) : null
                      ) : k === 'video_note' || (k === 'file' && looksLikeVideoFileName(m.body)) ? (
                        url ? (
                          <video src={url} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : null
                      ) : (
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            fontSize: 28,
                          }}
                        >
                          📎
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {hasMore ? (
              <div ref={sentinelRef} style={{ height: 1, marginTop: 8 }} aria-hidden />
            ) : null}
            {loadingMore ? (
              <p className="muted" style={{ margin: 12, fontSize: 11, textAlign: 'center' }}>
                Ещё…
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {imagePreviewUrl ? <AvatarLightbox fullSize url={imagePreviewUrl} onClose={() => setImagePreviewUrl(null)} /> : null}
      {videoPreviewUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Видео"
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: 'rgba(0,0,0,0.88)',
          }}
          onClick={() => setVideoPreviewUrl(null)}
        >
          <button
            type="button"
            className="icon-btn"
            aria-label="Закрыть"
            onClick={() => setVideoPreviewUrl(null)}
            style={{
              position: 'absolute',
              top: 'max(12px, env(safe-area-inset-top))',
              right: 12,
              width: 40,
              height: 40,
              zIndex: 1,
              color: '#fff',
              borderColor: 'rgba(255,255,255,0.35)',
              background: 'rgba(0,0,0,0.35)',
            }}
          >
            ×
          </button>
          <video
            src={videoPreviewUrl}
            controls
            playsInline
            style={{ maxWidth: 'min(98vw, 960px)', maxHeight: 'min(90dvh, 92vh)', borderRadius: 8 }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}

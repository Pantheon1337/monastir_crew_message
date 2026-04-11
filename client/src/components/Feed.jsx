import { useEffect, useRef, useState } from 'react';
import PostCard from './PostCard.jsx';
import { api, apiUpload } from '../api.js';

const FEED_NEW_TOAST_MS = 5200;
const SWIPE_OPEN_STORY_MIN_PX = 72;
const SWIPE_OPEN_STORY_MAX_MS = 900;
/** Свайп вправо (палец движется вправо): открыть камеру истории; не мешает вертикальному скроллу. */
const SWIPE_HORIZ_RATIO = 1.35;

function swipeTargetOk(el) {
  if (!(el instanceof Element)) return false;
  return !el.closest('input, textarea, button, select, a, label, [data-feed-no-swipe]');
}

export default function Feed({ posts = [], userId, onPosted, presenceOnline = {}, onViewAuthorAvatar, onSwipeOpenStory }) {
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingMediaPath, setPendingMediaPath] = useState(null);
  const [pendingName, setPendingName] = useState('');
  const [friendsOnlyPost, setFriendsOnlyPost] = useState(false);
  const [newFeedToastOpen, setNewFeedToastOpen] = useState(false);
  const fileRef = useRef(null);
  const feedSeenInitRef = useRef(false);
  const feedLastTopIdRef = useRef(null);
  const swipeStartRef = useRef(null);

  /** Новая запись сверху ленты (не от вас) — короткое всплывающее уведомление */
  useEffect(() => {
    const top = posts[0];
    const topId = top?.id ?? null;
    if (topId == null) return;

    if (!feedSeenInitRef.current) {
      feedSeenInitRef.current = true;
      feedLastTopIdRef.current = topId;
      return;
    }

    if (feedLastTopIdRef.current === topId) return;

    feedLastTopIdRef.current = topId;
    if (userId != null && String(top.authorId) !== String(userId)) {
      setNewFeedToastOpen(true);
    }
  }, [posts, userId]);

  useEffect(() => {
    if (!newFeedToastOpen) return undefined;
    const t = window.setTimeout(() => setNewFeedToastOpen(false), FEED_NEW_TOAST_MS);
    return () => window.clearTimeout(t);
  }, [newFeedToastOpen]);

  const canSend = !!(draft.trim() || pendingMediaPath) && userId;

  async function onPickFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !userId) return;
    setUploading(true);
    setErr(null);
    const { ok, data } = await apiUpload('/api/feed/upload', { file: f, userId, fieldName: 'file' });
    setUploading(false);
    if (!ok || !data?.mediaPath) {
      setErr(data?.error || 'Не удалось загрузить файл');
      return;
    }
    setPendingMediaPath(data.mediaPath);
    setPendingName(f.name || 'файл');
  }

  function clearMedia() {
    setPendingMediaPath(null);
    setPendingName('');
  }

  function tryOpenStoryFromSwipe(clientX, clientY) {
    if (!onSwipeOpenStory || !userId) return;
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const dx = clientX - start.x;
    const dy = clientY - start.y;
    if (dx < SWIPE_OPEN_STORY_MIN_PX) return;
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_HORIZ_RATIO) return;
    if (Date.now() - start.t > SWIPE_OPEN_STORY_MAX_MS) return;
    onSwipeOpenStory();
  }

  async function submit(e) {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    setErr(null);
    const { ok, data } = await api('/api/feed', {
      method: 'POST',
      body: { body: draft.trim(), mediaPath: pendingMediaPath || undefined, friendsOnly: friendsOnlyPost },
      userId,
    });
    setSending(false);
    if (!ok) {
      setErr(data?.error || 'Не опубликовано');
      return;
    }
    setDraft('');
    clearMedia();
    setFriendsOnlyPost(false);
    onPosted?.();
  }

  return (
    <section
      style={{ padding: '4px 12px 24px' }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (!t || !swipeTargetOk(e.target)) return;
        swipeStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0];
        if (!t) return;
        tryOpenStoryFromSwipe(t.clientX, t.clientY);
      }}
      onTouchCancel={() => {
        swipeStartRef.current = null;
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'touch') return;
        if (e.button !== 0 || !swipeTargetOk(e.target)) return;
        swipeStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
      }}
      onPointerUp={(e) => {
        if (e.pointerType === 'touch') return;
        tryOpenStoryFromSwipe(e.clientX, e.clientY);
      }}
      onPointerCancel={() => {
        swipeStartRef.current = null;
      }}
    >
      {newFeedToastOpen ? (
        <div className="feed-new-post-toast" role="status">
          <span style={{ flex: 1, minWidth: 0 }}>В ленту добавили новую запись</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Закрыть"
            onClick={() => setNewFeedToastOpen(false)}
            style={{ width: 32, height: 32, flexShrink: 0, border: 'none' }}
          >
            ✕
          </button>
        </div>
      ) : null}
      <form
        className="feed-composer-wrap"
        style={{ padding: '12px 0', marginBottom: 8, borderBottom: '1px solid var(--border)' }}
        onSubmit={submit}
      >
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Новый пост</div>
        <div className="feed-privacy-row">
          <div className="feed-privacy-row__text">
            Только для друзей
            <div className="feed-privacy-row__hint">Иначе пост виден всем в приложении</div>
          </div>
          <label className="ios-toggle" style={{ cursor: userId ? 'pointer' : 'not-allowed' }}>
            <input
              type="checkbox"
              role="switch"
              aria-label="Показывать пост только друзьям"
              checked={friendsOnlyPost}
              disabled={!userId}
              onChange={(e) => setFriendsOnlyPost(e.target.checked)}
            />
            <span className="ios-toggle-track">
              <span className="ios-toggle-thumb" />
            </span>
          </label>
        </div>
        <textarea
          className="text-input feed-composer-textarea"
          style={{ width: '100%', minHeight: 72, resize: 'vertical', marginBottom: 8 }}
          placeholder="Что у вас нового? Можно прикрепить файл. По умолчанию пост виден всем в приложении."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={8000}
        />
        <input ref={fileRef} type="file" hidden onChange={onPickFile} />
        {pendingMediaPath ? (
          <div className="muted" style={{ fontSize: 11, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{pendingName}</span>
            <button type="button" className="icon-btn" style={{ width: 28, height: 28, flexShrink: 0 }} onClick={clearMedia} aria-label="Убрать файл">
              ✕
            </button>
          </div>
        ) : null}
        {err ? (
          <p style={{ fontSize: 11, color: '#c45c5c', margin: '0 0 8px' }}>{err}</p>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="icon-btn"
            disabled={uploading || !userId}
            onClick={() => fileRef.current?.click()}
            aria-label={uploading ? 'Загрузка файла' : 'Прикрепить файл'}
            title={uploading ? 'Загрузка…' : 'Прикрепить файл'}
            style={{ width: 40, height: 40, opacity: uploading ? 0.65 : 1 }}
          >
            {uploading ? (
              <span style={{ fontSize: 11 }} aria-hidden>
                …
              </span>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            )}
          </button>
          <button type="submit" className="btn-primary" style={{ width: 'auto', minWidth: 120 }} disabled={sending || !canSend}>
            {sending ? '…' : 'Опубликовать'}
          </button>
        </div>
      </form>

      {posts.length === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          В ленте пока пусто. Посты всех пользователей появляются здесь; свой пост можно ограничить только друзьями (галочка при публикации).
        </p>
      ) : (
        posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            viewerId={userId}
            onChanged={onPosted}
            authorOnline={p.authorId != null ? Boolean(presenceOnline[String(p.authorId)]) : undefined}
            onViewAuthorAvatar={onViewAuthorAvatar}
          />
        ))
      )}
    </section>
  );
}

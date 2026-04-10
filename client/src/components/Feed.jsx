import { useRef, useState } from 'react';
import PostCard from './PostCard.jsx';
import { api, apiUpload } from '../api.js';

export default function Feed({ posts = [], userId, onPosted, presenceOnline = {} }) {
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingMediaPath, setPendingMediaPath] = useState(null);
  const [pendingName, setPendingName] = useState('');
  const [friendsOnlyPost, setFriendsOnlyPost] = useState(false);
  const fileRef = useRef(null);

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
    <section style={{ padding: '4px 12px 24px' }}>
      <form
        className="feed-composer-wrap"
        style={{ padding: '12px 0', marginBottom: 8, borderBottom: '1px solid var(--border)' }}
        onSubmit={submit}
      >
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Новый пост</div>
        <textarea
          className="text-input feed-composer-textarea"
          style={{ width: '100%', minHeight: 72, resize: 'vertical', marginBottom: 8 }}
          placeholder="Что у вас нового? Можно прикрепить файл. По умолчанию пост виден всем в приложении."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={8000}
        />
        <input ref={fileRef} type="file" hidden onChange={onPickFile} />
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 8,
            fontSize: 12,
            cursor: userId ? 'pointer' : 'default',
            userSelect: 'none',
          }}
        >
          <span>Показывать только друзьям</span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Показывать пост только друзьям"
            checked={friendsOnlyPost}
            disabled={!userId}
            onChange={(e) => setFriendsOnlyPost(e.target.checked)}
            style={{ width: 22, height: 22, flexShrink: 0, marginTop: 2, accentColor: 'var(--accent)' }}
          />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button type="button" className="btn-outline" style={{ width: 'auto', fontSize: 12 }} disabled={uploading || !userId} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Загрузка…' : 'Прикрепить файл'}
          </button>
          {pendingMediaPath ? (
            <span className="muted" style={{ fontSize: 11 }}>
              {pendingName}{' '}
              <button type="button" className="icon-btn" style={{ width: 24, height: 24, verticalAlign: 'middle' }} onClick={clearMedia} aria-label="Убрать файл">
                ✕
              </button>
            </span>
          ) : null}
        </div>
        {err ? (
          <p style={{ fontSize: 11, color: '#c45c5c', margin: '0 0 8px' }}>{err}</p>
        ) : null}
        <button type="submit" className="btn-primary" style={{ width: 'auto' }} disabled={sending || !canSend}>
          {sending ? '…' : 'Опубликовать'}
        </button>
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
          />
        ))
      )}
    </section>
  );
}

import { useState } from 'react';
import PostCard from './PostCard.jsx';
import { api } from '../api.js';

export default function Feed({ posts = [], userId, onPosted }) {
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState(null);
  const [sending, setSending] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const t = draft.trim();
    if (!t || !userId) return;
    setSending(true);
    setErr(null);
    const { ok, data } = await api('/api/feed', { method: 'POST', body: { body: t }, userId });
    setSending(false);
    if (!ok) {
      setErr(data?.error || 'Не опубликовано');
      return;
    }
    setDraft('');
    onPosted?.();
  }

  return (
    <section style={{ padding: '4px 12px 24px' }}>
      <form className="block" style={{ padding: 12, marginBottom: 12 }} onSubmit={submit}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Новый пост</div>
        <textarea
          className="text-input"
          style={{ width: '100%', minHeight: 72, resize: 'vertical', marginBottom: 8 }}
          placeholder="Что у вас нового? Видно друзьям — в том числе тем, кого добавите позже."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={8000}
        />
        {err ? (
          <p style={{ fontSize: 11, color: '#c45c5c', margin: '0 0 8px' }}>{err}</p>
        ) : null}
        <button type="submit" className="btn-primary" style={{ width: 'auto' }} disabled={sending || !draft.trim()}>
          {sending ? '…' : 'Опубликовать'}
        </button>
      </form>

      {posts.length === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          В ленте пока пусто — добавьте друзей и посты появятся здесь.
        </p>
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} />)
      )}
    </section>
  );
}

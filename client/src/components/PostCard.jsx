import { useEffect, useRef, useState } from 'react';
import UserAvatar from './UserAvatar.jsx';
import NicknameWithBadge from './NicknameWithBadge.jsx';
import { api } from '../api.js';

function formatPostTime(ts) {
  if (ts == null) return '';
  const t = Number(ts);
  const diff = Date.now() - t;
  if (diff < 60_000) return 'только что';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`;
  const d = new Date(t);
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatEditedAt(ts) {
  if (ts == null) return '';
  const d = new Date(Number(ts));
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fallbackAffiliationFromBadge(badge) {
  if (badge === 'developer') return '🛠️';
  if (badge === 'beta') return '🧪';
  return '👤';
}

function mediaKind(url) {
  if (!url) return null;
  const u = url.split('?')[0].toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(u)) return 'image';
  if (/\.(mp4|webm|mov|ogv)$/.test(u)) return 'video';
  if (/\.(mp3|ogg|wav|m4a|aac|flac)$/.test(u)) return 'audio';
  return 'file';
}

function PostMedia({ url }) {
  const kind = mediaKind(url);
  const base = { maxWidth: '100%', borderRadius: 8, marginTop: 8 };
  if (kind === 'image') {
    return <img src={url} alt="" style={{ ...base, display: 'block', height: 'auto' }} />;
  }
  if (kind === 'video') {
    return <video src={url} controls style={{ ...base, display: 'block', maxHeight: 360 }} />;
  }
  if (kind === 'audio') {
    return <audio src={url} controls style={{ width: '100%', marginTop: 8 }} />;
  }
  const name = url.split('/').pop() || 'файл';
  return (
    <a href={url} download className="btn-outline" style={{ display: 'inline-block', marginTop: 8, fontSize: 12 }}>
      📎 {decodeURIComponent(name)}
    </a>
  );
}

export default function PostCard({ post, viewerId, onChanged }) {
  const nick = post.authorNickname ? `@${post.authorNickname}` : post.authorName || '—';
  const affiliationEmoji = post.authorAffiliationEmoji || fallbackAffiliationFromBadge(post.authorBadge || 'user');
  const isMine = viewerId && String(post.authorId) === String(viewerId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.body || '');
  const [saving, setSaving] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    setEditText(post.body || '');
  }, [post.body, post.id]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  async function saveEdit() {
    if (!viewerId) return;
    setSaving(true);
    const { ok, data } = await api(`/api/feed/${encodeURIComponent(post.id)}`, {
      method: 'PATCH',
      body: { body: editText },
      userId: viewerId,
    });
    setSaving(false);
    if (!ok) {
      alert(data?.error || 'Не удалось сохранить');
      return;
    }
    setEditing(false);
    setMenuOpen(false);
    onChanged?.();
  }

  async function removePost() {
    if (!viewerId) return;
    if (!window.confirm('Удалить этот пост?')) return;
    const { ok, data } = await api(`/api/feed/${encodeURIComponent(post.id)}`, {
      method: 'DELETE',
      userId: viewerId,
    });
    if (!ok) {
      alert(data?.error || 'Не удалось удалить');
      return;
    }
    setMenuOpen(false);
    onChanged?.();
  }

  return (
    <article
      style={{
        padding: '12px 0',
        borderBottom: '1px solid var(--border)',
        marginBottom: 0,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
          <UserAvatar src={post.authorAvatarUrl} size={32} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{post.authorName || nick}</div>
            <div className="muted" style={{ fontSize: 11, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
              {post.authorNickname ? (
                <NicknameWithBadge nickname={post.authorNickname} affiliationEmoji={affiliationEmoji} />
              ) : (
                nick
              )}
              <span>· {formatPostTime(post.createdAt)}</span>
            </div>
          </div>
        </div>
        {isMine ? (
          <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              className="icon-btn"
              aria-label="Меню поста"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              style={{ width: 32, height: 32 }}
            >
              ⋯
            </button>
            {menuOpen ? (
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: 4,
                  minWidth: 140,
                  padding: '6px 0',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  zIndex: 20,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setEditing(true);
                    setMenuOpen(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    border: 'none',
                    background: 'none',
                    color: 'inherit',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Изменить
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void removePost()}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    border: 'none',
                    background: 'none',
                    color: '#c45c5c',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Удалить
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      {post.mediaUrl ? <PostMedia url={post.mediaUrl} /> : null}

      {editing ? (
        <div style={{ marginTop: 8 }}>
          <textarea
            className="text-input"
            value={editText}
            onChange={(e) => setEditText(e.target.value.slice(0, 8000))}
            rows={5}
            style={{ width: '100%', resize: 'vertical' }}
            maxLength={8000}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn-primary" style={{ width: 'auto' }} disabled={saving} onClick={() => void saveEdit()}>
              {saving ? '…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className="btn-outline"
              style={{ width: 'auto' }}
              disabled={saving}
              onClick={() => {
                setEditText(post.body || '');
                setEditing(false);
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <>
          {post.body ? (
            <p style={{ margin: post.mediaUrl ? '8px 0 0' : 0, fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{post.body}</p>
          ) : null}
          {post.editedAt ? (
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 11 }}>
              изменено · {formatEditedAt(post.editedAt)}
            </p>
          ) : null}
        </>
      )}

      <footer style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', opacity: 0.75 }}>
        <span>только для друзей</span>
      </footer>
    </article>
  );
}

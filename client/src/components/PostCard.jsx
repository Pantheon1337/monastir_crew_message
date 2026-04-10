import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import UserAvatar from './UserAvatar.jsx';
import NicknameWithBadge from './NicknameWithBadge.jsx';
import ReactionUsersModal from './ReactionUsersModal.jsx';
import { api } from '../api.js';
import { REACTION_KEYS, REACTION_ICONS } from '../reactionConstants.js';
import { useVisualViewportRect } from '../hooks/useVisualViewportRect.js';

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

/** Учитывает VisualViewport (клавиатура), иначе меню уезжает за экран. */
function clampMenuPosition(x, y, w, h) {
  if (typeof window === 'undefined') return { left: x - w / 2, top: y - h - 8 };
  const vv = window.visualViewport;
  if (!vv) {
    const left = Math.max(8, Math.min(x - w / 2, window.innerWidth - w - 8));
    const top = Math.max(8, Math.min(y - h - 8, window.innerHeight - h - 8));
    return { left, top };
  }
  const ox = vv.offsetLeft;
  const oy = vv.offsetTop;
  const vw = vv.width;
  const vh = vv.height;
  const left = Math.max(ox + 8, Math.min(x - w / 2, ox + vw - w - 8));
  let top = y - h - 8;
  if (top < oy + 8) top = y + 8;
  return { left, top: Math.max(oy + 8, Math.min(top, oy + vh - h - 8)) };
}

function useLongPress(onLongPress, { ms = 480, moveTol = 12 } = {}) {
  const timerRef = useRef(null);
  const startRef = useRef(null);
  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  return {
    onPointerDown(e) {
      if (e.button !== 0) return;
      startRef.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        startRef.current = null;
        onLongPress(e.clientX, e.clientY);
      }, ms);
    },
    onPointerMove(e) {
      const s = startRef.current;
      if (!s || timerRef.current == null) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (dx * dx + dy * dy > moveTol * moveTol) {
        clearTimer();
        startRef.current = null;
      }
    },
    onPointerUp() {
      clearTimer();
      startRef.current = null;
    },
    onPointerCancel() {
      clearTimer();
      startRef.current = null;
    },
  };
}

export default function PostCard({ post, viewerId, onChanged, authorOnline }) {
  const vvRect = useVisualViewportRect();
  const nick = post.authorNickname ? `@${post.authorNickname}` : post.authorName || '—';
  const affiliationEmoji = post.authorAffiliationEmoji || fallbackAffiliationFromBadge(post.authorBadge || 'user');
  const isMine = viewerId && String(post.authorId) === String(viewerId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.body || '');
  const [saving, setSaving] = useState(false);
  const menuRef = useRef(null);

  const [reactions, setReactions] = useState(post.reactions ?? { counts: { up: 0, down: 0, fire: 0, poop: 0 }, mine: null });
  const [reactPickerOpen, setReactPickerOpen] = useState(false);
  const reactPickerRef = useRef(null);
  const [whoOpen, setWhoOpen] = useState(false);
  const [whoList, setWhoList] = useState([]);

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSending, setCommentSending] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editCommentText, setEditCommentText] = useState('');

  const [postMenu, setPostMenu] = useState(null);

  const postMenuPosition = useMemo(() => {
    if (!postMenu) return null;
    return clampMenuPosition(postMenu.x, postMenu.y, 220, 200);
  }, [postMenu, vvRect]);

  useEffect(() => {
    setReactions(post.reactions ?? { counts: { up: 0, down: 0, fire: 0, poop: 0 }, mine: null });
  }, [post.id, post.reactions]);

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

  useEffect(() => {
    if (!reactPickerOpen) return;
    function onDoc(e) {
      if (reactPickerRef.current && !reactPickerRef.current.contains(e.target)) setReactPickerOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [reactPickerOpen]);

  const loadComments = useCallback(async () => {
    if (!viewerId) return;
    setCommentsLoading(true);
    const { ok, data } = await api(`/api/feed/${encodeURIComponent(post.id)}/comments`, { userId: viewerId });
    setCommentsLoading(false);
    if (ok) setComments(data.comments || []);
  }, [post.id, viewerId]);

  useEffect(() => {
    if (commentsOpen) void loadComments();
  }, [commentsOpen, loadComments]);

  const openPostMenu = useCallback(
    (x, y) => {
      setPostMenu({ x, y, showReactions: false });
    },
    [],
  );
  const lp = useLongPress(openPostMenu, { ms: 480, moveTol: 12 });

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

  async function pickReaction(key) {
    if (!viewerId) return;
    const { ok, data } = await api(`/api/feed/${encodeURIComponent(post.id)}/reaction`, {
      method: 'POST',
      body: { reaction: key },
      userId: viewerId,
    });
    if (ok && data?.reactions) setReactions(data.reactions);
    setReactPickerOpen(false);
    setPostMenu(null);
    onChanged?.();
  }

  async function openReactionWho() {
    if (!viewerId) return;
    const { ok, data } = await api(`/api/feed/${encodeURIComponent(post.id)}/reactions`, { userId: viewerId });
    if (ok) setWhoList(data?.users || []);
    setWhoOpen(true);
  }

  const counts = reactions?.counts ?? { up: 0, down: 0, fire: 0, poop: 0 };
  const mine = reactions?.mine ?? null;
  const keysToShow = REACTION_KEYS.filter((k) => (counts[k] ?? 0) > 0);
  const totalReactions = REACTION_KEYS.reduce((a, k) => a + (counts[k] ?? 0), 0);
  const commentCount = post.commentCount ?? 0;

  async function sendComment() {
    const t = commentDraft.trim();
    if (!viewerId || !t) return;
    setCommentSending(true);
    const { ok, data } = await api(`/api/feed/${encodeURIComponent(post.id)}/comments`, {
      method: 'POST',
      body: { body: t },
      userId: viewerId,
    });
    setCommentSending(false);
    if (!ok) {
      alert(data?.error || 'Не отправлено');
      return;
    }
    setCommentDraft('');
    if (data?.comment) setComments((prev) => [...prev, data.comment]);
    onChanged?.();
  }

  async function saveCommentEdit(id) {
    if (!viewerId) return;
    const t = editCommentText.trim();
    if (!t) return;
    setCommentSending(true);
    const { ok, data } = await api(`/api/feed/${encodeURIComponent(post.id)}/comments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { body: t },
      userId: viewerId,
    });
    setCommentSending(false);
    if (!ok) {
      alert(data?.error || 'Не сохранено');
      return;
    }
    setEditingCommentId(null);
    if (data?.comment) {
      setComments((prev) => prev.map((c) => (c.id === id ? data.comment : c)));
    }
    onChanged?.();
  }

  async function deleteComment(id) {
    if (!viewerId) return;
    if (!window.confirm('Удалить комментарий?')) return;
    const { ok, data } = await api(`/api/feed/${encodeURIComponent(post.id)}/comments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      userId: viewerId,
    });
    if (!ok) {
      alert(data?.error || 'Не удалено');
      return;
    }
    setComments((prev) => prev.filter((c) => c.id !== id));
    onChanged?.();
  }

  return (
    <article
      onSelectStartCapture={(e) => {
        const el = e.target;
        if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return;
        if (typeof el.closest === 'function' && (el.closest('textarea') || el.closest('input'))) return;
        e.preventDefault();
      }}
      style={{
        padding: '12px 0',
        borderBottom: '1px solid var(--border)',
        marginBottom: 0,
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
        touchAction: 'manipulation',
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
          <UserAvatar
            src={post.authorAvatarUrl}
            size={32}
            presenceOnline={typeof authorOnline === 'boolean' ? authorOnline : undefined}
          />
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

      <div
        {...lp}
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          touchAction: 'manipulation',
        }}
      >
        {post.mediaUrl ? <PostMedia url={post.mediaUrl} /> : null}

        {editing ? (
          <div style={{ marginTop: 8 }}>
            <textarea
              className="text-input"
              value={editText}
              onChange={(e) => setEditText(e.target.value.slice(0, 8000))}
              rows={5}
              style={{
                width: '100%',
                resize: 'vertical',
                fontSize: 16,
                WebkitUserSelect: 'text',
                userSelect: 'text',
              }}
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
      </div>

      {!editing && viewerId ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 }} ref={reactPickerRef}>
          {keysToShow.map((key) => {
            const n = counts[key] ?? 0;
            const active = mine === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => void pickReaction(key)}
                style={{
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 999,
                  background: active ? 'rgba(193, 123, 75, 0.2)' : 'transparent',
                  padding: '2px 8px',
                  fontSize: 13,
                  cursor: 'pointer',
                  color: 'inherit',
                  lineHeight: 1.3,
                }}
              >
                {REACTION_ICONS[key]}
                {n > 0 ? <span className="muted" style={{ fontSize: 10, marginLeft: 2 }}>{n}</span> : null}
              </button>
            );
          })}
          {totalReactions > 0 ? (
            <button type="button" className="btn-outline" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => void openReactionWho()}>
              Кто
            </button>
          ) : null}
          <button
            type="button"
            className="btn-outline"
            aria-expanded={reactPickerOpen}
            style={{ fontSize: 12, padding: '2px 10px' }}
            onClick={() => setReactPickerOpen((v) => !v)}
          >
            {reactPickerOpen ? '✕' : '☺'}
          </button>
          {reactPickerOpen ? (
            <div
              style={{
                width: '100%',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                padding: 8,
                marginTop: 4,
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'rgba(0,0,0,0.15)',
              }}
            >
              {REACTION_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => void pickReaction(k)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.04)',
                    fontSize: 18,
                    cursor: 'pointer',
                    color: 'inherit',
                  }}
                >
                  {REACTION_ICONS[k]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {viewerId ? (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn-outline"
            style={{ width: '100%', fontSize: 12, justifyContent: 'center' }}
            onClick={() => setCommentsOpen((v) => !v)}
          >
            {commentsOpen ? 'Скрыть' : 'Комментарии'}
            {commentCount > 0 ? ` (${commentCount})` : ''}
          </button>
          {commentsOpen ? (
            <div style={{ marginTop: 8 }}>
              {commentsLoading ? (
                <p className="muted" style={{ fontSize: 12 }}>
                  Загрузка…
                </p>
              ) : (
                <ul style={{ margin: '0 0 10px', padding: 0, listStyle: 'none' }}>
                  {comments.map((c) => {
                    const isCommentMine = String(c.authorId) === String(viewerId);
                    return (
                      <li
                        key={c.id}
                        style={{
                          padding: '8px 0',
                          borderBottom: '1px solid var(--border)',
                          fontSize: 13,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 12 }}>
                            <NicknameWithBadge nickname={c.authorNickname || 'user'} affiliationEmoji={c.authorAffiliationEmoji} />
                          </span>
                          {isCommentMine ? (
                            <span style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                className="icon-btn"
                                style={{ width: 26, height: 26, fontSize: 11 }}
                                onClick={() => {
                                  setEditingCommentId(c.id);
                                  setEditCommentText(c.body || '');
                                }}
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                className="icon-btn"
                                style={{ width: 26, height: 26, fontSize: 11 }}
                                onClick={() => void deleteComment(c.id)}
                              >
                                ✕
                              </button>
                            </span>
                          ) : null}
                        </div>
                        {editingCommentId === c.id ? (
                          <div>
                            <textarea
                              className="text-input"
                              value={editCommentText}
                              onChange={(e) => setEditCommentText(e.target.value.slice(0, 4000))}
                              rows={2}
                              style={{
                                width: '100%',
                                fontSize: 16,
                                WebkitUserSelect: 'text',
                                userSelect: 'text',
                              }}
                              maxLength={4000}
                            />
                            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                              <button
                                type="button"
                                className="btn-primary"
                                style={{ width: 'auto', fontSize: 12 }}
                                disabled={commentSending}
                                onClick={() => void saveCommentEdit(c.id)}
                              >
                                OK
                              </button>
                              <button
                                type="button"
                                className="btn-outline"
                                style={{ width: 'auto', fontSize: 12 }}
                                onClick={() => setEditingCommentId(null)}
                              >
                                Отмена
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.body}</p>
                        )}
                        {c.editedAt ? (
                          <span className="muted" style={{ fontSize: 10 }}>
                            изменён
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  className="text-input"
                  placeholder="Написать комментарий…"
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value.slice(0, 4000))}
                  rows={2}
                  style={{
                    flex: 1,
                    fontSize: 16,
                    resize: 'vertical',
                    WebkitUserSelect: 'text',
                    userSelect: 'text',
                  }}
                  maxLength={4000}
                />
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: 'auto', flexShrink: 0, fontSize: 12 }}
                  disabled={commentSending || !commentDraft.trim()}
                  onClick={() => void sendComment()}
                >
                  {commentSending ? '…' : 'Отпр.'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <footer style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', opacity: 0.75 }}>
        <span>только для друзей</span>
      </footer>

      <ReactionUsersModal open={whoOpen} users={whoList} onClose={() => setWhoOpen(false)} title="Реакции на пост" />

      {postMenu ? (
        <>
          <div
            role="presentation"
            style={{ position: 'fixed', inset: 0, zIndex: 94, background: 'rgba(0,0,0,0.35)' }}
            onClick={() => setPostMenu(null)}
          />
          <div
            role="menu"
            style={{
              position: 'fixed',
              zIndex: 95,
              width: 220,
              ...(postMenuPosition || { left: 8, top: 8 }),
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              padding: 10,
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            <div style={{ marginBottom: 8 }}>
              {!postMenu.showReactions ? (
                <button type="button" className="btn-outline" style={{ width: '100%', fontSize: 12 }} onClick={() => setPostMenu((p) => (p ? { ...p, showReactions: true } : null))}>
                  Реакция…
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {REACTION_KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => void pickReaction(k)}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        border: '1px solid var(--border)',
                        background: 'rgba(255,255,255,0.04)',
                        fontSize: 18,
                        cursor: 'pointer',
                        color: 'inherit',
                      }}
                    >
                      {REACTION_ICONS[k]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </article>
  );
}

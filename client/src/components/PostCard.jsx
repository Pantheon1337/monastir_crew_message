import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import UserAvatar from './UserAvatar.jsx';
import NicknameWithBadge from './NicknameWithBadge.jsx';
import ReactionUsersModal from './ReactionUsersModal.jsx';
import { api } from '../api.js';
import { REACTION_KEYS, REACTION_ICONS, emptyReactionCounts, normalizeReactionMine } from '../reactionConstants.js';
import { useVisualViewportRect } from '../hooks/useVisualViewportRect.js';

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

/** Время в полосе реакций (как в Telegram) */
function formatPostTimeCompact(ts) {
  if (ts == null) return '';
  const t = Number(ts);
  const d = new Date(t);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Короткое время у комментария (относительное + дата). */
function formatCommentTime(ts) {
  if (ts == null) return '';
  const t = Number(ts);
  const d = new Date(t);
  const now = Date.now();
  const diff = now - t;
  if (diff < 45_000) return 'только что';
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} мин`;
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))} ч`;
  return formatPostTimeCompact(ts);
}

function commentCountRu(n) {
  if (n <= 0) return 'Комментарии';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${n} комментариев`;
  if (mod10 === 1) return `${n} комментарий`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} комментария`;
  return `${n} комментариев`;
}

function mediaKind(url) {
  if (!url) return null;
  const u = url.split('?')[0].toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(u)) return 'image';
  if (/\.(mp4|webm|mov|ogv)$/.test(u)) return 'video';
  if (/\.(mp3|ogg|wav|m4a|aac|flac)$/.test(u)) return 'audio';
  return 'file';
}

function PostMedia({ url, onImageClick }) {
  const kind = mediaKind(url);
  const base = { maxWidth: '100%', display: 'block', height: 'auto' };
  if (kind === 'image') {
    if (typeof onImageClick === 'function') {
      return (
        <button
          type="button"
          className="feed-post-media-img-btn"
          aria-label="Открыть фото"
          onClick={(e) => {
            e.stopPropagation();
            onImageClick();
          }}
        >
          <img src={url} alt="" style={base} />
        </button>
      );
    }
    return <img src={url} alt="" className="feed-post-media-plain" style={base} />;
  }
  if (kind === 'video') {
    return <video src={url} controls style={{ ...base, maxHeight: 360, width: '100%' }} />;
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

export default function PostCard({
  post,
  viewerId,
  onChanged,
  authorOnline,
  onViewAuthorAvatar,
  onOpenAuthorProfile,
  onOpenPostImage,
}) {
  const vvRect = useVisualViewportRect();
  const nick = post.authorNickname ? `@${post.authorNickname}` : post.authorName || '—';
  const affiliationEmoji = post.authorAffiliationEmoji || null;
  const isMine = viewerId && String(post.authorId) === String(viewerId);
  const canOpenAuthorProfile =
    typeof onOpenAuthorProfile === 'function' && post.authorId != null && viewerId;
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.body || '');
  const [saving, setSaving] = useState(false);
  const menuRef = useRef(null);

  const [reactions, setReactions] = useState(() => {
    const raw = post.reactions;
    if (!raw || typeof raw !== 'object') return { counts: emptyReactionCounts(), mine: null };
    const counts = { ...emptyReactionCounts(), ...(raw.counts || {}) };
    for (const k of REACTION_KEYS) counts[k] = Number(counts[k]) || 0;
    return { counts, mine: raw.mine ?? null };
  });
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
  const [replyToComment, setReplyToComment] = useState(null);

  const [postMenu, setPostMenu] = useState(null);

  const postMenuPosition = useMemo(() => {
    if (!postMenu) return null;
    return clampMenuPosition(postMenu.x, postMenu.y, 220, 200);
  }, [postMenu, vvRect]);

  const reactionsFromServerKey = useMemo(() => JSON.stringify(post.reactions ?? null), [post.id, post.reactions]);

  useEffect(() => {
    const raw = post.reactions;
    if (raw && typeof raw === 'object') {
      const counts = { ...emptyReactionCounts(), ...(raw.counts || {}) };
      for (const k of REACTION_KEYS) counts[k] = Number(counts[k]) || 0;
      setReactions({ counts, mine: raw.mine ?? null });
    } else {
      setReactions({ counts: emptyReactionCounts(), mine: null });
    }
  }, [post.id, reactionsFromServerKey]);

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
    if (!ok) {
      if (data?.error) alert(data.error);
      return;
    }
    if (data?.reactions) setReactions(data.reactions);
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

  const counts = { ...emptyReactionCounts(), ...(reactions?.counts || {}) };
  for (const k of REACTION_KEYS) counts[k] = Number(counts[k]) || 0;
  const mineList = normalizeReactionMine(reactions?.mine);
  const keysToShow = REACTION_KEYS.filter((k) => (counts[k] ?? 0) > 0);
  const totalReactions = REACTION_KEYS.reduce((a, k) => a + (counts[k] ?? 0), 0);
  const commentCount = post.commentCount ?? 0;

  async function sendComment() {
    const t = commentDraft.trim();
    if (!viewerId || !t) return;
    setCommentSending(true);
    const body = { body: t };
    if (replyToComment?.id) body.parentCommentId = replyToComment.id;
    const { ok, data } = await api(`/api/feed/${encodeURIComponent(post.id)}/comments`, {
      method: 'POST',
      body,
      userId: viewerId,
    });
    setCommentSending(false);
    if (!ok) {
      alert(data?.error || 'Не отправлено');
      return;
    }
    setCommentDraft('');
    setReplyToComment(null);
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
      className="feed-post-card"
      onSelectStartCapture={(e) => {
        const el = e.target;
        if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return;
        if (typeof el.closest === 'function' && (el.closest('textarea') || el.closest('input'))) return;
        e.preventDefault();
      }}
    >
      <header className="feed-post-card__head">
        <div className="feed-post-card__head-main">
          <UserAvatar
            src={post.authorAvatarUrl}
            size={36}
            presenceOnline={typeof authorOnline === 'boolean' ? authorOnline : undefined}
            onOpen={
              post.authorAvatarUrl && typeof onViewAuthorAvatar === 'function'
                ? () => onViewAuthorAvatar(post.authorAvatarUrl)
                : undefined
            }
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            {canOpenAuthorProfile ? (
              <button
                type="button"
                className="feed-post-author-btn"
                onClick={() => onOpenAuthorProfile(post.authorId)}
                title="Открыть мини-профиль"
              >
                <div className="feed-post-author-name">{post.authorName || nick}</div>
                <div className="feed-post-author-sub">
                  {post.authorNickname ? (
                    <NicknameWithBadge nickname={post.authorNickname} affiliationEmoji={affiliationEmoji} />
                  ) : (
                    <span>{nick}</span>
                  )}
                  {post.friendsOnly ? (
                    <span className="feed-post-friends-only-pill" title="Этот пост видят только ваши друзья">
                      только друзья
                    </span>
                  ) : null}
                </div>
              </button>
            ) : (
              <>
                <div className="feed-post-author-name">{post.authorName || nick}</div>
                <div className="feed-post-author-sub muted">
                  {post.authorNickname ? (
                    <NicknameWithBadge nickname={post.authorNickname} affiliationEmoji={affiliationEmoji} />
                  ) : (
                    nick
                  )}
                  {post.friendsOnly ? (
                    <span className="feed-post-friends-only-pill" title="Этот пост видят только ваши друзья">
                      только друзья
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
        {viewerId ? (
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
                  minWidth: 180,
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
                  disabled={totalReactions <= 0}
                  onClick={() => {
                    if (totalReactions <= 0) return;
                    setMenuOpen(false);
                    void openReactionWho();
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
                    cursor: totalReactions > 0 ? 'pointer' : 'not-allowed',
                    opacity: totalReactions > 0 ? 1 : 0.45,
                  }}
                >
                  Кто поставил реакцию
                </button>
                {isMine ? (
                  <>
                    <div
                      role="separator"
                      style={{
                        height: 1,
                        background: 'var(--border)',
                        margin: '6px 10px',
                      }}
                    />
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
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      <div
        {...lp}
        className="feed-post-card__body"
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          touchAction: 'manipulation',
        }}
      >
        {post.mediaUrl ? (
          <div className="feed-post-card__media-wrap">
            <PostMedia
              url={post.mediaUrl}
              onImageClick={
                typeof onOpenPostImage === 'function' ? () => onOpenPostImage(post.mediaUrl) : undefined
              }
            />
          </div>
        ) : null}

        <div className="feed-post-card__text-wrap">
          {editing ? (
            <div style={{ marginTop: 4 }}>
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
                <p className="feed-post-card__text">{post.body}</p>
              ) : null}
              {post.editedAt ? (
                <p className="muted feed-post-card__edited">
                  изменено · {formatEditedAt(post.editedAt)}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {!editing ? (
        <div className="feed-post-card__engage">
          {viewerId ? (
            <div className="feed-post-reactions-wrap" ref={reactPickerRef}>
              <div className="feed-post-reactions-row">
                {keysToShow.map((key) => {
                  const n = counts[key] ?? 0;
                  const active = mineList.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`feed-post-react-pill${active ? ' feed-post-react-pill--active' : ''}`}
                      onClick={() => void pickReaction(key)}
                    >
                      <span className="feed-post-react-pill__emoji" aria-hidden>
                        {REACTION_ICONS[key]}
                      </span>
                      {n > 0 ? <span className="feed-post-react-pill__count">{n}</span> : null}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="feed-post-react-add"
                  aria-expanded={reactPickerOpen}
                  aria-label={reactPickerOpen ? 'Закрыть выбор реакции' : 'Добавить реакцию'}
                  onClick={() => setReactPickerOpen((v) => !v)}
                >
                  {reactPickerOpen ? '✕' : '+'}
                </button>
              </div>
              {reactPickerOpen ? (
                <div className="feed-post-react-picker">
                  {REACTION_KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="feed-post-react-picker__btn"
                      onClick={() => void pickReaction(k)}
                    >
                      {REACTION_ICONS[k]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="feed-post-reactions-row feed-post-reactions-row--empty" aria-hidden />
          )}
          <time className="feed-post-card__time" dateTime={post.createdAt != null ? new Date(Number(post.createdAt)).toISOString() : undefined}>
            {formatPostTimeCompact(post.createdAt)}
          </time>
        </div>
      ) : null}

      {viewerId ? (
        <div className="feed-post-comments-block">
          <button
            type="button"
            className={`feed-post-comments-strip${commentsOpen ? ' feed-post-comments-strip--open' : ''}`}
            onClick={() => setCommentsOpen((v) => !v)}
          >
            <span className="feed-post-comments-strip__label">
              <span className="feed-post-comments-strip__icon" aria-hidden>
                💬
              </span>
              {commentsOpen ? 'Скрыть комментарии' : commentCountRu(commentCount)}
            </span>
            <span className="feed-post-comments-strip__chev" aria-hidden />
          </button>
          {commentsOpen ? (
            <div className="feed-post-comments-inner">
              {commentsLoading ? (
                <p className="feed-post-comments-loading muted">Загрузка…</p>
              ) : (
                <ul className="feed-post-comment-list">
                  {comments.map((c) => {
                    const isCommentMine = String(c.authorId) === String(viewerId);
                    return (
                      <li key={c.id} className="feed-post-comment">
                        <UserAvatar src={c.authorAvatarUrl} size={38} />
                        <div className="feed-post-comment__main">
                          <div className="feed-post-comment__header">
                            <span className="feed-post-comment__author">
                              <NicknameWithBadge nickname={c.authorNickname || 'user'} affiliationEmoji={c.authorAffiliationEmoji} />
                            </span>
                            <time className="feed-post-comment__time" dateTime={c.createdAt != null ? new Date(Number(c.createdAt)).toISOString() : undefined}>
                              {formatCommentTime(c.createdAt)}
                            </time>
                          </div>
                          {c.parentId && c.parentPreview ? (
                            <div className="feed-post-comment__reply-to">
                              <span className="feed-post-comment__reply-to-label">Ответ @{c.parentPreview.authorNickname || 'user'}</span>
                              <p className="feed-post-comment__reply-to-text">{c.parentPreview.bodySnippet}</p>
                            </div>
                          ) : null}
                          {editingCommentId === c.id ? (
                            <div className="feed-post-comment__edit">
                              <textarea
                                className="text-input feed-post-comment__edit-field"
                                value={editCommentText}
                                onChange={(e) => setEditCommentText(e.target.value.slice(0, 4000))}
                                rows={3}
                                maxLength={4000}
                              />
                              <div className="feed-post-comment__edit-actions">
                                <button
                                  type="button"
                                  className="btn-primary feed-post-comment__edit-save"
                                  disabled={commentSending}
                                  onClick={() => void saveCommentEdit(c.id)}
                                >
                                  Сохранить
                                </button>
                                <button type="button" className="btn-outline feed-post-comment__edit-cancel" onClick={() => setEditingCommentId(null)}>
                                  Отмена
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="feed-post-comment__body">{c.body}</p>
                          )}
                          <div className="feed-post-comment__footer">
                            {viewerId ? (
                              <button
                                type="button"
                                className="feed-post-comment__link-btn"
                                onClick={() =>
                                  setReplyToComment({
                                    id: c.id,
                                    label: c.authorNickname ? `@${c.authorNickname}` : 'комментарий',
                                  })
                                }
                              >
                                Ответить
                              </button>
                            ) : null}
                            {isCommentMine ? (
                              <>
                                <button
                                  type="button"
                                  className="feed-post-comment__icon-btn"
                                  aria-label="Изменить комментарий"
                                  onClick={() => {
                                    setEditingCommentId(c.id);
                                    setEditCommentText(c.body || '');
                                  }}
                                >
                                  ✎
                                </button>
                                <button
                                  type="button"
                                  className="feed-post-comment__icon-btn feed-post-comment__icon-btn--danger"
                                  aria-label="Удалить комментарий"
                                  onClick={() => void deleteComment(c.id)}
                                >
                                  ✕
                                </button>
                              </>
                            ) : null}
                            {c.editedAt ? <span className="feed-post-comment__edited muted">изменён</span> : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="feed-post-comment-compose">
                {replyToComment ? (
                  <div className="feed-post-comment-compose__reply-bar">
                    <span className="muted">Ответ {replyToComment.label}</span>
                    <button type="button" className="feed-post-comment-compose__reply-clear" onClick={() => setReplyToComment(null)}>
                      Отменить
                    </button>
                  </div>
                ) : null}
                <div className="feed-post-comment-compose__row">
                  <textarea
                    className="text-input feed-post-comment-compose__input"
                    placeholder={replyToComment ? `Сообщение для ${replyToComment.label}…` : 'Написать комментарий…'}
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value.slice(0, 4000))}
                    rows={2}
                    maxLength={4000}
                  />
                  <button
                    type="button"
                    className="feed-post-comment-compose__send"
                    disabled={commentSending || !commentDraft.trim()}
                    aria-label="Отправить комментарий"
                    onClick={() => void sendComment()}
                  >
                    {commentSending ? '…' : '➤'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

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

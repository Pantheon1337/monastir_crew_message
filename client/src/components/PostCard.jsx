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

export default function PostCard({ post }) {
  const nick = post.authorNickname ? `@${post.authorNickname}` : post.authorName || '—';
  return (
    <article className="block" style={{ padding: '12px', marginBottom: 10 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 10 }}>
          {post.authorAvatarUrl ? (
            <img
              src={post.authorAvatarUrl}
              alt=""
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: '1px solid var(--border)',
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: '1px solid var(--border)',
                background: '#252830',
                flexShrink: 0,
              }}
            />
          )}
          <div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{post.authorName || nick}</div>
            <div className="muted" style={{ fontSize: 10 }}>
              {nick} · {formatPostTime(post.createdAt)}
            </div>
          </div>
        </div>
      </header>
      <p style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{post.body}</p>
      <footer
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--muted)',
        }}
      >
        <span style={{ opacity: 0.7 }}>только для друзей</span>
      </footer>
    </article>
  );
}

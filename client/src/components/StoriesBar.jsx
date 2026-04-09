import { useCallback } from 'react';

function AvatarRing({ children, highlight }) {
  return (
    <div style={{ position: 'relative', width: 56, flexShrink: 0 }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          padding: highlight ? 2 : 1,
          background: highlight ? 'linear-gradient(135deg, var(--accent), #8b5cf6)' : 'var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: '#252830',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default function StoriesBar({ user, buckets = [], onAddStory, onOpenAuthor, onOpenArchive }) {
  const selfBucket = buckets.find((b) => b.userId === user?.id);
  const friendBuckets = buckets.filter((b) => b.userId !== user?.id);

  const openSelf = useCallback(() => {
    if (!user?.id) return;
    if (selfBucket?.itemCount) {
      onOpenAuthor?.(user.id);
    } else {
      onAddStory?.();
    }
  }, [user?.id, selfBucket?.itemCount, onAddStory, onOpenAuthor]);

  const openFriend = useCallback(
    (authorId) => {
      onOpenAuthor?.(authorId);
    },
    [onOpenAuthor]
  );

  return (
    <section
        style={{
          padding: '12px 0 8px 12px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 14,
            overflowX: 'auto',
            paddingBottom: 4,
            scrollbarWidth: 'thin',
          }}
        >
          <button
            type="button"
            onClick={openSelf}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--text)',
            }}
          >
            <AvatarRing highlight={Boolean(selfBucket?.itemCount)}>
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 20, color: 'var(--muted)' }}>+</span>
              )}
            </AvatarRing>
            <span className="muted" style={{ fontSize: 10 }}>
              Ваша история
            </span>
          </button>

          {friendBuckets.map((b) => (
            <button
              key={b.userId}
              type="button"
              onClick={() => openFriend(b.userId)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--text)',
              }}
            >
              <AvatarRing highlight>
                {b.avatarUrl ? (
                  <img src={b.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{b.label?.slice(0, 2) || '?'}</span>
                )}
              </AvatarRing>
              <span className="muted" style={{ fontSize: 10, maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {b.label}
              </span>
            </button>
          ))}
        </div>
        {onOpenArchive ? (
          <div style={{ padding: '4px 12px 0 0', textAlign: 'right' }}>
            <button type="button" className="muted" style={{ fontSize: 10, background: 'none', border: 'none', cursor: 'pointer' }} onClick={onOpenArchive}>
              Архив историй
            </button>
          </div>
        ) : null}
      </section>
  );
}

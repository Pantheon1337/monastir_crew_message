import { useCallback } from 'react';
import UserAvatar from './UserAvatar.jsx';

/** new | self — градиент; seen — серое кольцо «все просмотрено» */
function AvatarRing({ children, variant = 'new' }) {
  const muted = variant === 'seen';
  return (
    <div style={{ position: 'relative', width: 56, flexShrink: 0 }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          padding: muted ? 1 : 2,
          background: muted ? 'var(--border)' : 'linear-gradient(135deg, var(--accent), #8b5cf6)',
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

/**
 * Первая кнопка — всегда только создание новой истории.
 * Далее — кружки всех с активными историями (вы и друзья), как в ленте.
 */
export default function StoriesBar({ user, buckets = [], presenceOnline = {}, onAddStory, onOpenAuthor }) {
  const openBucket = useCallback(
    (authorId) => {
      if (!authorId) return;
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
          overflowY: 'hidden',
          paddingBottom: 4,
          scrollbarWidth: 'thin',
          touchAction: 'pan-x',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorX: 'contain',
        }}
      >
        <button
          type="button"
          onClick={() => onAddStory?.()}
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
            flexShrink: 0,
          }}
        >
          <AvatarRing variant="self">
            <span
              style={{
                fontSize: 30,
                fontWeight: 300,
                color: 'var(--accent)',
                lineHeight: 1,
                userSelect: 'none',
              }}
              aria-hidden
            >
              +
            </span>
          </AvatarRing>
          <span className="muted" style={{ fontSize: 10, maxWidth: 72, textAlign: 'center' }}>
            Новая
          </span>
        </button>

        {buckets.map((b) => {
          const isSelf = Boolean(b.isSelf) || String(b.userId) === String(user?.id);
          const label = isSelf ? 'Вы' : b.label;
          const ringVariant = b.allViewed ? 'seen' : isSelf ? 'self' : 'new';
          const peerOn = !isSelf && b.userId != null ? Boolean(presenceOnline[String(b.userId)]) : null;
          return (
            <button
              key={b.userId}
              type="button"
              onClick={() => openBucket(b.userId)}
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
                flexShrink: 0,
              }}
            >
              <div style={{ position: 'relative', width: 56, flexShrink: 0 }}>
                <AvatarRing variant={ringVariant}>
                  <UserAvatar src={b.avatarUrl} borderless style={{ width: '100%', height: '100%' }} />
                </AvatarRing>
                {peerOn != null ? (
                  <span
                    aria-hidden
                    title={peerOn ? 'в сети' : 'не в сети'}
                    style={{
                      position: 'absolute',
                      right: 2,
                      bottom: 2,
                      width: 11,
                      height: 11,
                      borderRadius: '50%',
                      background: peerOn ? 'var(--online)' : 'rgba(160, 160, 170, 0.85)',
                      border: '2px solid var(--bg)',
                      boxSizing: 'border-box',
                      pointerEvents: 'none',
                    }}
                  />
                ) : null}
              </div>
              <span className="muted" style={{ fontSize: 10, maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {label}
                {b.affiliationEmoji ? ` ${b.affiliationEmoji}` : ''}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

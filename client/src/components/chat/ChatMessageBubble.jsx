import { memo, useEffect, useRef } from 'react';
import VoiceMessagePlayer from '../VoiceMessagePlayer.jsx';
import VideoNoteInChat from './VideoNoteInChat.jsx';
import ChatMessageText from './ChatMessageText.jsx';
import SwipeToReplyRow from './SwipeToReplyRow.jsx';
import ChatReadReceipt from './ChatReadReceipt.jsx';
import ChatMessageReactions from './ChatMessageReactions.jsx';
import { REACTION_ICONS } from '../../reactionConstants.js';
import { useLongPress } from '../../hooks/useLongPress.js';
import { getCopyTextForMessage, looksLikeVideoFileName } from '../../chat/chatPrimitives.js';

/**
 * Пузырь сообщения: общая разметка для лички и комнаты (как единый поток текста + медиа).
 *
 * @param {string} [chatId] — личный чат
 * @param {string} [roomId] — комната
 * @param {boolean} [savedChat] — «Избранное» (без галочек прочтения как в личке)
 */
const ChatMessageBubble = memo(function ChatMessageBubble({
  m,
  userId,
  chatId,
  roomId,
  formatTime,
  onReactionsLocalUpdate,
  onOpenActionMenu,
  onMentionProfile,
  allowSwipeReply = true,
  onSwipeReply,
  onOpenImagePreview,
  savedChat = false,
  isFirstInGroup = true,
}) {
  const mine = m.senderId === userId;
  const kind = m.kind || 'text';
  const shellRef = useRef(null);

  /** Галочки: в комнате — для всех исходящих; в личке — если не «Избранное» */
  const showReadReceipt = mine && ((!!roomId && !savedChat) || (!roomId && !savedChat));

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const block = (ev) => {
      ev.preventDefault();
    };
    el.addEventListener('selectstart', block);
    el.addEventListener('dragstart', block);
    return () => {
      el.removeEventListener('selectstart', block);
      el.removeEventListener('dragstart', block);
    };
  }, []);

  const lp = useLongPress(
    (x, y) => {
      onOpenActionMenu?.(m, x, y);
    },
    { ms: 480, moveTol: 12 },
  );

  const isMediaShell = kind === 'video_note' || kind === 'sticker';
  const isRevoked = kind === 'revoked' || m.revokedForAll;
  const bubbleBg = isRevoked
    ? mine
      ? 'var(--chat-bubble-revoked-out)'
      : 'var(--chat-bubble-revoked-in)'
    : mine
      ? 'var(--chat-bubble-outgoing)'
      : 'var(--chat-bubble-incoming)';

  let inner = null;
  if (isRevoked) {
    inner = (
      <p style={{ margin: 0, fontSize: 12, fontStyle: 'italic', opacity: 0.8 }}>Сообщение удалено</p>
    );
  } else if (kind === 'voice' && m.mediaUrl) {
    inner = <VoiceMessagePlayer src={m.mediaUrl} durationMs={m.durationMs} mine={mine} />;
  } else if (kind === 'video_note' && m.mediaUrl) {
    inner = (
      <div onPointerDown={(e) => e.stopPropagation()}>
        <VideoNoteInChat src={m.mediaUrl} durationMs={m.durationMs} />
      </div>
    );
  } else if (kind === 'sticker' && m.mediaUrl) {
    inner = (
      <div onPointerDown={(e) => e.stopPropagation()} style={{ lineHeight: 0 }}>
        <img
          src={m.mediaUrl}
          alt={m.body?.trim() ? m.body : ''}
          draggable={false}
          loading="lazy"
          decoding="async"
          style={{
            display: 'block',
            maxWidth: 180,
            maxHeight: 180,
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            verticalAlign: 'bottom',
          }}
        />
      </div>
    );
  } else if (kind === 'image' && m.mediaUrl) {
    inner = (
      <div style={{ minWidth: 0, maxWidth: '100%' }}>
        <img
          className="chat-media-inline-img"
          src={m.mediaUrl}
          alt={m.body?.trim() ? m.body : 'Фото'}
          title="Открыть полностью"
          loading="lazy"
          decoding="async"
          sizes="280px"
          style={{ display: 'block', verticalAlign: 'top' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenImagePreview?.(m.mediaUrl);
          }}
        />
        {m.body?.trim() ? (
          <div className="chat-image-caption">
            <ChatMessageText text={m.body} onMentionClick={onMentionProfile} />
          </div>
        ) : null}
      </div>
    );
  } else if (kind === 'file' && m.mediaUrl && looksLikeVideoFileName(m.body)) {
    const cap = m.body?.trim() || '';
    inner = (
      <div style={{ minWidth: 0, maxWidth: 'var(--chat-bubble-max)' }} onPointerDown={(e) => e.stopPropagation()}>
        <video
          src={m.mediaUrl}
          controls
          playsInline
          preload="metadata"
          style={{ width: '100%', maxHeight: 360, borderRadius: 12, display: 'block', background: '#000' }}
        />
        {cap ? (
          <div className="chat-image-caption">
            <ChatMessageText text={cap} onMentionClick={onMentionProfile} />
          </div>
        ) : null}
      </div>
    );
  } else if (kind === 'file' && m.mediaUrl) {
    const name = m.body?.trim() || 'Скачать файл';
    inner = (
      <a
        className="chat-file-chip"
        href={m.mediaUrl}
        download={name}
        target="_blank"
        rel="noopener noreferrer"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="chat-file-chip__icon" aria-hidden>
          📎
        </span>
        <span className="chat-file-chip__name">{name}</span>
      </a>
    );
  } else if (kind === 'story_reaction') {
    const rk = m.storyReactionKey;
    inner = (
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {m.refStoryPreviewUrl ? (
          <img
            src={m.refStoryPreviewUrl}
            alt=""
            style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
          />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
        )}
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 22, lineHeight: 1.2 }}>{rk && REACTION_ICONS[rk] ? REACTION_ICONS[rk] : '💬'}</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            Реакция на историю
          </div>
        </div>
      </div>
    );
  } else {
    inner = <ChatMessageText text={m.body} onMentionClick={onMentionProfile} />;
  }

  const swipeReplyDisabled = isRevoked || allowSwipeReply === false;

  return (
    <div
      id={m.id ? `chat-msg-${m.id}` : undefined}
      className={mine ? 'chat-message-row chat-message-row--out' : 'chat-message-row chat-message-row--in'}
      style={{
        marginBottom: 0,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <SwipeToReplyRow
        disabled={swipeReplyDisabled || !onSwipeReply}
        onReply={() => {
          const preview =
            m.kind === 'text'
              ? (m.body || '').trim().slice(0, 120)
              : getCopyTextForMessage(m).slice(0, 120);
          onSwipeReply?.({
            id: m.id,
            senderNickname: m.senderNickname || 'user',
            preview: preview || '·',
          });
        }}
      >
        <div
          ref={shellRef}
          className={`chat-message-bubble-shell chat-tg-bubble${!isMediaShell ? ' chat-message-bubble--solid' : ''}`}
          {...lp}
          onContextMenu={(e) => {
            e.preventDefault();
            onOpenActionMenu?.(m, e.clientX, e.clientY);
          }}
          style={{
            borderRadius: isMediaShell ? 0 : undefined,
            padding: isMediaShell ? 0 : undefined,
            background: isMediaShell ? 'transparent' : bubbleBg,
            overflow: isMediaShell ? 'visible' : 'hidden',
            maxWidth: isMediaShell ? 'var(--chat-bubble-max)' : undefined,
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
            touchAction: 'manipulation',
          }}
        >
          {m.forwardFrom?.originalAuthorNickname ? (
            <div className="chat-bubble-forward-label muted">
              Переслано от @{m.forwardFrom.originalAuthorNickname}
            </div>
          ) : null}
          {m.replyTo ? (
            <div className="chat-bubble-reply">
              <div className="chat-bubble-reply__author">@{m.replyTo.senderNickname || 'user'}</div>
              <div className="chat-bubble-reply__preview">{m.replyTo.preview}</div>
            </div>
          ) : null}
          {!mine && !isRevoked && roomId && isFirstInGroup ? (
            <div className="chat-sender-name">
              @{m.senderNickname || 'user'}
              {m.senderAffiliationEmoji ? <span aria-hidden> {m.senderAffiliationEmoji}</span> : null}
            </div>
          ) : null}
          {inner}
          {!isRevoked ? (
            <ChatMessageReactions
              chatId={chatId}
              roomId={roomId}
              messageId={m.id}
              userId={userId}
              reactions={m.reactions}
              align={mine ? 'flex-end' : 'flex-start'}
              onUpdate={(r) => onReactionsLocalUpdate?.(m.id, r)}
            />
          ) : null}
          <div className="chat-bubble-meta-row">
            {m.pinnedForMe ? (
              <span
                title={m.pinnedShared ? 'Закреплено для обоих' : 'Закреплено у вас'}
                aria-hidden
                style={{ fontSize: 11, lineHeight: 1, marginRight: 'auto', opacity: 0.85 }}
              >
                📌
              </span>
            ) : null}
            <span className="chat-bubble-time">
              {formatTime(m.createdAt)}
              {kind === 'text' && m.editedAt != null ? (
                <span title="Сообщение изменено" style={{ opacity: 0.9 }}>
                  {' '}
                  · изм.
                </span>
              ) : null}
            </span>
            {showReadReceipt ? (
              <ChatReadReceipt readByPeer={m.readByPeer} deliveredToPeer={m.deliveredToPeer} pending={m.pending} />
            ) : null}
          </div>
        </div>
      </SwipeToReplyRow>
    </div>
  );
});

export default ChatMessageBubble;

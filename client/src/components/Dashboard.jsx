import { useRef, useState, useCallback, useEffect } from 'react';
import UserAvatar from './UserAvatar.jsx';
import NicknameWithBadge from './NicknameWithBadge.jsx';

const SWIPE_MAX = 152;
const LONG_PRESS_MS = 480;
const MOVE_CANCEL_PX = 14;
/** Скролл списка чатов не должен открывать кнопку «Удалить» — только явный горизонтальный свайп. */
const SWIPE_ARM_MIN_DX = 16;
const SCROLL_LOCK_MIN_DY = 12;

function ChatRowInner({ chat, peerOnline, onActivate, style }) {
  const unread = (chat.unreadCount ?? 0) > 0;
  const saved = chat.isSavedMessages === true;
  const rowBg = saved
    ? 'rgba(140, 145, 155, 0.16)'
    : unread
      ? 'rgba(193, 123, 75, 0.06)'
      : 'transparent';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate?.();
        }
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: '52px 1fr auto',
        gap: 10,
        alignItems: 'center',
        padding: '10px 12px',
        width: '100%',
        textAlign: 'left',
        background: rowBg,
        border: 'none',
        borderBottom: 'none',
        color: 'inherit',
        cursor: 'pointer',
        font: 'inherit',
        ...style,
      }}
    >
      <UserAvatar
        src={chat.peerAvatarUrl}
        size={52}
        presenceOnline={typeof peerOnline === 'boolean' ? peerOnline : undefined}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: unread ? 700 : 500 }}>
          {saved ? (
            chat.name
          ) : (() => {
              const full = [chat.peerFirstName, chat.peerLastName].filter(Boolean).join(' ').trim();
              if (full) {
                return (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: unread ? 700 : 600, lineHeight: 1.25 }}>{full}</div>
                    {chat.peerNickname ? (
                      <div className="muted" style={{ fontSize: 11, marginTop: 2, fontWeight: 400 }}>
                        <NicknameWithBadge nickname={chat.peerNickname} affiliationEmoji={chat.peerAffiliationEmoji} />
                      </div>
                    ) : null}
                  </div>
                );
              }
              return chat.peerNickname ? (
                <NicknameWithBadge nickname={chat.peerNickname} affiliationEmoji={chat.peerAffiliationEmoji} />
              ) : (
                chat.name
              );
            })()}
        </div>
        <div
          className={unread ? undefined : 'muted'}
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: unread ? 'var(--text)' : undefined,
            fontWeight: unread ? 500 : 400,
            fontSize: 13,
          }}
        >
          {chat.typing ? 'печатает…' : chat.lastMessage}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {chat.typing ? <span style={{ color: 'var(--online)' }}>●</span> : chat.time}
        {unread ? (
          <span
            style={{
              minWidth: 20,
              height: 20,
              padding: '0 6px',
              borderRadius: 999,
              background: 'var(--accent)',
              color: 'var(--bg)',
              fontSize: 11,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function useLongPress(onLongPress, { ms = LONG_PRESS_MS } = {}) {
  const timerRef = useRef(null);
  const startRef = useRef(null);
  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  return {
    onPointerDown(e) {
      if (e.button !== 0) return;
      startRef.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        startRef.current = null;
        onLongPress();
      }, ms);
    },
    onPointerMove(e) {
      const s = startRef.current;
      if (!s || timerRef.current == null) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
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

function ChatSwipeRow({ chat, peerOnline, onOpen, onDeleteForMe }) {
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startOff = useRef(0);
  /** undecided | vertical (скролл списка) | horizontal (свайп к кнопкам) */
  const gestureAxisRef = useRef('undecided');

  const [sheetOpen, setSheetOpen] = useState(false);
  const skipNextOpenChat = useRef(false);
  const openActionSheet = useCallback(() => {
    setOffset(0);
    setSheetOpen(true);
    skipNextOpenChat.current = true;
  }, []);

  const lp = useLongPress(openActionSheet);

  const snap = useCallback((o) => {
    const t = o < -SWIPE_MAX / 2 ? -SWIPE_MAX : 0;
    setOffset(t);
  }, []);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    lp.onPointerDown(e);
    dragging.current = true;
    gestureAxisRef.current = 'undecided';
    setIsDragging(false);
    startX.current = e.clientX;
    startY.current = e.clientY;
    startOff.current = offsetRef.current;
  };

  const onPointerMove = (e) => {
    lp.onPointerMove(e);
    if (!dragging.current) return;

    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    if (gestureAxisRef.current === 'vertical') {
      return;
    }

    if (gestureAxisRef.current === 'undecided') {
      // Сначала определяем ось: вертикаль — отдаём скроллу родителя, без смещения строки
      if (Math.abs(dy) >= SCROLL_LOCK_MIN_DY && Math.abs(dy) >= Math.abs(dx) - 2) {
        gestureAxisRef.current = 'vertical';
        setOffset(0);
        setIsDragging(false);
        return;
      }
      // Горизонтальный свайп — только при явном преобладании dx
      if (Math.abs(dx) >= SWIPE_ARM_MIN_DX && Math.abs(dx) > Math.abs(dy) + 8) {
        gestureAxisRef.current = 'horizontal';
        setIsDragging(true);
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
      return;
    }

    if (gestureAxisRef.current === 'horizontal') {
      let next = startOff.current + dx;
      if (next > 0) next = 0;
      if (next < -SWIPE_MAX) next = -SWIPE_MAX;
      setOffset(next);
    }
  };

  const onPointerUp = (e) => {
    lp.onPointerUp();
    if (dragging.current) {
      dragging.current = false;
      snap(offsetRef.current);
      setIsDragging(false);
    }
    gestureAxisRef.current = 'undecided';
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerCancel = (e) => {
    lp.onPointerCancel();
    dragging.current = false;
    setIsDragging(false);
    gestureAxisRef.current = 'undecided';
    snap(offsetRef.current);
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const openChat = () => {
    if (skipNextOpenChat.current) {
      skipNextOpenChat.current = false;
      return;
    }
    if (offsetRef.current < -24) {
      setOffset(0);
      return;
    }
    onOpen?.(chat);
  };

  return (
    <>
      <div className="chat-swipe-wrap">
        <div className="chat-swipe-under" aria-hidden="true">
          <button type="button" className="chat-swipe-btn chat-swipe-btn--delete" onClick={() => onDeleteForMe?.(chat)}>
            Удалить
          </button>
        </div>
        <div
          className="chat-swipe-front"
          style={{
            transform: `translate3d(${offset}px,0,0)`,
            transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.25, 0.8, 0.25, 1)',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <ChatRowInner
            chat={chat}
            peerOnline={peerOnline}
            onActivate={openChat}
            style={{ touchAction: 'pan-y' }}
          />
        </div>
      </div>

      {sheetOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Действия с чатом"
          className="modal-overlay chat-actions-sheet-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 140,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: 12,
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            background: 'rgba(0,0,0,0.45)',
          }}
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="block chat-actions-sheet-panel"
            style={{
              width: '100%',
              maxWidth: 400,
              borderRadius: 16,
              padding: 8,
              marginBottom: 4,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="chat-actions-sheet-item chat-actions-sheet-item--danger"
              onClick={() => {
                setSheetOpen(false);
                onDeleteForMe?.(chat);
              }}
            >
              Удалить из списка…
            </button>
            <button type="button" className="chat-actions-sheet-cancel" onClick={() => setSheetOpen(false)}>
              Отмена
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function RoomRow({ room, onOpen }) {
  const unread = (room.unreadCount ?? 0) > 0;
  return (
    <button
      type="button"
      onClick={() => onOpen?.(room)}
      style={{
        display: 'grid',
        gridTemplateColumns: '52px 1fr auto',
        gap: 10,
        alignItems: 'center',
        padding: '10px 12px',
        width: '100%',
        textAlign: 'left',
        background: unread ? 'rgba(193, 123, 75, 0.06)' : 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--border)',
        color: 'inherit',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'rgba(193, 123, 75, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          fontWeight: 700,
          color: 'var(--accent)',
          flexShrink: 0,
        }}
        aria-hidden
      >
        #
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: unread ? 700 : 500 }}>
          <span style={{ color: 'var(--accent)' }}>#</span> {room.name}
        </div>
        <div
          className={unread ? undefined : 'muted'}
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: unread ? 'var(--text)' : undefined,
            fontWeight: unread ? 500 : 400,
            fontSize: 13,
          }}
        >
          {room.lastMessage ?? 'Нет сообщений'}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {room.time ?? ''}
        <span className="muted" style={{ fontSize: 10 }}>
          {room.members}
        </span>
        {unread ? (
          <span
            style={{
              minWidth: 20,
              height: 20,
              padding: '0 6px',
              borderRadius: 999,
              background: 'var(--accent)',
              color: 'var(--bg)',
              fontSize: 11,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {room.unreadCount > 99 ? '99+' : room.unreadCount}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function Panel({ title, children, headerAction }) {
  const showHead = Boolean(title) || Boolean(headerAction);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
      {showHead ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px 6px',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 0.2,
            color: 'var(--accent)',
            gap: 8,
          }}
        >
          <span style={{ minWidth: 0 }}>{title || '\u00a0'}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {headerAction}
          </span>
        </div>
      ) : null}
      <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

export default function Dashboard({
  chats = [],
  rooms = [],
  singleColumn,
  onOpenChat,
  onCreateRoom,
  onOpenRoom,
  presenceOnline = {},
  chatsBare = false,
  onDeleteChatForMe,
}) {
  const chatsInner =
    chats.length === 0 ? (
      <p className="muted" style={{ fontSize: 12, margin: '0 12px 12px' }}>
        Нет диалогов
      </p>
    ) : (
      chats.map((c) => {
        const peerOnline = c.peerUserId != null ? Boolean(presenceOnline[String(c.peerUserId)]) : undefined;
        const saved = c.isSavedMessages === true;
        if (saved) {
          return (
            <div key={c.id} className="chat-swipe-wrap chat-swipe-wrap--plain">
              <ChatRowInner chat={c} peerOnline={peerOnline} onActivate={() => onOpenChat?.(c)} />
            </div>
          );
        }
        return (
          <ChatSwipeRow
            key={c.id}
            chat={c}
            peerOnline={peerOnline}
            onOpen={onOpenChat}
            onDeleteForMe={onDeleteChatForMe}
          />
        );
      })
    );

  const scrollArea = (
    <div className="dashboard-chat-scroll" style={{ overflow: 'auto', WebkitOverflowScrolling: 'touch', maxHeight: 'min(72dvh, 560px)' }}>
      {chatsInner}
    </div>
  );

  const chatsBlock = chatsBare ? (
    <div className="dashboard-chat-card">
      <Panel title="Чаты">{scrollArea}</Panel>
    </div>
  ) : (
    <Panel title="Чаты">{scrollArea}</Panel>
  );

  const roomsBlock = (
    <Panel
      title="Комнаты"
      headerAction={
        onCreateRoom ? (
          <button
            type="button"
            className="btn-outline"
            aria-label="Создать комнату"
            title="Создать комнату"
            onClick={(e) => {
              e.stopPropagation();
              onCreateRoom();
            }}
            style={{ fontSize: 12, padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 600 }}
          >
            Создать комнату
          </button>
        ) : null
      }
    >
      {rooms.length === 0 ? (
        <p className="muted" style={{ fontSize: 12, margin: '0 12px 12px' }}>
          Нет комнат
        </p>
      ) : (
        rooms.map((r) => <RoomRow key={r.id} room={r} onOpen={onOpenRoom} />)
      )}
    </Panel>
  );

  if (singleColumn === 'chats') {
    return <section style={{ display: 'grid', gridTemplateColumns: '1fr' }}>{chatsBlock}</section>;
  }
  if (singleColumn === 'rooms') {
    return <section style={{ display: 'grid', gridTemplateColumns: '1fr' }}>{roomsBlock}</section>;
  }

  return null;
}

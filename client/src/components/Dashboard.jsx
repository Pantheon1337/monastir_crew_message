import UserAvatar from './UserAvatar.jsx';
import NicknameWithBadge from './NicknameWithBadge.jsx';

function ChatRow({ chat, onOpen, peerOnline }) {
  const unread = (chat.unreadCount ?? 0) > 0;
  const saved = chat.isSavedMessages === true;
  const rowBg = saved
    ? 'rgba(140, 145, 155, 0.16)'
    : unread
      ? 'rgba(193, 123, 75, 0.06)'
      : 'transparent';
  return (
    <button
      type="button"
      onClick={() => onOpen?.(chat)}
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
        borderBottom: '1px solid var(--border)',
        color: 'inherit',
        cursor: 'pointer',
      }}
    >
      <UserAvatar
        src={chat.peerAvatarUrl}
        size={52}
        presenceOnline={typeof peerOnline === 'boolean' ? peerOnline : undefined}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: unread ? 700 : 500 }}>
          {chat.peerNickname ? (
            <NicknameWithBadge nickname={chat.peerNickname} affiliationEmoji={chat.peerAffiliationEmoji} />
          ) : (
            chat.name
          )}
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
    </button>
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
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
        <span style={{ minWidth: 0 }}>{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {headerAction}
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

export default function Dashboard({ chats = [], rooms = [], singleColumn, onOpenChat, onCreateRoom, onOpenRoom, presenceOnline = {} }) {
  /** На главной (две колонки) — не больше двух последних чатов/комнат; в разделах «Чаты»/«Комнаты» — полный список. */
  const isHomeGrid = !singleColumn;
  const chatsShown = isHomeGrid ? chats.slice(0, 2) : chats;
  const roomsShown = isHomeGrid ? rooms.slice(0, 2) : rooms;

  const chatsBlock = (
    <Panel title="Чаты">
      {chatsShown.length === 0 ? (
        <p className="muted" style={{ fontSize: 12, margin: '0 12px 12px' }}>
          Нет диалогов
        </p>
      ) : (
        chatsShown.map((c) => (
          <ChatRow
            key={c.id}
            chat={c}
            onOpen={onOpenChat}
            peerOnline={c.peerUserId != null ? Boolean(presenceOnline[String(c.peerUserId)]) : undefined}
          />
        ))
      )}
    </Panel>
  );

  const roomsBlock = (
    <Panel
      title="Комнаты"
      headerAction={
        onCreateRoom ? (
          <button
            type="button"
            className="icon-btn"
            aria-label="Создать комнату"
            title="Создать комнату"
            onClick={(e) => {
              e.stopPropagation();
              onCreateRoom();
            }}
            style={{ width: 30, height: 30 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        ) : null
      }
    >
      {roomsShown.length === 0 ? (
        <p className="muted" style={{ fontSize: 12, margin: '0 12px 12px' }}>
          Нет комнат
        </p>
      ) : (
        roomsShown.map((r) => <RoomRow key={r.id} room={r} onOpen={onOpenRoom} />)
      )}
    </Panel>
  );

  if (singleColumn === 'chats') {
    return <section style={{ display: 'grid', gridTemplateColumns: '1fr' }}>{chatsBlock}</section>;
  }
  if (singleColumn === 'rooms') {
    return <section style={{ display: 'grid', gridTemplateColumns: '1fr' }}>{roomsBlock}</section>;
  }

  return (
    <section style={{ padding: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ borderBottom: '1px solid var(--border)' }}>{chatsBlock}</div>
      {roomsBlock}
    </section>
  );
}

function ChatRow({ chat, onOpen }) {
  const unread = (chat.unreadCount ?? 0) > 0;
  return (
    <button
      type="button"
      onClick={() => onOpen?.(chat)}
      style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '10px 12px',
        borderRadius: 'var(--radius)',
        borderBottom: '1px solid var(--border)',
        width: '100%',
        textAlign: 'left',
        background: unread ? 'rgba(193, 123, 75, 0.07)' : 'none',
        borderLeft: unread ? '3px solid var(--accent)' : '3px solid transparent',
        borderRight: 'none',
        borderTop: 'none',
        color: 'inherit',
        cursor: 'pointer',
      }}
    >
      {chat.peerAvatarUrl ? (
        <img
          src={chat.peerAvatarUrl}
          alt=""
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '1px solid var(--border)',
            objectFit: 'cover',
          }}
        />
      ) : (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: '#252830',
          }}
        />
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: unread ? 700 : 500 }}>{chat.name}</div>
        <div
          className={unread ? undefined : 'muted'}
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: unread ? 'var(--text)' : undefined,
            fontWeight: unread ? 500 : 400,
          }}
        >
          {chat.typing ? 'печатает…' : chat.lastMessage}
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {chat.typing ? <span style={{ color: 'var(--online)' }}>●</span> : chat.time}
        {unread ? (
          <span
            style={{
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              borderRadius: 999,
              background: 'var(--accent)',
              color: 'var(--bg)',
              fontSize: 10,
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
        gridTemplateColumns: '36px 1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '10px 12px',
        borderRadius: 'var(--radius)',
        borderBottom: '1px solid var(--border)',
        width: '100%',
        textAlign: 'left',
        background: unread ? 'rgba(193, 123, 75, 0.07)' : 'none',
        borderLeft: unread ? '3px solid var(--accent)' : '3px solid transparent',
        borderRight: 'none',
        borderTop: 'none',
        color: 'inherit',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '1px solid var(--border)',
          background: 'rgba(193, 123, 75, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--accent)',
          flexShrink: 0,
        }}
        aria-hidden
      >
        #
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: unread ? 700 : 500 }}>
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
            fontSize: 11,
          }}
        >
          {room.lastMessage ?? 'Нет сообщений'}
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {room.time ?? ''}
        <span className="muted" style={{ fontSize: 9 }}>
          {room.members}
        </span>
        {unread ? (
          <span
            style={{
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              borderRadius: 999,
              background: 'var(--accent)',
              color: 'var(--bg)',
              fontSize: 10,
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
    <div className="block" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
          fontSize: 12,
          fontWeight: 600,
          gap: 8,
        }}
      >
        <span style={{ minWidth: 0 }}>{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {headerAction}
          <span className="chevr">›</span>
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

export default function Dashboard({ chats = [], rooms = [], singleColumn, onOpenChat, onCreateRoom, onOpenRoom }) {
  const chatsBlock = (
    <Panel title="Чаты">
      {chats.length === 0 ? (
        <p className="muted" style={{ fontSize: 11, margin: 0 }}>
          Нет диалогов
        </p>
      ) : (
        chats.map((c) => <ChatRow key={c.id} chat={c} onOpen={onOpenChat} />)
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
      {rooms.length === 0 ? (
        <p className="muted" style={{ fontSize: 11, margin: 0 }}>
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

  return (
    <section style={{ padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {chatsBlock}
      {roomsBlock}
    </section>
  );
}

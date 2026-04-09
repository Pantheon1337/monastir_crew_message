function ChatRow({ chat, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(chat)}
      style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
        width: '100%',
        textAlign: 'left',
        background: 'none',
        borderLeft: 'none',
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
        <div style={{ fontSize: 12, fontWeight: 500 }}>{chat.name}</div>
        <div className="muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {chat.typing ? 'печатает…' : chat.lastMessage}
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)' }}>
        {chat.typing ? <span style={{ color: 'var(--online)' }}>●</span> : chat.time}
      </div>
    </button>
  );
}

function RoomRow({ room }) {
  return (
    <div
      style={{
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>
          <span style={{ color: 'var(--accent)' }}>#</span> {room.name}
        </span>
        <span className="muted">{room.members}</span>
      </div>
      <div className="muted" style={{ marginTop: 4 }}>
        активность {room.lastActive}
      </div>
    </div>
  );
}

function Panel({ title, children }) {
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
        }}
      >
        <span>{title}</span>
        <span className="chevr">›</span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

export default function Dashboard({ chats = [], rooms = [], singleColumn, onOpenChat }) {
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
    <Panel title="Комнаты">
      {rooms.length === 0 ? (
        <p className="muted" style={{ fontSize: 11, margin: 0 }}>
          Нет комнат
        </p>
      ) : (
        rooms.map((r) => <RoomRow key={r.id} room={r} />)
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

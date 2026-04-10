/**
 * На главной: только переходы в разделы «Чаты» и «Комнаты» (без списков на экране).
 */
export default function HomeSocialShortcuts({ onOpenChats, onOpenRooms, chatUnread = 0 }) {
  return (
    <section
      style={{
        padding: '8px 12px 4px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <button type="button" className="btn-outline" style={{ width: '100%', fontSize: 13 }} onClick={onOpenChats}>
        Чаты
        {chatUnread > 0 ? (
          <span style={{ marginLeft: 8, opacity: 0.85, fontWeight: 600 }}>
            ({chatUnread > 99 ? '99+' : chatUnread})
          </span>
        ) : null}
      </button>
      <button type="button" className="btn-outline" style={{ width: '100%', fontSize: 13 }} onClick={onOpenRooms}>
        Комнаты
      </button>
    </section>
  );
}

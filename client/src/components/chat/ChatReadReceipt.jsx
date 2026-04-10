/**
 * Статус исходящего сообщения: 1✓ — в процессе доставки; 2✓ серые — доставлено; 2✓ голубые — прочитано.
 */
export default function ChatReadReceipt({ readByPeer, pending }) {
  if (pending) {
    return (
      <span className="chat-read-receipt chat-read-receipt--pending" title="Отправка…" aria-hidden>
        <span className="chat-read-receipt__tick chat-read-receipt__tick--solo">✓</span>
      </span>
    );
  }

  const read = readByPeer === true;
  return (
    <span
      className={`chat-read-receipt ${read ? 'chat-read-receipt--read' : 'chat-read-receipt--delivered'}`}
      title={read ? 'Прочитано' : 'Доставлено'}
      aria-hidden
    >
      <span className="chat-read-receipt__pair">
        <span className="chat-read-receipt__tick">✓</span>
        <span className="chat-read-receipt__tick chat-read-receipt__tick--overlap">✓</span>
      </span>
    </span>
  );
}

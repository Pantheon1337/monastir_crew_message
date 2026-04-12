/**
 * Статус исходящего: отправка… → одна ✓ (на сервер) → две серые (у собеседника) → две голубые (прочитано).
 * В комнатах без детальной доставки передавайте deliveredToPeer={true}.
 */
export default function ChatReadReceipt({ readByPeer, deliveredToPeer = true, pending }) {
  if (pending) {
    return (
      <span className="chat-read-receipt chat-read-receipt--pending" title="Отправка…" aria-hidden>
        <span className="chat-read-receipt__tick chat-read-receipt__tick--solo">✓</span>
      </span>
    );
  }

  const read = readByPeer === true;
  if (read) {
    return (
      <span className="chat-read-receipt chat-read-receipt--read" title="Прочитано" aria-hidden>
        <span className="chat-read-receipt__pair">
          <span className="chat-read-receipt__tick">✓</span>
          <span className="chat-read-receipt__tick chat-read-receipt__tick--overlap">✓</span>
        </span>
      </span>
    );
  }

  if (deliveredToPeer === true) {
    return (
      <span className="chat-read-receipt chat-read-receipt--delivered" title="Доставлено" aria-hidden>
        <span className="chat-read-receipt__pair">
          <span className="chat-read-receipt__tick">✓</span>
          <span className="chat-read-receipt__tick chat-read-receipt__tick--overlap">✓</span>
        </span>
      </span>
    );
  }

  return (
    <span className="chat-read-receipt chat-read-receipt--sent" title="Отправлено" aria-hidden>
      <span className="chat-read-receipt__tick chat-read-receipt__tick--solo">✓</span>
    </span>
  );
}

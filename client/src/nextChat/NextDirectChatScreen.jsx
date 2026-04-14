import DirectChatScreen from '../components/DirectChatScreen.jsx';
import './next-chat.css';

/**
 * Личный чат на новой оболочке (стили next-chat.css).
 * Логика сообщений — в useDirectChatMessageChannel внутри DirectChatScreen.
 */
export default function NextDirectChatScreen(props) {
  return (
    <div className="next-chat-root">
      <DirectChatScreen {...props} />
    </div>
  );
}

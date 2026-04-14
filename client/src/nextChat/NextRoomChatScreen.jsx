import RoomChatScreen from '../components/RoomChatScreen.jsx';
import './next-chat.css';

/**
 * Групповой чат с той же оболочкой, что и NextDirectChatScreen.
 */
export default function NextRoomChatScreen(props) {
  return (
    <div className="next-chat-root">
      <RoomChatScreen {...props} />
    </div>
  );
}

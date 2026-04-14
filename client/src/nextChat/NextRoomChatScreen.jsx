/**
 * Заготовка: когда появится TestRoomChatScreen.jsx — подключить сюда или заменить импорт в App.
 * Основной RoomChatScreen сейчас без изменений.
 */
import RoomChatScreen from '../components/RoomChatScreen.jsx';
import './next-chat.css';

export default function NextRoomChatScreen(props) {
  return (
    <div className="next-chat-root">
      <RoomChatScreen {...props} />
    </div>
  );
}

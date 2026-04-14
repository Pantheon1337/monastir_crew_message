import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import DirectChatScreen from '../DirectChatScreen.jsx';

/**
 * Тестовый полноэкранный чат: полный DirectChatScreen (медиа, реакции, меню, композер),
 * поток — «Избранное». Отображение текста — те же глобальные классы, что и везде;
 * правки переносов делаются в index.css / chatPrimitives, а не здесь.
 */
export default function TestChatScreen({
  userId,
  userNickname,
  userAvatarUrl,
  lastEvent,
  onClose,
  onAfterChange,
  onOpenProfileByUserId,
}) {
  const [chatId, setChatId] = useState(null);
  const [resolveErr, setResolveErr] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setResolveErr(null);
      const { ok, data } = await api('/api/chats', { userId });
      if (cancelled) return;
      if (!ok) {
        setResolveErr(data?.error || 'Не удалось загрузить чаты');
        return;
      }
      const list = data.chats || [];
      const saved = list.find((c) => c.isSavedMessages === true);
      if (!saved?.id) {
        setResolveErr('Чат «Избранное» не найден. Откройте вкладку «Чаты» один раз.');
        return;
      }
      setChatId(saved.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (resolveErr) {
    return (
      <div
        className="newchat-screen"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 120,
          maxWidth: 480,
          margin: '0 auto',
          background: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          padding: 20,
          paddingTop: 'max(20px, env(safe-area-inset-top))',
        }}
      >
        <p style={{ fontSize: 13, color: '#c45c5c', marginBottom: 16 }}>{resolveErr}</p>
        <button type="button" className="btn-primary" onClick={onClose}>
          Закрыть
        </button>
      </div>
    );
  }

  if (!chatId) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
        }}
      >
        <p className="muted" style={{ fontSize: 12 }}>
          Загрузка тестового чата…
        </p>
      </div>
    );
  }

  return (
    <DirectChatScreen
      userId={userId}
      chatId={chatId}
      isSavedMessages
      savedMessagesTitleOverride="Тестовый чат"
      savedMessagesSubtitleOverride="Тот же функционал, что «Избранное» — медиа, реакции, ответ, правки"
      savedMessagesAllowOpenProfile
      peerLabel="Я"
      peerNickname={userNickname}
      peerFirstName={null}
      peerLastName={null}
      peerAffiliationEmoji={null}
      peerUserId={userId}
      peerAvatarUrl={userAvatarUrl ?? null}
      peerOnline={undefined}
      peerLastSeenAt={undefined}
      peerLastSeenHidden={false}
      onClose={onClose}
      lastEvent={lastEvent}
      onAfterChange={onAfterChange}
      onOpenPeerProfile={onOpenProfileByUserId ? () => onOpenProfileByUserId(userId) : undefined}
      onOpenProfileByUserId={onOpenProfileByUserId}
      canMessage
      friendsActive
    />
  );
}

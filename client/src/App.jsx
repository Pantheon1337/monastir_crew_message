import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Header from './components/Header.jsx';
import StoriesBar from './components/StoriesBar.jsx';
import Dashboard from './components/Dashboard.jsx';
import Feed from './components/Feed.jsx';
import BottomNav from './components/BottomNav.jsx';
import ProfileScreen from './components/ProfileScreen.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import DirectChatScreen from './components/DirectChatScreen.jsx';
import RoomChatScreen from './components/RoomChatScreen.jsx';
import StoryViewer from './components/StoryViewer.jsx';
import StoryCreateModal from './components/StoryCreateModal.jsx';
import StoriesArchiveModal from './components/StoriesArchiveModal.jsx';
import FriendProfileSheet from './components/FriendProfileSheet.jsx';
import AppStatusModal from './components/AppStatusModal.jsx';
import StubMenuModal from './components/StubMenuModal.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import PossibleFriendsModal from './components/PossibleFriendsModal.jsx';
import CreateRoomModal from './components/CreateRoomModal.jsx';
import RoomDetailModal from './components/RoomDetailModal.jsx';
import { useWebSocket } from './hooks/useWebSocket.js';
import { getStoredUser, setStoredUser, clearStoredUser } from './authStorage.js';
import { api, apiPath } from './api.js';
import {
  previewTextForChatMessage,
  showBrowserNotification,
  setAppNotificationsEnabled,
} from './browserNotification.js';
import {
  applyThemeToDocument,
  getNotificationsEnabled,
  getTheme,
  setNotificationsEnabled as saveNotificationsEnabled,
  setTheme as saveTheme,
} from './appPreferences.js';

export default function App() {
  const [session, setSession] = useState('checking');
  const [user, setUser] = useState(null);
  const [nav, setNav] = useState('home');
  const [feed, setFeed] = useState([]);
  const [chats, setChats] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [storyBuckets, setStoryBuckets] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [socialTick, setSocialTick] = useState(0);
  const [pendingFriendCount, setPendingFriendCount] = useState(0);
  const [chatUnreadTotal, setChatUnreadTotal] = useState(0);
  const [openChat, setOpenChat] = useState(null);
  const [openRoomChat, setOpenRoomChat] = useState(null);
  const [storyViewer, setStoryViewer] = useState(null);
  const [storyCreateOpen, setStoryCreateOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [peerProfileUserId, setPeerProfileUserId] = useState(null);
  const [appStatusOpen, setAppStatusOpen] = useState(false);
  const [menuStub, setMenuStub] = useState(null);
  const [possibleFriendsOpen, setPossibleFriendsOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(getNotificationsEnabled);
  const [appTheme, setAppTheme] = useState(getTheme);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [roomDetailId, setRoomDetailId] = useState(null);
  const [networkOnline, setNetworkOnline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine,
  );
  const openChatRef = useRef(null);
  const openRoomChatRef = useRef(null);

  const verifySession = useCallback(async () => {
    setSession('checking');
    const stored = getStoredUser();
    if (!stored?.id) {
      setUser(null);
      setSession('out');
      return;
    }
    try {
      const r = await fetch(apiPath(`/api/auth/user/${encodeURIComponent(stored.id)}`));
      if (r.status === 404) {
        clearStoredUser();
        setUser(null);
        setSession('out');
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      setStoredUser(data.user);
      setUser(data.user);
      setSession('in');
    } catch {
      setUser(null);
      setSession('verify-error');
    }
  }, []);

  useEffect(() => {
    verifySession();
  }, [verifySession]);

  const refreshSocial = useCallback(async () => {
    if (!user?.id) return;
    const [c, inc, un, rm] = await Promise.all([
      api('/api/chats', { userId: user.id }),
      api('/api/friends/requests/incoming', { userId: user.id }),
      api('/api/chats/unread-total', { userId: user.id }),
      api('/api/rooms', { userId: user.id }),
    ]);
    if (c.ok) setChats(c.data.chats || []);
    if (inc.ok) setPendingFriendCount((inc.data.requests || []).length);
    if (un.ok) setChatUnreadTotal(un.data.total ?? 0);
    if (rm.ok) setRooms(rm.data.rooms || []);
    setSocialTick((n) => n + 1);
  }, [user?.id]);

  const refreshFeed = useCallback(async () => {
    if (!user?.id) return;
    const f = await api('/api/feed', { userId: user.id });
    if (f.ok) setFeed(f.data.posts || []);
  }, [user?.id]);

  const refreshStories = useCallback(async () => {
    if (!user?.id) return;
    const s = await api('/api/stories', { userId: user.id });
    if (s.ok) setStoryBuckets(s.data.buckets || []);
  }, [user?.id]);

  /** После принятия заявки обновляем и ленту/истории (новый друг видит ваши посты и наоборот). */
  const onFriendsChanged = useCallback(async () => {
    await refreshSocial();
    await Promise.all([refreshFeed(), refreshStories()]);
  }, [refreshSocial, refreshFeed, refreshStories]);

  const openStoryAuthor = useCallback(
    async (authorId) => {
      if (!user?.id) return;
      const r = await api(`/api/stories/author/${encodeURIComponent(authorId)}`, { userId: user.id });
      if (!r.ok) return;
      const items = r.data.items || [];
      if (items.length === 0) return;
      const b = storyBuckets.find((x) => String(x.userId) === String(authorId));
      const isSelf = String(authorId) === String(user.id);
      setStoryViewer({
        authorId,
        isSelf,
        label: isSelf ? 'Вы' : b?.label || 'История',
        avatarUrl: isSelf ? user.avatarUrl : b?.avatarUrl,
        items,
      });
    },
    [user?.id, user?.avatarUrl, storyBuckets]
  );

  /** Последний кадр текущего автора → следующий кружок в ленте (все кадры API, в т.ч. уже просмотренные). */
  const goToNextStoryAuthor = useCallback(async () => {
    if (!user?.id) return;
    const currentId = storyViewer?.authorId;
    if (!currentId) {
      setStoryViewer(null);
      await refreshStories();
      return;
    }
    const order = storyBuckets.map((b) => b.userId);
    const idx = order.findIndex((id) => String(id) === String(currentId));
    if (idx === -1 || idx >= order.length - 1) {
      setStoryViewer(null);
      await refreshStories();
      return;
    }
    await openStoryAuthor(order[idx + 1]);
    await refreshStories();
  }, [user?.id, storyViewer?.authorId, storyBuckets, openStoryAuthor, refreshStories]);

  useEffect(() => {
    if (session !== 'in' || !user?.id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [f, roomsRes, s, c, inc, un] = await Promise.all([
          api('/api/feed', { userId: user.id }),
          api('/api/rooms', { userId: user.id }),
          api('/api/stories', { userId: user.id }),
          api('/api/chats', { userId: user.id }),
          api('/api/friends/requests/incoming', { userId: user.id }),
          api('/api/chats/unread-total', { userId: user.id }),
        ]);
        if (cancelled) return;
        setFeed(f.ok ? f.data.posts || [] : []);
        setChats(c.ok ? c.data.chats || [] : []);
        setPendingFriendCount(inc.ok ? (inc.data.requests || []).length : 0);
        setChatUnreadTotal(un.ok ? un.data.total ?? 0 : 0);
        setRooms(roomsRes.ok ? roomsRes.data.rooms || [] : []);
        setStoryBuckets(s.ok ? s.data.buckets || [] : []);
        setLoadError(null);
      } catch (e) {
        if (!cancelled) setLoadError(String(e.message));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, user?.id]);

  const wsEnabled = session === 'in' && Boolean(user?.id);
  const wsUserId = useMemo(() => user?.id || '', [user?.id]);
  const { status: wsStatus, send, lastEvent } = useWebSocket(null, { userId: wsUserId, enabled: wsEnabled });

  useEffect(() => {
    openChatRef.current = openChat;
  }, [openChat]);

  useEffect(() => {
    openRoomChatRef.current = openRoomChat;
  }, [openRoomChat]);

  useEffect(() => {
    const up = () => setNetworkOnline(true);
    const down = () => setNetworkOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    if (!lastEvent?.type || session !== 'in' || !user?.id) return;
    if (lastEvent.type === 'friendRequest:new') {
      const p = lastEvent.payload;
      const fu = p?.fromUser;
      const em = fu?.affiliationEmoji ? ` ${fu.affiliationEmoji}` : '';
      const label = fu?.nickname
        ? `@${fu.nickname}${em}`
        : [fu?.firstName, fu?.lastName].filter(Boolean).join(' ').trim() || 'Кто-то';
      showBrowserNotification('Заявка в друзья', `${label} хочет добавить вас в друзья`, {
        tag: `friend-${p?.requestId || 'req'}`,
      });
      return;
    }
    if (lastEvent.type === 'chat:message:new') {
      const p = lastEvent.payload;
      const msg = p?.message;
      const chatId = p?.chatId;
      if (!msg || String(msg.senderId) === String(user.id)) return;
      const viewing =
        openChatRef.current &&
        String(openChatRef.current.id) === String(chatId) &&
        document.visibilityState === 'visible';
      if (viewing) return;
      const em = msg.senderAffiliationEmoji ? ` ${msg.senderAffiliationEmoji}` : '';
      const title = msg.senderNickname ? `@${msg.senderNickname}${em}` : 'Новое сообщение';
      const body = previewTextForChatMessage(msg);
      showBrowserNotification(title, body, { tag: `chat-${chatId}-${msg.id}` });
    }
    if (lastEvent.type === 'room:message:new') {
      const p = lastEvent.payload;
      const msg = p?.message;
      const roomId = p?.roomId;
      if (!msg || String(msg.senderId) === String(user.id)) return;
      const viewing =
        openRoomChatRef.current &&
        String(openRoomChatRef.current.id) === String(roomId) &&
        document.visibilityState === 'visible';
      if (viewing) return;
      const roomName = rooms.find((r) => String(r.id) === String(roomId))?.name;
      const title = roomName ? `# ${roomName}` : 'Комната';
      const emR = msg.senderAffiliationEmoji ? ` ${msg.senderAffiliationEmoji}` : '';
      const who = msg.senderNickname ? `@${msg.senderNickname}${emR}` : 'Кто-то';
      const body = `${who}: ${previewTextForChatMessage(msg)}`;
      showBrowserNotification(title, body, { tag: `room-${roomId}-${msg.id}` });
    }
  }, [lastEvent, session, user?.id, rooms]);

  useEffect(() => {
    if (!lastEvent?.type) return;
    if (
      lastEvent.type === 'friendRequest:new' ||
      lastEvent.type === 'friendRequest:accepted' ||
      lastEvent.type === 'chat:message:new' ||
      lastEvent.type === 'chat:message:updated' ||
      lastEvent.type === 'chat:message:reaction' ||
      lastEvent.type === 'room:message:new' ||
      lastEvent.type === 'room:message:updated' ||
      lastEvent.type === 'room:message:reaction'
    ) {
      refreshSocial();
    }
    if (lastEvent.type === 'friendRequest:accepted') {
      refreshFeed();
      refreshStories();
    }
    if (lastEvent.type === 'feed:new' || lastEvent.type === 'feed:changed') refreshFeed();
    if (lastEvent.type === 'stories:new') refreshStories();
  }, [lastEvent, refreshSocial, refreshFeed, refreshStories]);

  const storyRefreshTimerRef = useRef(null);
  const onStoryProgress = useCallback(
    (payload) => {
      send('story:progress', {
        storyId: payload.authorId,
        itemId: payload.itemId,
        index: payload.index,
        total: payload.total,
      });
      if (!user?.id || !payload?.itemId) return;
      void (async () => {
        await api('/api/stories/view', {
          method: 'POST',
          body: { storyId: payload.itemId },
          userId: user.id,
        });
        window.clearTimeout(storyRefreshTimerRef.current);
        storyRefreshTimerRef.current = window.setTimeout(() => refreshStories(), 400);
      })();
    },
    [send, user?.id, refreshStories]
  );

  const onAuthSuccess = useCallback((u) => {
    setUser(u);
    setSession('in');
    setNav('home');
  }, []);

  const onLogout = useCallback(() => {
    clearStoredUser();
    setUser(null);
    setSession('out');
    setNav('home');
    setOpenChat(null);
    setOpenRoomChat(null);
    setStoryViewer(null);
    setStoryCreateOpen(false);
    setArchiveOpen(false);
    setPeerProfileUserId(null);
  }, []);

  const handleOpenChat = useCallback((chat) => {
    setOpenRoomChat(null);
    setOpenChat({
      id: chat.id,
      name: chat.name,
      peerUserId: chat.peerUserId,
      peerAvatarUrl: chat.peerAvatarUrl ?? null,
      friendsActive: chat.friendsActive !== false,
      canMessage: chat.canMessage !== false,
    });
  }, []);

  const syncOpenChatFromServer = useCallback(async () => {
    if (!user?.id) return;
    const r = await api('/api/chats', { userId: user.id });
    if (!r.ok) return;
    setOpenChat((prev) => {
      if (!prev) return prev;
      const c = (r.data.chats || []).find((x) => String(x.id) === String(prev.id));
      if (!c) return prev;
      return {
        ...prev,
        name: c.name ?? prev.name,
        friendsActive: c.friendsActive !== false,
        canMessage: c.canMessage !== false,
      };
    });
  }, [user?.id]);

  const handleOpenRoom = useCallback((room) => {
    setOpenChat(null);
    setOpenRoomChat({ id: room.id, title: room.name });
  }, []);

  if (session === 'checking') {
    return (
      <div
        className="app-shell"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p className="muted" style={{ fontSize: 12 }}>
          Проверка учётной записи…
        </p>
      </div>
    );
  }

  if (session === 'verify-error') {
    return (
      <div
        className="app-shell"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <p style={{ margin: '0 0 8px', fontSize: 13 }}>Не удалось связаться с сервером</p>
        <p className="muted" style={{ margin: '0 0 16px', fontSize: 11 }}>
          Проверка по базе данных недоступна. Повторите, когда сервер будет доступен.
        </p>
        <button type="button" className="btn-primary" style={{ maxWidth: 280 }} onClick={() => verifySession()}>
          Повторить
        </button>
      </div>
    );
  }

  if (session === 'out') {
    return <AuthScreen onAuthSuccess={onAuthSuccess} />;
  }

  const showMainChrome = !openChat && !openRoomChat;

  return (
    <div className="app-shell">
      {showMainChrome && (
        <Header
          userId={user.id}
          onSocialChanged={refreshSocial}
          onOpenAppStatus={() => setAppStatusOpen(true)}
          onOpenPossibleFriends={() => setPossibleFriendsOpen(true)}
          onOpenSettings={() => setMenuStub('settings')}
          onOpenPrivacy={() => setMenuStub('privacy')}
          onOpenSecurity={() => setMenuStub('security')}
        />
      )}

      {showMainChrome && loadError ? (
        <div style={{ padding: '6px 14px 0' }}>
          <span className="muted" style={{ fontSize: 10 }}>
            {loadError}
          </span>
        </div>
      ) : null}

      {nav === 'home' && showMainChrome && (
        <>
          <StoriesBar
            user={user}
            buckets={storyBuckets}
            onAddStory={() => setStoryCreateOpen(true)}
            onOpenAuthor={openStoryAuthor}
          />
          <Dashboard
            chats={chats}
            rooms={rooms}
            onOpenChat={handleOpenChat}
            onCreateRoom={() => setCreateRoomOpen(true)}
            onOpenRoom={handleOpenRoom}
          />
          <Feed posts={feed} userId={user.id} onPosted={refreshFeed} />
        </>
      )}

      {nav === 'chats' && showMainChrome && (
        <section style={{ padding: '8px 12px 16px' }}>
          <Dashboard chats={chats} rooms={[]} singleColumn="chats" onOpenChat={handleOpenChat} />
        </section>
      )}

      {nav === 'rooms' && showMainChrome && (
        <section style={{ padding: '8px 12px 16px' }}>
          <Dashboard
            chats={[]}
            rooms={rooms}
            singleColumn="rooms"
            onCreateRoom={() => setCreateRoomOpen(true)}
            onOpenRoom={handleOpenRoom}
          />
        </section>
      )}

      {nav === 'profile' && showMainChrome && (
        <ProfileScreen
          user={user}
          onLogout={onLogout}
          socialTick={socialTick}
          onFriendsChanged={onFriendsChanged}
          onUserUpdated={(u) => setUser(u)}
          onOpenArchive={() => setArchiveOpen(true)}
        />
      )}

      {openChat && (
        <DirectChatScreen
          userId={user.id}
          chatId={openChat.id}
          peerLabel={openChat.name}
          peerNickname={openChat.peerNickname}
          peerAffiliationEmoji={openChat.peerAffiliationEmoji}
          peerUserId={openChat.peerUserId}
          peerAvatarUrl={openChat.peerAvatarUrl}
          canMessage={openChat.canMessage !== false}
          friendsActive={openChat.friendsActive !== false}
          onClose={() => setOpenChat(null)}
          lastEvent={lastEvent}
          onAfterChange={refreshSocial}
          onOpenPeerProfile={() => setPeerProfileUserId(openChat.peerUserId)}
          onOpenProfileByUserId={(id) => setPeerProfileUserId(id)}
        />
      )}

      {openRoomChat && (
        <RoomChatScreen
          userId={user.id}
          roomId={openRoomChat.id}
          roomTitle={openRoomChat.title}
          onClose={() => setOpenRoomChat(null)}
          lastEvent={lastEvent}
          onAfterChange={refreshSocial}
          onOpenRoomInfo={() => setRoomDetailId(openRoomChat.id)}
          onOpenProfileByUserId={(id) => setPeerProfileUserId(id)}
        />
      )}

      {storyViewer && (
        <StoryViewer
          story={storyViewer}
          userId={user?.id}
          onClose={() => {
            setStoryViewer(null);
            refreshStories();
          }}
          onAfterLastItem={() => void goToNextStoryAuthor()}
          onProgress={onStoryProgress}
        />
      )}
      {storyCreateOpen && (
        <StoryCreateModal
          userId={user.id}
          onClose={() => setStoryCreateOpen(false)}
          onCreated={refreshStories}
        />
      )}
      {archiveOpen && <StoriesArchiveModal userId={user.id} onClose={() => setArchiveOpen(false)} />}
      {appStatusOpen && (
        <AppStatusModal
          onClose={() => setAppStatusOpen(false)}
          wsStatus={wsStatus}
          networkOnline={networkOnline}
          loadError={loadError}
        />
      )}
      {menuStub === 'settings' ? (
        <SettingsModal
          open
          onClose={() => setMenuStub(null)}
          notificationsEnabled={notificationsEnabled}
          onNotificationsEnabledChange={(v) => {
            setNotificationsEnabled(v);
            saveNotificationsEnabled(v);
            setAppNotificationsEnabled(v);
          }}
          theme={appTheme}
          onThemeChange={(t) => {
            setAppTheme(t);
            saveTheme(t);
            applyThemeToDocument(t);
          }}
        />
      ) : menuStub ? (
        <StubMenuModal
          open
          onClose={() => setMenuStub(null)}
          title={menuStub === 'privacy' ? 'Конфиденциальность' : 'Безопасность'}
        >
          {menuStub === 'privacy'
            ? 'Здесь будут параметры конфиденциальности: кто видит профиль, истории и статус.'
            : 'Здесь будут параметры безопасности: сессии, пароль и двухфакторная аутентификация.'}
        </StubMenuModal>
      ) : null}
      {possibleFriendsOpen && user?.id ? (
        <PossibleFriendsModal
          open
          userId={user.id}
          onClose={() => setPossibleFriendsOpen(false)}
          onFriendsChanged={onFriendsChanged}
        />
      ) : null}
      {createRoomOpen ? (
        <CreateRoomModal
          userId={user.id}
          open
          onClose={() => setCreateRoomOpen(false)}
          onCreated={() => {
            void refreshSocial();
          }}
        />
      ) : null}
      {roomDetailId ? (
        <RoomDetailModal
          userId={user.id}
          roomId={roomDetailId}
          onClose={() => setRoomDetailId(null)}
          onRoomUpdated={(r) => {
            void refreshSocial();
            setOpenRoomChat((prev) =>
              prev && String(prev.id) === String(r.id) ? { ...prev, title: r.title } : prev,
            );
          }}
        />
      ) : null}
      {peerProfileUserId && (
        <FriendProfileSheet
          targetUserId={peerProfileUserId}
          viewerId={user.id}
          onClose={() => setPeerProfileUserId(null)}
          onFriendshipChanged={async () => {
            await onFriendsChanged();
            await syncOpenChatFromServer();
          }}
        />
      )}

      {showMainChrome && (
        <BottomNav
          active={nav}
          onChange={setNav}
          profileFriendRequests={pendingFriendCount}
          chatUnread={chatUnreadTotal}
        />
      )}
    </div>
  );
}

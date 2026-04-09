import { useEffect, useState, useCallback, useMemo } from 'react';
import Header from './components/Header.jsx';
import StoriesBar from './components/StoriesBar.jsx';
import Dashboard from './components/Dashboard.jsx';
import Feed from './components/Feed.jsx';
import BottomNav from './components/BottomNav.jsx';
import ProfileScreen from './components/ProfileScreen.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import DirectChatScreen from './components/DirectChatScreen.jsx';
import StoryViewer from './components/StoryViewer.jsx';
import StoryCreateModal from './components/StoryCreateModal.jsx';
import StoriesArchiveModal from './components/StoriesArchiveModal.jsx';
import FriendProfileSheet from './components/FriendProfileSheet.jsx';
import { useWebSocket } from './hooks/useWebSocket.js';
import { getStoredUser, setStoredUser, clearStoredUser } from './authStorage.js';
import { api } from './api.js';

async function fetchJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}

function wsStatusRu(status) {
  switch (status) {
    case 'idle':
      return 'ожидание';
    case 'connecting':
      return 'подключение…';
    case 'open':
      return 'онлайн';
    case 'closed':
      return 'нет соединения';
    default:
      return status;
  }
}

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
  const [storyViewer, setStoryViewer] = useState(null);
  const [storyCreateOpen, setStoryCreateOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [peerProfileUserId, setPeerProfileUserId] = useState(null);

  const verifySession = useCallback(async () => {
    setSession('checking');
    const stored = getStoredUser();
    if (!stored?.id) {
      setUser(null);
      setSession('out');
      return;
    }
    try {
      const r = await fetch(`/api/auth/user/${encodeURIComponent(stored.id)}`);
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
    const [c, inc, un] = await Promise.all([
      api('/api/chats', { userId: user.id }),
      api('/api/friends/requests/incoming', { userId: user.id }),
      api('/api/chats/unread-total', { userId: user.id }),
    ]);
    if (c.ok) setChats(c.data.chats || []);
    if (inc.ok) setPendingFriendCount((inc.data.requests || []).length);
    if (un.ok) setChatUnreadTotal(un.data.total ?? 0);
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

  const openStoryAuthor = useCallback(
    async (authorId) => {
      if (!user?.id) return;
      const r = await api(`/api/stories/author/${encodeURIComponent(authorId)}`, { userId: user.id });
      if (!r.ok) return;
      const items = r.data.items || [];
      if (items.length === 0) return;
      const b = storyBuckets.find((x) => x.userId === authorId);
      setStoryViewer({
        authorId,
        label: b?.label || 'История',
        avatarUrl: b?.avatarUrl,
        items,
      });
    },
    [user?.id, storyBuckets]
  );

  useEffect(() => {
    if (session !== 'in' || !user?.id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [f, roomsRes, s, c, inc, un] = await Promise.all([
          api('/api/feed', { userId: user.id }),
          fetchJson('/api/rooms'),
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
        setRooms(roomsRes.rooms || []);
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
    if (!lastEvent?.type) return;
    if (
      lastEvent.type === 'friendRequest:new' ||
      lastEvent.type === 'friendRequest:accepted' ||
      lastEvent.type === 'chat:message:new'
    ) {
      refreshSocial();
    }
    if (lastEvent.type === 'friendRequest:accepted') {
      refreshFeed();
      refreshStories();
    }
    if (lastEvent.type === 'feed:new') refreshFeed();
    if (lastEvent.type === 'stories:new') refreshStories();
  }, [lastEvent, refreshSocial, refreshFeed, refreshStories]);

  const onStoryProgress = useCallback(
    (payload) => {
      send('story:progress', payload);
    },
    [send]
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
    setStoryViewer(null);
    setStoryCreateOpen(false);
    setArchiveOpen(false);
    setPeerProfileUserId(null);
  }, []);

  const handleOpenChat = useCallback((chat) => {
    setOpenChat({
      id: chat.id,
      name: chat.name,
      peerUserId: chat.peerUserId,
      peerAvatarUrl: chat.peerAvatarUrl ?? null,
    });
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

  return (
    <div className="app-shell">
      {!openChat && <Header userId={user.id} onSocialChanged={refreshSocial} />}

      {!openChat && (
        <div style={{ padding: '4px 14px 0', fontSize: 10 }} className="muted">
          связь: {wsStatusRu(wsStatus)}
          {loadError ? ` · ${loadError}` : ''}
        </div>
      )}

      {nav === 'home' && !openChat && (
        <>
          <StoriesBar
            user={user}
            buckets={storyBuckets}
            onAddStory={() => setStoryCreateOpen(true)}
            onOpenAuthor={openStoryAuthor}
            onOpenArchive={() => setArchiveOpen(true)}
          />
          <Dashboard chats={chats} rooms={rooms} onOpenChat={handleOpenChat} />
          <Feed posts={feed} userId={user.id} onPosted={refreshFeed} />
        </>
      )}

      {nav === 'chats' && !openChat && (
        <section style={{ padding: '8px 12px 16px' }}>
          <Dashboard chats={chats} rooms={[]} singleColumn="chats" onOpenChat={handleOpenChat} />
        </section>
      )}

      {nav === 'rooms' && !openChat && (
        <section style={{ padding: '8px 12px 16px' }}>
          <Dashboard chats={[]} rooms={rooms} singleColumn="rooms" />
        </section>
      )}

      {nav === 'create' && !openChat && (
        <section style={{ padding: 16 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Создать</h2>
        </section>
      )}

      {nav === 'profile' && !openChat && (
        <ProfileScreen
          user={user}
          onLogout={onLogout}
          socialTick={socialTick}
          onFriendsChanged={refreshSocial}
          onUserUpdated={(u) => setUser(u)}
        />
      )}

      {openChat && (
        <DirectChatScreen
          userId={user.id}
          chatId={openChat.id}
          peerLabel={openChat.name}
          peerUserId={openChat.peerUserId}
          peerAvatarUrl={openChat.peerAvatarUrl}
          onClose={() => setOpenChat(null)}
          lastEvent={lastEvent}
          onAfterChange={refreshSocial}
          onOpenPeerProfile={() => setPeerProfileUserId(openChat.peerUserId)}
        />
      )}

      {storyViewer && (
        <StoryViewer story={storyViewer} onClose={() => setStoryViewer(null)} onProgress={onStoryProgress} />
      )}
      {storyCreateOpen && (
        <StoryCreateModal
          userId={user.id}
          onClose={() => setStoryCreateOpen(false)}
          onCreated={refreshStories}
        />
      )}
      {archiveOpen && <StoriesArchiveModal userId={user.id} onClose={() => setArchiveOpen(false)} />}
      {peerProfileUserId && (
        <FriendProfileSheet
          targetUserId={peerProfileUserId}
          viewerId={user.id}
          onClose={() => setPeerProfileUserId(null)}
        />
      )}

      {!openChat && (
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

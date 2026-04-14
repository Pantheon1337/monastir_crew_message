import { useState, useCallback, useEffect } from 'react';
import { api } from '../../api.js';
import { normalizeChatMessage } from '../../chat/chatPrimitives.js';
import { loadDirectThreadCache, saveDirectThreadCache } from '../../chatThreadCache.js';

/**
 * Лента личного чата: загрузка истории, пагинация вверх, синхронизация по WebSocket.
 * Без UI; scrollRef нужен для сохранения позиции при подгрузке старых сообщений.
 */
export function useDirectChatMessageChannel({
  chatId,
  userId,
  lastEvent,
  onAfterChange,
  scrollRef,
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const cached = loadDirectThreadCache(userId, chatId);
    setMessages(cached?.length ? cached.map(normalizeChatMessage) : []);
    const { ok, data } = await api(
      `/api/chats/${encodeURIComponent(chatId)}/messages?limit=200`,
      { userId },
    );
    if (!ok) {
      setErr(data?.error || 'Не удалось загрузить чат');
      setLoading(false);
      return;
    }
    const raw = data.messages || [];
    setMessages(raw.map(normalizeChatMessage));
    setHasMoreOlder(data.hasMore === true);
    saveDirectThreadCache(userId, chatId, raw);
    setErr(null);
    setLoading(false);
  }, [chatId, userId]);

  const loadOlder = useCallback(async () => {
    if (!chatId || !userId || loadingOlder || !hasMoreOlder) return;
    const oldest = messages[0];
    if (!oldest?.id || oldest.createdAt == null) return;
    const el = scrollRef?.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    const prevScrollTop = el?.scrollTop ?? 0;
    setLoadingOlder(true);
    try {
      const q = new URLSearchParams({
        limit: '100',
        beforeCreatedAt: String(oldest.createdAt),
        beforeId: String(oldest.id),
      });
      const { ok, data } = await api(
        `/api/chats/${encodeURIComponent(chatId)}/messages?${q.toString()}`,
        { userId },
      );
      if (!ok) return;
      const raw = data.messages || [];
      const batch = raw.map(normalizeChatMessage);
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const merged = [...batch.filter((m) => m.id && !seen.has(m.id)), ...prev];
        return merged;
      });
      setHasMoreOlder(data.hasMore === true);
      requestAnimationFrame(() => {
        const root = scrollRef?.current;
        if (!root) return;
        const h = root.scrollHeight - prevScrollHeight;
        root.scrollTop = prevScrollTop + h;
      });
    } finally {
      setLoadingOlder(false);
    }
  }, [chatId, userId, loadingOlder, hasMoreOlder, messages, scrollRef]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!chatId || !userId) return undefined;
    let cancelled = false;
    (async () => {
      await api(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST', userId });
      if (!cancelled) onAfterChange?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, userId, onAfterChange]);

  useEffect(() => {
    if (lastEvent?.type !== 'chat:message:new') return;
    if (lastEvent.payload?.chatId !== chatId) return;
    const m = normalizeChatMessage(lastEvent.payload?.message);
    if (!m?.id) return;
    setMessages((prev) => {
      if (prev.some((x) => x.id === m.id)) return prev;
      return [...prev, m];
    });
    (async () => {
      await api(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST', userId });
      onAfterChange?.();
    })();
  }, [lastEvent, chatId, userId, onAfterChange]);

  useEffect(() => {
    if (lastEvent?.type !== 'chat:peerRead') return;
    if (lastEvent.payload?.chatId !== chatId) return;
    const readAt = lastEvent.payload.readAt;
    if (readAt == null) return;
    setMessages((prev) =>
      prev.map((msg) =>
        msg.senderId === userId && (msg.createdAt ?? 0) <= readAt
          ? { ...msg, readByPeer: true, deliveredToPeer: true }
          : msg,
      ),
    );
  }, [lastEvent, chatId, userId]);

  useEffect(() => {
    if (lastEvent?.type !== 'chat:message:delivered') return;
    if (lastEvent.payload?.chatId !== chatId) return;
    const messageId = lastEvent.payload?.messageId;
    if (!messageId) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.senderId === userId ? { ...m, deliveredToPeer: true } : m,
      ),
    );
  }, [lastEvent, chatId, userId]);

  useEffect(() => {
    if (lastEvent?.type !== 'chat:messages:delivered') return;
    if (lastEvent.payload?.chatId !== chatId) return;
    const ids = lastEvent.payload?.messageIds;
    if (!Array.isArray(ids) || ids.length === 0) return;
    const idSet = new Set(ids);
    setMessages((prev) =>
      prev.map((m) =>
        idSet.has(m.id) && m.senderId === userId ? { ...m, deliveredToPeer: true } : m,
      ),
    );
  }, [lastEvent, chatId, userId]);

  useEffect(() => {
    if (lastEvent?.type !== 'chat:message:reaction') return;
    if (lastEvent.payload?.chatId !== chatId) return;
    const { messageId, reactions } = lastEvent.payload || {};
    if (!messageId || !reactions) return;
    setMessages((prev) => prev.map((x) => (x.id === messageId ? { ...x, reactions } : x)));
  }, [lastEvent, chatId]);

  useEffect(() => {
    if (lastEvent?.type !== 'chat:message:updated') return;
    if (lastEvent.payload?.chatId !== chatId) return;
    const m = normalizeChatMessage(lastEvent.payload?.message);
    if (!m?.id) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
    onAfterChange?.();
  }, [lastEvent, chatId, onAfterChange]);

  useEffect(() => {
    if (lastEvent?.type !== 'chat:pinsChanged') return;
    if (lastEvent.payload?.chatId !== chatId) return;
    void load();
  }, [lastEvent, chatId, load]);

  const appendMessage = useCallback((m) => {
    const row = normalizeChatMessage(m);
    setMessages((prev) => {
      if (prev.some((x) => x.id === row.id)) return prev;
      return [...prev, row];
    });
  }, []);

  const handleReactionLocalUpdate = useCallback((id, reactions) => {
    setMessages((prev) => prev.map((x) => (x.id === id ? { ...x, reactions } : x)));
  }, []);

  return {
    messages,
    setMessages,
    loading,
    err,
    setErr,
    hasMoreOlder,
    loadingOlder,
    load,
    loadOlder,
    appendMessage,
    handleReactionLocalUpdate,
  };
}

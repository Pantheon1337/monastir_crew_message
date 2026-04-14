import { useState, useCallback, useEffect } from 'react';
import { api } from '../../api.js';
import { normalizeChatMessage } from '../../chat/chatPrimitives.js';
import { loadRoomThreadCache, saveRoomThreadCache } from '../../chatThreadCache.js';

/**
 * Лента группового чата: история, пагинация, WS (room:message:*).
 */
export function useRoomChatMessageChannel({
  roomId,
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
    const cached = loadRoomThreadCache(userId, roomId);
    setMessages(cached?.length ? cached.map(normalizeChatMessage) : []);
    const { ok, data } = await api(`/api/rooms/${encodeURIComponent(roomId)}/messages?limit=200`, { userId });
    if (!ok) {
      setErr(data?.error || 'Не удалось загрузить чат');
      setLoading(false);
      return;
    }
    const raw = data.messages || [];
    setMessages(raw.map(normalizeChatMessage));
    setHasMoreOlder(data.hasMore === true);
    saveRoomThreadCache(userId, roomId, raw);
    setErr(null);
    setLoading(false);
  }, [roomId, userId]);

  const loadOlder = useCallback(async () => {
    if (!roomId || !userId || loadingOlder || !hasMoreOlder) return;
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
      const { ok, data } = await api(`/api/rooms/${encodeURIComponent(roomId)}/messages?${q.toString()}`, {
        userId,
      });
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
  }, [roomId, userId, loadingOlder, hasMoreOlder, messages, scrollRef]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!roomId || !userId) return undefined;
    let cancelled = false;
    (async () => {
      await api(`/api/rooms/${encodeURIComponent(roomId)}/read`, { method: 'POST', userId });
      if (!cancelled) onAfterChange?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, userId, onAfterChange]);

  useEffect(() => {
    if (lastEvent?.type !== 'room:message:new') return;
    if (lastEvent.payload?.roomId !== roomId) return;
    const m = normalizeChatMessage(lastEvent.payload?.message);
    if (!m?.id) return;
    setMessages((prev) => {
      if (prev.some((x) => x.id === m.id)) return prev;
      return [...prev, m];
    });
    (async () => {
      await api(`/api/rooms/${encodeURIComponent(roomId)}/read`, { method: 'POST', userId });
      onAfterChange?.();
    })();
  }, [lastEvent, roomId, userId, onAfterChange]);

  useEffect(() => {
    if (lastEvent?.type !== 'room:message:reaction') return;
    if (lastEvent.payload?.roomId !== roomId) return;
    const { messageId, reactions } = lastEvent.payload || {};
    if (!messageId || !reactions) return;
    setMessages((prev) => prev.map((x) => (x.id === messageId ? { ...x, reactions } : x)));
  }, [lastEvent, roomId]);

  useEffect(() => {
    if (lastEvent?.type !== 'room:message:updated') return;
    if (lastEvent.payload?.roomId !== roomId) return;
    const m = normalizeChatMessage(lastEvent.payload?.message);
    if (!m?.id) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
    onAfterChange?.();
  }, [lastEvent, roomId, onAfterChange]);

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

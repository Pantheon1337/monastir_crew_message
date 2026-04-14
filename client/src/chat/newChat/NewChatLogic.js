import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { normalizeChatMessage } from '../chatPrimitives.js';

export function newClientMessageId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Поток «Избранное» (чат с собой) для экспериментального UI: загрузка, отправка текста, события сокета.
 */
export function useNewChatSelfThread({ userId, lastEvent, onAfterChange }) {
  const [chatId, setChatId] = useState(null);
  const [resolveErr, setResolveErr] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendErr, setSendErr] = useState(null);
  const [text, setText] = useState('');
  const scrollRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  /** Найти id чата «Избранное» */
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setResolveErr(null);
      const { ok, data } = await api('/api/chats', { userId });
      if (cancelled) return;
      if (!ok) {
        setResolveErr(data?.error || 'Не удалось загрузить чаты');
        setLoading(false);
        return;
      }
      const list = data.chats || [];
      const saved = list.find((c) => c.isSavedMessages === true);
      if (!saved?.id) {
        setResolveErr('Чат «Избранное» не найден. Откройте вкладку «Чаты» один раз.');
        setLoading(false);
        return;
      }
      setChatId(saved.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loadMessages = useCallback(async () => {
    if (!userId || !chatId) return;
    setLoading(true);
    const { ok, data } = await api(`/api/chats/${encodeURIComponent(chatId)}/messages?limit=200`, { userId });
    if (!ok) {
      setSendErr(data?.error || 'Не удалось загрузить сообщения');
      setLoading(false);
      return;
    }
    const raw = data.messages || [];
    setMessages(raw.map(normalizeChatMessage));
    setLoading(false);
    queueMicrotask(scrollToBottom);
    void api(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST', userId }).then(() => {
      onAfterChange?.();
    });
  }, [userId, chatId, scrollToBottom, onAfterChange]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const appendMessage = useCallback((m) => {
    const row = normalizeChatMessage(m);
    setMessages((prev) => {
      if (prev.some((x) => x.id === row.id)) return prev;
      return [...prev, row];
    });
    queueMicrotask(scrollToBottom);
  }, [scrollToBottom]);

  useEffect(() => {
    if (lastEvent?.type !== 'chat:message:new') return;
    if (lastEvent.payload?.chatId !== chatId) return;
    const m = normalizeChatMessage(lastEvent.payload?.message);
    setMessages((prev) => {
      if (prev.some((x) => x.id === m.id)) return prev;
      return [...prev, m];
    });
    queueMicrotask(scrollToBottom);
  }, [lastEvent, chatId, scrollToBottom]);

  useEffect(() => {
    if (lastEvent?.type !== 'chat:message:updated') return;
    if (lastEvent.payload?.chatId !== chatId) return;
    const m = normalizeChatMessage(lastEvent.payload?.message);
    setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
  }, [lastEvent, chatId]);

  const sendText = useCallback(async () => {
    if (!userId || !chatId) return;
    const t = text.trim();
    if (!t) return;
    setSendErr(null);
    const { ok, data } = await api(`/api/chats/${encodeURIComponent(chatId)}/messages`, {
      method: 'POST',
      body: { body: t, clientMessageId: newClientMessageId() },
      userId,
    });
    if (!ok) {
      setSendErr(data?.error || 'Не отправлено');
      return;
    }
    setText('');
    appendMessage(data.message);
    void api(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST', userId }).then(() => {
      onAfterChange?.();
    });
  }, [userId, chatId, text, appendMessage, onAfterChange]);

  return {
    chatId,
    resolveErr,
    messages,
    loading,
    sendErr,
    text,
    setText,
    sendText,
    scrollRef,
    messagesEndRef,
    reload: loadMessages,
  };
}

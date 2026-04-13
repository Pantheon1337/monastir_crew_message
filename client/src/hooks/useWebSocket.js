import { useEffect, useRef, useState, useCallback } from 'react';

const DEFAULT_WS = 'ws://localhost:3001/ws';

function buildDefaultWsUrl(userId) {
  const q = `?userId=${encodeURIComponent(userId)}`;
  if (import.meta.env.VITE_WS_URL) {
    const base = String(import.meta.env.VITE_WS_URL).replace(/\/?$/, '');
    return `${base}${q}`;
  }
  if (import.meta.env.VITE_API_ORIGIN) {
    try {
      const u = new URL(String(import.meta.env.VITE_API_ORIGIN));
      const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${u.host}/ws${q}`;
    } catch {
      /* fall through */
    }
  }
  if (typeof window !== 'undefined' && window.location?.host) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws${q}`;
  }
  return `${DEFAULT_WS}${q}`;
}

/**
 * Лёгкая обёртка над нативным WebSocket: переподключение и JSON-сообщения.
 * @param enabled — если false, соединение не открывается (до авторизации).
 */
const RECONNECT_BASE_MS = 900;
const RECONNECT_MAX_MS = 60_000;

export function useWebSocket(url, { userId = 'demo-user', enabled = true } = {}) {
  const [status, setStatus] = useState('idle');
  const [lastEvent, setLastEvent] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const reconnectAttempt = useRef(0);

  const wsUrl = url || buildDefaultWsUrl(userId);

  const send = useCallback((type, payload) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type, payload }));
  }, []);

  useEffect(() => {
    if (!enabled || !userId) {
      setStatus('idle');
      return undefined;
    }

    let stopped = false;

    function scheduleReconnect() {
      if (stopped) return;
      reconnectAttempt.current += 1;
      const n = reconnectAttempt.current;
      const exp = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(n - 1, 12));
      const jitter = Math.floor(Math.random() * Math.min(1200, exp * 0.35));
      reconnectTimer.current = window.setTimeout(connect, exp + jitter);
    }

    function connect() {
      if (stopped) return;
      setStatus('connecting');
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        reconnectAttempt.current = 0;
        setStatus('open');
      };
      socket.onclose = () => {
        setStatus('closed');
        wsRef.current = null;
        if (!stopped) scheduleReconnect();
      };
      socket.onerror = () => socket.close();
      socket.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          setLastEvent(data);
        } catch {
          /* ignore */
        }
      };
    }

    reconnectAttempt.current = 0;
    connect();

    const ping = window.setInterval(() => {
      send('ping', {});
    }, 25000);

    return () => {
      stopped = true;
      window.clearInterval(ping);
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
      reconnectAttempt.current = 0;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [wsUrl, send, enabled, userId]);

  return { status, lastEvent, send };
}

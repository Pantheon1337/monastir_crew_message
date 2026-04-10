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
export function useWebSocket(url, { userId = 'demo-user', enabled = true } = {}) {
  const [status, setStatus] = useState(enabled ? 'idle' : 'idle');
  const [lastEvent, setLastEvent] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

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

    function connect() {
      if (stopped) return;
      setStatus('connecting');
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => setStatus('open');
      socket.onclose = () => {
        setStatus('closed');
        wsRef.current = null;
        if (!stopped) {
          reconnectTimer.current = window.setTimeout(connect, 2000);
        }
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

    connect();

    const ping = window.setInterval(() => {
      send('ping', {});
    }, 25000);

    return () => {
      stopped = true;
      window.clearInterval(ping);
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [wsUrl, send, enabled, userId]);

  return { status, lastEvent, send };
}

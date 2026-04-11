import { useEffect, useState, useRef, useCallback } from 'react';
import { apiPath } from '../api.js';
import UserAvatar from './UserAvatar.jsx';
import NicknameWithBadge from './NicknameWithBadge.jsx';

function searchQueryReady(raw) {
  const t = String(raw ?? '').trim();
  if (t.length === 0) return false;
  const digits = t.replace(/\D/g, '');
  if (digits.length >= 10) return true;
  return t.length >= 2;
}

/**
 * Поиск по каталогу: username, имя, фамилия, телефон (цифры).
 * Не дергаем API на один символ буквы; debounce + отмена предыдущего запроса.
 */
export default function SearchModal({ open, userId, onClose, onSelectUser }) {
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setInput('');
    setDebounced('');
    setUsers([]);
    setErr(null);
  }, [open]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(input), 280);
    return () => window.clearTimeout(t);
  }, [input]);

  const load = useCallback(async () => {
    if (!open || !userId) return;
    if (abortRef.current) {
      abortRef.current.abort();
    }
    if (!searchQueryReady(debounced)) {
      setUsers([]);
      setLoading(false);
      setErr(null);
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setErr(null);
    try {
      const url = apiPath(`/api/friends/directory?q=${encodeURIComponent(debounced.trim())}`);
      const r = await fetch(url, {
        signal: ac.signal,
        headers: userId ? { 'X-User-Id': userId } : {},
      });
      if (ac.signal.aborted) return;
      const text = await r.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { error: text };
      }
      if (!r.ok) {
        setErr(data?.error || 'Ошибка поиска');
        setUsers([]);
        return;
      }
      setUsers(data.users || []);
    } catch (e) {
      if (e.name === 'AbortError') return;
      setErr('Не удалось выполнить поиск');
      setUsers([]);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [open, userId, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Поиск"
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 110,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        padding: 0,
      }}
      onClick={onClose}
    >
      <div
        className="block modal-panel"
        style={{
          width: '100%',
          maxWidth: 480,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '100dvh',
          border: 'none',
          borderRadius: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 14px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <button type="button" className="icon-btn" style={{ width: 40, height: 40 }} onClick={onClose} aria-label="Закрыть">
            ‹
          </button>
          <input
            className="text-input"
            autoFocus
            placeholder="Имя, @username или телефон"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ flex: 1, minWidth: 0 }}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px 16px', WebkitOverflowScrolling: 'touch' }}>
          {!searchQueryReady(debounced) ? (
            <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
              Введите не меньше <strong style={{ color: 'var(--text)' }}>2 символов</strong> (имя или ник) или{' '}
              <strong style={{ color: 'var(--text)' }}>10+ цифр</strong> номера — так поиск не гоняет лишние запросы.
            </p>
          ) : loading ? (
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              Поиск…
            </p>
          ) : err ? (
            <p style={{ margin: 0, fontSize: 12, color: '#c45c5c' }}>{err}</p>
          ) : users.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              Никого не найдено
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {users.map((u) => (
                <li key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => onSelectUser?.(u)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      padding: '10px 4px',
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <UserAvatar src={u.avatarUrl} size={44} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[u.firstName, u.lastName].filter(Boolean).join(' ').trim() || '—'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {u.nickname ? (
                          <NicknameWithBadge nickname={u.nickname} affiliationEmoji={u.affiliationEmoji} />
                        ) : (
                          '—'
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

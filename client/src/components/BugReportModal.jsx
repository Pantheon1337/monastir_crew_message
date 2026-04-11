import { useState, useCallback } from 'react';
import { api } from '../api.js';

export default function BugReportModal({ userId, nav, onClose }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);

  const send = useCallback(async () => {
    if (!userId) return;
    const body = text.trim();
    if (body.length < 3) {
      setErr('Опишите проблему чуть подробнее');
      return;
    }
    setSending(true);
    setErr(null);
    let path = '';
    let viewportW;
    let viewportH;
    if (typeof window !== 'undefined') {
      path = window.location.pathname + window.location.search;
      viewportW = window.innerWidth;
      viewportH = window.innerHeight;
    }
    const { ok, data } = await api('/api/bugs', {
      method: 'POST',
      userId,
      body: { body, path, nav: nav || '', viewportW, viewportH },
    });
    setSending(false);
    if (!ok) {
      setErr(data?.error || 'Не удалось отправить');
      return;
    }
    setDone(true);
    window.setTimeout(() => {
      onClose?.();
    }, 1200);
  }, [userId, text, nav, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
      }}
      onClick={onClose}
    >
      <div
        className="block modal-panel"
        style={{
          width: '100%',
          maxWidth: 420,
          padding: 16,
          borderRadius: 'var(--radius)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Сообщить о баге</span>
          <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <p className="muted" style={{ fontSize: 11, margin: '0 0 12px', lineHeight: 1.45 }}>
          Опишите, что пошло не так. Сообщение уйдёт разработчику вместе с разделом приложения и размером окна.
        </p>
        {done ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--accent)' }}>Спасибо, отправлено.</p>
        ) : (
          <>
            <textarea
              className="text-input"
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Например: при открытии чата не грузятся сообщения…"
              style={{ width: '100%', resize: 'vertical', minHeight: 100, marginBottom: 10 }}
              maxLength={8000}
              disabled={sending}
            />
            {err ? (
              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#c45c5c' }}>{err}</p>
            ) : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-outline" onClick={onClose} disabled={sending}>
                Отмена
              </button>
              <button type="button" className="btn-primary" onClick={() => void send()} disabled={sending}>
                {sending ? 'Отправка…' : 'Отправить'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

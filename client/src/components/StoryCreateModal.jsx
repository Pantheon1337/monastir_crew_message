import { useState, useRef } from 'react';
import { api, apiUpload } from '../api.js';

export default function StoryCreateModal({ userId, onClose, onCreated }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  async function submitTextOnly(e) {
    e?.preventDefault();
    const t = text.trim();
    if (!t) {
      setErr('Введите текст');
      return;
    }
    setSaving(true);
    setErr(null);
    const { ok, data } = await api('/api/stories', { method: 'POST', body: { body: t }, userId });
    setSaving(false);
    if (!ok) {
      setErr(data?.error || 'Не сохранено');
      return;
    }
    onCreated?.();
    onClose();
  }

  async function submitWithFile() {
    const file = fileRef.current?.files?.[0];
    const t = text.trim();
    if (!file && !t) {
      setErr('Добавьте текст или фото');
      return;
    }
    if (file) {
      setSaving(true);
      setErr(null);
      const { ok, data } = await apiUpload('/api/stories/upload', {
        file,
        userId,
        fieldName: 'media',
        extraFields: { body: t },
      });
      setSaving(false);
      if (!ok) {
        setErr(data?.error || 'Не сохранено');
        return;
      }
      onCreated?.();
      onClose();
      return;
    }
    await submitTextOnly(null);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 110,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <form
        className="block"
        style={{ width: '100%', maxWidth: 360, padding: 16 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void submitWithFile();
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Новая история</div>
        <p className="muted" style={{ fontSize: 11, margin: '0 0 10px' }}>
          Видна друзьям 24 часа, затем попадает в архив.
        </p>
        <textarea
          className="text-input"
          style={{ width: '100%', minHeight: 88, resize: 'vertical', marginBottom: 10 }}
          placeholder="Текст…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
        />
        <input ref={fileRef} type="file" accept="image/*" style={{ marginBottom: 10, fontSize: 11 }} />
        {err ? (
          <p style={{ fontSize: 11, color: '#c45c5c', margin: '0 0 8px' }}>{err}</p>
        ) : null}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-primary" style={{ flex: 1 }} disabled={saving} onClick={() => submitWithFile()}>
            {saving ? '…' : 'Опубликовать'}
          </button>
          <button type="button" style={{ padding: '10px 12px' }} onClick={onClose}>
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
}

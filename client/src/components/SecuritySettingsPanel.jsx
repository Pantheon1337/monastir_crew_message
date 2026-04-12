import { useState } from 'react';
import { api } from '../api.js';

/** Блок «Безопасность»: смена пароля. */
export default function SecuritySettingsPanel({ userId, onPasswordChanged }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (newPassword !== newPassword2) {
      setError('Новые пароли не совпадают');
      return;
    }
    setBusy(true);
    const { ok, data } = await api('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
      userId,
    });
    setBusy(false);
    if (!ok) {
      setError(data?.error || 'Не удалось сменить пароль');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setNewPassword2('');
    setDone(true);
    onPasswordChanged?.();
  }

  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
        После смены пароля войдите в аккаунт на других устройствах заново, если потребуется.
      </p>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Текущий пароль</span>
        <input
          type="password"
          autoComplete="current-password"
          className="text-input"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="••••••••"
          disabled={busy}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Новый пароль</span>
        <input
          type="password"
          autoComplete="new-password"
          className="text-input"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Не короче 8 символов"
          disabled={busy}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Повтор нового пароля</span>
        <input
          type="password"
          autoComplete="new-password"
          className="text-input"
          value={newPassword2}
          onChange={(e) => setNewPassword2(e.target.value)}
          placeholder="Ещё раз"
          disabled={busy}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      </label>
      {error ? (
        <p style={{ margin: 0, fontSize: 12, color: '#c45c5c', lineHeight: 1.35 }}>{error}</p>
      ) : null}
      {done ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>Пароль обновлён</p>
      ) : null}
      <button type="submit" className="btn-primary" disabled={busy || !newPassword.trim()} style={{ alignSelf: 'flex-start' }}>
        {busy ? 'Сохранение…' : 'Сменить пароль'}
      </button>
    </form>
  );
}

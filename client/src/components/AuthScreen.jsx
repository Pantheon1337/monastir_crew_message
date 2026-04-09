import { useState } from 'react';
import { setStoredUser } from '../authStorage.js';

export default function AuthScreen({ onAuthSuccess }) {
  const [mode, setMode] = useState('login');
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickInput, setNickInput] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleLogin(e) {
    e.preventDefault();
    setError(null);
    const nick = nickInput.trim().replace(/^@+/, '');
    if (nick.length < 3) {
      setError('Укажите никнейм (от 3 символов после @)');
      return;
    }
    setLoading(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: `@${nick}`,
          password,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.error || 'Не удалось войти');
        return;
      }
      setStoredUser(data.user);
      onAuthSuccess?.(data.user);
    } catch {
      setError('Нет связи с сервером');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError(null);
    const nick = nickInput.trim().replace(/^@+/, '');
    if (nick.length < 3 || nick.length > 30) {
      setError('Никнейм: от 3 до 30 символов после @');
      return;
    }
    if (password !== password2) {
      setError('Пароли не совпадают');
      return;
    }
    if (password.length < 8) {
      setError('Пароль не короче 8 символов');
      return;
    }
    setLoading(true);
    const nickname = `@${nick}`;
    try {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          nickname,
          password,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.error || 'Не удалось зарегистрироваться');
        return;
      }
      setStoredUser(data.user);
      onAuthSuccess?.(data.user);
    } catch {
      setError('Нет связи с сервером');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
        maxWidth: 400,
        margin: '0 auto',
      }}
    >
      <h1
        style={{
          margin: '0 0 8px',
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          textAlign: 'center',
        }}
      >
        Monastir Crew Message
      </h1>

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 4,
        }}
      >
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setError(null);
          }}
          style={{
            flex: 1,
            padding: '8px 10px',
            fontSize: 12,
            borderRadius: 4,
            border: 'none',
            background: mode === 'login' ? 'var(--accent)' : 'transparent',
            color: mode === 'login' ? 'var(--bg)' : 'var(--muted)',
          }}
        >
          Вход
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('register');
            setError(null);
          }}
          style={{
            flex: 1,
            padding: '8px 10px',
            fontSize: 12,
            borderRadius: 4,
            border: 'none',
            background: mode === 'register' ? 'var(--accent)' : 'transparent',
            color: mode === 'register' ? 'var(--bg)' : 'var(--muted)',
          }}
        >
          Регистрация
        </button>
      </div>

      {mode === 'login' ? (
        <form className="block" style={{ padding: 16 }} onSubmit={handleLogin}>
          <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 11 }}>
            Никнейм
          </label>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              marginBottom: 12,
              paddingLeft: 12,
              background: 'var(--bg)',
            }}
          >
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>@</span>
            <input
              className="text-input"
              style={{ border: 'none', flex: 1, paddingLeft: 0 }}
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              placeholder="username"
              value={nickInput}
              onChange={(e) => setNickInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
              required
            />
          </div>

          <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 11 }}>
            Пароль
          </label>
          <input
            className="text-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', marginBottom: 12 }}
            required
          />

          {error ? (
            <p style={{ margin: '0 0 10px', fontSize: 11, color: '#c45c5c' }}>{error}</p>
          ) : null}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Вход…' : 'Войти'}
          </button>
        </form>
      ) : (
        <form className="block" style={{ padding: 16 }} onSubmit={handleRegister}>
          <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 11 }}>
            Телефон
          </label>
          <input
            className="text-input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+216 XX XXX XXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ width: '100%', marginBottom: 12 }}
            required
          />

          <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 11 }}>
            Имя
          </label>
          <input
            className="text-input"
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            style={{ width: '100%', marginBottom: 12 }}
            required
          />

          <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 11 }}>
            Фамилия
          </label>
          <input
            className="text-input"
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            style={{ width: '100%', marginBottom: 12 }}
            required
          />

          <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 11 }}>
            Никнейм (уникальный)
          </label>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              marginBottom: 4,
              paddingLeft: 12,
              background: 'var(--bg)',
            }}
          >
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>@</span>
            <input
              className="text-input"
              style={{ border: 'none', flex: 1, paddingLeft: 0 }}
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              placeholder="username"
              value={nickInput}
              onChange={(e) => setNickInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
              required
            />
          </div>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 10 }}>
            Латиница, цифры и _, от 3 до 30 символов после @
          </p>

          <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 11 }}>
            Пароль
          </label>
          <input
            className="text-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', marginBottom: 12 }}
            required
          />

          <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 11 }}>
            Пароль ещё раз
          </label>
          <input
            className="text-input"
            type="password"
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            style={{ width: '100%', marginBottom: 12 }}
            required
          />

          {error ? (
            <p style={{ margin: '0 0 10px', fontSize: 11, color: '#c45c5c' }}>{error}</p>
          ) : null}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Отправка…' : 'Зарегистрироваться'}
          </button>
        </form>
      )}
    </div>
  );
}

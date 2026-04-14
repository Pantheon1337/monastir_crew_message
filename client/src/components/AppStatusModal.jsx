/** Версия клиента (синхронизируйте при релизах). */
export const APP_VERSION = '0.2.7 (пред-релиз)';

function wsRu(status) {
  switch (status) {
    case 'idle':
      return 'ожидание';
    case 'connecting':
      return 'подключение…';
    case 'open':
      return 'онлайн';
    case 'closed':
      return 'нет соединения';
    default:
      return String(status ?? '');
  }
}

export default function AppStatusModal({ onClose, wsStatus, networkOnline, loadError }) {
  const serverOk = wsStatus === 'open';
  const serverConnecting = wsStatus === 'connecting';
  const serverLabel = wsRu(wsStatus);
  const serverDot = serverOk ? 'var(--online)' : serverConnecting ? 'var(--accent)' : '#c45c5c';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-status-title"
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 105,
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
          maxWidth: 440,
          maxHeight: 'min(85dvh, 560px)',
          overflow: 'auto',
          padding: 16,
          borderRadius: 'var(--radius)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span id="app-status-title" style={{ fontSize: 14, fontWeight: 600 }}>
            Статус приложения
          </span>
          <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <p className="muted" style={{ fontSize: 11, margin: '0 0 14px', lineHeight: 1.4 }}>
          Версия клиента и доступность сети и сервера в реальном времени.
        </p>

        <div
          style={{
            padding: '10px 12px',
            marginBottom: 12,
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            fontSize: 12,
          }}
        >
          <span className="muted" style={{ fontSize: 10 }}>
            Версия
          </span>
          <div style={{ fontWeight: 600, marginTop: 4 }}>{APP_VERSION}</div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 0',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: 12 }}>Интернет</span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: networkOnline ? 'var(--online)' : '#c45c5c',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: networkOnline ? 'var(--online)' : '#c45c5c',
                flexShrink: 0,
              }}
            />
            {networkOnline ? 'Онлайн' : 'Офлайн'}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 0',
          }}
        >
          <span style={{ fontSize: 12 }}>Сервер (чаты, события)</span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: serverOk ? 'var(--online)' : serverConnecting ? 'var(--accent)' : 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: serverDot,
                flexShrink: 0,
              }}
            />
            {serverLabel}
          </span>
        </div>

        {loadError ? (
          <p style={{ margin: '12px 0 0', fontSize: 11, color: '#c45c5c', lineHeight: 1.4 }}>{loadError}</p>
        ) : null}
      </div>
    </div>
  );
}

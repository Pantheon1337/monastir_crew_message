import { requestNotificationPermission } from '../browserNotification.js';

/** Настройки приложения: уведомления, тема. */
export default function SettingsModal({
  open,
  onClose,
  notificationsEnabled,
  onNotificationsEnabledChange,
  theme,
  onThemeChange,
  onOpenTestChat,
}) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
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
        className="block modal-panel settings-modal-panel"
        style={{
          width: '100%',
          maxWidth: 400,
          padding: 16,
          borderRadius: 'var(--radius)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span id="settings-modal-title" style={{ fontSize: 14, fontWeight: 600 }}>
            Настройки
          </span>
          <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 11 }} className="muted">
              Уведомления
            </p>
            <p className="muted" style={{ margin: '0 0 10px', fontSize: 10, lineHeight: 1.4 }}>
              Браузерные уведомления о сообщениях и заявках в друзья (если разрешено в браузере).
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={notificationsEnabled ? 'btn-primary' : 'btn-outline'}
                style={{ flex: 1, width: 'auto' }}
                onClick={() => {
                  void (async () => {
                    await requestNotificationPermission();
                    onNotificationsEnabledChange(true);
                  })();
                }}
              >
                Вкл
              </button>
              <button
                type="button"
                className={!notificationsEnabled ? 'btn-primary' : 'btn-outline'}
                style={{ flex: 1, width: 'auto' }}
                onClick={() => onNotificationsEnabledChange(false)}
              >
                Выкл
              </button>
            </div>
          </div>

          <div>
            <p style={{ margin: '0 0 10px', fontSize: 11 }} className="muted">
              Тема
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={theme === 'dark' ? 'btn-primary' : 'btn-outline'}
                style={{ flex: 1, width: 'auto' }}
                onClick={() => onThemeChange('dark')}
              >
                Тёмная
              </button>
              <button
                type="button"
                className={theme === 'light' ? 'btn-primary' : 'btn-outline'}
                style={{ flex: 1, width: 'auto' }}
                onClick={() => onThemeChange('light')}
              >
                Светлая
              </button>
            </div>
          </div>

          {typeof onOpenTestChat === 'function' ? (
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 11 }} className="muted">
                Разработка
              </p>
              <button
                type="button"
                className="btn-outline"
                style={{ width: '100%' }}
                onClick={() => {
                  onClose();
                  onOpenTestChat();
                }}
              >
                Тестовый чат
              </button>
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 10, lineHeight: 1.4 }}>
                Новый интерфейс и логика: диалог с собой (тот же поток, что «Избранное»).
              </p>
            </div>
          ) : null}

        </div>
      </div>
    </div>
  );
}

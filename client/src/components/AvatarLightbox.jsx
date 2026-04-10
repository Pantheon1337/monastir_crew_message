/**
 * Полноэкранный просмотр изображения (тап вне картинки — закрыть).
 * fullSize — почти на весь экран (чат, вложения); иначе компактно (аватар).
 */
export default function AvatarLightbox({ url, onClose, fullSize = false }) {
  if (url == null || String(url).trim() === '') return null;
  const src = String(url).trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={fullSize ? 'Изображение' : 'Аватар'}
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
        background: 'rgba(0,0,0,0.88)',
      }}
      onClick={onClose}
    >
      <button
        type="button"
        className="icon-btn"
        aria-label="Закрыть"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 'max(12px, env(safe-area-inset-top))',
          right: 12,
          width: 40,
          height: 40,
          zIndex: 1,
          color: '#fff',
          borderColor: 'rgba(255,255,255,0.35)',
          background: 'rgba(0,0,0,0.35)',
        }}
      >
        ×
      </button>
      <img
        src={src}
        alt=""
        style={
          fullSize
            ? {
                maxWidth: 'min(98vw, 1600px)',
                maxHeight: 'min(94dvh, 98vh)',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.12)',
              }
            : {
                maxWidth: 'min(92vw, 420px)',
                maxHeight: 'min(78dvh, 520px)',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.12)',
              }
        }
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

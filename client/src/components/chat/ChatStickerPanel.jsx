import { useEffect, useState, useMemo } from 'react';
import { api } from '../../api.js';
import { CHAT_EMOJI_PALETTE } from '../../chat/chatEmojiPalette.js';

/**
 * Панель в стиле Telegram: GIF / Стикеры / Эмодзи.
 */
export default function ChatStickerPanel({
  open,
  onClose,
  userId,
  disabled,
  onEmojiPick,
  onSendSticker,
}) {
  const [tab, setTab] = useState('stickers');
  const [packs, setPacks] = useState([]);
  const [packIndex, setPackIndex] = useState(0);
  const [loadErr, setLoadErr] = useState(null);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLoadErr(null);
    (async () => {
      const { ok, data } = await api('/api/stickers/packs', { userId });
      if (cancelled) return;
      if (!ok) {
        setLoadErr(data?.error || 'Не удалось загрузить');
        setPacks([]);
        return;
      }
      setPacks(Array.isArray(data?.packs) ? data.packs : []);
      setPackIndex(0);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const activePack = useMemo(() => {
    if (!packs.length) return null;
    const i = Math.min(Math.max(0, packIndex), packs.length - 1);
    return packs[i];
  }, [packs, packIndex]);

  if (!open) return null;

  return (
    <>
      <div
        role="presentation"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 94,
          background: 'rgba(0,0,0,0.35)',
        }}
        onClick={onClose}
      />
      <div
        className="chat-sticker-panel"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 95,
          maxHeight: 'min(48vh, 420px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg)',
          borderTop: '1px solid var(--border)',
          borderRadius: '16px 16px 0 0',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {tab === 'gif' && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                color: 'var(--muted)',
                fontSize: 14,
              }}
            >
              GIF — скоро
            </div>
          )}
          {tab === 'stickers' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {loadErr ? (
                <div style={{ padding: 16, fontSize: 13, color: 'var(--danger, #c44)' }}>{loadErr}</div>
              ) : null}
              {!loadErr && packs.length === 0 ? (
                <div style={{ padding: 16, fontSize: 13, color: 'var(--muted)' }}>
                  Нет наборов стикеров. Добавьте папки в <code>uploads/stickers/</code> с manifest.json
                </div>
              ) : null}
              {packs.length > 0 ? (
                <>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      padding: '8px 10px',
                      overflowX: 'auto',
                      flexShrink: 0,
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {packs.map((p, i) => {
                      const thumb = p.stickers?.[0]?.url;
                      const sel = i === packIndex;
                      return (
                        <button
                          key={p.dir}
                          type="button"
                          onClick={() => setPackIndex(i)}
                          aria-label={p.title || p.dir}
                          title={p.title || p.dir}
                          style={{
                            width: 44,
                            height: 44,
                            flexShrink: 0,
                            borderRadius: 10,
                            border: sel ? '2px solid var(--accent)' : '1px solid var(--border)',
                            padding: 2,
                            background: 'var(--surface, rgba(0,0,0,0.03))',
                            cursor: 'pointer',
                            overflow: 'hidden',
                          }}
                        >
                          {thumb ? (
                            <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          ) : (
                            <span style={{ fontSize: 10 }}>{(p.title || p.dir).slice(0, 3)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      overflowY: 'auto',
                      padding: '10px 8px 12px',
                      WebkitOverflowScrolling: 'touch',
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
                        gap: 6,
                      }}
                    >
                      {(activePack?.stickers || []).map((s) => (
                        <button
                          key={`${activePack.dir}-${s.file}`}
                          type="button"
                          disabled={disabled}
                          onClick={() => onSendSticker?.(activePack.dir, s.file)}
                          aria-label={s.emoji || 'Стикер'}
                          style={{
                            aspectRatio: '1',
                            border: 'none',
                            borderRadius: 10,
                            background: 'transparent',
                            padding: 4,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.5 : 1,
                          }}
                        >
                          <img
                            src={s.url}
                            alt=""
                            draggable={false}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}
          {tab === 'emoji' && (
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '10px 8px',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))',
                  gap: 4,
                }}
              >
                {CHAT_EMOJI_PALETTE.map((em) => (
                  <button
                    key={em}
                    type="button"
                    disabled={disabled}
                    onClick={() => onEmojiPick?.(em)}
                    style={{
                      fontSize: 26,
                      lineHeight: 1,
                      border: 'none',
                      borderRadius: 8,
                      background: 'transparent',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      padding: 4,
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '10px 12px 14px',
            flexShrink: 0,
          }}
        >
          <div
            role="tablist"
            style={{
              display: 'inline-flex',
              gap: 4,
              padding: 4,
              borderRadius: 999,
              background: 'rgba(127,127,127,0.12)',
            }}
          >
            {[
              { id: 'gif', label: 'GIF' },
              { id: 'stickers', label: 'Стикеры' },
              { id: 'emoji', label: 'Эмодзи' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                style={{
                  border: 'none',
                  borderRadius: 999,
                  padding: '8px 14px',
                  fontSize: 13,
                  fontWeight: tab === t.id ? 600 : 500,
                  background: tab === t.id ? 'var(--bg)' : 'transparent',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

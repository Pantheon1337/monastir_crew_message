import { useEffect, useState, useCallback } from 'react';
import { api, mediaPublicUrl } from '../api.js';
import StoryViewersModal from './StoryViewersModal.jsx';

function formatViewerCount(n) {
  const x = n % 100;
  if (x >= 11 && x <= 14) return `${n} просмотров`;
  const m = n % 10;
  if (m === 1) return `${n} просмотр`;
  if (m >= 2 && m <= 4) return `${n} просмотра`;
  return `${n} просмотров`;
}

/** API может отдать boolean или 0/1; `0 !== false` в JS — true, из‑за этого кнопка «в профиль» пропадала. */
function storyShownInProfile(it) {
  const v = it?.showInProfile;
  if (v === false || v === 0) return false;
  if (v === true || v === 1) return true;
  return true;
}

function storyArchivedEarlyFromFeed(it) {
  const v = it?.archivedEarly;
  if (v === true || v === 1) return true;
  return false;
}

function expiresAtMs(it) {
  const v = it?.expiresAt;
  if (v == null) return NaN;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const p = Date.parse(String(v));
  return Number.isFinite(p) ? p : NaN;
}

/** Запасной вариант, если сервер ещё без полей canRestoreToFeed / canRestoreToProfile. */
function deriveRestoreFlags(it, userId, now) {
  const own = String(it.userId) === String(userId);
  const exp = expiresAtMs(it);
  const notExpired = Number.isFinite(exp) && exp > now;
  return {
    feed: own && storyArchivedEarlyFromFeed(it) && notExpired,
    profile: own && !storyShownInProfile(it) && notExpired,
  };
}

export default function StoriesArchiveModal({ userId, onClose, onChanged }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [viewersStoryId, setViewersStoryId] = useState(null);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [viewersList, setViewersList] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await api('/api/stories/archive', { userId });
    if (!ok) {
      setErr(data?.error || 'Ошибка');
      setLoading(false);
      return;
    }
    setItems(data.items || []);
    setErr(null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!viewersStoryId || !userId) return undefined;
    let cancelled = false;
    setViewersLoading(true);
    setViewersList([]);
    (async () => {
      const { ok, data } = await api(`/api/stories/${encodeURIComponent(viewersStoryId)}/viewers`, { userId });
      if (cancelled) return;
      setViewersLoading(false);
      if (ok) setViewersList(data.viewers || []);
      else {
        setViewersList([]);
        if (data?.error) alert(data.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewersStoryId, userId]);

  async function restoreToFeed(storyId) {
    if (!userId) return;
    setBusyId(storyId);
    const { ok, data } = await api(`/api/stories/${encodeURIComponent(storyId)}/unarchive`, {
      method: 'POST',
      userId,
    });
    setBusyId(null);
    if (!ok) {
      alert(data?.error || 'Не удалось');
      return;
    }
    onChanged?.();
    await load();
  }

  async function restoreToProfile(storyId) {
    if (!userId) return;
    setBusyId(storyId);
    const { ok, data } = await api(`/api/stories/${encodeURIComponent(storyId)}/show-in-profile`, {
      method: 'POST',
      userId,
    });
    setBusyId(null);
    if (!ok) {
      alert(data?.error || 'Не удалось вернуть в профиль');
      return;
    }
    onChanged?.();
    await load();
  }

  async function removeForever(storyId) {
    if (!userId) return;
    if (!window.confirm('Удалить эту историю безвозвратно?')) return;
    setBusyId(storyId);
    const { ok, data } = await api(`/api/stories/${encodeURIComponent(storyId)}`, {
      method: 'DELETE',
      userId,
    });
    setBusyId(null);
    if (!ok) {
      alert(data?.error || 'Не удалось удалить');
      return;
    }
    onChanged?.();
    await load();
  }

  const now = Date.now();

  return (
    <div
      role="dialog"
      aria-modal="true"
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
          maxHeight: 'min(85dvh, 640px)',
          overflow: 'auto',
          padding: 16,
          borderRadius: 'var(--radius)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Архив историй</span>
          <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted" style={{ fontSize: 11, margin: '0 0 12px' }}>
          Снятые с ленты, убранные из сетки профиля и истёкшие кадры. Пока не истёк срок — можно вернуть в ленту кружков, в
          сетку профиля или удалить навсегда.
        </p>
        {loading ? (
          <p className="muted" style={{ fontSize: 12 }}>
            Загрузка…
          </p>
        ) : err ? (
          <p style={{ fontSize: 12, color: '#c45c5c' }}>{err}</p>
        ) : items.length === 0 ? (
          <p className="muted" style={{ fontSize: 12 }}>
            Пока пусто
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map((it) => {
              const own = String(it.userId) === String(userId);
              const fallback = deriveRestoreFlags(it, userId, now);
              const canRestoreFeed =
                typeof it.canRestoreToFeed === 'boolean' ? it.canRestoreToFeed && own : fallback.feed;
              const canRestoreProfile =
                typeof it.canRestoreToProfile === 'boolean' ? it.canRestoreToProfile && own : fallback.profile;
              const canDelete = own;
              const vc = typeof it.viewerCount === 'number' ? it.viewerCount : 0;
              return (
                <li
                  key={it.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: it.mediaUrl ? '56px 1fr' : '1fr',
                    gap: 10,
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 12,
                  }}
                >
                  {it.mediaUrl ? (
                    <img
                      src={mediaPublicUrl(it.mediaUrl)}
                      alt=""
                      style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }}
                    />
                  ) : null}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>
                      {it.authorLabel}
                      {it.authorAffiliationEmoji ? ` ${it.authorAffiliationEmoji}` : ''}
                    </div>
                    {it.body ? (
                      <div style={{ marginTop: 4, whiteSpace: 'pre-line', lineHeight: 1.45, wordBreak: 'break-word' }}>{it.body}</div>
                    ) : null}
                    <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>
                      {it.archivedEarly ? (
                        <>
                          снято с ленты{' '}
                          {it.feedHiddenAt != null ? new Date(it.feedHiddenAt).toLocaleString('ru-RU') : ''}
                          {' · '}
                        </>
                      ) : null}
                      истекает / истекла {new Date(it.expiresAt).toLocaleString('ru-RU')}
                    </div>
                    {own ? (
                      <div style={{ fontSize: 11, marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                        <span className="muted">{formatViewerCount(vc)}</span>
                        <button
                          type="button"
                          className="btn-outline"
                          style={{ fontSize: 11, padding: '4px 10px', width: 'auto' }}
                          onClick={() => setViewersStoryId(it.id)}
                        >
                          Кто смотрел
                        </button>
                      </div>
                    ) : null}
                    {own ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {canRestoreFeed ? (
                          <button
                            type="button"
                            className="btn-outline"
                            style={{ fontSize: 11, padding: '4px 10px', width: 'auto' }}
                            disabled={busyId === it.id}
                            onClick={() => void restoreToFeed(it.id)}
                          >
                            Вернуть в ленту
                          </button>
                        ) : null}
                        {canRestoreProfile ? (
                          <button
                            type="button"
                            className="btn-outline"
                            style={{ fontSize: 11, padding: '4px 10px', width: 'auto' }}
                            disabled={busyId === it.id}
                            onClick={() => void restoreToProfile(it.id)}
                          >
                            Вернуть в профиль
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            type="button"
                            className="btn-outline"
                            style={{
                              fontSize: 11,
                              padding: '4px 10px',
                              width: 'auto',
                              color: '#c45c5c',
                              borderColor: 'rgba(196,92,92,0.45)',
                            }}
                            disabled={busyId === it.id}
                            onClick={() => void removeForever(it.id)}
                          >
                            Удалить
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <StoryViewersModal
        open={viewersStoryId != null}
        loading={viewersLoading}
        viewers={viewersList}
        onClose={() => setViewersStoryId(null)}
      />
    </div>
  );
}

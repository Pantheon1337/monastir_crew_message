import fs from 'fs';
import path from 'path';
import { LRUCache } from 'lru-cache';
import { uploadsRoot } from './avatarUpload.js';

const stickerListCache = new LRUCache({
  max: 8,
  ttl: 60_000,
});

export function invalidateStickerListCache() {
  stickerListCache.clear();
}

/** Имя папки пака: латиница, цифры, _, - */
function safePackDir(name) {
  const s = String(name ?? '').trim();
  if (!s || s.includes('..') || s.includes('/') || s.includes('\\')) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(s) || s.length > 120) return null;
  return s;
}

function safeStickerFileName(name) {
  const b = path.basename(String(name ?? '').trim());
  if (!b || b !== String(name).trim()) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(b) || b.length > 200) return null;
  if (!/\.(webp|png|jpg|jpeg|gif)$/i.test(b)) return null;
  return b;
}

/**
 * Сканирует каталоги uploads/stickers/<пак>/manifest.json для панели стикеров.
 */
export function listStickerPacks() {
  const cached = stickerListCache.get('list');
  if (cached) return cached;

  const root = path.join(uploadsRoot, 'stickers');
  if (!fs.existsSync(root)) {
    const empty = { packs: [] };
    stickerListCache.set('list', empty);
    return empty;
  }

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const packs = [];

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const dir = ent.name;
    if (!safePackDir(dir)) continue;
    const manifestPath = path.join(root, dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      continue;
    }
    const stickersRaw = Array.isArray(manifest.stickers) ? manifest.stickers : [];
    const stickers = stickersRaw
      .filter((s) => s && typeof s.file === 'string' && safeStickerFileName(s.file))
      .map((s) => ({
        index: s.index,
        file: s.file,
        emoji: typeof s.emoji === 'string' ? s.emoji : '',
        fileUniqueId: s.fileUniqueId || '',
        isAnimated: Boolean(s.isAnimated),
        isVideo: Boolean(s.isVideo),
        url: `/uploads/stickers/${encodeURIComponent(dir)}/${encodeURIComponent(s.file)}`,
      }));

    packs.push({
      dir,
      setName: manifest.setName || dir,
      title: manifest.title || manifest.setName || dir,
      stickerType: manifest.stickerType || 'regular',
      stickers,
    });
  }

  packs.sort((a, b) => String(a.title).localeCompare(String(b.title), 'ru'));
  const out = { packs };
  stickerListCache.set('list', out);
  return out;
}

/**
 * Проверяет, что файл есть на диске и перечислен в manifest.json пака.
 * Возвращает относительный путь от корня uploads (как в media_path сообщений).
 */
export function validateStickerFile(packDirRaw, fileNameRaw) {
  const packDir = safePackDir(packDirRaw);
  const fileName = safeStickerFileName(fileNameRaw);
  if (!packDir || !fileName) return null;

  const base = path.join(uploadsRoot, 'stickers', packDir);
  const manifestPath = path.join(base, 'manifest.json');
  const filePath = path.join(base, fileName);
  try {
    if (!fs.statSync(manifestPath).isFile() || !fs.statSync(filePath).isFile()) return null;
  } catch {
    return null;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
  const stickers = manifest.stickers || [];
  const hit = stickers.find((s) => s && s.file === fileName);
  if (!hit) return null;

  return {
    relPath: `stickers/${packDir}/${fileName}`,
    emoji: typeof hit.emoji === 'string' ? hit.emoji.slice(0, 32) : '',
  };
}

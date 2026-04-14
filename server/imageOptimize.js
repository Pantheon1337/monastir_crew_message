/**
 * Сжатие растровых изображений в WebP через sharp (потоковая обработка внутри libvips).
 * Анимированные GIF/WebP не трогаем — иначе потеряется анимация.
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { uploadsRoot } from './avatarUpload.js';

/** Путь относительно uploads/ для ответов API */
export function relativeFromUploads(absPath) {
  return path.relative(uploadsRoot, absPath).split(path.sep).join('/');
}

/**
 * @param {string} absPath — абсолютный путь к загруженному файлу
 * @param {{ maxWidth?: number, maxHeight?: number, quality?: number }} [options]
 * @returns {Promise<{ absPath: string, baseName: string, changed: boolean }>}
 */
export async function optimizeRasterToWebp(absPath, options = {}) {
  const maxWidth = options.maxWidth ?? 2048;
  const maxHeight = options.maxHeight ?? 2048;
  const quality = options.quality ?? 82;

  const ext = path.extname(absPath).toLowerCase();
  const rasterExt = new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.gif',
    '.tiff',
    '.tif',
    '.heic',
    '.avif',
  ]);
  if (!rasterExt.has(ext)) {
    return { absPath, baseName: path.basename(absPath), changed: false };
  }

  let meta;
  try {
    meta = await sharp(absPath, { failOn: 'none' }).metadata();
  } catch {
    return { absPath, baseName: path.basename(absPath), changed: false };
  }

  if (meta.format === 'gif') {
    return { absPath, baseName: path.basename(absPath), changed: false };
  }
  if (meta.pages != null && meta.pages > 1) {
    return { absPath, baseName: path.basename(absPath), changed: false };
  }

  const dir = path.dirname(absPath);
  const baseNoExt = path.basename(absPath, ext);
  const outPath = path.join(dir, `${baseNoExt}.webp`);
  const tmpPath = path.join(dir, `.opt_${baseNoExt}_${process.pid}_${Date.now()}.webp`);

  try {
    let pipeline = sharp(absPath, { failOn: 'none' }).rotate();
    pipeline = pipeline.resize(maxWidth, maxHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    });
    await pipeline.webp({ quality, effort: 4 }).toFile(tmpPath);
    try {
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch {
      /* ignore */
    }
    fs.renameSync(tmpPath, outPath);
    return { absPath: outPath, baseName: path.basename(outPath), changed: true };
  } catch {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    return { absPath, baseName: path.basename(absPath), changed: false };
  }
}

/** true, если mime — растровое изображение (не SVG). */
export function isRasterImageMime(mime) {
  const m = String(mime || '').toLowerCase();
  return m.startsWith('image/') && m !== 'image/svg+xml';
}

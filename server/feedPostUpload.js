import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { uploadsRoot } from './avatarUpload.js';

const feedDir = path.join(uploadsRoot, 'feed_media');
fs.mkdirSync(feedDir, { recursive: true });

const DOC_EXT = new Set(['.pdf', '.doc', '.docx', '.txt', '.zip', '.rar', '.7z', '.csv']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, feedDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = ext && ext.length < 8 ? ext : '.bin';
    cb(null, `${randomUUID()}${safe}`);
  },
});

function feedFileFilter(_req, file, cb) {
  const m = (file.mimetype || '').toLowerCase().trim();
  const ext = path.extname(file.originalname || '').toLowerCase();
  const ok =
    m.startsWith('image/') ||
    m.startsWith('video/') ||
    m.startsWith('audio/') ||
    m === 'application/pdf' ||
    m.startsWith('text/') ||
    m === 'application/zip' ||
    m === 'application/x-zip-compressed' ||
    m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    m === 'application/msword' ||
    m === 'application/octet-stream' ||
    DOC_EXT.has(ext);
  if (!ok) {
    cb(new Error('Неподдерживаемый тип файла'));
    return;
  }
  cb(null, true);
}

export const feedPostUpload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: feedFileFilter,
});

export function feedMediaRelativePath(filename) {
  return `feed_media/${filename}`;
}

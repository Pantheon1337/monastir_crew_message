/**
 * Медиа историй на диске: каталог <server>/uploads/stories/
 * (рядом с avatars/; корень uploads задаётся в avatarUpload.js).
 */
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { uploadsRoot } from './avatarUpload.js';

const storiesDir = path.join(uploadsRoot, 'stories');

fs.mkdirSync(storiesDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, storiesDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const e = allowed.includes(ext) ? ext : '.jpg';
    cb(null, `${randomUUID()}${e}`);
  },
});

export const storyImageUpload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const mt = String(file.mimetype || '').toLowerCase();
    if (mt.startsWith('image/')) {
      cb(null, true);
      return;
    }
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.avif'].includes(ext)) {
      cb(null, true);
      return;
    }
    cb(new Error('Допустимы только изображения'));
  },
});

export function storyMediaRelativePath(filename) {
  return `stories/${filename}`;
}

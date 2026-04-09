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
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Допустимы только изображения'));
      return;
    }
    cb(null, true);
  },
});

export function storyMediaRelativePath(filename) {
  return `stories/${filename}`;
}

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsRoot = path.join(__dirname, 'uploads');
const avatarsDir = path.join(uploadsRoot, 'avatars');

fs.mkdirSync(avatarsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarsDir),
  filename: (req, file, cb) => {
    const uid = String(req.headers['x-user-id'] ?? '').trim();
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const e = allowed.includes(ext) ? ext : '.jpg';
    cb(null, `${uid}${e}`);
  },
});

/** Лимит файла: фото с камеры часто 3–8+ МБ; превью в интерфейсе маленькое. */
const AVATAR_MAX_BYTES = 8 * 1024 * 1024;

export const avatarUpload = multer({
  storage,
  limits: { fileSize: AVATAR_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Допустимы только изображения'));
      return;
    }
    cb(null, true);
  },
});

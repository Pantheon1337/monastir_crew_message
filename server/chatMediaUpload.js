import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

const DOC_EXT = new Set(['.pdf', '.doc', '.docx', '.txt', '.zip', '.rar', '.7z', '.csv']);
import multer from 'multer';
import { uploadsRoot } from './avatarUpload.js';
import { VIDEO_MAX_BYTES } from './uploadLimits.js';

const chatDir = path.join(uploadsRoot, 'chat_media');

fs.mkdirSync(chatDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, chatDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = ext && ext.length < 8 ? ext : '.webm';
    cb(null, `${randomUUID()}${safe}`);
  },
});

function voiceFilter(_req, file, cb) {
  const m = file.mimetype || '';
  const ok =
    m.startsWith('audio/') ||
    m === 'application/octet-stream' ||
    (m === '' && /\.(webm|ogg|mp4|m4a)$/i.test(file.originalname || ''));
  if (!ok) {
    cb(new Error('Ожидается аудио'));
    return;
  }
  cb(null, true);
}

function videoFilter(_req, file, cb) {
  const m = (file.mimetype || '').toLowerCase().trim();
  const ext = path.extname(file.originalname || '').toLowerCase();
  // MediaRecorder часто шлёт audio/webm, пустой mime или octet-stream — для кружка это норма
  const videoishExt = ['.webm', '.mp4', '.mov', '.mkv', '.m4v'].includes(ext);
  const ok =
    m.startsWith('video/') ||
    m === 'application/octet-stream' ||
    m === 'application/mp4' ||
    m.startsWith('audio/webm') ||
    m === 'audio/mp4' ||
    (m.startsWith('audio/') && videoishExt) ||
    (!m && videoishExt) ||
    (videoishExt && (m === '' || m === 'application/octet-stream'));
  if (!ok) {
    cb(new Error('Ожидается видео'));
    return;
  }
  cb(null, true);
}

/** Голосовые до ~15 с, запас по размеру */
export const chatVoiceUpload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: voiceFilter,
});

/** Видеокружок — до 50 МБ */
export const chatVideoNoteUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: videoFilter,
});

export function chatMediaRelativePath(filename) {
  return `chat_media/${filename}`;
}

function attachmentFilter(_req, file, cb) {
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

/** Фото и прочие вложения в чат (не голос/кружок). Верхняя граница файла — как у видео; точная проверка видео в обработчике. */
export const chatAttachmentUpload = multer({
  storage,
  limits: { fileSize: VIDEO_MAX_BYTES },
  fileFilter: attachmentFilter,
});

import fs from 'fs';

/** Максимальный размер видеофайла (вложения в чат, лента, видеокружок). Фото — без лимита на стороне multer. */
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export function deleteUploadedFile(filePath) {
  try {
    if (filePath) fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

/**
 * Если загружено видео и оно больше VIDEO_MAX_BYTES — удаляет файл и возвращает текст ошибки.
 * Иначе null.
 */
export function enforceVideoMaxSize(file) {
  if (!file) return null;
  const m = (file.mimetype || '').toLowerCase();
  if (!m.startsWith('video/')) return null;
  if (file.size <= VIDEO_MAX_BYTES) return null;
  deleteUploadedFile(file.path);
  return 'Видео не больше 50 МБ';
}

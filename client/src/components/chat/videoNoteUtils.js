/** Общие константы и хелперы для видеокружка (чаты). */

export const MAX_VIDEO_NOTE_MS = 15000;
export const MIN_VIDEO_NOTE_MS = 320;

export const VIDEO_RING_R = 118;
export const VIDEO_RING_LEN = 2 * Math.PI * VIDEO_RING_R;

export function pickVideoMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) return 'video/webm;codecs=vp9,opus';
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) return 'video/webm;codecs=vp8,opus';
  if (MediaRecorder.isTypeSupported('video/webm')) return 'video/webm';
  if (MediaRecorder.isTypeSupported('video/mp4')) return 'video/mp4';
  if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E,mp4a.40.2')) return 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';
  return '';
}

export function buildVideoNoteFile(blob, mr) {
  const rawMime = (mr.mimeType || blob.type || '').trim().toLowerCase();
  let ext = 'webm';
  let fileType = 'video/webm';
  if (rawMime.startsWith('video/')) {
    fileType = rawMime.split(';')[0];
    if (rawMime.includes('mp4') || rawMime.includes('quicktime')) ext = 'mp4';
    else if (rawMime.includes('webm')) ext = 'webm';
    else ext = 'mp4';
  } else if (rawMime.startsWith('audio/webm')) {
    fileType = 'video/webm';
    ext = 'webm';
  } else if (rawMime.includes('mp4')) {
    fileType = 'video/mp4';
    ext = 'mp4';
  } else {
    const fallback = pickVideoMime();
    if (fallback.includes('mp4')) {
      fileType = 'video/mp4';
      ext = 'mp4';
    }
  }
  return new File([blob], `note.${ext}`, { type: fileType });
}

/** Как в примере: «0:01,36» — минуты:секунды,сотые доли секунды. */
export function formatVideoNoteTimer(ms) {
  if (ms == null || ms < 0) return '0:00,00';
  const totalCs = Math.floor(ms / 10);
  const s = Math.floor(totalCs / 100);
  const m = Math.floor(s / 60);
  const rs = s % 60;
  const cs = totalCs % 100;
  return `${m}:${String(rs).padStart(2, '0')},${String(cs).padStart(2, '0')}`;
}

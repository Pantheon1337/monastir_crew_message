import fs from 'fs';
import path from 'path';
import { uploadsRoot } from './avatarUpload.js';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/**
 * Статические фоны чата: server/uploads/fon_chat/* (на проде, например /opt/.../server/uploads/fon_chat).
 */
export function listChatWallpapers() {
  const dir = path.join(uploadsRoot, 'fon_chat');
  try {
    if (!fs.existsSync(dir)) return [];
    const names = fs.readdirSync(dir);
    return names
      .filter((n) => {
        const ext = path.extname(n).toLowerCase();
        return IMAGE_EXT.has(ext) && !n.startsWith('.');
      })
      .sort((a, b) => a.localeCompare(b, 'ru'))
      .map((file) => ({
        id: file,
        url: `/uploads/fon_chat/${encodeURIComponent(file)}`,
        relPath: `fon_chat/${file}`,
      }));
  } catch {
    return [];
  }
}

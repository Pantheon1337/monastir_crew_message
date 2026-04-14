/**
 * Импорт набора стикеров Telegram через Bot API (getStickerSet + getFile).
 * Токен: TELEGRAM_BOT_TOKEN в .env (корень репозитория или server/).
 *
 * Запуск из корня репозитория:
 *   npm run import-stickers -- Soviet_posters
 * Из каталога server:
 *   node scripts/import-sticker-set.js Soviet_posters
 *
 * Файлы: uploads/stickers/<имя_набора>/ и manifest.json (список для приложения).
 * Анимированные .tgs и видео-стикеры сохраняются как есть; превью в UI — отдельно.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { uploadsRoot } from '../avatarUpload.js';
import { invalidateStickerListCache } from '../stickers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Парсинг одного .env-файла в объект. */
function parseEnvFile(filePath) {
  const out = {};
  const txt = fs.readFileSync(filePath, 'utf8');
  for (const line of txt.split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** Корень репозитория, затем server/ — второй перекрывает первый; оболочка важнее файлов. */
function loadEnvFiles() {
  const candidates = [
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '../.env'),
  ];
  const merged = {};
  for (const filePath of candidates) {
    try {
      Object.assign(merged, parseEnvFile(filePath));
    } catch {
      /* нет файла */
    }
  }
  for (const [key, val] of Object.entries(merged)) {
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFiles();

const API = 'https://api.telegram.org';

function parseArgs(argv) {
  const out = { setName: null, help: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--set' || a === '-s') out.setName = argv[++i] || null;
    else if (!a.startsWith('-')) rest.push(a);
  }
  if (!out.setName && rest[0]) out.setName = rest[0];
  return out;
}

function usage() {
  console.log(`Использование:
  npm run import-stickers -- <имя_набора>
  node scripts/import-sticker-set.js --set Soviet_posters

Переменная TELEGRAM_BOT_TOKEN: файл .env в корне репозитория или в server/ (бот может вызывать getStickerSet для публичных наборов).
`);
}

function safeSegment(name) {
  const s = String(name || '').trim();
  if (!s) return 'set';
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

async function tg(token, method, body) {
  const url = `${API}/bot${token}/${method}`;
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    const desc = data.description || res.statusText || 'unknown';
    throw new Error(`${method}: ${desc}`);
  }
  return data.result;
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
}

function extFromFilePath(filePath) {
  const e = path.extname(filePath || '').toLowerCase();
  if (e && e.length < 8) return e;
  return '.bin';
}

async function main() {
  const { setName, help } = parseArgs(process.argv.slice(2));
  if (help || !setName) {
    usage();
    process.exit(help ? 0 : 1);
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    console.error(
      'Задайте TELEGRAM_BOT_TOKEN в .env (корень репозитория или server/) или в окружении.',
    );
    process.exit(1);
  }

  const stickerSet = await tg(token, 'getStickerSet', { name: setName });
  const stickers = stickerSet.stickers || [];
  const dirName = safeSegment(stickerSet.name || setName);
  const outDir = path.join(uploadsRoot, 'stickers', dirName);
  fs.mkdirSync(outDir, { recursive: true });

  const manifestStickers = [];
  let skipped = 0;

  for (let i = 0; i < stickers.length; i++) {
    const st = stickers[i];
    const fileId = st.file_id;
    const fileUniqueId = st.file_unique_id || `idx${i}`;
    const fileInfo = await tg(token, 'getFile', { file_id: fileId });
    const filePath = fileInfo.file_path;
    if (!filePath) {
      skipped++;
      continue;
    }
    const ext = extFromFilePath(filePath);
    const base = `${String(i).padStart(3, '0')}_${fileUniqueId}${ext}`;
    const localPath = path.join(outDir, base);
    const fileUrl = `${API}/file/bot${token}/${filePath}`;
    await downloadFile(fileUrl, localPath);

    manifestStickers.push({
      index: i,
      fileUniqueId,
      emoji: st.emoji || '',
      file: base,
      isAnimated: Boolean(st.is_animated),
      isVideo: Boolean(st.is_video),
      width: st.width ?? null,
      height: st.height ?? null,
    });

    if (i < stickers.length - 1) await new Promise((r) => setTimeout(r, 50));
  }

  const manifest = {
    setName: stickerSet.name,
    title: stickerSet.title,
    stickerType: stickerSet.sticker_type,
    importedAt: new Date().toISOString(),
    stickers: manifestStickers,
    skipped,
  };

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  invalidateStickerListCache();

  console.log(
    `Готово: ${manifestStickers.length} файлов → ${path.relative(process.cwd(), outDir)}` +
      (skipped ? ` (пропущено без пути: ${skipped})` : ''),
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

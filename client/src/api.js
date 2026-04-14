/**
 * Базовый URL API (без завершающего /). Если фронт на другом origin или статике без прокси:
 * при сборке задайте VITE_API_ORIGIN=https://ваш-сервер:порт
 */
export function apiPath(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  const raw = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_ORIGIN : '';
  const base = typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : '';
  if (base) return `${base}${p}`;
  return p;
}

/**
 * URL для отображения файлов из `/uploads/...` в UI (img, video).
 * Если задан `VITE_API_ORIGIN`, относительные пути ведут на тот же origin, что и API.
 */
export function mediaPublicUrl(pathOrUrl) {
  if (pathOrUrl == null) return null;
  const s = String(pathOrUrl).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^blob:/i.test(s)) return s;
  const p = s.startsWith('/') ? s : `/${s}`;
  return apiPath(p);
}

/**
 * Запросы к API с идентификатором текущего пользователя.
 */
export async function api(path, { method = 'GET', body, userId } = {}) {
  const url = apiPath(path);
  const headers = {};
  if (body != null) headers['Content-Type'] = 'application/json';
  if (userId) headers['X-User-Id'] = userId;
  const r = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || r.statusText };
  }
  return { ok: r.ok, status: r.status, data };
}

/** Загрузка файла (multipart), без Content-Type — boundary выставит браузер. */
export async function apiUpload(path, { file, userId, fieldName = 'avatar', extraFields } = {}) {
  const url = apiPath(path);
  const fd = new FormData();
  fd.append(fieldName, file);
  if (extraFields && typeof extraFields === 'object') {
    for (const [k, v] of Object.entries(extraFields)) {
      if (v === undefined) continue;
      fd.append(k, v === null ? '' : String(v));
    }
  }
  const headers = {};
  if (userId) headers['X-User-Id'] = userId;
  const r = await fetch(url, { method: 'POST', headers, body: fd });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || r.statusText };
  }
  return { ok: r.ok, status: r.status, data };
}

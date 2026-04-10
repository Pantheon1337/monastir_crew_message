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
      if (v != null && v !== '') fd.append(k, String(v));
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

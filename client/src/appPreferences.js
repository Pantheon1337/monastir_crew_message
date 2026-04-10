const KEY_NOTIF = 'monastir-app-notifications';
const KEY_THEME = 'monastir-app-theme';

/** @returns {boolean} */
export function getNotificationsEnabled() {
  try {
    const v = localStorage.getItem(KEY_NOTIF);
    if (v === null) return true;
    return v === '1';
  } catch {
    return true;
  }
}

/** @param {boolean} enabled */
export function setNotificationsEnabled(enabled) {
  try {
    localStorage.setItem(KEY_NOTIF, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** @returns {'dark' | 'light'} */
export function getTheme() {
  try {
    const v = localStorage.getItem(KEY_THEME);
    return v === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** @param {'dark' | 'light'} theme */
export function setTheme(theme) {
  try {
    localStorage.setItem(KEY_THEME, theme === 'light' ? 'light' : 'dark');
  } catch {
    /* ignore */
  }
}

/** Синхронно до первого кадра — без мигания темы. */
export function applyThemeToDocument(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  if (t === 'dark') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }
}

export function initAppPreferences() {
  applyThemeToDocument(getTheme());
}

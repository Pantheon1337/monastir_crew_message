const USER_KEY = 'ruscord_crew_user';

function isValidUserShape(u) {
  return (
    u &&
    typeof u.id === 'string' &&
    typeof u.phone === 'string' &&
    typeof u.firstName === 'string' &&
    typeof u.lastName === 'string' &&
    typeof u.nickname === 'string' &&
    u.id &&
    u.phone &&
    u.firstName.trim() &&
    u.lastName.trim() &&
    u.nickname.trim()
  );
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw);
    return isValidUserShape(u) ? u : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredUser() {
  localStorage.removeItem(USER_KEY);
}

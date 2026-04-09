import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto';

const ITERATIONS = 310000;
const KEYLEN = 32;
const DIGEST = 'sha256';

export function hashPassword(plain) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(plain, salt, ITERATIONS, KEYLEN, DIGEST);
  return `pbkdf2_sha256$${ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(plain, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('pbkdf2_sha256$')) return false;
  const parts = stored.split('$');
  if (parts.length !== 4) return false;
  const iter = Number(parts[1]);
  const salt = Buffer.from(parts[2], 'base64');
  const expected = Buffer.from(parts[3], 'base64');
  if (!Number.isFinite(iter) || iter < 100000 || !salt.length || !expected.length) return false;
  const hash = pbkdf2Sync(plain, salt, iter, expected.length, DIGEST);
  if (hash.length !== expected.length) return false;
  return timingSafeEqual(hash, expected);
}

export function validatePasswordStrength(plain) {
  if (typeof plain !== 'string' || plain.length < 8) {
    return 'Пароль не короче 8 символов';
  }
  if (plain.length > 128) {
    return 'Пароль слишком длинный';
  }
  return null;
}

/**
 * Отображение номера в стиле РФ: +7 999 999 99 99.
 * Для других стран — +XXX с группами по 3 цифры после кода.
 */
export function formatPhoneRu(phone) {
  if (phone == null || phone === '') return '';
  const raw = String(phone).trim();
  const d = raw.replace(/\D/g, '');
  if (d.length === 0) return raw;

  if (d.length === 11 && d[0] === '7') {
    const rest = d.slice(1);
    return `+7 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6, 8)} ${rest.slice(8, 10)}`;
  }
  if (d.length === 10 && !d.startsWith('0')) {
    return `+7 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
  }

  let i = 0;
  if (d.length >= 10 && d.length <= 15) {
    const first = d[0];
    let out = `+${first}`;
    i = 1;
    while (i < d.length) {
      const chunk = d.slice(i, i + 3);
      out += ` ${chunk}`;
      i += 3;
    }
    return out.trim();
  }

  return raw.startsWith('+') ? raw : `+${d}`;
}

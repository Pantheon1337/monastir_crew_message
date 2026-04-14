/**
 * Логика из test/1.html («Telegram-стиль • Мобильный чат»): экранирование, авто-высота textarea, скролл ленты.
 * Визуал задаётся в приложении (CSS / компоненты), здесь только поведение.
 */

/**
 * Как в примере: безопасная подстановка текста в innerHTML (сохранение суррогатных пар emoji).
 * В React обычно не нужен — разметка через JSX; оставлен для утилит и возможного reuse.
 */
export function escapeHtml(str) {
  if (str == null) return '';
  const s = String(str);
  return s
    .replace(/[&<>]/g, (m) => {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    })
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, (c) => c);
}

/**
 * Аналог из примера: textarea.style.height = 'auto'; затем height = min(scrollHeight, max).
 * В демо max = 100px; у нас совпадает с max-height в CSS композера (см. minHeightPx для пустого поля).
 *
 * @param {HTMLTextAreaElement | null} textarea
 * @param {{ maxHeightPx?: number; minHeightPx?: number }} [options]
 */
export function syncChatComposerTextareaHeight(textarea, options = {}) {
  if (!textarea || textarea.tagName !== 'TEXTAREA') return;
  const maxHeightPx = options.maxHeightPx ?? 130;
  const minHeightPx = options.minHeightPx ?? 40;
  textarea.style.height = 'auto';
  const next = Math.min(Math.max(textarea.scrollHeight, minHeightPx), maxHeightPx);
  textarea.style.height = `${next}px`;
}

/**
 * Как в примере: messagesContainer.scrollTop = messagesContainer.scrollHeight (вниз к последнему сообщению).
 * Дополнительно: учёт clientHeight и пропуск, если уже у нижней границы — как в текущем прод-коде.
 *
 * @param {HTMLElement | null} el — контейнер с overflow: auto (лента чата)
 */
export function scrollChatTimelineToBottom(el) {
  if (!el) return;
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return;
  if (Math.abs(el.scrollTop - max) < 2) return;
  el.scrollTop = max;
}

/**
 * Соседние сообщения от одного отправителя считаются одной «группой» (как в Telegram).
 */
export function messageGroupFlags(messages, index) {
  const m = messages[index];
  if (!m) return { isFirstInGroup: true, isLastInGroup: true };
  const prev = index > 0 ? messages[index - 1] : null;
  const next = index < messages.length - 1 ? messages[index + 1] : null;
  const same = (a, b) => Boolean(a && b && a.senderId === b.senderId);
  return {
    isFirstInGroup: !same(prev, m),
    isLastInGroup: !same(m, next),
  };
}

/** CSS border-radius в порядке TL, TR, BR, BL (как в Telegram: хвост у нижнего угла к краю экрана). */
export function telegramBubbleRadius(mine, isFirstInGroup, isLastInGroup) {
  const R = 17;
  /** «Стыки» в группе — чуть больше радиус, меньше артефактов кромки */
  const j = 5;
  const first = isFirstInGroup;
  const last = isLastInGroup;
  if (mine) {
    if (first && last) return `${R}px ${R}px ${j}px ${R}px`;
    if (first) return `${R}px ${R}px ${R}px ${j}px`;
    if (last) return `${j}px ${R}px ${j}px ${R}px`;
    return `${j}px ${R}px ${R}px ${j}px`;
  }
  if (first && last) return `${R}px ${R}px ${R}px ${j}px`;
  if (first) return `${R}px ${R}px ${j}px ${R}px`;
  if (last) return `${j}px ${R}px ${R}px ${j}px`;
  return `${R}px ${j}px ${j}px ${R}px`;
}

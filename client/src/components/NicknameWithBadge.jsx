/**
 * Никнейм со смайликом принадлежности (роль/кастом).
 * affiliationEmoji — с сервера (effective), уже готовый символ.
 */
export default function NicknameWithBadge({ nickname, affiliationEmoji, style, className }) {
  if (!nickname) return '—';
  return (
    <span style={style} className={className}>
      @{nickname}
      {affiliationEmoji ? (
        <span aria-hidden style={{ marginLeft: 4 }} title="Принадлежность">
          {affiliationEmoji}
        </span>
      ) : null}
    </span>
  );
}

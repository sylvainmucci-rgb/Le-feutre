import { cardFr, isRed, rankShort, suitGlyph, type Card } from "../shared/cards";

export function PlayingCard({
  card,
  hidden = false,
  onClick,
  disabled = false,
  dimmed = false,
}: {
  card?: Card | null;
  hidden?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  dimmed?: boolean;
}) {
  if (hidden || !card) {
    return <div className="card back" aria-hidden="true" />;
  }
  const label = cardFr(card);
  const className = `card ${isRed(card.s) ? "red" : "ink"} ${dimmed ? "dim" : ""}`;
  if (!onClick) {
    return (
      <div className={className} role="img" aria-label={label}>
        <span>{rankShort(card.r)}</span>
        <strong>{suitGlyph(card.s)}</strong>
      </div>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled} aria-label={label}>
      <span>{rankShort(card.r)}</span>
      <strong>{suitGlyph(card.s)}</strong>
    </button>
  );
}

import { useId } from "react";
import { cardFr, isRed, rankShort, suitFr, type Card, type Suit } from "../shared/cards";

const HEART =
  "M0 8.4 C-0.4 6.4 -7.6 2.2 -7.6 -2.6 C-7.6 -7.2 -3.2 -8.6 0 -5.2 C3.2 -8.6 7.6 -7.2 7.6 -2.6 C7.6 2.2 0.4 6.4 0 8.4 Z";
const SPADE =
  "M0 -10 C-6.4 -2.2 -8.4 1.2 -5.6 5.4 C-3.8 8.2 -1.8 7.2 0 4.4 C1.8 7.2 3.8 8.2 5.6 5.4 C8.4 1.2 6.4 -2.2 0 -10 Z M-1.5 4.8 H1.5 L1.1 11 H-1.1 Z";
const DIAMOND = "M0 -11 L8.2 0 L0 11 L-8.2 0 Z";

function SuitShape({ suit, x, y, scale = 1, flip = false }: { suit: Card["s"]; x: number; y: number; scale?: number; flip?: boolean }) {
  const color = isRed(suit) ? "#9d1c28" : "#1b1714";
  if (suit === "t" || suit === "x") {
    return (
      <text x={x} y={y} textAnchor="middle" fontSize={16 * scale} fill={color}>
        {suit === "x" ? "✶" : "★"}
      </text>
    );
  }
  const sy = flip ? -scale : scale;
  if (suit === "c") {
    return (
      <g transform={`translate(${x} ${y}) scale(${scale} ${sy})`} fill={color}>
        <circle cx="0" cy="-6.1" r="6.3" />
        <circle cx="-6.4" cy="2.4" r="6.3" />
        <circle cx="6.4" cy="2.4" r="6.3" />
        <path d="M-2.1 3.2H2.1L1.3 13.4H-1.3Z" />
      </g>
    );
  }
  const d = suit === "h" ? HEART : suit === "s" ? SPADE : DIAMOND;
  return <path d={d} fill={color} transform={`translate(${x} ${y}) scale(${scale} ${sy})`} />;
}

const PIPS: Record<number, { x: number; y: number; flip?: boolean }[]> = {
  2: [
    { x: 80, y: 68 },
    { x: 80, y: 156, flip: true },
  ],
  3: [
    { x: 80, y: 64 },
    { x: 80, y: 112 },
    { x: 80, y: 160, flip: true },
  ],
  4: [
    { x: 56, y: 68 },
    { x: 104, y: 68 },
    { x: 56, y: 156, flip: true },
    { x: 104, y: 156, flip: true },
  ],
  5: [
    { x: 56, y: 68 },
    { x: 104, y: 68 },
    { x: 80, y: 112 },
    { x: 56, y: 156, flip: true },
    { x: 104, y: 156, flip: true },
  ],
  6: [
    { x: 56, y: 62 },
    { x: 104, y: 62 },
    { x: 56, y: 112 },
    { x: 104, y: 112 },
    { x: 56, y: 162, flip: true },
    { x: 104, y: 162, flip: true },
  ],
  7: [
    { x: 56, y: 60 },
    { x: 104, y: 60 },
    { x: 80, y: 86 },
    { x: 56, y: 112 },
    { x: 104, y: 112 },
    { x: 56, y: 164, flip: true },
    { x: 104, y: 164, flip: true },
  ],
  8: [
    { x: 56, y: 58 },
    { x: 104, y: 58 },
    { x: 56, y: 92 },
    { x: 104, y: 92 },
    { x: 56, y: 132, flip: true },
    { x: 104, y: 132, flip: true },
    { x: 56, y: 166, flip: true },
    { x: 104, y: 166, flip: true },
  ],
  9: [
    { x: 56, y: 56 },
    { x: 104, y: 56 },
    { x: 56, y: 88 },
    { x: 104, y: 88 },
    { x: 80, y: 112 },
    { x: 56, y: 136, flip: true },
    { x: 104, y: 136, flip: true },
    { x: 56, y: 168, flip: true },
    { x: 104, y: 168, flip: true },
  ],
  10: [
    { x: 56, y: 54 },
    { x: 104, y: 54 },
    { x: 56, y: 86 },
    { x: 104, y: 86 },
    { x: 80, y: 74 },
    { x: 80, y: 150, flip: true },
    { x: 56, y: 138, flip: true },
    { x: 104, y: 138, flip: true },
    { x: 56, y: 170, flip: true },
    { x: 104, y: 170, flip: true },
  ],
};

function Corner({ card }: { card: Card }) {
  const color = isRed(card.s) ? "#9d1c28" : "#1b1714";
  const label = rankShort(card.r);
  return (
    <g>
      <text x="16" y="40" fill={color} fontSize={label.length > 1 ? 26 : 34} fontFamily="Palatino, Georgia, serif" fontWeight="700">
        {label}
      </text>
      <SuitShape suit={card.s} x={30} y={58} scale={0.62} />
    </g>
  );
}

function Court({ card }: { card: Card }) {
  const color = isRed(card.s) ? "#9d1c28" : "#1b1714";
  const letter = card.r === 11 ? "V" : card.r === 12 ? "D" : "R";
  const title = card.r === 11 ? "VALET" : card.r === 12 ? "DAME" : "ROI";
  return (
    <g fill={color}>
      <rect x="46" y="70" width="68" height="84" rx="8" fill={color} opacity="0.06" />
      <rect x="46" y="70" width="68" height="84" rx="8" fill="none" stroke={color} strokeOpacity="0.35" />
      <SuitShape suit={card.s} x={80} y={88} scale={1.05} />
      <text x="80" y="124" textAnchor="middle" fontSize="42" fontFamily="Palatino, Georgia, serif" fontWeight="700" fill={color}>
        {letter}
      </text>
      <text x="80" y="140" textAnchor="middle" fontSize="10" letterSpacing="2.2" fontFamily="Palatino, Georgia, serif" fill={color}>
        {title}
      </text>
      <SuitShape suit={card.s} x={80} y={158} scale={1.05} flip />
    </g>
  );
}

function CardArt({ card }: { card: Card }) {
  const uid = useId().replace(/:/g, "");
  const color = isRed(card.s) ? "#9d1c28" : "#1b1714";
  const pips = card.r >= 2 && card.r <= 10 ? PIPS[card.r] : null;
  return (
    <svg viewBox="0 0 160 224" role="presentation">
      <defs>
        <linearGradient id={`paper${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffdf8" />
          <stop offset="1" stopColor="#f1e4d0" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="154" height="218" rx="14" fill={`url(#paper${uid})`} stroke="#e4d3b8" strokeWidth="2.5" />
      <rect x="9" y="9" width="142" height="206" rx="10" fill="none" stroke={color} strokeOpacity="0.28" />
      <Corner card={card} />
      <g transform="rotate(180 80 112)">
        <Corner card={card} />
      </g>
      {card.r === 14 ? <SuitShape suit={card.s} x={80} y={116} scale={3.15} /> : null}
      {card.r >= 11 && card.r <= 13 ? <Court card={card} /> : null}
      {pips?.map((pip, index) => (
        <SuitShape key={index} suit={card.s} x={pip.x} y={pip.y} scale={card.r >= 8 ? 0.92 : 1.05} flip={pip.flip} />
      ))}
    </svg>
  );
}

function CardBack() {
  const uid = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 160 224" aria-hidden="true">
      <defs>
        <pattern id={`lat${uid}`} width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M9 0 L18 9 L9 18 L0 9 Z" fill="none" stroke="#e6c98a" strokeOpacity="0.45" strokeWidth="0.7" />
        </pattern>
        <radialGradient id={`back${uid}`} cx="50%" cy="42%" r="70%">
          <stop offset="0" stopColor="#1a6a48" />
          <stop offset="1" stopColor="#083526" />
        </radialGradient>
      </defs>
      <rect x="3" y="3" width="154" height="218" rx="14" fill={`url(#back${uid})`} stroke="#d7b56a" strokeWidth="3" />
      <rect x="10" y="10" width="140" height="204" rx="10" fill={`url(#lat${uid})`} />
      <rect x="10" y="10" width="140" height="204" rx="10" fill="none" stroke="#e6c98a" strokeOpacity="0.8" />
      <ellipse cx="80" cy="112" rx="34" ry="46" fill="#07281c" stroke="#e6c98a" strokeWidth="2" />
      <ellipse cx="80" cy="112" rx="26" ry="36" fill="none" stroke="#e6c98a" strokeOpacity="0.65" />
      <text x="80" y="120" textAnchor="middle" fontSize="28" fontFamily="Palatino, Georgia, serif" fill="#f0d7a2" fontWeight="700">
        LF
      </text>
    </svg>
  );
}

function tarotRank(card: Card): string {
  if (card.s === "x") return "EX";
  if (card.s === "t") return String(card.r);
  if (card.r === 14) return "R";
  if (card.r === 13) return "D";
  if (card.r === 12) return "C";
  if (card.r === 11) return "V";
  return String(card.r);
}

function tarotTitle(card: Card): string {
  if (card.s === "x") return "Excuse";
  if (card.s === "t") return `${card.r} d'atout`;
  const name = card.r === 14 ? "Roi" : card.r === 13 ? "Dame" : card.r === 12 ? "Cavalier" : card.r === 11 ? "Valet" : card.r === 1 ? "As" : String(card.r);
  return `${name} de ${suitFr(card.s)}`;
}

function TarotArt({ card }: { card: Card }) {
  const uid = useId().replace(/:/g, "");
  const color = isRed(card.s) ? "#9d1c28" : "#1b1714";
  return (
    <svg viewBox="0 0 160 224" role="presentation">
      <defs>
        <linearGradient id={`paper${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffdf8" />
          <stop offset="1" stopColor="#f1e4d0" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="154" height="218" rx="14" fill={`url(#paper${uid})`} stroke="#e4d3b8" strokeWidth="2.5" />
      <text x="16" y="40" fill={color} fontSize="28" fontFamily="Palatino, Georgia, serif" fontWeight="700">
        {tarotRank(card)}
      </text>
      <text x="80" y="120" textAnchor="middle" fill={color} fontSize={card.s === "t" ? 54 : 28} fontFamily="Palatino, Georgia, serif" fontWeight="700">
        {card.s === "t" ? card.r : card.s === "x" ? "✶" : tarotRank(card)}
      </text>
      <text x="80" y="148" textAnchor="middle" fill={color} fontSize="12" fontFamily="Palatino, Georgia, serif">
        {card.s === "t" ? "ATOUT" : card.s === "x" ? "EXCUSE" : suitFr(card.s)}
      </text>
    </svg>
  );
}

export function PlayingCard({
  card,
  hidden = false,
  onClick,
  disabled = false,
  dimmed = false,
  naming = "poker",
}: {
  card?: Card | null;
  hidden?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  dimmed?: boolean;
  naming?: "poker" | "tarot";
}) {
  const faceDown = hidden || !card;
  const className = `playing-card ${dimmed ? "dim" : ""}`;
  const art = faceDown ? <CardBack /> : naming === "tarot" ? <TarotArt card={card} /> : <CardArt card={card} />;
  const label = faceDown || !card ? "Carte cachée" : naming === "tarot" ? tarotTitle(card) : cardFr(card);
  if (!onClick) {
    return (
      <div className={className} role={faceDown ? undefined : "img"} aria-hidden={faceDown ? true : undefined} aria-label={faceDown ? undefined : label}>
        {art}
      </div>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled} aria-label={label}>
      {art}
    </button>
  );
}

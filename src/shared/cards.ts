export const SUITS = ["s", "h", "d", "c"] as const;
export type Suit = (typeof SUITS)[number];

export type Card = {
  r: number;
  s: Suit;
};

export function isCard(value: unknown): value is Card {
  if (!value || typeof value !== "object") return false;
  const card = value as Card;
  return (
    typeof card.r === "number" &&
    Number.isInteger(card.r) &&
    (SUITS as readonly string[]).includes(card.s) &&
    Object.keys(card).length === 2
  );
}

export function sameCard(a: Card, b: Card): boolean {
  return a.r === b.r && a.s === b.s;
}

export function cardKey(card: Card): string {
  return `${card.r}${card.s}`;
}

export function pokerDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (let r = 2; r <= 14; r += 1) deck.push({ r, s });
  }
  return deck;
}

export function beloteDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (const r of [7, 8, 9, 10, 11, 12, 13, 14]) deck.push({ r, s });
  }
  return deck;
}

const RANK_FR: Record<number, string> = {
  11: "Valet",
  12: "Dame",
  13: "Roi",
  14: "As",
};

const RANK_SHORT: Record<number, string> = {
  11: "V",
  12: "D",
  13: "R",
  14: "A",
};

const SUIT_FR: Record<Suit, string> = {
  s: "pique",
  h: "cœur",
  d: "carreau",
  c: "trèfle",
};

const SUIT_GLYPH: Record<Suit, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

export function rankFr(rank: number): string {
  return RANK_FR[rank] ?? String(rank);
}

export function rankShort(rank: number): string {
  return RANK_SHORT[rank] ?? String(rank);
}

export function suitFr(suit: Suit): string {
  return SUIT_FR[suit];
}

export function suitGlyph(suit: Suit): string {
  return SUIT_GLYPH[suit];
}

export function cardFr(card: Card): string {
  return `${rankFr(card.r)} de ${suitFr(card.s)}`;
}

export function isRed(suit: Suit): boolean {
  return suit === "h" || suit === "d";
}

export function collectCards(value: unknown, acc: Card[] = [], seen = new Set<object>()): Card[] {
  if (!value || typeof value !== "object") return acc;
  if (seen.has(value)) return acc;
  seen.add(value);
  if (isCard(value)) {
    acc.push(value);
    return acc;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectCards(item, acc, seen);
    return acc;
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === "deck" || key === "token") {
      throw new Error("Fuite interdite dans la vue joueur.");
    }
    collectCards(item, acc, seen);
  }
  return acc;
}

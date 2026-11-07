import type { Card } from "../cards";
import type { HoldemView, PokerAction } from "./holdem";

/** Décide à partir de la vue du joueur : cartes cachées adverses invisibles. */
export function choosePokerAction(view: HoldemView): PokerAction {
  const legal = view.you.legal;
  if (!legal) return { type: "check" };
  const hole = view.you.hole;
  const strength = hole ? preflopScore(hole) : 0;
  const made = view.board.length > 0 ? madeCategory(view) : 0;
  if (view.board.length === 0) {
    if (strength >= 8 && legal.raise && !legal.raise.short) {
      return { type: "bet", amount: legal.raise.minTo };
    }
    if (strength >= 4.5) {
      if (legal.check) return { type: "check" };
      if (legal.call !== null) return { type: "call" };
    }
    if (legal.check) return { type: "check" };
    if (legal.fold) return { type: "fold" };
    if (legal.call !== null) return { type: "call" };
    return { type: "check" };
  }
  if (made >= 2 && legal.raise) return { type: "bet", amount: legal.raise.minTo };
  if (made >= 1 || legal.call === null || legal.call === 0) {
    if (legal.check) return { type: "check" };
    if (legal.call !== null && legal.call <= Math.max(view.pot, view.bb)) return { type: "call" };
  }
  if (legal.check) return { type: "check" };
  if (legal.fold) return { type: "fold" };
  if (legal.call !== null) return { type: "call" };
  return { type: "check" };
}

function preflopScore(hole: [Card, Card]): number {
  const [high, low] = [...hole].sort((a, b) => b.r - a.r);
  let score = 0;
  if (high!.r === low!.r) score += 6 + (high!.r - 10) / 2;
  else {
    score += (high!.r + low!.r) / 8;
    if (high!.s === low!.s) score += 1.4;
    if (high!.r - low!.r === 1) score += 0.5;
  }
  if (high!.r === 14 && low!.r >= 12) score += 2;
  return score;
}

function madeCategory(view: HoldemView): number {
  const hole = view.you.hole;
  if (!hole || view.board.length < 3) return 0;
  const cards = [...hole, ...view.board];
  const ranks = cards.map((card) => card.r);
  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const holePaired = hole.some((card) => (counts.get(card.r) ?? 0) >= 2);
  const bestCount = Math.max(...counts.values());
  if (bestCount >= 4) return 7;
  if (bestCount === 3 && [...counts.values()].filter((count) => count >= 2).length >= 2) return 6;
  const flush = ["s", "h", "d", "c"].some((suit) => cards.filter((card) => card.s === suit).length >= 5);
  if (flush) return 5;
  if (bestCount === 3 && holePaired) return 3;
  const pairs = [...counts.values()].filter((count) => count >= 2).length;
  if (pairs >= 2 && holePaired) return 2;
  if (holePaired) return 1;
  return 0;
}

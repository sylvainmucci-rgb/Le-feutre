import { type Card, type Suit } from "../cards";
import { type BeloteAction, type BeloteView, winningIndex } from "./engine";

/** Décide à partir de la vue du joueur, sans les mains adverses. */
export function chooseBeloteAction(view: BeloteView): BeloteAction {
  if (view.phase === "bidding1" && view.faceUp) {
    return suitScore(view.you.hand, view.faceUp.s) >= 26 ? { type: "take" } : { type: "pass" };
  }
  if (view.phase === "bidding2" && view.faceUp) {
    let best: Suit | null = null;
    let bestScore = 0;
    for (const suit of ["s", "h", "d", "c"] as const) {
      if (suit === view.faceUp.s) continue;
      const score = suitScore(view.you.hand, suit);
      if (score > bestScore) {
        bestScore = score;
        best = suit;
      }
    }
    if (best && bestScore >= 32) return { type: "take", suit: best };
    return { type: "pass" };
  }
  if (view.phase === "play" && view.trump && view.legalCards.length > 0) {
    return { type: "play", card: pickCard(view) };
  }
  return { type: "pass" };
}

function suitScore(hand: readonly Card[], trump: Card["s"]): number {
  if (trump === "t" || trump === "x") return 0;
  let score = 0;
  let count = 0;
  for (const card of hand) {
    if (card.s !== trump) continue;
    count += 1;
    score += { 11: 30, 9: 22, 14: 12, 10: 8, 13: 4, 12: 3, 8: 1, 7: 1 }[card.r] ?? 0;
  }
  if (count >= 3) score += 8;
  return score;
}

function pickCard(view: BeloteView): Card {
  const trump = view.trump!;
  const legal = view.legalCards;
  if (view.trick.length === 0) {
    const plain = legal.filter((card) => card.s !== trump);
    return weakest(plain.length > 0 ? plain : legal, trump);
  }
  const partner = (view.you.seat + 2) % 4;
  const winner = view.trick[winningIndex(view.trick, trump)]!;
  if (winner.seat === partner) return weakest(legal, trump);
  const winning = legal.filter((card) => wouldWin(view, card));
  if (winning.length > 0) return weakest(winning, trump);
  return weakest(legal, trump);
}

function wouldWin(view: BeloteView, card: Card): boolean {
  const trick = [...view.trick, { seat: view.you.seat, card }];
  return trick[winningIndex(trick, view.trump!)]!.seat === view.you.seat;
}

function weakest(cards: readonly Card[], trump: Suit): Card {
  return [...cards].sort((a, b) => rankValue(a, trump) - rankValue(b, trump))[0]!;
}

function rankValue(card: Card, trump: Suit): number {
  const order = card.s === trump ? [11, 9, 14, 10, 13, 12, 8, 7] : [14, 10, 13, 12, 11, 9, 8, 7];
  return 20 - order.indexOf(card.r);
}

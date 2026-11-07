import type { Card } from "../cards";

/**
 * Évalue la meilleure main de poker parmi 5 à 7 cartes.
 * Le score est comparé dans l'ordre lexicographique.
 * 8 quinte flush, 7 carré, 6 full, 5 couleur, 4 suite,
 * 3 brelan, 2 double paire, 1 paire, 0 hauteur.
 * L'as vaut 14, sauf dans la suite A-2-3-4-5 où elle culmine à 5.
 */

function combinationsOf<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  const current: T[] = [];
  const walk = (start: number) => {
    if (current.length === size) {
      out.push([...current]);
      return;
    }
    for (let i = start; i < items.length; i += 1) {
      current.push(items[i]!);
      walk(i + 1);
      current.pop();
    }
  };
  walk(0);
  return out;
}

export function scoreFive(cards: readonly Card[]): number[] {
  if (cards.length !== 5) throw new Error("Une main de cinq cartes est requise.");
  const ranks = cards.map((card) => card.r).sort((a, b) => b - a);
  const flush = cards.every((card) => card.s === cards[0]!.s);
  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const unique = [...new Set(ranks)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0]! - unique[4]! === 4) straightHigh = unique[0]!;
    else if (unique.join(",") === "14,5,4,3,2") straightHigh = 5;
  }
  if (flush && straightHigh) return [8, straightHigh];
  if (groups[0]![1] === 4) return [7, groups[0]![0], groups[1]![0]];
  if (groups[0]![1] === 3 && groups[1]![1] === 2) return [6, groups[0]![0], groups[1]![0]];
  if (flush) return [5, ...unique];
  if (straightHigh) return [4, straightHigh];
  if (groups[0]![1] === 3) {
    const kickers = groups
      .slice(1)
      .map((group) => group[0])
      .sort((a, b) => b - a);
    return [3, groups[0]![0], ...kickers];
  }
  if (groups[0]![1] === 2 && groups[1]![1] === 2) {
    const high = Math.max(groups[0]![0], groups[1]![0]);
    const low = Math.min(groups[0]![0], groups[1]![0]);
    return [2, high, low, groups[2]![0]];
  }
  if (groups[0]![1] === 2) {
    const kickers = groups
      .slice(1)
      .map((group) => group[0])
      .sort((a, b) => b - a);
    return [1, groups[0]![0], ...kickers];
  }
  return [0, ...unique];
}

export function compareScores(left: readonly number[], right: readonly number[]): number {
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

export type BestHand = {
  score: number[];
  five: Card[];
};

export function bestHand(cards: readonly Card[]): BestHand {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error("L'évaluation demande entre 5 et 7 cartes.");
  }
  let best: BestHand | null = null;
  for (const five of combinationsOf(cards, 5)) {
    const score = scoreFive(five);
    if (!best || compareScores(score, best.score) > 0) best = { score, five };
  }
  return best!;
}

export function rankLabel(score: readonly number[]): string {
  if (score[0] === 8 && score[1] === 14) return "Quinte flush royale";
  if (score[0] === 8) return "Quinte flush";
  const names = ["Hauteur", "Paire", "Double paire", "Brelan", "Suite", "Couleur", "Full", "Carré"];
  return names[score[0] ?? 0] ?? "Main";
}

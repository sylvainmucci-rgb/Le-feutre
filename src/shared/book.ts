/** Classement partagé : on garde le plus haut total, jamais une somme. */

export type ScoreLine = { nickname: string; victories: number };
export type DuelLine = { left: string; right: string; leftWins: number; rightWins: number };
export type Book = { ranking: ScoreLine[]; duels: DuelLine[] };

const NICK = /^[\p{L}\p{N} '’.-]{2,18}$/u;

export function emptyBook(): Book {
  return { ranking: [], duels: [] };
}

function nickOk(value: string): boolean {
  return NICK.test(value);
}

function countOk(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 100_000;
}

export function sanitizeBook(value: unknown): Book {
  if (!value || typeof value !== "object") return emptyBook();
  const raw = value as { ranking?: unknown; duels?: unknown };
  const ranking: ScoreLine[] = [];
  if (Array.isArray(raw.ranking)) {
    for (const item of raw.ranking.slice(0, 30)) {
      if (!item || typeof item !== "object") continue;
      const nickname = String((item as ScoreLine).nickname ?? "").trim();
      const victories = Number((item as ScoreLine).victories);
      if (!nickOk(nickname) || !countOk(victories)) continue;
      ranking.push({ nickname, victories });
    }
  }
  const duels: DuelLine[] = [];
  if (Array.isArray(raw.duels)) {
    for (const item of raw.duels.slice(0, 40)) {
      if (!item || typeof item !== "object") continue;
      const left = String((item as DuelLine).left ?? "").trim();
      const right = String((item as DuelLine).right ?? "").trim();
      const leftWins = Number((item as DuelLine).leftWins);
      const rightWins = Number((item as DuelLine).rightWins);
      if (!nickOk(left) || !nickOk(right) || left === right || !countOk(leftWins) || !countOk(rightWins)) continue;
      duels.push(orderedDuel(left, right, leftWins, rightWins));
    }
  }
  return { ranking, duels };
}

function orderedDuel(a: string, b: string, winsA: number, winsB: number): DuelLine {
  if (a < b) return { left: a, right: b, leftWins: winsA, rightWins: winsB };
  return { left: b, right: a, leftWins: winsB, rightWins: winsA };
}

export function mergeBooks(base: Book, extra: Book): Book {
  const ranking = new Map<string, number>();
  for (const line of [...base.ranking, ...extra.ranking]) {
    ranking.set(line.nickname, Math.max(ranking.get(line.nickname) ?? 0, line.victories));
  }
  const duels = new Map<string, DuelLine>();
  for (const duel of [...base.duels, ...extra.duels]) {
    const ordered = orderedDuel(duel.left, duel.right, duel.leftWins, duel.rightWins);
    const id = `${ordered.left}|${ordered.right}`;
    const previous = duels.get(id);
    duels.set(id, {
      left: ordered.left,
      right: ordered.right,
      leftWins: Math.max(previous?.leftWins ?? 0, ordered.leftWins),
      rightWins: Math.max(previous?.rightWins ?? 0, ordered.rightWins),
    });
  }
  return {
    ranking: [...ranking.entries()]
      .map(([nickname, victories]) => ({ nickname, victories }))
      .sort((a, b) => b.victories - a.victories || a.nickname.localeCompare(b.nickname, "fr"))
      .slice(0, 30),
    duels: [...duels.values()].slice(0, 40),
  };
}

export function duelLabel(duel: DuelLine): string {
  return `${duel.left} ${duel.leftWins}-${duel.rightWins} ${duel.right}`;
}

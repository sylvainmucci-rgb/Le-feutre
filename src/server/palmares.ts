/**
 * Palmarès en mémoire du processus.
 * Un redémarrage ou l'endormissement de l'offre gratuite l'efface.
 * Aucun gain réel : ce sont des parties entre amis.
 */

export type Duel = { left: string; right: string; leftWins: number; rightWins: number };

const wins = new Map<string, number>();
const duels = new Map<string, Duel>();

function key(a: string, b: string): [string, string, string] {
  return a < b ? [a, b, `${a}|${b}`] : [b, a, `${b}|${a}`];
}

export function recordOutcome(winners: string[], losers: string[]) {
  const uniqueWinners = [...new Set(winners)];
  const uniqueLosers = [...new Set(losers)].filter((name) => !uniqueWinners.includes(name));
  for (const name of uniqueWinners) wins.set(name, (wins.get(name) ?? 0) + 1);
  for (const winner of uniqueWinners) {
    for (const loser of uniqueLosers) {
      const [left, right, id] = key(winner, loser);
      const duel = duels.get(id) ?? { left, right, leftWins: 0, rightWins: 0 };
      if (winner === left) duel.leftWins += 1;
      else duel.rightWins += 1;
      duels.set(id, duel);
    }
  }
}

export function palmaresSnapshot() {
  return {
    note: "Palmarès gardé en mémoire seulement. Un redémarrage l'efface. Aucun gain réel.",
    ranking: [...wins.entries()]
      .map(([nickname, victories]) => ({ nickname, victories }))
      .sort((a, b) => b.victories - a.victories || a.nickname.localeCompare(b.nickname, "fr"))
      .slice(0, 12),
    duels: [...duels.values()].slice(-24).reverse(),
  };
}

type LooseEngine = {
  kind: string;
  phase: string;
  players: { nickname: string; stack?: number; score?: number; carton?: boolean; chips?: number }[];
  scores?: number[] | [number, number];
};

export function winnersFrom(engine: LooseEngine): { winners: string[]; losers: string[] } | null {
  if (engine.phase !== "match-over") return null;
  const names = engine.players.map((seat) => seat.nickname);
  if (engine.kind === "texas-holdem" || engine.kind === "omaha" || engine.kind === "stud" || engine.kind === "draw") {
    const winners = engine.players.filter((seat) => (seat.stack ?? 0) > 0).map((seat) => seat.nickname);
    return { winners, losers: names.filter((name) => !winners.includes(name)) };
  }
  if (engine.kind === "belote" || engine.kind === "coinche" || engine.kind === "manille" || engine.kind === "ecarte") {
    const scores = engine.scores ?? [0, 0];
    if (scores[0] === scores[1]) return { winners: [], losers: [] };
    const team = (scores[0] ?? 0) > (scores[1] ?? 0) ? 0 : 1;
    const winners = engine.players.filter((_, index) => index % 2 === team).map((seat) => seat.nickname);
    return { winners, losers: names.filter((name) => !winners.includes(name)) };
  }
  if (engine.kind === "loto") {
    const winners = engine.players.filter((seat) => seat.carton).map((seat) => seat.nickname);
    return { winners, losers: names.filter((name) => !winners.includes(name)) };
  }
  let best = -Infinity;
  const winners: string[] = [];
  engine.players.forEach((seat) => {
    const score = seat.score ?? seat.chips ?? 0;
    if (score > best) {
      best = score;
      winners.length = 0;
      winners.push(seat.nickname);
    } else if (score === best) winners.push(seat.nickname);
  });
  return { winners, losers: names.filter((name) => !winners.includes(name)) };
}

export function resetPalmares() {
  wins.clear();
  duels.clear();
}

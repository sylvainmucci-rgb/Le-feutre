import type { Rng } from "../rng";

/**
 * Loto de salon, affichable sur un téléviseur.
 * Tirage de 1 à 90, sans remise. Chaque carton a trois lignes de cinq numéros.
 * Une ligne complète est une quine. Les quinze numéros, c'est le carton.
 * Aucun enjeu : on ne gagne rien d'autre que le plaisir d'annoncer.
 */

export type LotoAction = { type: "draw" };

type CardRow = number[];

export type LotoState = {
  kind: "loto";
  phase: "play" | "scoring" | "match-over";
  drawn: number[];
  last: number | null;
  players: { id: string; nickname: string; isBot: boolean; rows: CardRow[]; quine: boolean; carton: boolean }[];
  result: { summary: string } | null;
  log: string[];
};

function push(state: LotoState, line: string) {
  state.log.push(line);
  if (state.log.length > 40) state.log.shift();
}

export function makeCard(rng: Rng, used: Set<number>): CardRow[] {
  const rows: CardRow[] = [[], [], []];
  const pool = Array.from({ length: 90 }, (_, index) => index + 1).filter((n) => !used.has(n));
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  const picked = pool.slice(0, 15);
  picked.forEach((n) => used.add(n));
  const sorted = [...picked].sort((a, b) => a - b);
  sorted.forEach((n, index) => rows[index % 3]!.push(n));
  return rows.map((row) => row.sort((a, b) => a - b));
}

export function createLoto(seats: { id: string; nickname: string; isBot?: boolean }[], rng: Rng): LotoState {
  if (seats.length < 1 || seats.length > 6) throw new Error("Le loto se joue de 1 à 6 cartons.");
  const used = new Set<number>();
  const state: LotoState = {
    kind: "loto",
    phase: "play",
    drawn: [],
    last: null,
    players: seats.map((seat) => ({
      id: seat.id,
      nickname: seat.nickname,
      isBot: Boolean(seat.isBot),
      rows: makeCard(rng, used),
      quine: false,
      carton: false,
    })),
    result: null,
    log: ["Loto. Tirage de 1 à 90. Quine sur une ligne, carton sur les quinze numéros."],
  };
  return state;
}

export function applyLoto(state: LotoState, _playerId: string, action: LotoAction, rng: Rng): LotoState {
  if (state.phase !== "play" || action.type !== "draw") throw new Error("Le tirage est terminé.");
  const next = structuredClone(state);
  const left = Array.from({ length: 90 }, (_, index) => index + 1).filter((n) => !next.drawn.includes(n));
  if (left.length === 0) throw new Error("Tous les numéros sont sortis.");
  const number = left[Math.floor(rng() * left.length)]!;
  next.drawn.push(number);
  next.last = number;
  push(next, `Numéro ${number}.`);
  const freshQuine: string[] = [];
  const freshCarton: string[] = [];
  for (const seat of next.players) {
    const hadQuine = seat.quine;
    seat.quine = seat.rows.some((row) => row.every((n) => next.drawn.includes(n)));
    seat.carton = seat.rows.flat().every((n) => next.drawn.includes(n));
    if (!hadQuine && seat.quine) freshQuine.push(seat.nickname);
    if (seat.carton) freshCarton.push(seat.nickname);
  }
  if (freshQuine.length) push(next, `Quine : ${freshQuine.join(", ")}.`);
  if (freshCarton.length) {
    next.phase = "match-over";
    next.result = { summary: `Carton de ${freshCarton.join(", ")}. Rien à gagner, sinon les applaudissements.` };
    push(next, next.result.summary);
  }
  return next;
}

export function continueLoto(state: LotoState, rng: Rng): LotoState {
  const fresh = createLoto(
    state.players.map((seat) => ({ id: seat.id, nickname: seat.nickname, isBot: seat.isBot })),
    rng,
  );
  fresh.log.unshift("Nouveau tirage.");
  return fresh;
}

export function actorLoto(): string | null {
  return null;
}

export function hiddenLoto(): never[] {
  return [];
}

export function projectLoto(state: LotoState, playerId: string) {
  const me = state.players.find((seat) => seat.id === playerId) ?? state.players[0];
  return {
    kind: "loto" as const,
    phase: state.phase,
    last: state.last,
    drawn: [...state.drawn],
    you: me ? { id: me.id, rows: me.rows.map((row) => [...row]), quine: me.quine, carton: me.carton } : null,
    seats: state.players.map((seat) => ({
      id: seat.id,
      nickname: seat.nickname,
      quine: seat.quine,
      carton: seat.carton,
    })),
    prompts: state.phase === "play" ? [{ label: "Tirer un numéro", action: { type: "draw" } }] : [],
    result: state.result,
    log: [...state.log],
  };
}

export function chooseLoto(): LotoAction {
  return { type: "draw" };
}

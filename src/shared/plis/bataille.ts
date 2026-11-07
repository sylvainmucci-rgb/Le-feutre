import { beloteDeck, cardFr, sameCard, type Card } from "../cards";
import { shuffle, type Rng } from "../rng";

/**
 * Bataille corse, partie courte.
 * Jeu de 32 cartes, deux à six joueurs. L'as est le plus fort, puis le roi, la dame,
 * le valet, le 10, le 9, le 8 et le 7. Pas d'atout, la couleur ne départage pas.
 * Chacun choisit une carte en secret. On les retourne ensemble.
 * La plus forte emporte le tas. Égalité des plus fortes : bataille, ces joueurs
 * rejouent une carte et le gagnant prend tout le tas.
 * À la fin de la donne, 1 point pour le plus de cartes ramassées. Partie en 5.
 * Variante assumée : on ne rejoue pas jusqu'à ce qu'un seul possède tout le paquet,
 * partie qui peut ne pas finir. Chaque donne est indépendante.
 */

const ORDER = [14, 13, 12, 11, 10, 9, 8, 7];

export type BatailleAction = { type: "play"; card: Card };

type Seat = { id: string; nickname: string; hand: Card[]; won: Card[]; isBot: boolean; pick: Card | null };

export type BatailleState = {
  kind: "bataille";
  players: Seat[];
  phase: "choose" | "scoring" | "match-over";
  pile: Card[];
  tied: number[] | null;
  scores: number[];
  dealNo: number;
  result: { summary: string } | null;
  log: string[];
};

function strength(card: Card): number {
  const index = ORDER.indexOf(card.r);
  if (index < 0) throw new Error("Carte hors bataille.");
  return index;
}

function push(state: BatailleState, line: string) {
  state.log.push(line);
  if (state.log.length > 40) state.log.shift();
}

export function createBataille(seats: { id: string; nickname: string; isBot?: boolean }[], rng: Rng): BatailleState {
  if (seats.length < 2 || seats.length > 6) throw new Error("La bataille corse se joue de 2 à 6.");
  const state: BatailleState = {
    kind: "bataille",
    players: seats.map((seat) => ({ id: seat.id, nickname: seat.nickname, hand: [], won: [], isBot: Boolean(seat.isBot), pick: null })),
    phase: "choose",
    pile: [],
    tied: null,
    scores: seats.map(() => 0),
    dealNo: 0,
    result: null,
    log: [],
  };
  return dealBataille(state, rng);
}

export function dealBataille(state: BatailleState, rng: Rng): BatailleState {
  const next = structuredClone(state);
  next.phase = "choose";
  next.pile = [];
  next.tied = null;
  next.result = null;
  next.dealNo += 1;
  const deck = shuffle(beloteDeck(), rng);
  const each = Math.floor(32 / next.players.length);
  for (const seat of next.players) {
    seat.hand = [];
    seat.won = [];
    seat.pick = null;
  }
  for (let i = 0; i < each * next.players.length; i += 1) next.players[i % next.players.length]!.hand.push(deck[i]!);
  push(next, `Donne ${next.dealNo}. Bataille corse, l'as est le plus fort.`);
  return next;
}

function waiting(state: BatailleState): number[] {
  return state.players
    .map((seat, index) => ({ seat, index }))
    .filter(({ seat, index }) => seat.hand.length > 0 && (state.tied === null || state.tied.includes(index)) && seat.pick === null)
    .map(({ index }) => index);
}

function resolve(state: BatailleState) {
  const shown = state.players
    .map((seat, index) => ({ index, card: seat.pick }))
    .filter((item): item is { index: number; card: Card } => item.card !== null);
  for (const item of shown) {
    state.pile.push(item.card);
    state.players[item.index]!.pick = null;
    push(state, `${state.players[item.index]!.nickname} retourne ${cardFr(item.card)}.`);
  }
  let best = strength(shown[0]!.card);
  let leaders = [shown[0]!.index];
  for (const item of shown.slice(1)) {
    const value = strength(item.card);
    if (value < best) {
      best = value;
      leaders = [item.index];
    } else if (value === best) leaders.push(item.index);
  }
  if (leaders.length > 1 && leaders.some((index) => state.players[index]!.hand.length > 0)) {
    state.tied = leaders;
    push(state, "Bataille : les ex æquo rejouent une carte.");
    return;
  }
  const winner = leaders[0]!;
  state.players[winner]!.won.push(...state.pile);
  push(state, `${state.players[winner]!.nickname} ramasse ${state.pile.length} cartes.`);
  state.pile = [];
  state.tied = null;
  if (state.players.every((seat) => seat.hand.length === 0)) finishDeal(state);
}

function finishDeal(state: BatailleState) {
  let best = -1;
  let leaders: number[] = [];
  state.players.forEach((seat, index) => {
    if (seat.won.length > best) {
      best = seat.won.length;
      leaders = [index];
    } else if (seat.won.length === best) leaders.push(index);
  });
  if (leaders.length === 1) state.scores[leaders[0]!] += 1;
  const summary =
    leaders.length === 1
      ? `${state.players[leaders[0]!]!.nickname} marque 1 (${best} cartes).`
      : `Égalité, personne ne marque.`;
  state.result = { summary };
  state.phase = state.scores.some((score) => score >= 5) ? "match-over" : "scoring";
  push(state, summary);
}

export function applyBataille(state: BatailleState, playerId: string, action: BatailleAction): BatailleState {
  if (state.phase !== "choose" || action.type !== "play") throw new Error("Choisissez une carte.");
  const next = structuredClone(state);
  const seat = next.players.findIndex((player) => player.id === playerId);
  if (seat < 0) throw new Error("Joueur introuvable.");
  if (!waiting(next).includes(seat)) throw new Error("Vous avez déjà choisi.");
  const hand = next.players[seat]!.hand;
  const at = hand.findIndex((card) => sameCard(card, action.card));
  if (at < 0) throw new Error("Cette carte n'est pas dans votre main.");
  hand.splice(at, 1);
  next.players[seat]!.pick = action.card;
  if (waiting(next).length === 0) resolve(next);
  return next;
}

export function continueBataille(state: BatailleState, rng: Rng): BatailleState {
  if (state.phase === "choose") throw new Error("La donne n'est pas finie.");
  if (state.phase === "match-over") {
    const fresh = structuredClone(state);
    fresh.scores = fresh.players.map(() => 0);
    fresh.dealNo = 0;
    fresh.log = ["Nouvelle bataille."];
    fresh.phase = "scoring";
    return dealBataille(fresh, rng);
  }
  return dealBataille(state, rng);
}

export function actorBataille(state: BatailleState): string | null {
  if (state.phase !== "choose") return null;
  const next = waiting(state)[0];
  if (next === undefined) return null;
  return state.players[next]!.id;
}

export function hiddenBataille(state: BatailleState, playerId: string): Card[] {
  const hidden: Card[] = [];
  for (const seat of state.players) {
    if (seat.id !== playerId) hidden.push(...seat.hand);
    if (seat.pick && seat.id !== playerId) hidden.push(seat.pick);
  }
  return hidden;
}

export function projectBataille(state: BatailleState, playerId: string) {
  const me = state.players.findIndex((seat) => seat.id === playerId);
  if (me < 0) throw new Error("Joueur introuvable.");
  const choosing = state.phase === "choose" && waiting(state).includes(me);
  return {
    kind: "bataille" as const,
    phase: state.phase,
    trumpLabel: "Bataille corse · l'as mène, sans atout",
    scores: state.scores.map((score, index) => `${state.players[index]!.nickname} ${score}`).join(" · "),
    trick: state.players
      .map((seat, index) => (seat.pick && seat.id === playerId ? { seat: index, card: { ...seat.pick } } : null))
      .filter((item): item is { seat: number; card: Card } => item !== null),
    you: { seat: me, hand: state.players[me]!.hand.map((card) => ({ ...card })) },
    seats: state.players.map((seat, index) => ({
      id: seat.id,
      nickname: seat.nickname,
      seat: index,
      cards: seat.hand.length + (seat.pick ? 1 : 0),
      isTurn: state.phase === "choose" && waiting(state).includes(index),
      tags: seat.pick ? "carte cachée" : `${seat.won.length} ramassées`,
    })),
    legalCards: choosing ? state.players[me]!.hand.map((card) => ({ ...card })) : [],
    prompts: [] as { label: string; action: object }[],
    result: state.result,
    log: [...state.log],
  };
}

export function chooseBataille(view: ReturnType<typeof projectBataille>): BatailleAction {
  const card = [...view.legalCards].sort((a, b) => strength(b) - strength(a))[0];
  if (!card) throw new Error("Aucune carte.");
  return { type: "play", card };
}

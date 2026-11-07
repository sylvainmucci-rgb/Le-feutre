import { beloteDeck, cardFr, cardKey, sameCard, type Card, type Suit } from "../cards";
import { shuffle, type Rng } from "../rng";

/**
 * Manille muette, usage du Sud-Ouest.
 * 32 cartes, quatre joueurs, équipes 0-2 contre 1-3, sans atout.
 * L'ordre est 10, as, roi, dame, valet, 9, 8, 7. Le 10 est la manille.
 * Points : 10 = 5, as = 4, roi = 3, dame = 2, valet = 1, le reste 0 (60),
 * plus 10 pour le dernier pli : 70. Il faut plus que l'adversaire.
 * Partie en 101. On doit fournir. Pas de coupe, puisqu'il n'y a pas d'atout.
 */

const ORDER = [10, 14, 13, 12, 11, 9, 8, 7];
const POINTS: Record<number, number> = { 10: 5, 14: 4, 13: 3, 12: 2, 11: 1, 9: 0, 8: 0, 7: 0 };

export type ManilleAction = { type: "play"; card: Card };

type Seat = { id: string; nickname: string; hand: Card[]; isBot: boolean };
type Play = { seat: number; card: Card };

export type ManilleState = {
  kind: "manille";
  players: Seat[];
  dealer: number;
  turn: number;
  phase: "play" | "scoring" | "match-over";
  trick: Play[];
  won: [Card[], Card[]];
  scores: [number, number];
  dealNo: number;
  result: { summary: string } | null;
  log: string[];
  target: number;
};

function rank(card: Card): number {
  const index = ORDER.indexOf(card.r);
  if (index < 0) throw new Error("Carte hors manille.");
  return index;
}

export function manillePoints(cards: readonly Card[], lastTrick: boolean): number {
  return cards.reduce((sum, card) => sum + (POINTS[card.r] ?? 0), 0) + (lastTrick ? 10 : 0);
}

export function legalManille(hand: readonly Card[], trick: readonly Play[]): Card[] {
  if (trick.length === 0) return [...hand];
  const led = trick[0]!.card.s;
  const follow = hand.filter((card) => card.s === led);
  return follow.length > 0 ? follow : [...hand];
}

function winner(trick: readonly Play[]): number {
  let best = 0;
  for (let i = 1; i < trick.length; i += 1) {
    const card = trick[i]!.card;
    const lead = trick[best]!.card;
    if (card.s === lead.s && rank(card) < rank(lead)) best = i;
  }
  return trick[best]!.seat;
}

function log(state: ManilleState, line: string) {
  state.log.push(line);
  if (state.log.length > 40) state.log.shift();
}

export function createManille(seats: { id: string; nickname: string; isBot?: boolean }[], rng: Rng): ManilleState {
  if (seats.length !== 4) throw new Error("La manille se joue à quatre.");
  const state: ManilleState = {
    kind: "manille",
    players: seats.map((seat) => ({ id: seat.id, nickname: seat.nickname, hand: [], isBot: Boolean(seat.isBot) })),
    dealer: 3,
    turn: 0,
    phase: "play",
    trick: [],
    won: [[], []],
    scores: [0, 0],
    dealNo: 0,
    result: null,
    log: [],
    target: 101,
  };
  return dealManille(state, rng);
}

export function dealManille(state: ManilleState, rng: Rng): ManilleState {
  const next = structuredClone(state);
  next.dealer = (next.dealer + 1) % 4;
  next.turn = (next.dealer + 1) % 4;
  next.phase = "play";
  next.trick = [];
  next.won = [[], []];
  next.result = null;
  next.dealNo += 1;
  const deck = shuffle(beloteDeck(), rng);
  for (const seat of next.players) seat.hand = [];
  for (let i = 0; i < 32; i += 1) next.players[i % 4]!.hand.push(deck[i]!);
  log(next, `Donne ${next.dealNo}. Manille muette, sans atout. Le 10 est le plus fort.`);
  return next;
}

export function applyManille(state: ManilleState, playerId: string, action: ManilleAction): ManilleState {
  if (state.phase !== "play" || action.type !== "play") throw new Error("Ce n'est pas le moment de jouer.");
  const next = structuredClone(state);
  const seat = next.players.findIndex((player) => player.id === playerId);
  if (seat !== next.turn) throw new Error("Ce n'est pas votre tour.");
  const legal = legalManille(next.players[seat]!.hand, next.trick);
  if (!legal.some((card) => sameCard(card, action.card))) throw new Error("Cette carte n'est pas jouable.");
  const at = next.players[seat]!.hand.findIndex((card) => sameCard(card, action.card));
  next.players[seat]!.hand.splice(at, 1);
  next.trick.push({ seat, card: action.card });
  log(next, `${next.players[seat]!.nickname} joue ${cardFr(action.card)}.`);
  if (next.trick.length < 4) {
    next.turn = (seat + 1) % 4;
    return next;
  }
  const win = winner(next.trick);
  const team = (win % 2) as 0 | 1;
  next.won[team].push(...next.trick.map((play) => play.card));
  next.trick = [];
  next.turn = win;
  if (next.players.some((player) => player.hand.length > 0)) return next;
  const last = team;
  const a = manillePoints(next.won[0], last === 0);
  const b = manillePoints(next.won[1], last === 1);
  next.scores[0] += a;
  next.scores[1] += b;
  const summary = `Pli compté ${a} à ${b}. Marque ${next.scores[0]} – ${next.scores[1]}.`;
  next.result = { summary };
  next.phase = next.scores[0] >= next.target || next.scores[1] >= next.target ? "match-over" : "scoring";
  log(next, summary);
  return next;
}

export function continueManille(state: ManilleState, rng: Rng): ManilleState {
  if (state.phase === "play") throw new Error("La donne n'est pas finie.");
  if (state.phase === "match-over") {
    const fresh = structuredClone(state);
    fresh.scores = [0, 0];
    fresh.dealNo = 0;
    fresh.log = ["Nouvelle partie de manille."];
    fresh.phase = "scoring";
    return dealManille(fresh, rng);
  }
  return dealManille(state, rng);
}

export function actorManille(state: ManilleState): string | null {
  if (state.phase !== "play") return null;
  return state.players[state.turn]?.id ?? null;
}

export function hiddenManille(state: ManilleState, playerId: string): Card[] {
  return state.players.filter((seat) => seat.id !== playerId).flatMap((seat) => seat.hand);
}

export function projectManille(state: ManilleState, playerId: string) {
  const me = state.players.findIndex((seat) => seat.id === playerId);
  if (me < 0) throw new Error("Joueur introuvable.");
  const you = state.players[me]!;
  return {
    kind: "manille" as const,
    phase: state.phase,
    trumpLabel: "Sans atout · le 10 mène",
    scores: `${state.scores[0]} – ${state.scores[1]}`,
    trick: state.trick.map((play) => ({ seat: play.seat, card: { ...play.card } })),
    you: { seat: me, hand: you.hand.map((card) => ({ ...card })) },
    seats: state.players.map((seat, index) => ({
      id: seat.id,
      nickname: seat.nickname,
      seat: index,
      cards: seat.hand.length,
      isTurn: index === state.turn && state.phase === "play",
      tags: index === state.dealer ? "donneur" : "",
    })),
    legalCards: state.phase === "play" && state.turn === me ? legalManille(you.hand, state.trick) : [],
    prompts: [] as { label: string; action: object }[],
    result: state.result,
    log: [...state.log],
    teams: [`${state.players[0]!.nickname} et ${state.players[2]!.nickname}`, `${state.players[1]!.nickname} et ${state.players[3]!.nickname}`],
  };
}

export function chooseManille(view: ReturnType<typeof projectManille>): ManilleAction {
  const card = [...view.legalCards].sort((a, b) => rank(a) - rank(b))[0];
  if (!card) throw new Error("Aucune carte.");
  return { type: "play", card };
}

export function sameManille(card: Card): string {
  return cardKey(card);
}

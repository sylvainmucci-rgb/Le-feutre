import { beloteDeck, cardFr, cardKey, sameCard, suitFr, SUITS, type Card, type Suit } from "../cards";
import { shuffle, type Rng } from "../rng";
import { legalPlays, winningIndex, type TrickPlay } from "../belote/engine";

/**
 * Coinche de comptoir.
 * Les huit cartes sont données avant l'enchère.
 * Enchères 80 à 160 de dix en dix, puis capot 250.
 * À valeur égale : couleur < tout-atout < sans-atout.
 * Couleur : ordre et points de la belote (atout valet, 9, as…).
 * Tout-atout : chaque couleur se joue comme un atout ; seule la couleur demandée gagne le pli,
 * et il faut monter si l'on peut. Points d'atout. Belote possible dans chaque couleur.
 * Sans-atout : ordre as, 10, roi, dame, valet, 9, 8, 7. Points ordinaires (as 11, valet 2).
 * Pas de belote. Pas d'obligation de monter.
 * Trois passes après une enchère ferment les enchères. Tout le monde passe : on redonne.
 * La coinche double, la surcoinche quadruple. Partie en 1 000.
 */

const LADDER = [80, 90, 100, 110, 120, 130, 140, 150, 160, 250];
const PLAIN_ORDER = [14, 10, 13, 12, 11, 9, 8, 7];
const TRUMP_ORDER = [11, 9, 14, 10, 13, 12, 8, 7];
const PLAIN_POINTS: Record<number, number> = { 14: 11, 10: 10, 13: 4, 12: 3, 11: 2, 9: 0, 8: 0, 7: 0 };
const TRUMP_POINTS: Record<number, number> = { 11: 20, 9: 14, 14: 11, 10: 10, 13: 4, 12: 3, 8: 0, 7: 0 };

export type CoincheMode = "color" | "ta" | "sa";

export type CoincheAction =
  | { type: "pass" }
  | { type: "bid"; value: number; suit?: Suit; mode?: "ta" | "sa" }
  | { type: "coinche" }
  | { type: "surcoinche" }
  | { type: "play"; card: Card };

type Seat = { id: string; nickname: string; hand: Card[]; isBot: boolean };

export type CoincheState = {
  kind: "coinche";
  players: Seat[];
  dealer: number;
  turn: number;
  phase: "bid" | "play" | "scoring" | "match-over";
  trump: Suit | null;
  mode: CoincheMode | null;
  contract: number | null;
  taker: number | null;
  coinche: 0 | 1 | 2;
  consecutivePasses: number;
  trick: TrickPlay[];
  won: [Card[], Card[]];
  tricksWon: [number, number];
  lastTrick: 0 | 1 | null;
  belotes: { suit: Suit; seat: number; stage: 0 | 1 | 2 }[];
  scores: [number, number];
  dealNo: number;
  result: { summary: string } | null;
  log: string[];
};

function push(state: CoincheState, line: string) {
  state.log.push(line);
  if (state.log.length > 48) state.log.shift();
}

export function createCoinche(seats: { id: string; nickname: string; isBot?: boolean }[], rng: Rng): CoincheState {
  if (seats.length !== 4) throw new Error("La coinche se joue à quatre.");
  const state: CoincheState = {
    kind: "coinche",
    players: seats.map((seat) => ({ id: seat.id, nickname: seat.nickname, hand: [], isBot: Boolean(seat.isBot) })),
    dealer: 3,
    turn: 0,
    phase: "bid",
    trump: null,
    mode: null,
    contract: null,
    taker: null,
    coinche: 0,
    consecutivePasses: 0,
    trick: [],
    won: [[], []],
    tricksWon: [0, 0],
    lastTrick: null,
    belotes: [],
    scores: [0, 0],
    dealNo: 0,
    result: null,
    log: [],
  };
  return dealCoinche(state, rng);
}

export function dealCoinche(state: CoincheState, rng: Rng): CoincheState {
  const next = structuredClone(state);
  next.dealer = (next.dealer + 1) % 4;
  next.turn = (next.dealer + 1) % 4;
  next.phase = "bid";
  next.trump = null;
  next.mode = null;
  next.contract = null;
  next.taker = null;
  next.coinche = 0;
  next.consecutivePasses = 0;
  next.trick = [];
  next.won = [[], []];
  next.tricksWon = [0, 0];
  next.lastTrick = null;
  next.belotes = [];
  next.result = null;
  next.dealNo += 1;
  const deck = shuffle(beloteDeck(), rng);
  for (const seat of next.players) seat.hand = [];
  for (let i = 0; i < 32; i += 1) next.players[i % 4]!.hand.push(deck[i]!);
  push(next, `Donne ${next.dealNo}. Coinche. Enchères à partir de 80, couleur, tout-atout ou sans-atout.`);
  return next;
}

export function bidStrength(value: number, mode: CoincheMode): number {
  const rank = mode === "color" ? 0 : mode === "ta" ? 1 : 2;
  return value * 10 + rank;
}

function orderFor(mode: CoincheMode, trump: Suit | null, card: Card): number[] {
  if (mode === "sa") return PLAIN_ORDER;
  if (mode === "ta" || card.s === trump) return TRUMP_ORDER;
  return PLAIN_ORDER;
}

export function coincheCardPoints(card: Card, mode: CoincheMode, trump: Suit | null): number {
  if (mode === "sa") return PLAIN_POINTS[card.r] ?? 0;
  if (mode === "ta" || card.s === trump) return TRUMP_POINTS[card.r] ?? 0;
  return PLAIN_POINTS[card.r] ?? 0;
}

function stronger(card: Card, other: Card, mode: CoincheMode, trump: Suit | null): boolean {
  const order = orderFor(mode, trump, card);
  return order.indexOf(card.r) < order.indexOf(other.r);
}

export function winningCoinche(trick: readonly TrickPlay[], mode: CoincheMode, trump: Suit | null): number {
  if (mode === "color" && trump) return winningIndex(trick, trump);
  const led = trick[0]!.card.s;
  let best = 0;
  for (let i = 1; i < trick.length; i += 1) {
    const card = trick[i]!.card;
    if (card.s !== led) continue;
    if (trick[best]!.card.s !== led || stronger(card, trick[best]!.card, mode, trump)) best = i;
  }
  return trick[best]!.seat;
}

export function legalCoinche(hand: readonly Card[], trick: readonly TrickPlay[], mode: CoincheMode, trump: Suit | null, seat: number): Card[] {
  if (mode === "color" && trump) return legalPlays(hand, trick, trump, seat);
  if (trick.length === 0) return [...hand];
  const led = trick[0]!.card.s;
  const follow = hand.filter((card) => card.s === led);
  if (follow.length === 0) return [...hand];
  if (mode === "sa") return follow;
  const best = trick.filter((play) => play.card.s === led).reduce((top, play) => (stronger(play.card, top, mode, trump) ? play.card : top), trick[0]!.card);
  const higher = follow.filter((card) => stronger(card, best, mode, trump));
  return higher.length > 0 ? higher : follow;
}

export function applyCoinche(state: CoincheState, playerId: string, action: CoincheAction, rng: Rng): CoincheState {
  const next = structuredClone(state);
  const seat = next.players.findIndex((player) => player.id === playerId);
  if (seat !== next.turn) throw new Error("Ce n'est pas votre tour.");
  if (next.phase === "bid") return bid(next, seat, action, rng);
  if (next.phase === "play" && action.type === "play") return play(next, seat, action.card);
  throw new Error("Action impossible maintenant.");
}

function bid(state: CoincheState, seat: number, action: CoincheAction, rng: Rng): CoincheState {
  const name = state.players[seat]!.nickname;
  if (action.type === "bid") {
    if (state.coinche > 0) throw new Error("L'enchère est déjà coinchée.");
    const mode: CoincheMode = action.mode === "ta" || action.mode === "sa" ? action.mode : "color";
    if (!LADDER.includes(action.value)) throw new Error("Enchère inconnue.");
    if (mode === "color" && !action.suit) throw new Error("Annoncez une couleur.");
    const current = state.contract === null || state.mode === null ? null : bidStrength(state.contract, state.mode);
    if (current !== null && bidStrength(action.value, mode) <= current) throw new Error("Il faut surenchérir.");
    state.contract = action.value;
    state.mode = mode;
    state.trump = mode === "color" ? (action.suit ?? null) : null;
    state.taker = seat;
    state.consecutivePasses = 0;
    state.turn = (seat + 1) % 4;
    push(state, `${name} annonce ${action.value} ${contractName(state)}.`);
    return state;
  }
  if (action.type === "coinche") {
    if (state.contract === null || state.taker === null) throw new Error("Il n'y a rien à coincher.");
    if (state.coinche > 0) throw new Error("C'est déjà coinché.");
    if (state.taker % 2 === seat % 2) throw new Error("On ne coinche pas son partenaire.");
    state.coinche = 1;
    state.consecutivePasses = 0;
    state.turn = state.taker;
    push(state, `${name} coinche.`);
    return state;
  }
  if (action.type === "surcoinche") {
    if (state.coinche !== 1 || state.taker === null) throw new Error("Rien à surcoincher.");
    if (state.taker % 2 !== seat % 2) throw new Error("La surcoinche revient au camp du preneur.");
    state.coinche = 2;
    state.phase = "play";
    state.turn = (state.dealer + 1) % 4;
    push(state, `${name} surcoinche.`);
    return state;
  }
  if (action.type !== "pass") throw new Error("Enchère inconnue.");
  state.consecutivePasses += 1;
  push(state, `${name} passe.`);
  if (state.coinche === 1 && seat === state.taker) {
    state.phase = "play";
    state.turn = (state.dealer + 1) % 4;
    push(state, "Coinche acceptée.");
    return state;
  }
  if (state.contract === null && state.consecutivePasses >= 4) return dealCoinche(state, rng);
  if (state.contract !== null && state.coinche === 0 && state.consecutivePasses >= 3) {
    state.phase = "play";
    state.turn = (state.dealer + 1) % 4;
    push(state, `Contrat ${state.contract} ${contractName(state)}.`);
    return state;
  }
  state.turn = (seat + 1) % 4;
  return state;
}

function contractName(state: CoincheState): string {
  if (state.mode === "sa") return "sans-atout";
  if (state.mode === "ta") return "tout-atout";
  return state.trump ? `à ${suitFr(state.trump)}` : "";
}

function play(state: CoincheState, seat: number, card: Card): CoincheState {
  if (!state.mode) throw new Error("Contrat manquant.");
  if (state.mode === "color" && !state.trump) throw new Error("Atout manquant.");
  const hand = state.players[seat]!.hand;
  const legal = legalCoinche(hand, state.trick, state.mode, state.trump, seat);
  if (!legal.some((candidate) => sameCard(candidate, card))) throw new Error("Cette carte n'est pas jouable.");
  const at = hand.findIndex((candidate) => sameCard(candidate, card));
  hand.splice(at, 1);
  noteBelote(state, seat, card);
  state.trick.push({ seat, card });
  push(state, `${state.players[seat]!.nickname} joue ${cardFr(card)}.`);
  if (state.trick.length < 4) {
    state.turn = (seat + 1) % 4;
    return state;
  }
  const win = winningCoinche(state.trick, state.mode, state.trump);
  const team = (win % 2) as 0 | 1;
  state.won[team].push(...state.trick.map((item) => item.card));
  state.tricksWon[team] += 1;
  state.lastTrick = team;
  state.trick = [];
  state.turn = win;
  if (state.players.some((player) => player.hand.length > 0)) return state;
  return score(state);
}

function noteBelote(state: CoincheState, seat: number, card: Card) {
  if (state.mode === "sa" || (card.r !== 13 && card.r !== 12)) return;
  if (state.mode === "color" && card.s !== state.trump) return;
  if (card.s === "t" || card.s === "x") return;
  const suit = card.s;
  const hand = state.players[seat]!.hand;
  const hasMate = hand.some((other) => other.s === suit && (other.r === 13 || other.r === 12) && other.r !== card.r);
  let mark = state.belotes.find((item) => item.suit === suit && item.seat === seat);
  if (!mark && hasMate) {
    mark = { suit, seat, stage: 1 };
    state.belotes.push(mark);
    push(state, `${state.players[seat]!.nickname} annonce belote.`);
  } else if (mark && mark.stage === 1) {
    mark.stage = 2;
    push(state, `${state.players[seat]!.nickname} annonce rebelote.`);
  }
}

function pointsOf(cards: readonly Card[], mode: CoincheMode, trump: Suit | null, last: boolean, belote: number): number {
  const raw = cards.reduce((sum, card) => sum + coincheCardPoints(card, mode, trump), 0);
  return raw + (last ? 10 : 0) + belote;
}

function score(state: CoincheState): CoincheState {
  const mode = state.mode ?? "color";
  const taker = state.taker!;
  const attack = (taker % 2) as 0 | 1;
  const defense = (1 - attack) as 0 | 1;
  const beloteFor = (team: 0 | 1) => state.belotes.filter((item) => item.stage === 2 && item.seat % 2 === team).length * 20;
  const attackPoints = pointsOf(state.won[attack], mode, state.trump, state.lastTrick === attack, beloteFor(attack));
  const capot = state.contract === 250;
  const made = capot ? state.tricksWon[attack] === 8 : attackPoints >= (state.contract ?? 0);
  const mult = state.coinche === 2 ? 4 : state.coinche === 1 ? 2 : 1;
  const stake = (state.contract ?? 0) * mult;
  const receiver = made ? attack : defense;
  state.scores[receiver] += stake;
  state.scores[0] += beloteFor(0);
  state.scores[1] += beloteFor(1);
  const summary = made
    ? `Contrat réussi. ${state.players[taker]!.nickname} marque ${stake}.`
    : `Chute. La défense marque ${stake}.`;
  state.result = { summary: `${summary} Points du preneur : ${attackPoints}.` };
  state.phase = state.scores[0] >= 1000 || state.scores[1] >= 1000 ? "match-over" : "scoring";
  push(state, state.result.summary);
  return state;
}

export function continueCoinche(state: CoincheState, rng: Rng): CoincheState {
  if (state.phase === "bid" || state.phase === "play") throw new Error("La donne n'est pas finie.");
  if (state.phase === "match-over") {
    const fresh = structuredClone(state);
    fresh.scores = [0, 0];
    fresh.dealNo = 0;
    fresh.log = ["Nouvelle coinche."];
    fresh.phase = "scoring";
    return dealCoinche(fresh, rng);
  }
  return dealCoinche(state, rng);
}

export function actorCoinche(state: CoincheState): string | null {
  if (state.phase !== "bid" && state.phase !== "play") return null;
  return state.players[state.turn]?.id ?? null;
}

export function hiddenCoinche(state: CoincheState, playerId: string): Card[] {
  return state.players.filter((seat) => seat.id !== playerId).flatMap((seat) => seat.hand);
}

export function promptsFor(state: CoincheState, seat: number): { label: string; action: CoincheAction }[] {
  if (state.phase !== "bid" || state.turn !== seat) return [];
  const prompts: { label: string; action: CoincheAction }[] = [{ label: "Je passe", action: { type: "pass" } }];
  if (state.coinche === 1 && state.taker !== null && state.taker % 2 === seat % 2) {
    prompts.push({ label: "Surcoinche", action: { type: "surcoinche" } });
    return prompts;
  }
  if (state.coinche > 0) return prompts;
  if (state.contract !== null && state.taker !== null && state.taker % 2 !== seat % 2) {
    prompts.push({ label: "Coinche", action: { type: "coinche" } });
  }
  const current = state.contract !== null && state.mode ? bidStrength(state.contract, state.mode) : 0;
  for (const value of LADDER) {
    for (const suit of SUITS) {
      if (bidStrength(value, "color") <= current) continue;
      prompts.push({ label: `${value} ${suitFr(suit)}`, action: { type: "bid", suit, value } });
    }
    if (bidStrength(value, "ta") > current) prompts.push({ label: `${value} tout-atout`, action: { type: "bid", value, mode: "ta" } });
    if (bidStrength(value, "sa") > current) prompts.push({ label: `${value} sans-atout`, action: { type: "bid", value, mode: "sa" } });
  }
  return prompts;
}

export function projectCoinche(state: CoincheState, playerId: string) {
  const me = state.players.findIndex((seat) => seat.id === playerId);
  if (me < 0) throw new Error("Joueur introuvable.");
  const trump = state.trump;
  const hand = state.players[me]!.hand;
  return {
    kind: "coinche" as const,
    phase: state.phase,
    trumpLabel: state.mode ? `${contractName(state)} · ${state.contract}${state.coinche === 2 ? " surcoinchée" : state.coinche === 1 ? " coinchée" : ""}` : "Enchères",
    scores: `${state.scores[0]} – ${state.scores[1]}`,
    trick: state.trick.map((play) => ({ seat: play.seat, card: { ...play.card } })),
    you: { seat: me, hand: hand.map((card) => ({ ...card })) },
    seats: state.players.map((seat, index) => ({
      id: seat.id,
      nickname: seat.nickname,
      seat: index,
      cards: seat.hand.length,
      isTurn: index === state.turn && (state.phase === "bid" || state.phase === "play"),
      tags: index === state.taker ? "preneur" : index === state.dealer ? "donneur" : "",
    })),
    legalCards: state.phase === "play" && state.turn === me && state.mode ? legalCoinche(hand, state.trick, state.mode, state.trump, me) : [],
    prompts: promptsFor(state, me),
    result: state.result,
    log: [...state.log],
    teams: [`${state.players[0]!.nickname} et ${state.players[2]!.nickname}`, `${state.players[1]!.nickname} et ${state.players[3]!.nickname}`],
  };
}

export function chooseCoinche(view: ReturnType<typeof projectCoinche>): CoincheAction {
  if (view.phase === "play" && view.legalCards[0]) return { type: "play", card: view.legalCards[0] };
  const bid = view.prompts.find((prompt) => prompt.action.type === "bid" && (prompt.action as { value: number }).value <= 100);
  if (view.phase === "bid" && bid && view.you.hand.filter((card) => card.s === (bid.action as { suit: Suit }).suit).length >= 4) return bid.action;
  const pass = view.prompts.find((prompt) => prompt.action.type === "pass");
  if (pass) return pass.action;
  return { type: "pass" };
}

export function coincheKey(card: Card): string {
  return cardKey(card);
}

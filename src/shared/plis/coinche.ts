import { beloteDeck, cardFr, cardKey, sameCard, suitFr, SUITS, type Card, type Suit } from "../cards";
import { shuffle, type Rng } from "../rng";
import { cardPoints, legalPlays, winningIndex, type TrickPlay } from "../belote/engine";

/**
 * Coinche couleur, usage de comptoir.
 * Les huit cartes sont données avant l'enchère (la donne en plusieurs paquets
 * ne change pas la main finale ; elle n'est pas distinguée ici).
 * Enchères 80 à 160 de dix en dix, puis capot 250. Couleur seulement :
 * le sans-atout et le tout-atout ne sont pas dans cette version.
 * Trois passes après une enchère ferment les enchères. Tout le monde passe : on redonne.
 * La coinche double, la surcoinche quadruple. Le preneur doit atteindre son contrat
 * en points de cartes (belote et dix de der compris). Réussite : le camp marque le contrat
 * multiplié. Chute : la défense le marque. La belote (20) s'ajoute ensuite, sans multiplicateur.
 * Partie en 1 000. Les plis suivent la belote classique.
 */

const LADDER = [80, 90, 100, 110, 120, 130, 140, 150, 160, 250];

export type CoincheAction =
  | { type: "pass" }
  | { type: "bid"; suit: Suit; value: number }
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
  contract: number | null;
  taker: number | null;
  coinche: 0 | 1 | 2;
  consecutivePasses: number;
  trick: TrickPlay[];
  won: [Card[], Card[]];
  tricksWon: [number, number];
  lastTrick: 0 | 1 | null;
  beloteSeat: number | null;
  beloteStage: 0 | 1 | 2;
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
    contract: null,
    taker: null,
    coinche: 0,
    consecutivePasses: 0,
    trick: [],
    won: [[], []],
    tricksWon: [0, 0],
    lastTrick: null,
    beloteSeat: null,
    beloteStage: 0,
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
  next.contract = null;
  next.taker = null;
  next.coinche = 0;
  next.consecutivePasses = 0;
  next.trick = [];
  next.won = [[], []];
  next.tricksWon = [0, 0];
  next.lastTrick = null;
  next.beloteSeat = null;
  next.beloteStage = 0;
  next.result = null;
  next.dealNo += 1;
  const deck = shuffle(beloteDeck(), rng);
  for (const seat of next.players) seat.hand = [];
  for (let i = 0; i < 32; i += 1) next.players[i % 4]!.hand.push(deck[i]!);
  push(next, `Donne ${next.dealNo}. Coinche couleur. Enchères à partir de 80.`);
  return next;
}

function higher(value: number, current: number | null): boolean {
  if (!LADDER.includes(value)) return false;
  if (current === null) return true;
  return value > current;
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
    if (!higher(action.value, state.contract)) throw new Error("Il faut surenchérir.");
    state.contract = action.value;
    state.trump = action.suit;
    state.taker = seat;
    state.consecutivePasses = 0;
    state.turn = (seat + 1) % 4;
    push(state, `${name} annonce ${action.value} à ${suitFr(action.suit)}.`);
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
    push(state, `Contrat ${state.contract} à ${suitFr(state.trump!)}.`);
    return state;
  }
  state.turn = (seat + 1) % 4;
  return state;
}

function play(state: CoincheState, seat: number, card: Card): CoincheState {
  const trump = state.trump;
  if (!trump) throw new Error("Atout manquant.");
  const hand = state.players[seat]!.hand;
  const legal = legalPlays(hand, state.trick, trump, seat);
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
  const win = state.trick[winningIndex(state.trick, trump)]!.seat;
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
  if (!state.trump || card.s !== state.trump || (card.r !== 13 && card.r !== 12)) return;
  const hand = state.players[seat]!.hand;
  const hasMate = hand.some((other) => other.s === state.trump && (other.r === 13 || other.r === 12) && other.r !== card.r);
  if (state.beloteSeat === null && hasMate) {
    state.beloteSeat = seat;
    state.beloteStage = 1;
    push(state, `${state.players[seat]!.nickname} annonce belote.`);
  } else if (state.beloteSeat === seat && state.beloteStage === 1) {
    state.beloteStage = 2;
    push(state, `${state.players[seat]!.nickname} annonce rebelote.`);
  }
}

function pointsOf(cards: readonly Card[], trump: Suit, last: boolean, belote: boolean): number {
  const raw = cards.reduce((sum, card) => sum + cardPoints(card, trump), 0);
  return raw + (last ? 10 : 0) + (belote ? 20 : 0);
}

function score(state: CoincheState): CoincheState {
  const trump = state.trump!;
  const taker = state.taker!;
  const attack = (taker % 2) as 0 | 1;
  const defense = (1 - attack) as 0 | 1;
  const beloteTeam = state.beloteStage === 2 && state.beloteSeat !== null ? ((state.beloteSeat % 2) as 0 | 1) : null;
  const attackPoints = pointsOf(state.won[attack], trump, state.lastTrick === attack, beloteTeam === attack);
  const capot = state.contract === 250;
  const made = capot ? state.tricksWon[attack] === 8 : attackPoints >= (state.contract ?? 0);
  const mult = state.coinche === 2 ? 4 : state.coinche === 1 ? 2 : 1;
  const stake = (state.contract ?? 0) * mult;
  const receiver = made ? attack : defense;
  state.scores[receiver] += stake;
  if (beloteTeam !== null) state.scores[beloteTeam] += 20;
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
  const floor = state.contract ?? 70;
  for (const value of LADDER.filter((item) => item > floor)) {
    for (const suit of SUITS) {
      prompts.push({ label: `${value} ${suitFr(suit)}`, action: { type: "bid", suit, value } });
    }
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
    trumpLabel: trump ? `Atout ${suitFr(trump)} · ${state.contract}${state.coinche === 2 ? " surcoinchée" : state.coinche === 1 ? " coinchée" : ""}` : "Enchères",
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
    legalCards: state.phase === "play" && state.turn === me && trump ? legalPlays(hand, state.trick, trump, me) : [],
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

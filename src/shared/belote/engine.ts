import { beloteDeck, cardFr, sameCard, suitFr, SUITS, type Card, type Suit } from "../cards";
import { shuffle, type Rng } from "../rng";

/**
 * Belote classique, règles de la Fédération Française de Belote (27 janvier 2016).
 * Quatre joueurs, équipes 0-2 contre 1-3, sens antihoraire.
 * Pas d'annonces de tierce ou de carré : seule la belote-rebelote compte.
 * L'application annonce belote puis rebelote automatiquement.
 * Obligation de fournir, de couper, de monter et, à défaut, de mettre un atout inférieur.
 * Dix de der 10, capot 100. Chute : 162 à la défense, ou 252 si capot.
 * La belote est imprenable. Égalité : litige, les points du preneur sont remis.
 */

export type BeloteAction =
  | { type: "pass" }
  | { type: "take"; suit?: Suit }
  | { type: "play"; card: Card };

export type TrickPlay = { seat: number; card: Card };

export type DealOutcome = "reussi" | "chute" | "litige";

export type DealScore = {
  raw: [number, number];
  awarded: [number, number];
  outcome: DealOutcome;
  capot: boolean;
  pending: number;
  summary: string;
};

export type BeloteSeat = {
  id: string;
  nickname: string;
  hand: Card[];
  isBot: boolean;
};

export type PastTrick = { plays: TrickPlay[]; winnerSeat: number };

export type BeloteState = {
  kind: "belote";
  players: BeloteSeat[];
  dealer: number;
  phase: "bidding1" | "bidding2" | "play" | "scoring" | "match-over";
  trump: Suit | null;
  faceUp: Card | null;
  knownTakerCard: Card | null;
  takerSeat: number | null;
  turn: number;
  passes: number;
  deck: Card[];
  trick: TrickPlay[];
  pastTricks: PastTrick[];
  won: [Card[], Card[]];
  trickCount: [number, number];
  lastTrickTeam: 0 | 1 | null;
  beloteSeat: number | null;
  beloteStage: 0 | 1 | 2;
  scores: [number, number];
  pending: number;
  target: number;
  dealNo: number;
  result: DealScore | null;
  log: string[];
};

export type BeloteView = {
  kind: "belote";
  phase: BeloteState["phase"];
  dealerSeat: number;
  turnSeat: number | null;
  trump: Suit | null;
  faceUp: Card | null;
  knownTakerCard: Card | null;
  takerSeat: number | null;
  trick: TrickPlay[];
  pastTricks: PastTrick[];
  trickCount: [number, number];
  scores: [number, number];
  pending: number;
  target: number;
  dealNo: number;
  beloteAnnounced: string | null;
  teams: [{ seats: number[]; names: string }, { seats: number[]; names: string }];
  you: { id: string; seat: number; team: 0 | 1; hand: Card[] };
  seats: {
    id: string;
    nickname: string;
    seat: number;
    team: 0 | 1;
    cards: number;
    isBot: boolean;
    isDealer: boolean;
    isTurn: boolean;
    isTaker: boolean;
  }[];
  legalCards: Card[];
  result: DealScore | null;
  log: string[];
};

const TRUMP_ORDER = [11, 9, 14, 10, 13, 12, 8, 7];
const PLAIN_ORDER = [14, 10, 13, 12, 11, 9, 8, 7];
const TRUMP_POINTS: Record<number, number> = { 11: 20, 9: 14, 14: 11, 10: 10, 13: 4, 12: 3, 8: 0, 7: 0 };
const PLAIN_POINTS: Record<number, number> = { 14: 11, 10: 10, 13: 4, 12: 3, 11: 2, 9: 0, 8: 0, 7: 0 };

function pushLog(state: BeloteState, line: string) {
  state.log.push(line);
  if (state.log.length > 48) state.log.shift();
}

export function cardPoints(card: Card, trump: Suit): number {
  return card.s === trump ? (TRUMP_POINTS[card.r] ?? 0) : (PLAIN_POINTS[card.r] ?? 0);
}

function orderIndex(card: Card, trump: Suit): number {
  const order = card.s === trump ? TRUMP_ORDER : PLAIN_ORDER;
  const index = order.indexOf(card.r);
  if (index < 0) throw new Error("Carte hors jeu de belote.");
  return index;
}

export function beats(card: Card, other: Card, trump: Suit, led: Suit): boolean {
  if (card.s === trump && other.s !== trump) return true;
  if (card.s !== trump && other.s === trump) return false;
  if (card.s === trump && other.s === trump) return orderIndex(card, trump) < orderIndex(other, trump);
  if (card.s === led && other.s !== led) return true;
  if (card.s !== led && other.s === led) return false;
  if (card.s !== led) return false;
  return orderIndex(card, trump) < orderIndex(other, trump);
}

export function winningIndex(trick: readonly TrickPlay[], trump: Suit): number {
  if (trick.length === 0) throw new Error("Pli vide.");
  const led = trick[0]!.card.s;
  let best = 0;
  for (let i = 1; i < trick.length; i += 1) {
    if (beats(trick[i]!.card, trick[best]!.card, trump, led)) best = i;
  }
  return best;
}

function highestTrump(trick: readonly TrickPlay[], trump: Suit): Card | null {
  let best: Card | null = null;
  for (const play of trick) {
    if (play.card.s !== trump) continue;
    if (!best || beats(play.card, best, trump, trump)) best = play.card;
  }
  return best;
}

export function legalPlays(hand: readonly Card[], trick: readonly TrickPlay[], trump: Suit, seat: number): Card[] {
  if (trick.length === 0) return [...hand];
  const led = trick[0]!.card.s;
  const follow = hand.filter((card) => card.s === led);
  if (follow.length > 0) {
    if (led !== trump) return follow;
    const top = highestTrump(trick, trump);
    if (!top) return follow;
    const higher = follow.filter((card) => beats(card, top, trump, trump));
    return higher.length > 0 ? higher : follow;
  }
  const partner = (seat + 2) % 4;
  const partnerPlayed = trick.some((play) => play.seat === partner);
  const partnerMaster = partnerPlayed && trick[winningIndex(trick, trump)]!.seat === partner;
  if (partnerMaster) return [...hand];
  const trumps = hand.filter((card) => card.s === trump);
  if (trumps.length === 0) return [...hand];
  const top = highestTrump(trick, trump);
  if (!top) return trumps;
  const higher = trumps.filter((card) => beats(card, top, trump, trump));
  return higher.length > 0 ? higher : trumps;
}

export function scoreDeal(input: {
  won: [readonly Card[], readonly Card[]];
  trickCount: [number, number];
  lastTrickTeam: 0 | 1;
  trump: Suit;
  beloteTeam: 0 | 1 | null;
  takerTeam: 0 | 1;
  pending: number;
}): DealScore {
  const capotTeam: 0 | 1 | null = input.trickCount[0] === 8 ? 0 : input.trickCount[1] === 8 ? 1 : null;
  const raw: [number, number] = [
    input.won[0].reduce((sum, card) => sum + cardPoints(card, input.trump), 0),
    input.won[1].reduce((sum, card) => sum + cardPoints(card, input.trump), 0),
  ];
  if (capotTeam !== null) raw[capotTeam] += 100;
  else raw[input.lastTrickTeam] += 10;
  if (input.beloteTeam !== null) raw[input.beloteTeam] += 20;
  const defense: 0 | 1 = input.takerTeam === 0 ? 1 : 0;
  const awarded: [number, number] = [0, 0];
  let outcome: DealOutcome;
  let pending = 0;
  if (raw[input.takerTeam] > raw[defense]) {
    outcome = "reussi";
    awarded[0] = raw[0];
    awarded[1] = raw[1];
    awarded[input.takerTeam] += input.pending;
  } else if (raw[input.takerTeam] < raw[defense]) {
    outcome = "chute";
    const base = capotTeam === defense ? 252 : 162;
    awarded[input.takerTeam] = input.beloteTeam === input.takerTeam ? 20 : 0;
    awarded[defense] = base + (input.beloteTeam === defense ? 20 : 0) + input.pending;
  } else {
    outcome = "litige";
    awarded[defense] = raw[defense];
    pending = input.pending + raw[input.takerTeam];
  }
  const capot = capotTeam !== null;
  const summary = describeScore(outcome, capot, awarded, pending, input.takerTeam);
  return { raw, awarded, outcome, capot, pending, summary };
}

function describeScore(
  outcome: DealOutcome,
  capot: boolean,
  awarded: [number, number],
  pending: number,
  takerTeam: 0 | 1,
): string {
  const names = ["Nord-Sud", "Est-Ouest"] as const;
  if (outcome === "litige") {
    return `Litige. ${names[takerTeam === 0 ? 1 : 0]} marque ${awarded[takerTeam === 0 ? 1 : 0]}. ${pending} points du preneur sont remis en jeu.`;
  }
  if (outcome === "chute") {
    return `${capot ? "Capot. " : ""}Contrat chuté. ${names[0]} ${awarded[0]}, ${names[1]} ${awarded[1]}. La belote reste acquise à qui l'a annoncée.`;
  }
  return `${capot ? "Capot. " : ""}Contrat réussi. ${names[0]} ${awarded[0]}, ${names[1]} ${awarded[1]}.`;
}

export function deckPoints(trump: Suit, cards: readonly Card[]): number {
  return cards.reduce((sum, card) => sum + cardPoints(card, trump), 0);
}

type SeatInput = { id: string; nickname: string; isBot?: boolean };

export function createBelote(
  seats: SeatInput[],
  rng: Rng,
  options?: { target?: number; deck?: Card[]; dealer?: number },
): BeloteState {
  if (seats.length !== 4) throw new Error("La belote se joue à quatre.");
  const state: BeloteState = {
    kind: "belote",
    players: seats.map((seat) => ({
      id: seat.id,
      nickname: seat.nickname,
      hand: [],
      isBot: Boolean(seat.isBot),
    })),
    dealer: options?.dealer ?? 0,
    phase: "bidding1",
    trump: null,
    faceUp: null,
    knownTakerCard: null,
    takerSeat: null,
    turn: 1,
    passes: 0,
    deck: [],
    trick: [],
    pastTricks: [],
    won: [[], []],
    trickCount: [0, 0],
    lastTrickTeam: null,
    beloteSeat: null,
    beloteStage: 0,
    scores: [0, 0],
    pending: 0,
    target: options?.target ?? 1000,
    dealNo: 0,
    result: null,
    log: [],
  };
  return startDeal(state, rng, options?.deck);
}

function startDeal(state: BeloteState, rng: Rng, forcedDeck?: Card[]): BeloteState {
  const next = state.dealNo === 0 && state.players.every((seat) => seat.hand.length === 0) && state.log.length === 0
    ? state
    : structuredClone(state);
  const deck = forcedDeck ? [...forcedDeck] : shuffle(beloteDeck(), rng);
  if (deck.length !== 32) throw new Error("Le jeu de belote doit contenir 32 cartes.");
  for (const seat of next.players) seat.hand = [];
  for (const count of [3, 2]) {
    for (let step = 0; step < 4; step += 1) {
      const seat = (next.dealer + 1 + step) % 4;
      next.players[seat]!.hand.push(...deck.splice(0, count));
    }
  }
  const face = deck.shift();
  if (!face) throw new Error("Pas de carte retournée.");
  next.faceUp = face;
  next.deck = deck;
  next.phase = "bidding1";
  next.trump = null;
  next.knownTakerCard = null;
  next.takerSeat = null;
  next.turn = (next.dealer + 1) % 4;
  next.passes = 0;
  next.trick = [];
  next.pastTricks = [];
  next.won = [[], []];
  next.trickCount = [0, 0];
  next.lastTrickTeam = null;
  next.beloteSeat = null;
  next.beloteStage = 0;
  next.result = null;
  next.dealNo += 1;
  pushLog(
    next,
    `Donne ${next.dealNo}. ${next.players[next.dealer]!.nickname} distribue. Retournée : ${cardFr(face)}.`,
  );
  return next;
}

export function applyBelote(state: BeloteState, playerId: string, action: BeloteAction, rng: Rng): BeloteState {
  const seat = state.players.findIndex((player) => player.id === playerId);
  if (seat < 0) throw new Error("Joueur introuvable.");
  if (state.phase === "scoring" || state.phase === "match-over") {
    throw new Error("La donne est terminée.");
  }
  if (seat !== state.turn) throw new Error("Ce n'est pas votre tour.");
  const next = structuredClone(state);
  if (next.phase === "bidding1" || next.phase === "bidding2") {
    bid(next, seat, action, rng);
    return next;
  }
  if (action.type !== "play") throw new Error("Jouez une carte.");
  playCard(next, seat, action.card);
  return next;
}

function bid(state: BeloteState, seat: number, action: BeloteAction, rng: Rng) {
  const player = state.players[seat]!;
  if (action.type === "play") throw new Error("La prise n'est pas terminée.");
  if (action.type === "pass") {
    pushLog(state, `${player.nickname} passe.`);
    state.passes += 1;
    if (state.passes === 4) {
      if (state.phase === "bidding1") {
        state.phase = "bidding2";
        state.passes = 0;
        state.turn = (state.dealer + 1) % 4;
        pushLog(state, "Deuxième tour : on peut choisir une autre couleur.");
        return;
      }
      pushLog(state, "Tout le monde passe. On redistribue.");
      state.dealer = (state.dealer + 1) % 4;
      const redealt = startDeal(state, rng);
      Object.assign(state, redealt);
      return;
    }
    state.turn = (state.turn + 1) % 4;
    return;
  }
  if (!state.faceUp) throw new Error("Pas de carte retournée.");
  let trump: Suit;
  if (state.phase === "bidding1") {
    if (action.suit && action.suit !== state.faceUp.s) {
      throw new Error("Au premier tour, l'atout est la couleur de la retournée.");
    }
    trump = state.faceUp.s;
  } else {
    if (!action.suit || !SUITS.includes(action.suit)) throw new Error("Annoncez une couleur.");
    if (action.suit === state.faceUp.s) throw new Error("Au second tour, choisissez une autre couleur.");
    trump = action.suit;
  }
  state.trump = trump;
  state.takerSeat = seat;
  const face = state.faceUp;
  state.knownTakerCard = face;
  let cursor = (state.dealer + 1) % 4;
  for (let step = 0; step < 4; step += 1) {
    const count = cursor === seat ? 2 : 3;
    state.players[cursor]!.hand.push(...state.deck.splice(0, count));
    cursor = (cursor + 1) % 4;
  }
  state.players[seat]!.hand.push(face);
  state.faceUp = null;
  if (state.deck.length !== 0) throw new Error("Distribution incomplète.");
  for (const candidate of state.players) {
    if (candidate.hand.length !== 8) throw new Error("Main incomplète.");
  }
  const king = state.players.findIndex((candidate) =>
    candidate.hand.some((card) => card.s === trump && card.r === 13) &&
    candidate.hand.some((card) => card.s === trump && card.r === 12),
  );
  state.beloteSeat = king >= 0 ? king : null;
  state.phase = "play";
  state.turn = (state.dealer + 1) % 4;
  pushLog(state, `${player.nickname} prend à ${suitFr(trump)}.`);
}

function playCard(state: BeloteState, seat: number, card: Card) {
  if (!state.trump) throw new Error("L'atout n'est pas choisi.");
  const player = state.players[seat]!;
  const legal = legalPlays(player.hand, state.trick, state.trump, seat);
  if (!legal.some((candidate) => sameCard(candidate, card))) {
    throw new Error(`Le ${cardFr(card)} n'est pas jouable.`);
  }
  const index = player.hand.findIndex((candidate) => sameCard(candidate, card));
  player.hand.splice(index, 1);
  state.trick.push({ seat, card });
  let spoken = "";
  if (state.beloteSeat === seat && card.s === state.trump && (card.r === 13 || card.r === 12)) {
    if (state.beloteStage === 0) {
      state.beloteStage = 1;
      spoken = " Belote !";
    } else if (state.beloteStage === 1) {
      state.beloteStage = 2;
      spoken = " Rebelote !";
    }
  }
  pushLog(state, `${player.nickname} joue ${cardFr(card)}.${spoken}`);
  if (state.trick.length < 4) {
    state.turn = (state.turn + 1) % 4;
    return;
  }
  const winner = state.trick[winningIndex(state.trick, state.trump)]!.seat;
  const team = (winner % 2) as 0 | 1;
  state.won[team].push(...state.trick.map((play) => play.card));
  state.trickCount[team] += 1;
  state.lastTrickTeam = team;
  state.pastTricks.push({ plays: state.trick, winnerSeat: winner });
  state.trick = [];
  pushLog(state, `Pli pour ${state.players[winner]!.nickname}.`);
  if (state.players.every((candidate) => candidate.hand.length === 0)) {
    closeDeal(state);
    return;
  }
  state.turn = winner;
}

function closeDeal(state: BeloteState) {
  if (!state.trump || state.takerSeat === null || state.lastTrickTeam === null) {
    throw new Error("Donne injouable.");
  }
  const result = scoreDeal({
    won: state.won,
    trickCount: state.trickCount,
    lastTrickTeam: state.lastTrickTeam,
    trump: state.trump,
    beloteTeam: state.beloteStage === 2 && state.beloteSeat !== null ? ((state.beloteSeat % 2) as 0 | 1) : null,
    takerTeam: (state.takerSeat % 2) as 0 | 1,
    pending: state.pending,
  });
  state.scores[0] += result.awarded[0];
  state.scores[1] += result.awarded[1];
  state.pending = result.pending;
  state.result = result;
  state.turn = -1;
  const reached = state.scores[0] >= state.target || state.scores[1] >= state.target;
  state.phase = reached && state.scores[0] !== state.scores[1] ? "match-over" : "scoring";
  pushLog(state, result.summary);
  if (state.phase === "match-over") {
    const winner = state.scores[0] > state.scores[1] ? "Nord-Sud" : "Est-Ouest";
    pushLog(state, `${winner} gagne la partie ${state.scores[0]} à ${state.scores[1]}.`);
  }
}

export function continueBelote(state: BeloteState, rng: Rng): BeloteState {
  if (state.phase !== "scoring" && state.phase !== "match-over") {
    throw new Error("La donne n'est pas terminée.");
  }
  const next = structuredClone(state);
  if (next.phase === "match-over") {
    next.scores = [0, 0];
    next.pending = 0;
    next.log = ["Nouvelle partie."];
    next.dealNo = 0;
  }
  next.dealer = (next.dealer + 1) % 4;
  return startDeal(next, rng);
}

export function beloteActor(state: BeloteState): string | null {
  if (state.turn < 0 || state.phase === "scoring" || state.phase === "match-over") return null;
  return state.players[state.turn]?.id ?? null;
}

export function projectBelote(state: BeloteState, playerId: string): BeloteView {
  const meIndex = state.players.findIndex((seat) => seat.id === playerId);
  if (meIndex < 0) throw new Error("Joueur introuvable.");
  const me = state.players[meIndex]!;
  const trump = state.trump;
  const legal =
    state.phase === "play" && state.turn === meIndex && trump
      ? legalPlays(me.hand, state.trick, trump, meIndex)
      : [];
  const teamNames: [string, string] = [
    `${state.players[0]!.nickname} et ${state.players[2]!.nickname}`,
    `${state.players[1]!.nickname} et ${state.players[3]!.nickname}`,
  ];
  return {
    kind: "belote",
    phase: state.phase,
    dealerSeat: state.dealer,
    turnSeat: state.turn < 0 ? null : state.turn,
    trump: state.trump,
    faceUp: state.faceUp ? { ...state.faceUp } : null,
    knownTakerCard: state.knownTakerCard ? { ...state.knownTakerCard } : null,
    takerSeat: state.takerSeat,
    trick: state.trick.map((play) => ({ seat: play.seat, card: { ...play.card } })),
    pastTricks: state.pastTricks.map((trick) => ({
      winnerSeat: trick.winnerSeat,
      plays: trick.plays.map((play) => ({ seat: play.seat, card: { ...play.card } })),
    })),
    trickCount: [...state.trickCount],
    scores: [...state.scores],
    pending: state.pending,
    target: state.target,
    dealNo: state.dealNo,
    beloteAnnounced:
      state.beloteStage === 0 || state.beloteSeat === null
        ? null
        : `${state.players[state.beloteSeat]!.nickname} : ${state.beloteStage === 1 ? "belote" : "belote et rebelote"}`,
    teams: [
      { seats: [0, 2], names: teamNames[0] },
      { seats: [1, 3], names: teamNames[1] },
    ],
    you: {
      id: me.id,
      seat: meIndex,
      team: (meIndex % 2) as 0 | 1,
      hand: me.hand.map((card) => ({ ...card })),
    },
    seats: state.players.map((seat, index) => ({
      id: seat.id,
      nickname: seat.nickname,
      seat: index,
      team: (index % 2) as 0 | 1,
      cards: seat.hand.length,
      isBot: seat.isBot,
      isDealer: index === state.dealer,
      isTurn: index === state.turn,
      isTaker: index === state.takerSeat,
    })),
    legalCards: legal.map((card) => ({ ...card })),
    result: state.result,
    log: [...state.log],
  };
}

export function hiddenBeloteCards(state: BeloteState, playerId: string): Card[] {
  const hidden = [...state.deck];
  for (const seat of state.players) {
    if (seat.id === playerId) continue;
    for (const card of seat.hand) {
      if (state.knownTakerCard && sameCard(card, state.knownTakerCard)) continue;
      hidden.push(card);
    }
  }
  return hidden;
}

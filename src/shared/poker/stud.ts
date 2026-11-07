import { cardFr, cardKey, pokerDeck, type Card } from "../cards";
import { shuffle, type Rng } from "../rng";
import { bestHand, compareScores, rankLabel } from "./evaluate";
import { formatDollars, stakesForBuyIn, type PokerAction } from "./holdem";
import {
  applyBet,
  autoRebuyBots,
  awardFold,
  freshSeats,
  legalBet,
  matchStatus,
  nextSeat,
  openBetting,
  potOf,
  postChip,
  prepareHand,
  pushLog,
  rebuySeat,
  resetStreet,
  splitPots,
  type BetSeat,
  type BetTable,
} from "./betting";

/**
 * Seven Card Stud. Deux cartes fermées, quatre ouvertes, une dernière fermée.
 * L'ante de table vaut la petite blind fictive, le bring-in vaut la grosse blind :
 * c'est la correspondance annoncée avec l'ante et le bring-in traditionnels.
 * La meilleure main de cinq cartes parmi sept. Trois recaves fictives.
 * Huit joueurs ne tiennent pas dans un jeu de 52 cartes : la table va jusqu'à sept.
 */

export type StudStreet = 3 | 4 | 5 | 6 | 7;

export type StudSeat = BetSeat & { down: Card[]; up: Card[] };

export type StudState = Omit<BetTable, "players"> & {
  kind: "stud";
  players: StudSeat[];
  street: StudStreet;
  deck: Card[];
  handNo: number;
  phase: "betting" | "between" | "match-over";
  result: { summary: string; revealed: { playerId: string; rank: string }[] } | null;
};

type SeatInput = { id: string; nickname: string; isBot?: boolean };

const SUIT_TIE = ["s", "h", "d", "c"];

function asBet(state: StudState): BetTable {
  return state;
}

function upScore(cards: readonly Card[]): number[] {
  if (cards.length >= 5) return bestHand(cards).score;
  const ranks = [...cards.map((card) => card.r)].sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  if ((groups[0]?.[1] ?? 0) >= 2) return [1, groups[0]![0], ...ranks.filter((rank) => rank !== groups[0]![0])];
  return [0, ...ranks];
}

function bringInIndex(state: StudState): number {
  let best = -1;
  for (let i = 0; i < state.players.length; i += 1) {
    const seat = state.players[i]!;
    if (seat.out || seat.folded || seat.up.length === 0) continue;
    if (best < 0) {
      best = i;
      continue;
    }
    const card = seat.up[0]!;
    const other = state.players[best]!.up[0]!;
    if (card.r < other.r || (card.r === other.r && SUIT_TIE.indexOf(card.s) < SUIT_TIE.indexOf(other.s))) best = i;
  }
  return best;
}

function highUpIndex(state: StudState): number {
  let best = -1;
  for (let i = 0; i < state.players.length; i += 1) {
    const seat = state.players[i]!;
    if (seat.out || seat.folded) continue;
    if (best < 0 || compareScores(upScore(seat.up), upScore(state.players[best]!.up)) > 0) best = i;
  }
  return best;
}

export function createStud(seats: SeatInput[], rng: Rng, options?: { startingStack?: number; deck?: Card[] }): StudState {
  if (seats.length < 2 || seats.length > 7) throw new Error("Le stud se joue de 2 à 7 joueurs.");
  const stake = stakesForBuyIn(options?.startingStack ?? 1000);
  const state: StudState = {
    kind: "stud",
    players: freshSeats(seats, stake.buyIn).map((seat) => ({ ...seat, down: [] as Card[], up: [] as Card[] })),
    button: -1,
    sb: stake.sb,
    bb: stake.bb,
    startingStack: stake.buyIn,
    currentBet: 0,
    minRaise: stake.bb,
    toAct: null,
    potLimit: false,
    log: [],
    street: 3,
    deck: [],
    handNo: 0,
    phase: "betting",
    result: null,
  };
  return dealStud(state, rng, options?.deck);
}

export function dealStud(state: StudState, rng: Rng, forced?: Card[]): StudState {
  const next = structuredClone(state);
  autoRebuyBots(next);
  if (!prepareHand(next)) {
    next.phase = "match-over";
    next.toAct = null;
    return next;
  }
  next.street = 3;
  next.phase = "betting";
  next.result = null;
  next.handNo += 1;
  for (const seat of next.players) {
    seat.down = [];
    seat.up = [];
  }
  const deck = forced ? [...forced] : shuffle(pokerDeck(), rng);
  const live = () => next.players.filter((seat) => !seat.out && !seat.folded);
  const give = (target: "down" | "up") => {
    for (const seat of live()) {
      const card = deck.shift();
      if (!card) throw new Error("Talon insuffisant.");
      seat[target].push(card);
    }
  };
  give("down");
  give("down");
  give("up");
  next.deck = deck;
  pushLog(next, `Donne ${next.handNo}. Stud. Ante ${formatDollars(next.sb)}, bring-in ${formatDollars(next.bb)}.`);
  for (let i = 0; i < next.players.length; i += 1) {
    if (!next.players[i]!.out) postChip(next, i, next.sb, "ante");
  }
  resetStreet(next);
  for (const seat of next.players) seat.committed = seat.committed;
  const opener = bringInIndex(next);
  postChip(next, opener, next.bb, "bring-in");
  next.players[opener]!.acted = true;
  next.currentBet = Math.max(...next.players.map((seat) => seat.streetBet));
  next.minRaise = next.bb;
  finishBet(next, openBetting(next, opener));
  return next;
}

function finishBet(state: StudState, status: "acting" | "round" | "folded") {
  if (status === "folded") {
    const winner = state.players.find((seat) => !seat.out && !seat.folded)!;
    const award = awardFold(asBet(state), winner);
    state.phase = "between";
    state.toAct = null;
    state.result = { summary: award.summary, revealed: [] };
    close(state);
    return;
  }
  if (status === "round") nextStreet(state);
}

function nextStreet(state: StudState) {
  const canAct = state.players.filter((seat) => !seat.out && !seat.folded && !seat.allIn);
  if (state.street === 7 || canAct.length <= 1) {
    while (state.street < 7 && state.players.some((seat) => !seat.folded && !seat.out && seat.down.length + seat.up.length < 7)) {
      dealOne(state);
    }
    showdown(state);
    return;
  }
  dealOne(state);
  const opener = highUpIndex(state);
  const status = openBetting(state, opener === 0 ? state.players.length - 1 : opener - 1);
  if (status !== "acting") nextStreet(state);
}

function dealOne(state: StudState) {
  const street = (state.street + 1) as StudStreet;
  state.street = street;
  const face = street === 7 ? "down" : "up";
  for (const seat of state.players) {
    if (seat.out || seat.folded) continue;
    const card = state.deck.shift();
    if (!card) throw new Error("Talon insuffisant.");
    seat[face].push(card);
  }
  resetStreet(state);
  const ups = state.players
    .filter((seat) => !seat.folded && !seat.out)
    .map((seat) => `${seat.nickname} ${seat.up.map(cardFr).join(" ")}`);
  pushLog(state, `${street}e rue. ${ups.join(" · ")}`);
}

function showdown(state: StudState) {
  const split = splitPots(
    asBet(state),
    (seat) => {
      const stud = seat as StudSeat;
      const cards = [...stud.down, ...stud.up];
      if (seat.folded || seat.out || cards.length < 5) return null;
      return bestHand(cards.slice(0, 7)).score;
    },
    rankLabel,
  );
  state.phase = "between";
  state.toAct = null;
  state.result = { summary: split.summary, revealed: split.revealed };
  pushLog(state, split.summary);
  close(state);
}

function close(state: StudState) {
  if (matchStatus(state) === "over") state.phase = "match-over";
}

export function applyStud(state: StudState, playerId: string, action: PokerAction): StudState {
  if (state.phase !== "betting") throw new Error("Aucune mise n'est attendue.");
  const next = structuredClone(state);
  finishBet(next, applyBet(asBet(next), playerId, action));
  return next;
}

export function rebuyStud(state: StudState, playerId: string): StudState {
  if (state.phase === "betting") throw new Error("La donne n'est pas terminée.");
  const next = structuredClone(state);
  rebuySeat(next, playerId);
  return next;
}

export function continueStud(state: StudState, rng: Rng, reset = false): StudState {
  if (state.phase === "betting") throw new Error("La donne n'est pas terminée.");
  if (reset || state.phase === "match-over") {
    const fresh = structuredClone(state);
    for (const seat of fresh.players) {
      seat.stack = fresh.startingStack;
      seat.rebuys = 0;
    }
    fresh.handNo = 0;
    fresh.log = ["Nouvelle partie, dollars fictifs redistribués."];
    fresh.phase = "between";
    return dealStud(fresh, rng);
  }
  return dealStud(state, rng);
}

export function actorStud(state: StudState): string | null {
  if (state.phase !== "betting" || state.toAct === null) return null;
  return state.players[state.toAct]?.id ?? null;
}

export function hiddenStud(state: StudState, playerId: string): Card[] {
  const hidden = [...state.deck];
  const reveal = state.phase !== "betting";
  for (const seat of state.players) {
    if (seat.id === playerId) continue;
    const shown = reveal && state.result?.revealed.some((item) => item.playerId === seat.id);
    if (!shown) hidden.push(...seat.down);
  }
  return hidden;
}

export function projectStud(state: StudState, playerId: string) {
  const me = state.players.find((seat) => seat.id === playerId);
  if (!me) throw new Error("Joueur introuvable.");
  const revealed = new Set(state.phase === "betting" ? [] : (state.result?.revealed.map((item) => item.playerId) ?? []));
  return {
    kind: "stud" as const,
    phase: state.phase,
    street: `${state.street}e rue`,
    board: [] as Card[],
    pot: potOf(state),
    handNo: state.handNo,
    sb: state.sb,
    bb: state.bb,
    toActId: actorStud(state),
    you: {
      id: me.id,
      hole: [...me.down, ...me.up].map((card) => ({ ...card })),
      stack: me.stack,
      toCall: Math.max(0, state.currentBet - me.streetBet),
      legal: legalBet(state, playerId),
      rebuys: me.rebuys,
      canRebuy: state.phase !== "betting" && me.stack <= 0 && me.rebuys < 3,
    },
    seats: state.players.map((seat, index) => ({
      id: seat.id,
      nickname: seat.nickname,
      stack: seat.stack,
      streetBet: seat.streetBet,
      folded: seat.folded,
      allIn: seat.allIn,
      isBot: seat.isBot,
      out: seat.out,
      hole: revealed.has(seat.id) ? [...seat.down, ...seat.up].map((card) => ({ ...card })) : null,
      up: seat.up.map((card) => ({ ...card })),
      hiddenCount: seat.id === playerId || revealed.has(seat.id) || seat.folded ? 0 : seat.down.length,
      isButton: index === state.button,
      isTurn: index === state.toAct,
    })),
    result: state.result,
    log: [...state.log],
  };
}

export function chooseStud(view: ReturnType<typeof projectStud>): PokerAction {
  const legal = view.you.legal;
  if (!legal) return { type: "check" };
  const mine = view.you.hole;
  const paired = mine.some((card) => mine.filter((other) => other.r === card.r).length >= 2);
  if (paired && legal.raise && !legal.raise.short) return { type: "bet", amount: legal.raise.minTo };
  if (legal.check) return { type: "check" };
  if (paired && legal.call !== null) return { type: "call" };
  if (legal.fold) return { type: "fold" };
  if (legal.call !== null) return { type: "call" };
  return { type: "check" };
}

export function studCardKey(card: Card): string {
  return cardKey(card);
}

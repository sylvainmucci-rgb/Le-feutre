import { cardFr, pokerDeck, sameCard, type Card } from "../cards";
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
 * Pot-limit Omaha. Quatre cartes fermées, cinq communes.
 * Exactement deux cartes de la main et trois du tableau.
 * Les blinds sont celles du Feutre (fixes). Le pot-limit est la règle traditionnelle de l'Omaha.
 * Trois recaves fictives au montant initial.
 */

export type OmahaSeat = BetSeat & { hole: Card[] };

export type OmahaState = Omit<BetTable, "players"> & {
  kind: "omaha";
  players: OmahaSeat[];
  street: "preflop" | "flop" | "turn" | "river";
  board: Card[];
  deck: Card[];
  handNo: number;
  phase: "betting" | "between" | "match-over";
  result: { summary: string; revealed: { playerId: string; rank: string }[] } | null;
};

type SeatInput = { id: string; nickname: string; isBot?: boolean; stack?: number };

function asBet(state: OmahaState): BetTable {
  return state;
}

export function bestOmaha(hole: readonly Card[], board: readonly Card[]) {
  if (hole.length < 2 || board.length < 3) throw new Error("Omaha : deux cartes privées et trois communes au moins.");
  let best: { score: number[]; five: Card[] } | null = null;
  for (let a = 0; a < hole.length; a += 1) {
    for (let b = a + 1; b < hole.length; b += 1) {
      for (let i = 0; i < board.length; i += 1) {
        for (let j = i + 1; j < board.length; j += 1) {
          for (let k = j + 1; k < board.length; k += 1) {
            const five = [hole[a]!, hole[b]!, board[i]!, board[j]!, board[k]!];
            const score = bestHand(five).score;
            if (!best || compareScores(score, best.score) > 0) best = { score, five };
          }
        }
      }
    }
  }
  return best!;
}

export function createOmaha(seats: SeatInput[], rng: Rng, options?: { startingStack?: number; deck?: Card[] }): OmahaState {
  if (seats.length < 2 || seats.length > 8) throw new Error("L'Omaha se joue de 2 à 8 joueurs.");
  const stake = stakesForBuyIn(options?.startingStack ?? 1000);
  const players = freshSeats(seats, stake.buyIn).map((seat) => ({ ...seat, hole: [] as Card[] }));
  const state: OmahaState = {
    kind: "omaha",
    players,
    button: -1,
    sb: stake.sb,
    bb: stake.bb,
    startingStack: stake.buyIn,
    currentBet: 0,
    minRaise: stake.bb,
    toAct: null,
    potLimit: true,
    log: [],
    street: "preflop",
    board: [],
    deck: [],
    handNo: 0,
    phase: "betting",
    result: null,
  };
  return dealOmaha(state, rng, options?.deck);
}

export function dealOmaha(state: OmahaState, rng: Rng, forced?: Card[]): OmahaState {
  const next = structuredClone(state);
  autoRebuyBots(next);
  if (!prepareHand(next)) {
    next.phase = "match-over";
    next.toAct = null;
    pushLog(next, "Plus assez de dollars fictifs pour continuer.");
    return next;
  }
  next.board = [];
  next.result = null;
  next.street = "preflop";
  next.phase = "betting";
  next.handNo += 1;
  for (const seat of next.players) seat.hole = [];
  const deck = forced ? [...forced] : shuffle(pokerDeck(), rng);
  const inHand = next.players.filter((seat) => !seat.out);
  const first = inHand.length === 2 ? next.button : nextSeat(next, next.button, (seat) => !seat.out);
  pushLog(next, `Donne ${next.handNo}. Omaha pot-limit. Blinds ${formatDollars(next.sb)}/${formatDollars(next.bb)}.`);
  for (let round = 0; round < 4; round += 1) {
    let cursor = first;
    for (let n = 0; n < inHand.length; n += 1) {
      const card = deck.shift();
      if (!card) throw new Error("Talon insuffisant.");
      next.players[cursor]!.hole.push(card);
      cursor = nextSeat(next, cursor, (seat) => !seat.out);
    }
  }
  const sbIndex = inHand.length === 2 ? next.button : nextSeat(next, next.button, (seat) => !seat.out);
  const bbIndex = nextSeat(next, sbIndex, (seat) => !seat.out);
  postChip(next, sbIndex, next.sb, "petite blind");
  postChip(next, bbIndex, next.bb, "grosse blind");
  next.currentBet = Math.max(...next.players.map((seat) => seat.streetBet));
  next.deck = deck;
  finishStatus(next, openBetting(next, bbIndex));
  return next;
}

function finishStatus(state: OmahaState, status: "acting" | "round" | "folded") {
  if (status === "folded") {
    const winner = state.players.find((seat) => !seat.out && !seat.folded)!;
    const award = awardFold(asBet(state), winner);
    state.phase = "between";
    state.toAct = null;
    state.result = { summary: award.summary, revealed: [] };
    close(state);
    return;
  }
  if (status === "round") advance(state);
}

function advance(state: OmahaState) {
  const canAct = state.players.filter((seat) => !seat.out && !seat.folded && !seat.allIn);
  if (state.street === "river" || canAct.length <= 1) {
    while (state.board.length < 5) dealStreet(state);
    showdown(state);
    return;
  }
  dealStreet(state);
  const status = openBetting(state, state.button);
  if (status !== "acting") advance(state);
}

function dealStreet(state: OmahaState) {
  state.deck.shift();
  const count = state.board.length === 0 ? 3 : 1;
  for (let i = 0; i < count; i += 1) {
    const card = state.deck.shift();
    if (!card) throw new Error("Talon insuffisant.");
    state.board.push(card);
  }
  state.street = state.board.length === 3 ? "flop" : state.board.length === 4 ? "turn" : "river";
  resetStreet(state);
  pushLog(state, `${state.street} : ${state.board.map(cardFr).join(", ")}.`);
}

function showdown(state: OmahaState) {
  const split = splitPots(
    asBet(state),
    (seat) => {
      const hole = (seat as OmahaSeat).hole;
      if (seat.folded || seat.out || hole.length < 2) return null;
      return bestOmaha(hole, state.board).score;
    },
    rankLabel,
  );
  state.phase = "between";
  state.toAct = null;
  state.result = { summary: split.summary, revealed: split.revealed };
  pushLog(state, split.summary);
  close(state);
}

function close(state: OmahaState) {
  const status = matchStatus(state);
  if (status === "over") {
    state.phase = "match-over";
    const winner = state.players.find((seat) => seat.stack > 0);
    if (winner) pushLog(state, `${winner.nickname} remporte la partie.`);
  } else if (status === "rebuy") {
    state.phase = "between";
    pushLog(state, "Recave possible, trois fois au plus, au montant initial fictif.");
  }
}

export function applyOmaha(state: OmahaState, playerId: string, action: PokerAction): OmahaState {
  if (state.phase !== "betting") throw new Error("Aucune mise n'est attendue.");
  const next = structuredClone(state);
  finishStatus(next, applyBet(asBet(next), playerId, action));
  return next;
}

export function rebuyOmaha(state: OmahaState, playerId: string): OmahaState {
  if (state.phase === "betting") throw new Error("La donne n'est pas terminée.");
  const next = structuredClone(state);
  rebuySeat(next, playerId);
  if (matchStatus(next) !== "over") next.phase = "between";
  return next;
}

export function continueOmaha(state: OmahaState, rng: Rng, reset = false): OmahaState {
  if (state.phase === "betting") throw new Error("La donne n'est pas terminée.");
  if (state.phase === "match-over" || reset) {
    const fresh = structuredClone(state);
    for (const seat of fresh.players) {
      seat.stack = fresh.startingStack;
      seat.rebuys = 0;
    }
    fresh.phase = "between";
    fresh.handNo = 0;
    fresh.log = ["Nouvelle partie, dollars fictifs redistribués."];
    return dealOmaha(fresh, rng);
  }
  return dealOmaha(state, rng);
}

export function actorOmaha(state: OmahaState): string | null {
  if (state.toAct === null || state.phase !== "betting") return null;
  return state.players[state.toAct]?.id ?? null;
}

export function hiddenOmaha(state: OmahaState, playerId: string): Card[] {
  const hidden = [...state.deck];
  const reveal = state.phase !== "betting";
  for (const seat of state.players) {
    if (seat.id === playerId) continue;
    const shown = reveal && state.result?.revealed.some((item) => item.playerId === seat.id);
    if (!shown) hidden.push(...seat.hole);
  }
  return hidden;
}

export function projectOmaha(state: OmahaState, playerId: string) {
  const me = state.players.find((seat) => seat.id === playerId);
  if (!me) throw new Error("Joueur introuvable.");
  const revealed = new Set(state.phase === "betting" ? [] : (state.result?.revealed.map((item) => item.playerId) ?? []));
  return {
    kind: "omaha" as const,
    phase: state.phase,
    street: state.street,
    board: state.board.map((card) => ({ ...card })),
    pot: potOf(state),
    handNo: state.handNo,
    sb: state.sb,
    bb: state.bb,
    toActId: actorOmaha(state),
    you: {
      id: me.id,
      hole: me.hole.map((card) => ({ ...card })),
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
      hole: seat.id === playerId || revealed.has(seat.id) ? seat.hole.map((card) => ({ ...card })) : null,
      up: [] as Card[],
      hiddenCount: seat.id === playerId || revealed.has(seat.id) || seat.folded ? 0 : Math.min(seat.hole.length, 4),
      isButton: index === state.button,
      isTurn: index === state.toAct,
    })),
    result: state.result,
    log: [...state.log],
  };
}

export function chooseOmaha(view: ReturnType<typeof projectOmaha>): PokerAction {
  const legal = view.you.legal;
  if (!legal) return { type: "check" };
  const hole = view.you.hole;
  const paired = hole.some((card, index) => hole.some((other, otherIndex) => otherIndex !== index && other.r === card.r));
  const suited = ["s", "h", "d", "c"].some((suit) => hole.filter((card) => card.s === suit).length >= 2);
  if (view.board.length >= 3 && legal.raise && !legal.raise.short) {
    try {
      const made = bestOmaha(hole, view.board).score[0] ?? 0;
      if (made >= 2) return { type: "bet", amount: legal.raise.minTo };
    } catch {
      /* pas encore assez de cartes */
    }
  }
  if ((paired || suited) && legal.call !== null) return { type: "call" };
  if (legal.check) return { type: "check" };
  if (legal.fold && !paired) return { type: "fold" };
  if (legal.call !== null) return { type: "call" };
  return { type: "check" };
}

export function findOmahaCard(cards: readonly Card[], card: Card): boolean {
  return cards.some((candidate) => sameCard(candidate, card));
}

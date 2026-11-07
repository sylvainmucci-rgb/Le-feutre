import { cardKey, pokerDeck, sameCard, type Card } from "../cards";
import { shuffle, type Rng } from "../rng";
import { bestHand, rankLabel } from "./evaluate";
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
 * Poker fermé, cinq cartes, un changement.
 * On échange au plus trois cartes, ou quatre si l'on garde un as (usage courant du poker fermé).
 * Les blinds fixes du Feutre remplacent l'ante traditionnel : c'est la variante de table, annoncée.
 * Deux tours d'enchères no-limit. Trois recaves fictives.
 */

export type DrawAction = PokerAction | { type: "discard"; cards: Card[] };

export type DrawSeat = BetSeat & { hole: Card[] };

export type DrawState = Omit<BetTable, "players"> & {
  kind: "draw";
  players: DrawSeat[];
  round: 1 | 2;
  deck: Card[];
  handNo: number;
  phase: "betting" | "draw" | "between" | "match-over";
  result: { summary: string; revealed: { playerId: string; rank: string }[] } | null;
};

type SeatInput = { id: string; nickname: string; isBot?: boolean };

function asBet(state: DrawState): BetTable {
  return state;
}

export function createDraw(seats: SeatInput[], rng: Rng, options?: { startingStack?: number; deck?: Card[] }): DrawState {
  if (seats.length < 2 || seats.length > 6) throw new Error("Le poker fermé se joue de 2 à 6 joueurs.");
  const stake = stakesForBuyIn(options?.startingStack ?? 1000);
  const state: DrawState = {
    kind: "draw",
    players: freshSeats(seats, stake.buyIn).map((seat) => ({ ...seat, hole: [] as Card[] })),
    button: -1,
    sb: stake.sb,
    bb: stake.bb,
    startingStack: stake.buyIn,
    currentBet: 0,
    minRaise: stake.bb,
    toAct: null,
    potLimit: false,
    log: [],
    round: 1,
    deck: [],
    handNo: 0,
    phase: "betting",
    result: null,
  };
  return dealDraw(state, rng, options?.deck);
}

export function dealDraw(state: DrawState, rng: Rng, forced?: Card[]): DrawState {
  const next = structuredClone(state);
  autoRebuyBots(next);
  if (!prepareHand(next)) {
    next.phase = "match-over";
    next.toAct = null;
    return next;
  }
  next.result = null;
  next.round = 1;
  next.phase = "betting";
  next.handNo += 1;
  for (const seat of next.players) seat.hole = [];
  const deck = forced ? [...forced] : shuffle(pokerDeck(), rng);
  const inHand = next.players.filter((seat) => !seat.out);
  const first = inHand.length === 2 ? next.button : nextSeat(next, next.button, (seat) => !seat.out);
  pushLog(next, `Donne ${next.handNo}. Poker fermé. Blinds ${formatDollars(next.sb)}/${formatDollars(next.bb)}.`);
  for (let round = 0; round < 5; round += 1) {
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
  finishBet(next, openBetting(next, bbIndex));
  return next;
}

function finishBet(state: DrawState, status: "acting" | "round" | "folded") {
  if (status === "folded") return folded(state);
  if (status !== "round") return;
  if (state.round === 1) {
    state.phase = "draw";
    for (const seat of state.players) seat.canRaise = !seat.out && !seat.folded;
    state.toAct = nextSeat(state, state.button, (seat) => seat.canRaise);
    if (state.toAct === -1) showdown(state);
    return;
  }
  showdown(state);
}

function folded(state: DrawState) {
  const winner = state.players.find((seat) => !seat.out && !seat.folded)!;
  const award = awardFold(asBet(state), winner);
  state.phase = "between";
  state.toAct = null;
  state.result = { summary: award.summary, revealed: [] };
  close(state);
}

function showdown(state: DrawState) {
  const split = splitPots(
    asBet(state),
    (seat) => {
      const hole = (seat as DrawSeat).hole;
      if (seat.folded || seat.out || hole.length !== 5) return null;
      return bestHand(hole).score;
    },
    rankLabel,
  );
  state.phase = "between";
  state.toAct = null;
  state.result = { summary: split.summary, revealed: split.revealed };
  pushLog(state, split.summary);
  close(state);
}

function close(state: DrawState) {
  const status = matchStatus(state);
  if (status === "over") state.phase = "match-over";
}

export function maxDiscard(hole: readonly Card[], discarded: readonly Card[]): boolean {
  if (discarded.length > 4) return false;
  if (discarded.length <= 3) return true;
  const gone = new Set(discarded.map(cardKey));
  const kept = hole.filter((card) => !gone.has(cardKey(card)));
  return kept.length === hole.length - discarded.length && kept.some((card) => card.r === 14);
}

export function applyDraw(state: DrawState, playerId: string, action: DrawAction): DrawState {
  const next = structuredClone(state);
  if (next.phase === "betting") {
    if (action.type === "discard") throw new Error("Ce n'est pas le moment d'échanger.");
    finishBet(next, applyBet(asBet(next), playerId, action));
    return next;
  }
  if (next.phase !== "draw" || action.type !== "discard") throw new Error("Choisissez les cartes à échanger.");
  const index = next.players.findIndex((seat) => seat.id === playerId);
  if (index !== next.toAct) throw new Error("Ce n'est pas votre tour.");
  const seat = next.players[index]!;
  const unique = new Set(action.cards.map(cardKey));
  if (unique.size !== action.cards.length) throw new Error("Carte en double.");
  if (!maxDiscard(seat.hole, action.cards)) {
    throw new Error("On échange au plus trois cartes, ou quatre en gardant un as.");
  }
  for (const card of action.cards) {
    const at = seat.hole.findIndex((candidate) => sameCard(candidate, card));
    if (at < 0) throw new Error("Cette carte n'est pas dans votre main.");
    seat.hole.splice(at, 1);
  }
  for (let i = 0; i < action.cards.length; i += 1) {
    const card = next.deck.shift();
    if (!card) throw new Error("Talon insuffisant.");
    seat.hole.push(card);
  }
  pushLog(next, `${seat.nickname} échange ${action.cards.length} carte${action.cards.length > 1 ? "s" : ""}.`);
  seat.canRaise = false;
  const nextDraw = nextSeat(next, index, (candidate) => candidate.canRaise);
  if (nextDraw === -1) {
    next.round = 2;
    next.phase = "betting";
    resetStreet(next);
    for (const candidate of next.players) candidate.canRaise = true;
    const status = openBetting(next, next.button);
    finishBet(next, status);
  } else {
    next.toAct = nextDraw;
  }
  return next;
}

export function rebuyDraw(state: DrawState, playerId: string): DrawState {
  if (state.phase === "betting" || state.phase === "draw") throw new Error("La donne n'est pas terminée.");
  const next = structuredClone(state);
  rebuySeat(next, playerId);
  return next;
}

export function continueDraw(state: DrawState, rng: Rng, reset = false): DrawState {
  if (state.phase === "betting" || state.phase === "draw") throw new Error("La donne n'est pas terminée.");
  if (reset || state.phase === "match-over") {
    const fresh = structuredClone(state);
    for (const seat of fresh.players) {
      seat.stack = fresh.startingStack;
      seat.rebuys = 0;
    }
    fresh.handNo = 0;
    fresh.log = ["Nouvelle partie, dollars fictifs redistribués."];
    fresh.phase = "between";
    return dealDraw(fresh, rng);
  }
  return dealDraw(state, rng);
}

export function actorDraw(state: DrawState): string | null {
  if (state.toAct === null) return null;
  if (state.phase !== "betting" && state.phase !== "draw") return null;
  return state.players[state.toAct]?.id ?? null;
}

export function hiddenDraw(state: DrawState, playerId: string): Card[] {
  const hidden = [...state.deck];
  const reveal = state.phase === "between" || state.phase === "match-over";
  for (const seat of state.players) {
    if (seat.id === playerId) continue;
    const shown = reveal && state.result?.revealed.some((item) => item.playerId === seat.id);
    if (!shown) hidden.push(...seat.hole);
  }
  return hidden;
}

export function projectDraw(state: DrawState, playerId: string) {
  const me = state.players.find((seat) => seat.id === playerId);
  if (!me) throw new Error("Joueur introuvable.");
  const revealed = new Set(state.phase === "betting" || state.phase === "draw" ? [] : (state.result?.revealed.map((item) => item.playerId) ?? []));
  const prompts =
    state.phase === "draw" && actorDraw(state) === playerId
      ? [{ label: "Garder les cinq cartes", action: { type: "discard", cards: [] as Card[] } }]
      : [];
  return {
    kind: "draw" as const,
    phase: state.phase,
    street: state.round === 1 ? "premier tour" : "second tour",
    board: [] as Card[],
    pot: potOf(state),
    handNo: state.handNo,
    sb: state.sb,
    bb: state.bb,
    toActId: actorDraw(state),
    you: {
      id: me.id,
      hole: me.hole.map((card) => ({ ...card })),
      stack: me.stack,
      toCall: Math.max(0, state.currentBet - me.streetBet),
      legal: state.phase === "betting" ? legalBet(state, playerId) : null,
      rebuys: me.rebuys,
      canRebuy: state.phase !== "betting" && state.phase !== "draw" && me.stack <= 0 && me.rebuys < 3,
      prompts,
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
      hiddenCount: seat.id === playerId || revealed.has(seat.id) || seat.folded ? 0 : 5,
      isButton: index === state.button,
      isTurn: index === state.toAct && (state.phase === "betting" || state.phase === "draw"),
    })),
    result: state.result,
    log: [...state.log],
    draw: state.phase === "draw",
  };
}

export function chooseDraw(view: ReturnType<typeof projectDraw>): DrawAction {
  if (view.phase === "draw") {
    const hole = view.you.hole;
    const counts = new Map<number, Card[]>();
    for (const card of hole) {
      const pile = counts.get(card.r) ?? [];
      pile.push(card);
      counts.set(card.r, pile);
    }
    const keepRanks = [...counts.entries()]
      .filter(([, cards]) => cards.length >= 2)
      .map(([rank]) => rank);
    const discard = hole.filter((card) => !keepRanks.includes(card.r)).slice(0, 3);
    return { type: "discard", cards: discard };
  }
  const legal = view.you.legal;
  if (!legal) return { type: "check" };
  if (legal.check) return { type: "check" };
  if (legal.call !== null && legal.call <= view.bb * 2) return { type: "call" };
  if (legal.fold) return { type: "fold" };
  if (legal.call !== null) return { type: "call" };
  return { type: "check" };
}

import { cardFr, pokerDeck, sameCard, type Card } from "../cards";
import { shuffle, type Rng } from "../rng";
import { bestHand, compareScores, rankLabel } from "./evaluate";

/**
 * Texas Hold'em no-limit, dollars fictifs comptés en centimes.
 * Tapis 2 $, 5 $ ou 10 $. Blinds fixes 0,05/0,10 $, 0,25/0,50 $ ou 0,50/1 $.
 * Elles ne doublent pas d'une rue à l'autre.
 * Meilleure main de cinq cartes parmi sept.
 * Pots séparés en cas de tapis. Le centime indivisible va au gagnant
 * le plus proche à gauche du bouton.
 * Un tapis inférieur à une relance complète ne rouvre pas les enchères.
 * Tête-à-tête : le bouton est petite blind et parle en premier avant le flop.
 */

export type PokerAction =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "bet"; amount: number };

export type PokerSeat = {
  id: string;
  nickname: string;
  stack: number;
  hole: [Card, Card] | null;
  streetBet: number;
  committed: number;
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  canRaise: boolean;
  isBot: boolean;
  out: boolean;
};

export type Street = "preflop" | "flop" | "turn" | "river";

export type PotAward = {
  amount: number;
  winnerIds: string[];
  rank: string;
};

export type Reveal = {
  playerId: string;
  hole: [Card, Card];
  rank: string;
  five: Card[];
};

export type HandResult = {
  pots: PotAward[];
  revealed: Reveal[];
  awards: { playerId: string; amount: number }[];
  summary: string;
};

export type HoldemState = {
  kind: "texas-holdem";
  players: PokerSeat[];
  button: number;
  sb: number;
  bb: number;
  startingStack: number;
  street: Street;
  board: Card[];
  deck: Card[];
  currentBet: number;
  minRaise: number;
  toAct: number | null;
  handNo: number;
  phase: "betting" | "between" | "match-over";
  result: HandResult | null;
  log: string[];
};

export type RaiseWindow = { minTo: number; maxTo: number; short: boolean };

export type LegalPoker = {
  fold: boolean;
  check: boolean;
  call: number | null;
  raise: RaiseWindow | null;
};

export type HoldemSeatView = {
  id: string;
  nickname: string;
  stack: number;
  streetBet: number;
  folded: boolean;
  allIn: boolean;
  isBot: boolean;
  out: boolean;
  hole: [Card, Card] | null;
  isButton: boolean;
  isTurn: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
};

export type HoldemView = {
  kind: "texas-holdem";
  phase: HoldemState["phase"];
  street: Street;
  board: Card[];
  pot: number;
  currentBet: number;
  handNo: number;
  sb: number;
  bb: number;
  toActId: string | null;
  you: {
    id: string;
    hole: [Card, Card] | null;
    stack: number;
    streetBet: number;
    toCall: number;
    folded: boolean;
    allIn: boolean;
    legal: LegalPoker | null;
  };
  seats: HoldemSeatView[];
  result: HandResult | null;
  log: string[];
};

type SeatInput = { id: string; nickname: string; isBot?: boolean; stack?: number };

const DEFAULT_SB = 50;
const DEFAULT_BB = 100;
const DEFAULT_STACK = 1000;

/**
 * Centimes. 200 = 2 $, 500 = 5 $, 1 000 = 10 $.
 * Blinds demandées : 0,05/0,10 $, 0,25/0,50 $, 0,50/1 $.
 * Pour 2 $, cela fait 2,5 % et 5 % du tapis. Les blinds restent fixes.
 */
export const HOLDEM_STAKES = {
  200: { sb: 5, bb: 10 },
  500: { sb: 25, bb: 50 },
  1000: { sb: 50, bb: 100 },
} as const;

export type HoldemBuyIn = keyof typeof HOLDEM_STAKES;

export function stakesForBuyIn(buyIn: number): { buyIn: HoldemBuyIn; sb: number; bb: number } {
  if (buyIn !== 200 && buyIn !== 500 && buyIn !== 1000) {
    throw new Error("Le tapis fictif doit être de 2, 5 ou 10 dollars.");
  }
  return { buyIn, sb: HOLDEM_STAKES[buyIn].sb, bb: HOLDEM_STAKES[buyIn].bb };
}

/** Affichage français : 5 → « 0,05 $ », 100 → « 1 $ », 1000 → « 10 $ ». */
export function formatDollars(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  const body = rest === 0 ? String(dollars) : `${dollars},${String(rest).padStart(2, "0")}`;
  return `${negative ? "−" : ""}${body} $`;
}

function log(state: HoldemState, line: string) {
  state.log.push(line);
  if (state.log.length > 40) state.log.shift();
}

function nextIndex(state: HoldemState, index: number, pred: (seat: PokerSeat) => boolean): number {
  for (let step = 1; step <= state.players.length; step += 1) {
    const i = (index + step) % state.players.length;
    if (pred(state.players[i]!)) return i;
  }
  return -1;
}

function needsAction(seat: PokerSeat, currentBet: number): boolean {
  if (seat.out || seat.folded || seat.allIn) return false;
  return seat.streetBet < currentBet || !seat.acted;
}

export function createMatch(
  seats: SeatInput[],
  rng: Rng,
  options?: { sb?: number; bb?: number; startingStack?: number; deck?: Card[] },
): HoldemState {
  if (seats.length < 2 || seats.length > 8) {
    throw new Error("Le Hold'em se joue de 2 à 8 joueurs.");
  }
  let startingStack = DEFAULT_STACK;
  let sb = options?.sb ?? DEFAULT_SB;
  let bb = options?.bb ?? DEFAULT_BB;
  if (options?.startingStack !== undefined) {
    const stake = stakesForBuyIn(options.startingStack);
    startingStack = stake.buyIn;
    if (options.sb === undefined) sb = stake.sb;
    if (options.bb === undefined) bb = stake.bb;
  }
  const state: HoldemState = {
    kind: "texas-holdem",
    players: seats.map((seat) => ({
      id: seat.id,
      nickname: seat.nickname,
      stack: seat.stack ?? startingStack,
      hole: null,
      streetBet: 0,
      committed: 0,
      folded: false,
      allIn: false,
      acted: false,
      canRaise: true,
      isBot: Boolean(seat.isBot),
      out: false,
    })),
    button: -1,
    sb,
    bb,
    startingStack,
    street: "preflop",
    board: [],
    deck: [],
    currentBet: 0,
    minRaise: bb,
    toAct: null,
    handNo: 0,
    phase: "betting",
    result: null,
    log: [],
  };
  return dealHand(state, rng, options?.deck);
}

export function dealHand(state: HoldemState, rng: Rng, forcedDeck?: Card[]): HoldemState {
  const next = structuredClone(state);
  const alive = next.players.filter((seat) => seat.stack > 0);
  if (alive.length < 2) {
    next.phase = "match-over";
    next.toAct = null;
    next.result = null;
    log(next, "Plus assez de dollars fictifs pour continuer.");
    return next;
  }
  for (const seat of next.players) {
    seat.hole = null;
    seat.streetBet = 0;
    seat.committed = 0;
    seat.folded = seat.stack <= 0;
    seat.allIn = false;
    seat.acted = false;
    seat.canRaise = true;
    seat.out = seat.stack <= 0;
  }
  next.board = [];
  next.result = null;
  next.street = "preflop";
  next.phase = "betting";
  next.currentBet = 0;
  next.minRaise = next.bb;
  next.handNo += 1;
  next.button = nextIndex(next, next.button, (seat) => !seat.out);
  const deck = forcedDeck ? [...forcedDeck] : shuffle(pokerDeck(), rng);
  const inHand = next.players.filter((seat) => !seat.out);
  const buttonSeat = next.players[next.button]!;
  const firstDeal = inHand.length === 2 ? next.button : nextIndex(next, next.button, (seat) => !seat.out);
  log(next, `Donne ${next.handNo}. Bouton : ${buttonSeat.nickname}. Blinds ${formatDollars(next.sb)}/${formatDollars(next.bb)}.`);
  const dealt = new Map<number, Card[]>();
  for (let round = 0; round < 2; round += 1) {
    let cursor = firstDeal;
    for (let n = 0; n < inHand.length; n += 1) {
      const card = deck.shift();
      if (!card) throw new Error("Talon insuffisant.");
      const pile = dealt.get(cursor) ?? [];
      pile.push(card);
      dealt.set(cursor, pile);
      cursor = nextIndex(next, cursor, (candidate) => !candidate.out);
    }
  }
  for (const [index, cards] of dealt) {
    next.players[index]!.hole = [cards[0]!, cards[1]!];
  }
  const sbIndex = inHand.length === 2 ? next.button : nextIndex(next, next.button, (seat) => !seat.out);
  const bbIndex = nextIndex(next, sbIndex, (seat) => !seat.out);
  postBlind(next, sbIndex, next.sb);
  postBlind(next, bbIndex, next.bb);
  next.currentBet = Math.max(...next.players.map((seat) => seat.streetBet));
  next.deck = deck;
  openBetting(next, bbIndex);
  return next;
}

function postBlind(state: HoldemState, index: number, amount: number) {
  const seat = state.players[index]!;
  const pay = Math.min(amount, seat.stack);
  seat.stack -= pay;
  seat.streetBet += pay;
  seat.committed += pay;
  if (seat.stack === 0) seat.allIn = true;
  log(state, `${seat.nickname} pose ${formatDollars(pay)} (blind).`);
}

function openBetting(state: HoldemState, anchor: number) {
  const contenders = state.players.filter((seat) => !seat.out && !seat.folded);
  if (contenders.length <= 1) {
    if (contenders[0]) awardByFold(state, contenders[0]);
    return;
  }
  const next = nextIndex(state, anchor, (seat) => needsAction(seat, state.currentBet));
  if (next === -1) {
    finishOrNextStreet(state);
    return;
  }
  state.toAct = next;
  state.phase = "betting";
}

export function applyPoker(state: HoldemState, playerId: string, action: PokerAction): HoldemState {
  if (state.phase !== "betting" || state.toAct === null) {
    throw new Error("Aucune mise n'est attendue.");
  }
  const index = state.players.findIndex((seat) => seat.id === playerId);
  if (index !== state.toAct) throw new Error("Ce n'est pas votre tour.");
  const next = structuredClone(state);
  const seat = next.players[index]!;
  const toCall = next.currentBet - seat.streetBet;
  if (action.type === "fold") {
    if (toCall <= 0) throw new Error("Vous pouvez dire parole : il n'y a rien à suivre.");
    seat.folded = true;
    seat.acted = true;
    log(next, `${seat.nickname} se couche.`);
  } else if (action.type === "check") {
    if (toCall > 0) throw new Error("Vous ne pouvez pas dire parole : une mise est à suivre.");
    seat.acted = true;
    log(next, `${seat.nickname} dit parole.`);
  } else if (action.type === "call") {
    if (toCall <= 0) throw new Error("Il n'y a rien à suivre.");
    const pay = Math.min(toCall, seat.stack);
    seat.stack -= pay;
    seat.streetBet += pay;
    seat.committed += pay;
    if (seat.stack === 0) seat.allIn = true;
    seat.acted = true;
    log(next, seat.allIn ? `${seat.nickname} fait tapis en suivant.` : `${seat.nickname} suit ${formatDollars(next.currentBet)}.`);
  } else if (action.type === "bet") {
    placeBet(next, seat, action.amount);
  } else {
    throw new Error("Action inconnue.");
  }
  const foldedTo = next.players.filter((candidate) => !candidate.out && !candidate.folded);
  if (foldedTo.length === 1) {
    awardByFold(next, foldedTo[0]!);
    return next;
  }
  const following = nextIndex(next, index, (candidate) => needsAction(candidate, next.currentBet));
  if (following === -1) finishOrNextStreet(next);
  else next.toAct = following;
  return next;
}

function placeBet(state: HoldemState, seat: PokerSeat, target: number) {
  if (!Number.isInteger(target)) throw new Error("Le montant doit être un nombre entier de centimes.");
  const toCall = state.currentBet - seat.streetBet;
  if (!seat.canRaise) throw new Error("Vous pouvez suivre, mais pas relancer.");
  if (target <= state.currentBet) throw new Error("Pour suivre, utilisez le bouton Suivre.");
  const paying = target - seat.streetBet;
  if (paying <= 0 || paying > seat.stack) throw new Error("Montant de mise impossible.");
  if (seat.stack <= toCall) throw new Error("Vous ne pouvez pas relancer : il ne reste que l'appel.");
  const increase = target - state.currentBet;
  const allIn = paying === seat.stack;
  const full = increase >= state.minRaise;
  if (!full && !allIn) {
    const minimum = state.currentBet === 0 ? state.minRaise : state.currentBet + state.minRaise;
    throw new Error(
      state.currentBet === 0
        ? `La mise minimale est de ${formatDollars(state.minRaise)}.`
        : `La relance minimale porte le total à ${formatDollars(minimum)}.`,
    );
  }
  const previous = state.currentBet;
  seat.stack -= paying;
  seat.streetBet = target;
  seat.committed += paying;
  if (seat.stack === 0) seat.allIn = true;
  seat.acted = true;
  if (full) {
    state.minRaise = increase;
    state.currentBet = target;
    for (const other of state.players) {
      if (other.id === seat.id || other.folded || other.allIn || other.out) continue;
      other.acted = false;
      other.canRaise = true;
    }
    log(state, previous === 0 ? `${seat.nickname} mise ${formatDollars(target)}.` : `${seat.nickname} relance à ${formatDollars(target)}.`);
  } else {
    state.currentBet = target;
    for (const other of state.players) {
      if (other.acted) other.canRaise = false;
    }
    log(state, `${seat.nickname} fait tapis à ${formatDollars(target)}.`);
  }
}

function finishOrNextStreet(state: HoldemState) {
  const contenders = state.players.filter((seat) => !seat.out && !seat.folded);
  const canAct = contenders.filter((seat) => !seat.allIn);
  if (state.street === "river" || canAct.length <= 1) {
    if (state.street !== "river") runOut(state);
    showdown(state);
    return;
  }
  dealStreet(state);
  const actor = nextIndex(state, state.button, (seat) => needsAction(seat, state.currentBet));
  if (actor === -1) finishOrNextStreet(state);
  else state.toAct = actor;
}

function dealStreet(state: HoldemState) {
  state.deck.shift();
  const count = state.board.length === 0 ? 3 : 1;
  for (let i = 0; i < count; i += 1) {
    const card = state.deck.shift();
    if (!card) throw new Error("Talon insuffisant.");
    state.board.push(card);
  }
  state.street = state.board.length === 3 ? "flop" : state.board.length === 4 ? "turn" : "river";
  for (const seat of state.players) {
    seat.streetBet = 0;
    seat.acted = false;
    seat.canRaise = true;
  }
  state.currentBet = 0;
  state.minRaise = state.bb;
  const names: Record<Street, string> = {
    preflop: "Préflop",
    flop: "Flop",
    turn: "Turn",
    river: "River",
  };
  log(state, `${names[state.street]} : ${state.board.map(cardFr).join(", ")}.`);
}

function runOut(state: HoldemState) {
  while (state.board.length < 5) dealStreet(state);
}

function awardByFold(state: HoldemState, winner: PokerSeat) {
  const pot = state.players.reduce((sum, seat) => sum + seat.committed, 0);
  winner.stack += pot;
  state.phase = "between";
  state.toAct = null;
  state.result = {
    pots: [{ amount: pot, winnerIds: [winner.id], rank: "Sans abattage" }],
    revealed: [],
    awards: [{ playerId: winner.id, amount: pot }],
    summary: `${winner.nickname} remporte ${formatDollars(pot)}. Les cartes restent cachées.`,
  };
  log(state, state.result.summary);
  closeMatchIfNeeded(state);
}

function showdown(state: HoldemState) {
  const contenders = state.players.filter((seat) => !seat.out && !seat.folded && seat.hole);
  const scored = contenders.map((seat) => ({
    seat,
    best: bestHand([...(seat.hole as [Card, Card]), ...state.board]),
  }));
  const levels = [...new Set(state.players.map((seat) => seat.committed).filter((value) => value > 0))].sort(
    (a, b) => a - b,
  );
  const gained = new Map<string, number>();
  const pots: PotAward[] = [];
  let previous = 0;
  for (const level of levels) {
    let pot = 0;
    const eligible: typeof scored = [];
    for (const seat of state.players) {
      pot += Math.min(seat.committed, level) - Math.min(seat.committed, previous);
    }
    for (const entry of scored) {
      if (entry.seat.committed >= level) eligible.push(entry);
    }
    if (pot <= 0 || eligible.length === 0) {
      previous = level;
      continue;
    }
    let winners = [eligible[0]!];
    for (const entry of eligible.slice(1)) {
      const diff = compareScores(entry.best.score, winners[0]!.best.score);
      if (diff > 0) winners = [entry];
      else if (diff === 0) winners.push(entry);
    }
    const ordered = [...winners].sort((a, b) => distanceFromButton(state, a.seat) - distanceFromButton(state, b.seat));
    const share = Math.floor(pot / ordered.length);
    let rest = pot % ordered.length;
    const winnerIds: string[] = [];
    for (const winner of ordered) {
      const amount = share + (rest > 0 ? 1 : 0);
      if (rest > 0) rest -= 1;
      gained.set(winner.seat.id, (gained.get(winner.seat.id) ?? 0) + amount);
      winnerIds.push(winner.seat.id);
    }
    pots.push({ amount: pot, winnerIds, rank: rankLabel(ordered[0]!.best.score) });
    previous = level;
  }
  const awards = [...gained.entries()].map(([playerId, amount]) => ({ playerId, amount }));
  for (const award of awards) {
    const seat = state.players.find((candidate) => candidate.id === award.playerId);
    if (seat) seat.stack += award.amount;
  }
  const revealed: Reveal[] = scored.map((entry) => ({
    playerId: entry.seat.id,
    hole: entry.seat.hole as [Card, Card],
    rank: rankLabel(entry.best.score),
    five: entry.best.five,
  }));
  const phrases = pots.map((pot) => {
    const names = pot.winnerIds.map((id) => state.players.find((seat) => seat.id === id)?.nickname ?? id);
    return `${names.join(" et ")} remporte ${formatDollars(pot.amount)} (${pot.rank})`;
  });
  state.phase = "between";
  state.toAct = null;
  state.result = {
    pots,
    revealed,
    awards,
    summary: phrases.join(". ") + ".",
  };
  log(state, state.result.summary);
  closeMatchIfNeeded(state);
}

function distanceFromButton(state: HoldemState, seat: PokerSeat): number {
  const index = state.players.findIndex((candidate) => candidate.id === seat.id);
  return (index - state.button - 1 + state.players.length) % state.players.length;
}

function closeMatchIfNeeded(state: HoldemState) {
  const alive = state.players.filter((seat) => seat.stack > 0);
  if (alive.length < 2) {
    state.phase = "match-over";
    const winner = alive[0];
    if (winner) log(state, `${winner.nickname} remporte la partie.`);
  }
}

export function continueHoldem(state: HoldemState, rng: Rng, reset = false): HoldemState {
  if (state.phase === "betting") throw new Error("La donne n'est pas terminée.");
  if (state.phase === "match-over" || reset) {
    const fresh = structuredClone(state);
    for (const seat of fresh.players) seat.stack = fresh.startingStack;
    fresh.phase = "between";
    fresh.handNo = 0;
    fresh.log = ["Nouvelle partie, dollars fictifs redistribués."];
    return dealHand(fresh, rng);
  }
  return dealHand(state, rng);
}

export function legalPoker(state: HoldemState, playerId: string): LegalPoker | null {
  if (state.phase !== "betting" || state.toAct === null) return null;
  const seat = state.players[state.toAct];
  if (!seat || seat.id !== playerId) return null;
  const toCall = state.currentBet - seat.streetBet;
  const maxTo = seat.streetBet + seat.stack;
  const minFull = state.currentBet === 0 ? state.minRaise : state.currentBet + state.minRaise;
  let raise: RaiseWindow | null = null;
  if (seat.canRaise && seat.stack > toCall) {
    if (maxTo >= minFull) raise = { minTo: Math.max(minFull, seat.streetBet + 1), maxTo, short: false };
    else raise = { minTo: maxTo, maxTo, short: true };
  }
  return {
    fold: toCall > 0,
    check: toCall <= 0,
    call: toCall > 0 ? Math.min(toCall, seat.stack) : null,
    raise,
  };
}

export function hiddenHoldemCards(state: HoldemState, playerId: string): Card[] {
  const hidden: Card[] = [...state.deck];
  const reveal = state.phase !== "betting";
  for (const seat of state.players) {
    if (!seat.hole || seat.id === playerId) continue;
    const shown = reveal && state.result?.revealed.some((item) => item.playerId === seat.id);
    if (!shown) hidden.push(seat.hole[0]!, seat.hole[1]!);
  }
  return hidden;
}

export function projectHoldem(state: HoldemState, playerId: string): HoldemView {
  const me = state.players.find((seat) => seat.id === playerId);
  if (!me) throw new Error("Joueur introuvable.");
  const sbIndex =
    state.players.filter((seat) => !seat.out).length === 2
      ? state.button
      : nextIndex(state, state.button, (seat) => !seat.out);
  const bbIndex = nextIndex(state, sbIndex, (seat) => !seat.out);
  const revealed = new Set(state.phase === "betting" ? [] : (state.result?.revealed.map((item) => item.playerId) ?? []));
  return {
    kind: "texas-holdem",
    phase: state.phase,
    street: state.street,
    board: state.board.map((card) => ({ ...card })),
    pot: state.players.reduce((sum, seat) => sum + seat.committed, 0),
    currentBet: state.currentBet,
    handNo: state.handNo,
    sb: state.sb,
    bb: state.bb,
    toActId: state.toAct === null ? null : (state.players[state.toAct]?.id ?? null),
    you: {
      id: me.id,
      hole: me.hole ? [{ ...me.hole[0]! }, { ...me.hole[1]! }] : null,
      stack: me.stack,
      streetBet: me.streetBet,
      toCall: Math.max(0, state.currentBet - me.streetBet),
      folded: me.folded,
      allIn: me.allIn,
      legal: legalPoker(state, playerId),
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
      hole:
        seat.id === playerId
          ? seat.hole
            ? [{ ...seat.hole[0]! }, { ...seat.hole[1]! }]
            : null
          : revealed.has(seat.id) && seat.hole
            ? [{ ...seat.hole[0]! }, { ...seat.hole[1]! }]
            : null,
      isButton: index === state.button,
      isTurn: index === state.toAct,
      isSmallBlind: index === sbIndex && state.street === "preflop" && state.phase === "betting",
      isBigBlind: index === bbIndex && state.street === "preflop" && state.phase === "betting",
    })),
    result: state.result
      ? {
          ...state.result,
          revealed: state.result.revealed.map((item) => ({
            ...item,
            hole: [{ ...item.hole[0] }, { ...item.hole[1] }],
            five: item.five.map((card) => ({ ...card })),
          })),
        }
      : null,
    log: [...state.log],
  };
}

export function actorId(state: HoldemState): string | null {
  if (state.toAct === null) return null;
  return state.players[state.toAct]?.id ?? null;
}

export function findCard(cards: readonly Card[], card: Card): boolean {
  return cards.some((candidate) => sameCard(candidate, card));
}

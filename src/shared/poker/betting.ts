import { compareScores } from "./evaluate";
import { formatDollars, MAX_REBUYS } from "./holdem";

/**
 * Enchères no-limit ou pot-limit, dollars fictifs en centimes.
 * Les blinds restent celles de la table. Une relance incomplète ne rouvre pas.
 */

export type BetSeat = {
  id: string;
  nickname: string;
  stack: number;
  streetBet: number;
  committed: number;
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  canRaise: boolean;
  out: boolean;
  isBot: boolean;
  rebuys: number;
};

export type BetTable = {
  players: BetSeat[];
  button: number;
  sb: number;
  bb: number;
  startingStack: number;
  currentBet: number;
  minRaise: number;
  toAct: number | null;
  potLimit: boolean;
  log: string[];
};

export type BetAction = { type: "fold" } | { type: "check" } | { type: "call" } | { type: "bet"; amount: number };

export type RaiseWindow = { minTo: number; maxTo: number; short: boolean };

export function pushLog(table: { log: string[] }, line: string) {
  table.log.push(line);
  if (table.log.length > 48) table.log.shift();
}

export function nextSeat(table: BetTable, index: number, pred: (seat: BetSeat) => boolean): number {
  for (let step = 1; step <= table.players.length; step += 1) {
    const i = (index + step) % table.players.length;
    if (pred(table.players[i]!)) return i;
  }
  return -1;
}

export function potOf(table: BetTable): number {
  return table.players.reduce((sum, seat) => sum + seat.committed, 0);
}

function needsAction(seat: BetSeat, currentBet: number): boolean {
  if (seat.out || seat.folded || seat.allIn) return false;
  return seat.streetBet < currentBet || !seat.acted;
}

export function freshSeats(seats: { id: string; nickname: string; isBot?: boolean; stack?: number }[], startingStack: number): BetSeat[] {
  return seats.map((seat) => ({
    id: seat.id,
    nickname: seat.nickname,
    stack: seat.stack ?? startingStack,
    streetBet: 0,
    committed: 0,
    folded: false,
    allIn: false,
    acted: false,
    canRaise: true,
    out: false,
    isBot: Boolean(seat.isBot),
    rebuys: 0,
  }));
}

export function resetStreet(table: BetTable) {
  for (const seat of table.players) {
    seat.streetBet = 0;
    seat.acted = false;
    seat.canRaise = true;
  }
  table.currentBet = 0;
  table.minRaise = table.bb;
}

export function postChip(table: BetTable, index: number, amount: number, label: string) {
  const seat = table.players[index]!;
  const pay = Math.min(amount, seat.stack);
  seat.stack -= pay;
  seat.streetBet += pay;
  seat.committed += pay;
  if (seat.stack === 0) seat.allIn = true;
  pushLog(table, `${seat.nickname} pose ${formatDollars(pay)} (${label}).`);
  return pay;
}

function potMaxTo(table: BetTable, seat: BetSeat): number {
  const toCall = Math.max(0, table.currentBet - seat.streetBet);
  const allInTo = seat.streetBet + seat.stack;
  if (!table.potLimit) return allInTo;
  const maxTo = seat.streetBet + table.players.reduce((sum, item) => sum + item.committed, 0) + 2 * toCall;
  return Math.min(allInTo, maxTo);
}

export function legalBet(table: BetTable, playerId: string): { fold: boolean; check: boolean; call: number | null; raise: RaiseWindow | null } | null {
  if (table.toAct === null) return null;
  const seat = table.players[table.toAct];
  if (!seat || seat.id !== playerId) return null;
  const toCall = table.currentBet - seat.streetBet;
  const maxTo = potMaxTo(table, seat);
  const minFull = table.currentBet === 0 ? table.minRaise : table.currentBet + table.minRaise;
  let raise: RaiseWindow | null = null;
  if (seat.canRaise && seat.stack > toCall && maxTo > table.currentBet) {
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

export function applyBet(table: BetTable, playerId: string, action: BetAction): "acting" | "round" | "folded" {
  if (table.toAct === null) throw new Error("Aucune mise n'est attendue.");
  const index = table.players.findIndex((seat) => seat.id === playerId);
  if (index !== table.toAct) throw new Error("Ce n'est pas votre tour.");
  const seat = table.players[index]!;
  const toCall = table.currentBet - seat.streetBet;
  if (action.type === "fold") {
    if (toCall <= 0) throw new Error("Vous pouvez dire parole : il n'y a rien à suivre.");
    seat.folded = true;
    seat.acted = true;
    pushLog(table, `${seat.nickname} se couche.`);
  } else if (action.type === "check") {
    if (toCall > 0) throw new Error("Vous ne pouvez pas dire parole : une mise est à suivre.");
    seat.acted = true;
    pushLog(table, `${seat.nickname} dit parole.`);
  } else if (action.type === "call") {
    if (toCall <= 0) throw new Error("Il n'y a rien à suivre.");
    const pay = Math.min(toCall, seat.stack);
    seat.stack -= pay;
    seat.streetBet += pay;
    seat.committed += pay;
    if (seat.stack === 0) seat.allIn = true;
    seat.acted = true;
    pushLog(table, seat.allIn ? `${seat.nickname} fait tapis en suivant.` : `${seat.nickname} suit ${formatDollars(table.currentBet)}.`);
  } else if (action.type === "bet") {
    place(table, seat, action.amount);
  } else {
    throw new Error("Action inconnue.");
  }
  const alive = table.players.filter((candidate) => !candidate.out && !candidate.folded);
  if (alive.length === 1) return "folded";
  const following = nextSeat(table, index, (candidate) => needsAction(candidate, table.currentBet));
  if (following === -1) {
    table.toAct = null;
    return "round";
  }
  table.toAct = following;
  return "acting";
}

function place(table: BetTable, seat: BetSeat, target: number) {
  if (!Number.isInteger(target)) throw new Error("Le montant doit être un nombre entier de centimes.");
  const toCall = table.currentBet - seat.streetBet;
  if (!seat.canRaise) throw new Error("Vous pouvez suivre, mais pas relancer.");
  if (target <= table.currentBet) throw new Error("Pour suivre, utilisez le bouton Suivre.");
  const paying = target - seat.streetBet;
  if (paying <= 0 || paying > seat.stack) throw new Error("Montant de mise impossible.");
  if (seat.stack <= toCall) throw new Error("Vous ne pouvez pas relancer : il ne reste que l'appel.");
  const ceiling = potMaxTo(table, seat);
  if (target > ceiling) {
    throw new Error(table.potLimit ? `Pot-limit : la relance maximale porte le total à ${formatDollars(ceiling)}.` : "Montant de mise impossible.");
  }
  const increase = target - table.currentBet;
  const allIn = paying === seat.stack;
  const full = increase >= table.minRaise;
  if (!full && !allIn) {
    const minimum = table.currentBet === 0 ? table.minRaise : table.currentBet + table.minRaise;
    throw new Error(`La relance minimale porte le total à ${formatDollars(minimum)}.`);
  }
  const previous = table.currentBet;
  seat.stack -= paying;
  seat.streetBet = target;
  seat.committed += paying;
  if (seat.stack === 0) seat.allIn = true;
  seat.acted = true;
  if (full) {
    table.minRaise = Math.max(increase, table.bb);
    table.currentBet = target;
    for (const other of table.players) {
      if (other.id === seat.id || other.folded || other.allIn || other.out) continue;
      other.acted = false;
      other.canRaise = true;
    }
    pushLog(table, previous === 0 ? `${seat.nickname} mise ${formatDollars(target)}.` : `${seat.nickname} relance à ${formatDollars(target)}.`);
  } else {
    table.currentBet = target;
    for (const other of table.players) {
      if (other.acted) other.canRaise = false;
    }
    pushLog(table, `${seat.nickname} fait tapis à ${formatDollars(target)}.`);
  }
}

export function openBetting(table: BetTable, anchor: number) {
  const contenders = table.players.filter((seat) => !seat.out && !seat.folded);
  if (contenders.length <= 1) {
    table.toAct = null;
    return "folded" as const;
  }
  const next = nextSeat(table, anchor, (seat) => needsAction(seat, table.currentBet));
  if (next === -1) {
    table.toAct = null;
    return "round" as const;
  }
  table.toAct = next;
  return "acting" as const;
}

export function prepareHand(table: BetTable) {
  const alive = table.players.filter((seat) => seat.stack > 0);
  if (alive.length < 2) return false;
  for (const seat of table.players) {
    seat.streetBet = 0;
    seat.committed = 0;
    seat.folded = seat.stack <= 0;
    seat.allIn = false;
    seat.acted = false;
    seat.canRaise = true;
    seat.out = seat.stack <= 0;
  }
  table.currentBet = 0;
  table.minRaise = table.bb;
  table.button = nextSeat(table, table.button, (seat) => !seat.out);
  return true;
}

export function autoRebuyBots(table: BetTable) {
  for (const seat of table.players) {
    if (seat.stack <= 0 && seat.isBot && seat.rebuys < MAX_REBUYS) {
      seat.rebuys += 1;
      seat.stack = table.startingStack;
      pushLog(table, `${seat.nickname} recave ${formatDollars(table.startingStack)} (${seat.rebuys}/${MAX_REBUYS}).`);
    }
  }
}

export function rebuySeat(table: BetTable, playerId: string) {
  const seat = table.players.find((candidate) => candidate.id === playerId);
  if (!seat) throw new Error("Joueur introuvable.");
  if (seat.stack > 0) throw new Error("Il vous reste des dollars fictifs.");
  if (seat.rebuys >= MAX_REBUYS) throw new Error("Trois recaves déjà prises. Vous êtes éliminé.");
  seat.rebuys += 1;
  seat.stack = table.startingStack;
  seat.out = false;
  pushLog(table, `${seat.nickname} recave ${formatDollars(table.startingStack)} (${seat.rebuys}/${MAX_REBUYS}). Dollars fictifs.`);
}

export function splitPots(
  table: BetTable,
  scoreOf: (seat: BetSeat) => number[] | null,
  rankOf: (score: number[]) => string,
): { summary: string; revealed: { playerId: string; rank: string }[]; awards: { playerId: string; amount: number }[] } {
  const contenders = table.players.filter((seat) => !seat.out && !seat.folded && scoreOf(seat));
  const scored = contenders.map((seat) => ({ seat, score: scoreOf(seat)! }));
  const levels = [...new Set(table.players.map((seat) => seat.committed).filter((value) => value > 0))].sort((a, b) => a - b);
  const gained = new Map<string, number>();
  const phrases: string[] = [];
  const revealed = scored.map((entry) => ({ playerId: entry.seat.id, rank: rankOf(entry.score) }));
  let previous = 0;
  for (const level of levels) {
    let pot = 0;
    const eligible = [];
    for (const seat of table.players) pot += Math.min(seat.committed, level) - Math.min(seat.committed, previous);
    for (const entry of scored) if (entry.seat.committed >= level) eligible.push(entry);
    if (pot <= 0 || eligible.length === 0) {
      previous = level;
      continue;
    }
    let winners = [eligible[0]!];
    for (const entry of eligible.slice(1)) {
      const diff = compareScores(entry.score, winners[0]!.score);
      if (diff > 0) winners = [entry];
      else if (diff === 0) winners.push(entry);
    }
    winners.sort((a, b) => distance(table, a.seat) - distance(table, b.seat));
    const share = Math.floor(pot / winners.length);
    let rest = pot % winners.length;
    const names: string[] = [];
    for (const winner of winners) {
      const amount = share + (rest > 0 ? 1 : 0);
      if (rest > 0) rest -= 1;
      winner.seat.stack += amount;
      gained.set(winner.seat.id, (gained.get(winner.seat.id) ?? 0) + amount);
      names.push(winner.seat.nickname);
    }
    phrases.push(`${names.join(" et ")} remporte ${formatDollars(pot)} (${rankOf(winners[0]!.score)})`);
    previous = level;
  }
  return {
    summary: phrases.join(". ") + ".",
    revealed,
    awards: [...gained.entries()].map(([playerId, amount]) => ({ playerId, amount })),
  };
}

function distance(table: BetTable, seat: BetSeat): number {
  const index = table.players.findIndex((candidate) => candidate.id === seat.id);
  return (index - table.button - 1 + table.players.length) % table.players.length;
}

export function awardFold(table: BetTable, winner: BetSeat): { summary: string; amount: number } {
  const pot = potOf(table);
  winner.stack += pot;
  const summary = `${winner.nickname} remporte ${formatDollars(pot)}. Les cartes restent cachées.`;
  pushLog(table, summary);
  return { summary, amount: pot };
}

export function matchStatus(table: BetTable): "play" | "rebuy" | "over" {
  const alive = table.players.filter((seat) => seat.stack > 0);
  const pending = table.players.filter((seat) => seat.stack <= 0 && seat.rebuys < MAX_REBUYS);
  if (alive.length >= 2) return "play";
  if (alive.length + pending.length >= 2) return "rebuy";
  return "over";
}

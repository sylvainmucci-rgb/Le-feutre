import { pokerDeck, type Card } from "../cards";
import { shuffle, type Rng } from "../rng";

/**
 * Roulette européenne et blackjack, jetons fictifs.
 * Chaque joueur commence avec 100 jetons. Aucun achat, aucun retrait, aucun gain réel.
 * La roulette paie 1 pour 1 sur rouge ou noir, 35 pour 1 sur un numéro. Le zéro fait perdre les chances simples.
 * Le croupier du blackjack tire jusqu'à 17. Un blackjack naturel paie 3 pour 2.
 */

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type RouletteAction =
  | { type: "bet"; target: "red" | "black" | "number"; number?: number; amount: number }
  | { type: "spin" };

type RouletteSeat = {
  id: string;
  nickname: string;
  isBot: boolean;
  chips: number;
  bet: { target: "red" | "black" | "number"; number?: number; amount: number } | null;
};

export type RouletteState = {
  kind: "roulette";
  phase: "bet" | "result";
  players: RouletteSeat[];
  last: number | null;
  result: { summary: string } | null;
  log: string[];
};

function pushR(state: RouletteState, line: string) {
  state.log.push(line);
  if (state.log.length > 30) state.log.shift();
}

export function createRoulette(seats: { id: string; nickname: string; isBot?: boolean }[]): RouletteState {
  if (seats.length < 1 || seats.length > 6) throw new Error("La roulette accueille de 1 à 6 joueurs.");
  return {
    kind: "roulette",
    phase: "bet",
    players: seats.map((seat) => ({ id: seat.id, nickname: seat.nickname, isBot: Boolean(seat.isBot), chips: 100, bet: null })),
    last: null,
    result: null,
    log: ["Roulette européenne. 100 jetons fictifs. Rien ne s'achète."],
  };
}

export function spinNumber(rng: Rng): number {
  return Math.floor(rng() * 37);
}

export function colorOf(n: number): "green" | "red" | "black" {
  if (n === 0) return "green";
  return RED.has(n) ? "red" : "black";
}

export function applyRoulette(state: RouletteState, playerId: string, action: RouletteAction, rng: Rng): RouletteState {
  const next = structuredClone(state);
  const seat = next.players.find((player) => player.id === playerId);
  if (!seat) throw new Error("Joueur introuvable.");
  if (action.type === "bet") {
    if (next.phase !== "bet") throw new Error("La bille est déjà lancée.");
    if (!Number.isInteger(action.amount) || action.amount < 1 || action.amount > seat.chips) {
      throw new Error("Mise fictive impossible.");
    }
    if (action.target === "number" && (action.number === undefined || action.number < 0 || action.number > 36)) {
      throw new Error("Numéro de 0 à 36.");
    }
    seat.bet = { target: action.target, number: action.number, amount: action.amount };
    pushR(next, `${seat.nickname} mise ${action.amount} jetons fictifs.`);
    return next;
  }
  if (next.phase !== "bet") throw new Error("Relancez une partie pour rejouer.");
  const n = spinNumber(rng);
  next.last = n;
  const color = colorOf(n);
  const notes: string[] = [`${n} ${color === "green" ? "vert" : color === "red" ? "rouge" : "noir"}.`];
  for (const player of next.players) {
    if (!player.bet) continue;
    const bet = player.bet;
    let win = 0;
    if (bet.target === "number" && bet.number === n) win = bet.amount * 35;
    if (bet.target === "red" && color === "red") win = bet.amount;
    if (bet.target === "black" && color === "black") win = bet.amount;
    if (win > 0) {
      player.chips += win;
      notes.push(`${player.nickname} reçoit ${win} jetons fictifs.`);
    } else {
      player.chips -= bet.amount;
      notes.push(`${player.nickname} perd ${bet.amount} jetons fictifs.`);
    }
    player.bet = null;
  }
  next.phase = "result";
  next.result = { summary: notes.join(" ") + " Aucune valeur réelle." };
  pushR(next, next.result.summary);
  return next;
}

export function continueRoulette(state: RouletteState): RouletteState {
  const next = structuredClone(state);
  next.phase = "bet";
  next.result = null;
  next.last = null;
  for (const seat of next.players) {
    if (seat.chips < 1) seat.chips = 100;
    seat.bet = null;
  }
  pushR(next, "Nouvelle bille. Les tapis vides repartent à 100 jetons fictifs.");
  return next;
}

export function projectRoulette(state: RouletteState, playerId: string) {
  const me = state.players.find((seat) => seat.id === playerId);
  return {
    kind: "roulette" as const,
    phase: state.phase,
    last: state.last,
    color: state.last === null ? null : colorOf(state.last),
    you: me ? { id: me.id, chips: me.chips, bet: me.bet } : null,
    seats: state.players.map((seat) => ({ id: seat.id, nickname: seat.nickname, chips: seat.chips })),
    prompts:
      state.phase === "bet"
        ? [
            { label: "10 sur rouge", action: { type: "bet", target: "red", amount: 10 } },
            { label: "10 sur noir", action: { type: "bet", target: "black", amount: 10 } },
            { label: "1 sur le 17", action: { type: "bet", target: "number", number: 17, amount: 1 } },
            { label: "Lancer la bille", action: { type: "spin" } },
          ]
        : [],
    result: state.result,
    log: [...state.log],
  };
}

export function chooseRoulette(view: ReturnType<typeof projectRoulette>): RouletteAction {
  if (view.phase === "result") return { type: "spin" };
  if (!view.you?.bet && (view.you?.chips ?? 0) >= 10) return { type: "bet", target: "red", amount: 10 };
  return { type: "spin" };
}

function value(card: Card): number {
  if (card.r === 14) return 11;
  if (card.r >= 10) return 10;
  return card.r;
}

export function handTotal(cards: readonly Card[]): number {
  let total = cards.reduce((sum, card) => sum + value(card), 0);
  let aces = cards.filter((card) => card.r === 14).length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

export type BlackjackAction = { type: "bet"; amount: number } | { type: "hit" } | { type: "stand" };

type BjSeat = { id: string; nickname: string; isBot: boolean; chips: number; hand: Card[]; bet: number; done: boolean };

export type BlackjackState = {
  kind: "blackjack";
  phase: "bet" | "play" | "result";
  players: BjSeat[];
  dealer: Card[];
  deck: Card[];
  turn: number;
  result: { summary: string } | null;
  log: string[];
};

export function createBlackjack(seats: { id: string; nickname: string; isBot?: boolean }[], rng: Rng): BlackjackState {
  if (seats.length < 1 || seats.length > 5) throw new Error("Le blackjack se joue de 1 à 5 contre le croupier.");
  return {
    kind: "blackjack",
    phase: "bet",
    players: seats.map((seat) => ({ id: seat.id, nickname: seat.nickname, isBot: Boolean(seat.isBot), chips: 100, hand: [], bet: 0, done: false })),
    dealer: [],
    deck: shuffle(pokerDeck(), rng),
    turn: 0,
    result: null,
    log: ["Blackjack. 100 jetons fictifs. Le croupier tire à 16 et s'arrête à 17."],
  };
}

function take(state: BlackjackState): Card {
  const card = state.deck.shift();
  if (!card) {
    state.deck = shuffle(pokerDeck(), () => Math.random());
    return state.deck.shift()!;
  }
  return card;
}

export function applyBlackjack(state: BlackjackState, playerId: string, action: BlackjackAction): BlackjackState {
  const next = structuredClone(state);
  const index = next.players.findIndex((seat) => seat.id === playerId);
  if (index < 0) throw new Error("Joueur introuvable.");
  const seat = next.players[index]!;
  if (next.phase === "bet") {
    if (action.type !== "bet") throw new Error("Posez une mise fictive.");
    if (!Number.isInteger(action.amount) || action.amount < 1 || action.amount > seat.chips) throw new Error("Mise fictive impossible.");
    seat.bet = action.amount;
    seat.chips -= action.amount;
    if (next.players.every((player) => player.bet > 0)) {
      for (const player of next.players) {
        player.hand = [take(next), take(next)];
        player.done = handTotal(player.hand) === 21;
      }
      next.dealer = [take(next), take(next)];
      next.phase = "play";
      next.turn = next.players.findIndex((player) => !player.done);
      if (next.turn < 0) return finishBlackjack(next);
    }
    return next;
  }
  if (next.phase !== "play" || index !== next.turn) throw new Error("Ce n'est pas votre tour.");
  if (action.type === "hit") {
    seat.hand.push(take(next));
    if (handTotal(seat.hand) >= 21) seat.done = true;
  } else if (action.type === "stand") seat.done = true;
  else throw new Error("Action impossible.");
  if (seat.done) next.turn = next.players.findIndex((player, at) => at > index && !player.done);
  if (next.turn < 0 || next.players.every((player) => player.done)) return finishBlackjack(next);
  return next;
}

function finishBlackjack(state: BlackjackState): BlackjackState {
  const live = state.players.some((seat) => handTotal(seat.hand) <= 21);
  if (live) {
    while (handTotal(state.dealer) < 17) state.dealer.push(take(state));
  }
  const dealer = handTotal(state.dealer);
  const notes: string[] = [];
  for (const seat of state.players) {
    const total = handTotal(seat.hand);
    const natural = seat.hand.length === 2 && total === 21;
    let win = 0;
    if (total > 21) notes.push(`${seat.nickname} brûle.`);
    else if (dealer > 21 || total > dealer) {
      win = natural ? Math.floor(seat.bet * 2.5) : seat.bet * 2;
      notes.push(`${seat.nickname} gagne ${win - seat.bet} jetons fictifs.`);
    } else if (total === dealer && !natural) {
      win = seat.bet;
      notes.push(`${seat.nickname} est à égalité.`);
    } else notes.push(`${seat.nickname} perd la mise.`);
    seat.chips += win;
    seat.bet = 0;
  }
  state.phase = "result";
  state.turn = -1;
  state.result = { summary: notes.join(" ") + " Aucune valeur réelle." };
  state.log.push(state.result.summary);
  return state;
}

export function continueBlackjack(state: BlackjackState, rng: Rng): BlackjackState {
  const next = createBlackjack(
    state.players.map((seat) => ({ id: seat.id, nickname: seat.nickname, isBot: seat.isBot })),
    rng,
  );
  next.players.forEach((seat, index) => {
    const previous = state.players[index]!.chips;
    seat.chips = previous > 0 ? previous : 100;
  });
  return next;
}

export function actorBlackjack(state: BlackjackState): string | null {
  if (state.phase !== "play" || state.turn < 0) return null;
  return state.players[state.turn]?.id ?? null;
}

export function hiddenBlackjack(state: BlackjackState, playerId: string): Card[] {
  const hidden = [...state.deck];
  if (state.phase === "play" && state.dealer[1]) hidden.push(state.dealer[1]);
  for (const seat of state.players) if (seat.id !== playerId) hidden.push(...seat.hand);
  return hidden;
}

export function projectBlackjack(state: BlackjackState, playerId: string) {
  const me = state.players.findIndex((seat) => seat.id === playerId);
  const hideHole = state.phase === "play";
  return {
    kind: "blackjack" as const,
    phase: state.phase,
    dealer: (hideHole ? state.dealer.slice(0, 1) : state.dealer).map((card) => ({ ...card })),
    dealerHidden: hideHole && state.dealer.length > 1,
    dealerTotal: hideHole ? null : handTotal(state.dealer),
    you: me < 0 ? null : { id: state.players[me]!.id, chips: state.players[me]!.chips, hand: state.players[me]!.hand.map((card) => ({ ...card })), total: handTotal(state.players[me]!.hand) },
    seats: state.players.map((seat, index) => ({
      id: seat.id,
      nickname: seat.nickname,
      chips: seat.chips,
      total: seat.id === playerId || state.phase === "result" ? handTotal(seat.hand) : null,
      isTurn: index === state.turn,
    })),
    prompts:
      state.phase === "bet"
        ? [{ label: "Miser 10 jetons fictifs", action: { type: "bet", amount: 10 } }]
        : state.phase === "play" && state.players[state.turn]?.id === playerId
          ? [
              { label: "Carte", action: { type: "hit" } },
              { label: "Rester", action: { type: "stand" } },
            ]
          : [],
    result: state.result,
    log: [...state.log],
  };
}

export function chooseBlackjack(view: ReturnType<typeof projectBlackjack>): BlackjackAction {
  if (view.phase === "bet") return { type: "bet", amount: 10 };
  if ((view.you?.total ?? 0) < 17) return { type: "hit" };
  return { type: "stand" };
}

import { beloteDeck, cardFr, sameCard, suitFr, type Card, type Suit } from "../cards";
import { shuffle, type Rng } from "../rng";

/**
 * Écarté, règle traditionnelle française à deux joueurs.
 * 32 cartes. L'ordre est roi, dame, valet, as, 10, 9, 8, 7.
 * Cinq cartes chacun. La onzième est retournée : elle indique l'atout.
 * Si c'est un roi, le donneur marque 1.
 * Le non-donneur peut proposer d'échanger (« cartes ») ou jouer.
 * S'il échange, il défausse autant de cartes qu'il en redemande, puis le donneur peut en faire autant.
 * On doit fournir. On n'est pas obligé de couper. Le pli va au plus fort atout, sinon à la plus forte carte de la couleur demandée.
 * Majorité des plis : 1 point. Les cinq plis (vole) : 2. Partie en 5.
 */

const ORDER = [13, 12, 11, 14, 10, 9, 8, 7];

export type EcarteAction = { type: "play" } | { type: "cards" } | { type: "discard"; cards: Card[] } | { type: "keep" } | { type: "play-card"; card: Card };

type Seat = { id: string; nickname: string; hand: Card[]; isBot: boolean; tricks: number };

export type EcarteState = {
  kind: "ecarte";
  players: Seat[];
  dealer: number;
  elder: number;
  turn: number;
  phase: "proposal" | "elder-discard" | "dealer-discard" | "play" | "scoring" | "match-over";
  trump: Suit | null;
  faceUp: Card | null;
  deck: Card[];
  trick: { seat: number; card: Card }[];
  scores: [number, number];
  dealNo: number;
  result: { summary: string } | null;
  log: string[];
};

function rank(card: Card): number {
  return ORDER.indexOf(card.r);
}

function push(state: EcarteState, line: string) {
  state.log.push(line);
  if (state.log.length > 40) state.log.shift();
}

export function createEcarte(seats: { id: string; nickname: string; isBot?: boolean }[], rng: Rng): EcarteState {
  if (seats.length !== 2) throw new Error("L'écarté se joue à deux.");
  const state: EcarteState = {
    kind: "ecarte",
    players: seats.map((seat) => ({ id: seat.id, nickname: seat.nickname, hand: [], isBot: Boolean(seat.isBot), tricks: 0 })),
    dealer: 1,
    elder: 0,
    turn: 0,
    phase: "proposal",
    trump: null,
    faceUp: null,
    deck: [],
    trick: [],
    scores: [0, 0],
    dealNo: 0,
    result: null,
    log: [],
  };
  return dealEcarte(state, rng);
}

export function dealEcarte(state: EcarteState, rng: Rng): EcarteState {
  const next = structuredClone(state);
  next.dealer = next.dealer === 0 ? 1 : 0;
  next.elder = next.dealer === 0 ? 1 : 0;
  next.turn = next.elder;
  next.phase = "proposal";
  next.trick = [];
  next.result = null;
  next.dealNo += 1;
  for (const seat of next.players) {
    seat.hand = [];
    seat.tricks = 0;
  }
  const deck = shuffle(beloteDeck(), rng);
  for (let i = 0; i < 3; i += 1) {
    next.players[next.elder]!.hand.push(deck.shift()!);
    next.players[next.dealer]!.hand.push(deck.shift()!);
  }
  for (let i = 0; i < 2; i += 1) {
    next.players[next.elder]!.hand.push(deck.shift()!);
    next.players[next.dealer]!.hand.push(deck.shift()!);
  }
  const face = deck.shift()!;
  next.faceUp = face;
  if (face.s === "t" || face.s === "x") throw new Error("Couleur attendue.");
  next.trump = face.s;
  next.deck = deck;
  push(next, `Donne ${next.dealNo}. Atout ${suitFr(face.s)}, retourné : ${cardFr(face)}.`);
  if (face.r === 13) {
    next.scores[next.dealer] += 1;
    push(next, `${next.players[next.dealer]!.nickname} marque 1 pour le roi retourné.`);
    if (next.scores[next.dealer] >= 5) {
      next.phase = "match-over";
      next.result = { summary: `${next.players[next.dealer]!.nickname} gagne la partie.` };
    }
  }
  return next;
}

function drawTo(state: EcarteState, seat: number, count: number) {
  for (let i = 0; i < count; i += 1) {
    const card = state.deck.shift();
    if (!card) throw new Error("Plus de cartes à échanger.");
    state.players[seat]!.hand.push(card);
  }
}

export function legalEcarte(hand: readonly Card[], trick: { card: Card }[]): Card[] {
  if (trick.length === 0) return [...hand];
  const led = trick[0]!.card.s;
  const follow = hand.filter((card) => card.s === led);
  return follow.length > 0 ? follow : [...hand];
}

export function applyEcarte(state: EcarteState, playerId: string, action: EcarteAction): EcarteState {
  const next = structuredClone(state);
  const seat = next.players.findIndex((player) => player.id === playerId);
  if (seat !== next.turn) throw new Error("Ce n'est pas votre tour.");
  if (next.phase === "proposal") {
    if (action.type === "play") {
      next.phase = "play";
      next.turn = next.elder;
      push(next, `${next.players[seat]!.nickname} joue sans échanger.`);
      return next;
    }
    if (action.type === "cards") {
      next.phase = "elder-discard";
      push(next, `${next.players[seat]!.nickname} propose d'échanger.`);
      return next;
    }
    throw new Error("Dites cartes ou jouez.");
  }
  if (next.phase === "elder-discard" || next.phase === "dealer-discard") {
    if (action.type === "keep" && next.phase === "dealer-discard") {
      next.phase = "play";
      next.turn = next.elder;
      return next;
    }
    if (action.type !== "discard") throw new Error("Défaussez les cartes à échanger.");
    const hand = next.players[seat]!.hand;
    if (action.cards.length < 1 || action.cards.length > hand.length) throw new Error("Échange impossible.");
    for (const card of action.cards) {
      const at = hand.findIndex((candidate) => sameCard(candidate, card));
      if (at < 0) throw new Error("Cette carte n'est pas dans votre main.");
      hand.splice(at, 1);
    }
    drawTo(next, seat, action.cards.length);
    push(next, `${next.players[seat]!.nickname} échange ${action.cards.length} carte${action.cards.length > 1 ? "s" : ""}.`);
    if (next.phase === "elder-discard") {
      next.phase = "dealer-discard";
      next.turn = next.dealer;
    } else {
      next.phase = "play";
      next.turn = next.elder;
    }
    return next;
  }
  if (next.phase === "play" && action.type === "play-card") return trick(next, seat, action.card);
  throw new Error("Action impossible maintenant.");
}

function trick(state: EcarteState, seat: number, card: Card): EcarteState {
  const hand = state.players[seat]!.hand;
  const legal = legalEcarte(hand, state.trick);
  if (!legal.some((candidate) => sameCard(candidate, card))) throw new Error("Cette carte n'est pas jouable.");
  hand.splice(hand.findIndex((candidate) => sameCard(candidate, card)), 1);
  state.trick.push({ seat, card });
  push(state, `${state.players[seat]!.nickname} joue ${cardFr(card)}.`);
  if (state.trick.length < 2) {
    state.turn = seat === 0 ? 1 : 0;
    return state;
  }
  const trump = state.trump!;
  const [first, second] = state.trick;
  let win = first!.seat;
  if (second!.card.s === trump && first!.card.s !== trump) win = second!.seat;
  else if (second!.card.s === first!.card.s && rank(second!.card) < rank(first!.card)) win = second!.seat;
  else if (first!.card.s === trump && second!.card.s === trump && rank(second!.card) < rank(first!.card)) win = second!.seat;
  state.players[win]!.tricks += 1;
  state.trick = [];
  state.turn = win;
  if (state.players.some((player) => player.hand.length > 0)) return state;
  const elderTricks = state.players[state.elder]!.tricks;
  const dealerTricks = state.players[state.dealer]!.tricks;
  let marker = state.elder;
  let points = 1;
  if (dealerTricks > elderTricks) marker = state.dealer;
  if (elderTricks === 5 || dealerTricks === 5) points = 2;
  state.scores[marker as 0 | 1] += points;
  const summary = `${state.players[marker]!.nickname} marque ${points} (${elderTricks}–${dealerTricks}).`;
  state.result = { summary };
  state.phase = state.scores[0] >= 5 || state.scores[1] >= 5 ? "match-over" : "scoring";
  push(state, summary);
  return state;
}

export function continueEcarte(state: EcarteState, rng: Rng): EcarteState {
  if (state.phase !== "scoring" && state.phase !== "match-over") throw new Error("La donne n'est pas finie.");
  if (state.phase === "match-over") {
    const fresh = structuredClone(state);
    fresh.scores = [0, 0];
    fresh.dealNo = 0;
    fresh.log = ["Nouvel écarté."];
    fresh.phase = "scoring";
    return dealEcarte(fresh, rng);
  }
  return dealEcarte(state, rng);
}

export function actorEcarte(state: EcarteState): string | null {
  if (state.phase === "scoring" || state.phase === "match-over") return null;
  return state.players[state.turn]?.id ?? null;
}

export function hiddenEcarte(state: EcarteState, playerId: string): Card[] {
  return [...state.deck, ...state.players.filter((seat) => seat.id !== playerId).flatMap((seat) => seat.hand)];
}

export function projectEcarte(state: EcarteState, playerId: string) {
  const me = state.players.findIndex((seat) => seat.id === playerId);
  if (me < 0) throw new Error("Joueur introuvable.");
  const hand = state.players[me]!.hand;
  const prompts: { label: string; action: EcarteAction }[] = [];
  if (state.turn === me && state.phase === "proposal") {
    prompts.push({ label: "Je joue", action: { type: "play" } }, { label: "Cartes", action: { type: "cards" } });
  }
  if (state.turn === me && state.phase === "dealer-discard") prompts.push({ label: "Je garde", action: { type: "keep" } });
  return {
    kind: "ecarte" as const,
    phase: state.phase,
    trumpLabel: state.trump ? `Atout ${suitFr(state.trump)}` : "Écarté",
    scores: `${state.scores[0]} – ${state.scores[1]}`,
    trick: state.trick.map((play) => ({ seat: play.seat, card: { ...play.card } })),
    faceUp: state.faceUp ? { ...state.faceUp } : null,
    you: { seat: me, hand: hand.map((card) => ({ ...card })) },
    seats: state.players.map((seat, index) => ({
      id: seat.id,
      nickname: seat.nickname,
      seat: index,
      cards: seat.hand.length,
      isTurn: index === state.turn && state.phase !== "scoring" && state.phase !== "match-over",
      tags: index === state.dealer ? "donneur" : "premier en cartes",
    })),
    legalCards: state.phase === "play" && state.turn === me ? legalEcarte(hand, state.trick) : state.phase.endsWith("discard") && state.turn === me ? hand : [],
    prompts,
    discard: state.phase === "elder-discard" || state.phase === "dealer-discard",
    result: state.result,
    log: [...state.log],
  };
}

export function chooseEcarte(view: ReturnType<typeof projectEcarte>): EcarteAction {
  if (view.phase === "proposal") {
    const kings = view.you.hand.filter((card) => card.r === 13).length;
    return kings >= 1 ? { type: "play" } : { type: "cards" };
  }
  if (view.discard) {
    const weak = view.you.hand.filter((card) => card.s !== view.faceUp?.s && card.r !== 13);
    if (weak.length === 0 && view.phase === "dealer-discard") return { type: "keep" };
    return { type: "discard", cards: weak.slice(0, 3) };
  }
  const card = view.legalCards[0];
  if (!card) return { type: "play" };
  return { type: "play-card", card };
}

import { cardKey, sameCard, SUITS, suitFr, type Card, type Suit } from "../cards";
import { shuffle, type Rng } from "../rng";

/**
 * Tarot français à 3, 4 ou 5 joueurs.
 * Jeu de 78 cartes : quatre couleurs de l'as (1) au roi (14), 21 atouts, l'excuse.
 * Donne : 3 joueurs 24 cartes et un chien de 6 ; 4 joueurs 18 et un chien de 6 ;
 * 5 joueurs 15 et un chien de 3. À cinq, le preneur appelle un roi.
 * Enchères : passe, prise, garde, garde sans, garde contre.
 * Prise et garde : le preneur voit le chien, l'intègre et écarte autant de cartes
 * (pas de roi, d'atout ni de bout si une autre carte peut partir).
 * Garde sans : le chien va au preneur sans être montré. Garde contre : il va à la défense.
 * On fournit, on coupe, on monte à l'atout. L'excuse se joue toujours, ne gagne pas le pli,
 * et revient à son détenteur sauf si elle est jouée au dernier pli perdu.
 * Bouts : excuse, 21, petit. Seuils 56, 51, 41, 36. Multiples 1, 2, 4, 6.
 * Poignées et chelem ne sont pas comptés dans cette version.
 */

const BID_NAME = ["", "prise", "garde", "garde sans", "garde contre"] as const;
const MULTIPLE = [0, 1, 2, 4, 6];

export type TarotAction =
  | { type: "pass" }
  | { type: "bid"; level: 1 | 2 | 3 | 4 }
  | { type: "call"; suit: Suit }
  | { type: "discard"; cards: Card[] }
  | { type: "play"; card: Card };

type Seat = { id: string; nickname: string; hand: Card[]; isBot: boolean; score: number; aside: Card[] };

export type TarotState = {
  kind: "tarot";
  players: Seat[];
  dealer: number;
  turn: number;
  phase: "bid" | "call" | "discard" | "play" | "scoring" | "match-over";
  chien: Card[];
  bid: number;
  spoken: number;
  taker: number | null;
  called: Card | null;
  partner: number | null;
  trick: { seat: number; card: Card }[];
  won: Card[][];
  tricks: number;
  excuse: { player: number; card: Card } | null;
  dealNo: number;
  result: { summary: string } | null;
  log: string[];
};

export function tarotDeck(): Card[] {
  const deck: Card[] = [{ r: 0, s: "x" }];
  for (let rank = 1; rank <= 21; rank += 1) deck.push({ r: rank, s: "t" });
  for (const suit of SUITS) for (let rank = 1; rank <= 14; rank += 1) deck.push({ r: rank, s: suit });
  return deck;
}

export function isOudler(card: Card): boolean {
  return card.s === "x" || (card.s === "t" && (card.r === 1 || card.r === 21));
}

export function halfPoints(card: Card): number {
  if (isOudler(card)) return 9;
  if (card.s === "t") return 1;
  if (card.r === 14) return 9;
  if (card.r === 13) return 7;
  if (card.r === 12) return 5;
  if (card.r === 11) return 3;
  return 1;
}

function dealCount(players: number): { hand: number; dog: number } {
  if (players === 3) return { hand: 24, dog: 6 };
  if (players === 4) return { hand: 18, dog: 6 };
  if (players === 5) return { hand: 15, dog: 3 };
  throw new Error("Le tarot se joue de 3 à 5.");
}

function push(state: TarotState, line: string) {
  state.log.push(line);
  if (state.log.length > 50) state.log.shift();
}

export function createTarot(seats: { id: string; nickname: string; isBot?: boolean }[], rng: Rng): TarotState {
  if (seats.length < 3 || seats.length > 5) throw new Error("Le tarot se joue de 3 à 5.");
  const state: TarotState = {
    kind: "tarot",
    players: seats.map((seat) => ({ id: seat.id, nickname: seat.nickname, hand: [], isBot: Boolean(seat.isBot), score: 0, aside: [] })),
    dealer: seats.length - 1,
    turn: 0,
    phase: "bid",
    chien: [],
    bid: 0,
    spoken: 0,
    taker: null,
    called: null,
    partner: null,
    trick: [],
    won: seats.map(() => []),
    tricks: 0,
    excuse: null,
    dealNo: 0,
    result: null,
    log: [],
  };
  return dealTarot(state, rng);
}

export function dealTarot(state: TarotState, rng: Rng): TarotState {
  const next = structuredClone(state);
  const count = dealCount(next.players.length);
  next.dealer = (next.dealer + 1) % next.players.length;
  next.turn = (next.dealer + 1) % next.players.length;
  next.phase = "bid";
  next.bid = 0;
  next.spoken = 0;
  next.taker = null;
  next.called = null;
  next.partner = null;
  next.trick = [];
  next.won = next.players.map(() => []);
  next.tricks = 0;
  next.excuse = null;
  next.result = null;
  next.dealNo += 1;
  const deck = shuffle(tarotDeck(), rng);
  for (const seat of next.players) seat.hand = [];
  let cursor = 0;
  for (const seat of next.players) {
    seat.hand = deck.slice(cursor, cursor + count.hand);
    cursor += count.hand;
  }
  next.chien = deck.slice(cursor, cursor + count.dog);
  push(next, `Donne ${next.dealNo}. Tarot, ${next.players.length} joueurs.`);
  return next;
}

export function legalTarot(hand: readonly Card[], trick: readonly { card: Card }[]): Card[] {
  const opened = trick.map((play) => play.card).filter((card) => card.s !== "x");
  if (opened.length === 0) return [...hand];
  const led = opened[0]!.s;
  const excuse = hand.filter((card) => card.s === "x");
  const follow = hand.filter((card) => card.s === led);
  if (led === "t") {
    if (follow.length === 0) return [...hand];
    const highest = Math.max(...opened.filter((card) => card.s === "t").map((card) => card.r));
    const higher = follow.filter((card) => card.r > highest);
    return higher.length > 0 ? [...higher, ...excuse] : [...follow, ...excuse];
  }
  if (follow.length > 0) return [...follow, ...excuse];
  const trumps = hand.filter((card) => card.s === "t");
  if (trumps.length === 0) return [...hand];
  const highest = Math.max(0, ...opened.filter((card) => card.s === "t").map((card) => card.r));
  const higher = trumps.filter((card) => card.r > highest);
  return higher.length > 0 ? [...higher, ...excuse] : [...trumps, ...excuse];
}

function oudlersIn(cards: readonly Card[]): number {
  return cards.filter(isOudler).length;
}

export function threshold(oudlers: number): number {
  return [56, 51, 41, 36][oudlers] ?? 56;
}

function discardable(hand: readonly Card[], count: number): Card[][] {
  const plain = hand.filter((card) => card.s !== "t" && card.s !== "x" && card.r !== 14 && !isOudler(card));
  const pool = plain.length >= count ? plain : hand.filter((card) => !isOudler(card) && card.r !== 14);
  const source = pool.length >= count ? pool : [...hand];
  return combinations(source, count);
}

function combinations(cards: readonly Card[], count: number): Card[][] {
  if (count === 0) return [[]];
  const out: Card[][] = [];
  const walk = (start: number, acc: Card[]) => {
    if (acc.length === count) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < cards.length; i += 1) {
      acc.push(cards[i]!);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}

export function applyTarot(state: TarotState, playerId: string, action: TarotAction, rng: Rng): TarotState {
  const next = structuredClone(state);
  const seat = next.players.findIndex((player) => player.id === playerId);
  if (seat !== next.turn && next.phase !== "discard") throw new Error("Ce n'est pas votre tour.");
  if (next.phase === "discard" && seat !== next.taker) throw new Error("Seul le preneur écarte.");
  if (next.phase === "bid") return onBid(next, seat, action, rng);
  if (next.phase === "call" && action.type === "call") return onCall(next, action.suit);
  if (next.phase === "discard" && action.type === "discard") return onDiscard(next, action.cards);
  if (next.phase === "play" && action.type === "play") return onPlay(next, seat, action.card);
  throw new Error("Action impossible maintenant.");
}

function onBid(state: TarotState, seat: number, action: TarotAction, rng: Rng): TarotState {
  const name = state.players[seat]!.nickname;
  if (action.type === "pass") {
    push(state, `${name} passe.`);
  } else if (action.type === "bid") {
    if (action.level <= state.bid) throw new Error("Il faut annoncer plus fort.");
    state.bid = action.level;
    state.taker = seat;
    push(state, `${name} annonce ${BID_NAME[action.level]}.`);
  } else throw new Error("Annonce invalide.");
  state.spoken += 1;
  if (state.spoken < state.players.length) {
    state.turn = (seat + 1) % state.players.length;
    return state;
  }
  if (state.taker === null) return dealTarot(state, rng);
  if (state.players.length === 5) {
    const kings = SUITS.filter((suit) => !state.players[state.taker!]!.hand.some((card) => card.s === suit && card.r === 14));
    if (kings.length === 0) {
      push(state, "Le preneur a les quatre rois et joue seul.");
      return afterCall(state);
    }
    state.phase = "call";
    state.turn = state.taker;
    return state;
  }
  return afterCall(state);
}

function onCall(state: TarotState, suit: Suit): TarotState {
  const taker = state.taker!;
  if (state.players[taker]!.hand.some((card) => card.s === suit && card.r === 14)) {
    throw new Error("On n'appelle pas un roi que l'on a déjà.");
  }
  state.called = { r: 14, s: suit };
  push(state, `${state.players[taker]!.nickname} appelle le roi de ${suitFr(suit)}.`);
  return afterCall(state);
}

function afterCall(state: TarotState): TarotState {
  const taker = state.taker!;
  if (state.bid >= 3) {
    const sink = state.bid === 4 ? state.won[state.players.findIndex((_, index) => index !== taker)]! : state.won[taker]!;
    sink.push(...state.chien);
    state.chien = [];
    state.phase = "play";
    state.turn = (state.dealer + 1) % state.players.length;
    push(state, state.bid === 4 ? "Le chien va à la défense, sans être montré." : "Le chien va au preneur, sans être montré.");
    return state;
  }
  state.players[taker]!.hand.push(...state.chien.map((card) => ({ ...card })));
  state.phase = "discard";
  state.turn = taker;
  push(state, "Le preneur consulte le chien.");
  return state;
}

function onDiscard(state: TarotState, cards: Card[]): TarotState {
  const taker = state.taker!;
  const need = dealCount(state.players.length).dog;
  if (cards.length !== need) throw new Error(`Il faut écarter ${need} cartes.`);
  const hand = state.players[taker]!.hand;
  const allowed = discardable(hand, need);
  const key = cards.map(cardKey).sort().join(",");
  if (!allowed.some((option) => option.map(cardKey).sort().join(",") === key)) {
    throw new Error("Cet écart n'est pas permis.");
  }
  for (const card of cards) {
    const at = hand.findIndex((candidate) => sameCard(candidate, card));
    hand.splice(at, 1);
    state.won[taker]!.push(card);
  }
  state.chien = [];
  state.phase = "play";
  state.turn = (state.dealer + 1) % state.players.length;
  push(state, "L'écart est fait.");
  return state;
}

function onPlay(state: TarotState, seat: number, card: Card): TarotState {
  const hand = state.players[seat]!.hand;
  const legal = legalTarot(hand, state.trick);
  if (!legal.some((candidate) => sameCard(candidate, card))) throw new Error("Cette carte n'est pas jouable.");
  hand.splice(hand.findIndex((candidate) => sameCard(candidate, card)), 1);
  if (state.called && card.s === state.called.s && card.r === 14) {
    state.partner = seat;
    push(state, `${state.players[seat]!.nickname} est le partenaire appelé.`);
  }
  state.trick.push({ seat, card });
  if (state.trick.length < state.players.length) {
    state.turn = (seat + 1) % state.players.length;
    return state;
  }
  const contenders = state.trick.filter((play) => play.card.s !== "x");
  const excusePlay = state.trick.find((play) => play.card.s === "x");
  const led = contenders[0]?.card.s;
  let win = contenders[0]?.seat ?? state.trick[0]!.seat;
  for (const play of contenders) {
    const best = state.trick.find((item) => item.seat === win)!.card;
    if (play.card.s === "t" && best.s !== "t") win = play.seat;
    else if (play.card.s === best.s && play.card.s === "t" && play.card.r > best.r) win = play.seat;
    else if (best.s !== "t" && play.card.s === led && play.card.r > best.r) win = play.seat;
  }
  const last = state.players.every((player) => player.hand.length === 0);
  for (const play of state.trick) {
    if (play.card.s === "x") continue;
    state.won[win]!.push(play.card);
  }
  if (excusePlay) {
    const keep = !last || excusePlay.seat === win;
    if (keep) state.excuse = { player: excusePlay.seat, card: excusePlay.card };
    else state.won[win]!.push(excusePlay.card);
  }
  state.trick = [];
  state.tricks += 1;
  state.turn = win;
  if (!last) return state;
  if (state.excuse) state.won[state.excuse.player]!.push(state.excuse.card);
  return settle(state);
}

function settle(state: TarotState): TarotState {
  const taker = state.taker!;
  const side = [taker, ...(state.partner !== null && state.partner !== taker ? [state.partner] : [])];
  const attack = state.won.flatMap((cards, index) => (side.includes(index) ? cards : []));
  const half = attack.reduce((sum, card) => sum + halfPoints(card), 0);
  const bouts = oudlersIn(attack);
  const need = threshold(bouts) * 2;
  const made = half >= need;
  const base = 25 + Math.abs(half - need) / 2;
  const amount = base * MULTIPLE[state.bid]!;
  const defenders = state.players.map((_, index) => index).filter((index) => !side.includes(index));
  if (made) {
    state.players[taker]!.score += amount * (state.partner === null || state.partner === taker ? defenders.length : 2);
    if (state.partner !== null && state.partner !== taker) state.players[state.partner]!.score += amount;
    for (const index of defenders) state.players[index]!.score -= amount;
  } else {
    state.players[taker]!.score -= amount * (state.partner === null || state.partner === taker ? defenders.length : 2);
    if (state.partner !== null && state.partner !== taker) state.players[state.partner]!.score -= amount;
    for (const index of defenders) state.players[index]!.score += amount;
  }
  const summary = `${made ? "Contrat réussi" : "Chute"} (${BID_NAME[state.bid]}, ${bouts} bout${bouts > 1 ? "s" : ""}, ${half / 2} points). ${amount} points.`;
  state.result = { summary };
  state.phase = state.players.some((seat) => seat.score >= 100) ? "match-over" : "scoring";
  push(state, summary);
  return state;
}

export function continueTarot(state: TarotState, rng: Rng): TarotState {
  if (state.phase !== "scoring" && state.phase !== "match-over") throw new Error("La donne n'est pas finie.");
  if (state.phase === "match-over") {
    const fresh = structuredClone(state);
    for (const seat of fresh.players) seat.score = 0;
    fresh.dealNo = 0;
    fresh.log = ["Nouveau tarot."];
    fresh.phase = "scoring";
    return dealTarot(fresh, rng);
  }
  return dealTarot(state, rng);
}

export function actorTarot(state: TarotState): string | null {
  if (state.phase === "scoring" || state.phase === "match-over") return null;
  return state.players[state.turn]?.id ?? null;
}

export function suggestDiscard(hand: readonly Card[], count: number): Card[] {
  return discardable(hand, count)[0] ?? hand.slice(0, count);
}

export function hiddenTarot(state: TarotState, playerId: string): Card[] {
  const dogPublic = state.phase === "discard";
  const visible = new Set((dogPublic ? state.chien : []).map(cardKey));
  for (const play of state.trick) visible.add(cardKey(play.card));
  const hidden = state.players
    .filter((seat) => seat.id !== playerId)
    .flatMap((seat) => seat.hand)
    .filter((card) => !visible.has(cardKey(card)));
  if (!dogPublic) hidden.push(...state.chien);
  return hidden;
}

export function projectTarot(state: TarotState, playerId: string) {
  const me = state.players.findIndex((seat) => seat.id === playerId);
  if (me < 0) throw new Error("Joueur introuvable.");
  const hand = state.players[me]!.hand;
  const prompts: { label: string; action: TarotAction }[] = [];
  if (state.phase === "bid" && state.turn === me) {
    prompts.push({ label: "Je passe", action: { type: "pass" } });
    for (const level of [1, 2, 3, 4] as const) {
      if (level > state.bid) prompts.push({ label: BID_NAME[level]!, action: { type: "bid", level } });
    }
  }
  if (state.phase === "call" && state.turn === me) {
    for (const suit of SUITS) {
      if (!hand.some((card) => card.s === suit && card.r === 14)) {
        prompts.push({ label: `Roi de ${suitFr(suit)}`, action: { type: "call", suit } });
      }
    }
  }
  const showDog = state.phase === "discard" && me === state.taker;
  return {
    kind: "tarot" as const,
    phase: state.phase,
    trumpLabel: state.taker === null ? "Enchères" : `${state.players[state.taker]!.nickname} · ${BID_NAME[state.bid]}`,
    scores: state.players.map((seat) => `${seat.nickname} ${seat.score}`).join(" · "),
    trick: state.trick.map((play) => ({ seat: play.seat, card: { ...play.card } })),
    you: { seat: me, hand: hand.map((card) => ({ ...card })) },
    seats: state.players.map((seat, index) => ({
      id: seat.id,
      nickname: seat.nickname,
      seat: index,
      cards: seat.hand.length,
      isTurn: index === state.turn && state.phase !== "scoring" && state.phase !== "match-over",
      tags: index === state.taker ? BID_NAME[state.bid] ?? "" : index === state.partner ? "partenaire" : "",
    })),
    legalCards: state.phase === "play" && state.turn === me ? legalTarot(hand, state.trick) : state.phase === "discard" && me === state.taker ? hand : [],
    prompts,
    dog: showDog ? state.chien.map((card) => ({ ...card })) : [],
    discardCount: state.phase === "discard" && me === state.taker ? dealCount(state.players.length).dog : 0,
    result: state.result,
    log: [...state.log],
    naming: "tarot" as const,
  };
}

export function chooseTarot(view: ReturnType<typeof projectTarot>): TarotAction {
  if (view.phase === "bid") {
    const oudlers = view.you.hand.filter(isOudler).length;
    const trumps = view.you.hand.filter((card) => card.s === "t" || card.s === "x").length;
    if ((oudlers >= 2 || trumps >= 7) && view.prompts.some((prompt) => prompt.action.type === "bid" && (prompt.action as { level: number }).level === 1)) {
      return { type: "bid", level: 1 };
    }
    return { type: "pass" };
  }
  if (view.phase === "call") {
    const call = view.prompts.find((prompt) => prompt.action.type === "call");
    if (call) return call.action;
  }
  if (view.phase === "discard") return { type: "discard", cards: suggestDiscard(view.you.hand, view.discardCount) };
  const card = [...view.legalCards].sort((a, b) => halfPoints(a) - halfPoints(b))[0];
  if (!card) return { type: "pass" };
  return { type: "play", card };
}

export { cardKey as tarotKey };

import type { ChatMessage } from "../shared/chat";
import type { Card, Suit } from "../shared/cards";
import type { GameId } from "../shared/games";
import type { HoldemBuyIn } from "../shared/poker/holdem";

export type PlayerChip = {
  id: string;
  nickname: string;
  isBot: boolean;
  connected: boolean;
  isHost: boolean;
};

export type PokerLegal = {
  fold: boolean;
  check: boolean;
  call: number | null;
  raise: { minTo: number; maxTo: number; short: boolean } | null;
};

export type PokerSeat = {
  id: string;
  nickname: string;
  stack: number;
  streetBet: number;
  folded: boolean;
  allIn: boolean;
  isBot: boolean;
  out?: boolean;
  hole: Card[] | [Card, Card] | null;
  up?: Card[];
  hiddenCount?: number;
  isButton: boolean;
  isTurn: boolean;
  isSmallBlind?: boolean;
  isBigBlind?: boolean;
};

export type PokerKind = "texas-holdem" | "omaha" | "stud" | "draw";

export type PokerView = {
  kind: PokerKind;
  phase: string;
  street: string;
  board: Card[];
  pot: number;
  handNo: number;
  sb: number;
  bb: number;
  toActId: string | null;
  you: {
    id: string;
    hole: Card[] | [Card, Card] | null;
    stack: number;
    toCall: number;
    legal: PokerLegal | null;
    rebuys?: number;
    canRebuy?: boolean;
    prompts?: { label: string; action: object }[];
  };
  seats: PokerSeat[];
  result: { summary: string; revealed: { playerId: string; rank: string }[]; awards?: { playerId: string; amount: number }[] } | null;
  log: string[];
};

export type BeloteSeat = {
  id: string;
  nickname: string;
  seat: number;
  cards: number;
  isBot: boolean;
  isDealer: boolean;
  isTurn: boolean;
  isTaker: boolean;
};

export type BeloteView = {
  kind: "belote";
  phase: "bidding1" | "bidding2" | "play" | "scoring" | "match-over";
  trump: Suit | null;
  faceUp: Card | null;
  knownTakerCard: Card | null;
  takerSeat: number | null;
  trick: { seat: number; card: Card }[];
  scores: [number, number];
  pending: number;
  target: number;
  teams: [{ names: string }, { names: string }];
  you: { id: string; seat: number; team: 0 | 1; hand: Card[] };
  seats: BeloteSeat[];
  legalCards: Card[];
  result: { summary: string; outcome: string } | null;
  log: string[];
  turnSeat: number | null;
};

export type TrickScene = {
  kind: "coinche" | "manille" | "ecarte" | "bataille" | "tarot";
  phase: string;
  trumpLabel: string;
  scores: string;
  trick: { seat: number; card: Card }[];
  you: { seat: number; hand: Card[] };
  seats: { id: string; nickname: string; seat: number; cards: number; isTurn: boolean; tags: string }[];
  legalCards: Card[];
  prompts: { label: string; action: object }[];
  result: { summary: string } | null;
  log: string[];
  faceUp?: Card | null;
  discard?: boolean;
  discardCount?: number;
  naming?: "tarot";
  dog?: Card[];
  teams?: string[];
};

export type EngineView = PokerView | BeloteView | TrickScene;

export type TableView = {
  code: string;
  game: GameId;
  status: "lobby" | "playing";
  hostId: string;
  youId: string;
  target: number;
  buyIn: HoldemBuyIn | null;
  players: PlayerChip[];
  chat: ChatMessage[];
  engine: EngineView | null;
};

export type ServerMsg =
  | { t: "welcome"; code: string; token: string; playerId: string; view: TableView }
  | { t: "state"; view: TableView }
  | { t: "error"; message: string; fatal?: boolean }
  | { t: "pong" }
  | { t: "left" };

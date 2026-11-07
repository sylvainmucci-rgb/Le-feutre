import type { Card } from "./cards";
import type { GameId } from "./games";
import { gameById } from "./games";
import type { Rng } from "./rng";
import { chooseBeloteAction } from "./belote/bot";
import {
  applyBelote,
  beloteActor,
  continueBelote,
  createBelote,
  hiddenBeloteCards,
  projectBelote,
  type BeloteAction,
  type BeloteState,
} from "./belote/engine";
import { chooseBataille, applyBataille, actorBataille, continueBataille, createBataille, hiddenBataille, projectBataille, type BatailleAction, type BatailleState } from "./plis/bataille";
import { chooseCoinche, applyCoinche, actorCoinche, continueCoinche, createCoinche, hiddenCoinche, projectCoinche, type CoincheAction, type CoincheState } from "./plis/coinche";
import { chooseEcarte, applyEcarte, actorEcarte, continueEcarte, createEcarte, hiddenEcarte, projectEcarte, type EcarteAction, type EcarteState } from "./plis/ecarte";
import { chooseManille, applyManille, actorManille, continueManille, createManille, hiddenManille, projectManille, type ManilleAction, type ManilleState } from "./plis/manille";
import { chooseTarot, applyTarot, actorTarot, continueTarot, createTarot, hiddenTarot, projectTarot, type TarotAction, type TarotState } from "./plis/tarot";
import { chooseDraw, applyDraw, actorDraw, continueDraw, createDraw, hiddenDraw, projectDraw, rebuyDraw, type DrawAction, type DrawState } from "./poker/draw";
import { choosePokerAction } from "./poker/bot";
import {
  actorId,
  applyPoker,
  continueHoldem,
  createMatch,
  hiddenHoldemCards,
  projectHoldem,
  rebuyHoldem,
  type HoldemState,
  type PokerAction,
} from "./poker/holdem";
import { chooseOmaha, applyOmaha, actorOmaha, continueOmaha, createOmaha, hiddenOmaha, projectOmaha, rebuyOmaha, type OmahaState } from "./poker/omaha";
import { chooseStud, applyStud, actorStud, continueStud, createStud, hiddenStud, projectStud, rebuyStud, type StudState } from "./poker/stud";

export type AnyEngine = HoldemState | BeloteState | OmahaState | DrawState | StudState | CoincheState | ManilleState | EcarteState | BatailleState | TarotState;

type Seat = { id: string; nickname: string; isBot?: boolean };

type Module = {
  min: number;
  max: number;
  stack: boolean;
  create: (seats: Seat[], rng: Rng, options: { startingStack?: number; target?: number }) => AnyEngine;
  apply: (state: AnyEngine, playerId: string, action: object, rng: Rng) => AnyEngine;
  continue: (state: AnyEngine, rng: Rng, reset: boolean) => AnyEngine;
  actor: (state: AnyEngine) => string | null;
  project: (state: AnyEngine, playerId: string) => unknown;
  hidden: (state: AnyEngine, playerId: string) => Card[];
  bot: (view: never) => object;
  fallback: (view: never) => object;
  rebuy?: (state: AnyEngine, playerId: string) => AnyEngine;
};

function cardAction(view: { legalCards?: Card[]; prompts?: { action: object }[] }, kind: "play" | "play-card"): object {
  const card = view.legalCards?.[0];
  if (card) return kind === "play-card" ? { type: "play-card", card } : { type: "play", card };
  const prompt = view.prompts?.[0];
  if (prompt) return prompt.action;
  return { type: "pass" };
}

export function moduleFor(id: GameId): Module {
  const meta = gameById(id);
  const common = { min: meta.min, max: meta.max, stack: meta.stack };
  switch (id) {
    case "texas-holdem":
      return {
        ...common,
        create: (seats, rng, options) => createMatch(seats, rng, { startingStack: options.startingStack }),
        apply: (state, playerId, action) => applyPoker(state as HoldemState, playerId, action as PokerAction),
        continue: (state, rng, reset) => continueHoldem(state as HoldemState, rng, reset),
        actor: (state) => actorId(state as HoldemState),
        project: (state, playerId) => projectHoldem(state as HoldemState, playerId),
        hidden: (state, playerId) => hiddenHoldemCards(state as HoldemState, playerId),
        bot: (view) => choosePokerAction(view as never),
        fallback: () => ({ type: "fold" }),
        rebuy: (state, playerId) => rebuyHoldem(state as HoldemState, playerId),
      };
    case "omaha":
      return {
        ...common,
        create: (seats, rng, options) => createOmaha(seats, rng, { startingStack: options.startingStack }),
        apply: (state, playerId, action) => applyOmaha(state as OmahaState, playerId, action as PokerAction),
        continue: (state, rng, reset) => continueOmaha(state as OmahaState, rng, reset),
        actor: (state) => actorOmaha(state as OmahaState),
        project: (state, playerId) => projectOmaha(state as OmahaState, playerId),
        hidden: (state, playerId) => hiddenOmaha(state as OmahaState, playerId),
        bot: (view) => chooseOmaha(view as never),
        fallback: () => ({ type: "fold" }),
        rebuy: (state, playerId) => rebuyOmaha(state as OmahaState, playerId),
      };
    case "stud":
      return {
        ...common,
        create: (seats, rng, options) => createStud(seats, rng, { startingStack: options.startingStack }),
        apply: (state, playerId, action) => applyStud(state as StudState, playerId, action as PokerAction),
        continue: (state, rng, reset) => continueStud(state as StudState, rng, reset),
        actor: (state) => actorStud(state as StudState),
        project: (state, playerId) => projectStud(state as StudState, playerId),
        hidden: (state, playerId) => hiddenStud(state as StudState, playerId),
        bot: (view) => chooseStud(view as never),
        fallback: () => ({ type: "fold" }),
        rebuy: (state, playerId) => rebuyStud(state as StudState, playerId),
      };
    case "draw":
      return {
        ...common,
        create: (seats, rng, options) => createDraw(seats, rng, { startingStack: options.startingStack }),
        apply: (state, playerId, action) => applyDraw(state as DrawState, playerId, action as DrawAction),
        continue: (state, rng, reset) => continueDraw(state as DrawState, rng, reset),
        actor: (state) => actorDraw(state as DrawState),
        project: (state, playerId) => projectDraw(state as DrawState, playerId),
        hidden: (state, playerId) => hiddenDraw(state as DrawState, playerId),
        bot: (view) => chooseDraw(view as never),
        fallback: (view) => {
          const phase = (view as { phase?: string }).phase;
          if (phase === "draw") return { type: "discard", cards: [] };
          return { type: "fold" };
        },
        rebuy: (state, playerId) => rebuyDraw(state as DrawState, playerId),
      };
    case "belote":
      return {
        ...common,
        create: (seats, rng, options) => createBelote(seats, rng, { target: options.target === 500 ? 500 : 1000 }),
        apply: (state, playerId, action, rng) => applyBelote(state as BeloteState, playerId, action as BeloteAction, rng),
        continue: (state, rng) => continueBelote(state as BeloteState, rng),
        actor: (state) => beloteActor(state as BeloteState),
        project: (state, playerId) => projectBelote(state as BeloteState, playerId),
        hidden: (state, playerId) => hiddenBeloteCards(state as BeloteState, playerId),
        bot: (view) => chooseBeloteAction(view as never),
        fallback: (view) => {
          const card = (view as { legalCards?: Card[] }).legalCards?.[0];
          return card ? { type: "play", card } : { type: "pass" };
        },
      };
    case "coinche":
      return {
        ...common,
        create: (seats, rng) => createCoinche(seats, rng),
        apply: (state, playerId, action, rng) => applyCoinche(state as CoincheState, playerId, action as CoincheAction, rng),
        continue: (state, rng) => continueCoinche(state as CoincheState, rng),
        actor: (state) => actorCoinche(state as CoincheState),
        project: (state, playerId) => projectCoinche(state as CoincheState, playerId),
        hidden: (state, playerId) => hiddenCoinche(state as CoincheState, playerId),
        bot: (view) => chooseCoinche(view as never),
        fallback: (view) => cardAction(view as { legalCards?: Card[]; prompts?: { action: object }[] }, "play"),
      };
    case "manille":
      return {
        ...common,
        create: (seats, rng) => createManille(seats, rng),
        apply: (state, playerId, action) => applyManille(state as ManilleState, playerId, action as ManilleAction),
        continue: (state, rng) => continueManille(state as ManilleState, rng),
        actor: (state) => actorManille(state as ManilleState),
        project: (state, playerId) => projectManille(state as ManilleState, playerId),
        hidden: (state, playerId) => hiddenManille(state as ManilleState, playerId),
        bot: (view) => chooseManille(view as never),
        fallback: (view) => cardAction(view as { legalCards?: Card[] }, "play"),
      };
    case "ecarte":
      return {
        ...common,
        create: (seats, rng) => createEcarte(seats, rng),
        apply: (state, playerId, action) => applyEcarte(state as EcarteState, playerId, action as EcarteAction),
        continue: (state, rng) => continueEcarte(state as EcarteState, rng),
        actor: (state) => actorEcarte(state as EcarteState),
        project: (state, playerId) => projectEcarte(state as EcarteState, playerId),
        hidden: (state, playerId) => hiddenEcarte(state as EcarteState, playerId),
        bot: (view) => chooseEcarte(view as never),
        fallback: (view) => cardAction(view as { legalCards?: Card[]; prompts?: { action: object }[] }, "play-card"),
      };
    case "bataille":
      return {
        ...common,
        create: (seats, rng) => createBataille(seats, rng),
        apply: (state, playerId, action) => applyBataille(state as BatailleState, playerId, action as BatailleAction),
        continue: (state, rng) => continueBataille(state as BatailleState, rng),
        actor: (state) => actorBataille(state as BatailleState),
        project: (state, playerId) => projectBataille(state as BatailleState, playerId),
        hidden: (state, playerId) => hiddenBataille(state as BatailleState, playerId),
        bot: (view) => chooseBataille(view as never),
        fallback: (view) => cardAction(view as { legalCards?: Card[] }, "play"),
      };
    case "tarot":
      return {
        ...common,
        create: (seats, rng) => createTarot(seats, rng),
        apply: (state, playerId, action, rng) => applyTarot(state as TarotState, playerId, action as TarotAction, rng),
        continue: (state, rng) => continueTarot(state as TarotState, rng),
        actor: (state) => actorTarot(state as TarotState),
        project: (state, playerId) => projectTarot(state as TarotState, playerId),
        hidden: (state, playerId) => hiddenTarot(state as TarotState, playerId),
        bot: (view) => chooseTarot(view as never),
        fallback: (view) => cardAction(view as { legalCards?: Card[]; prompts?: { action: object }[] }, "play"),
      };
    default:
      throw new Error("Ce jeu n'est pas disponible.");
  }
}

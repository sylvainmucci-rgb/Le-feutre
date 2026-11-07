import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardKey, collectCards, sameCard, type Card, type Suit } from "../src/shared/cards";
import { mulberry32 } from "../src/shared/rng";
import {
  applyPoker,
  createMatch,
  formatDollars,
  hiddenHoldemCards,
  HOLDEM_STAKES,
  projectHoldem,
  stakesForBuyIn,
  type HoldemState,
} from "../src/shared/poker/holdem";

const c = (r: number, s: Suit): Card => ({ r, s });
const fill = (placed: Record<number, Card>): Card[] => {
  const used = new Set(Object.values(placed).map(cardKey));
  const rest: Card[] = [];
  for (const s of ["s", "h", "d", "c"] as const) {
    for (let r = 2; r <= 14; r += 1) {
      const card = c(r, s);
      if (!used.has(cardKey(card))) rest.push(card);
    }
  }
  const deck: Card[] = [];
  let cursor = 0;
  for (let i = 0; i < 52; i += 1) deck.push(placed[i] ?? rest[cursor++]!);
  return deck;
};

const seats = [
  { id: "a", nickname: "Ada" },
  { id: "b", nickname: "Basile" },
  { id: "c", nickname: "Chloé" },
];

function noLeak(state: HoldemState, playerId: string) {
  const view = projectHoldem(state, playerId);
  const visible = collectCards(view);
  for (const secret of hiddenHoldemCards(state, playerId)) {
    assert.equal(
      visible.some((card) => sameCard(card, secret)),
      false,
      `carte cachée visible (${cardKey(secret)})`,
    );
  }
  assert.equal(JSON.stringify(view).includes('"deck"'), false);
}

describe("mises, pots et visibilité du Hold'em", () => {
  it("fait gagner la blind au fold, sans montrer les cartes", () => {
    const state = createMatch(seats.slice(0, 2), mulberry32(1), { deck: fill({}), sb: 10, bb: 20 });
    assert.equal(state.players[0]!.streetBet, 10);
    assert.equal(state.players[1]!.streetBet, 20);
    assert.throws(() => applyPoker(state, "a", { type: "check" }), /parole/);
    const folded = applyPoker(state, "a", { type: "fold" });
    assert.equal(folded.players[0]!.stack, 990);
    assert.equal(folded.players[1]!.stack, 1010);
    assert.equal(folded.result?.revealed.length, 0);
    noLeak(state, "a");
    noLeak(folded, "b");
    const shown = projectHoldem(folded, "a");
    assert.equal(shown.seats.find((seat) => seat.id === "b")!.hole, null);
    assert.ok(shown.you.hole);
  });

  it("impose la relance minimale et distribue dans l'ordre prévu", () => {
    const deck = fill({
      0: c(2, "c"),
      1: c(3, "c"),
      2: c(4, "d"),
      3: c(5, "d"),
    });
    const state = createMatch(seats.slice(0, 2), mulberry32(2), { deck, sb: 10, bb: 20 });
    assert.deepEqual(state.players[0]!.hole, [c(2, "c"), c(4, "d")]);
    assert.deepEqual(state.players[1]!.hole, [c(3, "c"), c(5, "d")]);
    assert.throws(() => applyPoker(state, "a", { type: "bet", amount: 30 }), /minimale/);
    const raised = applyPoker(state, "a", { type: "bet", amount: 60 });
    assert.equal(raised.currentBet, 60);
    assert.equal(raised.minRaise, 40);
    assert.equal(raised.toAct, 1);
  });

  it("ne rouvre pas après un tapis incomplet", () => {
    const state = createMatch(
      [
        { id: "a", nickname: "Ada", stack: 1000 },
        { id: "b", nickname: "Basile", stack: 130 },
        { id: "c", nickname: "Chloé", stack: 1000 },
      ],
      mulberry32(3),
      { deck: fill({}), sb: 10, bb: 20 },
    );
    const raised = applyPoker(state, "a", { type: "bet", amount: 100 });
    const jammed = applyPoker(raised, "b", { type: "bet", amount: 130 });
    assert.equal(jammed.currentBet, 130);
    assert.equal(jammed.players[jammed.toAct!]!.id, "c");
    const called = applyPoker(jammed, "c", { type: "call" });
    assert.throws(() => applyPoker(called, "a", { type: "bet", amount: 300 }), /pas relancer/);
    const closed = applyPoker(called, "a", { type: "call" });
    assert.equal(closed.players.find((seat) => seat.id === "a")!.streetBet, 0);
    assert.equal(closed.street, "flop");
    noLeak(jammed, "c");
  });

  it("sépare le pot et donne le jeton impair à gauche du bouton", () => {
    const deck = fill({
      0: c(14, "s"),
      1: c(7, "h"),
      2: c(14, "h"),
      3: c(14, "c"),
      4: c(6, "d"),
      5: c(14, "d"),
      6: c(2, "c"),
      7: c(2, "h"),
      8: c(3, "d"),
      9: c(4, "c"),
      10: c(3, "c"),
      11: c(8, "s"),
      12: c(4, "s"),
      13: c(9, "c"),
    });
      let state = createMatch(
      [
        { id: "a", nickname: "Ada", stack: 25 },
        { id: "b", nickname: "Basile", stack: 25 },
        { id: "c", nickname: "Chloé", stack: 25 },
      ],
      mulberry32(4),
      { deck, sb: 10, bb: 20 },
    );
    noLeak(state, "a");
    state = applyPoker(state, "a", { type: "bet", amount: 25 });
    state = applyPoker(state, "b", { type: "call" });
    state = applyPoker(state, "c", { type: "call" });
    assert.equal(state.phase === "between" || state.phase === "match-over", true);
    assert.equal(state.players[0]!.stack, 37);
    assert.equal(state.players[1]!.stack, 38);
    assert.equal(state.players[2]!.stack, 0);
    const view = projectHoldem(state, "c");
    assert.ok(view.seats.find((seat) => seat.id === "a")!.hole);
    assert.equal(view.result?.pots[0]?.amount, 75);
    noLeak(state, "c");
  });

  it("applique les trois tapis en dollars fictifs, sans doubler les blinds", () => {
    const expected = {
      200: { sb: 5, bb: 10, label: "2 $", blinds: "0,05 $ / 0,10 $" },
      500: { sb: 25, bb: 50, label: "5 $", blinds: "0,25 $ / 0,50 $" },
      1000: { sb: 50, bb: 100, label: "10 $", blinds: "0,50 $ / 1 $" },
    } as const;
    for (const buyIn of [200, 500, 1000] as const) {
      const state = createMatch(
        [
          { id: "a", nickname: "Ada" },
          { id: "b", nickname: "Basile" },
          { id: "c", nickname: "Chloé" },
        ],
        mulberry32(buyIn),
        { startingStack: buyIn, deck: fill({}) },
      );
      const stake = stakesForBuyIn(buyIn);
      assert.deepEqual(HOLDEM_STAKES[buyIn], { sb: expected[buyIn].sb, bb: expected[buyIn].bb });
      assert.equal(stake.sb, expected[buyIn].sb);
      assert.equal(stake.bb, expected[buyIn].bb);
      assert.equal(formatDollars(buyIn), expected[buyIn].label);
      assert.equal(`${formatDollars(state.sb)} / ${formatDollars(state.bb)}`, expected[buyIn].blinds);
      assert.equal(state.startingStack, buyIn);
      assert.deepEqual(
        state.players.map((seat) => seat.committed).sort((left, right) => left - right),
        [0, stake.sb, stake.bb],
      );
      for (const seat of state.players) {
        assert.equal(seat.stack + seat.committed, buyIn);
      }
      const called = applyPoker(state, state.players[state.toAct!]!.id, { type: "call" });
      assert.equal(called.sb, state.sb);
      assert.equal(called.bb, state.bb);
    }
    assert.equal(formatDollars(200), "2 $");
    assert.equal(stakesForBuyIn(200).sb, Math.round(200 * 0.025));
    assert.equal(stakesForBuyIn(200).bb, Math.round(200 * 0.05));
    assert.throws(() => createMatch(seats.slice(0, 2), mulberry32(1), { startingStack: 300 }), /2, 5 ou 10 dollars/);
  });
});

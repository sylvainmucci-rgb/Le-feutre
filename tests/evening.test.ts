import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mulberry32 } from "../src/shared/rng";
import { colorOf, createBlackjack, createRoulette, handTotal, applyRoulette, spinNumber, applyBlackjack, projectBlackjack, hiddenBlackjack } from "../src/shared/evening/casino";
import { applyLoto, createLoto, makeCard } from "../src/shared/evening/loto";
import { palmaresSnapshot, recordOutcome, resetPalmares } from "../src/server/palmares";

describe("coin soirée", () => {
  it("fabrique des cartons de loto et annonce une quine", () => {
    const used = new Set<number>();
    const rows = makeCard(mulberry32(1), used);
    const numbers = rows.flat();
    assert.equal(numbers.length, 15);
    assert.equal(new Set(numbers).size, 15);
    assert.equal(rows.every((row) => row.length === 5), true);
    const state = createLoto([{ id: "Ada", nickname: "Ada" }], mulberry32(2));
    const owned = new Set(state.players[0]!.rows.flat());
    let guard = 0;
    let current = state;
    while (!current.players[0]!.quine && guard < 90) {
      current = applyLoto(current, "Ada", { type: "draw" }, mulberry32(guard + 3));
      guard += 1;
    }
    assert.equal(current.players[0]!.quine, true);
    assert.ok(current.drawn.every((n) => n >= 1 && n <= 90));
    assert.equal(new Set(current.drawn).size, current.drawn.length);
    assert.ok(current.drawn.some((n) => owned.has(n)));
  });

  it("paie la rouge et fait perdre sur le zéro", () => {
    assert.equal(colorOf(0), "green");
    assert.equal(colorOf(1), "red");
    assert.equal(colorOf(2), "black");
    const state = createRoulette([{ id: "Ada", nickname: "Ada" }]);
    const bet = applyRoulette(state, "Ada", { type: "bet", target: "red", amount: 10 }, () => 0);
    const spun = applyRoulette(bet, "Ada", { type: "spin" }, () => 0.1);
    assert.equal(spun.last, 3);
    assert.equal(spun.players[0]!.chips, 110);
    assert.equal(spinNumber(() => 0), 0);
    const zero = applyRoulette(
      applyRoulette(createRoulette([{ id: "Ada", nickname: "Ada" }]), "Ada", { type: "bet", target: "red", amount: 10 }, () => 0),
      "Ada",
      { type: "spin" },
      () => 0,
    );
    assert.equal(zero.last, 0);
    assert.equal(zero.players[0]!.chips, 90);
  });

  it("compte le blackjack et cache la carte du croupier", () => {
    assert.equal(handTotal([{ r: 14, s: "s" }, { r: 13, s: "h" }]), 21);
    assert.equal(handTotal([{ r: 14, s: "s" }, { r: 14, s: "h" }, { r: 9, s: "d" }]), 21);
    const state = createBlackjack([{ id: "Ada", nickname: "Ada" }], mulberry32(4));
    const dealt = applyBlackjack(state, "Ada", { type: "bet", amount: 10 });
    assert.equal(dealt.phase, "play");
    const view = projectBlackjack(dealt, "Ada");
    assert.equal(view.dealer.length, 1);
    const hidden = hiddenBlackjack(dealt, "Ada");
    assert.equal(hidden.some((card) => card.r === dealt.dealer[1]!.r && card.s === dealt.dealer[1]!.s), true);
    assert.equal(JSON.stringify(view).includes('"deck"'), false);
  });

  it("retient un duel fictif", () => {
    resetPalmares();
    recordOutcome(["Sylvain"], ["Camille"]);
    recordOutcome(["Sylvain"], ["Camille"]);
    recordOutcome(["Camille"], ["Sylvain"]);
    const board = palmaresSnapshot();
    const duel = board.duels.find((item) => item.left === "Camille" && item.right === "Sylvain");
    assert.ok(duel);
    assert.equal(duel.leftWins + duel.rightWins, 3);
    assert.equal(board.ranking.find((row) => row.nickname === "Sylvain")?.victories, 2);
    resetPalmares();
  });
});
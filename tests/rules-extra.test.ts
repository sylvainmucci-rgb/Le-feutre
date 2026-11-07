import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Card, Suit } from "../src/shared/cards";
import { mulberry32 } from "../src/shared/rng";
import {
  applyCoinche,
  bidStrength,
  coincheCardPoints,
  createCoinche,
  legalCoinche,
  winningCoinche,
  type CoincheState,
} from "../src/shared/plis/coinche";
import {
  chelemBonus,
  countPoignee,
  createTarot,
  poigneeLevel,
  poigneeThresholds,
  scoreTarotDeal,
} from "../src/shared/plis/tarot";

const c = (r: number, s: Suit): Card => ({ r, s });
const four = ["Ada", "Basile", "Chloé", "Dino"].map((nickname) => ({ id: nickname, nickname }));

describe("coinche sans-atout et tout-atout", () => {
  it("classe les enchères : couleur, puis tout-atout, puis sans-atout", () => {
    assert.ok(bidStrength(80, "ta") > bidStrength(80, "color"));
    assert.ok(bidStrength(80, "sa") > bidStrength(80, "ta"));
    assert.ok(bidStrength(90, "color") > bidStrength(80, "sa"));
    assert.equal(coincheCardPoints(c(14, "h"), "sa", null), 11);
    assert.equal(coincheCardPoints(c(11, "h"), "sa", null), 2);
    assert.equal(coincheCardPoints(c(11, "h"), "ta", null), 20);
    assert.equal(coincheCardPoints(c(9, "h"), "ta", null), 14);
    assert.equal(coincheCardPoints(c(11, "h"), "color", "s"), 2);
    assert.equal(coincheCardPoints(c(11, "s"), "color", "s"), 20);
    const plain = [14, 10, 13, 12, 11, 9, 8, 7].reduce((sum, rank) => sum + coincheCardPoints(c(rank, "h"), "sa", null), 0);
    const trump = [11, 9, 14, 10, 13, 12, 8, 7].reduce((sum, rank) => sum + coincheCardPoints(c(rank, "h"), "ta", null), 0);
    assert.equal(plain * 4, 120);
    assert.equal(trump * 4, 248);
  });

  it("accepte le sans-atout au-dessus de la couleur et fait gagner l'as", () => {
    let state = createCoinche(four, mulberry32(2));
    const actor = state.players[state.turn]!.id;
    state = applyCoinche(state, actor, { type: "bid", suit: "h", value: 80 }, mulberry32(2));
    const next = state.players[state.turn]!.id;
    state = applyCoinche(state, next, { type: "bid", value: 80, mode: "sa" }, mulberry32(2));
    assert.equal(state.mode, "sa");
    assert.equal(state.trump, null);
    assert.throws(() => applyCoinche(state, state.players[state.turn]!.id, { type: "bid", suit: "s", value: 80 }, mulberry32(2)), /surenchérir/);
    const trick = [
      { seat: 0, card: c(10, "h") },
      { seat: 1, card: c(14, "h") },
      { seat: 2, card: c(11, "s") },
      { seat: 3, card: c(13, "h") },
    ];
    assert.equal(winningCoinche(trick, "sa", null), 1);
    const hand = [c(14, "h"), c(7, "h")];
    const legal = legalCoinche(hand, [{ seat: 0, card: c(10, "h") }], "sa", null, 1);
    assert.equal(legal.some((card) => card.r === 7), true);
  });

  it("fait monter au tout-atout et donne le pli au valet", () => {
    const trick = [
      { seat: 0, card: c(14, "h") },
      { seat: 1, card: c(11, "h") },
      { seat: 2, card: c(11, "s") },
      { seat: 3, card: c(9, "h") },
    ];
    assert.equal(winningCoinche(trick, "ta", null), 1);
    const must = legalCoinche([c(11, "h"), c(7, "h"), c(14, "s")], [{ seat: 0, card: c(14, "h") }], "ta", null, 1);
    assert.deepEqual(must.map((card) => card.r), [11]);
    const state = { mode: "ta" } as CoincheState;
    assert.equal(state.mode, "ta");
  });
});

describe("poignées et chelem", () => {
  it("fixe les seuils selon le nombre de joueurs", () => {
    assert.deepEqual(poigneeThresholds(3), { simple: 13, double: 15, triple: 18 });
    assert.deepEqual(poigneeThresholds(4), { simple: 10, double: 13, triple: 15 });
    assert.deepEqual(poigneeThresholds(5), { simple: 8, double: 10, triple: 13 });
    assert.equal(poigneeLevel(9, 4), 0);
    assert.equal(poigneeLevel(10, 4), 1);
    assert.equal(poigneeLevel(13, 4), 2);
    assert.equal(poigneeLevel(15, 4), 3);
    assert.equal(poigneeLevel(12, 3), 0);
    assert.equal(poigneeLevel(8, 5), 1);
    assert.equal(chelemBonus(false, false), 0);
    assert.equal(chelemBonus(false, true), 200);
    assert.equal(chelemBonus(true, true), 400);
    assert.equal(chelemBonus(true, false), -200);
    const hand = [
      ...Array.from({ length: 9 }, (_, index) => ({ r: index + 2, s: "t" as const })),
      { r: 0, s: "x" as const },
    ];
    assert.equal(countPoignee(hand), 10);
    assert.equal(poigneeLevel(countPoignee(hand), 4), 1);
  });

  it("donne la poignée au camp qui gagne et pénalise le chelem annoncé chuté", () => {
    const state = createTarot(four, mulberry32(6));
    state.taker = 0;
    state.bid = 1;
    state.partner = null;
    state.won = state.players.map(() => []);
    state.trickWins = [0, 0, 0, 0];
    state.poignees = [{ seat: 1, level: 1 }];
    state.chelemCall = true;
    for (const seat of state.players) seat.score = 0;
    scoreTarotDeal(state);
    assert.match(state.result?.summary ?? "", /poignée 20/);
    assert.match(state.result?.summary ?? "", /chelem -200/);
    assert.equal(state.players[0]!.score, -243 - 60 - 600);
    assert.equal(state.players[1]!.score, 81 + 20 + 200);
  });
});

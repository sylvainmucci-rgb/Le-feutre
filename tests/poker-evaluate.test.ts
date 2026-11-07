import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Card, Suit } from "../src/shared/cards";
import { bestHand, compareScores, rankLabel, scoreFive } from "../src/shared/poker/evaluate";

const c = (r: number, s: Suit): Card => ({ r, s });

describe("évaluateur de poker", () => {
  it("reconnaît la quinte flush royale et la classe au-dessus d'une quinte flush", () => {
    const royal = scoreFive([c(14, "h"), c(13, "h"), c(12, "h"), c(11, "h"), c(10, "h")]);
    const steel = scoreFive([c(13, "s"), c(12, "s"), c(11, "s"), c(10, "s"), c(9, "s")]);
    assert.equal(rankLabel(royal), "Quinte flush royale");
    assert.equal(rankLabel(steel), "Quinte flush");
    assert.ok(compareScores(royal, steel) > 0);
  });

  it("joue la roue comme une quinte à cinq, y compris en couleur", () => {
    const wheel = scoreFive([c(14, "h"), c(2, "d"), c(3, "s"), c(4, "c"), c(5, "h")]);
    const six = scoreFive([c(6, "h"), c(5, "d"), c(4, "s"), c(3, "c"), c(2, "h")]);
    assert.deepEqual(wheel, [4, 5]);
    assert.ok(compareScores(six, wheel) > 0);
    const wheelFlush = scoreFive([c(14, "d"), c(2, "d"), c(3, "d"), c(4, "d"), c(5, "d")]);
    assert.deepEqual(wheelFlush, [8, 5]);
    assert.equal(rankLabel(wheelFlush), "Quinte flush");
  });

  it("ordonne carré, full, couleur et suite, puis départage les kickers", () => {
    const quads = scoreFive([c(9, "s"), c(9, "h"), c(9, "d"), c(9, "c"), c(3, "s")]);
    const boat = scoreFive([c(14, "s"), c(14, "h"), c(14, "d"), c(13, "c"), c(13, "s")]);
    const smallerBoat = scoreFive([c(14, "s"), c(14, "h"), c(14, "d"), c(12, "c"), c(12, "s")]);
    const flush = scoreFive([c(14, "h"), c(13, "h"), c(12, "h"), c(11, "h"), c(9, "h")]);
    const straight = scoreFive([c(14, "h"), c(13, "s"), c(12, "d"), c(11, "c"), c(10, "h")]);
    assert.equal(rankLabel(quads), "Carré");
    assert.ok(compareScores(quads, boat) > 0);
    assert.ok(compareScores(boat, smallerBoat) > 0);
    assert.ok(compareScores(boat, flush) > 0);
    assert.ok(compareScores(flush, straight) > 0);
    assert.deepEqual(straight, [4, 14]);
  });

  it("départage double paire, paire et hauteur", () => {
    const acesKings = scoreFive([c(14, "s"), c(14, "h"), c(13, "d"), c(13, "c"), c(5, "s")]);
    const acesQueens = scoreFive([c(14, "s"), c(14, "h"), c(12, "d"), c(12, "c"), c(9, "s")]);
    const acesKingsBetter = scoreFive([c(14, "s"), c(14, "h"), c(13, "d"), c(13, "c"), c(9, "s")]);
    const tensAces = scoreFive([c(10, "s"), c(10, "h"), c(14, "d"), c(13, "c"), c(2, "s")]);
    const tensQueens = scoreFive([c(10, "s"), c(10, "h"), c(14, "d"), c(12, "c"), c(11, "s")]);
    const aceHigh = scoreFive([c(14, "s"), c(13, "h"), c(11, "d"), c(8, "c"), c(4, "s")]);
    const aceHighTie = scoreFive([c(14, "d"), c(13, "c"), c(11, "h"), c(8, "s"), c(4, "d")]);
    assert.ok(compareScores(acesKings, acesQueens) > 0);
    assert.ok(compareScores(acesKingsBetter, acesKings) > 0);
    assert.ok(compareScores(tensAces, tensQueens) > 0);
    assert.equal(compareScores(aceHigh, aceHighTie), 0);
    assert.equal(rankLabel(aceHigh), "Hauteur");
  });

  it("choisit les meilleures cinq cartes parmi sept", () => {
    const flush = bestHand([
      c(14, "h"),
      c(13, "h"),
      c(12, "h"),
      c(11, "h"),
      c(9, "h"),
      c(8, "h"),
      c(2, "h"),
    ]);
    assert.deepEqual(flush.score, [5, 14, 13, 12, 11, 9]);
    const straightOverPair = bestHand([
      c(6, "c"),
      c(5, "d"),
      c(4, "h"),
      c(3, "s"),
      c(2, "c"),
      c(9, "d"),
      c(9, "h"),
    ]);
    assert.deepEqual(straightOverPair.score, [4, 6]);
    const broadway = bestHand([
      c(14, "h"),
      c(13, "d"),
      c(12, "c"),
      c(11, "s"),
      c(10, "h"),
      c(2, "d"),
      c(3, "h"),
    ]);
    assert.equal(broadway.score[0], 4);
    assert.equal(broadway.score[1], 14);
  });
});

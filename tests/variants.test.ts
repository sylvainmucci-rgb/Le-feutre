import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardKey, collectCards, sameCard, type Card, type Suit } from "../src/shared/cards";
import { mulberry32 } from "../src/shared/rng";
import { createDraw, applyDraw, hiddenDraw, maxDiscard, projectDraw } from "../src/shared/poker/draw";
import { createMatch, rebuyHoldem, applyPoker, continueHoldem } from "../src/shared/poker/holdem";
import { bestOmaha, createOmaha, applyOmaha, hiddenOmaha, projectOmaha } from "../src/shared/poker/omaha";
import { createStud, hiddenStud, projectStud } from "../src/shared/poker/stud";

const c = (r: number, s: Suit): Card => ({ r, s });
const seats = (names: string[]) => names.map((nickname) => ({ id: nickname, nickname }));

function noLeak(hidden: Card[], view: unknown) {
  const visible = collectCards(view);
  for (const secret of hidden) {
    assert.equal(visible.some((card) => sameCard(card, secret)), false, cardKey(secret));
  }
}

describe("recaves et variantes de poker", () => {
  it("autorise trois recaves au montant initial, puis l'élimination", () => {
    let state = createMatch(seats(["Ada", "Basile"]), mulberry32(3), { startingStack: 200 });
    state.players[0]!.stack = 0;
    state.phase = "between";
    for (let i = 1; i <= 3; i += 1) {
      state = rebuyHoldem(state, "Ada");
      assert.equal(state.players[0]!.stack, 200);
      assert.equal(state.players[0]!.rebuys, i);
      state.players[0]!.stack = 0;
      state.phase = "between";
    }
    assert.throws(() => rebuyHoldem(state, "Ada"), /Trois recaves/);
  });

  it("ne fait pas recaver un automate tout seul au-delà de trois", () => {
    let state = createMatch(
      [
        { id: "Ada", nickname: "Ada" },
        { id: "Bot", nickname: "Bot", isBot: true },
      ],
      mulberry32(4),
      { startingStack: 200 },
    );
    state.players[1]!.stack = 0;
    state.players[1]!.rebuys = 3;
    state.phase = "between";
    state = continueHoldem(state, mulberry32(5));
    assert.equal(state.players[1]!.out || state.phase === "match-over", true);
  });

  it("évalue l'Omaha avec exactement deux cartes privées", () => {
    const hole = [c(14, "h"), c(13, "h"), c(2, "s"), c(3, "c")];
    const board = [c(12, "h"), c(11, "h"), c(9, "h"), c(8, "d"), c(4, "c")];
    const best = bestOmaha(hole, board);
    assert.equal(best.score[0], 5);
    assert.equal(best.five.filter((card) => hole.some((privateCard) => sameCard(privateCard, card))).length, 2);
  });

  it("plafonne la relance de l'Omaha au pot", () => {
    const state = createOmaha(seats(["Ada", "Basile"]), mulberry32(6), { startingStack: 1000 });
    assert.equal(state.players[0]!.hole.length, 4);
    const view = projectOmaha(state, "Basile");
    noLeak(hiddenOmaha(state, "Basile"), view);
    assert.equal(view.you.hole.length, 4);
    assert.equal(view.seats.find((seat) => seat.id === "Ada")!.hole, null);
    const actor = state.players[state.toAct!]!.id;
    const legal = projectOmaha(state, actor).you.legal;
    assert.ok(legal?.raise);
    assert.throws(() => applyOmaha(state, actor, { type: "bet", amount: legal!.raise!.maxTo + 1 }), /Pot-limit/);
    const raised = applyOmaha(state, actor, { type: "bet", amount: legal!.raise!.maxTo });
    assert.equal(raised.currentBet, legal!.raise!.maxTo);
  });

  it("limite l'échange du poker fermé et cache les mains", () => {
    const state = createDraw(seats(["Ada", "Basile"]), mulberry32(7), { startingStack: 500 });
    assert.equal(state.players[0]!.hole.length, 5);
    noLeak(hiddenDraw(state, "Basile"), projectDraw(state, "Basile"));
    const hole = [c(14, "s"), c(9, "h"), c(8, "d"), c(7, "c"), c(2, "s")];
    assert.equal(maxDiscard(hole, [c(9, "h"), c(8, "d"), c(7, "c"), c(2, "s")]), true);
    assert.equal(maxDiscard(hole, [c(14, "s"), c(9, "h"), c(8, "d"), c(7, "c")]), false);
    assert.equal(maxDiscard(hole, hole.slice(0, 5)), false);
  });

  it("poste l'ante et le bring-in au stud, et cache les cartes fermées", () => {
    const state = createStud(seats(["Ada", "Basile", "Chloé"]), mulberry32(8), { startingStack: 1000 });
    assert.equal(state.players.every((seat) => seat.down.length === 2 && seat.up.length === 1), true);
    const antes = state.players.reduce((sum, seat) => sum + seat.committed, 0);
    assert.ok(antes >= state.sb * 3);
    const view = projectStud(state, "Ada");
    assert.equal(view.seats.find((seat) => seat.id === "Basile")!.up.length, 1);
    noLeak(hiddenStud(state, "Ada"), view);
    assert.equal(JSON.stringify(view).includes('"deck"'), false);
  });

  it("fait coucher le premier joueur du Hold'em sans casser les blinds", () => {
    const state = createMatch(seats(["Ada", "Basile"]), mulberry32(9), { sb: 10, bb: 20 });
    const folded = applyPoker(state, state.players[state.toAct!]!.id === "Ada" ? "Ada" : "Ada", { type: "fold" });
    assert.ok(folded.players.some((seat) => seat.folded) || folded.result);
  });
});

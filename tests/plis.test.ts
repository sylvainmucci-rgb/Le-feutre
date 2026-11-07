import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardKey, collectCards, sameCard, type Card } from "../src/shared/cards";
import { mulberry32 } from "../src/shared/rng";
import { applyBataille, createBataille, hiddenBataille, projectBataille } from "../src/shared/plis/bataille";
import { applyCoinche, createCoinche, hiddenCoinche, projectCoinche } from "../src/shared/plis/coinche";
import { applyEcarte, createEcarte, hiddenEcarte, projectEcarte } from "../src/shared/plis/ecarte";
import { applyManille, createManille, hiddenManille, legalManille, manillePoints, projectManille } from "../src/shared/plis/manille";
import {
  applyTarot,
  createTarot,
  halfPoints,
  hiddenTarot,
  isOudler,
  legalTarot,
  projectTarot,
  tarotDeck,
  threshold,
} from "../src/shared/plis/tarot";

function noLeak(hidden: Card[], view: unknown) {
  const visible = collectCards(view);
  for (const secret of hidden) assert.equal(visible.some((card) => sameCard(card, secret)), false, cardKey(secret));
  assert.equal(JSON.stringify(view).includes('"deck"'), false);
}

const four = ["Ada", "Basile", "Chloé", "Dino"].map((nickname) => ({ id: nickname, nickname }));

describe("jeux de plis", () => {
  it("compte la manille muette : 60 points de cartes et 10 de der", () => {
    const cards = [
      { r: 10, s: "s" },
      { r: 14, s: "s" },
      { r: 13, s: "s" },
      { r: 12, s: "s" },
      { r: 11, s: "s" },
    ] as Card[];
    assert.equal(manillePoints(cards, false), 15);
    assert.equal(manillePoints(cards, true), 25);
    const state = createManille(four, mulberry32(1));
    assert.equal(state.players.reduce((sum, seat) => sum + seat.hand.length, 0), 32);
    const hand = state.players[state.turn]!.hand;
    const led = hand[0]!;
    assert.equal(legalManille(hand, []).length, 8);
    noLeak(hiddenManille(state, "Basile"), projectManille(state, "Basile"));
    const played = applyManille(state, state.players[state.turn]!.id, { type: "play", card: led });
    assert.equal(played.trick.length, 1);
  });

  it("ouvre une coinche couleur et refuse une enchère trop basse", () => {
    const state = createCoinche(four, mulberry32(2));
    assert.equal(state.players.every((seat) => seat.hand.length === 8), true);
    noLeak(hiddenCoinche(state, "Basile"), projectCoinche(state, "Basile"));
    const actor = state.players[state.turn]!.id;
    const bid = applyCoinche(state, actor, { type: "bid", suit: "h", value: 80 }, mulberry32(2));
    assert.equal(bid.contract, 80);
    assert.throws(() => applyCoinche(bid, bid.players[bid.turn]!.id, { type: "bid", suit: "s", value: 80 }, mulberry32(2)), /surenchérir/);
    const coinched = applyCoinche(bid, bid.players[bid.turn]!.id, { type: "coinche" }, mulberry32(2));
    assert.equal(coinched.coinche, 1);
  });

  it("retourne l'atout de l'écarté et marque le roi", () => {
    let found = false;
    for (let seed = 1; seed < 40 && !found; seed += 1) {
      const state = createEcarte(
        [
          { id: "Ada", nickname: "Ada" },
          { id: "Basile", nickname: "Basile" },
        ],
        mulberry32(seed),
      );
      assert.equal(state.players[0]!.hand.length, 5);
      assert.ok(state.faceUp);
      noLeak(hiddenEcarte(state, "Ada"), projectEcarte(state, "Ada"));
      if (state.faceUp!.r === 13) {
        assert.equal(state.scores[state.dealer], 1);
        found = true;
      }
    }
    assert.equal(found, true);
    const state = createEcarte(
      [
        { id: "Ada", nickname: "Ada" },
        { id: "Basile", nickname: "Basile" },
      ],
      mulberry32(3),
    );
    if (state.phase === "proposal") {
      const played = applyEcarte(state, state.players[state.turn]!.id, { type: "play" });
      assert.equal(played.phase, "play");
    }
  });

  it("cache les cartes de la bataille jusqu'au retournement", () => {
    const state = createBataille(
      [
        { id: "Ada", nickname: "Ada" },
        { id: "Basile", nickname: "Basile" },
      ],
      mulberry32(4),
    );
    const view = projectBataille(state, "Ada");
    noLeak(hiddenBataille(state, "Ada"), view);
    const card = state.players[0]!.hand[0]!;
    const next = applyBataille(state, "Ada", { type: "play", card });
    const during = projectBataille(next, "Basile");
    assert.equal(JSON.stringify(during).includes(cardKey(card)), false);
  });

  it("compose un tarot de 78 cartes et impose la fourniture", () => {
    assert.equal(tarotDeck().length, 78);
    assert.equal(new Set(tarotDeck().map(cardKey)).size, 78);
    assert.equal(tarotDeck().reduce((sum, card) => sum + halfPoints(card), 0), 182);
    assert.equal(threshold(0), 56);
    assert.equal(threshold(2), 41);
    const state = createTarot(
      ["Ada", "Basile", "Chloé", "Dino"].map((nickname) => ({ id: nickname, nickname })),
      mulberry32(5),
    );
    assert.equal(state.players[0]!.hand.length, 18);
    assert.equal(state.chien.length, 6);
    noLeak(hiddenTarot(state, "Ada"), projectTarot(state, "Ada"));
    const hand = [
      { r: 14, s: "s" as const },
      { r: 10, s: "h" as const },
      { r: 5, s: "t" as const },
    ];
    const trick = [{ card: { r: 8, s: "s" as const } }];
    const legal = legalTarot(hand, trick);
    assert.deepEqual(legal.map(cardKey), ["14s"]);
    assert.equal(isOudler({ r: 1, s: "t" }), true);
    assert.equal(isOudler({ r: 0, s: "x" }), true);
  });

  it("joue une prise de tarot jusqu'à l'écart sans montrer le chien avant", () => {
    let state = createTarot(
      ["Ada", "Basile", "Chloé"].map((nickname) => ({ id: nickname, nickname, isBot: nickname !== "Ada" })),
      mulberry32(11),
    );
    const before = projectTarot(state, "Basile");
    assert.equal(JSON.stringify(before).includes(cardKey(state.chien[0]!)), false);
    for (let guard = 0; guard < 8 && state.phase === "bid"; guard += 1) {
      const actor = state.players[state.turn]!;
      state =
        actor.id === "Ada" && state.bid === 0
          ? applyTarot(state, actor.id, { type: "bid", level: 1 }, mulberry32(11))
          : applyTarot(state, actor.id, { type: "pass" }, mulberry32(11));
    }
    assert.equal(state.phase, "discard");
    assert.equal(state.taker !== null && state.players[state.taker]!.hand.length, 30);
    const takerView = projectTarot(state, state.players[state.taker!]!.id);
    assert.equal(takerView.dog.length, 6);
    noLeak(hiddenTarot(state, "Basile"), projectTarot(state, "Basile"));
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { beloteDeck, cardKey, collectCards, sameCard, type Card, type Suit } from "../src/shared/cards";
import {
  applyBelote,
  beats,
  cardPoints,
  createBelote,
  deckPoints,
  hiddenBeloteCards,
  legalPlays,
  projectBelote,
  scoreDeal,
} from "../src/shared/belote/engine";
import { mulberry32 } from "../src/shared/rng";

const c = (r: number, s: Suit): Card => ({ r, s });
const players = [
  { id: "n", nickname: "Noé" },
  { id: "e", nickname: "Emma" },
  { id: "s", nickname: "Sam" },
  { id: "o", nickname: "Omar" },
];

function placedDeck(placed: Record<number, Card>): Card[] {
  const used = new Set(Object.values(placed).map(cardKey));
  const rest = beloteDeck().filter((card) => !used.has(cardKey(card)));
  const deck: Card[] = [];
  let cursor = 0;
  for (let i = 0; i < 32; i += 1) deck.push(placed[i] ?? rest[cursor++]!);
  assert.equal(new Set(deck.map(cardKey)).size, 32);
  return deck;
}

describe("belote : cartes, plis, prise et score", () => {
  it("compte 152 points de cartes et distingue l'atout", () => {
    assert.equal(deckPoints("h", beloteDeck()), 152);
    assert.equal(cardPoints(c(11, "h"), "h"), 20);
    assert.equal(cardPoints(c(11, "h"), "s"), 2);
    assert.equal(cardPoints(c(9, "s"), "s"), 14);
    assert.equal(beats(c(11, "h"), c(14, "h"), "h", "h"), true);
    assert.equal(beats(c(14, "s"), c(10, "s"), "h", "s"), true);
    assert.equal(beats(c(7, "h"), c(14, "s"), "h", "s"), true);
  });

  it("distribue cinq cartes, puis huit après la prise, sans doublon", () => {
    const deck = placedDeck({
      0: c(13, "h"),
      1: c(12, "h"),
      20: c(7, "h"),
    });
    const rng = mulberry32(7);
    let state = createBelote(players, rng, { deck });
    assert.equal(state.players.every((seat) => seat.hand.length === 5), true);
    assert.equal(state.deck.length, 11);
    assert.equal(state.faceUp && cardKey(state.faceUp), "7h");
    const seen = new Set<string>();
    for (const seat of state.players) for (const card of seat.hand) seen.add(cardKey(card));
    seen.add(cardKey(state.faceUp!));
    for (const card of state.deck) seen.add(cardKey(card));
    assert.equal(seen.size, 32);
    const view = projectBelote(state, "n");
    const visible = collectCards(view);
    for (const secret of hiddenBeloteCards(state, "n")) {
      assert.equal(visible.some((card) => sameCard(card, secret)), false);
    }
    state = applyBelote(state, "e", { type: "take" }, rng);
    assert.equal(state.players.every((seat) => seat.hand.length === 8), true);
    assert.equal(state.deck.length, 0);
    assert.equal(state.players[1]!.hand.some((card) => cardKey(card) === "7h"), true);
    assert.equal(state.beloteSeat, 1);
    const during = projectBelote(state, "n");
    const shown = collectCards(during);
    for (const secret of hiddenBeloteCards(state, "n")) {
      assert.equal(shown.some((card) => sameCard(card, secret)), false, cardKey(secret));
    }
    assert.equal(JSON.stringify(during).includes('"deck"'), false);
  });

  it("refuse l'atout de la retournée au second tour et redistribue si tout le monde passe", () => {
    const rng = mulberry32(3);
    let state = createBelote(players, rng);
    const face = state.faceUp!.s;
    state = applyBelote(state, "e", { type: "pass" }, rng);
    state = applyBelote(state, "s", { type: "pass" }, rng);
    state = applyBelote(state, "o", { type: "pass" }, rng);
    state = applyBelote(state, "n", { type: "pass" }, rng);
    assert.equal(state.phase, "bidding2");
    assert.throws(() => applyBelote(state, "e", { type: "take", suit: face }, rng), /autre couleur/);
    let passed = state;
    for (const id of ["e", "s", "o", "n"]) passed = applyBelote(passed, id, { type: "pass" }, rng);
    assert.equal(passed.phase, "bidding1");
    assert.equal(passed.dealer, 1);
    assert.equal(passed.dealNo, 2);
  });

  it("applique fourniture, coupe, surcoupe et défausse", () => {
    const trump = "h" as const;
    assert.deepEqual(
      legalPlays(
        [c(11, "h"), c(7, "h"), c(14, "c")],
        [
          { seat: 0, card: c(14, "s") },
          { seat: 1, card: c(9, "h") },
        ],
        trump,
        2,
      ).map(cardKey),
      ["11h"],
    );
    assert.deepEqual(
      legalPlays(
        [c(7, "h"), c(8, "h"), c(14, "c")],
        [
          { seat: 0, card: c(10, "s") },
          { seat: 1, card: c(11, "h") },
        ],
        trump,
        2,
      ).map(cardKey),
      ["7h", "8h"],
    );
    assert.deepEqual(
      legalPlays([c(7, "h"), c(14, "c")], [{ seat: 0, card: c(14, "s") }], trump, 2).map(cardKey),
      ["7h", "14c"],
    );
    assert.deepEqual(
      legalPlays([c(8, "h"), c(14, "c")], [{ seat: 0, card: c(10, "s") }], trump, 1).map(cardKey),
      ["8h"],
    );
    assert.deepEqual(
      legalPlays(
        [c(14, "s"), c(11, "h")],
        [{ seat: 0, card: c(7, "s") }],
        trump,
        1,
      ).map(cardKey),
      ["14s"],
    );
    assert.deepEqual(
      legalPlays(
        [c(11, "h"), c(7, "h")],
        [{ seat: 0, card: c(10, "h") }],
        trump,
        1,
      ).map(cardKey),
      ["11h"],
    );
  });

  it("marque la réussite, la chute, le capot, le litige et la belote", () => {
    const zeros = [c(7, "c"), c(8, "c"), c(9, "d"), c(8, "d")];
    const success = scoreDeal({
      won: [beloteDeck().filter((card) => !zeros.some((zero) => sameCard(zero, card))), zeros],
      trickCount: [7, 1],
      lastTrickTeam: 0,
      trump: "s",
      beloteTeam: null,
      takerTeam: 0,
      pending: 0,
    });
    assert.equal(success.outcome, "reussi");
    assert.deepEqual(success.awarded, [162, 0]);

    const chute = scoreDeal({
      won: [zeros, beloteDeck().filter((card) => !zeros.some((zero) => sameCard(zero, card)))],
      trickCount: [1, 7],
      lastTrickTeam: 1,
      trump: "s",
      beloteTeam: 0,
      takerTeam: 0,
      pending: 0,
    });
    assert.equal(chute.outcome, "chute");
    assert.deepEqual(chute.awarded, [20, 162]);

    const capot = scoreDeal({
      won: [[], beloteDeck()],
      trickCount: [0, 8],
      lastTrickTeam: 1,
      trump: "h",
      beloteTeam: null,
      takerTeam: 0,
      pending: 0,
    });
    assert.equal(capot.capot, true);
    assert.deepEqual(capot.awarded, [0, 252]);

    const side = [
      ...beloteDeck().filter((card) => card.s === "h" || card.s === "d"),
      c(14, "c"),
    ];
    const other = beloteDeck().filter((card) => !side.some((kept) => sameCard(kept, card)));
    const litige = scoreDeal({
      won: [side, other],
      trickCount: [4, 4],
      lastTrickTeam: 0,
      trump: "s",
      beloteTeam: null,
      takerTeam: 0,
      pending: 0,
    });
    assert.deepEqual(litige.raw, [81, 81]);
    assert.equal(litige.outcome, "litige");
    assert.deepEqual(litige.awarded, [0, 81]);
    assert.equal(litige.pending, 81);
  });

  it("annonce belote et rebelote puis termine une donne jouable", () => {
    const deck = placedDeck({ 0: c(13, "h"), 1: c(12, "h"), 20: c(7, "h") });
    const rng = mulberry32(9);
    let state = createBelote(players, rng, { deck, target: 500 });
    state = applyBelote(state, "e", { type: "take" }, rng);
    let guard = 0;
    while (state.phase === "play" && guard < 40) {
      const id = state.players[state.turn]!.id;
      const view = projectBelote(state, id);
      const hidden = hiddenBeloteCards(state, id);
      for (const secret of hidden) {
        assert.equal(collectCards(view).some((card) => sameCard(card, secret)), false);
      }
      const before = state;
      const illegal = view.you.hand.find((card) => !view.legalCards.some((legal) => sameCard(legal, card)));
      if (illegal) {
        assert.throws(() => applyBelote(before, id, { type: "play", card: illegal }, rng));
      }
      state = applyBelote(state, id, { type: "play", card: view.legalCards[0]! }, rng);
      guard += 1;
    }
    assert.equal(state.phase === "scoring" || state.phase === "match-over", true);
    assert.equal(state.trickCount[0] + state.trickCount[1], 8);
    assert.match(state.log.join("\n"), /Belote/);
    assert.match(state.log.join("\n"), /Rebelote/);
    assert.ok(state.result);
    assert.equal(state.result!.raw[0] + state.result!.raw[1] >= 162, true);
  });
});

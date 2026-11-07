import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlayingCard } from "../src/client/cards";
import { breakChips } from "../src/client/chips";
import { FictionalBanner } from "../src/client/disclaimer";
import { Home } from "../src/client/home";

describe("salon", () => {
  it("rappelle que les dollars n'ont aucune valeur réelle", () => {
    const banner = renderToStaticMarkup(createElement(FictionalBanner));
    assert.match(banner, /Dollars fictifs, sans valeur réelle/);
    assert.match(banner, /Aucun paiement, aucun retrait, aucun gain/);
    const home = renderToStaticMarkup(
      createElement(Home, {
        nickname: "Sylvain",
        setNickname: () => undefined,
        joinCode: "",
        setJoinCode: () => undefined,
        onCreate: () => undefined,
        onJoin: () => undefined,
      }),
    );
    assert.match(home, /sans valeur réelle/);
    assert.match(home, /Texas Hold/);
    assert.match(home, /Belote classique/);
    assert.match(home, /0,05/);
    assert.match(home, /0,25/);
    assert.match(home, /0,50/);
  });

  it("dessine des cartes SVG lisibles et un dos sans le rang", () => {
    const face = renderToStaticMarkup(createElement(PlayingCard, { card: { r: 14, s: "h" } }));
    assert.match(face, /As de cœur/);
    assert.match(face, /<svg/);
    const back = renderToStaticMarkup(createElement(PlayingCard, { hidden: true }));
    assert.equal(back.includes("As"), false);
    assert.match(back, /LF/);
  });

  it("empile les jetons fictifs du plus gros au plus petit", () => {
    assert.deepEqual(breakChips(1000), ["d5", "d5"]);
    assert.deepEqual(breakChips(200), ["d1", "d1"]);
    assert.deepEqual(breakChips(130), ["d1", "c25", "c5"]);
    assert.deepEqual(breakChips(0), []);
  });
});
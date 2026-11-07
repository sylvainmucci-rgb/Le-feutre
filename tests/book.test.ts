import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { duelLabel, mergeBooks, sanitizeBook } from "../src/shared/book";
import { isReaction, isTrinket } from "../src/shared/fun";
import { Classement } from "../src/client/classement";
import { mergeIncoming, palmaresSnapshot, resetPalmares } from "../src/server/palmares";

describe("classement du navigateur", () => {
  it("fusionne par maximum, sans additionner deux fois la même victoire", () => {
    const merged = mergeBooks(
      { ranking: [{ nickname: "Bfreeze", victories: 3 }], duels: [{ left: "Bfreeze", right: "Paulo", leftWins: 3, rightWins: 1 }] },
      { ranking: [{ nickname: "Bfreeze", victories: 2 }, { nickname: "Paulo", victories: 4 }], duels: [{ left: "Paulo", right: "Bfreeze", leftWins: 2, rightWins: 3 }] },
    );
    assert.equal(merged.ranking.find((line) => line.nickname === "Bfreeze")?.victories, 3);
    assert.equal(merged.ranking.find((line) => line.nickname === "Paulo")?.victories, 4);
    assert.equal(merged.duels.length, 1);
    assert.equal(merged.duels[0]?.leftWins, 3);
    assert.equal(merged.duels[0]?.rightWins, 2);
    assert.equal(duelLabel(merged.duels[0]!), "Bfreeze 3-2 Paulo");
    assert.deepEqual(sanitizeBook({ ranking: [{ nickname: "<script>", victories: 1 }], duels: [] }).ranking, []);
    assert.equal(isReaction("😂"), true);
    assert.equal(isReaction("💸"), false);
    assert.equal(isTrinket("canard"), true);
    assert.equal(isTrinket("jeton"), false);
  });

  it("affiche le rang, le pseudo, les victoires et le duel", () => {
    const html = renderToStaticMarkup(
      createElement(Classement, {
        book: {
          ranking: [
            { nickname: "Bfreeze", victories: 5 },
            { nickname: "Paulo", victories: 2 },
          ],
          duels: [{ left: "Bfreeze", right: "Paulo", leftWins: 3, rightWins: 2 }],
        },
      }),
    );
    assert.match(html, /Classement/);
    assert.match(html, /Bfreeze/);
    assert.match(html, /5 victoires/);
    assert.match(html, /Bfreeze 3-2 Paulo/);
    assert.match(html, />1</);
  });

  it("reconstruit le classement serveur depuis le carnet du navigateur", () => {
    resetPalmares();
    mergeIncoming({
      ranking: [{ nickname: "Bfreeze", victories: 3 }],
      duels: [{ left: "Bfreeze", right: "Paulo", leftWins: 3, rightWins: 2 }],
    });
    mergeIncoming({
      ranking: [{ nickname: "Bfreeze", victories: 1 }],
      duels: [{ left: "Bfreeze", right: "Paulo", leftWins: 2, rightWins: 2 }],
    });
    const board = palmaresSnapshot();
    assert.equal(board.ranking[0]?.victories, 3);
    assert.equal(board.duels[0]?.leftWins, 3);
    resetPalmares();
  });
});

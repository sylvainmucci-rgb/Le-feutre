import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sizedRaise } from "../src/client/bet-size";

describe("tailles de relance", () => {
  it("cale le demi-pot, le pot et le tapis entre le minimum et le maximum", () => {
    const base = { pot: 200, toCall: 50, streetBet: 0, minTo: 100, maxTo: 1000 };
    assert.equal(sizedRaise({ ...base, fraction: 0.5 }), 175);
    assert.equal(sizedRaise({ ...base, fraction: 1 }), 300);
    assert.equal(sizedRaise({ ...base, fraction: 4 }), 1000);
    assert.equal(sizedRaise({ ...base, pot: 10, toCall: 0, fraction: 0.5 }), 100);
  });
});

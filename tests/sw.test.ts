import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("service worker", () => {
  const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

  it("versionne le cache par build et prend la main tout de suite", () => {
    assert.match(source, /feutre-__FEUTRE_BUILD__/);
    assert.match(source, /skipWaiting\(\)/);
    assert.match(source, /clients\.claim\(\)/);
    assert.match(source, /client\.navigate\(client\.url\)/);
  });

  it("demande index.html au réseau avant le cache", () => {
    assert.match(source, /cache:\s*"no-store"/);
    assert.match(source, /documentRequest/);
    assert.match(source, /networkFirst/);
  });
});

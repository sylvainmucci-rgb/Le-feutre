import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MIGRATIONS, configureStore, palmaresSnapshot, poolConfig, recordEvent, recordOutcome, resetPalmares, storeMode } from "../src/server/palmares";
import { startServer } from "../src/server/hub";

describe("persistance", () => {
  it("écrit des migrations idempotentes et prépare le SSL Render", () => {
    assert.equal(MIGRATIONS.length, 3);
    for (const statement of MIGRATIONS) assert.match(statement, /CREATE TABLE IF NOT EXISTS/);
    const remote = poolConfig("postgres://user:secret@dpg.frankfurt-postgres.render.com:5432/lefeutre?sslmode=require");
    assert.equal(typeof remote.ssl, "object");
    assert.equal((remote.ssl as { rejectUnauthorized?: boolean }).rejectUnauthorized, false);
    assert.equal(String(remote.connectionString).includes("sslmode"), false);
    const local = poolConfig("postgres://lefeutre:lefeutre@127.0.0.1:5432/lefeutre");
    assert.equal(local.ssl, false);
  });

  it("reste en mémoire sans URL et si Postgres refuse la connexion", async () => {
    assert.equal(await configureStore(undefined, true), "memory");
    assert.equal(storeMode(), "memory");
    resetPalmares();
    recordOutcome(["Sylvain"], ["Camille"]);
    recordEvent({ kind: "rebuy", nickname: "Sylvain", game: "texas-holdem", tableCode: "TEST", detail: "recave 1/3" });
    recordEvent({ kind: "elimination", nickname: "Camille", game: "texas-holdem", tableCode: "TEST", detail: "tapis fictif épuisé" });
    const board = palmaresSnapshot();
    assert.equal(board.ranking[0]?.nickname, "Sylvain");
    assert.equal(board.events.length, 2);
    assert.match(board.note, /mémoire/);
    assert.equal(await configureStore("postgres://127.0.0.1:1/aucune", true), "memory");
    assert.equal(storeMode(), "memory");
  });

  it("expose /api/health", async () => {
    const server = await startServer({ port: 0, botDelayMs: 60_000, continueMs: 60_000, databaseUrl: null });
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api/health`);
      const body = (await response.json()) as { ok: boolean; db: string };
      assert.equal(response.status, 200);
      assert.deepEqual(body, { ok: true, db: "memory" });
    } finally {
      await server.close();
    }
  });
});

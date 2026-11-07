import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WebSocket } from "ws";
import { pushChat, sanitizeChat } from "../src/shared/chat";
import { stakesForBuyIn } from "../src/shared/poker/holdem";
import { ChatLine } from "../src/client/chat";
import { startServer } from "../src/server/hub";

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("délai dépassé")), 4000);
    socket.once("message", (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()) as Record<string, unknown>);
    });
  });
}

async function open(port: number) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  return socket;
}

function stop(socket: WebSocket) {
  return new Promise<void>((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    socket.once("close", () => resolve());
    socket.terminate();
  });
}

describe("chat de table et permissions", () => {
  it("limite le texte, la cadence et l'historique, sans interpréter le HTML", () => {
    const cleaned = sanitizeChat("  bonjour\u0000   <script>alert(1)</script>  ");
    assert.equal(cleaned, "bonjour <script>alert(1)</script>");
    assert.equal([...sanitizeChat("é".repeat(250))].length, 200);
    assert.throws(() => pushChat([], 1_000, { id: "1", playerId: "a", nickname: "A", text: "   " }, 2_000), /vide/);
    const first = pushChat([], 0, { id: "1", playerId: "a", nickname: "A", text: "salut" }, 1_000);
    assert.throws(() => pushChat(first.history, first.lastAt, { id: "2", playerId: "a", nickname: "A", text: "encore" }, 1_200), /vite/);
    let history = first.history;
    let last = first.lastAt;
    for (let i = 0; i < 60; i += 1) {
      const pushed = pushChat(history, last, { id: String(i + 2), playerId: "a", nickname: "A", text: `m${i}` }, last + 800);
      history = pushed.history;
      last = pushed.lastAt;
    }
    assert.equal(history.length, 50);
    const html = renderToStaticMarkup(
      createElement(ChatLine, {
        nickname: 'Ada <img src=x onerror="alert(1)">',
        text: '<script>alert("x")</script>',
        mine: false,
      }),
    );
    assert.match(html, /&lt;script&gt;/);
    assert.equal(html.includes("<script>"), false);
    assert.match(html, /&lt;img/);
  });

  it("isole le chat entre les tables et cache les cartes adverses", async () => {
    const server = await startServer({ port: 0, botDelayMs: 60_000, continueMs: 60_000 });
    const ada = await open(server.port);
    const bea = await open(server.port);
    try {
      const created = nextMessage(ada);
      ada.send(JSON.stringify({ t: "create", game: "texas-holdem", nickname: "Ada" }));
      const welcome = await created;
      assert.equal(welcome.t, "welcome");
      const view = welcome.view as { code: string; chat: { text: string }[] };
      const token = String(welcome.token);
      assert.equal(JSON.stringify(view).includes(token), false);

      const other = nextMessage(bea);
      bea.send(JSON.stringify({ t: "create", game: "belote", nickname: "Bea" }));
      const welcomeB = await other;
      const viewB = welcomeB.view as { code: string; chat: { text: string }[] };
      assert.notEqual(view.code, viewB.code);

      const secret = '<script>table-ada-secrète</script>';
      const afterA = nextMessage(ada);
      ada.send(JSON.stringify({ t: "chat", text: secret }));
      const stateA = await afterA;
      const chatA = (stateA.view as { chat: { text: string }[] }).chat;
      assert.equal(chatA.some((message) => message.text.includes("table-ada-secrète")), true);
      assert.equal(JSON.stringify(stateA).includes(token), false);

      const afterB = nextMessage(bea);
      bea.send(JSON.stringify({ t: "chat", text: "seulement-bea" }));
      const stateB = await afterB;
      const chatB = (stateB.view as { chat: { text: string }[] }).chat;
      assert.equal(chatB.some((message) => message.text.includes("seulement-bea")), true);
      assert.equal(chatB.some((message) => message.text.includes("table-ada")), false);

      const refused = nextMessage(ada);
      ada.send(JSON.stringify({ t: "create", game: "omaha", nickname: "Ada" }));
      const bad = await refused;
      assert.equal(bad.t, "error");

      const filled = nextMessage(ada);
      ada.send(JSON.stringify({ t: "fill-bots" }));
      await filled;
      const started = nextMessage(ada);
      ada.send(JSON.stringify({ t: "start" }));
      const playing = await started;
      const engine = (playing.view as { engine: { you: { hole: unknown[] }; seats: { id: string; hole: unknown }[] }; youId: string })
        .engine;
      const youId = (playing.view as { youId: string }).youId;
      assert.equal(engine.you.hole.length, 2);
      for (const seat of engine.seats) {
        if (seat.id !== youId) assert.equal(seat.hole, null);
      }
      assert.equal(JSON.stringify(playing).includes('"deck"'), false);

      for (const buyIn of [200, 500, 1000] as const) {
        const player = await open(server.port);
        const pending = nextMessage(player);
        player.send(JSON.stringify({ t: "create", game: "texas-holdem", nickname: "Léa", stack: buyIn }));
        const createdTable = await pending;
        assert.equal((createdTable.view as { buyIn: number }).buyIn, buyIn);
        const botAdded = nextMessage(player);
        player.send(JSON.stringify({ t: "add-bot" }));
        await botAdded;
        const hand = nextMessage(player);
        player.send(JSON.stringify({ t: "start" }));
        const startedHand = await hand;
        const live = (
          startedHand.view as {
            engine: { sb: number; bb: number; seats: { stack: number; streetBet: number }[] };
          }
        ).engine;
        const stake = stakesForBuyIn(buyIn);
        assert.equal(live.sb, stake.sb);
        assert.equal(live.bb, stake.bb);
        assert.ok(live.seats.length >= 2);
        for (const seat of live.seats) assert.equal(seat.stack + seat.streetBet, buyIn);
        await stop(player);
      }
    } finally {
      await Promise.all([stop(ada), stop(bea)]);
      await server.close();
    }
  });
});

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { collectCards, sameCard, type Card } from "../shared/cards";
import { CHAT_HISTORY, pushChat, type ChatMessage } from "../shared/chat";
import { isGameId, type GameId } from "../shared/games";
import { mulberry32, type Rng } from "../shared/rng";
import { chooseBeloteAction } from "../shared/belote/bot";
import {
  applyBelote,
  beloteActor,
  continueBelote,
  createBelote,
  hiddenBeloteCards,
  projectBelote,
  type BeloteAction,
  type BeloteState,
  type BeloteView,
} from "../shared/belote/engine";
import { choosePokerAction } from "../shared/poker/bot";
import {
  actorId,
  applyPoker,
  continueHoldem,
  createMatch,
  hiddenHoldemCards,
  projectHoldem,
  stakesForBuyIn,
  type HoldemBuyIn,
  type HoldemState,
  type HoldemView,
  type PokerAction,
} from "../shared/poker/holdem";

export type TableView = {
  code: string;
  game: GameId;
  status: "lobby" | "playing";
  hostId: string;
  youId: string;
  target: number;
  buyIn: HoldemBuyIn | null;
  players: {
    id: string;
    nickname: string;
    isBot: boolean;
    connected: boolean;
    isHost: boolean;
  }[];
  chat: ChatMessage[];
  engine: HoldemView | BeloteView | null;
};

type Seat = {
  id: string;
  token: string;
  nickname: string;
  isBot: boolean;
  connected: boolean;
  lastChat: number;
  socket?: WebSocket;
};

type Table = {
  code: string;
  game: GameId;
  hostId: string;
  players: Seat[];
  engine: HoldemState | BeloteState | null;
  chat: ChatMessage[];
  rng: Rng;
  target: number;
  buyIn: HoldemBuyIn | null;
  lastActivity: number;
  botDelayMs: number;
  continueMs: number;
  botTimer?: ReturnType<typeof setTimeout>;
  continueTimer?: ReturnType<typeof setTimeout>;
  disconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
};

type ClientMsg = {
  t: string;
  game?: string;
  nickname?: string;
  target?: number;
  code?: string;
  token?: string;
  playerId?: string;
  action?: PokerAction | BeloteAction;
  text?: string;
  stack?: number;
};

const tables = new Map<string, Table>();
const sockets = new Map<WebSocket, { table: Table; playerId: string }>();
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_TABLES = 40;
const MAX_MESSAGE = 4096;

function code(): string {
  let value = "";
  for (let i = 0; i < 8; i += 1) value += ALPHABET[randomInt(ALPHABET.length)];
  return tables.has(value) ? code() : value;
}

function cleanNick(input: unknown): string {
  const value = String(input ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (value.length < 2 || value.length > 18) {
    throw new Error("Le pseudonyme doit faire entre 2 et 18 caractères.");
  }
  if (!/^[\p{L}\p{N} '’.-]+$/u.test(value)) {
    throw new Error("Pseudonyme : lettres, chiffres, espaces, apostrophe ou tiret.");
  }
  return value;
}

function limits(game: GameId): { min: number; max: number } {
  return game === "belote" ? { min: 4, max: 4 } : { min: 2, max: 8 };
}

function touch(table: Table) {
  table.lastActivity = Date.now();
}

function send(socket: WebSocket | undefined, payload: unknown) {
  if (socket && socket.readyState === 1) socket.send(JSON.stringify(payload));
}

function assertHidden(view: unknown, hidden: Card[]) {
  const visible = collectCards(view);
  for (const secret of hidden) {
    if (visible.some((card) => sameCard(card, secret))) {
      throw new Error("Refus d'envoyer des cartes cachées.");
    }
  }
}

export function viewFor(table: Table, playerId: string): TableView {
  let engine: HoldemView | BeloteView | null = null;
  if (table.engine?.kind === "texas-holdem") {
    engine = projectHoldem(table.engine, playerId);
    assertHidden(engine, hiddenHoldemCards(table.engine, playerId));
  } else if (table.engine?.kind === "belote") {
    engine = projectBelote(table.engine, playerId);
    assertHidden(engine, hiddenBeloteCards(table.engine, playerId));
  }
  return {
    code: table.code,
    game: table.game,
    status: table.engine ? "playing" : "lobby",
    hostId: table.hostId,
    youId: playerId,
    target: table.target,
    buyIn: table.buyIn,
    players: table.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      isBot: player.isBot,
      connected: player.connected,
      isHost: player.id === table.hostId,
    })),
    chat: table.chat.slice(-CHAT_HISTORY),
    engine,
  };
}

function emit(table: Table) {
  for (const player of table.players) {
    if (!player.socket) continue;
    try {
      send(player.socket, { t: "state", view: viewFor(table, player.id) });
    } catch (error) {
      send(player.socket, {
        t: "error",
        message: error instanceof Error ? error.message : "Vue invalide.",
      });
    }
  }
}

function actor(table: Table): string | null {
  if (!table.engine) return null;
  return table.engine.kind === "texas-holdem" ? actorId(table.engine) : beloteActor(table.engine);
}

function clearBot(table: Table) {
  if (table.botTimer) clearTimeout(table.botTimer);
  table.botTimer = undefined;
}

function clearContinue(table: Table) {
  if (table.continueTimer) clearTimeout(table.continueTimer);
  table.continueTimer = undefined;
}

function decide(table: Table, playerId: string): PokerAction | BeloteAction {
  if (table.engine?.kind === "texas-holdem") {
    const view = projectHoldem(table.engine, playerId);
    const action = choosePokerAction(view);
    if (action.type === "check" && !view.you.legal?.check && view.you.legal?.call !== null) {
      return { type: "call" };
    }
    if (action.type === "check" && !view.you.legal?.check && view.you.legal?.fold) return { type: "fold" };
    return action;
  }
  if (table.engine?.kind === "belote") return chooseBeloteAction(projectBelote(table.engine, playerId));
  throw new Error("Aucune partie.");
}

function apply(table: Table, playerId: string, action: PokerAction | BeloteAction) {
  if (!table.engine) throw new Error("La partie n'a pas commencé.");
  if (table.engine.kind === "texas-holdem") {
    table.engine = applyPoker(table.engine, playerId, action as PokerAction);
  } else {
    table.engine = applyBelote(table.engine, playerId, action as BeloteAction, table.rng);
  }
  touch(table);
}

function schedule(table: Table) {
  clearBot(table);
  clearContinue(table);
  if (!table.engine) return;
  const phase = table.engine.phase;
  if (phase === "between" || phase === "scoring") {
    table.continueTimer = setTimeout(() => {
      try {
        advance(table, false);
        emit(table);
        schedule(table);
      } catch {
        /* la table peut avoir été fermée */
      }
    }, table.continueMs);
    return;
  }
  const id = actor(table);
  if (!id) return;
  const player = table.players.find((seat) => seat.id === id);
  if (!player || (player.connected && !player.isBot)) return;
  table.botTimer = setTimeout(() => {
    table.botTimer = undefined;
    try {
      if (actor(table) !== player.id) return;
      apply(table, player.id, decide(table, player.id));
    } catch {
      try {
        if (table.engine?.kind === "texas-holdem") apply(table, player.id, { type: "fold" });
        else if (table.engine?.kind === "belote") {
          const view = projectBelote(table.engine, player.id);
          const card = view.legalCards[0];
          if (card) apply(table, player.id, { type: "play", card });
          else apply(table, player.id, { type: "pass" });
        }
      } catch {
        /* action de secours impossible */
      }
    }
    emit(table);
    schedule(table);
  }, table.botDelayMs);
}

function advance(table: Table, reset: boolean) {
  if (!table.engine) throw new Error("Aucune donne à enchaîner.");
  if (table.engine.kind === "texas-holdem") table.engine = continueHoldem(table.engine, table.rng, reset);
  else table.engine = continueBelote(table.engine, table.rng);
  touch(table);
}

function welcome(table: Table, player: Seat) {
  send(player.socket, {
    t: "welcome",
    code: table.code,
    token: player.token,
    playerId: player.id,
    view: viewFor(table, player.id),
  });
}

function hostLeft(table: Table) {
  const human = table.players.find((player) => !player.isBot);
  if (human) table.hostId = human.id;
}

export function createTable(input: {
  game: GameId;
  nickname: string;
  target?: number;
  stack?: number;
  botDelayMs: number;
  continueMs: number;
}): { table: Table; player: Seat } {
  if (tables.size >= MAX_TABLES) throw new Error("Le serveur est plein. Réessayez un peu plus tard.");
  const buyIn = input.game === "texas-holdem" ? stakesForBuyIn(input.stack ?? 1000).buyIn : null;
  const player: Seat = {
    id: `p_${randomBytes(4).toString("hex")}`,
    token: randomBytes(24).toString("base64url"),
    nickname: input.nickname,
    isBot: false,
    connected: true,
    lastChat: 0,
  };
  const table: Table = {
    code: code(),
    game: input.game,
    hostId: player.id,
    players: [player],
    engine: null,
    chat: [],
    rng: mulberry32(randomInt(1, 2 ** 30)),
    target: input.game === "belote" ? (input.target === 500 ? 500 : 1000) : 1000,
    buyIn,
    lastActivity: Date.now(),
    botDelayMs: input.botDelayMs,
    continueMs: input.continueMs,
    disconnectTimers: new Map(),
  };
  tables.set(table.code, table);
  return { table, player };
}

function addBot(table: Table) {
  const max = limits(table.game).max;
  if (table.engine) throw new Error("La partie a déjà commencé.");
  if (table.players.length >= max) throw new Error("La table est complète.");
  const n = table.players.filter((player) => player.isBot).length + 1;
  table.players.push({
    id: `b_${randomBytes(3).toString("hex")}`,
    token: "",
    nickname: `Automate ${n}`,
    isBot: true,
    connected: true,
    lastChat: 0,
  });
  touch(table);
}

function removeBot(table: Table, playerId: string) {
  if (table.engine) throw new Error("On ne retire personne pendant la donne.");
  const index = table.players.findIndex((player) => player.id === playerId && player.isBot);
  if (index < 0) throw new Error("Automate introuvable.");
  table.players.splice(index, 1);
  touch(table);
}

function start(table: Table) {
  if (table.engine) throw new Error("La partie est déjà lancée.");
  const rule = limits(table.game);
  if (table.players.length < rule.min) {
    throw new Error(`Il faut ${rule.min} joueurs pour commencer.`);
  }
  const seats = table.players.map((player) => ({
    id: player.id,
    nickname: player.nickname,
    isBot: player.isBot,
  }));
  table.engine =
    table.game === "belote"
      ? createBelote(seats, table.rng, { target: table.target })
      : createMatch(seats, table.rng, { startingStack: table.buyIn ?? 1000 });
  touch(table);
}

function postChat(table: Table, player: Seat, text: string) {
  const result = pushChat(
    table.chat,
    player.lastChat,
    { id: randomBytes(4).toString("hex"), playerId: player.id, nickname: player.nickname, text },
    Date.now(),
  );
  table.chat = result.history;
  player.lastChat = result.lastAt;
  touch(table);
}

function onClose(socket: WebSocket) {
  const bound = sockets.get(socket);
  sockets.delete(socket);
  if (!bound) return;
  const player = bound.table.players.find((seat) => seat.id === bound.playerId);
  if (!player || player.socket !== socket) return;
  player.socket = undefined;
  player.connected = false;
  const timer = setTimeout(() => {
    if (!player.connected && bound.table.engine && actor(bound.table) === player.id) schedule(bound.table);
  }, 30_000);
  bound.table.disconnectTimers.set(player.id, timer);
  emit(bound.table);
}

function handle(table: Table, player: Seat, msg: ClientMsg) {
  if (msg.t === "ping") {
    send(player.socket, { t: "pong" });
    return;
  }
  if (msg.t === "add-bot" || msg.t === "fill-bots" || msg.t === "remove-bot" || msg.t === "start") {
    if (player.id !== table.hostId) throw new Error("Seul l'hôte peut faire ça.");
  }
  if (msg.t === "add-bot") addBot(table);
  else if (msg.t === "fill-bots") {
    const max = limits(table.game).max;
    while (table.players.length < max) addBot(table);
  } else if (msg.t === "remove-bot") {
    if (!msg.playerId) throw new Error("Automate manquant.");
    removeBot(table, msg.playerId);
  } else if (msg.t === "start") start(table);
  else if (msg.t === "action") {
    if (!msg.action || typeof msg.action !== "object") throw new Error("Action manquante.");
    apply(table, player.id, msg.action);
  } else if (msg.t === "continue") {
    advance(table, table.engine?.phase === "match-over");
  } else if (msg.t === "chat") {
    postChat(table, player, String(msg.text ?? ""));
  } else if (msg.t === "leave") {
    leave(table, player);
    return;
  } else throw new Error("Message inconnu.");
  emit(table);
  schedule(table);
}

function leave(table: Table, player: Seat) {
  send(player.socket, { t: "left" });
  if (player.socket) {
    sockets.delete(player.socket);
    player.socket.close();
    player.socket = undefined;
  }
  if (!table.engine) {
    table.players = table.players.filter((seat) => seat.id !== player.id);
    if (table.hostId === player.id) hostLeft(table);
    if (!table.players.some((seat) => !seat.isBot)) {
      tables.delete(table.code);
      return;
    }
    emit(table);
    return;
  }
  player.isBot = true;
  player.connected = false;
  player.token = "";
  if (table.hostId === player.id) hostLeft(table);
  emit(table);
  schedule(table);
}

function bind(socket: WebSocket, table: Table, player: Seat) {
  const previous = player.socket;
  player.socket = socket;
  player.connected = true;
  const pending = table.disconnectTimers.get(player.id);
  if (pending) clearTimeout(pending);
  table.disconnectTimers.delete(player.id);
  if (previous && previous !== socket) previous.close();
  sockets.set(socket, { table, playerId: player.id });
  socket.on("close", () => onClose(socket));
  socket.on("message", (data) => {
    const text = data.toString();
    if (text.length > MAX_MESSAGE) {
      send(socket, { t: "error", message: "Message trop gros." });
      return;
    }
    let msg: ClientMsg;
    try {
      msg = JSON.parse(text) as ClientMsg;
    } catch {
      send(socket, { t: "error", message: "Message illisible." });
      return;
    }
    try {
      handle(table, player, msg);
    } catch (error) {
      send(socket, { t: "error", message: error instanceof Error ? error.message : "Action refusée." });
    }
  });
}

function sweep() {
  const now = Date.now();
  for (const [id, table] of tables) {
    const humans = table.players.filter((player) => !player.isBot);
    const someone = humans.some((player) => player.connected);
    const idle = now - table.lastActivity > 2 * 60 * 60 * 1000;
    const abandoned = !someone && now - table.lastActivity > 15 * 60 * 1000;
    if (idle || abandoned || humans.length === 0) {
      clearBot(table);
      clearContinue(table);
      tables.delete(id);
    }
  }
}

function serveStatic(req: IncomingMessage, res: ServerResponse, url: URL) {
  const root = path.resolve("dist/client");
  const raw = decodeURIComponent(url.pathname);
  const relative = raw === "/" ? "index.html" : raw.replace(/^\/+/, "");
  let file = path.normalize(path.join(root, relative));
  if (!file.startsWith(root)) {
    res.writeHead(400);
    res.end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    res.end("Build manquant. Lancez npm run build.");
    return;
  }
  const ext = path.extname(file);
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json",
  };
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    "content-type": types[ext] ?? "application/octet-stream",
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "x-content-type-options": "nosniff",
    "content-security-policy":
      "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self'; script-src 'self'; manifest-src 'self'",
  });
  fs.createReadStream(file).pipe(res);
}

export async function startServer(options?: { port?: number; botDelayMs?: number; continueMs?: number; dev?: boolean }) {
  const port = options?.port ?? (Number(process.env.PORT) || 47231);
  const botDelayMs = options?.botDelayMs ?? 700;
  const continueMs = options?.continueMs ?? 8000;
  let vite: { close: () => Promise<void>; middlewares: (req: IncomingMessage, res: ServerResponse, next: () => void) => void } | null =
    null;
  if (options?.dev) {
    const imported = await import("vite");
    vite = await imported.createServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
  }
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end("ok");
      return;
    }
    if (vite) {
      vite.middlewares(req, res, () => {
        res.statusCode = 404;
        res.end("introuvable");
      });
      return;
    }
    serveStatic(req, res, url);
  });
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: MAX_MESSAGE });
  const beat = setInterval(() => {
    for (const client of wss.clients) {
      const socket = client as WebSocket & { isAlive?: boolean };
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 25_000);
  const cleaner = setInterval(sweep, 60_000);
  wss.on("connection", (socket) => {
    const alive = socket as WebSocket & { isAlive?: boolean };
    alive.isAlive = true;
    socket.on("pong", () => {
      alive.isAlive = true;
    });
    socket.on("message", (data) => {
      if (sockets.has(socket)) return;
      const text = data.toString();
      if (text.length > MAX_MESSAGE) {
        send(socket, { t: "error", message: "Message trop gros." });
        return;
      }
      let msg: ClientMsg;
      try {
        msg = JSON.parse(text) as ClientMsg;
      } catch {
        send(socket, { t: "error", message: "Message illisible." });
        return;
      }
      try {
        if (msg.t === "create") {
          if (!isGameId(msg.game)) throw new Error("Ce jeu n'est pas disponible.");
          const nick = cleanNick(msg.nickname);
          const { table, player } = createTable({
            game: msg.game,
            nickname: nick,
            target: msg.target,
            stack: msg.stack,
            botDelayMs,
            continueMs,
          });
          bind(socket, table, player);
          welcome(table, player);
          return;
        }
        if (msg.t === "join") {
          const table = tables.get(String(msg.code || "").toUpperCase());
          if (!table) throw new Error("Table introuvable. Vérifiez le code.");
          if (table.engine) throw new Error("La partie a déjà commencé.");
          if (table.players.length >= limits(table.game).max) throw new Error("La table est complète.");
          const player: Seat = {
            id: `p_${randomBytes(4).toString("hex")}`,
            token: randomBytes(24).toString("base64url"),
            nickname: cleanNick(msg.nickname),
            isBot: false,
            connected: true,
            lastChat: 0,
          };
          table.players.push(player);
          bind(socket, table, player);
          welcome(table, player);
          emit(table);
          return;
        }
        if (msg.t === "reconnect") {
          const table = tables.get(String(msg.code || "").toUpperCase());
          const player = table?.players.find((seat) => seat.token && seat.token === msg.token);
          if (!table || !player) throw new Error("Reprise impossible. Le jeton ou la table n'existe plus.");
          bind(socket, table, player);
          welcome(table, player);
          emit(table);
          schedule(table);
          return;
        }
        throw new Error("Rejoignez ou créez une table d'abord.");
      } catch (error) {
        send(socket, {
          t: "error",
          fatal: true,
          message: error instanceof Error ? error.message : "Connexion refusée.",
        });
      }
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(port, "0.0.0.0", () => resolve());
  });
  const address = server.address();
  const actual = typeof address === "object" && address ? address.port : port;
  return {
    port: actual,
    close: async () => {
      clearInterval(beat);
      clearInterval(cleaner);
      for (const table of tables.values()) {
        clearBot(table);
        clearContinue(table);
      }
      tables.clear();
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => {
        wss.close(() => resolve());
      });
      server.closeAllConnections?.();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await vite?.close();
      if (server.listening) {
        throw new Error("Le serveur HTTP écoute encore après la fermeture.");
      }
    },
  };
}

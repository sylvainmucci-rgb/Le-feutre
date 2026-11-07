import { Pool, type PoolConfig } from "pg";
import { mergeBooks, sanitizeBook, type Book } from "../shared/book";

/**
 * Palmarès, duels, recaves et éliminations.
 * Postgres si DATABASE_URL répond, sinon la mémoire du processus.
 * Aucun gain réel : ce sont des parties entre amis.
 */

export type Duel = { left: string; right: string; leftWins: number; rightWins: number };
export type StoreMode = "postgres" | "memory";
export type TableEvent = {
  kind: "rebuy" | "elimination";
  nickname: string;
  game: string;
  tableCode: string;
  detail: string;
};

export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS feutre_ranking (
    nickname TEXT PRIMARY KEY,
    victories INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS feutre_duel (
    left_name TEXT NOT NULL,
    right_name TEXT NOT NULL,
    left_wins INTEGER NOT NULL DEFAULT 0,
    right_wins INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (left_name, right_name)
  )`,
  `CREATE TABLE IF NOT EXISTS feutre_event (
    id BIGSERIAL PRIMARY KEY,
    kind TEXT NOT NULL,
    nickname TEXT NOT NULL,
    game TEXT NOT NULL,
    table_code TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
];

const wins = new Map<string, number>();
const duels = new Map<string, Duel>();
const events: TableEvent[] = [];

let mode: StoreMode = "memory";
let pool: Pool | null = null;
let configured = false;

function key(a: string, b: string): [string, string, string] {
  return a < b ? [a, b, `${a}|${b}`] : [b, a, `${b}|${a}`];
}

export function storeMode(): StoreMode {
  return mode;
}

/** SSL pour Render : le certificat de la plateforme n'est pas dans le magasin par défaut. */
export function poolConfig(raw: string): PoolConfig {
  const local = /\/\/(?:[^@/]+@)?(localhost|127\.0\.0\.1)(?::|\/|$)/.test(raw);
  if (local) {
    return { connectionString: raw, ssl: false, connectionTimeoutMillis: 4000, max: 4 };
  }
  const url = new URL(raw);
  url.searchParams.delete("sslmode");
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 4000,
    max: 4,
  };
}

async function migrate(target: Pool) {
  for (const statement of MIGRATIONS) await target.query(statement);
}

async function hydrate(target: Pool) {
  const ranking = await target.query<{ nickname: string; victories: number }>("SELECT nickname, victories FROM feutre_ranking");
  wins.clear();
  for (const row of ranking.rows) wins.set(row.nickname, Number(row.victories));
  const pairs = await target.query<{ left_name: string; right_name: string; left_wins: number; right_wins: number }>(
    "SELECT left_name, right_name, left_wins, right_wins FROM feutre_duel",
  );
  duels.clear();
  for (const row of pairs.rows) {
    const duel = {
      left: row.left_name,
      right: row.right_name,
      leftWins: Number(row.left_wins),
      rightWins: Number(row.right_wins),
    };
    duels.set(`${duel.left}|${duel.right}`, duel);
  }
  const recent = await target.query<{ kind: string; nickname: string; game: string; table_code: string; detail: string }>(
    "SELECT kind, nickname, game, table_code, detail FROM feutre_event ORDER BY id DESC LIMIT 40",
  );
  events.length = 0;
  for (const row of recent.rows.reverse()) {
    if (row.kind !== "rebuy" && row.kind !== "elimination") continue;
    events.push({ kind: row.kind, nickname: row.nickname, game: row.game, tableCode: row.table_code, detail: row.detail });
  }
}

function dropPool() {
  const current = pool;
  pool = null;
  mode = "memory";
  if (current) void current.end().catch(() => undefined);
}

async function safeQuery(text: string, values: unknown[]) {
  if (!pool || mode !== "postgres") return;
  try {
    await pool.query(text, values);
  } catch (error) {
    console.error("Postgres indisponible, repli sur la mémoire.", error instanceof Error ? error.message : error);
    dropPool();
  }
}

export async function configureStore(url?: string, force = false): Promise<StoreMode> {
  if (configured && !force) return mode;
  if (pool) {
    const previous = pool;
    pool = null;
    await previous.end().catch(() => undefined);
  }
  configured = true;
  if (!url) {
    mode = "memory";
    return mode;
  }
  const next = new Pool(poolConfig(url));
  try {
    await next.query("SELECT 1");
    await migrate(next);
    pool = next;
    mode = "postgres";
    await hydrate(next);
    return mode;
  } catch (error) {
    console.error("DATABASE_URL injoignable, palmarès en mémoire.", error instanceof Error ? error.message : error);
    await next.end().catch(() => undefined);
    mode = "memory";
    return mode;
  }
}

export function recordOutcome(winners: string[], losers: string[]) {
  const uniqueWinners = [...new Set(winners)];
  const uniqueLosers = [...new Set(losers)].filter((name) => !uniqueWinners.includes(name));
  for (const name of uniqueWinners) {
    wins.set(name, (wins.get(name) ?? 0) + 1);
    void safeQuery(
      `INSERT INTO feutre_ranking (nickname, victories) VALUES ($1, 1)
       ON CONFLICT (nickname) DO UPDATE SET victories = feutre_ranking.victories + 1`,
      [name],
    );
  }
  for (const winner of uniqueWinners) {
    for (const loser of uniqueLosers) {
      const [left, right, id] = key(winner, loser);
      const duel = duels.get(id) ?? { left, right, leftWins: 0, rightWins: 0 };
      const leftDelta = winner === left ? 1 : 0;
      const rightDelta = winner === right ? 1 : 0;
      duel.leftWins += leftDelta;
      duel.rightWins += rightDelta;
      duels.set(id, duel);
      void safeQuery(
        `INSERT INTO feutre_duel (left_name, right_name, left_wins, right_wins) VALUES ($1, $2, $3, $4)
         ON CONFLICT (left_name, right_name) DO UPDATE
         SET left_wins = feutre_duel.left_wins + EXCLUDED.left_wins,
             right_wins = feutre_duel.right_wins + EXCLUDED.right_wins`,
        [left, right, leftDelta, rightDelta],
      );
    }
  }
}

export function recordEvent(event: TableEvent) {
  events.push(event);
  if (events.length > 40) events.shift();
  void safeQuery(
    `INSERT INTO feutre_event (kind, nickname, game, table_code, detail) VALUES ($1, $2, $3, $4, $5)`,
    [event.kind, event.nickname, event.game, event.tableCode, event.detail],
  );
}

export function currentBook(): Book {
  return {
    ranking: [...wins.entries()].map(([nickname, victories]) => ({ nickname, victories })),
    duels: [...duels.values()],
  };
}

/** Reconstruit le classement avec le carnet d'un navigateur. On prend le maximum, pas la somme. */
export function mergeIncoming(value: unknown) {
  const merged = mergeBooks(currentBook(), sanitizeBook(value));
  wins.clear();
  for (const line of merged.ranking) wins.set(line.nickname, line.victories);
  duels.clear();
  for (const duel of merged.duels) duels.set(`${duel.left}|${duel.right}`, { ...duel });
  for (const line of merged.ranking) {
    void safeQuery(
      `INSERT INTO feutre_ranking (nickname, victories) VALUES ($1, $2)
       ON CONFLICT (nickname) DO UPDATE SET victories = GREATEST(feutre_ranking.victories, EXCLUDED.victories)`,
      [line.nickname, line.victories],
    );
  }
  for (const duel of merged.duels) {
    void safeQuery(
      `INSERT INTO feutre_duel (left_name, right_name, left_wins, right_wins) VALUES ($1, $2, $3, $4)
       ON CONFLICT (left_name, right_name) DO UPDATE
       SET left_wins = GREATEST(feutre_duel.left_wins, EXCLUDED.left_wins),
           right_wins = GREATEST(feutre_duel.right_wins, EXCLUDED.right_wins)`,
      [duel.left, duel.right, duel.leftWins, duel.rightWins],
    );
  }
}

export function palmaresSnapshot() {
  return {
    note:
      mode === "postgres"
        ? "Palmarès, duels, recaves et éliminations sont gardés dans Postgres. Aucun gain réel."
        : "Classement gardé dans chaque navigateur et remis en mémoire à la table. DATABASE_URL absente ou injoignable. Aucun gain réel.",
    ranking: [...wins.entries()]
      .map(([nickname, victories]) => ({ nickname, victories }))
      .sort((a, b) => b.victories - a.victories || a.nickname.localeCompare(b.nickname, "fr"))
      .slice(0, 12),
    duels: [...duels.values()].slice(-24).reverse(),
    events: events.slice(-20).reverse(),
  };
}

type LooseEngine = {
  kind: string;
  phase: string;
  players: { nickname: string; stack?: number; score?: number; carton?: boolean; chips?: number; rebuys?: number; out?: boolean }[];
  scores?: number[] | [number, number];
};

export function winnersFrom(engine: LooseEngine): { winners: string[]; losers: string[] } | null {
  if (engine.phase !== "match-over") return null;
  const names = engine.players.map((seat) => seat.nickname);
  if (engine.kind === "texas-holdem" || engine.kind === "omaha" || engine.kind === "stud" || engine.kind === "draw") {
    const winners = engine.players.filter((seat) => (seat.stack ?? 0) > 0).map((seat) => seat.nickname);
    return { winners, losers: names.filter((name) => !winners.includes(name)) };
  }
  if (engine.kind === "belote" || engine.kind === "coinche" || engine.kind === "manille" || engine.kind === "ecarte") {
    const scores = engine.scores ?? [0, 0];
    if (scores[0] === scores[1]) return { winners: [], losers: [] };
    const team = (scores[0] ?? 0) > (scores[1] ?? 0) ? 0 : 1;
    const winners = engine.players.filter((_, index) => index % 2 === team).map((seat) => seat.nickname);
    return { winners, losers: names.filter((name) => !winners.includes(name)) };
  }
  if (engine.kind === "loto") {
    const winners = engine.players.filter((seat) => seat.carton).map((seat) => seat.nickname);
    return { winners, losers: names.filter((name) => !winners.includes(name)) };
  }
  let best = -Infinity;
  const winners: string[] = [];
  engine.players.forEach((seat) => {
    const score = seat.score ?? seat.chips ?? 0;
    if (score > best) {
      best = score;
      winners.length = 0;
      winners.push(seat.nickname);
    } else if (score === best) winners.push(seat.nickname);
  });
  return { winners, losers: names.filter((name) => !winners.includes(name)) };
}

export type BankSeat = { nickname: string; rebuys: number; out: boolean; stack: number };

export function bankrollOf(engine: LooseEngine): BankSeat[] | null {
  if (!engine.players.every((seat) => typeof seat.rebuys === "number" && typeof seat.stack === "number")) return null;
  return engine.players.map((seat) => ({
    nickname: seat.nickname,
    rebuys: seat.rebuys ?? 0,
    out: Boolean(seat.out),
    stack: seat.stack ?? 0,
  }));
}

export function resetPalmares() {
  wins.clear();
  duels.clear();
  events.length = 0;
}

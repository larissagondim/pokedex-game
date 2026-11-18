import { createHash } from "node:crypto";
import { Pool } from "pg";
import { HISTORY_MAX, type HistoryEntry, type RemoteSave, sanitizeSave, type TamaSave } from "@/lib/tamaSync";

/**
 * Tamagotchi saves in Postgres (server only). One row per sync code, plus the
 * party's milestones. Without DATABASE_URL there is no database and the app
 * keeps everything in localStorage.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tamagotchi_saves (
  code_hash  text PRIMARY KEY,
  pets       jsonb NOT NULL,
  coins      integer NOT NULL,
  revision   integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tamagotchi_events (
  id        bigserial PRIMARY KEY,
  code_hash text NOT NULL REFERENCES tamagotchi_saves (code_hash) ON DELETE CASCADE,
  at        bigint NOT NULL,
  kind      text NOT NULL,
  dex_id    integer,
  detail    integer
);
CREATE INDEX IF NOT EXISTS tamagotchi_events_latest ON tamagotchi_events (code_hash, at DESC, id DESC);
ALTER TABLE tamagotchi_saves ADD COLUMN IF NOT EXISTS progress jsonb;
`;

interface Db {
  pool: Pool;
  ready: Promise<unknown> | null;
}

// One pool per server process (kept across hot reloads in development).
const globals = globalThis as typeof globalThis & { __tamaDb?: Db };

export const hasDatabase = () => Boolean(process.env.DATABASE_URL);

async function pool(): Promise<Pool> {
  const db = (globals.__tamaDb ??= {
    pool: new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 3000 }),
    ready: null,
  });
  db.ready ??= db.pool.query(SCHEMA);
  try {
    await db.ready;
  } catch (error) {
    db.ready = null; // database not up yet: try again on the next request
    throw error;
  }
  return db.pool;
}

/** Only a hash of the sync code is stored, so the table doesn't hold usable codes. */
const hashOf = (code: string) => createHash("sha256").update(code).digest("hex");

interface SaveRow {
  pets: unknown;
  coins: number;
  progress: unknown;
  revision: number;
  updated_at: string;
}

interface EventRow {
  at: string;
  kind: HistoryEntry["kind"];
  dex_id: number | null;
  detail: number | null;
}

export interface Snapshot {
  /** Null when nothing was saved under this code yet. */
  save: RemoteSave | null;
  /** The latest milestones, newest first. */
  history: HistoryEntry[];
}

export async function readSnapshot(code: string): Promise<Snapshot> {
  const db = await pool();
  const hash = hashOf(code);
  const [saves, events] = await Promise.all([
    db.query<SaveRow>(
      "SELECT pets, coins, progress, revision, (extract(epoch FROM updated_at) * 1000)::bigint AS updated_at FROM tamagotchi_saves WHERE code_hash = $1",
      [hash],
    ),
    db.query<EventRow>("SELECT at, kind, dex_id, detail FROM tamagotchi_events WHERE code_hash = $1 ORDER BY at DESC, id DESC LIMIT $2", [
      hash,
      HISTORY_MAX,
    ]),
  ]);
  const row = saves.rows[0];
  const save = row && sanitizeSave({ pets: row.pets, coins: row.coins, progress: row.progress ?? undefined });
  return {
    save: row && save ? { ...save, revision: row.revision, updatedAt: Number(row.updated_at) } : null,
    history: events.rows.map((e) => ({ at: Number(e.at), kind: e.kind, dexId: e.dex_id, detail: e.detail })),
  };
}

/**
 * Stores the save if it was based on the server's current revision (0: there
 * must be no save yet) and records the milestones. Returns the new revision,
 * or null when another device wrote first.
 */
export async function writeSave(code: string, save: TamaSave, baseRevision: number, events: readonly HistoryEntry[]): Promise<number | null> {
  const client = await (await pool()).connect();
  const hash = hashOf(code);
  const pets = JSON.stringify(save.pets);
  // A save without progress (an older client) keeps the stored one.
  const progress = save.progress ? JSON.stringify(save.progress) : null;
  try {
    await client.query("BEGIN");
    const written =
      baseRevision === 0
        ? await client.query<{ revision: number }>(
            "INSERT INTO tamagotchi_saves (code_hash, pets, coins, progress) VALUES ($1, $2, $3, $4) ON CONFLICT (code_hash) DO NOTHING RETURNING revision",
            [hash, pets, save.coins, progress],
          )
        : await client.query<{ revision: number }>(
            "UPDATE tamagotchi_saves SET pets = $2, coins = $3, progress = COALESCE($5::jsonb, progress), revision = revision + 1, updated_at = now() WHERE code_hash = $1 AND revision = $4 RETURNING revision",
            [hash, pets, save.coins, baseRevision, progress],
          );
    const revision = written.rows[0]?.revision ?? null;
    if (revision !== null && events.length > 0) {
      await client.query(
        "INSERT INTO tamagotchi_events (code_hash, at, kind, dex_id, detail) SELECT $1::text, * FROM unnest($2::bigint[], $3::text[], $4::integer[], $5::integer[])",
        [hash, events.map((e) => Math.round(e.at)), events.map((e) => e.kind), events.map((e) => e.dexId), events.map((e) => e.detail)],
      );
    }
    await client.query("COMMIT");
    return revision;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

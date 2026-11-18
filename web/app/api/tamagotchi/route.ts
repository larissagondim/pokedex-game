import { hasDatabase, readSnapshot, writeSave } from "@/lib/server/tamaDb";
import { HISTORY_BATCH, normalizeSyncCode, sanitizeHistory, sanitizeSave, SYNC_CODE_HEADER } from "@/lib/tamaSync";

/**
 * Tamagotchi sync. The save is picked by the sync code in the `X-Sync-Code` header.
 *
 *   GET → { save: { pets, coins, progress?, revision, updatedAt } | null, history }
 *   PUT { pets, coins, progress?, revision, events } → { revision, history }
 *       409 + the server's { save, history } if `revision` is no longer the latest
 *
 * 503 when there is no database (DATABASE_URL unset) or it can't be reached:
 * the app then stays on localStorage.
 */

/** A full party is under 2 KB and a full Pokédex about 10 KB; this leaves room for a batch of events. */
const MAX_BODY = 48_000;

const error = (status: number, code: string) => Response.json({ error: code }, { status });

function codeOf(request: Request): string | Response {
  if (!hasDatabase()) return error(503, "no-database");
  return normalizeSyncCode(request.headers.get(SYNC_CODE_HEADER)) ?? error(400, "bad-code");
}

export async function GET(request: Request) {
  const code = codeOf(request);
  if (typeof code !== "string") return code;
  try {
    return Response.json(await readSnapshot(code));
  } catch {
    return error(503, "database-unavailable");
  }
}

export async function PUT(request: Request) {
  const code = codeOf(request);
  if (typeof code !== "string") return code;

  const text = await request.text();
  if (text.length > MAX_BODY) return error(413, "too-large");
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return error(400, "bad-json");
  }
  const save = sanitizeSave(body);
  const revision = body?.revision;
  if (!save || typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) return error(400, "bad-save");
  const events = sanitizeHistory(body.events, HISTORY_BATCH);

  try {
    const written = await writeSave(code, save, revision, events);
    const snapshot = await readSnapshot(code);
    if (written === null) return Response.json(snapshot, { status: 409 });
    return Response.json({ revision: written, history: snapshot.history });
  } catch {
    return error(503, "database-unavailable");
  }
}

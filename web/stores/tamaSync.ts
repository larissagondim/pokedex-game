import { create } from "zustand";
import {
  addHistory,
  diffHistory,
  HISTORY_BATCH,
  type HistoryEntry,
  mergeProgress,
  newSyncCode,
  nextSyncStep,
  normalizeSyncCode,
  type RemoteSave,
  sanitizeHistory,
  sameProgress,
  sanitizeSave,
  SYNC_CODE_HEADER,
  type SyncedProgress,
} from "@/lib/tamaSync";
import { useDaily } from "./daily";
import { useDexProgress } from "./dexProgress";
import { useInventory } from "./inventory";
import { useLeague } from "./league";
import { useTamagotchi } from "./tamagotchi";

const STORAGE_KEY = "pokedex-game:tama-sync";
const API_URL = "/api/tamagotchi";
/** Wait this long after a change before sending (a burst of actions is one write). */
const PUSH_DELAY_MS = 1200;
/** How often to ask the server for another device's progress. */
const PULL_MS = 60_000;
/** Milestones waiting to be sent while there's no server; older ones are dropped. */
const PENDING_MAX = 200;

export type SyncStatus =
  /** Not asked yet. */
  | "starting"
  /** This server has no database: the save stays on this device. */
  | "off"
  /** The server can't be reached right now; retried later. */
  | "offline"
  | "syncing"
  | "synced";

export type LinkResult = "linked" | "same" | "bad-code" | "not-found" | "unavailable";

interface Saved {
  code: string;
  /** Server revision the local save is based on (0: never synced). */
  revision: number;
  /** Local changes the server hasn't accepted yet. */
  dirty: boolean;
  history: HistoryEntry[];
  /** Milestones not sent yet, oldest first. */
  pending: HistoryEntry[];
}

interface SyncState {
  /** This device's sync code; type it on another device to share the party. */
  code: string;
  status: SyncStatus;
  /** The party's latest milestones, newest first. */
  history: HistoryEntry[];
  /** Starts syncing; returns the function that stops it. */
  start: () => () => void;
  /** Switches to another device's code and takes its save (this device's party is replaced). */
  link: (input: string) => Promise<LinkResult>;
}

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Saved> | null;
    const code = normalizeSyncCode(saved?.code);
    if (saved && code) {
      return {
        code,
        revision: Number.isInteger(saved.revision) && saved.revision! > 0 ? saved.revision! : 0,
        dirty: saved.dirty !== false,
        history: sanitizeHistory(saved.history),
        pending: sanitizeHistory(saved.pending, PENDING_MAX),
      };
    }
  } catch {
    // No storage or bad data: start with a new code.
  }
  return { code: newSyncCode(), revision: 0, dirty: true, history: [], pending: [] };
}

interface Snapshot {
  save: RemoteSave | null;
  history: HistoryEntry[];
}

/** The server's reply, checked like any other outside data. */
function snapshotOf(body: unknown): Snapshot {
  const b = (body && typeof body === "object" ? body : {}) as { save?: { revision?: unknown; updatedAt?: unknown }; history?: unknown };
  const save = sanitizeSave(b.save);
  const revision = b.save?.revision;
  return {
    save: save && typeof revision === "number" && revision > 0 ? { ...save, revision, updatedAt: Number(b.save?.updatedAt) || 0 } : null,
    history: sanitizeHistory(b.history),
  };
}

const sorted = (ids: ReadonlySet<number>) => [...ids].sort((a, b) => a - b);

/** This device's progress, as it is synced. */
function localProgress(): SyncedProgress {
  const { seen, caught } = useDexProgress.getState();
  return {
    seen: sorted(seen),
    caught: sorted(caught),
    league: useLeague.getState().beaten,
    items: { ...useInventory.getState().items },
    dailyWon: useDaily.getState().lastWon,
  };
}

function applyProgress(p: SyncedProgress) {
  useDexProgress.getState().replace(p);
  useLeague.getState().replace(p.league);
  useInventory.getState().replace(p.items);
  useDaily.getState().replace(p.dailyWon);
}

/**
 * Keeps the Tamagotchi save in step with the server (Postgres) so the same
 * party shows up on every device using this sync code, and records the party's
 * milestones. Everything still works from localStorage without a server.
 */
export const useTamaSync = create<SyncState>((set, get) => {
  const initial: Saved = typeof window === "undefined" ? { code: "", revision: 0, dirty: false, history: [], pending: [] } : load();
  let { revision, dirty, pending } = initial;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** True while a save from the server is being applied (those changes aren't the player's). */
  let applying = false;
  /** Bumped on every progress change, so one made during a write isn't lost. */
  let progressChanges = 0;
  /** Requests run one at a time, in order. */
  let queue: Promise<unknown> = Promise.resolve();

  const persist = () => {
    try {
      const saved: Saved = { code: get().code, revision, dirty, history: get().history, pending };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Storage unavailable: the code lasts for this session only.
    }
  };

  const run = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task, task);
    queue = result.catch(() => {});
    return result;
  };

  const request = async (code: string, body?: object): Promise<Response | null> => {
    try {
      return await fetch(API_URL, {
        method: body ? "PUT" : "GET",
        headers: { [SYNC_CODE_HEADER]: code, ...(body && { "Content-Type": "application/json" }) },
        body: body && JSON.stringify(body),
        cache: "no-store",
      });
    } catch {
      return null;
    }
  };

  /** No usable answer: "off" if the server says it has no database, else try again later. */
  const failed = async (res: Response | null) => {
    const reason = res?.status === 503 ? ((await res.json().catch(() => null)) as { error?: string } | null)?.error : null;
    set({ status: reason === "no-database" ? "off" : "offline" });
  };

  const adopt = ({ save, history }: Snapshot & { save: RemoteSave }) => {
    applying = true;
    let merged: SyncedProgress;
    try {
      useTamagotchi.getState().replace(save);
      // Progress only moves forward: keep what this device earned too.
      merged = save.progress ? mergeProgress(localProgress(), save.progress) : localProgress();
      applyProgress(merged);
    } finally {
      applying = false;
    }
    revision = save.revision;
    pending = [];
    // Send the merged progress back if the server didn't have all of it.
    dirty = !sameProgress(merged, save.progress);
    set({ history, status: dirty ? "syncing" : "synced" });
    persist();
    if (dirty) schedule();
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void run(push);
    }, PUSH_DELAY_MS);
  };

  const push = async () => {
    const { pets, coins, changes } = useTamagotchi.getState();
    const progressAt = progressChanges;
    const events = pending.slice(0, HISTORY_BATCH);
    set({ status: "syncing" });
    const res = await request(get().code, { pets, coins, progress: localProgress(), revision, events });
    if (res?.status === 409) {
      const snapshot = snapshotOf(await res.json().catch(() => null));
      if (snapshot.save) return adopt({ ...snapshot, save: snapshot.save });
      revision = 0; // the server lost this save: write it again from scratch
      persist();
      return schedule();
    }
    if (!res?.ok) return failed(res);
    const body = (await res.json().catch(() => null)) as { revision?: unknown; history?: unknown } | null;
    if (typeof body?.revision !== "number") return failed(null);
    revision = body.revision;
    pending = pending.slice(events.length);
    dirty = pending.length > 0 || useTamagotchi.getState().changes !== changes || progressChanges !== progressAt;
    set({ history: addHistory(sanitizeHistory(body.history), pending), status: dirty ? "syncing" : "synced" });
    persist();
    if (dirty) schedule();
  };

  /** Asks the server for its copy, then takes it, sends ours, or does nothing. */
  const sync = async () => {
    if (get().status === "off") return;
    const res = await request(get().code);
    if (!res?.ok) return failed(res);
    const snapshot = snapshotOf(await res.json().catch(() => null));
    const step = nextSyncStep(revision, dirty, snapshot.save?.revision ?? null);
    // In step but with different progress (e.g. earned before it was synced): merge it.
    const progressDiffers = step === "idle" && snapshot.save && !sameProgress(localProgress(), snapshot.save.progress);
    if ((step === "adopt" || progressDiffers) && snapshot.save) adopt({ ...snapshot, save: snapshot.save });
    else if (step === "push") await push();
    else set({ status: "synced" });
  };

  return {
    code: initial.code,
    status: "starting",
    history: initial.history,

    start: () => {
      const offStore = useTamagotchi.subscribe((s, prev) => {
        if (s.changes === prev.changes) return;
        const entries = diffHistory(prev.pets, s.pets, Date.now());
        pending = [...pending, ...entries].slice(-PENDING_MAX);
        dirty = true;
        if (entries.length > 0) set({ history: addHistory(get().history, entries) });
        persist();
        if (get().status !== "off") schedule();
      });
      // The Pokédex, the league, the shop items and the daily challenge travel with the party.
      const progressChanged = () => {
        if (applying) return;
        progressChanges++;
        dirty = true;
        persist();
        if (get().status !== "off") schedule();
      };
      const offProgress = [
        useDexProgress.subscribe((s, prev) => s.caught !== prev.caught || s.seen !== prev.seen ? progressChanged() : undefined),
        useLeague.subscribe((s, prev) => (s.beaten !== prev.beaten ? progressChanged() : undefined)),
        useInventory.subscribe((s, prev) => (s.items !== prev.items ? progressChanged() : undefined)),
        useDaily.subscribe((s, prev) => (s.lastWon !== prev.lastWon ? progressChanged() : undefined)),
      ];
      const pull = () => {
        if (document.visibilityState === "visible" && !timer) void run(sync);
      };
      document.addEventListener("visibilitychange", pull);
      const interval = setInterval(pull, PULL_MS);
      pull();
      return () => {
        offStore();
        offProgress.forEach((off) => off());
        document.removeEventListener("visibilitychange", pull);
        clearInterval(interval);
        if (timer) clearTimeout(timer);
        timer = null;
      };
    },

    link: (input) => {
      const code = normalizeSyncCode(input);
      if (!code) return Promise.resolve("bad-code");
      if (code === get().code) return Promise.resolve("same");
      return run(async (): Promise<LinkResult> => {
        const res = await request(code);
        if (!res?.ok) return "unavailable";
        const snapshot = snapshotOf(await res.json().catch(() => null));
        if (!snapshot.save) return "not-found";
        if (timer) clearTimeout(timer);
        timer = null;
        set({ code });
        adopt({ ...snapshot, save: snapshot.save });
        return "linked";
      });
    },
  };
});

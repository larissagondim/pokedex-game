import { create } from "zustand";
import { capture, type DexProgress, EMPTY_PROGRESS, sanitizeProgress, see, serializeProgress } from "@/lib/dexProgress";
import { useBattleLog } from "./battleLog";
import { useTamagotchi } from "./tamagotchi";

const STORAGE_KEY = "pokedex-game:dex-progress";

const partyIds = () => useTamagotchi.getState().pets.flatMap((p) => (p.dexId === null ? [] : [p.dexId]));

/**
 * Saved progress, or (first run with this feature) one rebuilt from what the
 * player already did: foes in the battle history are seen, the ones beaten
 * caught, and the Tamagotchi party is caught.
 */
function load(): DexProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) return sanitizeProgress(JSON.parse(raw));
  } catch {
    // No storage or bad data: rebuild below.
  }
  const log = useBattleLog.getState().log;
  let p = see(EMPTY_PROGRESS, log.flatMap((e) => e.foe));
  p = capture(p, log.flatMap((e) => (e.won ? e.foe : [])));
  return capture(p, partyIds());
}

function save(p: DexProgress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProgress(p)));
  } catch {
    // Storage unavailable: progress lasts for this session only.
  }
}

interface DexProgressState extends DexProgress {
  /** Foes met in battle. */
  see: (dexIds: readonly number[]) => void;
  /** Foes beaten, Pokémon raised. */
  capture: (dexIds: readonly number[]) => void;
  /** Takes progress from the server (already merged with this device's). */
  replace: (progress: { seen: readonly number[]; caught: readonly number[] }) => void;
}

/** Seen and caught species, in localStorage. The Tamagotchi party is caught automatically. */
export const useDexProgress = create<DexProgressState>((set, get) => {
  const update = (next: DexProgress) => {
    const { seen, caught } = get();
    if (next.seen === seen && next.caught === caught) return;
    set({ seen: next.seen, caught: next.caught });
    save(next);
  };
  return {
    ...(typeof window === "undefined" ? EMPTY_PROGRESS : load()),
    see: (ids) => update(see(get(), ids)),
    capture: (ids) => update(capture(get(), ids)),
    replace: ({ seen, caught }) => {
      const next = sanitizeProgress({ seen, caught });
      const same = (a: ReadonlySet<number>, b: ReadonlySet<number>) => a.size === b.size && [...a].every((id) => b.has(id));
      if (!same(next.seen, get().seen) || !same(next.caught, get().caught)) update(next);
    },
  };
});

// Hatched, evolved or synced party members count as caught.
if (typeof window !== "undefined") {
  useTamagotchi.subscribe((s, prev) => {
    if (s.pets !== prev.pets) useDexProgress.getState().capture(partyIds());
  });
  useDexProgress.getState().capture(partyIds());
}

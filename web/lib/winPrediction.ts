import { type BattleSnapshot, battleFeatures, type Combatant } from "./battleFeatures.ts";
import { loadWinModel, predictFeatures } from "./winModel.ts";

/**
 * Optional ML service (ml/pokedex_ml/api.py). When unset, predictions run in
 * the browser with the exported model, so no server is needed.
 */
export const ML_API_URL = process.env.NEXT_PUBLIC_ML_API_URL;

export interface WinPrediction {
  /** P(side A wins), 0..1. */
  probability: number;
  model: string;
  version: string;
  source: "browser" | "api";
}

async function fromApi(snapshot: BattleSnapshot, signal?: AbortSignal): Promise<WinPrediction | null> {
  if (!ML_API_URL) return null;
  try {
    const res = await fetch(`${ML_API_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features: battleFeatures(snapshot) }),
      signal,
    });
    if (!res.ok) return null;
    return { ...((await res.json()) as Omit<WinPrediction, "source">), source: "api" };
  } catch {
    return null;
  }
}

/**
 * Side A's win probability in this state: the API if configured and up,
 * otherwise the in-browser model. Null only if neither is available.
 */
export async function predictWin(snapshot: BattleSnapshot, signal?: AbortSignal): Promise<WinPrediction | null> {
  const remote = await fromApi(snapshot, signal);
  if (remote) return remote;
  try {
    const model = await loadWinModel();
    return { probability: predictFeatures(model, battleFeatures(snapshot)), model: model.name, version: model.version, source: "browser" };
  } catch {
    return null;
  }
}

/** Each species as it enters battle (level 50 stats, moveset), exported by ml/generate. */
export const BATTLE_SETS_URL = "/battle/battle-sets.json";

let sets: Promise<Record<string, Combatant>> | null = null;

export function loadBattleSets(): Promise<Record<string, Combatant>> {
  sets ??= fetch(BATTLE_SETS_URL).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<Record<string, Combatant>>;
  });
  sets.catch(() => (sets = null));
  return sets;
}

/** Starting state of a 1v1 between two dex numbers (both at full HP, level 50). */
export async function preBattleSnapshot(dexA: number, dexB: number): Promise<BattleSnapshot | null> {
  const all = await loadBattleSets();
  const a = all[dexA];
  const b = all[dexB];
  return a && b ? { turn: 0, a, b } : null;
}

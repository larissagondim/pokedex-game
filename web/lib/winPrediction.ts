import { type BattleSnapshot, battleFeatures } from "./battleFeatures.ts";

/** Where the ML service (ml/pokedex_ml/api.py) runs. */
export const ML_API_URL = process.env.NEXT_PUBLIC_ML_API_URL ?? "http://localhost:8000";

export interface WinPrediction {
  /** P(side A wins), 0..1. */
  probability: number;
  model: string;
  version: string;
}

/**
 * Asks the ML service for side A's win probability in this state. Returns
 * null when the service is unreachable, so the battle can go on without the bar.
 */
export async function predictWin(snapshot: BattleSnapshot, signal?: AbortSignal): Promise<WinPrediction | null> {
  try {
    const res = await fetch(`${ML_API_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features: battleFeatures(snapshot) }),
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as WinPrediction;
  } catch {
    return null;
  }
}

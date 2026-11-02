/**
 * Runs the exported gradient-boosting model (ml/pokedex_ml/export.py) in the
 * browser: no server needed. Same evaluation as `predict_json` in Python,
 * checked against sklearn's output by winModel.test.ts.
 */

interface Tree {
  /** Split feature index per node, -1 on leaves. */
  f: number[];
  t: number[];
  l: number[];
  r: number[];
  /** Leaf values. */
  v: number[];
  /** 1 if a missing value goes left. */
  m: number[];
}

export interface WinModel {
  name: string;
  version: string;
  features: string[];
  baseline: number;
  trees: Tree[];
}

export const WIN_MODEL_URL = "/battle/win-model.json";

/** P(side A wins) for a feature row in `model.features` order. */
export function predictRow(model: WinModel, row: readonly number[]): number {
  let raw = model.baseline;
  for (const tree of model.trees) {
    let node = 0;
    while (tree.f[node] !== -1) {
      const x = row[tree.f[node]];
      const left = Number.isNaN(x) ? tree.m[node] === 1 : x <= tree.t[node];
      node = left ? tree.l[node] : tree.r[node];
    }
    raw += tree.v[node];
  }
  return 1 / (1 + Math.exp(-raw));
}

/** P(side A wins) from named features; throws if one the model needs is missing. */
export function predictFeatures(model: WinModel, features: Record<string, number>): number {
  return predictRow(
    model,
    model.features.map((name) => {
      const value = features[name];
      if (value === undefined) throw new Error(`Missing feature: ${name}`);
      return value;
    }),
  );
}

let loading: Promise<WinModel> | null = null;

/** Fetches the model once (it's ~500 KB, so only when a battle screen needs it). */
export function loadWinModel(): Promise<WinModel> {
  loading ??= fetch(WIN_MODEL_URL).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<WinModel>;
  });
  loading.catch(() => (loading = null)); // allow a retry
  return loading;
}

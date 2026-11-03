"""Exports the gradient-boosting model to JSON so it runs in the browser.

    python -m pokedex_ml.export

Writes web/public/battle/win-model.json (the trees) and
web/lib/winModel.fixture.json (sample inputs with the probabilities sklearn
gives), which a TypeScript test uses to check the browser model matches.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

from . import model_io

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT.parent / "web"


def tree_to_json(predictor) -> dict:
    """Flat arrays per tree: feature (-1 on leaves), threshold, left, right, value, missing-goes-left."""
    nodes = predictor.nodes
    leaf = nodes["is_leaf"].astype(bool)
    return {
        "f": np.where(leaf, -1, nodes["feature_idx"]).tolist(),
        "t": [round(float(x), 6) for x in nodes["num_threshold"]],
        "l": nodes["left"].tolist(),
        "r": nodes["right"].tolist(),
        "v": [round(float(x), 6) if is_leaf else 0 for x, is_leaf in zip(nodes["value"], leaf)],
        "m": nodes["missing_go_to_left"].astype(int).tolist(),
    }


def export_model(model: model_io.TrainedModel) -> dict:
    est = model.estimator
    if not isinstance(est, HistGradientBoostingClassifier):
        raise SystemExit(f"Only gradient boosting is exported (got {type(est).__name__}).")
    return {
        "name": model.name,
        "version": model.version,
        "features": model.features,
        "baseline": float(np.ravel(est._baseline_prediction)[0]),
        "trees": [tree_to_json(iteration[0]) for iteration in est._predictors],
    }


def predict_json(exported: dict, row: list[float]) -> float:
    """Reference evaluation of the exported trees (mirrors web/lib/winModel.ts)."""
    raw = exported["baseline"]
    for tree in exported["trees"]:
        node = 0
        while tree["f"][node] != -1:
            x = row[tree["f"][node]]
            go_left = tree["m"][node] == 1 if np.isnan(x) else x <= tree["t"][node]
            node = tree["l"][node] if go_left else tree["r"][node]
        raw += tree["v"][node]
    return float(1 / (1 + np.exp(-raw)))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=model_io.DEFAULT_MODEL_PATH)
    parser.add_argument("--data", type=Path, default=ROOT / "data" / "soft.csv")
    parser.add_argument("--out", type=Path, default=WEB / "public" / "battle" / "win-model.json")
    parser.add_argument("--fixture", type=Path, default=WEB / "lib" / "winModel.fixture.json")
    args = parser.parse_args()

    model = model_io.load(args.model)
    exported = export_model(model)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(exported, separators=(",", ":")))

    sample = pd.read_csv(args.data).sample(25, random_state=0)[model.features]
    expected = model.estimator.predict_proba(sample)[:, 1]
    rows = sample.to_numpy(dtype=float).tolist()
    worst = max(abs(predict_json(exported, r) - p) for r, p in zip(rows, expected))
    args.fixture.write_text(json.dumps({"version": model.version, "rows": rows, "expected": expected.tolist()}, indent=1))
    print(f"{len(exported['trees'])} trees → {args.out} ({args.out.stat().st_size / 1024:.0f} KB); "
          f"max |json − sklearn| on the fixture: {worst:.2e}")


if __name__ == "__main__":
    main()

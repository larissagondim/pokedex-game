"""Compares the model with Monte Carlo estimates.

    python -m pokedex_ml.evaluate --data data/montecarlo.csv

For each matchup the generator replayed the battle N times; the win rate is a
reference with a known sampling error (±1.96·√(p(1−p)/N)). This reports how
far the model's pre-battle probability is from it and how much faster it is.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

from . import model_io

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=ROOT / "data" / "montecarlo.csv")
    parser.add_argument("--model", type=Path, default=model_io.DEFAULT_MODEL_PATH)
    parser.add_argument("--report", type=Path, default=ROOT / "reports" / "montecarlo.json")
    args = parser.parse_args()

    model = model_io.load(args.model)
    df = pd.read_csv(args.data)
    rows = df[model.features].to_dict("records")

    start = time.perf_counter()
    p_model = model.predict(rows)
    model_ms = (time.perf_counter() - start) * 1000 / len(rows)

    runs = df["runs"].to_numpy()
    p_mc = df["wins_a"].to_numpy() / runs
    error = p_model - p_mc
    sampling = np.sqrt(p_mc * (1 - p_mc) / runs)
    mc_ms = (df["ms_per_battle"] * runs).to_numpy()

    report = {
        "model": {"name": model.name, "version": model.version},
        "matchups": len(df),
        "runs_per_matchup": int(np.median(runs)),
        "mae": float(np.abs(error).mean()),
        "rmse": float(np.sqrt((error**2).mean())),
        "correlation": float(np.corrcoef(p_model, p_mc)[0, 1]),
        # Part of the error is Monte Carlo noise itself, not the model.
        "mean_mc_sampling_error": float(sampling.mean()),
        "within_mc_95_interval": float((np.abs(error) <= 1.96 * sampling + 1e-9).mean()),
        "ms_per_prediction": {"model": model_ms, "monte_carlo": float(np.median(mc_ms))},
        "speedup": float(np.median(mc_ms) / model_ms),
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k != "model"}, indent=2))


if __name__ == "__main__":
    main()

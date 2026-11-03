"""Trains the pre-battle model on the app's own battles with soft labels.

    python -m pokedex_ml.train_soft --data data/soft.csv --eval data/soft_eval.csv

The dataset (generate: `npm run soft`) has one row per side of each matchup
with `p`, the side's win rate over many simulated battles with the project's
engine and movesets. Instead of a single noisy win/loss, the model learns
that rate: each row is fed to the classifier twice, as a win weighted by p and
a loss weighted by 1 − p. Same estimator and export as the hard-label model.

Reports: soft cross-entropy (with its floor, the labels' own entropy), mean
absolute error against the win rates, and an evaluation against a separate
set of matchups measured with many more simulations.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold

from . import model_io
from .train import MODELS

ROOT = Path(__file__).resolve().parent.parent
ID_COLUMNS = ["pair_id", "dex_a", "dex_b", "swapped"]
TARGET = ["p", "runs"]
EPS = 1e-6


def load(path: Path) -> tuple[pd.DataFrame, list[str]]:
    df = pd.read_csv(path)
    features = [c for c in df.columns if c not in ID_COLUMNS + TARGET and df[c].nunique() > 1]
    return df, features


def expand(x: pd.DataFrame, p: np.ndarray):
    """Each row as a win (weight p) and a loss (weight 1 − p)."""
    xx = pd.concat([x, x], ignore_index=True)
    y = np.concatenate([np.ones(len(x)), np.zeros(len(x))])
    w = np.concatenate([p, 1 - p])
    return xx, y, w


def fit(make, x: pd.DataFrame, p: np.ndarray):
    xx, y, w = expand(x, p)
    return make().fit(xx, y, **sample_weight_kw(make, w))


def sample_weight_kw(make, w):
    # Pipelines need the weight routed to their last step.
    est = make()
    if hasattr(est, "steps"):
        return {f"{est.steps[-1][0]}__sample_weight": w}
    return {"sample_weight": w}


def soft_scores(p: np.ndarray, q: np.ndarray, runs: np.ndarray | None = None) -> dict:
    q = np.clip(q, EPS, 1 - EPS)
    pc = np.clip(p, EPS, 1 - EPS)
    out = {
        "cross_entropy": float(np.mean(-(p * np.log(q) + (1 - p) * np.log(1 - q)))),
        # The lowest cross-entropy possible: the labels' own uncertainty.
        "entropy_floor": float(np.mean(-(p * np.log(pc) + (1 - p) * np.log(1 - pc)))),
        "mae": float(np.mean(np.abs(q - p))),
        "rmse": float(np.sqrt(np.mean((q - p) ** 2))),
        "correlation": float(np.corrcoef(p, q)[0, 1]),
    }
    if runs is not None:
        noise = np.sqrt(p * (1 - p) / runs)
        out["mean_label_noise"] = float(noise.mean())
        out["within_label_95_interval"] = float(np.mean(np.abs(q - p) <= 1.96 * noise + 0.01))
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=ROOT / "data" / "soft.csv")
    parser.add_argument("--eval", type=Path, default=ROOT / "data" / "soft_eval.csv")
    parser.add_argument("--model", type=Path, default=model_io.DEFAULT_MODEL_PATH)
    parser.add_argument("--report", type=Path, default=ROOT / "reports" / "soft.json")
    args = parser.parse_args()

    df, features = load(args.data)
    p = df["p"].to_numpy()
    print(f"{df['pair_id'].nunique()} matchups, {len(df)} rows, {len(features)} features")

    evaluation = pd.read_csv(args.eval) if args.eval.exists() else None
    report: dict = {"matchups": int(df["pair_id"].nunique()), "runs_per_matchup": int(df["runs"].median()), "features": features, "models": {}}

    # The model currently shipped (hard labels from another simulator), for comparison.
    if evaluation is not None and args.model.exists():
        previous = model_io.load(args.model)
        if all(f in evaluation for f in previous.features):
            report["previous_model_on_eval"] = soft_scores(
                evaluation["p"].to_numpy(), previous.predict(evaluation[previous.features].to_dict("records")), evaluation["runs"].to_numpy()
            )

    for name, make in MODELS.items():
        oof = np.zeros(len(df))
        for train_idx, test_idx in GroupKFold(n_splits=5).split(df, groups=df["pair_id"]):
            model = fit(make, df.iloc[train_idx][features], p[train_idx])
            oof[test_idx] = model.predict_proba(df.iloc[test_idx][features])[:, 1]
        report["models"][name] = {"cv": soft_scores(p, oof, df["runs"].to_numpy())}
        print(f"{name}: cv cross-entropy {report['models'][name]['cv']['cross_entropy']:.4f} "
              f"(floor {report['models'][name]['cv']['entropy_floor']:.4f}), mae {report['models'][name]['cv']['mae']:.4f}")

    best = min(report["models"], key=lambda n: report["models"][n]["cv"]["cross_entropy"])
    estimator = fit(MODELS[best], df[features], p)
    version = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    trained = model_io.TrainedModel(estimator=estimator, features=features, name=f"{best}-soft", version=version)

    if evaluation is not None:
        q = trained.predict(evaluation[features].to_dict("records"))
        report["models"][best]["eval"] = soft_scores(evaluation["p"].to_numpy(), q, evaluation["runs"].to_numpy())
        print(f"eval ({evaluation['pair_id'].nunique()} matchups × {int(evaluation['runs'].median())} runs): "
              f"mae {report['models'][best]['eval']['mae']:.4f}, correlation {report['models'][best]['eval']['correlation']:.4f}")
        if "previous_model_on_eval" in report:
            print(f"previous model on the same eval: mae {report['previous_model_on_eval']['mae']:.4f}")

    model_io.save(trained, args.model)
    report["chosen"] = {"name": trained.name, "version": version}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2))
    print(f"best: {trained.name} → {args.model}; report → {args.report}")


if __name__ == "__main__":
    main()

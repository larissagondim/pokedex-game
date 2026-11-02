"""Trains the win-probability model.

    python -m pokedex_ml.train --data data/battles.csv

Compares a logistic regression and gradient boosting with grouped
cross-validation (all rows of a battle stay in the same fold), checks how
they do on species never seen in training, keeps the best by log loss and
saves it to models/model.joblib plus a report in reports/metrics.json.
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from . import model_io
from .metrics import score

ROOT = Path(__file__).resolve().parent.parent
ID_COLUMNS = ["battle_id", "dex_a", "dex_b", "swapped"]
LABEL = "label"

MODELS = {
    "logistic": lambda: make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)),
    "boosting": lambda: HistGradientBoostingClassifier(
        max_iter=400, learning_rate=0.05, max_leaf_nodes=31, l2_regularization=1.0, early_stopping=True, random_state=0
    ),
}


def load_dataset(path: Path) -> tuple[pd.DataFrame, list[str]]:
    df = pd.read_csv(path)
    features = [c for c in df.columns if c not in ID_COLUMNS + [LABEL]]
    return df, features


def cross_validated_predictions(df: pd.DataFrame, features: list[str], make, folds: int = 5) -> np.ndarray:
    """Out-of-fold P(A wins) for every row, grouping by battle."""
    oof = np.zeros(len(df))
    for train_idx, test_idx in GroupKFold(n_splits=folds).split(df, groups=df["battle_id"]):
        model = make().fit(df.iloc[train_idx][features], df.iloc[train_idx][LABEL])
        oof[test_idx] = model.predict_proba(df.iloc[test_idx][features])[:, 1]
    return oof


def unseen_species_split(df: pd.DataFrame, share: float = 0.2, seed: int = 0):
    """Train on battles between "seen" species; test on battles involving any held-out species."""
    rng = np.random.default_rng(seed)
    species = np.unique(np.concatenate([df["dex_a"], df["dex_b"]]))
    held_out = set(rng.choice(species, size=int(len(species) * share), replace=False))
    touches = df["dex_a"].isin(held_out) | df["dex_b"].isin(held_out)
    both_seen = ~touches
    return df[both_seen], df[touches]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=ROOT / "data" / "battles.csv")
    parser.add_argument("--model", type=Path, default=model_io.DEFAULT_MODEL_PATH)
    parser.add_argument("--report", type=Path, default=ROOT / "reports" / "metrics.json")
    args = parser.parse_args()

    df, features = load_dataset(args.data)
    y = df[LABEL].to_numpy()
    print(f"{len(df)} rows, {df['battle_id'].nunique()} battles, {len(features)} features")

    report: dict = {
        "rows": len(df),
        "battles": int(df["battle_id"].nunique()),
        "features": features,
        "baselines": {
            "coin_flip": score(y, np.full(len(y), 0.5)),
            # Heuristic: whoever wins the damage race (no learning involved).
            "damage_race": score(y, df["race_win"].clip(0.05, 0.95).to_numpy()),
        },
        "models": {},
    }

    for name, make in MODELS.items():
        start = time.perf_counter()
        oof = cross_validated_predictions(df, features, make)
        result = score(y, oof)
        result["cv_seconds"] = round(time.perf_counter() - start, 1)
        # Before the first move vs. mid-battle.
        start_rows = df["turn"] == 0
        result["pre_battle_log_loss"] = score(y[start_rows], oof[start_rows])["log_loss"]
        train, test = unseen_species_split(df)
        model = make().fit(train[features], train[LABEL])
        result["unseen_species"] = score(test[LABEL].to_numpy(), model.predict_proba(test[features])[:, 1])
        report["models"][name] = result
        print(f"{name}: log loss {result['log_loss']:.4f}, brier {result['brier']:.4f}, auc {result['auc']:.4f}, "
              f"ece {result['ece']:.4f}, unseen species log loss {result['unseen_species']['log_loss']:.4f}")

    best = min(report["models"], key=lambda n: report["models"][n]["log_loss"])
    version = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    estimator = MODELS[best]().fit(df[features], y)
    model_io.save(model_io.TrainedModel(estimator=estimator, features=features, name=best, version=version), args.model)
    report["chosen"] = {"name": best, "version": version}

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2))
    print(f"best: {best} → {args.model}; report → {args.report}")


if __name__ == "__main__":
    main()

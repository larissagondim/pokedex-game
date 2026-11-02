"""Saving and loading the trained model with its metadata."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np

DEFAULT_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "model.joblib"


@dataclass
class TrainedModel:
    estimator: Any
    features: list[str]
    name: str
    version: str

    def predict(self, rows: list[dict[str, float]]) -> np.ndarray:
        """P(side A wins) for feature dicts keyed by `self.features`."""
        x = np.array([[row[f] for f in self.features] for row in rows], dtype=float)
        return self.estimator.predict_proba(x)[:, 1]


def save(model: TrainedModel, path: Path = DEFAULT_MODEL_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, path)


def load(path: Path = DEFAULT_MODEL_PATH) -> TrainedModel:
    return joblib.load(path)

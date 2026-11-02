"""Probability metrics: how good and how well calibrated predictions are."""
from __future__ import annotations

import numpy as np
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss, roc_auc_score

EPS = 1e-6


def score(y: np.ndarray, p: np.ndarray, bins: int = 10) -> dict:
    """Log loss and Brier (lower is better), AUC, accuracy and a calibration table."""
    p = np.clip(p, EPS, 1 - EPS)
    edges = np.linspace(0, 1, bins + 1)
    which = np.clip(np.digitize(p, edges) - 1, 0, bins - 1)
    calibration = [
        {"bin": f"{edges[i]:.1f}-{edges[i + 1]:.1f}", "n": int(m.sum()), "predicted": float(p[m].mean()), "observed": float(y[m].mean())}
        for i in range(bins)
        if (m := which == i).any()
    ]
    return {
        "log_loss": float(log_loss(y, p, labels=[0, 1])),
        "brier": float(brier_score_loss(y, p)),
        "auc": float(roc_auc_score(y, p)) if len(set(y)) > 1 else None,
        "accuracy": float(accuracy_score(y, p >= 0.5)),
        # Expected calibration error: weighted gap between predicted and observed.
        "ece": float(sum(c["n"] * abs(c["predicted"] - c["observed"]) for c in calibration) / len(y)),
        "calibration": calibration,
    }

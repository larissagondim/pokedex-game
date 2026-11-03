import numpy as np
import pandas as pd

from pokedex_ml.train import MODELS
from pokedex_ml.train_soft import expand, fit, soft_scores


def test_expand_weights_wins_and_losses():
    x = pd.DataFrame({"f": [1.0, 2.0]})
    xx, y, w = expand(x, np.array([0.8, 0.1]))
    assert len(xx) == 4
    assert list(y) == [1, 1, 0, 0]
    assert np.allclose(w, [0.8, 0.1, 0.2, 0.9])


def test_soft_scores_floor_and_perfect_prediction():
    p = np.array([0.0, 0.25, 0.9, 1.0])
    s = soft_scores(p, p, runs=np.full(4, 100))
    assert abs(s["cross_entropy"] - s["entropy_floor"]) < 1e-4
    assert s["mae"] < 1e-5


def test_a_classifier_learns_win_rates_from_soft_labels():
    rng = np.random.default_rng(0)
    x = pd.DataFrame({"f": rng.normal(size=3000)})
    p = 1 / (1 + np.exp(-2 * x["f"].to_numpy()))
    for make in MODELS.values():
        model = fit(make, x, p)
        q = model.predict_proba(x)[:, 1]
        assert np.abs(q - p).mean() < 0.05

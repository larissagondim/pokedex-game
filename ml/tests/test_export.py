import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

from pokedex_ml import model_io
from pokedex_ml.export import export_model, predict_json


def test_exported_trees_match_sklearn():
    rng = np.random.default_rng(1)
    x = pd.DataFrame(rng.normal(size=(2000, 3)), columns=["a", "b", "c"])
    y = ((x["a"] * 2 - x["b"] + rng.normal(scale=0.5, size=2000)) > 0).astype(int)
    est = HistGradientBoostingClassifier(max_iter=50, random_state=0).fit(x, y)
    exported = export_model(model_io.TrainedModel(estimator=est, features=["a", "b", "c"], name="boosting", version="t"))
    probe = x.sample(200, random_state=2)
    expected = est.predict_proba(probe)[:, 1]
    got = np.array([predict_json(exported, row) for row in probe.to_numpy().tolist()])
    assert np.abs(got - expected).max() < 1e-5

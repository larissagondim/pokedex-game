import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sklearn.linear_model import LogisticRegression

from pokedex_ml import api, model_io

FEATURES = ["ttk_diff", "hp_diff"]


@pytest.fixture
def client():
    # Tiny model: A wins when it needs fewer turns and has more HP.
    rng = np.random.default_rng(0)
    x = pd.DataFrame(rng.normal(size=(400, 2)), columns=FEATURES)
    y = (x.sum(axis=1) > 0).astype(int)
    model = model_io.TrainedModel(estimator=LogisticRegression().fit(x, y), features=FEATURES, name="test", version="1")
    api.app.dependency_overrides[api.get_model] = lambda: model
    yield TestClient(api.app)
    api.app.dependency_overrides.clear()


def test_health(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["features"] == FEATURES


def test_predict_is_a_probability_in_the_right_direction(client):
    good = client.post("/predict", json={"features": {"ttk_diff": 3, "hp_diff": 0.5}}).json()
    bad = client.post("/predict", json={"features": {"ttk_diff": -3, "hp_diff": -0.5}}).json()
    assert 0.5 < good["probability"] <= 1
    assert 0 <= bad["probability"] < 0.5
    assert good["model"] == "test"


def test_missing_features_are_rejected(client):
    response = client.post("/predict", json={"features": {"ttk_diff": 1}})
    assert response.status_code == 422
    assert response.json()["detail"]["missing_features"] == ["hp_diff"]


def test_extra_features_are_ignored(client):
    response = client.post("/predict", json={"features": {"ttk_diff": 1, "hp_diff": 0, "unused": 9}})
    assert response.status_code == 200


def test_batch(client):
    items = [{"features": {"ttk_diff": d, "hp_diff": 0}} for d in (-2, 0, 2)]
    ps = [r["probability"] for r in client.post("/predict/batch", json={"items": items}).json()]
    assert ps == sorted(ps)

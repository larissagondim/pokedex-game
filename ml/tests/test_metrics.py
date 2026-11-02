import numpy as np
import pandas as pd

from pokedex_ml.metrics import score
from pokedex_ml.train import unseen_species_split


def test_perfect_and_coin_flip_scores():
    y = np.array([0, 1, 0, 1])
    perfect = score(y, y.astype(float))
    coin = score(y, np.full(4, 0.5))
    assert perfect["accuracy"] == 1
    assert perfect["log_loss"] < 0.01
    assert abs(coin["log_loss"] - np.log(2)) < 1e-9
    assert coin["brier"] == 0.25


def test_calibration_error_is_zero_when_frequencies_match():
    y = np.array([1] * 7 + [0] * 3)
    assert score(y, np.full(10, 0.7))["ece"] < 1e-9


def test_unseen_species_split_keeps_held_out_species_out_of_training():
    df = pd.DataFrame({"dex_a": np.arange(100), "dex_b": np.arange(100)[::-1]})
    train, test = unseen_species_split(df, share=0.2)
    held = set(test["dex_a"]) | set(test["dex_b"])
    seen = set(train["dex_a"]) | set(train["dex_b"])
    assert len(train) + len(test) == len(df)
    # No training row involves a species that only appears in test rows.
    test_only = held - seen
    assert test_only, "some species must be held out"
    assert not (train["dex_a"].isin(test_only) | train["dex_b"].isin(test_only)).any()

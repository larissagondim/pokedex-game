# ml: win prediction

Predicts the probability that side A wins a 1v1 battle, before it starts and at every turn.

```
battle engine ──► BattleSnapshot ──► battleFeatures() ──► model ──► P(A wins)
 (generate/)        (web/lib)          (web/lib)          (pokedex_ml/)
```

- **`web/lib/battleFeatures.ts`** defines the engine-neutral battle state (`BattleSnapshot`) and computes the features. The dataset generator and the app use this same code, so training and serving can't drift apart.
- **`generate/`** (Node) simulates battles and writes the datasets. It talks to a `BattleEngine` interface; today the adapter is [`@pkmn/sim`](https://github.com/pkmn/ps) (Pokémon Showdown, gen 9). When the project's own battle engine exists, write an adapter for it and regenerate the data so the model learns those rules.
- **`pokedex_ml/`** (Python) trains and evaluates the model and serves it with FastAPI.

## Setup

```bash
cd ml
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd generate && npm install && cd ..
```

## 1. Generate data

```bash
cd generate
npm run dataset -- --battles 20000 --seed 1 --out ../data/battles.csv
npm run montecarlo -- --pairs 300 --runs 300 --seed 2 --out ../data/montecarlo.csv
cd ..
```

- **dataset:** random matchups, level 50, no items, curated random-battle movesets (or learnset-based ones). Both sides are played by a greedy agent (highest expected damage, 10% random moves). One row per turn, plus the same row from the other side (features swapped, label flipped), so the model is symmetric.
- **montecarlo:** fixed matchups replayed `runs` times from the start; their win rates are the reference for evaluation.

## 2. Train and evaluate

```bash
.venv/bin/python -m pokedex_ml.train      # → models/model.joblib, reports/metrics.json
.venv/bin/python -m pokedex_ml.evaluate   # → reports/montecarlo.json
.venv/bin/python -m pytest
```

Training compares a logistic regression with gradient boosting using **GroupKFold by battle** (all turns of a battle in the same fold, otherwise the scores are inflated), reports log loss, Brier score, AUC and calibration (ECE), a pre-battle score, a test on **species never seen in training**, and two baselines (coin flip and "whoever wins the damage race"). The best model by log loss is saved.

The evaluation compares the model's pre-battle probability with the Monte Carlo win rates: error, how much of it is Monte Carlo noise (±1.96·√(p(1−p)/N)), and the speed difference.

## 3. Serve

```bash
.venv/bin/uvicorn pokedex_ml.api:app --port 8000
```

| Endpoint | |
| --- | --- |
| `GET /health` | Model name, version and expected features |
| `POST /predict` | `{"features": {...}}` → `{"probability", "model", "version"}` |
| `POST /predict/batch` | `{"items": [{"features": {...}}, ...]}` |

In the web app, `predictWin(snapshot)` (`web/lib/winPrediction.ts`) computes the features and calls the API (`NEXT_PUBLIC_ML_API_URL`, default `http://localhost:8000`). `CORS_ORIGINS` and `MODEL_PATH` configure the service.

## Features

`ttk_a`/`ttk_b` (turns to KO with the best move, gen 5+ damage formula with average roll, STAB, type effectiveness, accuracy and burn), `ttk_diff`, `moves_first` (priority, then speed; paralysis halves it), `race_win` (who wins if both spam their best move), HP fractions and difference, best type effectiveness each way (log2), stat ratio, level difference, status flags and turn number.

Known simplifications: no items, abilities only through the simulator (not in the features), stat boosts included, multi-turn effects (weather, hazards, volatile statuses) not modeled.

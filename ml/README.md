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
npm run dataset -- --battles 80000 --pre-battle --seed 3 --out ../data/prebattle.csv
npm run montecarlo -- --pairs 300 --runs 300 --seed 2 --out ../data/montecarlo.csv
cd ..
```

- **dataset:** random matchups (`--pre-battle` keeps only the starting state of each battle), level 50, no items, curated random-battle movesets (or learnset-based ones). Both sides are played by a greedy agent (highest expected damage, 10% random moves). One row per turn, plus the same row from the other side (features swapped, label flipped), so the model is symmetric.
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

Optional: in the web app, `predictWin(snapshot)` calls the API instead of the in-browser model when `NEXT_PUBLIC_ML_API_URL` is set. `CORS_ORIGINS` and `MODEL_PATH` configure the service.

## Results: pre-battle model

The app only needs the chance **before** the battle starts, so the model is trained on the starting state of 79,983 simulated battles (159,966 rows with both sides; HP, status and turn are constant there and get dropped, leaving 15 features). 5-fold cross-validation grouped by battle:

| Model | Log loss ↓ | Brier ↓ | AUC ↑ | Accuracy | Calibration error ↓ |
| --- | --- | --- | --- | --- | --- |
| Coin flip | 0.693 | 0.250 | 0.500 | 50.0% | 0.00% |
| Damage race heuristic | 0.508 | 0.142 | 0.845 | 84.3% | 10.39% |
| Logistic regression | 0.359 | 0.110 | 0.922 | 84.7% | 0.84% |
| Gradient boosting (chosen) | 0.347 | 0.108 | 0.926 | 85.0% | 0.14% |

- **Species never seen in training:** AUC 0.923 (log loss 0.355).
- **Calibration:** when it says 70%, side A wins about 70% of the time (table in `reports/metrics.json`).
- **Against Monte Carlo** (300 matchups × 200 replays): mean absolute error 0.12, correlation 0.89, ~12,357× faster.

Removing moves that only work under special conditions (Last Resort, Focus Punch...) from the learnset-based sets made the data cleaner and the model much sharper (AUC 0.885 → 0.926, Monte Carlo error 0.19 → 0.12). Remaining limitation: on nearly decided matchups the model is still a bit less extreme than the replays. It is calibrated on average but not sharp per matchup, because the features don't see abilities, status moves or special move effects. Next steps: features for those, and training on Monte Carlo win rates ("soft labels").

An all-turns model (for a live bar during the battle) can be trained the same way from a dataset generated without `--pre-battle`.

## In the browser

```bash
.venv/bin/python -m pokedex_ml.export   # → web/public/battle/win-model.json + web/lib/winModel.fixture.json
cd generate && npm run export-sets      # → web/public/battle/battle-sets.json
```

`export` writes the gradient-boosting trees as JSON (~500 KB, loaded only by the battle screen) and a fixture with sklearn's probabilities; `web/lib/winModel.ts` evaluates the trees and its test checks they match (< 1e-5). `export-sets` writes each species as it enters battle (level-50 stats and moveset, same logic as the training data), which the app uses to build the starting state. `predictWin(snapshot)` uses the browser model unless `NEXT_PUBLIC_ML_API_URL` points at the API.

## Features

`ttk_a`/`ttk_b` (turns to KO with the best move, gen 5+ damage formula with average roll, STAB, type effectiveness, accuracy and burn), `ttk_diff`, `moves_first` (priority, then speed; paralysis halves it), `race_win` (who wins if both spam their best move), HP fractions and difference, best type effectiveness each way (log2), stat ratio, level difference, status flags and turn number.

Plus the continuous versions `dmg_a`/`dmg_b`/`dmg_diff` (best move's expected damage as a share of the foe's current HP: turns-to-KO rounds 51% and 99% to the same "2 turns"), `ohko_a`/`ohko_b` and `speed_ratio`.

Known simplifications: no items, abilities only through the simulator (not in the features), stat boosts included, multi-turn effects (weather, hazards, volatile statuses) not modeled.

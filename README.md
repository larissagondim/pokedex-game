# Pokédex Game

An interactive 3D Pokédex with battles, machine-learning win prediction and a Tamagotchi. A non-profit fan project built for portfolio and learning purposes, developed with **agentic programming** using [Claude Code](https://claude.com/claude-code).

> **Status:** early development. Working today: the **data scraper**, a **procedural 3D device** (opens like a book on a spring hinge, pressable buttons, zoom camera, sound, gamepad) and a **Pokédex screen** (list of all 1025 Pokémon and a detail page with an animated sprite and cry). Anything marked _(planned)_ below is not implemented yet.

## Table of contents

- [Built with agentic programming](#built-with-agentic-programming)
- [Features](#features)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Stack](#stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Training the model](#training-the-model)
- [Data structures and algorithms](#data-structures-and-algorithms)
- [Roadmap](#roadmap)
- [Controls](#controls)
- [Legal notice](#legal-notice)
- [Credits](#credits)

## Built with agentic programming

This project is developed in pair with an AI coding agent (Claude Code). The workflow:

- **I set the direction:** the product idea, the roadmap, the design decisions and the review of every change.
- **The agent does the legwork:** it reads the codebase, proposes and implements changes, runs the linter and the dev server, and fixes what breaks.
- **Small, reviewable commits:** work is split into focused steps and committed with [Conventional Commits](https://www.conventionalcommits.org/) (`feat(screen): ...`, `fix(screen): ...`, `chore(web): ...`).
- **Agent guidance lives in the repo:** [`web/AGENTS.md`](web/AGENTS.md) tells coding agents to read the bundled Next.js docs before writing code, since this Next.js version has breaking changes compared to older releases.

The commit history shows how the project grew step by step: scraper, then web scaffold, input system, retro UI prototype, 3D shell, and finally the real Pokédex page.

## Features

| Feature | Description | Status |
| --- | --- | --- |
| Data scraping | Script that downloads data, sprites, artwork and animated sprites for all 1025 Pokémon (generations 1 to 9) from PokéAPI and Pokémon Showdown | ✅ Done |
| 3D device | Original red device built procedurally with React Three Fiber, with every measurement in `device.config.ts`. The screen half opens to the left like a book cover on a spring hinge; idle float while closed; retro boot animation; status LED; secondary screen with the focused Pokémon. Drag to rotate, zoom into the main screen. Physical buttons (D-pad, A, B, MENU, ZOOM) are pressable in 3D | ✅ Done |
| Phone layout | On touch screens in portrait, all the buttons move next to the screen on one half, the lid opens flat and the camera frames just that half (rotation off, so a finger on a button doesn't turn the device). Force it with `?layout=compact` (or `?layout=split`) | ✅ Done |
| Input system | Keyboard, gamepad and 3D buttons emit the same events through a priority-based handler stack. Held directions repeat | ✅ Done |
| Sound | Synthesized UI blips (WebAudio) and Pokémon cries played from the speaker grill (positional audio). Mute button; audio starts after the first interaction | ✅ Done |
| Pokédex screen | 4:3 retro handheld UI inside the device. Scrollable list of all 1025 Pokémon with a preview panel, and a detail page with animated sprite, types, base stats, height, weight, abilities and a typewriter-style dialog box with the dex entry. Respects `prefers-reduced-motion` | ✅ Done |
| Search | Search by name prefix (binary search, results A→Z) or by number (`25`, `#25`). Type with the real keyboard (`/` focuses the field) or with the device buttons on an on-screen keyboard | ✅ Done |
| Regions and music | The list shows the region of the focused Pokémon (Kanto … Paldea, by dex number); ◀ ▶ jump between regions. Each region has its own background music, which crossfades when the cursor crosses a region boundary. The themes are original synthesized chiptune loops (no game music is bundled); your own recordings can be mapped per region in `web/lib/music.ts` | ✅ Done |
| Filters, sorting and favorites | Options row above the list: filter by type or ★ favorites, sort by number, name or base stat total. Rows show a mini sprite, type dots and the searched prefix highlighted. Favorites (MENU on a Pokémon page) are saved in `localStorage`. Jumping past Paldea shows a "Gen X: coming soon" slot | ✅ Done |
| Fun facts | Each Pokémon page ends with three "Did you know?" facts computed from the data by comparing it with all 1025 Pokémon: stat total ranking, top-1% stats, rare typings ("the only Bug/Ghost Pokémon"), size extremes or weight in Pikachu, catch rate, branched evolutions… (`web/lib/funFacts.ts`) | ✅ Done |
| Battles | 1v1 between any two Pokémon and 6v6 by teams, using the `@pkmn/sim` engine in Next.js API routes | 🕒 Planned |
| Win prediction | Win probability before and during a battle, computed by a trained model served via FastAPI | 🕒 Planned |
| Tamagotchi | Adopt up to 5 Pokémon from the list (A at the end of a Pokémon page, or ♥ ADOPT). Food, joy and energy decay with real time; feed, play, sleep and train them. XP raises the level and they **evolve** (babies also need to be happy). Coins earned by playing and training buy **eggs** that hatch into a random base-stage or baby Pokémon. Hearts when happy, mood bubbles, reactions per action, idle animation by evolution stage, and clicking one plays its cry. Saved in `localStorage` | ✅ Done (v1) |
| Trainer profile | Create your own trainer profile: pick a name, design your trainer sprite (hair, outfit, colors, etc.) and show it on the device. The profile ties together your Tamagotchi, favorites and battle history | 🕒 Planned |

The BATTLE and TAMAGOTCHI tabs exist on the screen but currently show a "coming soon" placeholder.

## Screenshots

_Placeholders. They will be added as the screens are finished._

| 3D device | Pokédex list | Details |
| --- | --- | --- |
| ![3D device](docs/screenshots/shell.png) | ![List](docs/screenshots/list.png) | ![Details](docs/screenshots/detail.png) |

| Battle | Win prediction | Tamagotchi |
| --- | --- | --- |
| ![Battle](docs/screenshots/battle.png) | ![Prediction](docs/screenshots/prediction.png) | ![Tamagotchi](docs/screenshots/tamagotchi.png) |

## Architecture

The `web` app and the scraper exist today. The rest is _(planned)_.

```mermaid
flowchart LR
    U[Browser] -->|HTTP| W[web<br/>Next.js + R3F]
    W -->|API routes| S[@pkmn/sim<br/>battle engine]
    W -->|REST| M[ml<br/>FastAPI + model]
    W -->|SQL| D[(db<br/>Postgres)]
    M -.->|simulated battle dataset| S
    P[PokéAPI + Showdown] -->|scrape_pokemon.py| J[data/pokemon.json<br/>sprites/ animated/ artwork/]
    J -->|sync-assets.mjs| W
    J --> M
```

Planned Docker Compose services: **web**, **ml** and **db**. At first the Tamagotchi state will live in `localStorage`; Postgres comes later for persistence and history.

Inside `web`, the app is split into three layers:

- **Stores (zustand):** `deviceInput` (button events, hold-to-repeat and subscriptions), `deviceState` (phase state machine: `CLOSED → OPENING → OPEN → ZOOMING_IN → ZOOMED → ZOOMING_OUT → OPEN → CLOSING`), `pokedex` (loading, focus, selection and cries) and `audio` (mute and unlock).
- **Device (`components/device`):** the procedural 3D shell, hinge, buttons and camera rig. The scene is loaded lazily. Conventions for working on it are in [`CLAUDE.md`](CLAUDE.md).
- **Screen (`components/screen`):** the 2D UI rendered inside the main screen. It subscribes to device input with higher priority than the device controller, so the UI gets the first say on each button.

## Stack

| Layer | Technologies |
| --- | --- |
| Front end | Next.js 16 (App Router), React 19, TypeScript, React Three Fiber, drei, three.js, camera-controls, zustand |
| Battle _(planned)_ | `@pkmn/sim` (Pokémon Showdown engine) |
| ML / backend _(planned)_ | Python, FastAPI, scikit-learn (or similar) |
| Database _(planned)_ | Postgres (Tamagotchi and history), `localStorage` at first |
| Infra _(planned)_ | Docker and Docker Compose |
| Data scraping | Python 3, standard library only |

## Project structure

Folders marked _(planned)_ do not exist yet.

```
pokedex-game/
├── scrape_pokemon.py       # scrapes data and images from PokéAPI / Showdown
├── data/
│   └── pokemon.json        # 1025 Pokémon (raw cache in data/cache/, git-ignored)
├── sprites/                # <id>.png, small sprite
├── artwork/                # <id>.png, high-resolution official artwork
├── animated/               # <id>.gif, animated sprite (~72 MB, git-ignored)
├── web/                    # Next.js app
│   ├── app/                # App Router entry
│   ├── components/
│   │   ├── device/         # 3D shell; all measurements in device.config.ts
│   │   └── screen/         # Pokédex UI inside the 4:3 screen
│   ├── hooks/              # keyboard/gamepad input, device controller, sound, screen power
│   ├── stores/             # zustand stores (deviceInput, deviceState, pokedex, audio)
│   ├── lib/                # synthesized sound effects
│   ├── data/               # Pokémon types and helpers
│   ├── scripts/
│   │   └── sync-assets.mjs # copies images and builds public/data/pokedex.json
│   └── AGENTS.md           # guidance for coding agents
├── ml/                     # (planned) dataset, training and FastAPI
├── CLAUDE.md               # conventions for the 3D device (for coding agents)
├── docker-compose.yml      # (planned) web, ml, db
├── .env.example            # (planned)
└── README.md
```

## Getting started

### 1. Scrape the data

Requires only Python 3, no dependencies to install.

```bash
python3 scrape_pokemon.py              # all 1025 Pokémon
python3 scrape_pokemon.py --limit 151  # first generation only
python3 scrape_pokemon.py --no-images  # JSON only, no images
python3 scrape_pokemon.py --workers 4  # fewer parallel requests
```

The script is resumable: API responses are cached in `data/cache/` and images already downloaded are skipped. Alternate forms (mega, regional, etc.) are not included, only the default forms. Animated GIFs are not available for every Pokémon; the UI falls back to the static sprite when one is missing.

Fields of each Pokémon in `data/pokemon.json`:

`id`, `name`, `display_name`, `genus`, `description`, `types`, `height_m`, `weight_kg`, `base_experience`, `stats`, `abilities`, `color`, `habitat`, `generation`, `is_legendary`, `is_mythical`, `capture_rate`, `evolves_from`, `evolution_chain_id`, `sprite`, `artwork`, `animated`, `sprite_url`, `artwork_url`, `animated_url`, `cry_url`, `evolves_from_id`, `is_baby`.

> Cries are not downloaded: the app streams them from `cry_url` (PokéAPI cries repository). Fun facts are computed in the app from these fields, not scraped.

### 2. Run the web app

Requires Node.js and npm.

```bash
cd web
npm install
npm run dev
```

Then open http://localhost:3000. `npm run dev` and `npm run build` first run `npm run sync-assets`, which copies `sprites/` and `animated/` into `web/public/` and builds a trimmed `web/public/data/pokedex.json` from `data/pokemon.json`. If the scraper has not been run, the script warns and the Pokédex will fail to load.

```bash
npm run lint    # ESLint
npm test        # unit tests (search)
npm run build   # production build
npm run start   # serve the production build
```

### 3. Full application _(planned)_

```bash
cp .env.example .env
docker compose up
```

Planned environment variables for `.env.example` (names may change):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection |
| `ML_API_URL` | URL of the FastAPI service used by `web` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credentials for the `db` service |

## Training the model

_(planned)_ The intended pipeline:

1. **Dataset:** simulate thousands of battles with `@pkmn/sim` between pairs of Pokémon and record the winner.
2. **Features:** stats of each side, type advantage, relative speed and total stats.
3. **Training:** logistic regression as a baseline and gradient boosting for comparison.
4. **Serving:** serve the trained model through FastAPI, returning the win probability.
5. **Comparison:** compare the model against a **Monte Carlo** estimate (simulate the same battle N times and count wins) to measure the error and cost of each approach.

Exact commands will be documented here once `ml/` exists.

## Data structures and algorithms

### Prefix search with binary search

Implemented in [`web/lib/search.ts`](web/lib/search.ts), with tests in `web/lib/search.test.ts` (`npm test` in `web/`).

When the Pokédex loads, a search index is built once: the Pokémon **sorted by normalized name** (lowercase, accents removed, so "flabe" finds Flabébé). For a prefix search (the user types "c" and sees every Pokémon starting with C, in alphabetical order), binary search finds the **first position** whose name is `>= prefix` (a _lower bound_), then the code scans forward while names still start with the prefix. All matches are contiguous in the sorted list, so the scan touches only the results.

**Why:**

- The data is static (1025 items), so sorting once pays off.
- Filtering the whole list on every keystroke costs `O(n)`; here the cost is lower and predictable.
- No extra structure such as a trie is needed, which would spend more memory for a small gain at this size.

**Complexity:**

| Operation | Cost |
| --- | --- |
| Sort (once) | `O(n log n)` |
| Find the start of the range | `O(log n)` |
| Collect the `k` results | `O(k)` |
| Full search | `O(log n + k)` |

A numeric query (`25`, `#25`, `#0025`) is an exact lookup by number in a `Map`, `O(1)`.

### Region of a Pokémon

Regions are contiguous dex ranges sorted by their first number ([`web/lib/regions.ts`](web/lib/regions.ts)). The region of an id is found with a binary search for the last range starting at or before it, `O(log r)`; the tests check every boundary (e.g. #151 Kanto, #152 Johto) against a linear scan.

The tests cover the lower bound edges, case/accent handling, number lookups and a comparison against a brute-force filter on 500 prefixes.

## Roadmap

- [x] Data and image scraper (PokéAPI, 1025 Pokémon, animated sprites)
- [x] Next.js scaffold with R3F, drei and zustand
- [x] Input system (keyboard and 3D buttons)
- [x] Procedural 3D device with hinge, buttons and camera rig
- [x] Pokédex screen: list, preview and detail page for all 1025 Pokémon
- [x] 3D device v2: phase state machine, spring hinge, boot animation, sound, cries, gamepad
- [x] Search by name prefix (binary search) or number, with an on-screen keyboard
- [x] Region bar and per-region background music
- [x] Type filter, sorting, favorites and a "coming soon" slot for the next generation
- [x] Fun facts
- [ ] **Phase 1:** Docker
- [ ] **Phase 2:** polish the 3D device around the interface
- [x] Tamagotchi v1 (party of 5, needs, evolution, eggs)
- [ ] **Phase 3:** 1v1 battle (built by hand)
- [ ] **Phase 4:** dataset, model and probability bar
- [ ] **Phase 5:** 6v6 battle
- [ ] **Phase 6:** Tamagotchi in Postgres (history, sync across devices)
- [ ] **Phase 7:** Trainer profile (name and customizable sprite)

## Controls

Keyboard and the physical buttons on the device do the same thing. Each key maps to the same button event that clicking the 3D button emits.

| Keyboard | Device button | Action |
| --- | --- | --- |
| ↑ ↓ ← → | D-pad | Navigate (hold to repeat: 300 ms, then every 90 ms). In the list, ↑ ↓ move and ← → jump between regions; ↑ on the first row selects the filter/sort row (← → change the filter, A the sort), and ↑ again the search field. On a Pokémon page they step through the National Dex. On the on-screen keyboard they move between keys |
| `Z` | A | Confirm / open details / advance the dialog / open the keyboard / type a key |
| `X` | B | Go back (clears the search; deletes a letter on the keyboard); at the root, leave zoom |
| `Enter` | MENU | Next tab (List, Battle, Tamagotchi); on a Pokémon page, toggle ★ favorite; on the keyboard, done |

On the TAMAGOTCHI tab: ↑ ↓ pick a Pokémon from the party, ← → pick an action, A does it, B goes back to the list.
| `Space` | ZOOM | Zoom in or out of the screen (opens the device if closed) |
| `Esc` | n/a | Leave zoom (in the search field: clear it, then leave the field) |
| `/` | n/a | Focus the search field. While typing, ↑ ↓ move through the results and `Enter` opens one |

Gamepads with the standard mapping also work: D-pad or left stick, A/B (bottom/right face buttons), Start = MENU, Select or Y = ZOOM. Opening: click the cover, press A, or use the "Open device" page button. Closing: the ⏻ button on the screen, a click on the hinge, or the page button.

The mapping may still change during development.

## Legal notice

Pokémon and all related names, images and sounds are trademarks and property of Nintendo, Game Freak and The Pokémon Company. This is a non-profit fan project with no affiliation with these companies. The device design is original.

## Credits

- [PokéAPI](https://pokeapi.co/): Pokémon data, sprites, artwork and cries.
- [Pokémon Showdown](https://play.pokemonshowdown.com/): animated sprites.
- [`@pkmn/sim`](https://github.com/pkmn/ps): battle engine based on Pokémon Showdown.
- [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans): pixel font, licensed under the SIL OFL.
- [Claude Code](https://claude.com/claude-code): AI coding agent used to build the project.

/**
 * Dataset generation for the win-prediction model.
 *
 *   node src/cli.ts dataset    --battles 20000 --seed 1 --out ../data/battles.csv
 *   node src/cli.ts montecarlo --pairs 200 --runs 500 --seed 2 --out ../data/montecarlo.csv
 *
 * dataset:    one row per turn of each battle, plus the same row seen from
 *             the other side (features swapped, label flipped).
 * montecarlo: random matchups replayed `runs` times from the start; the win
 *             rate is a reference to evaluate the model against.
 */
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { battleFeatures, FEATURE_NAMES, swapSides } from "../../../web/lib/battleFeatures.ts";
import { pkmnEngine } from "./pkmnEngine.ts";
import { makeRng, pick } from "./rng.ts";
import { DEX_NUMBERS } from "./sets.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    battles: { type: "string", default: "20000" },
    pairs: { type: "string", default: "200" },
    runs: { type: "string", default: "500" },
    seed: { type: "string", default: "1" },
    out: { type: "string" },
  },
});

const engine = pkmnEngine;
const seed = Number(values.seed);
const rng = makeRng(seed);
const nextSeed = () => Math.floor(rng() * 2 ** 31);

/**
 * Synchronous writer: the simulation loop never yields to the event loop, so
 * a stream would buffer everything in memory and lose it all on a crash.
 */
function open(path: string, header: string[]) {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "w");
  const write = (line: string) => writeSync(fd, line);
  write(header.join(",") + "\n");
  return { write, end: () => closeSync(fd) };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(6));
const progress = (done: number, total: number) => {
  if (done % 500 === 0 || done === total) process.stderr.write(`\r${done}/${total}`);
};

function dataset(total: number, path: string) {
  const out = open(path, ["battle_id", "dex_a", "dex_b", "swapped", ...FEATURE_NAMES, "label"]);
  let rows = 0;
  let draws = 0;
  for (let id = 0; id < total; id++) {
    const dexA = pick(rng, DEX_NUMBERS);
    const dexB = pick(rng, DEX_NUMBERS);
    const result = engine.play(engine.prepare(dexA, dexB, nextSeed()), nextSeed());
    if (result.aWon === null) {
      draws++;
      continue;
    }
    for (const s of result.snapshots) {
      const f = battleFeatures(s);
      const g = battleFeatures(swapSides(s));
      out.write([id, dexA, dexB, 0, ...FEATURE_NAMES.map((k) => fmt(f[k])), result.aWon].join(",") + "\n");
      out.write([id, dexB, dexA, 1, ...FEATURE_NAMES.map((k) => fmt(g[k])), 1 - result.aWon].join(",") + "\n");
      rows += 2;
    }
    progress(id + 1, total);
  }
  out.end();
  process.stderr.write(`\n${rows} rows, ${draws} draws skipped → ${path}\n`);
}

function montecarlo(pairs: number, runs: number, path: string) {
  const out = open(path, ["pair_id", "dex_a", "dex_b", ...FEATURE_NAMES, "wins_a", "runs", "ms_per_battle"]);
  for (let id = 0; id < pairs; id++) {
    const dexA = pick(rng, DEX_NUMBERS);
    const dexB = pick(rng, DEX_NUMBERS);
    const matchup = engine.prepare(dexA, dexB, nextSeed());
    let wins = 0;
    let decided = 0;
    let first = null;
    const start = performance.now();
    for (let r = 0; r < runs; r++) {
      const result = engine.play(matchup, nextSeed());
      first ??= result.snapshots[0];
      if (result.aWon === null) continue;
      wins += result.aWon;
      decided++;
    }
    const ms = (performance.now() - start) / runs;
    if (!first || decided === 0) continue;
    const f = battleFeatures(first);
    out.write([id, dexA, dexB, ...FEATURE_NAMES.map((k) => fmt(f[k])), wins, decided, ms.toFixed(3)].join(",") + "\n");
    process.stderr.write(`\r${id + 1}/${pairs}`);
  }
  out.end();
  process.stderr.write(`\n→ ${path}\n`);
}

const [command] = positionals;
if (command === "dataset") dataset(Number(values.battles), values.out ?? "../data/battles.csv");
else if (command === "montecarlo") montecarlo(Number(values.pairs), Number(values.runs), values.out ?? "../data/montecarlo.csv");
else {
  console.error("usage: node src/cli.ts dataset|montecarlo [--battles N] [--pairs N --runs N] [--seed S] [--out file]");
  process.exit(1);
}

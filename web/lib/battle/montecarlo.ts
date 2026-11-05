import { chooseAction, replaceFainted } from "./ai.ts";
import { type BattleState, type Choice, type Rng, runTurn } from "./engine.ts";

/** Battles still going after this many turns (per Pokémon on a side) count as a draw (half a win). */
const MAX_TURNS = 60;

/** Plays the battle out with the AI on both sides: 1 if A wins, 0 if B wins, 0.5 for a draw. */
function playOut(start: BattleState, limit: number, rng: Rng): number {
  let st = replaceFainted(start);
  while (!st.winner && st.turn < limit) {
    st = replaceFainted(runTurn(st, chooseAction(st, "a", rng), chooseAction(st, "b", rng), rng).state);
  }
  return st.winner === "a" ? 1 : st.winner === "b" ? 0 : 0.5;
}

const turnLimit = (st: BattleState) => st.turn + MAX_TURNS * (1 + Math.max(st.bench.a.length, st.bench.b.length));

/**
 * Side A's chance to win from this state, by playing the rest of the battle
 * `runs` times with the AI choosing for both sides (moves, switches and
 * replacements). Used during the fight and for team battles; before a 1v1,
 * the ML model gives the same estimate without simulating.
 */
export function winChance(state: BattleState, runs = 200, rng: Rng = Math.random): number {
  if (state.winner) return state.winner === "a" ? 1 : 0;
  const limit = turnLimit(state);
  let wins = 0;
  for (let r = 0; r < runs; r++) wins += playOut(state, limit, rng);
  return wins / runs;
}

/**
 * Side A's chance to win if it makes `choice` this turn (a move, a switch or
 * an item) and the AI plays the rest: what the party screen shows for each
 * possible switch.
 */
export function choiceWinChance(state: BattleState, choice: Choice, runs = 200, rng: Rng = Math.random): number {
  if (state.winner) return state.winner === "a" ? 1 : 0;
  const limit = turnLimit(state);
  let wins = 0;
  for (let r = 0; r < runs; r++) {
    const st = replaceFainted(state, ["b"]);
    wins += playOut(runTurn(st, choice, chooseAction(st, "b", rng), rng).state, limit, rng);
  }
  return wins / runs;
}

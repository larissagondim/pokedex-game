import { chooseAction, replaceFainted } from "./ai.ts";
import { type BattleState, type Rng, runTurn } from "./engine.ts";

/** Battles still going after this many turns (per Pokémon on a side) count as a draw (half a win). */
const MAX_TURNS = 60;

/**
 * Side A's chance to win from this state, by playing the rest of the battle
 * `runs` times with the AI choosing for both sides (moves, switches and
 * replacements). Used during the fight and for team battles; before a 1v1,
 * the ML model gives the same estimate without simulating.
 */
export function winChance(state: BattleState, runs = 200, rng: Rng = Math.random): number {
  if (state.winner) return state.winner === "a" ? 1 : 0;
  let wins = 0;
  const limit = state.turn + MAX_TURNS * (1 + Math.max(state.bench.a.length, state.bench.b.length));
  for (let r = 0; r < runs; r++) {
    let st = replaceFainted(state);
    while (!st.winner && st.turn < limit) {
      st = replaceFainted(runTurn(st, chooseAction(st, "a", rng), chooseAction(st, "b", rng), rng).state);
    }
    wins += st.winner === "a" ? 1 : st.winner === "b" ? 0 : 0.5;
  }
  return wins / runs;
}

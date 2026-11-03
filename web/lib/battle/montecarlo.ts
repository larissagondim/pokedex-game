import { chooseMove } from "./ai.ts";
import { type BattleState, type Rng, runTurn } from "./engine.ts";

/** Battles still going after this many turns count as a draw (half a win). */
const MAX_TURNS = 60;

/**
 * Side A's chance to win from this state, by playing the rest of the battle
 * `runs` times with the AI choosing for both sides. Used during the fight;
 * before it, the ML model gives the same estimate without simulating.
 */
export function winChance(state: BattleState, runs = 200, rng: Rng = Math.random): number {
  if (state.winner) return state.winner === "a" ? 1 : 0;
  let wins = 0;
  for (let r = 0; r < runs; r++) {
    let st = state;
    while (!st.winner && st.turn < state.turn + MAX_TURNS) {
      st = runTurn(st, chooseMove(st.a, st.b, rng), chooseMove(st.b, st.a, rng), rng).state;
    }
    wins += st.winner === "a" ? 1 : st.winner === "b" ? 0 : 0.5;
  }
  return wins / runs;
}

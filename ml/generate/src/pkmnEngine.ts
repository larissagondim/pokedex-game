import { Battle, Dex, type Pokemon, type PokemonSet, Teams } from "@pkmn/sim";
import type { BattleSnapshot, Combatant, MoveInfo } from "../../../web/lib/battleFeatures.ts";
import { chooseMove } from "./agent.ts";
import type { BattleEngine, BattleResult } from "./engine.ts";
import { battleSeed, makeRng } from "./rng.ts";
import { buildSet } from "./sets.ts";

const dex = Dex.forGen(9);
const MAX_TURNS = 60;

const NO_DAMAGE: MoveInfo = { type: "normal", power: 0, category: "status", accuracy: 1, priority: 0 };

const moveInfo = (id: string): MoveInfo => {
  const m = dex.moves.get(id);
  // Pseudo-moves offered by the simulator (e.g. "recharge") aren't in the move table.
  if (!m.exists) return NO_DAMAGE;
  return {
    type: m.type.toLowerCase(),
    power: m.category === "Status" ? 0 : m.basePower,
    category: m.category.toLowerCase() as MoveInfo["category"],
    accuracy: m.accuracy === true ? 1 : m.accuracy / 100,
    priority: m.priority,
  };
};

/** Stat with its boost stage applied (+1 = ×1.5, −1 = ×2/3, …). */
function boosted(p: Pokemon, stat: "atk" | "def" | "spa" | "spd" | "spe") {
  const stage = p.boosts[stat];
  const factor = stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
  return Math.floor(p.storedStats[stat] * factor);
}

/** Simulator state → engine-neutral combatant (stats include boosts). */
function combatant(p: Pokemon): Combatant {
  return {
    dexId: p.species.num,
    level: p.level,
    types: p.getTypes().map((t) => t.toLowerCase()),
    hp: p.hp,
    maxHp: p.maxhp,
    stats: { atk: boosted(p, "atk"), def: boosted(p, "def"), spa: boosted(p, "spa"), spd: boosted(p, "spd"), spe: boosted(p, "spe") },
    status: p.status || null,
    moves: p.moveSlots.map((s) => moveInfo(s.id)),
  };
}

interface Matchup {
  a: PokemonSet;
  b: PokemonSet;
}

/** Choice string for a side, from its current request. */
function choice(battle: Battle, side: "p1" | "p2", me: Combatant, foe: Combatant, rng: () => number): string {
  const request = battle[side].activeRequest as { active?: { moves: { id: string; disabled?: boolean }[] }[] } | null;
  const moves = request?.active?.[0]?.moves;
  if (!moves) return "default";
  const legal = moves.map((m, i) => ({ ...m, slot: i + 1 })).filter((m) => !m.disabled);
  if (legal.length === 0) return "default";
  const index = chooseMove(legal.map((m) => moveInfo(m.id)), me, foe, rng);
  return `move ${legal[index].slot}`;
}

/** Adapter: Pokémon Showdown's engine (@pkmn/sim), gen 9 mechanics, 1v1. */
export const pkmnEngine: BattleEngine<Matchup> = {
  name: "pkmn-sim-gen9",

  prepare(dexA, dexB, seed) {
    const rng = makeRng(seed);
    return { a: buildSet(dexA, rng), b: buildSet(dexB, rng) };
  },

  play({ a, b }, seed): BattleResult {
    const rng = makeRng(seed);
    const battle = new Battle({ formatid: "gen9customgame", seed: battleSeed(rng) });
    battle.setPlayer("p1", { name: "A", team: Teams.pack([a]) });
    battle.setPlayer("p2", { name: "B", team: Teams.pack([b]) });
    battle.choose("p1", "team 1");
    battle.choose("p2", "team 1");

    const snapshots: BattleSnapshot[] = [];
    while (!battle.ended && battle.turn <= MAX_TURNS) {
      const pa = combatant(battle.p1.active[0]);
      const pb = combatant(battle.p2.active[0]);
      snapshots.push({ turn: battle.turn - 1, a: pa, b: pb });
      battle.choose("p1", choice(battle, "p1", pa, pb, rng));
      battle.choose("p2", choice(battle, "p2", pb, pa, rng));
    }
    const aWon = battle.ended ? (battle.winner === "A" ? 1 : battle.winner === "B" ? 0 : null) : null;
    return { snapshots, aWon, turns: battle.turn };
  },
};

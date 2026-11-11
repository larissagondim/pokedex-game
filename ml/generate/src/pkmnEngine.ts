import { Battle, Dex, type Pokemon, type PokemonSet, Teams } from "@pkmn/sim";
import type { BattleSnapshot, Combatant, MoveInfo } from "../../../web/lib/battleFeatures.ts";
import type { BattleMove, BattlePokemon, Boosts, MoveFlag } from "../../../web/lib/battle/types.ts";
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

/** Flags exported with each move (the rest only matter to the simulator). */
const MOVE_FLAGS: MoveFlag[] = ["contact", "sound", "punch", "bite", "pulse", "slicing", "bullet", "powder", "wind", "bypasssub"];

/** Everything the app's battle engine needs about a move. */
function battleMove(id: string): BattleMove {
  const m = dex.moves.get(id);
  const base = { ...moveInfo(id), id: m.id || id, name: m.name || id, pp: m.pp || 1 };
  if (!m.exists) return base;
  const out: BattleMove = base;
  if (m.boosts) out.boosts = { target: m.target === "self" ? "self" : "foe", stats: m.boosts as Boosts };
  if (m.self?.boosts) out.selfBoosts = m.self.boosts as Boosts;
  if (m.status && m.target !== "self") out.status = m.status;
  if (m.drain) out.drain = m.drain;
  if (m.recoil) out.recoil = m.recoil;
  if (m.heal) out.heal = m.heal;
  if (m.secondaries?.length) {
    out.secondary = m.secondaries.map((sec) => ({
      chance: sec.chance ?? 100,
      ...(sec.status ? { status: sec.status } : {}),
      ...(sec.volatileStatus === "flinch" || sec.volatileStatus === "confusion" ? { volatile: sec.volatileStatus } : {}),
      ...(sec.boosts ? { boosts: sec.boosts as Boosts } : {}),
      ...(sec.self?.boosts ? { selfBoosts: sec.self.boosts as Boosts } : {}),
    }));
  }
  if (m.multihit) out.multihit = m.multihit as number | [number, number];
  if (m.critRatio && m.critRatio > 1) out.critRatio = m.critRatio;
  if (m.damage === "level" || typeof m.damage === "number") out.fixedDamage = m.damage;
  if (m.volatileStatus === "confusion" || m.volatileStatus === "protect" || m.volatileStatus === "leechseed") out.volatile = m.volatileStatus;
  if (m.self?.volatileStatus === "lockedmove") out.locked = true;
  if (m.flags.recharge) out.recharge = true;
  const flags = MOVE_FLAGS.filter((f) => m.flags[f]);
  if (flags.length) out.flags = flags;
  return out;
}

/** A Pokémon as it enters battle (full HP): pre-battle prediction and the app's battle engine. */
export function startingCombatant(set: PokemonSet): BattlePokemon {
  const battle = new Battle({ formatid: "gen9customgame", seed: "1,2,3,4" });
  battle.setPlayer("p1", { name: "A", team: Teams.pack([set]) });
  battle.setPlayer("p2", { name: "B", team: Teams.pack([set]) });
  battle.choose("p1", "team 1");
  battle.choose("p2", "team 1");
  const p = battle.p1.active[0];
  return {
    ...combatant(p),
    name: p.species.name,
    moves: p.moveSlots.map((slot) => battleMove(slot.id)),
    weight: p.species.weightkg,
  };
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

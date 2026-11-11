import { Dex, type PokemonSet, type Species, toID } from "@pkmn/sim";
import { TeamGenerators } from "@pkmn/randoms";
import type { Rng } from "./rng.ts";

/**
 * Sets for the simulated battles, all at level 50. Species with a curated
 * random-battle set get one from Showdown's generator (moves, ability and
 * held item, chosen together the way random battles do). The rest get a set
 * built from the learnset (best STAB move per type, then coverage), their
 * first ability, and an Eviolite if they can still evolve (Leftovers if not).
 */

export const LEVEL = 50;
const dex = Dex.forGen(9);
const randoms = TeamGenerators.getTeamGenerator("gen9randombattle") as unknown as {
  randomSets: Record<string, { sets: { movepool: string[]; abilities: string[] }[] }>;
  setSeed(seed: number[]): void;
  randomSet(species: Species, teamDetails?: object, isLead?: boolean, isDoubles?: boolean): PokemonSet;
};

/** Base (non-forme) species for each National Dex number. */
const byNum = new Map<number, Species>();
for (const s of dex.species.all()) {
  if (s.num >= 1 && s.num <= 1025 && !s.forme && !byNum.has(s.num)) byNum.set(s.num, s);
}
export const DEX_NUMBERS = [...byNum.keys()].sort((a, b) => a - b);

/**
 * Moves that only work under special conditions (fail unless..., only on the
 * first turn, need an item...). Fine in curated sets, bad picks by power alone.
 */
const CONDITIONAL = new Set([
  "lastresort", "synchronoise", "focuspunch", "dreameater", "belch", "steelroller", "burnup", "doubleshock",
  "poltergeist", "fakeout", "firstimpression", "shelltrap", "beakblast", "upperhand", "futuresight",
  "doomdesire", "snore", "spitup", "lastrespects", "ragefist", "hyperspacefury", "aurawheel",
]);

const usableAttack = (id: string) => {
  const m = dex.moves.get(id);
  return (
    !CONDITIONAL.has(m.id) &&
    m.exists &&
    m.category !== "Status" &&
    m.basePower > 0 &&
    (m.accuracy === true || m.accuracy >= 70) &&
    !m.flags.charge &&
    !m.flags.recharge &&
    !m.selfdestruct
  );
};

function learnsetMoves(species: Species): string[] {
  const learnset = dex.data.Learnsets[species.id]?.learnset ?? {};
  const attacks = Object.keys(learnset)
    .filter(usableAttack)
    .map((id) => dex.moves.get(id))
    .sort((a, b) => b.basePower - a.basePower);
  const chosen: string[] = [];
  // Best STAB move for each of its types, then strongest moves of new types.
  for (const type of species.types) {
    const m = attacks.find((a) => a.type === type);
    if (m) chosen.push(m.id);
  }
  for (const m of attacks) {
    if (chosen.length >= 4) break;
    if (!chosen.includes(m.id) && !chosen.some((id) => dex.moves.get(id).type === m.type)) chosen.push(m.id);
  }
  return chosen.length ? chosen : ["tackle"];
}

export function buildSet(dexNumber: number, rng: Rng): PokemonSet {
  const species = byNum.get(dexNumber);
  if (!species) throw new Error(`No species #${dexNumber}`);
  const stat = { hp: 85, atk: 85, def: 85, spa: 85, spd: 85, spe: 85 };
  const base = {
    name: species.name,
    species: species.name,
    level: LEVEL,
    nature: "Hardy",
    gender: "",
    evs: stat,
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  };
  if (randoms.randomSets[species.id]?.sets.length) {
    // The generator has its own PRNG: seed it from ours so sets stay reproducible.
    randoms.setSeed(Array.from({ length: 4 }, () => Math.floor(rng() * 65536)));
    const set = randoms.randomSet(species, {}, false, false);
    return { ...base, moves: set.moves.map(toID), ability: set.ability, item: set.item, evs: set.evs, ivs: set.ivs };
  }
  return { ...base, moves: learnsetMoves(species), ability: species.abilities[0], item: species.nfe ? "Eviolite" : "Leftovers" };
}

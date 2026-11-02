import { Dex, type PokemonSet, type Species, toID } from "@pkmn/sim";
import { TeamGenerators } from "@pkmn/randoms";
import { type Rng, pick, sample } from "./rng.ts";

/**
 * Movesets for the simulated battles. Every Pokémon is level 50 with no item
 * (items change stats in ways the features can't see) and neutral spreads.
 * Curated random-battle movesets are used when they exist; otherwise the set
 * is built from the learnset (best STAB move per type, then coverage).
 */

export const LEVEL = 50;
const dex = Dex.forGen(9);
const randoms = TeamGenerators.getTeamGenerator("gen9randombattle") as unknown as {
  randomSets: Record<string, { sets: { movepool: string[]; abilities: string[] }[] }>;
};

/** Base (non-forme) species for each National Dex number. */
const byNum = new Map<number, Species>();
for (const s of dex.species.all()) {
  if (s.num >= 1 && s.num <= 1025 && !s.forme && !byNum.has(s.num)) byNum.set(s.num, s);
}
export const DEX_NUMBERS = [...byNum.keys()].sort((a, b) => a - b);

const usableAttack = (id: string) => {
  const m = dex.moves.get(id);
  return (
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
  const data = randoms.randomSets[species.id];
  let moves: string[];
  let ability = species.abilities[0];
  if (data?.sets.length) {
    const set = pick(rng, data.sets);
    moves = sample(rng, set.movepool, 4).map(toID);
    ability = pick(rng, set.abilities);
  } else {
    moves = learnsetMoves(species);
  }
  const stat = { hp: 85, atk: 85, def: 85, spa: 85, spd: 85, spe: 85 };
  return {
    name: species.name,
    species: species.name,
    level: LEVEL,
    moves,
    ability,
    item: "",
    nature: "Hardy",
    gender: "",
    evs: stat,
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  };
}

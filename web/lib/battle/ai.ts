import { type Combatant, expectedDamage, type MoveInfo } from "../battleFeatures.ts";
import { effectiveness } from "../typeChart.ts";
import { canInflict, effectiveSpeed, type Fighter, type FighterMove, moveImmune, type Rng, stageMultiplier } from "./engine.ts";

/** Chance of a random move instead of the best one, so the foe isn't predictable. */
const RANDOMNESS = 0.15;
/** Same stand-in power the engine uses for variable-power moves. */
const FALLBACK_POWER = 60;

/** The fighter as the damage estimate sees it (current stats with stages). */
const view = (f: Fighter): Combatant => ({
  dexId: f.dexId,
  level: f.level,
  types: f.types,
  hp: f.hp,
  maxHp: f.maxHp,
  stats: {
    atk: f.stats.atk * stageMultiplier(f.boosts.atk),
    def: f.stats.def * stageMultiplier(f.boosts.def),
    spa: f.stats.spa * stageMultiplier(f.boosts.spa),
    spd: f.stats.spd * stageMultiplier(f.boosts.spd),
    spe: effectiveSpeed(f),
  },
  status: f.status,
  moves: f.moves,
});

const isAttack = (m: FighterMove) => m.category !== "status" || m.fixedDamage !== undefined;

/** Average damage if it hits (accuracy not included). */
function damageIfHits(m: FighterMove, me: Fighter, foe: Fighter): number {
  if (m.fixedDamage !== undefined) {
    if (effectiveness(m.type, foe.types) === 0) return 0;
    return m.fixedDamage === "level" ? me.level : m.fixedDamage;
  }
  const move: MoveInfo = { ...m, power: m.power > 0 ? m.power : FALLBACK_POWER, accuracy: 1 };
  return expectedDamage(move, view(me), view(foe));
}

/** Would this status move do anything to the foe right now? */
function statusUseful(m: FighterMove, me: Fighter, foe: Fighter): boolean {
  if (moveImmune(m, foe)) return false;
  if (m.status) return canInflict(m.status, foe);
  if (m.volatile === "confusion") return foe.confusion === 0;
  if (m.volatile === "leechseed") return !foe.seeded && !foe.types.includes("grass");
  if (m.volatile === "protect") return me.protectStreak === 0;
  if (m.heal) return me.hp < me.maxHp / 2;
  if (m.boosts) {
    const stats = Object.keys(m.boosts.stats) as (keyof Fighter["boosts"])[];
    return m.boosts.target === "self" ? stats.some((s) => me.boosts[s] < 4) : stats.some((s) => foe.boosts[s] > -4);
  }
  return false;
}

/** Status moves are worth this share of the best hit when useful. */
const STATUS_VALUE = (m: FighterMove) =>
  m.heal ? 0.9 : m.status ? 0.6 : m.volatile === "protect" ? 0.3 : 0.5;

/**
 * Foe AI. If an attack would knock you out, it takes the surest one (most
 * accurate, then priority if you're faster). Otherwise it picks the best
 * expected damage, with status moves scored when they'd actually work, a
 * little noise between close options and 15% random moves.
 */
export function chooseMove(me: Fighter, foe: Fighter, rng: Rng = Math.random): number {
  const usable = me.moves.map((m, i) => ({ m, i })).filter(({ m }) => m.ppLeft > 0);
  if (usable.length === 0) return 0;
  if (rng() < RANDOMNESS) return usable[Math.floor(rng() * usable.length)].i;

  // Finish it off with the most reliable KO.
  const kos = usable.filter(({ m }) => isAttack(m) && damageIfHits(m, me, foe) >= foe.hp);
  if (kos.length) {
    const foeFaster = effectiveSpeed(foe) > effectiveSpeed(me);
    kos.sort((x, y) => y.m.accuracy - x.m.accuracy || (foeFaster ? y.m.priority - x.m.priority : 0));
    return kos[0].i;
  }

  const bestHit = Math.max(1, ...usable.filter(({ m }) => isAttack(m)).map(({ m }) => damageIfHits(m, me, foe) * m.accuracy));
  let best = usable[0].i;
  let bestScore = -1;
  for (const { m, i } of usable) {
    const score =
      (isAttack(m) ? damageIfHits(m, me, foe) * m.accuracy : statusUseful(m, me, foe) ? bestHit * STATUS_VALUE(m) : 0) *
      (0.9 + rng() * 0.2); // a little noise between similar options
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

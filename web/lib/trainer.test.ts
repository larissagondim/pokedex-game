import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BADGES,
  type BadgeInput,
  type BattleLogEntry,
  battleTotals,
  BOTTOM_STYLES,
  cleanName,
  DEFAULT_APPEARANCE,
  EXTRA_STYLES,
  HAIR_STYLES,
  HAT_STYLES,
  LOG_MAX,
  logBattle,
  NAME_MAX,
  qualifiedBadges,
  randomAppearance,
  rankOf,
  sanitizeAppearance,
  SKIN_TONES,
  SPRITE_H,
  SPRITE_W,
  spritePalette,
  spriteRows,
  stepAppearance,
  TOP_STYLES,
  winStreak,
} from "./trainer.ts";

/** Every combination of the style fields (colors don't change the shape). */
function* allStyles() {
  for (const hair of HAIR_STYLES)
    for (const hat of HAT_STYLES)
      for (const top of TOP_STYLES)
        for (const bottom of BOTTOM_STYLES)
          for (const extra of EXTRA_STYLES) yield { ...DEFAULT_APPEARANCE, hair, hat, top, bottom, extra };
}

test("every style combination gives a full-size sprite with known colors", () => {
  for (const a of allStyles()) {
    const label = `${a.hair}/${a.hat}/${a.top}/${a.bottom}/${a.extra}`;
    const rows = spriteRows(a);
    const palette = spritePalette(a);
    assert.equal(rows.length, SPRITE_H, label);
    for (const row of rows) {
      assert.equal(row.length, SPRITE_W, `${label}: "${row}"`);
      for (const ch of row) assert.ok(ch === "." || ch in palette, `${label}: unknown "${ch}"`);
    }
  }
});

test("both eyes stay visible with every style", () => {
  for (const a of allStyles()) {
    const irises = spriteRows(a).join("").split("i").length - 1;
    assert.equal(irises, 2, `${a.hair}/${a.hat}/${a.top}/${a.bottom}/${a.extra}`);
  }
});

test("the sprite is outlined and leaves no stray pixels", () => {
  const rows = spriteRows(DEFAULT_APPEARANCE);
  // Every filled pixel touching the empty background is outline.
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === "." || ch === "o") return;
      const around = [rows[y - 1]?.[x], rows[y + 1]?.[x], row[x - 1], row[x + 1]];
      assert.ok(!around.includes("."), `(${x}, ${y}) "${ch}" touches the background`);
    }),
  );
});

test("palette colors are valid hex", () => {
  for (const color of Object.values(spritePalette(randomAppearance(() => 0.5)))) assert.match(color, /^#[0-9a-f]{6}$/);
});

test("hats and hair change the sprite", () => {
  const base = spriteRows({ ...DEFAULT_APPEARANCE, hair: "bald", hat: "none" }).join("\n");
  assert.notEqual(spriteRows({ ...DEFAULT_APPEARANCE, hair: "long", hat: "none" }).join("\n"), base);
  assert.notEqual(spriteRows({ ...DEFAULT_APPEARANCE, hair: "bald", hat: "beanie" }).join("\n"), base);
});

test("stepAppearance wraps both ways", () => {
  const last = HAIR_STYLES[HAIR_STYLES.length - 1];
  assert.equal(stepAppearance({ ...DEFAULT_APPEARANCE, hair: last }, "hair", 1).hair, HAIR_STYLES[0]);
  assert.equal(stepAppearance({ ...DEFAULT_APPEARANCE, hair: HAIR_STYLES[0] }, "hair", -1).hair, last);
  assert.equal(stepAppearance({ ...DEFAULT_APPEARANCE, skin: 0 }, "skin", -1).skin, SKIN_TONES.length - 1);
  assert.equal(stepAppearance({ ...DEFAULT_APPEARANCE, hat: "beanie" }, "hat", 1).hat, "none");
});

test("sanitizeAppearance keeps valid values and replaces bad ones", () => {
  const good = randomAppearance(() => 0.99);
  assert.deepEqual(sanitizeAppearance(good), good);
  assert.deepEqual(sanitizeAppearance(null), DEFAULT_APPEARANCE);
  const fixed = sanitizeAppearance({ ...good, hair: "mohawk", skin: 99, topColor: -1, bottomColor: 1.5 });
  assert.equal(fixed.hair, DEFAULT_APPEARANCE.hair);
  assert.equal(fixed.skin, DEFAULT_APPEARANCE.skin);
  assert.equal(fixed.topColor, DEFAULT_APPEARANCE.topColor);
  assert.equal(fixed.bottomColor, DEFAULT_APPEARANCE.bottomColor);
  assert.equal(fixed.hatColor, good.hatColor);
  // A profile saved by the first version (top was a color index) still loads.
  assert.equal(sanitizeAppearance({ ...DEFAULT_APPEARANCE, top: 1 } as unknown).top, DEFAULT_APPEARANCE.top);
});

test("cleanName upper-cases, drops untypable characters and trims", () => {
  assert.equal(cleanName("  ash  ketchum!!"), "ASH KETCHU");
  assert.equal(cleanName("ma'ry-jo"), "MA'RY-JO");
  assert.equal(cleanName("ñandú 😀"), "AND ");
  assert.ok(cleanName("x".repeat(40)).length === NAME_MAX);
});

test("rankOf picks the title and counts wins to the next one", () => {
  assert.deepEqual(rankOf(0), { title: "ROOKIE", next: 5 });
  assert.deepEqual(rankOf(5), { title: "TRAINER", next: 15 });
  assert.deepEqual(rankOf(99), { title: "VETERAN", next: 1 });
  assert.deepEqual(rankOf(500), { title: "CHAMPION", next: null });
});

test("battleTotals sums records and finds the best partner", () => {
  assert.deepEqual(battleTotals({}), { wins: 0, losses: 0, bestId: null });
  assert.deepEqual(battleTotals({ 25: { wins: 0, losses: 3 } }), { wins: 0, losses: 3, bestId: null });
  assert.deepEqual(
    battleTotals({ 6: { wins: 4, losses: 2 }, 25: { wins: 4, losses: 1 }, 150: { wins: 1, losses: 0 } }),
    { wins: 9, losses: 3, bestId: 25 },
  );
  assert.equal(battleTotals({ 9: { wins: 2, losses: 0 }, 3: { wins: 2, losses: 0 } }).bestId, 3);
});

const entry = (won: boolean, size = 1, extra: Partial<BattleLogEntry> = {}): BattleLogEntry => ({
  at: 0,
  player: Array(size).fill(25),
  foe: Array(size).fill(130),
  won,
  odds: 0.5,
  ...extra,
});

test("logBattle keeps the newest LOG_MAX battles, newest first", () => {
  let log: BattleLogEntry[] = [];
  for (let i = 0; i < LOG_MAX + 5; i++) log = logBattle(log, { ...entry(true), at: i });
  assert.equal(log.length, LOG_MAX);
  assert.equal(log[0].at, LOG_MAX + 4);
});

test("winStreak counts wins back from the newest battle", () => {
  assert.equal(winStreak([]), 0);
  assert.equal(winStreak([entry(true), entry(true), entry(false), entry(true)]), 2);
  assert.equal(winStreak([entry(false), entry(true)]), 0);
  assert.equal(winStreak([entry(true), entry(true)]), 2);
});

test("badges follow the data", () => {
  const none: BadgeInput = { wins: 0, log: [], legendary: new Set([150]), party: 0, favorites: 0 };
  assert.deepEqual(qualifiedBadges(none), []);
  const lots: BadgeInput = {
    wins: 9,
    log: [
      entry(true, 3),
      entry(true, 6),
      entry(true, 1, { foe: [150] }),
      entry(true, 1, { odds: 0.2 }),
      entry(true),
      entry(false, 6, { foe: [150], odds: 0.1 }),
    ],
    legendary: new Set([150]),
    party: 5,
    favorites: 10,
  };
  assert.deepEqual(qualifiedBadges(lots), BADGES.map((b) => b.id));
  // Losses don't count, and unknown odds aren't an upset.
  const losses: BadgeInput = { ...none, log: [entry(false, 3), entry(false, 6, { foe: [150], odds: 0.1 }), entry(true, 1, { odds: null })] };
  assert.deepEqual(qualifiedBadges({ ...losses, wins: 1 }), ["first-win"]);
});

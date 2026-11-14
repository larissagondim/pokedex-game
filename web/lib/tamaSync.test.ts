import assert from "node:assert/strict";
import { test } from "node:test";
import { newPet, type Pet, XP_PER_LEVEL } from "./tamagotchi.ts";
import {
  addHistory,
  CODE_ALPHABET,
  diffHistory,
  formatSyncDraft,
  HISTORY_MAX,
  type HistoryEntry,
  newSyncCode,
  nextSyncStep,
  normalizeSyncCode,
  sanitizeHistory,
  sanitizeSave,
} from "./tamaSync.ts";

const T0 = 1_000_000_000_000;
const pet = (uid: string, dexId: number | null, extra: Partial<Pet> = {}): Pet => ({ ...newPet(uid, dexId, T0), ...extra });

test("sync code: 12 symbols of the alphabet in groups of 4", () => {
  const code = newSyncCode((a) => a.forEach((_, i) => (a[i] = i * 37)));
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.ok([...code.replaceAll("-", "")].every((c) => CODE_ALPHABET.includes(c)));
  assert.equal(normalizeSyncCode(code), code);
  assert.notEqual(newSyncCode(), newSyncCode());
});

test("sync code: typed in any case, with or without dashes", () => {
  assert.equal(normalizeSyncCode("k7qm2hxa9rtb"), "K7QM-2HXA-9RTB");
  assert.equal(normalizeSyncCode(" K7QM 2HXA-9RTB "), "K7QM-2HXA-9RTB");
  assert.equal(normalizeSyncCode("K7QM-2HXA-9RT"), null); // too short
  assert.equal(normalizeSyncCode("K7QM-2HXA-9RT0"), null); // 0 isn't in the alphabet
  assert.equal(normalizeSyncCode(undefined), null);
});

test("sync code draft: grouped while typing, other characters dropped", () => {
  assert.equal(formatSyncDraft("k7qm2h"), "K7QM-2H");
  assert.equal(formatSyncDraft("K7QM-2HXA-9RTB-EXTRA"), "K7QM-2HXA-9RTB");
  assert.equal(formatSyncDraft("10#."), "");
});

test("sanitizeSave: keeps a valid save, drops unknown fields", () => {
  const save = sanitizeSave({ pets: [{ ...pet("a", 25), extra: 1 }, pet("b", null)], coins: 150, other: true });
  assert.deepEqual(save, { pets: [pet("a", 25), pet("b", null)], coins: 150 });
});

test("sanitizeSave: rejects malformed saves", () => {
  const ok = pet("a", 25);
  const bad: unknown[] = [
    null,
    { pets: "no", coins: 1 },
    { pets: [], coins: -1 },
    { pets: [], coins: 1.5 },
    { pets: Array.from({ length: 6 }, (_, i) => pet(`p${i}`, 1)), coins: 0 }, // over MAX_SLOTS
    { pets: [ok, ok], coins: 0 }, // same uid twice
    { pets: [{ ...ok, fullness: 101 }], coins: 0 },
    { pets: [{ ...ok, xp: -1 }], coins: 0 },
    { pets: [{ ...ok, dexId: "25" }], coins: 0 },
    { pets: [{ ...ok, uid: "" }], coins: 0 },
    { pets: [{ ...ok, updatedAt: Number.NaN }], coins: 0 },
  ];
  for (const value of bad) assert.equal(sanitizeSave(value), null, JSON.stringify(value));
});

test("diffHistory: adoption, egg, hatching, evolution, level and release", () => {
  const prev = [pet("a", 1), pet("egg", null), pet("gone", 7), pet("lv", 25, { xp: XP_PER_LEVEL - 1 })];
  const next = [pet("a", 2), pet("egg", 172), pet("lv", 25, { xp: XP_PER_LEVEL }), pet("new", 4), pet("egg2", null)];
  const at = T0 + 5;
  assert.deepEqual(diffHistory(prev, next, at), [
    { at, kind: "released", dexId: 7, detail: null },
    { at, kind: "evolved", dexId: 2, detail: 1 },
    { at, kind: "hatched", dexId: 172, detail: null },
    { at, kind: "level", dexId: 25, detail: 2 },
    { at, kind: "adopted", dexId: 4, detail: null },
    { at, kind: "egg", dexId: null, detail: null },
  ] satisfies HistoryEntry[]);
});

test("diffHistory: needs changing is not a milestone", () => {
  const before = [pet("a", 1)];
  assert.deepEqual(diffHistory(before, [pet("a", 1, { fullness: 10, xp: 3, asleep: true })], T0), []);
});

test("addHistory: newest first, capped", () => {
  const entry = (at: number): HistoryEntry => ({ at, kind: "adopted", dexId: 1, detail: null });
  assert.deepEqual(addHistory([entry(1)], [entry(2), entry(3)]).map((e) => e.at), [3, 2, 1]);
  const many = addHistory(Array.from({ length: HISTORY_MAX }, (_, i) => entry(100 - i)), [entry(200)]);
  assert.equal(many.length, HISTORY_MAX);
  assert.equal(many[0].at, 200);
});

test("sanitizeHistory: drops bad entries and caps the list", () => {
  const good: HistoryEntry = { at: 5, kind: "evolved", dexId: 2, detail: 1 };
  assert.deepEqual(sanitizeHistory([good, { at: 1, kind: "nope", dexId: 1, detail: null }, null, { at: 2, kind: "egg", dexId: null }]), [
    good,
    { at: 2, kind: "egg", dexId: null, detail: null },
  ]);
  assert.equal(sanitizeHistory(Array.from({ length: 10 }, () => good), 3).length, 3);
  assert.deepEqual(sanitizeHistory("x"), []);
});

test("nextSyncStep: first write, local changes, and the server winning", () => {
  assert.equal(nextSyncStep(0, false, null), "push"); // nothing on the server yet
  assert.equal(nextSyncStep(3, false, 3), "idle");
  assert.equal(nextSyncStep(3, true, 3), "push");
  assert.equal(nextSyncStep(3, false, 4), "adopt");
  assert.equal(nextSyncStep(3, true, 4), "adopt"); // another device wrote first
  assert.equal(nextSyncStep(0, true, 2), "adopt"); // just linked to an existing save
});

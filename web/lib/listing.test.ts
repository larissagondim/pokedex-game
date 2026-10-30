import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pokemon } from "../data/pokedex.ts";
import { applyListing, statTotal } from "./listing.ts";

const mon = (id: number, name: string, types: string[], total: number) =>
  ({
    id,
    name,
    types,
    stats: { hp: total, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
  }) as Pokemon;

const LIST = [
  mon(1, "Bulbasaur", ["grass", "poison"], 318),
  mon(4, "Charmander", ["fire"], 309),
  mon(6, "Charizard", ["fire", "flying"], 534),
  mon(25, "Pikachu", ["electric"], 320),
  mon(669, "Flabébé", ["fairy"], 303),
];
const ids = (list: Pokemon[]) => list.map((p) => p.id);
const none = new Set<number>();

test("filters by type", () => {
  assert.deepEqual(ids(applyListing(LIST, { filter: "fire", sort: "auto", favorites: none })), [4, 6]);
  assert.deepEqual(ids(applyListing(LIST, { filter: "flying", sort: "auto", favorites: none })), [6]);
  assert.deepEqual(ids(applyListing(LIST, { filter: "ice", sort: "auto", favorites: none })), []);
});

test("filters favorites", () => {
  assert.deepEqual(ids(applyListing(LIST, { filter: "favorites", sort: "auto", favorites: new Set([25, 1]) })), [1, 25]);
});

test("auto keeps the input order; other sorts reorder", () => {
  const shuffled = [LIST[3], LIST[0], LIST[4], LIST[2], LIST[1]];
  assert.deepEqual(ids(applyListing(shuffled, { filter: "all", sort: "auto", favorites: none })), [25, 1, 669, 6, 4]);
  assert.deepEqual(ids(applyListing(shuffled, { filter: "all", sort: "number", favorites: none })), [1, 4, 6, 25, 669]);
  assert.deepEqual(ids(applyListing(shuffled, { filter: "all", sort: "name", favorites: none })), [1, 6, 4, 669, 25]);
  assert.deepEqual(ids(applyListing(shuffled, { filter: "all", sort: "total", favorites: none })), [6, 25, 1, 4, 669]);
});

test("does not mutate the input", () => {
  const copy = [...LIST];
  applyListing(LIST, { filter: "all", sort: "total", favorites: none });
  assert.deepEqual(LIST, copy);
});

test("statTotal sums the six base stats", () => {
  assert.equal(statTotal(LIST[2]), 534);
});

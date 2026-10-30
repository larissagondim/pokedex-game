import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pokemon } from "../data/pokedex.ts";
import { buildSearchIndex, lowerBound, normalize, searchPokemon } from "./search.ts";

const mon = (id: number, name: string) => ({ id, name }) as Pokemon;

const LIST = [
  mon(1, "Bulbasaur"),
  mon(4, "Charmander"),
  mon(5, "Charmeleon"),
  mon(6, "Charizard"),
  mon(10, "Caterpie"),
  mon(25, "Pikachu"),
  mon(35, "Clefairy"),
  mon(122, "Mr. Mime"),
  mon(669, "Flabébé"),
  mon(731, "Pikipek"),
];
const index = buildSearchIndex(LIST);
const names = (q: string) => searchPokemon(index, q).map((p) => p.name);

test("lowerBound finds the first element >= target", () => {
  const sorted = ["a", "c", "c", "e"];
  assert.equal(lowerBound(sorted, ""), 0);
  assert.equal(lowerBound(sorted, "a"), 0);
  assert.equal(lowerBound(sorted, "b"), 1);
  assert.equal(lowerBound(sorted, "c"), 1);
  assert.equal(lowerBound(sorted, "d"), 3);
  assert.equal(lowerBound(sorted, "z"), 4);
  assert.equal(lowerBound([], "a"), 0);
});

test("a prefix returns every match in alphabetical order", () => {
  assert.deepEqual(names("c"), ["Caterpie", "Charizard", "Charmander", "Charmeleon", "Clefairy"]);
  assert.deepEqual(names("char"), ["Charizard", "Charmander", "Charmeleon"]);
  assert.deepEqual(names("pik"), ["Pikachu", "Pikipek"]);
});

test("name search ignores case, accents and outer spaces", () => {
  assert.deepEqual(names("  PIKA "), ["Pikachu"]);
  assert.deepEqual(names("flabebe"), ["Flabébé"]);
  assert.deepEqual(names("Flabé"), ["Flabébé"]);
  assert.deepEqual(names("mr. m"), ["Mr. Mime"]);
});

test("numbers are exact id lookups, with or without # and zero padding", () => {
  assert.deepEqual(names("25"), ["Pikachu"]);
  assert.deepEqual(names("#25"), ["Pikachu"]);
  assert.deepEqual(names("#0025"), ["Pikachu"]);
  assert.deepEqual(names("2"), []);
  assert.deepEqual(names("9999"), []);
});

test("no match and empty query return nothing", () => {
  assert.deepEqual(names("zz"), []);
  assert.deepEqual(names(""), []);
  assert.deepEqual(names("   "), []);
});

test("matches the brute-force filter on random prefixes", () => {
  const alphabet = "abcehilmprtu";
  for (let i = 0; i < 500; i++) {
    const len = 1 + (i % 3);
    let prefix = "";
    for (let j = 0; j < len; j++) prefix += alphabet[(i * 7 + j * 13) % alphabet.length];
    const expected = LIST.filter((p) => normalize(p.name).startsWith(prefix))
      .map((p) => p.name)
      .sort((a, b) => (normalize(a) < normalize(b) ? -1 : 1));
    assert.deepEqual(names(prefix), expected, `prefix "${prefix}"`);
  }
});

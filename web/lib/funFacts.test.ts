import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pokemon, Stats } from "../data/pokedex.ts";
import { candidateFacts, funFacts } from "./funFacts.ts";

let nextId = 1000;
const mon = (over: Omit<Partial<Pokemon>, "stats"> & { stats?: Partial<Stats> }): Pokemon => {
  const { stats, ...rest } = over;
  return {
    id: nextId++,
    name: "Mon",
    types: ["normal"],
    heightM: 1,
    weightKg: 10,
    captureRate: 120,
    color: null,
    habitat: null,
    evolvesFromId: null,
    isBaby: false,
    isLegendary: false,
    isMythical: false,
    stats: { hp: 50, attack: 50, defense: 50, specialAttack: 50, specialDefense: 50, speed: 50, ...stats },
    ...rest,
  } as Pokemon;
};

// 100 ordinary Normal-types plus a few special ones.
const filler = Array.from({ length: 100 }, () => mon({}));
const pikachu = mon({ id: 25, name: "Pikachu", types: ["electric"], weightKg: 6 });
const eevee = mon({ id: 133, name: "Eevee" });
const evolutions = [134, 135, 136].map((id) => mon({ id, evolvesFromId: 133 }));
const giant = mon({ name: "Giant", types: ["ghost", "fairy"], weightKg: 999, heightM: 20, captureRate: 3, isLegendary: true, stats: { hp: 200, speed: 200 } });
const LIST = [...filler, pikachu, eevee, ...evolutions, giant];

const texts = (p: Pokemon) => candidateFacts(p, LIST).map((f) => f.text);

test("ranks extreme stats and sizes", () => {
  const facts = texts(giant);
  assert.ok(facts.some((t) => t.includes("1st highest")), "stat total rank");
  assert.ok(facts.some((t) => t.includes("Speed of 200") || t.includes("HP of 200")), "best stat");
  assert.ok(facts.some((t) => t.includes("1st heaviest")));
  assert.ok(facts.some((t) => t.includes("1st tallest")));
});

test("rare typings, catch rate and legendary status", () => {
  const facts = texts(giant);
  assert.ok(facts.includes("It's the only Ghost/Fairy Pokémon."));
  assert.ok(facts.some((t) => t.includes("as hard to catch as it gets")));
  assert.ok(facts.includes("It's a Legendary Pokémon."));
});

test("branched evolutions and common typings", () => {
  const facts = texts(eevee);
  assert.ok(facts.includes("It can evolve into 3 different Pokémon!"));
  assert.ok(facts.some((t) => t.includes("shares its pure Normal-type typing")));
});

test("weight compared with Pikachu", () => {
  // Enough heavier Pokémon that it isn't in the top 10 by weight.
  const heavier = Array.from({ length: 15 }, () => mon({ weightKg: 100 }));
  const heavy = mon({ weightKg: 60 });
  assert.ok(candidateFacts(heavy, [...LIST, ...heavier, heavy]).some((f) => f.text.includes("as much as 10 Pikachu")));
});

test("funFacts returns the most interesting first, without duplicates", () => {
  const facts = funFacts(giant, LIST);
  assert.equal(facts.length, 3);
  assert.equal(facts[0], "It's the only Ghost/Fairy Pokémon.");
  assert.equal(new Set(facts).size, facts.length);
});

test("ordinals", () => {
  const second = mon({ weightKg: 500 });
  const list = [...LIST, second];
  assert.ok(candidateFacts(second, list).some((f) => f.text.includes("2nd heaviest")));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { REGIONS, regionIndexOf, regionOf } from "./regions.ts";

test("regions cover 1..1025 contiguously, in order", () => {
  assert.equal(REGIONS[0].first, 1);
  assert.equal(REGIONS.at(-1)?.last, 1025);
  for (let i = 1; i < REGIONS.length; i++) {
    assert.equal(REGIONS[i].first, REGIONS[i - 1].last + 1, REGIONS[i].id);
  }
});

test("boundaries map to the right region", () => {
  const id = (n: number) => regionOf(n)?.id;
  assert.equal(id(1), "kanto");
  assert.equal(id(151), "kanto");
  assert.equal(id(152), "johto");
  assert.equal(id(251), "johto");
  assert.equal(id(252), "hoenn");
  assert.equal(id(493), "sinnoh");
  assert.equal(id(494), "unova");
  assert.equal(id(898), "galar");
  assert.equal(id(899), "hisui");
  assert.equal(id(905), "hisui");
  assert.equal(id(906), "paldea");
  assert.equal(id(1025), "paldea");
});

test("ids outside the dex have no region", () => {
  assert.equal(regionOf(0), null);
  assert.equal(regionOf(-3), null);
  assert.equal(regionOf(1026), null);
  assert.equal(regionIndexOf(1026), -1);
});

test("matches a linear scan for every id", () => {
  for (let n = -2; n <= 1030; n++) {
    const expected = REGIONS.findIndex((r) => r.first <= n && n <= r.last);
    assert.equal(regionIndexOf(n), expected, String(n));
  }
});

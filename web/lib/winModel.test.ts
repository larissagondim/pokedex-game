import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { predictFeatures, predictRow, type WinModel } from "./winModel.ts";

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const model: WinModel = read("../public/battle/win-model.json");
const fixture: { version: string; rows: number[][]; expected: number[] } = read("./winModel.fixture.json");

test("browser model matches sklearn on the exported fixture", () => {
  assert.equal(fixture.version, model.version, "fixture and model come from the same export");
  fixture.rows.forEach((row, i) => {
    assert.ok(Math.abs(predictRow(model, row) - fixture.expected[i]) < 1e-5, `row ${i}`);
  });
});

test("named features: order handled, missing ones rejected", () => {
  const named = Object.fromEntries(model.features.map((f, i) => [f, fixture.rows[0][i]]));
  assert.ok(Math.abs(predictFeatures(model, named) - fixture.expected[0]) < 1e-5);
  delete named[model.features[0]];
  assert.throws(() => predictFeatures(model, named), /Missing feature/);
});

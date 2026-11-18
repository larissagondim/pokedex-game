import assert from "node:assert/strict";
import { test } from "node:test";
import { capture, countInRange, EMPTY_PROGRESS, markOf, sanitizeProgress, see, serializeProgress } from "./dexProgress.ts";

test("sanitize keeps valid ids and puts every caught one in seen", () => {
  const p = sanitizeProgress({ seen: [1, "x", -3, 2.5, 4], caught: [7, null] });
  assert.deepEqual([...p.seen].sort((a, b) => a - b), [1, 4, 7]);
  assert.deepEqual([...p.caught], [7]);
  assert.equal(sanitizeProgress(null).seen.size, 0);
  assert.equal(sanitizeProgress("junk").caught.size, 0);
});

test("see and capture add ids and keep the object when nothing is new", () => {
  const a = see(EMPTY_PROGRESS, [25, 1]);
  assert.equal(markOf(a, 25), "seen");
  assert.equal(see(a, [25]), a);
  const b = capture(a, [25, 4]);
  assert.equal(markOf(b, 25), "caught");
  assert.equal(markOf(b, 4), "caught");
  assert.equal(markOf(b, 1), "seen");
  assert.equal(markOf(b, 2), null);
  assert.equal(capture(b, [4]), b);
});

test("countInRange counts a region's share", () => {
  const set = new Set([1, 151, 152, 300]);
  assert.equal(countInRange(set, 1, 151), 2);
  assert.equal(countInRange(set, 152, 251), 1);
});

test("serialize round-trips", () => {
  const p = capture(see(EMPTY_PROGRESS, [3]), [9]);
  assert.deepEqual(sanitizeProgress(serializeProgress(p)), p);
});

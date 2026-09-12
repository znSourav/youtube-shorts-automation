import { test } from "node:test";
import assert from "node:assert/strict";

import { validateScenePlan } from "./validate-scene-plan.ts";

function scenesFor(numbers: number[]): { scene_number: number }[] {
  return numbers.map((n) => ({ scene_number: n }));
}

for (const n of [3, 5, 6, 7]) {
  test(`validateScenePlan accepts a correct 1..N plan at N=${n}`, () => {
    const numbers = Array.from({ length: n }, (_, i) => i + 1);
    const result = validateScenePlan(scenesFor(numbers), n);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });
}

test("validateScenePlan rejects a duplicate scene number with a named error", () => {
  const result = validateScenePlan(scenesFor([1, 2, 2, 4]), 4);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
  assert.match(result.errors[0], /gap or duplicate/i);
});

test("validateScenePlan rejects a gap in scene numbering", () => {
  const result = validateScenePlan(scenesFor([1, 2, 4, 5]), 4);
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /gap or duplicate/i);
});

test("validateScenePlan rejects a plan shorter than the expected count and says so", () => {
  const result = validateScenePlan(scenesFor([1, 2]), 3);
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /Expected 3 scenes, got 2/);
});

test("validateScenePlan rejects a plan longer than the expected count and says so", () => {
  const result = validateScenePlan(scenesFor([1, 2, 3, 4]), 3);
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /Expected 3 scenes, got 4/);
});

test("validateScenePlan rejects an empty array against a non-zero expected count", () => {
  const result = validateScenePlan([], 5);
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /Expected 5 scenes, got 0/);
});

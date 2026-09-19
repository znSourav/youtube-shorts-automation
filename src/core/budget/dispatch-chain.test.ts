import { test } from "node:test";
import assert from "node:assert/strict";

import { serializeDispatch } from "./dispatch-chain.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("two serializeDispatch calls started in the same tick never overlap -- the second enters only after the first exits", async () => {
  const events: string[] = [];

  const first = serializeDispatch(async () => {
    events.push("first-enter");
    await delay(20);
    events.push("first-exit");
    return "first";
  });
  const second = serializeDispatch(async () => {
    events.push("second-enter");
    await delay(5);
    events.push("second-exit");
    return "second";
  });

  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult, "first");
  assert.equal(secondResult, "second");
  assert.deepEqual(events, ["first-enter", "first-exit", "second-enter", "second-exit"]);
});

test("a rejecting inner function does not wedge the queue -- a following call still runs and resolves", async () => {
  const failing = serializeDispatch(async () => {
    throw new Error("boom");
  });
  await assert.rejects(failing, /boom/);

  const following = await serializeDispatch(async () => "still works");
  assert.equal(following, "still works");
});

test("the returned promise resolves with the inner function's own resolved value, unwrapped", async () => {
  const result = await serializeDispatch(async () => ({ value: 42 }));
  assert.deepEqual(result, { value: 42 });
});

test("the returned promise rejects with the inner function's own error, not a wrapped one", async () => {
  class CustomError extends Error {}
  const original = new CustomError("custom failure");

  await assert.rejects(
    serializeDispatch(async () => {
      throw original;
    }),
    (thrown: unknown) => thrown === original,
  );
});

test("three calls queued in order run in that order (first-come-first-served)", async () => {
  const order: number[] = [];
  const calls = [1, 2, 3].map((n) =>
    serializeDispatch(async () => {
      order.push(n);
      await delay(1);
      return n;
    }),
  );
  const results = await Promise.all(calls);

  assert.deepEqual(order, [1, 2, 3]);
  assert.deepEqual(results, [1, 2, 3]);
});

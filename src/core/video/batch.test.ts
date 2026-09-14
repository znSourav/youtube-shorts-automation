import { test } from "node:test";
import assert from "node:assert/strict";

import { runBatchVideoDispatch, type BatchDispatchDeps } from "./batch.ts";

test("every supplied scene number is attempted exactly once, in the order given", async () => {
  const attempted: number[] = [];
  const deps: BatchDispatchDeps = {
    dispatch: async (sceneNumber) => {
      attempted.push(sceneNumber);
      return { ok: true };
    },
  };

  const outcome = await runBatchVideoDispatch([3, 1, 2], deps);

  assert.deepEqual(attempted, [3, 1, 2]);
  assert.equal(outcome.attempted, 3);
  assert.deepEqual(outcome.succeeded, [3, 1, 2]);
  assert.deepEqual(outcome.failed, []);
});

test("a dispatcher returning ok: false for the middle scene still leaves the later scenes attempted and reported in succeeded", async () => {
  const attempted: number[] = [];
  const deps: BatchDispatchDeps = {
    dispatch: async (sceneNumber) => {
      attempted.push(sceneNumber);
      return { ok: sceneNumber !== 2 };
    },
  };

  const outcome = await runBatchVideoDispatch([1, 2, 3], deps);

  assert.deepEqual(attempted, [1, 2, 3]);
  assert.deepEqual(outcome.succeeded, [1, 3]);
  assert.deepEqual(outcome.failed, [2]);
});

test("a dispatcher that throws for one scene is recorded in failed, does not propagate, and does not stop the loop", async () => {
  const attempted: number[] = [];
  const deps: BatchDispatchDeps = {
    dispatch: async (sceneNumber) => {
      attempted.push(sceneNumber);
      if (sceneNumber === 2) {
        throw new Error("simulated dispatch failure");
      }
      return { ok: true };
    },
  };

  const outcome = await runBatchVideoDispatch([1, 2, 3], deps);

  assert.deepEqual(attempted, [1, 2, 3]);
  assert.deepEqual(outcome.succeeded, [1, 3]);
  assert.deepEqual(outcome.failed, [2]);
});

test("calls are sequential, not parallel -- no two dispatch calls overlap in time", async () => {
  const markers: { sceneNumber: number; event: "start" | "end" }[] = [];
  const deps: BatchDispatchDeps = {
    dispatch: async (sceneNumber) => {
      markers.push({ sceneNumber, event: "start" });
      await new Promise((resolve) => setTimeout(resolve, 5));
      markers.push({ sceneNumber, event: "end" });
      return { ok: true };
    },
  };

  await runBatchVideoDispatch([1, 2, 3], deps);

  // Sequential means every "start" is immediately followed by its own "end"
  // before the next scene's "start" ever appears -- no interleaving.
  assert.deepEqual(
    markers,
    [
      { sceneNumber: 1, event: "start" },
      { sceneNumber: 1, event: "end" },
      { sceneNumber: 2, event: "start" },
      { sceneNumber: 2, event: "end" },
      { sceneNumber: 3, event: "start" },
      { sceneNumber: 3, event: "end" },
    ],
  );
});

test("an empty scene list attempts nothing and returns zero counts", async () => {
  let dispatchCalls = 0;
  const deps: BatchDispatchDeps = {
    dispatch: async () => {
      dispatchCalls++;
      return { ok: true };
    },
  };

  const outcome = await runBatchVideoDispatch([], deps);

  assert.equal(dispatchCalls, 0);
  assert.deepEqual(outcome, { attempted: 0, succeeded: [], failed: [] });
});

test("onSceneSettled fires once per scene with the right ok flag", async () => {
  const settled: { sceneNumber: number; ok: boolean }[] = [];
  const deps: BatchDispatchDeps = {
    dispatch: async (sceneNumber) => ({ ok: sceneNumber !== 2 }),
    onSceneSettled: (sceneNumber, ok) => {
      settled.push({ sceneNumber, ok });
    },
  };

  await runBatchVideoDispatch([1, 2, 3], deps);

  assert.deepEqual(settled, [
    { sceneNumber: 1, ok: true },
    { sceneNumber: 2, ok: false },
    { sceneNumber: 3, ok: true },
  ]);
});

import { test } from "node:test";
import assert from "node:assert/strict";

import { createPrismaClient } from "../../lib/db.ts";
import { tmpDatabaseUrl } from "../../lib/test-db.ts";
import { saveStoryWithScenes, UniquenessStatus } from "../persistence/story-repository.ts";
import type { StoryDirectorOutput } from "../story/schema.ts";
import {
  BudgetExceededError,
  ensureCurrentMonthAllocation,
  cumulativeAllocatedUsd,
  cumulativeSpentUsd,
  checkBudget,
} from "./ledger.ts";

// Mirrors src/core/persistence/generation-repository.test.ts's fixture and
// seeding shape exactly. Each test below builds its own temp database via
// tmpDatabaseUrl() + createPrismaClient(url), seeds a Story with
// saveStoryWithScenes when it needs GenerationRecord rows, and disconnects
// in a finally.

function fixtureOutput(): StoryDirectorOutput {
  return {
    story: {
      title: "Budget Ledger Test Story",
      premise: "p",
      story: "s",
      theme: "t",
      emotional_arc: "e",
      ending: "end",
      protagonist_want: "w",
      central_obstacle: "o",
      ending_shape: "es",
    },
    character_bible: {
      name: "Tester",
      appearance: "plain",
      hair: "short",
      clothing: "lab coat",
      distinguishing_features: "none",
    },
    style_bible: {
      medium: "2D animation",
      color_palette: "grayscale",
      character_rendering: "flat",
    },
    scenes: [{ scene_number: 1, duration: 4, story_purpose: "one", image_prompt: "p1", motion_prompt: "m1" }],
  };
}

async function seedStory(storyId: string, url: string): Promise<void> {
  const client = createPrismaClient(url);
  try {
    await saveStoryWithScenes(storyId, fixtureOutput(), UniquenessStatus.ACCEPTED, 0, client);
  } finally {
    await client.$disconnect();
  }
}

async function seedSpend(
  storyId: string,
  url: string,
  estimatedUsd: number,
  billed: boolean = true,
): Promise<void> {
  const client = createPrismaClient(url);
  try {
    await client.generationRecord.create({
      data: {
        storyId,
        sceneId: null,
        generationType: "VIDEO",
        model: "veo-3.1-lite-generate-preview",
        estimatedUsd,
        actualUsd: null,
        billed,
        ok: true,
        message: "Video generated.",
      },
    });
  } finally {
    await client.$disconnect();
  }
}

test("ensureCurrentMonthAllocation called three times in a row leaves exactly one BudgetPeriod row for that month", async () => {
  const url = tmpDatabaseUrl();
  const client = createPrismaClient(url);
  try {
    await ensureCurrentMonthAllocation(client, {});
    await ensureCurrentMonthAllocation(client, {});
    await ensureCurrentMonthAllocation(client, {});

    const rows = await client.budgetPeriod.findMany();
    assert.equal(rows.length, 1);
  } finally {
    await client.$disconnect();
  }
});

test("ensureCurrentMonthAllocation re-run with a different configured figure updates the current month's allocation (BUDGET-02)", async () => {
  const url = tmpDatabaseUrl();
  const client = createPrismaClient(url);
  try {
    await ensureCurrentMonthAllocation(client, { MONTHLY_BUDGET_USD: "15" });
    await ensureCurrentMonthAllocation(client, { MONTHLY_BUDGET_USD: "10" });

    const rows = await client.budgetPeriod.findMany();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].allocatedUsd, 10);
  } finally {
    await client.$disconnect();
  }
});

test("rollover: a prior month's allocation plus the current month's produces a cumulative allocation that gates a call at their sum", async () => {
  const url = tmpDatabaseUrl();
  const client = createPrismaClient(url);
  try {
    // Injected prior month, frozen -- ensureCurrentMonthAllocation never
    // touches a month key other than "now"'s.
    await client.budgetPeriod.create({ data: { month: "2026-08", allocatedUsd: 15 } });

    const now = new Date("2026-09-15T00:00:00Z");
    await ensureCurrentMonthAllocation(client, { MONTHLY_BUDGET_USD: "10" }, now);

    const allocated = await cumulativeAllocatedUsd(client);
    assert.equal(allocated, 25);

    // A call projecting to exactly the rollover-inclusive cumulative total
    // (25) is allowed -- spend so far is 0, so estimate = 25 lands exactly
    // on the inclusive boundary.
    await assert.doesNotReject(() => checkBudget(25, client, { MONTHLY_BUDGET_USD: "10" }, now));
  } finally {
    await client.$disconnect();
  }
});

test("checkBudget resolves when projected spend is well under the cumulative allocation", async () => {
  const url = tmpDatabaseUrl();
  const client = createPrismaClient(url);
  try {
    await assert.doesNotReject(() => checkBudget(1, client, { MONTHLY_BUDGET_USD: "15" }));
  } finally {
    await client.$disconnect();
  }
});

test("checkBudget resolves at the exact inclusive boundary (spend 14.60 + estimate 0.40 against an allocation of 15.00)", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-ledger-boundary-pass";
  await seedStory(storyId, url);
  await seedSpend(storyId, url, 14.6);

  const client = createPrismaClient(url);
  try {
    const spent = await cumulativeSpentUsd(client);
    assert.equal(spent, 14.6);
    await assert.doesNotReject(() => checkBudget(0.4, client, { MONTHLY_BUDGET_USD: "15" }));
  } finally {
    await client.$disconnect();
  }
});

test("checkBudget rejects with BudgetExceededError one cent past the boundary, message contains allocation/spent/estimate to two decimals", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-ledger-boundary-fail";
  await seedStory(storyId, url);
  await seedSpend(storyId, url, 14.6);

  const client = createPrismaClient(url);
  try {
    await assert.rejects(
      () => checkBudget(0.41, client, { MONTHLY_BUDGET_USD: "15" }),
      (err: unknown) => {
        assert.ok(err instanceof BudgetExceededError);
        const message = (err as Error).message;
        assert.match(message, /\$15\.00/);
        assert.match(message, /\$14\.60/);
        assert.match(message, /\$0\.41/);
        assert.match(message, /\$15\.01/);
        return true;
      },
    );
  } finally {
    await client.$disconnect();
  }
});

test("checkBudget rejects with BudgetExceededError for NaN/Infinity/-1 estimates, before touching the database", async () => {
  const url = tmpDatabaseUrl();
  const client = createPrismaClient(url);
  try {
    for (const bad of [NaN, Infinity, -1]) {
      await assert.rejects(() => checkBudget(bad, client), BudgetExceededError);
    }
    // No BudgetPeriod row was created -- validation rejected before any
    // database access, including ensureCurrentMonthAllocation's own write.
    const rows = await client.budgetPeriod.findMany();
    assert.equal(rows.length, 0);
  } finally {
    await client.$disconnect();
  }
});

test("checkBudget rejects with BudgetExceededError when the resolved cumulative allocation is not a positive finite number", async () => {
  const url = tmpDatabaseUrl();
  const client = createPrismaClient(url);
  try {
    // A malformed/corrupted allocation row for an ALREADY-PAST month (never
    // re-touched by ensureCurrentMonthAllocation's upsert, which only ever
    // credits the CURRENT month key) drags the cumulative allocation to a
    // non-positive total even though the current month is always credited a
    // valid positive figure by checkBudget's own preamble -- the same
    // fail-closed shape as a hand-corrupted ceiling on disk (CR-01).
    await client.budgetPeriod.create({ data: { month: "2026-01", allocatedUsd: -1000 } });

    const now = new Date("2026-09-15T00:00:00Z");
    await assert.rejects(
      () => checkBudget(0.4, client, { MONTHLY_BUDGET_USD: "15" }, now),
      BudgetExceededError,
    );
  } finally {
    await client.$disconnect();
  }
});

test("checkBudget counts every GenerationRecord row toward spend regardless of its billed value (conservative accounting)", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-ledger-unbilled";
  await seedStory(storyId, url);
  await seedSpend(storyId, url, 5, false); // billed: false

  const client = createPrismaClient(url);
  try {
    const spent = await cumulativeSpentUsd(client);
    assert.equal(spent, 5);

    // A call that would fit under (allocation - already-spent) but NOT
    // under (allocation - 0) proves the unbilled row still moved the total.
    await assert.rejects(
      () => checkBudget(10.01, client, { MONTHLY_BUDGET_USD: "15" }),
      BudgetExceededError,
    );
    await assert.doesNotReject(() => checkBudget(10, client, { MONTHLY_BUDGET_USD: "15" }));
  } finally {
    await client.$disconnect();
  }
});

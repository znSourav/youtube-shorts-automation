import { test } from "node:test";
import assert from "node:assert/strict";

import { createPrismaClient } from "../../lib/db.ts";
import { tmpDatabaseUrl } from "../../lib/test-db.ts";
import { getBudgetStatus, emptyBudgetStatus } from "./status.ts";

// Mirrors ledger.test.ts's temp-database style exactly -- each test builds
// its own throwaway SQLite file via tmpDatabaseUrl() + createPrismaClient(),
// seeds whatever GenerationRecord/BudgetPeriod rows it needs directly (no
// Story required: GenerationRecord.storyId is nullable, Phase 5 05-02), and
// disconnects in a finally.

async function seedSpend(
  url: string,
  opts: {
    generationType: "STORY" | "UNIQUENESS_CHECK" | "IMAGE" | "VIDEO";
    estimatedUsd: number;
    createdAt: Date;
    storyId?: string | null;
    billed?: boolean;
  },
): Promise<void> {
  const client = createPrismaClient(url);
  try {
    await client.generationRecord.create({
      data: {
        storyId: opts.storyId ?? null,
        sceneId: null,
        generationType: opts.generationType,
        model: "test-model",
        estimatedUsd: opts.estimatedUsd,
        actualUsd: null,
        billed: opts.billed ?? true,
        ok: true,
        message: "test row",
        createdAt: opts.createdAt,
      },
    });
  } finally {
    await client.$disconnect();
  }
}

test("emptyBudgetStatus() returns a zeroed shape, all three buckets present, ok false", () => {
  const status = emptyBudgetStatus();
  assert.equal(status.ok, false);
  assert.equal(status.cumulativeAllocatedUsd, 0);
  assert.equal(status.cumulativeSpentUsd, 0);
  assert.equal(status.remainingUsd, 0);
  assert.equal(status.monthlyAllocationUsd, 0);
  assert.equal(status.monthToDateSpentUsd, 0);
  assert.deepEqual(
    status.breakdown.map((b) => b.type),
    ["VIDEO", "IMAGE", "LLM"],
  );
  for (const entry of status.breakdown) {
    assert.equal(entry.spentUsd, 0);
  }
});

test("getBudgetStatus's breakdown always has exactly three entries, in a stable order, zero for an unused type", async () => {
  const url = tmpDatabaseUrl();
  const client = createPrismaClient(url);
  try {
    const now = new Date("2026-09-15T12:00:00Z");
    await seedSpend(url, { generationType: "VIDEO", estimatedUsd: 1, createdAt: now });

    const status = await getBudgetStatus(client, { MONTHLY_BUDGET_USD: "15" }, now);
    assert.deepEqual(
      status.breakdown.map((b) => b.type),
      ["VIDEO", "IMAGE", "LLM"],
    );
    const byType = Object.fromEntries(status.breakdown.map((b) => [b.type, b.spentUsd]));
    assert.equal(byType.VIDEO, 1);
    assert.equal(byType.IMAGE, 0);
    assert.equal(byType.LLM, 0);
  } finally {
    await client.$disconnect();
  }
});

test("the writing (LLM) bucket sums STORY and UNIQUENESS_CHECK rows; image and video map one-to-one", async () => {
  const url = tmpDatabaseUrl();
  const client = createPrismaClient(url);
  try {
    const now = new Date("2026-09-15T12:00:00Z");
    await seedSpend(url, { generationType: "STORY", estimatedUsd: 0.5, createdAt: now });
    await seedSpend(url, { generationType: "UNIQUENESS_CHECK", estimatedUsd: 0.2, createdAt: now });
    await seedSpend(url, { generationType: "IMAGE", estimatedUsd: 0.3, createdAt: now });
    await seedSpend(url, { generationType: "VIDEO", estimatedUsd: 0.4, createdAt: now });

    const status = await getBudgetStatus(client, { MONTHLY_BUDGET_USD: "15" }, now);
    const byType = Object.fromEntries(status.breakdown.map((b) => [b.type, b.spentUsd]));
    assert.equal(byType.LLM, 0.7);
    assert.equal(byType.IMAGE, 0.3);
    assert.equal(byType.VIDEO, 0.4);
  } finally {
    await client.$disconnect();
  }
});

test("month-to-date excludes a row one second before the window opens and one at the next month's start; includes one exactly at the window's start", async () => {
  const url = tmpDatabaseUrl();
  const client = createPrismaClient(url);
  try {
    const now = new Date("2026-09-15T12:00:00Z");
    await seedSpend(url, { generationType: "IMAGE", estimatedUsd: 1, createdAt: new Date("2026-08-31T23:59:59Z") });
    await seedSpend(url, { generationType: "IMAGE", estimatedUsd: 2, createdAt: new Date("2026-09-01T00:00:00.000Z") });
    await seedSpend(url, { generationType: "IMAGE", estimatedUsd: 4, createdAt: new Date("2026-10-01T00:00:00.000Z") });

    const status = await getBudgetStatus(client, { MONTHLY_BUDGET_USD: "15" }, now);
    const byType = Object.fromEntries(status.breakdown.map((b) => [b.type, b.spentUsd]));
    assert.equal(byType.IMAGE, 2);
    assert.equal(status.monthToDateSpentUsd, 2);
  } finally {
    await client.$disconnect();
  }
});

test("cumulative spend includes rows from previous months; month-to-date does not", async () => {
  const url = tmpDatabaseUrl();
  const client = createPrismaClient(url);
  try {
    const now = new Date("2026-09-15T12:00:00Z");
    await seedSpend(url, { generationType: "VIDEO", estimatedUsd: 3, createdAt: new Date("2026-07-01T00:00:00Z") });
    await seedSpend(url, { generationType: "VIDEO", estimatedUsd: 1, createdAt: now });

    const status = await getBudgetStatus(client, { MONTHLY_BUDGET_USD: "15" }, now);
    assert.equal(status.cumulativeSpentUsd, 4);
    assert.equal(status.monthToDateSpentUsd, 1);
  } finally {
    await client.$disconnect();
  }
});

test("cumulative allocation sums every period row (rollover): 15 + 10 = 25, and remainingUsd reflects it", async () => {
  const url = tmpDatabaseUrl();
  const client = createPrismaClient(url);
  try {
    await client.budgetPeriod.create({ data: { month: "2026-08", allocatedUsd: 15 } });
    const now = new Date("2026-09-15T12:00:00Z");

    const status = await getBudgetStatus(client, { MONTHLY_BUDGET_USD: "10" }, now);
    assert.equal(status.cumulativeAllocatedUsd, 25);
    assert.equal(status.monthlyAllocationUsd, 10);
    assert.equal(status.remainingUsd, 25);
  } finally {
    await client.$disconnect();
  }
});

test("remainingUsd is allowed to go negative when spend exceeds allocation, and is not clamped", async () => {
  const url = tmpDatabaseUrl();
  const client = createPrismaClient(url);
  try {
    const now = new Date("2026-09-15T12:00:00Z");
    await seedSpend(url, { generationType: "VIDEO", estimatedUsd: 20, createdAt: now });

    const status = await getBudgetStatus(client, { MONTHLY_BUDGET_USD: "15" }, now);
    assert.equal(status.remainingUsd, -5);
  } finally {
    await client.$disconnect();
  }
});

test("carried-forward rows with a null story id are counted in both the cumulative and the month-to-date figures", async () => {
  const url = tmpDatabaseUrl();
  const client = createPrismaClient(url);
  try {
    const now = new Date("2026-09-15T12:00:00Z");
    await seedSpend(url, { generationType: "IMAGE", estimatedUsd: 1.5, createdAt: now, storyId: null });

    const status = await getBudgetStatus(client, { MONTHLY_BUDGET_USD: "15" }, now);
    assert.equal(status.cumulativeSpentUsd, 1.5);
    assert.equal(status.monthToDateSpentUsd, 1.5);
  } finally {
    await client.$disconnect();
  }
});

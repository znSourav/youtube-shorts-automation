import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkUniqueness,
  runUniqueStoryDirector,
  maxRegenerationAttempts,
  compareViaLlm,
  buildComparisonPrompt,
  buildComparisonSchema,
  DEFAULT_MAX_REGENERATION_ATTEMPTS,
} from "./check.ts";
import { CeilingExceededError } from "../../lib/spend-ledger.ts";
import type { StoryDirectorInput, StoryDirectorResult } from "../story/director.ts";
import type { StoryDirectorOutput } from "../story/schema.ts";
import type { AcceptedFingerprint } from "../persistence/story-repository.ts";
import type { PendingGenerationRecord } from "../persistence/generation-repository.ts";
import type { StructuralFingerprint } from "./fingerprint.ts";
import type { CompareStructuralSimilarityParams, ClassifyComparisonResult } from "../../providers/llm/gemini.ts";

// Every ledger-touching test below points at a throwaway mkdtempSync path --
// never at the real storage/_smoketest/spend-ledger.json (spend-ledger.test.ts's
// own convention).
function tmpLedgerPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "uniqueness-check-test-"));
  return join(dir, "spend-ledger.json");
}

function fakeComparisonResult(overrides: Partial<ClassifyComparisonResult> = {}): ClassifyComparisonResult {
  return {
    usageMetadata: null,
    estimatedUsd: 0.01,
    modelUsed: "fake-comparison-model",
    blocked: false,
    protagonistMatch: true,
    obstacleMatch: true,
    endingMatch: true,
    ...overrides,
  };
}

// Every test here injects a fake director/historyReader/escalate -- no
// network call, no real ledger write, no dependency on a real Prisma
// connection (RESEARCH.md's "mirrors gemini.test.ts's fixture-object
// convention" note).

const BASE_INPUT: StoryDirectorInput = {
  idea: "a test idea",
  characterDescription: "a test character",
  stylePresetId: "soft-hand-painted-2d",
  mood: "Calm",
  sceneCount: 1,
};

// Long enough sentences that an EXACT match (fixtureOutput's default vs
// DEFAULT_PAST below) scores 1.0 on every field -- a guaranteed reject --
// while a deliberately unrelated override scores 0 -- a guaranteed pass.
const DEFAULT_WANT = "a character wants something specific and concrete that drives the whole story forward";
const DEFAULT_OBSTACLE = "an obstacle stands directly in the way and must be overcome before the want is satisfied";
const DEFAULT_ENDING = "a satisfying emotional conclusion that resolves the tension established at the start";

const DEFAULT_PAST: AcceptedFingerprint = {
  id: "past-1",
  protagonistWant: DEFAULT_WANT,
  centralObstacle: DEFAULT_OBSTACLE,
  endingShape: DEFAULT_ENDING,
};

const DEFAULT_FINGERPRINT: StructuralFingerprint = {
  protagonistWant: DEFAULT_WANT,
  centralObstacle: DEFAULT_OBSTACLE,
  endingShape: DEFAULT_ENDING,
};

function fixtureOutput(
  overrides: Partial<{
    title: string;
    protagonistWant: string;
    centralObstacle: string;
    endingShape: string;
  }> = {},
): StoryDirectorOutput {
  return {
    story: {
      title: overrides.title ?? "Test Story",
      premise: "a fixture premise",
      story: "a fixture story body",
      theme: "a fixture theme",
      emotional_arc: "a fixture arc",
      ending: "a fixture ending",
      protagonist_want: overrides.protagonistWant ?? DEFAULT_WANT,
      central_obstacle: overrides.centralObstacle ?? DEFAULT_OBSTACLE,
      ending_shape: overrides.endingShape ?? DEFAULT_ENDING,
    },
    character_bible: {
      name: "Fixture Character",
      appearance: "plain",
      hair: "short",
      clothing: "simple",
      distinguishing_features: "none",
    },
    style_bible: {
      medium: "2D animation",
      color_palette: "pastel",
      character_rendering: "flat cel shading",
    },
    scenes: [
      {
        scene_number: 1,
        story_purpose: "a fixture scene",
        image_prompt: "a fixture image prompt",
        motion_prompt: "a fixture motion prompt",
      },
    ],
  };
}

function successResult(data: StoryDirectorOutput): StoryDirectorResult {
  return {
    ok: true,
    data,
    usageMetadata: null,
    modelUsed: "fake-model",
    fallbackUsed: false,
    estimatedUsd: 0,
  };
}

// -- checkUniqueness (pure orchestration over an injected escalate hook) --

test("checkUniqueness makes zero escalate calls when history is empty", async () => {
  let escalateCalls = 0;
  const escalate = async () => {
    escalateCalls += 1;
    return true;
  };
  const verdict = await checkUniqueness(DEFAULT_FINGERPRINT, [], { escalate });
  assert.equal(verdict.collided, false);
  assert.equal(escalateCalls, 0);
});

test("checkUniqueness makes zero escalate calls when the deterministic verdict is already reject", async () => {
  let escalateCalls = 0;
  const escalate = async () => {
    escalateCalls += 1;
    return true;
  };
  const verdict = await checkUniqueness(DEFAULT_FINGERPRINT, [DEFAULT_PAST], { escalate });
  assert.equal(verdict.collided, true);
  if (verdict.collided) {
    assert.equal(verdict.viaLlm, false);
    assert.equal(verdict.withStoryId, "past-1");
  }
  assert.equal(escalateCalls, 0);
});

// -- maxRegenerationAttempts --

test('maxRegenerationAttempts returns 2 when the environment variable is "2"', () => {
  assert.equal(maxRegenerationAttempts({ MAX_UNIQUENESS_REGENERATION_ATTEMPTS: "2" }), 2);
});

test("maxRegenerationAttempts falls back to the default of 3 for absent, 0, -1, and a non-numeric value", () => {
  assert.equal(maxRegenerationAttempts({}), DEFAULT_MAX_REGENERATION_ATTEMPTS);
  assert.equal(maxRegenerationAttempts({ MAX_UNIQUENESS_REGENERATION_ATTEMPTS: "0" }), DEFAULT_MAX_REGENERATION_ATTEMPTS);
  assert.equal(maxRegenerationAttempts({ MAX_UNIQUENESS_REGENERATION_ATTEMPTS: "-1" }), DEFAULT_MAX_REGENERATION_ATTEMPTS);
  assert.equal(
    maxRegenerationAttempts({ MAX_UNIQUENESS_REGENERATION_ATTEMPTS: "abc" }),
    DEFAULT_MAX_REGENERATION_ATTEMPTS,
  );
});

// -- runUniqueStoryDirector (the regeneration loop) --

test("an always-colliding director stops at exactly the configured cap and returns the LAST candidate, not the first", async () => {
  const callAvoidPatterns: (StructuralFingerprint | undefined)[] = [];
  const director = async (input: StoryDirectorInput): Promise<StoryDirectorResult> => {
    callAvoidPatterns.push(input.avoidPattern);
    return successResult(fixtureOutput({ title: `Attempt ${callAvoidPatterns.length}` }));
  };
  const historyReader = async () => [DEFAULT_PAST];

  const result = await runUniqueStoryDirector(BASE_INPUT, { director, historyReader });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status, "exhausted");
    assert.equal(result.attempt, DEFAULT_MAX_REGENERATION_ATTEMPTS);
    assert.equal(result.data.story.title, `Attempt ${DEFAULT_MAX_REGENERATION_ATTEMPTS}`);
  }
  assert.equal(callAvoidPatterns.length, DEFAULT_MAX_REGENERATION_ATTEMPTS);
  // Avoid-pattern reaches the director from the second call onward, absent
  // on the first.
  assert.equal(callAvoidPatterns[0], undefined);
  assert.deepEqual(callAvoidPatterns[1], DEFAULT_FINGERPRINT);
});

test("a director whose second call returns a non-colliding candidate is accepted at attempt 2", async () => {
  let calls = 0;
  const director = async (): Promise<StoryDirectorResult> => {
    calls += 1;
    if (calls === 1) {
      return successResult(fixtureOutput({ title: "Attempt 1" }));
    }
    return successResult(
      fixtureOutput({
        title: "Attempt 2",
        protagonistWant: "zzz completely unrelated fixture content one",
        centralObstacle: "zzz completely unrelated fixture content two",
        endingShape: "zzz completely unrelated fixture content three",
      }),
    );
  };
  const historyReader = async () => [DEFAULT_PAST];

  const result = await runUniqueStoryDirector(BASE_INPUT, { director, historyReader });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status, "accepted");
    assert.equal(result.attempt, 2);
    assert.equal(result.data.story.title, "Attempt 2");
  }
  assert.equal(calls, 2);
});

test("an empty history accepts on the first attempt with zero comparisons attempted", async () => {
  let calls = 0;
  const director = async (): Promise<StoryDirectorResult> => {
    calls += 1;
    return successResult(fixtureOutput({ title: "Attempt 1" }));
  };
  const historyReader = async () => [];

  const result = await runUniqueStoryDirector(BASE_INPUT, { director, historyReader });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status, "accepted");
    assert.equal(result.attempt, 1);
  }
  assert.equal(calls, 1);
});

test("runUniqueStoryDirector honours MAX_UNIQUENESS_REGENERATION_ATTEMPTS=2 read from the real environment", async () => {
  const original = process.env.MAX_UNIQUENESS_REGENERATION_ATTEMPTS;
  process.env.MAX_UNIQUENESS_REGENERATION_ATTEMPTS = "2";
  try {
    let calls = 0;
    const director = async (): Promise<StoryDirectorResult> => {
      calls += 1;
      return successResult(fixtureOutput({ title: `Attempt ${calls}` }));
    };
    const historyReader = async () => [DEFAULT_PAST];

    const result = await runUniqueStoryDirector(BASE_INPUT, { director, historyReader });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, "exhausted");
      assert.equal(result.attempt, 2);
    }
    assert.equal(calls, 2);
  } finally {
    if (original === undefined) {
      delete process.env.MAX_UNIQUENESS_REGENERATION_ATTEMPTS;
    } else {
      process.env.MAX_UNIQUENESS_REGENERATION_ATTEMPTS = original;
    }
  }
});

test("a ceiling error on the second attempt yields the first candidate as exhausted rather than propagating", async () => {
  let calls = 0;
  const director = async (): Promise<StoryDirectorResult> => {
    calls += 1;
    if (calls === 1) {
      return successResult(fixtureOutput({ title: "First" }));
    }
    throw new CeilingExceededError("refused by fake ceiling");
  };
  const historyReader = async () => [DEFAULT_PAST];

  const result = await runUniqueStoryDirector(BASE_INPUT, { director, historyReader });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status, "exhausted");
    assert.equal(result.data.story.title, "First");
    assert.equal(result.attempt, 1);
  }
  assert.equal(calls, 2);
});

test("a ceiling error on the very first attempt propagates rather than being swallowed", async () => {
  const director = async (): Promise<StoryDirectorResult> => {
    throw new CeilingExceededError("refused by fake ceiling");
  };
  const historyReader = async () => [];

  await assert.rejects(
    () => runUniqueStoryDirector(BASE_INPUT, { director, historyReader }),
    CeilingExceededError,
  );
});

// -- Task 2: the borderline LLM tie-breaker --
//
// A real middle-band pair (every field's Jaccard score lands in
// [BORDERLINE_THRESHOLD, HIGH_THRESHOLD)), so the deterministic pre-filter
// genuinely escalates rather than rejecting or passing outright -- proving
// these tests exercise the escalate path, not the reject path.
const MIDDLE_BAND_CANDIDATE: StructuralFingerprint = {
  protagonistWant: "a character wants to find their missing sibling somewhere in the city tonight",
  centralObstacle: "a storm blocks every road leading toward home before nightfall arrives",
  endingShape: "a quiet sense of relief settles in once the search finally ends",
};
const MIDDLE_BAND_PAST: AcceptedFingerprint = {
  id: "middle-band-past",
  protagonistWant: "a character wants to find their missing sibling hiding somewhere far away",
  centralObstacle: "a storm blocks every road leading away from town before winter arrives",
  endingShape: "a quiet sense of unease lingers though the search finally ends",
};

// Genuinely different pair whose scores fall below BORDERLINE_THRESHOLD on
// every field -- used to prove the comparator is never invoked for a
// history with no borderline entry.
const CLEARLY_DIFFERENT_PAST: AcceptedFingerprint = {
  id: "clearly-different-past",
  protagonistWant: "a robot dreams of painting a mural nobody has ever seen",
  centralObstacle: "the paint has all dried up in the middle of winter",
  endingShape: "unexpected joy from a first attempt at something new",
};

test("a middle-band pair escalates, and a fake comparator returning all-true yields a collision flagged as LLM-decided", async () => {
  const ledgerPath = tmpLedgerPath();
  const escalate = (candidate: StructuralFingerprint, past: AcceptedFingerprint) =>
    compareViaLlm(candidate, past, {
      ledgerPath,
      comparator: async () => fakeComparisonResult({ protagonistMatch: true, obstacleMatch: true, endingMatch: true }),
    });

  const verdict = await checkUniqueness(MIDDLE_BAND_CANDIDATE, [MIDDLE_BAND_PAST], { escalate });

  assert.equal(verdict.collided, true);
  if (verdict.collided) {
    assert.equal(verdict.viaLlm, true);
    assert.equal(verdict.withStoryId, "middle-band-past");
  }
});

test("the same middle-band pair with a fake comparator returning two-of-three-true yields a pass (D-02 applies on the LLM path)", async () => {
  const ledgerPath = tmpLedgerPath();
  const escalate = (candidate: StructuralFingerprint, past: AcceptedFingerprint) =>
    compareViaLlm(candidate, past, {
      ledgerPath,
      comparator: async () => fakeComparisonResult({ protagonistMatch: true, obstacleMatch: false, endingMatch: true }),
    });

  const verdict = await checkUniqueness(MIDDLE_BAND_CANDIDATE, [MIDDLE_BAND_PAST], { escalate });

  assert.equal(verdict.collided, false);
});

test("the same middle-band pair with a fake comparator returning a blocked result yields a pass and does not throw", async () => {
  const ledgerPath = tmpLedgerPath();
  const escalate = (candidate: StructuralFingerprint, past: AcceptedFingerprint) =>
    compareViaLlm(candidate, past, {
      ledgerPath,
      comparator: async () =>
        fakeComparisonResult({
          blocked: true,
          block: { stage: "prompt", reason: "SAFETY" },
          protagonistMatch: undefined,
          obstacleMatch: undefined,
          endingMatch: undefined,
        }),
    });

  const verdict = await checkUniqueness(MIDDLE_BAND_CANDIDATE, [MIDDLE_BAND_PAST], { escalate });

  assert.equal(verdict.collided, false);
});

test("the comparator is invoked exactly once for one borderline past story and zero times for a history whose every entry falls below the borderline band", async () => {
  const ledgerPath = tmpLedgerPath();
  let comparatorCalls = 0;
  const escalate = (candidate: StructuralFingerprint, past: AcceptedFingerprint) =>
    compareViaLlm(candidate, past, {
      ledgerPath,
      comparator: async () => {
        comparatorCalls += 1;
        return fakeComparisonResult();
      },
    });

  await checkUniqueness(MIDDLE_BAND_CANDIDATE, [CLEARLY_DIFFERENT_PAST], { escalate });
  assert.equal(comparatorCalls, 0, "comparator must not be invoked when no past story reaches the borderline band");

  await checkUniqueness(MIDDLE_BAND_CANDIDATE, [MIDDLE_BAND_PAST], { escalate });
  assert.equal(comparatorCalls, 1, "comparator must be invoked exactly once for one borderline past story");
});

test("a ceiling refusal on the comparison yields a pass and never invokes the comparator", async () => {
  const ledgerPath = tmpLedgerPath();
  // Pre-seed the ledger already at the ceiling, so checkCeiling refuses
  // before the comparator would ever be called.
  const seeded = {
    ceilingUsd: 3.0,
    entries: [
      {
        call: "seed",
        model: "seed-model",
        estimatedUsd: 3.0,
        usageMetadata: null,
        billed: true,
        at: new Date().toISOString(),
      },
    ],
  };
  const { writeFileSync } = await import("node:fs");
  writeFileSync(ledgerPath, JSON.stringify(seeded));

  let comparatorCalls = 0;
  const result = await compareViaLlm(MIDDLE_BAND_CANDIDATE, MIDDLE_BAND_PAST, {
    ledgerPath,
    comparator: async (_params: CompareStructuralSimilarityParams) => {
      comparatorCalls += 1;
      return fakeComparisonResult();
    },
  });

  assert.equal(result, false);
  assert.equal(comparatorCalls, 0);
});

test("checkCeiling runs before dispatch and recordSpend runs after, including for a blocked comparison", async () => {
  const ledgerPath = tmpLedgerPath();
  await compareViaLlm(MIDDLE_BAND_CANDIDATE, MIDDLE_BAND_PAST, {
    ledgerPath,
    comparator: async () =>
      fakeComparisonResult({
        blocked: true,
        block: { stage: "prompt", reason: "SAFETY" },
        protagonistMatch: undefined,
        obstacleMatch: undefined,
        endingMatch: undefined,
      }),
  });

  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].billed, false);
  assert.ok(ledger.entries[0].call.startsWith("uniqueness-comparison:"));
});

test("buildComparisonSchema declares exactly three boolean properties, all required, with no $ref, oneOf, or allOf", () => {
  const schema = buildComparisonSchema() as {
    properties: Record<string, { type: string }>;
    required: string[];
  };
  assert.deepEqual(Object.keys(schema.properties).sort(), ["ending_match", "obstacle_match", "protagonist_match"]);
  for (const prop of Object.values(schema.properties)) {
    assert.equal(prop.type, "boolean");
  }
  assert.deepEqual(schema.required.sort(), ["ending_match", "obstacle_match", "protagonist_match"]);
  const serialized = JSON.stringify(schema);
  assert.ok(!serialized.includes("$ref"));
  assert.ok(!serialized.includes("oneOf"));
  assert.ok(!serialized.includes("allOf"));
});

test("buildComparisonPrompt places both fingerprints after the delimiter and truncates each field at 300 characters", () => {
  const longField = "x".repeat(400);
  const candidate: StructuralFingerprint = {
    protagonistWant: longField,
    centralObstacle: "UNIQUE_CANDIDATE_OBSTACLE",
    endingShape: "UNIQUE_CANDIDATE_ENDING",
  };
  const past: StructuralFingerprint = {
    protagonistWant: "UNIQUE_PAST_WANT",
    centralObstacle: "UNIQUE_PAST_OBSTACLE",
    endingShape: "UNIQUE_PAST_ENDING",
  };
  const prompt = buildComparisonPrompt(candidate, past);

  const delimiterIndex = prompt.indexOf("FINGERPRINTS TO COMPARE");
  const candidateIndex = prompt.indexOf("UNIQUE_CANDIDATE_OBSTACLE");
  const pastIndex = prompt.indexOf("UNIQUE_PAST_WANT");
  assert.ok(delimiterIndex > -1);
  assert.ok(candidateIndex > delimiterIndex, "candidate fingerprint must appear after the delimiter");
  assert.ok(pastIndex > delimiterIndex, "past fingerprint must appear after the delimiter");

  // The 400-char field must have been truncated to 300 -- the full string
  // must NOT appear verbatim in the prompt.
  assert.ok(!prompt.includes(longField));
  assert.ok(prompt.includes("x".repeat(300)));
});

// -- Plan 03-03: spend accumulation (IMAGE-03's story/uniqueness-comparison
// durability requirement) --

test("an always-colliding three-attempt run produces three story-typed spend entries, one per dispatched attempt", async () => {
  const director = async (input: StoryDirectorInput): Promise<StoryDirectorResult> => ({
    ok: true,
    data: fixtureOutput({ title: `Attempt ${input.avoidPattern ? "n" : "1"}` }),
    usageMetadata: null,
    modelUsed: "fake-model",
    fallbackUsed: false,
    estimatedUsd: 0.05,
  });
  const historyReader = async () => [DEFAULT_PAST];

  const result = await runUniqueStoryDirector(BASE_INPUT, { director, historyReader });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status, "exhausted");
    const storyEntries = result.spend.filter((entry) => entry.generationType === "STORY");
    assert.equal(storyEntries.length, DEFAULT_MAX_REGENERATION_ATTEMPTS);
    for (const entry of storyEntries) {
      assert.equal(entry.ok, true);
      assert.ok(Number.isFinite(entry.estimatedUsd) && entry.estimatedUsd > 0);
    }
  }
});

test("an empty history's single accepted attempt produces exactly one story-typed spend entry and zero uniqueness entries", async () => {
  const director = async (): Promise<StoryDirectorResult> => successResult(fixtureOutput());
  const historyReader = async () => [];

  const result = await runUniqueStoryDirector(BASE_INPUT, { director, historyReader });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.spend.length, 1);
    assert.equal(result.spend[0].generationType, "STORY");
  }
});

test("compareViaLlm pushes one uniqueness-typed spend entry when a comparison is dispatched", async () => {
  const ledgerPath = tmpLedgerPath();
  const spend: PendingGenerationRecord[] = [];

  const collided = await compareViaLlm(MIDDLE_BAND_CANDIDATE, MIDDLE_BAND_PAST, {
    ledgerPath,
    spend,
    comparator: async () => fakeComparisonResult({ protagonistMatch: true, obstacleMatch: true, endingMatch: true }),
  });

  assert.equal(collided, true);
  assert.equal(spend.length, 1);
  assert.equal(spend[0].generationType, "UNIQUENESS_CHECK");
  assert.equal(spend[0].ok, true);
  assert.ok(Number.isFinite(spend[0].estimatedUsd) && spend[0].estimatedUsd > 0);
});

test("compareViaLlm still pushes a uniqueness-typed spend entry (ok: false) for a blocked comparison", async () => {
  const ledgerPath = tmpLedgerPath();
  const spend: PendingGenerationRecord[] = [];

  await compareViaLlm(MIDDLE_BAND_CANDIDATE, MIDDLE_BAND_PAST, {
    ledgerPath,
    spend,
    comparator: async () =>
      fakeComparisonResult({
        blocked: true,
        block: { stage: "prompt", reason: "SAFETY" },
        protagonistMatch: undefined,
        obstacleMatch: undefined,
        endingMatch: undefined,
      }),
  });

  assert.equal(spend.length, 1);
  assert.equal(spend[0].ok, false);
});

test("a ceiling-refused comparison pushes nothing to spend -- nothing was dispatched", async () => {
  const ledgerPath = tmpLedgerPath();
  const seeded = {
    ceilingUsd: 3.0,
    entries: [
      { call: "seed", model: "seed-model", estimatedUsd: 3.0, usageMetadata: null, billed: true, at: new Date().toISOString() },
    ],
  };
  const { writeFileSync } = await import("node:fs");
  writeFileSync(ledgerPath, JSON.stringify(seeded));

  const spend: PendingGenerationRecord[] = [];
  const result = await compareViaLlm(MIDDLE_BAND_CANDIDATE, MIDDLE_BAND_PAST, {
    ledgerPath,
    spend,
    comparator: async () => fakeComparisonResult(),
  });

  assert.equal(result, false);
  assert.equal(spend.length, 0);
});

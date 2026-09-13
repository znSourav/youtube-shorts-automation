import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkUniqueness,
  runUniqueStoryDirector,
  maxRegenerationAttempts,
  DEFAULT_MAX_REGENERATION_ATTEMPTS,
} from "./check.ts";
import { CeilingExceededError } from "../../lib/spend-ledger.ts";
import type { StoryDirectorInput, StoryDirectorResult } from "../story/director.ts";
import type { StoryDirectorOutput } from "../story/schema.ts";
import type { AcceptedFingerprint } from "../persistence/story-repository.ts";
import type { StructuralFingerprint } from "./fingerprint.ts";

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

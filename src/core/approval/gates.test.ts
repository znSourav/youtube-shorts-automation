import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateVideoDispatch, evaluateApproval, evaluateImageRegeneration } from "./gates.ts";
import type { StoryWithScenes } from "../persistence/story-repository.ts";

// Fixture-object convention matches src/core/uniqueness/check.test.ts --
// plain objects, no database, no provider, zero network calls.
type SceneOverrides = Partial<StoryWithScenes["scenes"][number]>;

function sceneFixture(sceneNumber: number, overrides: SceneOverrides = {}): StoryWithScenes["scenes"][number] {
  return {
    id: `scene-${sceneNumber}`,
    sceneNumber,
    storyPurpose: "setup",
    imagePrompt: "a test scene",
    motionPrompt: "a slow camera drift",
    durationSeconds: 4,
    imagePath: `storage/stories/fixture-story/scenes/0${sceneNumber}/image.jpg`,
    imageStatus: "READY",
    videoPath: null,
    videoStatus: "WAITING",
    imageAttempts: 0,
    videoAttempts: 0,
    ...overrides,
  };
}

function storyFixture(overrides: Partial<StoryWithScenes> = {}): StoryWithScenes {
  return {
    id: "fixture-story",
    title: "Fixture Story",
    premise: "p",
    fullStory: "s",
    theme: "t",
    emotionalArc: "e",
    ending: "end",
    protagonistWant: "w",
    centralObstacle: "o",
    endingShape: "es",
    characterBible: {},
    styleBible: {},
    uniquenessStatus: "ACCEPTED" as StoryWithScenes["uniquenessStatus"],
    regenerationAttempt: 0,
    imagesApprovedAt: new Date("2026-09-14T00:00:00Z"),
    createdAt: new Date("2026-09-14T00:00:00Z"),
    scenes: [sceneFixture(1), sceneFixture(2), sceneFixture(3)],
    ...overrides,
  };
}

const MAX_ATTEMPTS = 3;

// --- evaluateVideoDispatch ---

test("evaluateVideoDispatch refuses a null story", () => {
  const decision = evaluateVideoDispatch(null, 1, MAX_ATTEMPTS);
  assert.equal(decision.allowed, false);
  assert.equal(!decision.allowed && decision.message, "This story could not be found.");
});

test("evaluateVideoDispatch refuses an unapproved story with the exact approval string, even when every scene is READY", () => {
  const story = storyFixture({ imagesApprovedAt: null });
  const decision = evaluateVideoDispatch(story, 1, MAX_ATTEMPTS);
  assert.equal(decision.allowed, false);
  assert.equal(
    !decision.allowed && decision.message,
    "These images haven't been approved yet. Approve them before generating video.",
  );
});

test("evaluateVideoDispatch grants an approved story with a READY scene, handing back the scene's own imagePath", () => {
  const story = storyFixture();
  const decision = evaluateVideoDispatch(story, 2, MAX_ATTEMPTS);
  assert.equal(decision.allowed, true);
  if (decision.allowed) {
    assert.equal(decision.scene.sceneNumber, 2);
    assert.equal(decision.imagePath, story.scenes[1].imagePath);
  }
});

test("evaluateVideoDispatch refuses an unknown scene number", () => {
  const story = storyFixture();
  const decision = evaluateVideoDispatch(story, 99, MAX_ATTEMPTS);
  assert.equal(decision.allowed, false);
  assert.equal(!decision.allowed && decision.message, "That scene could not be found in this story.");
});

test("evaluateVideoDispatch refuses a scene at exactly the cap, and the message contains the interpolated cap number", () => {
  const story = storyFixture({ scenes: [sceneFixture(1, { videoAttempts: MAX_ATTEMPTS })] });
  const decision = evaluateVideoDispatch(story, 1, MAX_ATTEMPTS);
  assert.equal(decision.allowed, false);
  assert.ok(!decision.allowed && decision.message.includes(`limit of ${MAX_ATTEMPTS} attempts`));
  assert.equal(
    !decision.allowed && decision.message,
    "This scene's video has reached its limit of 3 attempts. The other scenes aren't affected — you can continue with what's ready, or start a new story to try again.",
  );
});

test("evaluateVideoDispatch grants a scene one below the cap", () => {
  const story = storyFixture({ scenes: [sceneFixture(1, { videoAttempts: MAX_ATTEMPTS - 1 })] });
  const decision = evaluateVideoDispatch(story, 1, MAX_ATTEMPTS);
  assert.equal(decision.allowed, true);
});

test("evaluateVideoDispatch refuses an approved story whose target scene image is not READY", () => {
  const story = storyFixture({ scenes: [sceneFixture(1, { imageStatus: "WAITING", imagePath: null })] });
  const decision = evaluateVideoDispatch(story, 1, MAX_ATTEMPTS);
  assert.equal(decision.allowed, false);
  assert.equal(
    !decision.allowed && decision.message,
    "This scene's image isn't ready yet, so its video can't be generated.",
  );
});

test("evaluateVideoDispatch: an unapproved story with a nonexistent scene number returns the approval refusal, not the scene-not-found refusal (ordering)", () => {
  const story = storyFixture({ imagesApprovedAt: null });
  const decision = evaluateVideoDispatch(story, 999, MAX_ATTEMPTS);
  assert.equal(decision.allowed, false);
  assert.equal(
    !decision.allowed && decision.message,
    "These images haven't been approved yet. Approve them before generating video.",
  );
});

// --- evaluateApproval ---

test("evaluateApproval grants when every scene is ready", () => {
  const story = storyFixture();
  const decision = evaluateApproval(story);
  assert.equal(decision.allowed, true);
});

test("evaluateApproval refuses a null story", () => {
  const decision = evaluateApproval(null);
  assert.equal(decision.allowed, false);
  assert.equal(!decision.allowed && decision.message, "This story could not be found.");
});

test("evaluateApproval refuses with the exact locked string when one scene is WAITING", () => {
  const story = storyFixture({ scenes: [sceneFixture(1), sceneFixture(2, { imageStatus: "WAITING" })] });
  const decision = evaluateApproval(story);
  assert.equal(decision.allowed, false);
  assert.equal(
    !decision.allowed && decision.message,
    "All scene images need to be ready before you can approve them.",
  );
});

test("evaluateApproval refuses when a scene is READY status but imagePath is null", () => {
  const story = storyFixture({ scenes: [sceneFixture(1, { imageStatus: "READY", imagePath: null })] });
  const decision = evaluateApproval(story);
  assert.equal(decision.allowed, false);
  assert.equal(
    !decision.allowed && decision.message,
    "All scene images need to be ready before you can approve them.",
  );
});

// --- evaluateImageRegeneration ---

test("evaluateImageRegeneration refuses a null story", () => {
  const decision = evaluateImageRegeneration(null, 1, MAX_ATTEMPTS);
  assert.equal(decision.allowed, false);
  assert.equal(!decision.allowed && decision.message, "This story could not be found.");
});

test("evaluateImageRegeneration refuses an unknown scene", () => {
  const story = storyFixture();
  const decision = evaluateImageRegeneration(story, 99, MAX_ATTEMPTS);
  assert.equal(decision.allowed, false);
  assert.equal(!decision.allowed && decision.message, "That scene could not be found in this story.");
});

test("evaluateImageRegeneration refuses a scene at exactly the cap, and the message contains the interpolated cap number", () => {
  const story = storyFixture({ scenes: [sceneFixture(1, { imageAttempts: MAX_ATTEMPTS })] });
  const decision = evaluateImageRegeneration(story, 1, MAX_ATTEMPTS);
  assert.equal(decision.allowed, false);
  assert.equal(
    !decision.allowed && decision.message,
    "This scene's image has reached its limit of 3 attempts. You can keep the current image and move on, or start a new story for a different result.",
  );
});

test("evaluateImageRegeneration grants a scene below the cap", () => {
  const story = storyFixture({ scenes: [sceneFixture(1, { imageAttempts: MAX_ATTEMPTS - 1 })] });
  const decision = evaluateImageRegeneration(story, 1, MAX_ATTEMPTS);
  assert.equal(decision.allowed, true);
});

test("evaluateImageRegeneration grants with alreadyApproved=false for an unapproved story", () => {
  const story = storyFixture({ imagesApprovedAt: null });
  const decision = evaluateImageRegeneration(story, 1, MAX_ATTEMPTS);
  assert.equal(decision.allowed, true);
  assert.equal(decision.allowed && decision.alreadyApproved, false);
});

test("evaluateImageRegeneration grants with alreadyApproved=true for an approved story (regeneration is NOT blocked by approval)", () => {
  const story = storyFixture({ imagesApprovedAt: new Date("2026-09-14T00:00:00Z") });
  const decision = evaluateImageRegeneration(story, 1, MAX_ATTEMPTS);
  assert.equal(decision.allowed, true);
  assert.equal(decision.allowed && decision.alreadyApproved, true);
});

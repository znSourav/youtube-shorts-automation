import { test } from "node:test";
import assert from "node:assert/strict";

import { createPrismaClient } from "./db.ts";
import {
  saveStoryWithScenes,
  findStoryWithScenes,
  listAcceptedFingerprints,
  UniquenessStatus,
} from "../core/persistence/story-repository.ts";
import type { StoryDirectorOutput } from "../core/story/schema.ts";
import { tmpDatabaseUrl } from "./test-db.ts";

// Every test below points Prisma at a throwaway file inside
// node:os.tmpdir() -- never at the real prisma/dev.db -- exactly as
// spend-ledger.test.ts never points at the real ledger. tmpDatabaseUrl()
// (src/lib/test-db.ts) applies EVERY migration directory, not just the
// first -- see that module's doc comment for why this matters now that
// migration count is no longer one.

function fixtureOutput(overrides: Partial<StoryDirectorOutput["story"]> = {}): StoryDirectorOutput {
  return {
    story: {
      title: "Test Story",
      premise: "A test premise",
      story: "Once upon a test.",
      theme: "testing",
      emotional_arc: "curious to satisfied",
      ending: "It worked.",
      protagonist_want: "a character seeks to prove a test passes",
      central_obstacle: "the test environment is unknown and must be set up",
      ending_shape: "quiet satisfaction from a passing test",
      ...overrides,
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
    scenes: [
      {
        scene_number: 1,
        duration: 4,
        story_purpose: "setup",
        image_prompt: "a test scene",
        motion_prompt: "a slow camera drift",
      },
      {
        scene_number: 2,
        duration: 6,
        story_purpose: "resolution",
        image_prompt: "another test scene",
        motion_prompt: "gentle ambient motion",
      },
    ],
  };
}

test("a story written by one client is readable, with fingerprint columns intact, by a SECOND independently constructed client against the same file (PERSIST-01)", async () => {
  const url = tmpDatabaseUrl();
  const writer = createPrismaClient(url);
  try {
    await saveStoryWithScenes("story-db-test-restart", fixtureOutput(), UniquenessStatus.ACCEPTED, 0, writer);
  } finally {
    await writer.$disconnect();
  }

  // A SEPARATE client instance -- this is what makes it a restart test
  // rather than a cache-read test.
  const reader = createPrismaClient(url);
  try {
    const story = await findStoryWithScenes("story-db-test-restart", reader);
    assert.ok(story, "expected the story to be found");
    assert.equal(story!.scenes.length, 2);
    assert.equal(story!.protagonistWant, "a character seeks to prove a test passes");
    assert.equal(story!.centralObstacle, "the test environment is unknown and must be set up");
    assert.equal(story!.endingShape, "quiet satisfaction from a passing test");
    assert.deepEqual(
      story!.scenes.map((s) => s.sceneNumber),
      [1, 2],
    );
  } finally {
    await reader.$disconnect();
  }
});

test("listAcceptedFingerprints returns an ACCEPTED story and excludes a REJECTED_EXHAUSTED_SHOWN one", async () => {
  const url = tmpDatabaseUrl();
  const client = createPrismaClient(url);
  try {
    await saveStoryWithScenes(
      "story-db-test-accepted",
      fixtureOutput({ title: "Accepted Story" }),
      UniquenessStatus.ACCEPTED,
      0,
      client,
    );
    await saveStoryWithScenes(
      "story-db-test-exhausted",
      fixtureOutput({ title: "Exhausted Story" }),
      UniquenessStatus.REJECTED_EXHAUSTED_SHOWN,
      3,
      client,
    );

    const fingerprints = await listAcceptedFingerprints(client);
    const ids = fingerprints.map((f) => f.id);
    assert.ok(ids.includes("story-db-test-accepted"), "accepted story should be included");
    assert.ok(!ids.includes("story-db-test-exhausted"), "exhausted-shown story should be excluded");
  } finally {
    await client.$disconnect();
  }
});

test("a duplicate story id + scene number pair is rejected by the database (SCENE-01's numbering constraint, enforced independently of the application validator)", async () => {
  const url = tmpDatabaseUrl();
  const client = createPrismaClient(url);
  try {
    await client.story.create({
      data: {
        id: "story-db-test-dup-scene",
        title: "Dup Scene Test",
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
      },
    });
    await client.scene.create({
      data: {
        storyId: "story-db-test-dup-scene",
        sceneNumber: 1,
        storyPurpose: "first",
        imagePrompt: "p1",
        motionPrompt: "m1",
      },
    });

    await assert.rejects(() =>
      client.scene.create({
        data: {
          storyId: "story-db-test-dup-scene",
          sceneNumber: 1,
          storyPurpose: "duplicate",
          imagePrompt: "p2",
          motionPrompt: "m2",
        },
      }),
    );
  } finally {
    await client.$disconnect();
  }
});

test("a Scene's video status and path written before a second client is constructed are still readable afterwards (VIDEO-03's database half)", async () => {
  const url = tmpDatabaseUrl();
  const writer = createPrismaClient(url);
  try {
    await saveStoryWithScenes("story-db-test-video", fixtureOutput(), UniquenessStatus.ACCEPTED, 0, writer);
    const story = await findStoryWithScenes("story-db-test-video", writer);
    const sceneId = story!.scenes[0]!.id;
    await writer.scene.update({
      where: { id: sceneId },
      data: { videoPath: "storage/stories/story-db-test-video/scenes/01/video.mp4", videoStatus: "READY" },
    });
  } finally {
    await writer.$disconnect();
  }

  const reader = createPrismaClient(url);
  try {
    const story = await findStoryWithScenes("story-db-test-video", reader);
    const scene = story!.scenes[0]!;
    assert.equal(scene.videoStatus, "READY");
    assert.equal(scene.videoPath, "storage/stories/story-db-test-video/scenes/01/video.mp4");
  } finally {
    await reader.$disconnect();
  }
});

test("saveStoryWithScenes refuses a story id that would not produce a valid storage path", async () => {
  const url = tmpDatabaseUrl();
  const client = createPrismaClient(url);
  try {
    await assert.rejects(() =>
      saveStoryWithScenes("Invalid Story Id!", fixtureOutput(), UniquenessStatus.ACCEPTED, 0, client),
    );
    const story = await findStoryWithScenes("Invalid Story Id!", client);
    assert.equal(story, null, "the invalid id must never have been written");
  } finally {
    await client.$disconnect();
  }
});

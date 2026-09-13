// Standalone CLI probe for the persistence path (no Next.js runtime), in
// the same spirit as story-probe.ts. Four modes:
//   --write  builds a complete StoryDirectorOutput fixture in-process (no
//            LLM call, no network) and saves it through
//            saveStoryWithScenes -- re-runnable, deletes any existing row
//            with the probe id first (generation records included, so a
//            prior --simulate-assets run's rows never block the delete via
//            a foreign-key constraint).
//   --read   reads the same fixed id back in a FRESH node process invocation
//            -- this is PERSIST-01's two-process restart-survival proof: run
//            `--write` in one process, then `--read` in a separate one.
//   --simulate-assets  performs the exact repository calls the two paid
//            actions (generate-images.ts/generate-video.ts) perform --
//            a ready image update, a ready video update, and one
//            image-typed and one video-typed generation record per scene,
//            all carrying an estimated cost -- against the fixture story
//            --write created, at ZERO provider cost. Re-runnable: clears
//            any generation records this mode previously wrote for the
//            probe story first.
//   --real   calls createStoryAction with a real story idea (real LLM +
//            persistence spend). NOT run by this plan -- 03-04 runs it once
//            behind a budget checkpoint.
// Run with:
//   node --env-file=.env.local src/scripts/persistence-probe.ts --write
//   node --env-file=.env.local src/scripts/persistence-probe.ts --read
//   node --env-file=.env.local src/scripts/persistence-probe.ts --simulate-assets
//   node --env-file=.env.local src/scripts/persistence-probe.ts --real
import { prisma } from "../lib/db.ts";
import { saveStoryWithScenes, findStoryWithScenes, UniquenessStatus } from "../core/persistence/story-repository.ts";
import {
  updateSceneImage,
  updateSceneVideo,
  recordGeneration,
  GenerationType,
  SceneAssetStatus,
} from "../core/persistence/generation-repository.ts";
import { sceneImagePath, sceneVideoPath } from "../core/storage-paths.ts";
import { IMAGE_PRICE_PER_CALL } from "../providers/image/gemini-image.ts";
import { VIDEO_PRICE_PER_SECOND } from "../providers/video/veo.ts";
import type { StoryDirectorOutput } from "../core/story/schema.ts";
import { createStoryAction } from "../app/actions/create-story.ts";
import { loadLedger, totalSpentUsd, CeilingExceededError } from "../lib/spend-ledger.ts";

// Lowercase and hyphens only, so it satisfies storage-paths.ts's
// STORY_ID_PATTERN. Fixed rather than random so --write and --read (run in
// two separate process invocations) agree on which row to exercise.
const PROBE_STORY_ID = "story-probe-persistence";

function buildFixtureOutput(): StoryDirectorOutput {
  return {
    story: {
      title: "The Returned Kite",
      premise: "A quiet fixture story used only by persistence-probe.ts, never shown to a real user.",
      story: "A child finds a lost kite and, after searching, returns it to its owner.",
      theme: "honesty",
      emotional_arc: "curiosity to quiet satisfaction",
      ending: "The child feels a small, private pride in doing the right thing.",
      protagonist_want: "a character seeks to return a found object to its rightful owner",
      central_obstacle: "the owner's identity is unknown and must be discovered",
      ending_shape: "quiet personal satisfaction from an act of honesty",
    },
    character_bible: {
      name: "Probe Child",
      appearance: "small, plain",
      hair: "short black hair",
      clothing: "simple cotton clothes",
      distinguishing_features: "none notable",
    },
    style_bible: {
      medium: "2D animation",
      color_palette: "soft pastels",
      character_rendering: "flat cel shading",
    },
    scenes: [
      {
        scene_number: 1,
        duration: 4,
        story_purpose: "introduce the found object",
        image_prompt: "a child looking down at a kite caught in a bush",
        motion_prompt: "a slow camera drift toward the kite, gentle breeze",
      },
      {
        scene_number: 2,
        duration: 6,
        story_purpose: "the search",
        image_prompt: "a child asking neighbors, holding the kite",
        motion_prompt: "soft ambient light shifting, camera holds steady",
      },
      {
        scene_number: 3,
        duration: 8,
        story_purpose: "the return",
        image_prompt: "a child handing the kite back to another child, both smiling",
        motion_prompt: "gentle particle drift in the air, camera pulls back slowly",
      },
    ],
  };
}

async function runWrite(): Promise<void> {
  // Re-runnable: delete any prior row with this fixed id first (cascade via
  // the Scene/GenerationRecord relations is not modeled with onDelete, so
  // children are deleted explicitly before the parent Story row --
  // generation records first, since Scene rows are themselves referenced by
  // GenerationRecord.sceneId).
  await prisma.generationRecord.deleteMany({ where: { storyId: PROBE_STORY_ID } });
  await prisma.scene.deleteMany({ where: { storyId: PROBE_STORY_ID } });
  await prisma.story.deleteMany({ where: { id: PROBE_STORY_ID } });

  const output = buildFixtureOutput();
  await saveStoryWithScenes(PROBE_STORY_ID, output, UniquenessStatus.ACCEPTED, 0);
  console.log(`PERSISTENCE PROBE: wrote id=${PROBE_STORY_ID} scenes=${output.scenes.length}`);
}

async function runSimulateAssets(): Promise<void> {
  const output = buildFixtureOutput();

  // Re-runnable: clear any generation records this mode previously wrote
  // for the probe story, so records-with-cost never double-counts across
  // repeated invocations.
  await prisma.generationRecord.deleteMany({ where: { storyId: PROBE_STORY_ID } });

  for (const scene of output.scenes) {
    const imagePath = sceneImagePath(PROBE_STORY_ID, scene.scene_number, "jpg");
    await updateSceneImage(PROBE_STORY_ID, scene.scene_number, imagePath, SceneAssetStatus.READY);
    await recordGeneration(
      PROBE_STORY_ID,
      {
        generationType: GenerationType.IMAGE,
        model: "gemini-3.1-flash-image",
        estimatedUsd: IMAGE_PRICE_PER_CALL["gemini-3.1-flash-image"],
        actualUsd: null,
        billed: true,
        ok: true,
        message: "Image generated.",
      },
      scene.scene_number,
    );

    const videoPath = sceneVideoPath(PROBE_STORY_ID, scene.scene_number);
    const durationSeconds = scene.duration ?? 8;
    await updateSceneVideo(PROBE_STORY_ID, scene.scene_number, videoPath, SceneAssetStatus.READY);
    await recordGeneration(
      PROBE_STORY_ID,
      {
        generationType: GenerationType.VIDEO,
        model: "veo-3.1-lite-generate-preview",
        estimatedUsd: durationSeconds * VIDEO_PRICE_PER_SECOND["720p"],
        actualUsd: null,
        billed: true,
        ok: true,
        message: "Video generated.",
      },
      scene.scene_number,
    );
  }

  const story = await findStoryWithScenes(PROBE_STORY_ID);
  if (!story) {
    console.log("PERSISTENCE PROBE: assets mismatch (story not found -- run --write first)");
    process.exitCode = 1;
    return;
  }

  const scenesWithImage = story.scenes.filter((s) => s.imageStatus === "READY" && Boolean(s.imagePath)).length;
  const scenesWithVideo = story.scenes.filter((s) => s.videoStatus === "READY" && Boolean(s.videoPath)).length;
  const records = await prisma.generationRecord.findMany({ where: { storyId: PROBE_STORY_ID } });
  const recordsWithCost = records.filter((r) => r.estimatedUsd !== null && r.estimatedUsd > 0).length;

  console.log(
    `PERSISTENCE PROBE: assets scenes-with-image=${scenesWithImage} scenes-with-video=${scenesWithVideo} ` +
      `records=${records.length} records-with-cost=${recordsWithCost}`,
  );

  const expectedScenes = output.scenes.length;
  const expectedRecords = output.scenes.length * 2; // one image + one video record per scene

  if (
    scenesWithImage === expectedScenes &&
    scenesWithVideo === expectedScenes &&
    records.length === expectedRecords &&
    recordsWithCost === expectedRecords
  ) {
    console.log("PERSISTENCE PROBE: assets ok");
  } else {
    console.log("PERSISTENCE PROBE: assets mismatch");
    process.exitCode = 1;
  }
}

async function runRead(): Promise<void> {
  const story = await findStoryWithScenes(PROBE_STORY_ID);
  if (!story) {
    console.log(`PERSISTENCE PROBE: read missing id=${PROBE_STORY_ID}`);
    process.exitCode = 1;
    return;
  }
  const fingerprintOk =
    typeof story.protagonistWant === "string" &&
    story.protagonistWant.length > 0 &&
    typeof story.centralObstacle === "string" &&
    story.centralObstacle.length > 0 &&
    typeof story.endingShape === "string" &&
    story.endingShape.length > 0;
  const numbers = story.scenes.map((scene) => scene.sceneNumber).join(", ");
  console.log(
    `PERSISTENCE PROBE: read ok id=${story.id} scenes=${story.scenes.length} ` +
      `fingerprint=${fingerprintOk ? "ok" : "missing"} numbers=${numbers}`,
  );
}

async function runReal(): Promise<void> {
  try {
    const result = await createStoryAction({
      idea:
        "A young fisherman finds a paper boat washed up on the riverbank with a child's name on it, and sets out to find who lost it.",
      characterDescription: "A young fisherman, weathered hands, simple cotton shirt, calm expression.",
      stylePresetId: "soft-hand-painted-2d",
      mood: "Emotional",
      sceneCount: 5,
    });

    if (!result.ok) {
      console.log(`PERSISTENCE PROBE: real refused reason=${result.error}`);
      process.exitCode = 1;
      return;
    }

    const ledger = loadLedger();
    console.log(
      `PERSISTENCE PROBE: real ok id=${result.storyId} scenes=${result.data.scenes.length} ` +
        `usd=${totalSpentUsd(ledger).toFixed(4)}`,
    );
    console.log(`  protagonist_want: ${result.data.story.protagonist_want}`);
    console.log(`  central_obstacle: ${result.data.story.central_obstacle}`);
    console.log(`  ending_shape: ${result.data.story.ending_shape}`);
    console.log(`Ledger total: $${totalSpentUsd(ledger).toFixed(4)} of $${ledger.ceilingUsd.toFixed(2)}`);
  } catch (err) {
    if (err instanceof CeilingExceededError) {
      console.log(`PERSISTENCE PROBE: real refused reason=${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--write")) {
    await runWrite();
  } else if (args.includes("--read")) {
    await runRead();
  } else if (args.includes("--simulate-assets")) {
    await runSimulateAssets();
  } else if (args.includes("--real")) {
    await runReal();
  } else {
    console.error("Usage: persistence-probe.ts --write | --read | --simulate-assets | --real");
    process.exitCode = 1;
  }
}

main();

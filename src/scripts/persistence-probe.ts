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
//            persistence spend). Deletes the --write fixture row first
//            (D-05: the probe's own synthetic story must never be part of
//            the accepted history a real candidate is compared against).
//            Records the resulting story id to LAST_STORY_ID_PATH so a
//            subsequent, separately-invoked `--read` (no --id given) reads
//            THIS story back rather than the fixture.
//   --read   reads a story back in a FRESH node process invocation -- this
//            is PERSIST-01's two-process restart-survival proof. Reads
//            --id=<storyId> when given; otherwise reads whichever story id
//            was last written by --write or --real (via LAST_STORY_ID_PATH),
//            falling back to the fixture id if neither has ever run.
// Run with:
//   node --env-file=.env.local src/scripts/persistence-probe.ts --write
//   node --env-file=.env.local src/scripts/persistence-probe.ts --read
//   node --env-file=.env.local src/scripts/persistence-probe.ts --simulate-assets
//   node --env-file=.env.local src/scripts/persistence-probe.ts --real
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
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
import { cumulativeSpentUsd } from "../core/budget/ledger.ts";

// Lowercase and hyphens only, so it satisfies storage-paths.ts's
// STORY_ID_PATTERN. Fixed rather than random so --write and --read (run in
// two separate process invocations) agree on which row to exercise.
const PROBE_STORY_ID = "story-probe-persistence";

// D-06-style segregated throwaway path (mirrors spend-ledger.ts's LEDGER_PATH
// convention): records which story id --write or --real most recently
// produced, so a --read invoked with no --id flag in a SEPARATE process
// knows which row to read back without any in-memory state surviving
// between the two process invocations.
const LAST_STORY_ID_PATH = "storage/_smoketest/persistence-probe-last-id.txt";

function writeLastStoryId(id: string): void {
  const dir = dirname(LAST_STORY_ID_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(LAST_STORY_ID_PATH, id, "utf8");
}

function readLastStoryId(): string {
  try {
    return readFileSync(LAST_STORY_ID_PATH, "utf8").trim();
  } catch {
    // Neither --write nor --real has ever run in this environment -- fall
    // back to the fixture id, preserving --read's pre-03-04 default.
    return PROBE_STORY_ID;
  }
}

/**
 * Deletes the probe fixture's Story row and its children (generation
 * records first, since they reference Scene rows). Shared by --write
 * (so it stays re-runnable) and --real (D-05/T-03-23: the synthetic fixture
 * story must never be part of the accepted history a real candidate is
 * compared against).
 */
async function deleteProbeStoryRows(): Promise<void> {
  await prisma.generationRecord.deleteMany({ where: { storyId: PROBE_STORY_ID } });
  await prisma.scene.deleteMany({ where: { storyId: PROBE_STORY_ID } });
  await prisma.story.deleteMany({ where: { id: PROBE_STORY_ID } });
}

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
  await deleteProbeStoryRows();

  const output = buildFixtureOutput();
  await saveStoryWithScenes(PROBE_STORY_ID, output, UniquenessStatus.ACCEPTED, 0);
  writeLastStoryId(PROBE_STORY_ID);
  console.log(`PERSISTENCE PROBE: wrote id=${PROBE_STORY_ID} scenes=${output.scenes.length}`);
}

/**
 * Phase 5 (05-04): GenerationRecord is now the real budget's own
 * authoritative ledger (checkBudget sums it directly) -- this mode writes
 * synthetic, zero-provider-cost generation records carrying real-looking
 * dollar amounts for the fixture story, so it MUST delete them again before
 * it returns, or they would permanently inflate her real recorded spend
 * until some later, unrelated invocation happened to clear them. Wrapped in
 * try/finally so the cleanup runs on every exit path (including the
 * defensive "story not found" early return), not just the success path --
 * main()'s own before/after spend guard is what proves this cleanup
 * actually worked, not the plan's own comment.
 */
async function runSimulateAssets(): Promise<void> {
  const output = buildFixtureOutput();

  // Re-runnable: clear any generation records this mode previously wrote
  // for the probe story, so records-with-cost never double-counts across
  // repeated invocations.
  await prisma.generationRecord.deleteMany({ where: { storyId: PROBE_STORY_ID } });

  try {
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
  } finally {
    // Restore the real cumulative spend total to exactly what it was before
    // this mode ran -- the synthetic amounts have already been read back
    // and asserted on above; they must not linger in the authoritative
    // table a moment longer than that.
    await prisma.generationRecord.deleteMany({ where: { storyId: PROBE_STORY_ID } });
  }
}

async function runRead(): Promise<void> {
  const idArg = process.argv.slice(2).find((arg) => arg.startsWith("--id="));
  const storyId = idArg ? idArg.slice("--id=".length) : readLastStoryId();

  const story = await findStoryWithScenes(storyId);
  if (!story) {
    console.log(`PERSISTENCE PROBE: read missing id=${storyId}`);
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

// 03-04 Task 2: a genuinely fourth story idea, unrelated to Phase 2's three
// real dev-test stories (boy-trades-marble-for-a-kite, girl-and-grandmother's
// -broken-bangle, fisherman-and-paper-boat -- see 02-PROOF-RUN.md) in
// protagonist, setting, central object, and emotional arc alike: an elderly
// VILLAGE POSTMAN (not a child, not a fisherman) finds an old UNDELIVERED
// LETTER (not a kite/bangle/boat) in his mailbag and sets out to finally
// deliver it, an arc of quiet DUTY AND BELATED CLOSURE (not
// longing/family-history/reunion). Written in Banglish, matching the
// product's real expected input register (typed Bangla or Banglish), per
// STORY-01/02.
const REAL_PROBE_IDEA =
  "Ekjon briddho postman tar chithir bag-e onek bochorer purono ekta na-deya chithi khuje pay, ebong seta " +
  "thik thikanay pouche debar jonno gramer pothe rowna dey.";
const REAL_PROBE_CHARACTER_DESCRIPTION =
  "An elderly postman with silver hair and a weathered face, wearing a faded khaki uniform and cap, carrying a worn leather mail bag, riding an old bicycle.";

async function runReal(): Promise<void> {
  // D-05/T-03-23: delete the --write fixture row first so it is never part
  // of the accepted history the real candidate below is compared against.
  await deleteProbeStoryRows();

  try {
    const result = await createStoryAction({
      idea: REAL_PROBE_IDEA,
      characterDescription: REAL_PROBE_CHARACTER_DESCRIPTION,
      stylePresetId: "soft-hand-painted-2d",
      mood: "Emotional",
      sceneCount: 5,
    });

    if (!result.ok) {
      console.log(`PERSISTENCE PROBE: real refused reason=${result.error}`);
      process.exitCode = 1;
      return;
    }

    writeLastStoryId(result.storyId);

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

// Tight tolerance -- the real amounts this table carries are dollars-and-
// cents figures (never sub-cent noise from floating point), so any
// difference above a hundredth of a cent is a real, reportable change, not
// rounding error.
const SPEND_GUARD_TOLERANCE_USD = 0.00005;

/**
 * Phase 5 (05-04): captures the real cumulative spend total before ANY mode
 * runs and fails loudly if it differs afterward. `--real` is deliberately
 * excluded -- it dispatches a genuine, budget-gated LLM call (through
 * createStoryAction) and is SUPPOSED to move the total; the guard exists to
 * catch SYNTHETIC fixture money (--write/--simulate-assets) leaking into
 * her real recorded spend, never to block a real, properly-accounted
 * dispatch from completing.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const guarded = !args.includes("--real");
  const spentBefore = guarded ? await cumulativeSpentUsd() : null;

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
    return;
  }

  if (guarded && spentBefore !== null) {
    const spentAfter = await cumulativeSpentUsd();
    if (Math.abs(spentAfter - spentBefore) > SPEND_GUARD_TOLERANCE_USD) {
      console.error(
        `PERSISTENCE PROBE: SPEND TOTAL CHANGED -- before=$${spentBefore.toFixed(4)} after=$${spentAfter.toFixed(4)}. ` +
          "This mode must never move her real cumulative spend.",
      );
      process.exitCode = 1;
    }
  }
}

main();

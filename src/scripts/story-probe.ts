// Standalone CLI probe for the Story Director path (no Next.js runtime),
// in the same spirit as Phase 1's smoke-test.ts. Exercises runStoryDirector
// directly and prints a single machine-checkable outcome line, per plan
// 02-02 Task 1. With --images, plan 02-03 Task 1 extends this to also drive
// generateSceneImagesAction -- the exact same "use server" action path the
// browser UI calls -- so the whole story-to-images chain has one real,
// scriptable probe. Plan 02-04 Task 1 adds a `--video=<sceneNumber>` mode
// (paired with `--story-id=<id>`) that drives generateSceneVideoAction
// against an already-generated scene image, without paying for a fresh
// story/image run -- this phase has no story.json persistence yet (Phase 3),
// so the video-only mode constructs a minimal probe Scene rather than
// reading one back off disk; `--duration=`/`--motion-prompt=` let the caller
// carry over the REAL values a prior `--images` run printed, when the point
// is to prove the pipeline against real recorded numbers rather than an
// arbitrary test value. Run with:
//   node --env-file=.env.local src/scripts/story-probe.ts [--scenes=N] [--idea=...] [--character=...] [--images]
//   node --env-file=.env.local src/scripts/story-probe.ts --story-id=<id> --video=<n> [--duration=N] [--motion-prompt=...]
import { readdirSync, statSync } from "node:fs";

import { runStoryDirector } from "../core/story/director.ts";
import { generateSceneImagesAction } from "../app/actions/generate-images.ts";
import { generateSceneVideoAction } from "../app/actions/generate-video.ts";
import { sceneDir } from "../core/storage-paths.ts";
import type { Scene } from "../core/story/schema.ts";
import { loadLedger, totalSpentUsd } from "../lib/spend-ledger.ts";
import { CeilingExceededError } from "../lib/spend-ledger.ts";

// A deliberately safe, camera/environment-only default (mirrors CR-03's
// conservative phrasing) for the video-only probe mode when the caller
// doesn't supply their own via --motion-prompt=.
const DEFAULT_TEST_MOTION_PROMPT =
  "A slow, gentle camera drift across the scene, with soft ambient motion in the environment. " +
  "The subject holds its pose, calm and still.";

// D-05: genuinely different from the CR-03 follow-up's "girl in a magical
// garden" content already tested in Phase 1.
const DEFAULT_IDEA =
  "A shy village boy trades his only marble for a broken kite from a traveling peddler, and slowly learns to mend and fly it himself.";
const DEFAULT_CHARACTER_DESCRIPTION =
  "A shy 9-year-old village boy, short and slight, with tousled black hair and a patched brown vest over a simple cotton shirt.";

interface ProbeArgs {
  scenes: number;
  idea: string;
  images: boolean;
  video?: number;
  storyId?: string;
  duration?: number;
  motionPrompt?: string;
  character?: string;
}

function parseArgs(argv: string[]): ProbeArgs {
  // D-04: default to the reduced 3-scene scale for debugging passes.
  let scenes = 3;
  let idea = DEFAULT_IDEA;
  let images = false;
  let video: number | undefined;
  let storyId: string | undefined;
  let duration: number | undefined;
  let motionPrompt: string | undefined;
  let character: string | undefined;
  for (const arg of argv) {
    if (arg.startsWith("--scenes=")) {
      scenes = Number(arg.slice("--scenes=".length));
    } else if (arg.startsWith("--idea=")) {
      idea = arg.slice("--idea=".length);
    } else if (arg === "--images") {
      images = true;
    } else if (arg.startsWith("--video=")) {
      video = Number(arg.slice("--video=".length));
    } else if (arg.startsWith("--story-id=")) {
      storyId = arg.slice("--story-id=".length);
    } else if (arg.startsWith("--duration=")) {
      duration = Number(arg.slice("--duration=".length));
    } else if (arg.startsWith("--motion-prompt=")) {
      motionPrompt = arg.slice("--motion-prompt=".length);
    } else if (arg.startsWith("--character=")) {
      character = arg.slice("--character=".length);
    }
  }
  return { scenes, idea, images, video, storyId, duration, motionPrompt, character };
}

// Locates the already-written image.<ext> file under a scene's directory --
// storage-paths.ts's sceneImagePath() needs the extension as an input, which
// this video-only probe mode doesn't otherwise know (no story.json
// persistence yet, Phase 3), so it is discovered from disk instead.
function findSceneImagePath(storyId: string, sceneNumber: number): string {
  const dir = sceneDir(storyId, sceneNumber);
  const entries = readdirSync(dir);
  const imageFile = entries.find((entry) => entry.startsWith("image."));
  if (!imageFile) {
    throw new Error(`No image.* file found under ${dir} -- generate this scene's image first.`);
  }
  return `${dir}/${imageFile}`;
}

// Drives generateSceneVideoAction directly against an already-generated
// scene image, without calling runStoryDirector again (--story-id skips
// paying for a fresh story/image run this probe mode doesn't need).
async function runVideoProbe(storyId: string, sceneNumber: number, duration?: number, motionPrompt?: string): Promise<void> {
  const imagePath = findSceneImagePath(storyId, sceneNumber);
  const scene: Scene = {
    scene_number: sceneNumber,
    duration,
    story_purpose: "story-probe video test",
    image_prompt: "",
    motion_prompt: motionPrompt ?? DEFAULT_TEST_MOTION_PROMPT,
  };

  const result = await generateSceneVideoAction(storyId, scene, imagePath);
  const bytes = result.ok && result.videoPath ? statSync(result.videoPath).size : 0;
  console.log(
    `VIDEO: scene=${sceneNumber} ok=${result.ok} path=${result.videoPath ?? "-"} bytes=${bytes} ` +
      `seconds=${result.durationSeconds}`,
  );
  if (!result.ok) {
    console.log(`VIDEO MESSAGE: ${result.message}`);
  }

  const ledger = loadLedger();
  console.log(`Ledger total: $${totalSpentUsd(ledger).toFixed(4)} of $${ledger.ceilingUsd.toFixed(2)}`);
}

// Matches src/core/storage-paths.ts's STORY_ID_PATTERN (lowercase
// alphanumerics and hyphens only) -- Date.now() is all digits and
// Math.random().toString(36) is [0-9a-z], so no extra sanitizing is needed.
function generateStoryId(): string {
  return `story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function main(): Promise<void> {
  const { scenes, idea, images, video, storyId: storyIdArg, duration, motionPrompt, character } = parseArgs(
    process.argv.slice(2),
  );

  // Video-only mode: --story-id=<id> --video=<n>, no fresh story/image call.
  if (storyIdArg && video !== undefined) {
    try {
      await runVideoProbe(storyIdArg, video, duration, motionPrompt);
    } catch (err) {
      if (err instanceof CeilingExceededError) {
        console.log(`STORY PROBE: blocked reason=${err.message}`);
        process.exitCode = 1;
        return;
      }
      throw err;
    }
    return;
  }

  try {
    const result = await runStoryDirector({
      idea,
      characterDescription: character ?? DEFAULT_CHARACTER_DESCRIPTION,
      stylePresetId: "soft-hand-painted-2d",
      mood: "Emotional",
      sceneCount: scenes,
    });

    if (!result.ok) {
      console.log(`STORY PROBE: blocked reason=${result.detail}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      `STORY PROBE: ok title="${result.data.story.title}" scenes=${result.data.scenes.length} ` +
        `model=${result.modelUsed} usd=${result.estimatedUsd.toFixed(4)}`,
    );
    console.log(`Scene numbers: ${result.data.scenes.map((scene) => scene.scene_number).join(", ")}`);
    // §14: durations should vary (4/6/8s), not default to the max every
    // time -- printed per scene so a real proof run's evidence can be
    // recorded verbatim rather than re-derived (02-04 Task 2).
    console.log(`Scene durations: ${result.data.scenes.map((scene) => scene.duration ?? "unset").join(", ")}`);
    console.log(`Fallback model used: ${result.fallbackUsed}`);
    console.log(`usageMetadata: ${JSON.stringify(result.usageMetadata)}`);
    // Printed straight from the already-parsed, already-validated
    // result.data object -- NOT via logRawResponse (which deliberately
    // redacts long strings, per lib/log-response.ts's secret/payload-safe
    // policy) -- so a real proof run (02-04 Task 2) can quote the full
    // premise/ending verbatim for its Bangla/Banglish comparison.
    console.log(`Premise: ${result.data.story.premise}`);
    console.log(`Theme: ${result.data.story.theme}`);
    console.log(`Emotional arc: ${result.data.story.emotional_arc}`);
    console.log(`Ending: ${result.data.story.ending}`);
    for (const scene of result.data.scenes) {
      console.log(`  Scene ${scene.scene_number} purpose: ${scene.story_purpose}`);
    }

    if (images) {
      const storyId = generateStoryId();
      const statuses = await generateSceneImagesAction(
        storyId,
        result.data.scenes,
        result.data.character_bible,
        result.data.style_bible,
      );

      let okCount = 0;
      for (const status of statuses) {
        const bytes = status.ok && status.imagePath ? statSync(status.imagePath).size : 0;
        if (status.ok) okCount++;
        console.log(`IMAGE: scene=${status.sceneNumber} ok=${status.ok} path=${status.imagePath ?? "-"} bytes=${bytes}`);
      }
      console.log(`IMAGES DONE: ${okCount}/${statuses.length}`);
    }

    const ledger = loadLedger();
    console.log(`Ledger total: $${totalSpentUsd(ledger).toFixed(4)} of $${ledger.ceilingUsd.toFixed(2)}`);
  } catch (err) {
    if (err instanceof CeilingExceededError) {
      console.log(`STORY PROBE: blocked reason=${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

main();

// Standalone CLI probe for the Story Director path (no Next.js runtime),
// in the same spirit as Phase 1's smoke-test.ts. Exercises runStoryDirector
// directly and prints a single machine-checkable outcome line, per plan
// 02-02 Task 1. With --images, plan 02-03 Task 1 extends this to also drive
// generateSceneImagesAction -- the exact same "use server" action path the
// browser UI calls -- so the whole story-to-images chain has one real,
// scriptable probe. Run with:
//   node --env-file=.env.local src/scripts/story-probe.ts [--scenes=N] [--idea=...] [--images]
import { statSync } from "node:fs";

import { runStoryDirector } from "../core/story/director.ts";
import { generateSceneImagesAction } from "../app/actions/generate-images.ts";
import { loadLedger, totalSpentUsd } from "../lib/spend-ledger.ts";
import { CeilingExceededError } from "../lib/spend-ledger.ts";

// D-05: genuinely different from the CR-03 follow-up's "girl in a magical
// garden" content already tested in Phase 1.
const DEFAULT_IDEA =
  "A shy village boy trades his only marble for a broken kite from a traveling peddler, and slowly learns to mend and fly it himself.";
const DEFAULT_CHARACTER_DESCRIPTION =
  "A shy 9-year-old village boy, short and slight, with tousled black hair and a patched brown vest over a simple cotton shirt.";

function parseArgs(argv: string[]): { scenes: number; idea: string; images: boolean } {
  // D-04: default to the reduced 3-scene scale for debugging passes.
  let scenes = 3;
  let idea = DEFAULT_IDEA;
  let images = false;
  for (const arg of argv) {
    if (arg.startsWith("--scenes=")) {
      scenes = Number(arg.slice("--scenes=".length));
    } else if (arg.startsWith("--idea=")) {
      idea = arg.slice("--idea=".length);
    } else if (arg === "--images") {
      images = true;
    }
  }
  return { scenes, idea, images };
}

// Matches src/core/storage-paths.ts's STORY_ID_PATTERN (lowercase
// alphanumerics and hyphens only) -- Date.now() is all digits and
// Math.random().toString(36) is [0-9a-z], so no extra sanitizing is needed.
function generateStoryId(): string {
  return `story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function main(): Promise<void> {
  const { scenes, idea, images } = parseArgs(process.argv.slice(2));

  try {
    const result = await runStoryDirector({
      idea,
      characterDescription: DEFAULT_CHARACTER_DESCRIPTION,
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
    console.log(`Fallback model used: ${result.fallbackUsed}`);
    console.log(`usageMetadata: ${JSON.stringify(result.usageMetadata)}`);

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

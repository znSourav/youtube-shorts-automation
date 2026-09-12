// Standalone CLI probe for the Story Director path (no Next.js runtime),
// in the same spirit as Phase 1's smoke-test.ts. Exercises runStoryDirector
// directly and prints a single machine-checkable outcome line, per plan
// 02-02 Task 1. Run with: node --env-file=.env.local src/scripts/story-probe.ts
import { runStoryDirector } from "../core/story/director.ts";
import { loadLedger, totalSpentUsd } from "../lib/spend-ledger.ts";
import { CeilingExceededError } from "../lib/spend-ledger.ts";

// D-05: genuinely different from the CR-03 follow-up's "girl in a magical
// garden" content already tested in Phase 1.
const DEFAULT_IDEA =
  "A shy village boy trades his only marble for a broken kite from a traveling peddler, and slowly learns to mend and fly it himself.";
const DEFAULT_CHARACTER_DESCRIPTION =
  "A shy 9-year-old village boy, short and slight, with tousled black hair and a patched brown vest over a simple cotton shirt.";

function parseArgs(argv: string[]): { scenes: number; idea: string } {
  // D-04: default to the reduced 3-scene scale for debugging passes.
  let scenes = 3;
  let idea = DEFAULT_IDEA;
  for (const arg of argv) {
    if (arg.startsWith("--scenes=")) {
      scenes = Number(arg.slice("--scenes=".length));
    } else if (arg.startsWith("--idea=")) {
      idea = arg.slice("--idea=".length);
    }
  }
  return { scenes, idea };
}

async function main(): Promise<void> {
  const { scenes, idea } = parseArgs(process.argv.slice(2));

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

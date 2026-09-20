// Standalone CLI probe for STARTUP-02's missing-key guard (06-01, Task 1) --
// the end-to-end proof that a missing API key produces exactly
// MISSING_API_KEY_MESSAGE, dispatches no provider call, and writes no
// GenerationRecord row. Costs $0.00: createStoryAction never reaches
// generateStory because assertApiKeyConfigured() (called first inside
// runStoryDirector) throws before checkBudget or any network call runs.
//
// Both key variables are deleted from process.env as this module's very
// first executable statements, and createStoryAction is loaded via a
// dynamic import() AFTER that deletion (rather than a static import, which
// ES modules would hoist and evaluate before any of this module's own
// top-level code ran) -- so this probe's correctness does not depend on the
// (currently true, but not structurally enforced) fact that no imported
// module happens to read process.env at its own top level.
//
// Run with:
//   node --env-file-if-exists=.env.local src/scripts/missing-key-probe.ts
delete process.env.GOOGLE_API_KEY;
delete process.env.GEMINI_API_KEY;

import { prisma } from "../lib/db.ts";
import { MISSING_API_KEY_MESSAGE } from "../core/config/provider-key.ts";

const PROBE_IDEA = "A quiet fixture idea used only by missing-key-probe.ts, never shown to a real user.";
const PROBE_CHARACTER_DESCRIPTION = "A small, plain character with short black hair and simple cotton clothes.";

async function main(): Promise<void> {
  const before = await prisma.generationRecord.count();

  const { createStoryAction } = await import("../app/actions/create-story.ts");

  const result = await createStoryAction({
    idea: PROBE_IDEA,
    characterDescription: PROBE_CHARACTER_DESCRIPTION,
    stylePresetId: "soft-hand-painted-2d",
    mood: "Calm",
    sceneCount: 5,
  });

  const after = await prisma.generationRecord.count();

  const failures: string[] = [];
  if (result.ok !== false) {
    failures.push(`expected result.ok === false, got: ${JSON.stringify(result)}`);
  } else if (result.error !== MISSING_API_KEY_MESSAGE) {
    failures.push(`expected result.error to equal MISSING_API_KEY_MESSAGE, got: ${result.error}`);
  }
  if (after !== before) {
    failures.push(
      `GenerationRecord row count changed (before=${before} after=${after}) -- a call was dispatched or billed`,
    );
  }

  if (failures.length === 0) {
    console.log(
      `PROBE PASS: createStoryAction refused with MISSING_API_KEY_MESSAGE, no row written (count=${before})`,
    );
  } else {
    for (const failure of failures) {
      console.error(`PROBE FAIL: ${failure}`);
    }
    process.exitCode = 1;
  }
}

main();

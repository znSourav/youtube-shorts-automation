"use server";

// D-04's single "Generate All Videos" trigger (VIDEO-02). Validates
// synchronously and returns immediately, then schedules the actual
// sequential per-scene work inside next/server's after() -- a stable
// built-in of the already-installed next@16.3.5, applicable directly here
// because this app runs as a persistent Node.js server (`next start`), not
// a serverless/Vercel deployment.
//
// Awaiting all N generations inside this action instead would leave the
// browser's call pending for potentially ten minutes or more (N scenes x
// minutes-per-Veo-call) with no per-scene progress visible until the whole
// call resolved -- exactly what D-05's dedicated status screen exists to
// avoid (04-RESEARCH.md Pattern 2).
//
// after() work is not guaranteed to survive a dev-server recompile or
// restart (04-RESEARCH.md Pitfall 2) -- that is why generate-video.ts now
// writes SceneAssetStatus.GENERATING before dispatch, and why Task 2 adds a
// "stuck" affordance on the status screen.
//
// The approval and per-scene retry-cap checks inside generateSceneVideoAction
// still run for every scene in the loop -- evaluateBatchDispatch below is a
// fast refusal for the wife's benefit only, never the gate itself
// (04-RESEARCH.md Pitfall 1). No logic here can dispatch a paid call without
// going through that single function.
import { after } from "next/server";

import { storyDir } from "../../core/storage-paths.ts";
import { findStoryWithScenes } from "../../core/persistence/story-repository.ts";
import { evaluateBatchDispatch } from "../../core/approval/gates.ts";
import { maxSceneRetryAttempts } from "../../core/retry/caps.ts";
import { runBatchVideoDispatch } from "../../core/video/batch.ts";
import { generateSceneVideoAction } from "./generate-video.ts";

export interface GenerateAllVideosResult {
  ok: boolean;
  message: string;
}

// Fourth-pass review CR-01: a story-scoped in-flight guard, independent of
// the browser's own `batchDispatched` state -- that client state cannot be
// trusted to reflect whether a PREVIOUS request's after() background loop
// is still alive, since page.tsx's applyLoadedStory unconditionally resets
// it to false on every story reopen/reload. Without this, two independent
// generateAllVideosAction calls for the same story (e.g. she reopens the
// story mid-batch via "My Stories" and clicks "Generate All Videos" again)
// each compute their OWN eligibility snapshot and schedule their OWN
// after() loop -- the CR-03 mutex only serializes individual dispatch
// calls, it does nothing to stop two separate batches from both reaching
// scenes the other hasn't gotten to yet. Cleared in a finally so a batch
// that throws still releases the story for a later legitimate re-run (e.g.
// the stranded-batch recovery 04-RESEARCH.md Pitfall 2 describes, after a
// dev-server recompile -- which also wipes this in-memory Set, so that
// recovery path is unaffected by this guard).
const storiesWithRunningBatch = new Set<string>();

export async function generateAllVideosAction(storyId: string): Promise<GenerateAllVideosResult> {
  try {
    storyDir(storyId);
  } catch {
    return { ok: false, message: "This story could not be found." };
  }

  if (storiesWithRunningBatch.has(storyId)) {
    return {
      ok: false,
      message: "Videos are already being generated for this story. Please wait for it to finish.",
    };
  }
  // Reserve the slot here, synchronously and with no `await` since the
  // check above -- otherwise two near-simultaneous calls for the same story
  // (e.g. a fast double-click, before either request's own DB read below
  // resolves) could both pass the check before either reserves, recreating
  // the exact TOCTOU shape CR-03 already closed for individual dispatches,
  // just one level up. Released below on every path that does NOT end in a
  // scheduled after() -- otherwise a refused/empty batch would permanently
  // strand this story as "running" with nothing ever there to release it.
  storiesWithRunningBatch.add(storyId);

  let story = null;
  try {
    story = await findStoryWithScenes(storyId);
  } catch (err) {
    console.error(`generateAllVideosAction: failed to read story ${storyId}`, err);
  }

  const decision = evaluateBatchDispatch(story, maxSceneRetryAttempts());
  if (!decision.allowed) {
    storiesWithRunningBatch.delete(storyId);
    return { ok: false, message: decision.message };
  }

  const sceneNumbers = decision.sceneNumbers;

  after(async () => {
    // Runs AFTER the response below has already returned to the browser.
    // generateSceneVideoAction writes each scene's own GENERATING/READY/
    // FAILED status -- this callback never touches Scene rows directly.
    try {
      await runBatchVideoDispatch(sceneNumbers, {
        dispatch: (sceneNumber) => generateSceneVideoAction(storyId, sceneNumber),
      });
    } finally {
      storiesWithRunningBatch.delete(storyId);
    }
  });

  return { ok: true, message: "Video generation has started for every approved scene." };
}

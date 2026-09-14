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

export async function generateAllVideosAction(storyId: string): Promise<GenerateAllVideosResult> {
  try {
    storyDir(storyId);
  } catch {
    return { ok: false, message: "This story could not be found." };
  }

  let story = null;
  try {
    story = await findStoryWithScenes(storyId);
  } catch (err) {
    console.error(`generateAllVideosAction: failed to read story ${storyId}`, err);
  }

  const decision = evaluateBatchDispatch(story, maxSceneRetryAttempts());
  if (!decision.allowed) {
    return { ok: false, message: decision.message };
  }

  const sceneNumbers = decision.sceneNumbers;

  after(async () => {
    // Runs AFTER the response below has already returned to the browser.
    // generateSceneVideoAction writes each scene's own GENERATING/READY/
    // FAILED status -- this callback never touches Scene rows directly.
    await runBatchVideoDispatch(sceneNumbers, {
      dispatch: (sceneNumber) => generateSceneVideoAction(storyId, sceneNumber),
    });
  });

  return { ok: true, message: "Video generation has started for every approved scene." };
}

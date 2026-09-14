"use server";

import { storyDir } from "../../core/storage-paths.ts";
import { findStoryWithScenes, markImagesApproved } from "../../core/persistence/story-repository.ts";
import { evaluateApproval } from "../../core/approval/gates.ts";

export interface ApproveImagesResult {
  ok: boolean;
  message: string;
}

/**
 * D-01: approval is a single, deliberate action the wife takes -- never an
 * automatic unlock that fires the moment every scene's image finishes
 * generating. D-02: one action covers the whole story's set of scene
 * images; there is deliberately no per-scene variant of this function
 * anywhere in this codebase.
 *
 * This action is only the recorder of that decision. The actual
 * enforcement that blocks video generation until approval is recorded lives
 * in evaluateVideoDispatch (src/core/approval/gates.ts), which
 * generateSceneVideoAction runs before every dispatch -- a caller cannot
 * route around that gate by calling this action differently; approving
 * here only ever sets the one flag that gate reads.
 */
export async function approveStoryImagesAction(storyId: string): Promise<ApproveImagesResult> {
  try {
    storyDir(storyId);
  } catch {
    return { ok: false, message: "This story could not be found." };
  }

  let story = null;
  try {
    story = await findStoryWithScenes(storyId);
  } catch (err) {
    console.error(`approveStoryImagesAction: failed to read story ${storyId}`, err);
  }

  const decision = evaluateApproval(story);
  if (!decision.allowed) {
    return { ok: false, message: decision.message };
  }

  try {
    // Unlike the best-effort persistence writes in generation-repository.ts,
    // this one is NOT best-effort: an approval that silently failed to
    // persist would leave her believing she had approved while the server
    // still refuses every video call. The honest answer is to tell her it
    // did not save.
    await markImagesApproved(storyId);
  } catch (err) {
    console.error(`approveStoryImagesAction: failed to save approval for story ${storyId}`, err);
    return { ok: false, message: "Your approval could not be saved. Please try again." };
  }

  return { ok: true, message: "Images approved. You can now generate videos for every scene." };
}

"use server";

// VIDEO-04's single-scene retry, deliberately a ONE-LINE DELEGATION to
// generateSceneVideoAction and nothing else. 04-RESEARCH.md's Pitfall 1 is
// precisely a retry path that forgets to re-check approval because the
// scene is "already mid-flight" -- the only way to make that mistake
// impossible is for this function to have no logic of its own to get wrong.
// generateSceneVideoAction re-runs the approval check, the retry-cap check,
// and the spend ceiling for this scene exactly as it does for every other
// caller (the batch dispatch included).
//
// VIDEO-04's "the retry counts toward that scene's retry limit" is already
// satisfied by the attempt counter that generateSceneVideoAction increments
// internally -- there is deliberately no second counter, and no second cap
// check, here.
import { generateSceneVideoAction, type GenerateSceneVideoResult } from "./generate-video.ts";

export async function retrySceneVideoAction(
  storyId: string,
  sceneNumber: number,
): Promise<GenerateSceneVideoResult> {
  return generateSceneVideoAction(storyId, sceneNumber);
}

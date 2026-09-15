"use server";

// Lightweight polling read for the new Video Status screen (D-05). Reused
// analog: load-story.ts's validate-before-query shape. Deliberately reads
// no file BYTES and builds no data: URLs -- this action is polled every few
// seconds, so it stays a cheap SELECT (T-03-15's same structural guarantee:
// SceneVideoStatusRow declares no field whose value is a filesystem path).
// WR-05 (04-REVIEW.md, second pass): existsSync (a metadata stat, not a
// read) is the one exception -- see the READY-downgrade check below.
import { existsSync } from "node:fs";

import { storyDir } from "../../core/storage-paths.ts";
import { findStoryWithScenes } from "../../core/persistence/story-repository.ts";
import { maxSceneRetryAttempts } from "../../core/retry/caps.ts";

export interface SceneVideoStatusRow {
  sceneNumber: number;
  storyPurpose: string;
  imageStatus: string;
  videoStatus: string;
  videoAttempts: number;
  capReached: boolean;
}

export interface StoryStatusResult {
  ok: boolean;
  imagesApproved: boolean;
  scenes: SceneVideoStatusRow[];
  // The configured retry-cap number, so the browser never has to know it or
  // hardcode it to interpolate the cap-reached sentence -- changing
  // MAX_SCENE_RETRY_ATTEMPTS changes the rendered sentence with no browser
  // code change.
  maxAttempts: number;
}

export async function getStoryStatusAction(storyId: string): Promise<StoryStatusResult> {
  const maxAttempts = maxSceneRetryAttempts();

  try {
    storyDir(storyId);
  } catch {
    return { ok: false, imagesApproved: false, scenes: [], maxAttempts };
  }

  let row;
  try {
    row = await findStoryWithScenes(storyId);
  } catch (err) {
    console.error(`getStoryStatusAction: failed to read story ${storyId}`, err);
    return { ok: false, imagesApproved: false, scenes: [], maxAttempts };
  }

  if (!row) {
    return { ok: false, imagesApproved: false, scenes: [], maxAttempts };
  }

  const scenes: SceneVideoStatusRow[] = row.scenes
    .slice()
    .sort((a, b) => a.sceneNumber - b.sceneNumber)
    .map((scene) => {
      // WR-05 (04-REVIEW.md, second pass): mirrors load-story.ts's existing
      // file-existence downgrade -- the database and the filesystem can
      // legitimately disagree (a video file deleted or moved out from under
      // the app after being marked READY). existsSync is a metadata stat,
      // not a file read, so this stays a cheap check on every 3s poll tick
      // rather than reading full video bytes (which load-story.ts's own
      // readFileSync approach does, but only once, on restore -- not here).
      let videoStatus = scene.videoStatus;
      if (videoStatus === "READY" && (!scene.videoPath || !existsSync(scene.videoPath))) {
        console.error(
          `getStoryStatusAction: scene ${scene.sceneNumber}'s video file is missing on disk`,
        );
        videoStatus = "FAILED";
      }

      return {
        sceneNumber: scene.sceneNumber,
        storyPurpose: scene.storyPurpose,
        imageStatus: scene.imageStatus,
        videoStatus,
        videoAttempts: scene.videoAttempts,
        capReached: scene.videoAttempts >= maxAttempts,
      };
    });

  return {
    ok: true,
    imagesApproved: row.imagesApprovedAt !== null,
    scenes,
    maxAttempts,
  };
}

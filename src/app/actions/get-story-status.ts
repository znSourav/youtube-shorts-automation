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
import { checkBudget, BudgetExceededError } from "../../core/budget/ledger.ts";

// WR-02 (04-REVIEW.md, third pass): the worst-case per-scene cost this app
// ever dispatches -- 8 seconds (the longest supported scene, per
// smoke-test.ts's CHILD_VIDEO_DURATION_SECONDS comment) at the "720p" price
// (veo.ts's VIDEO_PRICE_PER_SECOND["720p"]), the same conservative estimate
// used elsewhere. Deliberately hardcoded rather than imported from
// providers/video/veo.ts: invariant 5 (check-boundaries.ts) restricts
// importing the video provider to the single allowed dispatch file, and
// this is only an approximate headroom probe (see below), not the actual
// per-call estimate a real dispatch would use -- keep this number in sync
// with veo.ts's own price table if that ever changes.
const MAX_SCENE_VIDEO_COST_USD = 8 * 0.05;

// IN-01 (04-REVIEW.md, third pass): this action is polled every 3s
// (POLL_INTERVAL_MS) for as long as the wife is on the Video Status screen,
// so an unguarded console.error for a scene whose video file is missing on
// disk would otherwise log again on every single tick, indefinitely. A
// module-level Set logs each distinct (storyId, sceneNumber) pair exactly
// once. This is a long-lived Node dev-server process, and there is no
// realistic scenario in this single-user local app where enough distinct
// missing-video scenes accumulate for an ever-growing Set to matter.
const loggedMissingVideo = new Set<string>();

export interface SceneVideoStatusRow {
  sceneNumber: number;
  storyPurpose: string;
  imageStatus: string;
  videoStatus: string;
  videoAttempts: number;
  capReached: boolean;
  // WR-02: true when this FAILED, not-already-capped scene's failure
  // coincides with the project's spend ceiling currently having no room
  // left for even one more scene's worst-case cost. This is a conservative,
  // approximate signal -- "the whole project's budget is currently
  // exhausted", not "this specific scene's specific failure was caused by
  // the ceiling" (no schema column records why a scene failed) -- an
  // intentional simplification for a Warning-severity UX message.
  budgetExceeded: boolean;
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

  // WR-02: computed ONCE per invocation, not once per scene -- checkBudget
  // is now an async SQLite query (src/core/budget/ledger.ts), so the
  // per-scene probe this action used to run inside its synchronous .map()
  // is hoisted out here instead. Observably identical to the prior
  // per-scene shape: every scene still reads the exact same headroom
  // signal, just computed once and reused, which replaces N repeated
  // queries with one on an action polled every three seconds. checkBudget
  // throws BudgetExceededError purely to report "no headroom" -- it is not
  // a real dispatch, so nothing is recorded and this cannot itself move the
  // project any closer to the budget.
  let budgetExhausted = false;
  try {
    await checkBudget(MAX_SCENE_VIDEO_COST_USD);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      budgetExhausted = true;
    } else {
      throw err;
    }
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
        const missingKey = `${storyId}:${scene.sceneNumber}`;
        if (!loggedMissingVideo.has(missingKey)) {
          loggedMissingVideo.add(missingKey);
          console.error(
            `getStoryStatusAction: scene ${scene.sceneNumber}'s video file is missing on disk`,
          );
        }
        videoStatus = "FAILED";
      }

      const capReached = scene.videoAttempts >= maxAttempts;

      // WR-02: a FAILED, not-already-capped scene whose failure coincides
      // with the real budget currently having no room left for even one
      // more worst-case scene is treated as a budget dead end, not a
      // transient failure. budgetExhausted is computed once above, not
      // per-scene.
      const budgetExceeded = videoStatus === "FAILED" && !capReached && budgetExhausted;

      return {
        sceneNumber: scene.sceneNumber,
        storyPurpose: scene.storyPurpose,
        imageStatus: scene.imageStatus,
        videoStatus,
        videoAttempts: scene.videoAttempts,
        capReached,
        budgetExceeded,
      };
    });

  return {
    ok: true,
    imagesApproved: row.imagesApprovedAt !== null,
    scenes,
    maxAttempts,
  };
}

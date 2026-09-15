"use server";

// OUTPUT-01: the single call site in this codebase that spawns an operating
// system process (check-boundaries.ts invariant 6, Task 2 of this plan). The
// export runs BEFORE the spawn on purpose, so the folder she is about to
// look at is current rather than whatever was last written -- see 04-04-PLAN
// Step 5's automatic-export-on-completion wiring in page.tsx for the other
// half of that guarantee.
//
// explorer.exe's exit code is not a reliable success signal
// (04-RESEARCH.md Pitfall 4, [ASSUMED]) -- a long-documented Windows quirk
// where Explorer can return non-zero even after opening successfully. The
// execFile callback therefore only logs on error; it is never treated as a
// hard failure, and the returned confirmation is deliberately "Opening the
// folder..." rather than a stronger claim that it definitely opened.
//
// The return type carries a clip count, never a path -- keeping T-03-15's
// no-path-to-the-browser rule intact even for this OS-interop action.
import { execFile } from "node:child_process";
import { resolve } from "node:path";

import { storyDir } from "../../core/storage-paths.ts";
import { findStoryWithScenes } from "../../core/persistence/story-repository.ts";
import { exportEpisodeAssets } from "../../core/output/episode-export.ts";

export interface EpisodeOutputResult {
  ok: boolean;
  message: string | null;
  clipCount: number;
}

/**
 * finalizeEpisodeAction: the validate-load-export half, shared by
 * openStoryFolderAction (below) and page.tsx's automatic export-on-complete
 * effect. Spawns nothing. The message is deliberately null on success --
 * plan 04-03's VideoStatusScreen already carries the locked completion
 * sentence ("Every scene is ready. Your episode's clips are saved and
 * numbered for CapCut."), and a second sentence saying the same thing in
 * different words would be two sources of truth for one fact.
 */
export async function finalizeEpisodeAction(storyId: string): Promise<EpisodeOutputResult> {
  try {
    storyDir(storyId);
  } catch {
    return { ok: false, message: "This story's folder could not be found.", clipCount: 0 };
  }

  let row;
  try {
    row = await findStoryWithScenes(storyId);
  } catch (err) {
    console.error(`finalizeEpisodeAction: failed to read story ${storyId}`, err);
    return { ok: false, message: "This story's folder could not be found.", clipCount: 0 };
  }

  if (!row) {
    return { ok: false, message: "This story's folder could not be found.", clipCount: 0 };
  }

  let exported;
  try {
    exported = exportEpisodeAssets(row);
  } catch (err) {
    console.error(`finalizeEpisodeAction: failed to export episode assets for story ${storyId}`, err);
    return {
      ok: false,
      message: "Your episode's files couldn't be saved to the folder just now. Please try again.",
      clipCount: 0,
    };
  }

  if (exported.folderMissing) {
    return {
      ok: false,
      message: "This story's folder could not be found. It may have been moved or renamed.",
      clipCount: 0,
    };
  }

  return { ok: true, message: null, clipCount: exported.clipsWritten.length };
}

/**
 * openStoryFolderAction: delegates its validate-load-export work to
 * finalizeEpisodeAction (the export logic exists exactly once) and adds
 * only the spawn -- this is the one call site in the codebase permitted to
 * launch an operating-system process (check-boundaries.ts invariant 6). The
 * export runs before the spawn on purpose, so the folder she is about to
 * look at is current rather than whatever was last written.
 */
export async function openStoryFolderAction(storyId: string): Promise<EpisodeOutputResult> {
  const result = await finalizeEpisodeAction(storyId);
  if (!result.ok) {
    return result;
  }

  if (process.platform === "win32") {
    const absoluteDir = resolve(storyDir(storyId));
    execFile("explorer.exe", [absoluteDir], (err) => {
      if (err) {
        console.error(`openStoryFolderAction: explorer.exe reported an error for story ${storyId}`, err);
      }
    });
  } else {
    console.log(`openStoryFolderAction: folder-open skipped -- not running on win32 (story ${storyId})`);
  }

  return { ok: true, message: "Opening the folder...", clipCount: result.clipCount };
}

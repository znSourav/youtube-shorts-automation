// OUTPUT-01/OUTPUT-03: writes a finished episode's on-disk folder. The
// source of every copy is the database's own recorded path (StoryWithScenes'
// scene.videoPath, never a client-supplied string); the destination of
// every copy comes from storage-paths.ts's validated outputClipPath()
// builder, never an inline-concatenated string. EpisodeExportResult
// deliberately carries scene numbers and bare file names rather than paths,
// so nothing path-shaped can drift outward from here (T-03-15's same
// structural guarantee, applied to this module).
//
// This module reads and writes the local filesystem and nothing else: no
// Prisma client, no provider, no Server Action import. `rootDir` (default
// process.cwd()) exists so tests can run against a temp directory instead of
// the real storage/ tree -- every path this function touches is
// resolve(rootDir, <a storage-paths.ts value>).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { outputDir, outputClipPath, storyDir } from "../storage-paths.ts";
import type { StoryWithScenes } from "../persistence/story-repository.ts";

export interface EpisodeExportOptions {
  rootDir?: string;
}

export interface EpisodeExportResult {
  clipsWritten: number[];
  clipsMissing: number[];
  // Always empty in this task -- Task 2 (04-04-PLAN.md) fills this in with
  // "story.json"/"story.txt"/the character reference's bare file name. The
  // clip half is the whole of OUTPUT-03 and is complete on its own; the
  // documents are a functionality gap, not an architectural one, and land in
  // this same function later without changing its signature.
  documentsWritten: string[];
}

/**
 * exportEpisodeAssets (OUTPUT-01, OUTPUT-03): writes one numbered clip per
 * ready scene into the story's own output/ directory. The only error this
 * function deliberately propagates is storyDir()'s own validation throw --
 * an id that cannot produce a valid storage path must not produce a write
 * either. Every per-scene copy failure is caught individually, logged once,
 * and folded into clipsMissing rather than thrown, mirroring
 * generation-repository.ts's best-effort-by-contract rule: one unreadable
 * file must never cost her the other clips.
 */
export function exportEpisodeAssets(
  row: StoryWithScenes,
  options: EpisodeExportOptions = {},
): EpisodeExportResult {
  const rootDir = options.rootDir ?? process.cwd();

  // Propagate storyDir()'s validation throw -- deliberate, see doc comment.
  storyDir(row.id);

  const resolvedOutputDir = resolve(rootDir, outputDir(row.id));
  mkdirSync(resolvedOutputDir, { recursive: true });

  const clipsWritten: number[] = [];
  const clipsMissing: number[] = [];

  const orderedScenes = [...row.scenes].sort((a, b) => a.sceneNumber - b.sceneNumber);

  for (const scene of orderedScenes) {
    const isReady = scene.videoStatus === "READY" && scene.videoPath !== null;
    const sourcePath = scene.videoPath ? resolve(rootDir, scene.videoPath) : null;
    const destPath = resolve(rootDir, outputClipPath(row.id, scene.sceneNumber));

    if (isReady && sourcePath && existsSync(sourcePath)) {
      try {
        copyFileSync(sourcePath, destPath);
        clipsWritten.push(scene.sceneNumber);
        continue;
      } catch (err) {
        console.error(
          `exportEpisodeAssets: failed to copy scene ${scene.sceneNumber}'s video for story ${row.id}`,
          err,
        );
      }
    }

    clipsMissing.push(scene.sceneNumber);
  }

  return { clipsWritten, clipsMissing, documentsWritten: [] };
}

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
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

import {
  outputDir,
  outputClipPath,
  storyDir,
  storyJsonPath,
  storyTextPath,
  characterReferencePath,
} from "../storage-paths.ts";
import type { StoryWithScenes } from "../persistence/story-repository.ts";

export interface EpisodeExportOptions {
  rootDir?: string;
}

export interface EpisodeExportResult {
  clipsWritten: number[];
  clipsMissing: number[];
  // Bare file names only ("story.json", "story.txt",
  // "character-reference.jpg") -- never a path, matching clipsWritten/
  // clipsMissing's own scene-number-only shape (T-03-15's guarantee).
  documentsWritten: string[];
  // True when this story previously recorded a real image or video path but
  // its own directory is no longer on disk (moved or renamed outside the
  // app) -- every other field is empty in that case, and nothing was
  // written. A story that has never recorded any asset path yet (its first
  // export) always reports false here and creates its directory normally.
  folderMissing: boolean;
}

/**
 * buildStoryJson (OUTPUT-01): the complete machine-readable record of the
 * episode, written to her own disk -- never returned from a Server Action.
 * Pure function of a StoryWithScenes row; no filesystem access, so it is
 * directly assertable on a fixture. The scenes array is ordered by scene
 * number ascending, and created_at is a string (row.createdAt.toISOString())
 * rather than a Date instance, since this is JSON.stringify'd directly.
 */
export function buildStoryJson(row: StoryWithScenes): string {
  const orderedScenes = [...row.scenes].sort((a, b) => a.sceneNumber - b.sceneNumber);

  const scenes = orderedScenes.map((scene) => {
    const hasReadyClip = scene.videoStatus === "READY" && scene.videoPath !== null;
    return {
      scene_number: scene.sceneNumber,
      story_purpose: scene.storyPurpose,
      duration_seconds: scene.durationSeconds,
      image_prompt: scene.imagePrompt,
      motion_prompt: scene.motionPrompt,
      // A bare relative file name, never an absolute or storage-rooted
      // path -- this document is the complete machine-readable record but
      // must not leak a filesystem path any more than a Server Action
      // return value would (T-03-15's guarantee, applied here too).
      clip_file: hasReadyClip ? `${String(scene.sceneNumber).padStart(2, "0")}_scene.mp4` : null,
    };
  });

  const payload = {
    id: row.id,
    title: row.title,
    created_at: row.createdAt.toISOString(),
    story: {
      premise: row.premise,
      full_story: row.fullStory,
      theme: row.theme,
      emotional_arc: row.emotionalArc,
      ending: row.ending,
      protagonist_want: row.protagonistWant,
      central_obstacle: row.centralObstacle,
      ending_shape: row.endingShape,
    },
    character_bible: row.characterBible,
    style_bible: row.styleBible,
    scenes,
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * buildStoryText (OUTPUT-01): a plain-text document she could read in
 * Notepad -- the human half of the pair (story.json is the complete
 * machine-readable half). Holds no prompt text, no model id, and no path.
 * Pure function of a StoryWithScenes row; no filesystem access.
 */
export function buildStoryText(row: StoryWithScenes): string {
  const bible = (row.characterBible ?? {}) as Record<string, unknown>;
  const style = (row.styleBible ?? {}) as Record<string, unknown>;

  const lines: string[] = [
    row.title,
    "",
    row.premise,
    "",
    row.fullStory,
    "",
    `Theme: ${row.theme}`,
    `Emotional arc: ${row.emotionalArc}`,
    `Ending: ${row.ending}`,
    "",
    "Character",
    `Name: ${String(bible.name ?? "")}`,
    `Appearance: ${String(bible.appearance ?? "")}`,
    `Hair: ${String(bible.hair ?? "")}`,
    `Clothing: ${String(bible.clothing ?? "")}`,
    `Distinguishing features: ${String(bible.distinguishing_features ?? "")}`,
    "",
    "Style",
    `Medium: ${String(style.medium ?? "")}`,
    `Color palette: ${String(style.color_palette ?? "")}`,
    `Character rendering: ${String(style.character_rendering ?? "")}`,
    "",
    "Scenes",
  ];

  const orderedScenes = [...row.scenes].sort((a, b) => a.sceneNumber - b.sceneNumber);
  for (const scene of orderedScenes) {
    const duration = scene.durationSeconds !== null ? ` (${scene.durationSeconds}s)` : "";
    lines.push(`${scene.sceneNumber}. ${scene.storyPurpose}${duration}`);
  }

  return lines.join("\n");
}

/**
 * exportEpisodeAssets (OUTPUT-01, OUTPUT-03): writes one numbered clip per
 * ready scene into the story's own output/ directory, plus story.json,
 * story.txt, and a character reference image at the story's own root. The
 * only error this function deliberately propagates is storyDir()'s own
 * validation throw -- an id that cannot produce a valid storage path must
 * not produce a write either. Every other failure (a per-scene copy, a
 * document write) is caught individually, logged once, and folded into the
 * result rather than thrown, mirroring generation-repository.ts's
 * best-effort-by-contract rule: one unreadable file must never cost her the
 * rest of an already-paid-for episode's export.
 *
 * Stale-clip hygiene (T-04-09): every scene that lands in clipsMissing has
 * its output clip removed via rmSync({ force: true }) -- a scene that was
 * ready, got a clip, and later stopped being ready (a failed retry) must not
 * leave behind a clip she would import believing it current. The removal
 * target is built only by outputClipPath() for a scene number already
 * present in the loaded row, so it can never point outside this story's own
 * output directory.
 */
export function exportEpisodeAssets(
  row: StoryWithScenes,
  options: EpisodeExportOptions = {},
): EpisodeExportResult {
  const rootDir = options.rootDir ?? process.cwd();

  // Propagate storyDir()'s validation throw -- deliberate, see doc comment.
  const resolvedStoryDir = resolve(rootDir, storyDir(row.id));

  // A story that already recorded a real image or video path but whose own
  // directory is gone from disk (renamed or moved outside the app, never by
  // anything this codebase does) must not be silently recreated as an empty
  // shell -- mkdirSync's own recursive:true below would otherwise paper over
  // exactly that loss with no signal back to her at all, and a folder she
  // renames back afterward would collide with the freshly-created one. A
  // story that has never recorded any asset path yet (its first export) has
  // nothing to lose here, so it still creates its directory normally.
  const hadRecordedAsset = row.scenes.some(
    (scene) => scene.imagePath !== null || scene.videoPath !== null,
  );
  if (hadRecordedAsset && !existsSync(resolvedStoryDir)) {
    return { clipsWritten: [], clipsMissing: [], documentsWritten: [], folderMissing: true };
  }

  const resolvedOutputDir = resolve(rootDir, outputDir(row.id));
  mkdirSync(resolvedOutputDir, { recursive: true });

  const clipsWritten: number[] = [];
  const clipsMissing: number[] = [];
  const documentsWritten: string[] = [];

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

    // Not ready, source missing, or the copy above failed -- this scene's
    // number lands in clipsMissing either way, and any clip left over from a
    // PREVIOUS export of this same scene must be removed (T-04-09).
    clipsMissing.push(scene.sceneNumber);
    try {
      rmSync(destPath, { force: true });
    } catch (err) {
      console.error(
        `exportEpisodeAssets: failed to remove stale clip for story ${row.id} scene ${scene.sceneNumber}`,
        err,
      );
    }
  }

  // The character reference: the lowest-numbered scene whose image is ready
  // and whose source file exists on disk. Deviation from
  // docs/original-brief.md §23's ".png" naming (recorded in
  // 04-04-SUMMARY.md): Phase 1 confirmed the image provider returns JPEG
  // bytes, and writing JPEG bytes under a ".png" name is precisely the
  // mislabeled-file failure OUTPUT-02 exists to prevent -- so the real
  // extension is preserved here instead of the brief's literal name.
  const referenceScene = orderedScenes.find(
    (scene) =>
      scene.imageStatus === "READY" &&
      scene.imagePath !== null &&
      existsSync(resolve(rootDir, scene.imagePath)),
  );
  if (referenceScene && referenceScene.imagePath) {
    try {
      const ext = extname(referenceScene.imagePath).replace(/^\./, "") || "jpg";
      const destPath = resolve(rootDir, characterReferencePath(row.id, ext));
      copyFileSync(resolve(rootDir, referenceScene.imagePath), destPath);
      documentsWritten.push(`character-reference.${ext}`);
    } catch (err) {
      console.error(`exportEpisodeAssets: failed to write character reference for story ${row.id}`, err);
    }
  }

  try {
    writeFileSync(resolve(rootDir, storyJsonPath(row.id)), buildStoryJson(row), "utf8");
    documentsWritten.push("story.json");
  } catch (err) {
    console.error(`exportEpisodeAssets: failed to write story.json for story ${row.id}`, err);
  }

  try {
    writeFileSync(resolve(rootDir, storyTextPath(row.id)), buildStoryText(row), "utf8");
    documentsWritten.push("story.txt");
  } catch (err) {
    console.error(`exportEpisodeAssets: failed to write story.txt for story ${row.id}`, err);
  }

  return { clipsWritten, clipsMissing, documentsWritten, folderMissing: false };
}

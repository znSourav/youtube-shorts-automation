// Pure mapper: StoryWithScenes (the Prisma-shaped row story-repository.ts
// returns) -> LoadedStory, the browser-safe restore payload. No I/O here so
// it is directly unit-testable without a database or a Server Action's
// serialization constraints.
//
// The absence of a path field on LoadedSceneStatus/LoadedStory is
// load-bearing, not incidental: generate-images.ts already documents that a
// filesystem path is internal bookkeeping that must never render (the
// imagePath/imageDataUrl split), and this type is what makes that
// unbreakable on the restore path rather than a convention someone has to
// remember -- a future field added here structurally cannot leak a path,
// because there is no path field to accidentally populate (T-03-15).
import type { StoryWithScenes, LibraryStorySource } from "./story-repository.ts";
import type { StoryDirectorOutput } from "../story/schema.ts";

export type LoadedAssetStatus = "WAITING" | "GENERATING" | "READY" | "FAILED";

export interface LoadedSceneStatus {
  sceneNumber: number;
  storyPurpose: string;
  durationSeconds: number | null;
  imageStatus: LoadedAssetStatus;
  videoStatus: LoadedAssetStatus;
}

export interface LoadedStory {
  storyId: string;
  data: StoryDirectorOutput;
  scenes: LoadedSceneStatus[];
}

/**
 * Maps a persisted Story+Scenes row onto the browser-safe restore payload,
 * sorting scenes by scene number ascending. `data` is reassembled into the
 * same StoryDirectorOutput shape the review screen already consumes, reading
 * the character/style bibles back out of their Json columns.
 */
export function toLoadedStory(row: StoryWithScenes): LoadedStory {
  const orderedScenes = [...row.scenes].sort((a, b) => a.sceneNumber - b.sceneNumber);

  const data: StoryDirectorOutput = {
    story: {
      title: row.title,
      premise: row.premise,
      story: row.fullStory,
      theme: row.theme,
      emotional_arc: row.emotionalArc,
      ending: row.ending,
      protagonist_want: row.protagonistWant,
      central_obstacle: row.centralObstacle,
      ending_shape: row.endingShape,
    },
    character_bible: row.characterBible as StoryDirectorOutput["character_bible"],
    style_bible: row.styleBible as StoryDirectorOutput["style_bible"],
    scenes: orderedScenes.map((scene) => ({
      scene_number: scene.sceneNumber,
      duration: scene.durationSeconds ?? undefined,
      story_purpose: scene.storyPurpose,
      image_prompt: scene.imagePrompt,
      motion_prompt: scene.motionPrompt,
    })),
  };

  return {
    storyId: row.id,
    data,
    scenes: orderedScenes.map((scene) => ({
      sceneNumber: scene.sceneNumber,
      storyPurpose: scene.storyPurpose,
      durationSeconds: scene.durationSeconds,
      imageStatus: scene.imageStatus as LoadedAssetStatus,
      videoStatus: scene.videoStatus as LoadedAssetStatus,
    })),
  };
}

// --- LIBRARY-01: the Library's computed status label ---------------------
//
// The five labels below are the UI-SPEC's own locked vocabulary and no
// sixth. computeLibraryStatus is a total function over already-true data
// (imagesApprovedAt from D-01/D-02, each scene's videoStatus, and each
// scene's videoAttempts against D-03's cap) -- there is deliberately no
// stored Story.status enum for this to disagree with; the label is derived
// fresh every time from data that is already the single source of truth
// elsewhere in this codebase.

export type LibraryStatusLabel = "Draft" | "Ready to Approve" | "Generating Videos" | "Complete" | "Needs Attention";

export interface LibrarySceneSummary {
  imageStatus: string;
  videoStatus: string;
  videoAttempts: number;
}

export interface LibraryStoryRow {
  storyId: string;
  title: string;
  // A string, not a Date -- a Server Action's return value is serialized,
  // and the browser is the only place that knows how to show a date to her
  // (new Date(story.createdAt).toLocaleDateString(...) in MyStoriesList).
  createdAt: string;
  status: LibraryStatusLabel;
  sceneCount: number;
}

/**
 * Decides a story's Library status label. Branch order is the whole design
 * -- the UI-SPEC's five conditions overlap, so this precedence is what
 * makes the label deterministic:
 *   1. no scenes at all -> "Draft" (structurally impossible today, but the
 *      function must still be total)
 *   2. every scene's videoStatus is "READY" -> "Complete"
 *   3. at least one scene FAILED at the cap, and no scene is GENERATING ->
 *      "Needs Attention"
 *   4. imagesApprovedAt !== null -> "Generating Videos"
 *   5. every scene's imageStatus is "READY" -> "Ready to Approve"
 *   6. otherwise -> "Draft"
 *
 * `maxVideoAttempts` is a parameter rather than read inside this module for
 * the same reason gates.ts takes it as a parameter: keeping it injected is
 * what leaves this function pure and directly testable (D-03's cap is the
 * only reason it needs to be here at all).
 *
 * One edge the UI-SPEC's own wording produces, not invented here: an
 * approved story whose scenes have not started generating yet reads
 * "Generating Videos", because branch 4 is the UI-SPEC's literal condition.
 * Inventing a sixth label to cover that moment is not this module's call.
 */
export function computeLibraryStatus(
  imagesApprovedAt: Date | null,
  scenes: LibrarySceneSummary[],
  maxVideoAttempts: number,
): LibraryStatusLabel {
  if (scenes.length === 0) {
    return "Draft";
  }

  if (scenes.every((s) => s.videoStatus === "READY")) {
    return "Complete";
  }

  const hasCappedFailure = scenes.some((s) => s.videoStatus === "FAILED" && s.videoAttempts >= maxVideoAttempts);
  const hasGenerating = scenes.some((s) => s.videoStatus === "GENERATING");
  if (hasCappedFailure && !hasGenerating) {
    return "Needs Attention";
  }

  if (imagesApprovedAt !== null) {
    return "Generating Videos";
  }

  if (scenes.every((s) => s.imageStatus === "READY")) {
    return "Ready to Approve";
  }

  return "Draft";
}

/**
 * Maps a LibraryStorySource row onto the browser-safe Library row. No key
 * of the returned object is path-shaped (T-03-15's guarantee, applied here
 * too) -- storyId, title, createdAt, status, and sceneCount are the only
 * fields, matching EpisodeOutputResult's own no-path-field discipline.
 */
export function toLibraryRow(row: LibraryStorySource, maxVideoAttempts: number): LibraryStoryRow {
  return {
    storyId: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    status: computeLibraryStatus(row.imagesApprovedAt, row.scenes, maxVideoAttempts),
    sceneCount: row.scenes.length,
  };
}

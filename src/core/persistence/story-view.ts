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
import type { StoryWithScenes } from "./story-repository.ts";
import type { StoryDirectorOutput } from "../story/schema.ts";

export type LoadedAssetStatus = "WAITING" | "READY" | "FAILED";

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

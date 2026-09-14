"use server";

import { readFileSync } from "node:fs";
import { extname } from "node:path";

import { storyDir } from "../../core/storage-paths.ts";
import { findStoryWithScenes } from "../../core/persistence/story-repository.ts";
import { toLoadedStory, type LoadedAssetStatus } from "../../core/persistence/story-view.ts";
import type { StoryDirectorOutput } from "../../core/story/schema.ts";

export interface LoadedSceneMedia {
  sceneNumber: number;
  storyPurpose: string;
  imageStatus: LoadedAssetStatus;
  // A data: URL, never a filesystem path (T-03-15) -- generated the same way
  // generate-images.ts already transports binary output to the browser.
  imageDataUrl: string | null;
  videoStatus: LoadedAssetStatus;
  videoDataUrl: string | null;
}

export interface LoadStorySuccess {
  ok: true;
  storyId: string;
  data: StoryDirectorOutput;
  scenes: LoadedSceneMedia[];
  // D-01/D-02: a boolean, deliberately never the raw imagesApprovedAt
  // timestamp -- the timestamp itself is server bookkeeping and has no
  // place in the browser.
  imagesApproved: boolean;
}

export interface LoadStoryNotFound {
  ok: false;
}

export type LoadStoryResult = LoadStorySuccess | LoadStoryNotFound;

function imageMimeTypeForPath(path: string): string {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

/**
 * Server Action reading a persisted story back for browser restore
 * (VIDEO-03's browser-resume half). Takes exactly one serializable string
 * parameter -- a Server Action's arguments cross the network boundary, so an
 * injected Prisma client parameter would not serialize.
 *
 * Routes `storyId` through storyDir() before any query, exactly like
 * story-repository.ts's own write path -- a malformed client-supplied id is
 * refused before it ever reaches Prisma, even though Prisma's generated
 * query API parameterizes regardless (T-03-14).
 *
 * For each scene whose image/video status is READY, reads the file from its
 * database-recorded path server-side and attaches a data: URL -- the exact
 * transport generate-images.ts/generate-video.ts already established. A
 * file missing on disk (e.g. a manually deleted folder) downgrades that
 * scene's status to FAILED rather than failing the whole restore: the
 * database and the filesystem can legitimately disagree, and the honest
 * answer is one scene reported as not ready, not a dead restore.
 *
 * No value in LoadStoryResult ever holds a filesystem path (T-03-15) -- only
 * `LoadedSceneMedia`'s data: URLs and plain status enums cross this
 * boundary.
 */
export async function loadStoryAction(storyId: string): Promise<LoadStoryResult> {
  try {
    storyDir(storyId);
  } catch {
    return { ok: false };
  }

  let row;
  try {
    row = await findStoryWithScenes(storyId);
  } catch (err) {
    console.error(`loadStoryAction: failed to read story ${storyId}`, err);
    return { ok: false };
  }

  if (!row) {
    return { ok: false };
  }

  const loaded = toLoadedStory(row);
  const rawScenesByNumber = new Map(row.scenes.map((scene) => [scene.sceneNumber, scene]));

  const scenes: LoadedSceneMedia[] = loaded.scenes.map((status) => {
    const raw = rawScenesByNumber.get(status.sceneNumber);

    let imageStatus = status.imageStatus;
    let imageDataUrl: string | null = null;
    if (imageStatus === "READY" && raw?.imagePath) {
      try {
        const bytes = readFileSync(raw.imagePath);
        imageDataUrl = `data:${imageMimeTypeForPath(raw.imagePath)};base64,${bytes.toString("base64")}`;
      } catch (err) {
        console.error(`loadStoryAction: scene ${status.sceneNumber}'s image file is missing on disk`, err);
        imageStatus = "FAILED";
      }
    }

    let videoStatus = status.videoStatus;
    let videoDataUrl: string | null = null;
    if (videoStatus === "READY" && raw?.videoPath) {
      try {
        const bytes = readFileSync(raw.videoPath);
        videoDataUrl = `data:video/mp4;base64,${bytes.toString("base64")}`;
      } catch (err) {
        console.error(`loadStoryAction: scene ${status.sceneNumber}'s video file is missing on disk`, err);
        videoStatus = "FAILED";
      }
    }

    return {
      sceneNumber: status.sceneNumber,
      storyPurpose: status.storyPurpose,
      imageStatus,
      imageDataUrl,
      videoStatus,
      videoDataUrl,
    };
  });

  return {
    ok: true,
    storyId: loaded.storyId,
    data: loaded.data,
    scenes,
    imagesApproved: row.imagesApprovedAt !== null,
  };
}

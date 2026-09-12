// Deterministic per-story, per-scene output paths under storage/stories/,
// matching docs/original-brief.md §8's layout exactly:
//
//   storage/stories/<story-id>/scenes/01/image.<ext>
//   storage/stories/<story-id>/scenes/01/video.mp4
//
// Both `storyId` and `sceneNumber` are validated BEFORE being used in a path
// (T-02-07). `sceneNumber` must be a positive integer -- converted from a
// number, never interpolated from a model-supplied string -- and `storyId`
// must match a conservative lowercase-alphanumeric-and-hyphen slug pattern.
// This is the structural reason a model that returned a scene number of
// "../../etc" (or any other traversal-shaped value) cannot reach the
// filesystem: neither value is ever concatenated into a path without first
// passing one of the two assertions below, and both assertions reject
// anything outside their narrow allowed shape by throwing.
//
// Paths are built with plain "/" string concatenation (not node:path.join)
// to match the existing storage/_smoketest/... convention (spend-ledger.ts's
// LEDGER_PATH) and to keep the produced paths OS-independent and easy to
// assert on in tests -- Node's fs APIs accept forward-slash paths on Windows
// exactly as they do on POSIX.

const STORAGE_ROOT = "storage/stories";

// Lowercase letters, digits, and hyphens only. No ".", "/", or "\" can ever
// appear in a value that matches this, which is what rules out both a path
// separator and a parent-directory ("..") segment in one check.
const STORY_ID_PATTERN = /^[a-z0-9-]+$/;

function assertValidStoryId(storyId: string): void {
  if (typeof storyId !== "string" || !STORY_ID_PATTERN.test(storyId)) {
    throw new Error(
      `Invalid story id "${String(storyId)}": must contain only lowercase letters, digits, and hyphens.`,
    );
  }
}

function assertValidSceneNumber(sceneNumber: number): void {
  if (typeof sceneNumber !== "number" || !Number.isInteger(sceneNumber) || sceneNumber < 1) {
    throw new Error(`Invalid scene number "${String(sceneNumber)}": must be a positive integer.`);
  }
}

function pad2(sceneNumber: number): string {
  return String(sceneNumber).padStart(2, "0");
}

export function storyDir(storyId: string): string {
  assertValidStoryId(storyId);
  return `${STORAGE_ROOT}/${storyId}`;
}

export function sceneDir(storyId: string, sceneNumber: number): string {
  assertValidSceneNumber(sceneNumber);
  return `${storyDir(storyId)}/scenes/${pad2(sceneNumber)}`;
}

export function sceneImagePath(storyId: string, sceneNumber: number, extension: string): string {
  const ext = extension.replace(/^\./, "");
  return `${sceneDir(storyId, sceneNumber)}/image.${ext}`;
}

export function sceneVideoPath(storyId: string, sceneNumber: number): string {
  return `${sceneDir(storyId, sceneNumber)}/video.mp4`;
}

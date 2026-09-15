// Deterministic per-story, per-scene output paths under storage/stories/,
// matching docs/original-brief.md §8's layout exactly:
//
//   storage/stories/<story-id>/scenes/01/image.<ext>
//   storage/stories/<story-id>/scenes/01/video.mp4
//
// Phase 4 (plan 04-04, OUTPUT-01/OUTPUT-03) adds the §23 output layout
// alongside it:
//
//   storage/stories/<story-id>/story.json
//   storage/stories/<story-id>/story.txt
//   storage/stories/<story-id>/character-reference.<ext>
//   storage/stories/<story-id>/output/01_scene.mp4
//   storage/stories/<story-id>/output/02_scene.mp4
//
// The two-digit zero-pad on the output clip name is load-bearing, not
// cosmetic: a plain lexicographic name sort is the only ordering CapCut's
// import gives her for free, with no extra tooling. An unpadded "10_scene.mp4"
// sorts before "2_scene.mp4" under that ordering (the character "1" sorts
// before "2"), which would silently scramble a 10+ scene episode's import
// order -- so every clip name is padded to two digits (pad2, already used by
// sceneDir below) to keep name order equal to scene order (OUTPUT-03).
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

// Alphanumeric only. Rules out a path separator or a parent-directory
// segment surviving the leading-dot strip below.
const EXTENSION_PATTERN = /^[a-z0-9]+$/i;

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
  if (!EXTENSION_PATTERN.test(ext)) {
    throw new Error(`Invalid file extension "${extension}": must be alphanumeric only.`);
  }
  return `${sceneDir(storyId, sceneNumber)}/image.${ext}`;
}

export function sceneVideoPath(storyId: string, sceneNumber: number): string {
  return `${sceneDir(storyId, sceneNumber)}/video.mp4`;
}

// --- §23 output layout (OUTPUT-01, OUTPUT-03) -----------------------------

export function outputDir(storyId: string): string {
  return `${storyDir(storyId)}/output`;
}

export function outputClipPath(storyId: string, sceneNumber: number): string {
  assertValidSceneNumber(sceneNumber);
  return `${outputDir(storyId)}/${pad2(sceneNumber)}_scene.mp4`;
}

export function storyJsonPath(storyId: string): string {
  return `${storyDir(storyId)}/story.json`;
}

export function storyTextPath(storyId: string): string {
  return `${storyDir(storyId)}/story.txt`;
}

export function characterReferencePath(storyId: string, extension: string): string {
  const ext = extension.replace(/^\./, "");
  if (!EXTENSION_PATTERN.test(ext)) {
    throw new Error(`Invalid file extension "${extension}": must be alphanumeric only.`);
  }
  return `${storyDir(storyId)}/character-reference.${ext}`;
}

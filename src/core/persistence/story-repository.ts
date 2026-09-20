// The ONLY module outside src/lib/db.ts, src/scripts/, and *.test.ts files
// that may touch the Prisma client or the generated Prisma output --
// check-boundaries.ts invariant 3 fails the structural gate if a Server
// Action imports Prisma directly instead of going through here. This is
// what keeps the story id's storyDir() validation (below) unskippable: a
// future action cannot open its own client and bypass it.
//
// Every exported function takes an optional trailing `client = prisma`
// parameter so tests can pass a temp-file client -- the same injectable-
// default convention spend-ledger.ts uses for `path`.
import { prisma } from "../../lib/db.ts";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { UniquenessStatus } from "../../generated/prisma/enums.ts";
import { storyDir } from "../storage-paths.ts";
// Re-exported so Server Actions (e.g. create-story.ts) can reference the
// enum's values without importing src/generated/prisma directly --
// check-boundaries.ts invariant 3 requires src/app/actions/ to reach the
// database ONLY through this module.
export { UniquenessStatus };
import { fingerprintFromStoryOutput } from "../uniqueness/fingerprint.ts";
import type { StoryDirectorOutput } from "../story/schema.ts";

export interface StoryWithScenes {
  id: string;
  title: string;
  premise: string;
  fullStory: string;
  theme: string;
  emotionalArc: string;
  ending: string;
  protagonistWant: string;
  centralObstacle: string;
  endingShape: string;
  characterBible: unknown;
  styleBible: unknown;
  uniquenessStatus: UniquenessStatus;
  regenerationAttempt: number;
  // D-01/D-02/APPROVAL-01: null = not approved. See the schema comment on
  // Story.imagesApprovedAt for the full rationale.
  imagesApprovedAt: Date | null;
  createdAt: Date;
  scenes: {
    id: string;
    sceneNumber: number;
    storyPurpose: string;
    imagePrompt: string;
    motionPrompt: string;
    durationSeconds: number | null;
    imagePath: string | null;
    imageStatus: string;
    videoPath: string | null;
    videoStatus: string;
    // D-03: per-scene click-loop guard counters.
    imageAttempts: number;
    videoAttempts: number;
    // Phase 6 (06-03): the server-anchored "generating since" timestamp
    // (Pattern 5) and the two D-05 free-retry exemption flags. findStoryWithScenes
    // uses an `include` rather than a `select`, so it already returns these
    // columns -- only this declared type needed widening.
    videoGeneratingSince: Date | null;
    videoSaveCorrupted: boolean;
    imageSaveCorrupted: boolean;
  }[];
}

export interface AcceptedFingerprint {
  id: string;
  protagonistWant: string;
  centralObstacle: string;
  endingShape: string;
}

/**
 * The narrow shape listStoriesWithSceneCounts below selects -- five things
 * per story (id, title, createdAt, imagesApprovedAt, and each scene's
 * imageStatus/videoStatus/videoAttempts), nothing more. No scene id, no
 * image path, no video path -- the Library needs a count and three
 * status-shaped values per scene and nothing else (LIBRARY-01).
 */
export interface LibraryStorySource {
  id: string;
  title: string;
  createdAt: Date;
  imagesApprovedAt: Date | null;
  scenes: {
    imageStatus: string;
    videoStatus: string;
    videoAttempts: number;
  }[];
}

/**
 * Writes the Story row plus one Scene row per entry in output.scenes inside
 * a single transaction, so a partial story can never exist. Routes storyId
 * through storyDir() before the write -- an id that cannot produce a valid
 * storage path must not become a database key either (T-03-04). Writes no
 * imagePath/videoPath; those stay null until plan 03-03.
 */
export async function saveStoryWithScenes(
  storyId: string,
  output: StoryDirectorOutput,
  uniquenessStatus: UniquenessStatus,
  regenerationAttempt: number,
  client: PrismaClient = prisma,
): Promise<void> {
  // Throws if storyId cannot produce a valid storage/stories/<id>/ path --
  // refuses the write rather than letting a malformed id become a database
  // key that has no corresponding directory.
  storyDir(storyId);

  const fingerprint = fingerprintFromStoryOutput(output);

  await client.$transaction(async (tx) => {
    await tx.story.create({
      data: {
        id: storyId,
        title: output.story.title,
        premise: output.story.premise,
        fullStory: output.story.story,
        theme: output.story.theme,
        emotionalArc: output.story.emotional_arc,
        ending: output.story.ending,
        protagonistWant: fingerprint.protagonistWant,
        centralObstacle: fingerprint.centralObstacle,
        endingShape: fingerprint.endingShape,
        characterBible: output.character_bible,
        styleBible: output.style_bible,
        uniquenessStatus,
        regenerationAttempt,
      },
    });

    for (const scene of output.scenes) {
      await tx.scene.create({
        data: {
          storyId,
          sceneNumber: scene.scene_number,
          storyPurpose: scene.story_purpose,
          imagePrompt: scene.image_prompt,
          motionPrompt: scene.motion_prompt,
          durationSeconds: scene.duration ?? null,
        },
      });
    }
  });
}

/**
 * Returns the Story with its scenes ordered by scene number ascending, or
 * null if no row exists with this id.
 */
export async function findStoryWithScenes(
  storyId: string,
  client: PrismaClient = prisma,
): Promise<StoryWithScenes | null> {
  const story = await client.story.findUnique({
    where: { id: storyId },
    include: { scenes: { orderBy: { sceneNumber: "asc" } } },
  });
  return story as StoryWithScenes | null;
}

/**
 * Returns id plus the three fingerprint columns for stories whose
 * uniqueness status is ACCEPTED only. A story stored as
 * REJECTED_EXHAUSTED_SHOWN under D-04 is deliberately excluded: the wife
 * has not chosen to use it, so it is not yet part of the history future
 * stories are compared against.
 */
export async function listAcceptedFingerprints(
  client: PrismaClient = prisma,
): Promise<AcceptedFingerprint[]> {
  return client.story.findMany({
    where: { uniquenessStatus: UniquenessStatus.ACCEPTED },
    select: { id: true, protagonistWant: true, centralObstacle: true, endingShape: true },
  });
}

/**
 * Targeted status update, used by the uniqueness gate (plan 03-02).
 */
export async function markUniquenessStatus(
  storyId: string,
  status: UniquenessStatus,
  client: PrismaClient = prisma,
): Promise<void> {
  await client.story.update({
    where: { id: storyId },
    data: { uniquenessStatus: status },
  });
}

/**
 * Returns every story (newest first) with the five fields the Library
 * screen needs to render its list and compute its status label (LIBRARY-01).
 * Mirrors listAcceptedFingerprints' findMany+select shape exactly, with a
 * nested scene selection instead of a flat one.
 *
 * The no-duplicates clause needs no defensive work: Story.id is the table's
 * primary key and this is a single findMany over that table with a nested
 * scene selection rather than a flat join, so one row per story is
 * structural, not a query-shape guarantee that could quietly break.
 */
export async function listStoriesWithSceneCounts(client: PrismaClient = prisma): Promise<LibraryStorySource[]> {
  return client.story.findMany({
    select: {
      id: true,
      title: true,
      createdAt: true,
      imagesApprovedAt: true,
      scenes: {
        select: {
          imageStatus: true,
          videoStatus: true,
          videoAttempts: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * The only writer of Story.imagesApprovedAt (D-01/D-02, APPROVAL-01) --
 * records a single, deliberate approval decision covering every scene in
 * the story. There is deliberately no function to clear this column: nothing
 * in this phase un-approves a story.
 */
export async function markImagesApproved(storyId: string, client: PrismaClient = prisma): Promise<void> {
  await client.story.update({
    where: { id: storyId },
    data: { imagesApprovedAt: new Date() },
  });
}

# Phase 4: Wife-Facing Review & Approval Flow - Pattern Map

**Mapped:** 2026-09-14
**Files analyzed:** 15 (7 new Server Actions, 1 new component, 2 extended components, 1 new/extended repository work, 1 new retry-cap module, 1 schema migration, 1 extended page, 1 optional Library screen)
**Analogs found:** 15 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/app/actions/approve-images.ts` (NEW) | server action | request-response (state mutation) | `src/core/persistence/story-repository.ts` (`markUniquenessStatus`) + `src/app/actions/generate-video.ts` (gate placement) | role-match (repo) / exact (gate pattern) |
| `src/app/actions/regenerate-scene-image.ts` (NEW) | server action | CRUD (single-scene overwrite) | `src/app/actions/generate-video.ts` (`generateSceneVideoAction`) | exact (same dispatch/gate/error shape, image not video) |
| `src/app/actions/generate-all-videos.ts` (NEW) | server action | batch / event-driven (`after()` dispatch) | `src/core/uniqueness/check.ts` (`runUniqueStoryDirector`'s bounded sequential loop) + `src/app/actions/generate-video.ts` (per-call dispatch) | role-match (loop shape) / exact (per-scene dispatch) |
| `src/app/actions/retry-scene-video.ts` (NEW) | server action | request-response | `src/app/actions/generate-video.ts` (`generateSceneVideoAction`) | exact — thin wrapper reusing the same function per Pattern 1 |
| `src/app/actions/get-story-status.ts` (NEW) | server action | request-response (polling read) | `src/app/actions/load-story.ts` (`loadStoryAction`) | role-match — same read-and-shape-for-browser convention, lighter payload |
| `src/app/actions/list-stories.ts` (NEW) | server action | CRUD (read-list) | `src/core/persistence/story-repository.ts` (`listAcceptedFingerprints`) | role-match — same `findMany`+`select` shape |
| `src/app/actions/open-story-folder.ts` (NEW) | server action | file-I/O | `src/app/actions/load-story.ts` (storyDir-validate-before-use pattern) | role-match (validation) — no direct file-open analog exists yet |
| `src/core/retry/caps.ts` (NEW) | utility/config | transform (env-parse) | `src/core/uniqueness/check.ts` (`maxRegenerationAttempts`) | exact |
| `src/core/persistence/story-repository.ts` (EXTENDED: `markImagesApproved`, `listStoriesWithSceneCounts`) | model/repository | CRUD | same file, existing `markUniquenessStatus`/`listAcceptedFingerprints` functions | exact (same file, same conventions) |
| `src/core/persistence/generation-repository.ts` (EXTENDED: `incrementImageAttempt`, `incrementVideoAttempt`) | model/repository | CRUD | same file, existing `updateSceneImage`/`updateSceneVideo` | exact |
| `prisma/schema.prisma` (EXTENDED: `imagesApprovedAt`, `imageAttempts`, `videoAttempts`) | migration/config | CRUD (schema) | same file, existing `Story`/`Scene` models | exact |
| `src/app/page.tsx` (EXTENDED: 4th screen wiring, approval UI, remove single-scene `videoResult` state) | component (page/state machine) | request-response (client orchestration) | same file's existing `screen` state machine + `handleGenerateVideo`/`handleGenerateImages` handlers | exact |
| `src/components/story/VideoStatusScreen.tsx` (NEW) | component | streaming (polling display) | `src/components/story/StoryReview.tsx` (screen-shell + primary-CTA-button shape) | role-match |
| `src/components/scenes/SceneVideo.tsx` (EXTENDED: new `capped` state) | component | transform (render-by-state) | same file, existing state-branch structure | exact |
| `src/components/story/MyStoriesList.tsx` (NEW, soft LIBRARY-01) | component | request-response (list render) | `src/components/story/StoryReview.tsx` (screen-shell/typography conventions) | role-match |

## Pattern Assignments

### `src/app/actions/approve-images.ts` (server action, request-response)

**Analog:** `src/core/persistence/story-repository.ts` lines 150-159 (`markUniquenessStatus`) for the repository write shape; `src/app/actions/generate-video.ts` lines 100-129 for the "gate immediately before the paid dispatch" placement philosophy (here there's no paid call, but the same "server writes the single source of truth, plain-language message back" shape applies).

**Imports pattern** (mirror `load-story.ts` lines 1-9):
```typescript
"use server";

import { storyDir } from "../../core/storage-paths.ts";
import { findStoryWithScenes, markImagesApproved } from "../../core/persistence/story-repository.ts";
```

**Core pattern** — validate all scene images ready, then write once (new function in `story-repository.ts`, same shape as `markUniquenessStatus`):
```typescript
// story-repository.ts:150-159 (existing, to mirror)
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
// NEW markImagesApproved(storyId, client) follows this exact shape:
// data: { imagesApprovedAt: new Date() }
```

**Error/message pattern** — plain-language only, matching UI-SPEC's locked copy exactly: `"All scene images need to be ready before you can approve them."` on precondition failure, `"Images approved. You can now generate videos for every scene."` on success (UI-SPEC Copywriting Contract, verbatim).

---

### `src/app/actions/generate-all-videos.ts` (server action, batch/event-driven)

**Analog:** RESEARCH.md's own worked example (Pattern 2) is the primary template — it is itself extracted from this repo's `after()`-availability check and the existing sequential-dispatch shape in `src/core/uniqueness/check.ts` lines 324-432 (`runUniqueStoryDirector`'s bounded `for` loop calling one dispatch function per iteration, tolerating individual failures without stopping the loop).

**Sequential-dispatch-tolerating-individual-failure pattern** (from `check.ts:346-426`, adapt loop shape — no early-return on a single scene failing):
```typescript
for (const scene of approvedScenes) {
  await generateSceneVideoAction(storyId, scene.sceneNumber); // never throws; writes its own status
  // no early return / no throw propagation -- one scene's failure must not block the next (D-04)
}
```

**Gate-before-dispatch pattern** (from `generate-video.ts:117-129`'s `checkCeiling` placement — same "check synchronously, refuse before doing real work" shape applied to the approval flag):
```typescript
if (!story.imagesApprovedAt) {
  return { ok: false, message: "These images haven't been approved yet. Approve them before generating video." };
}
```

**`after()` usage** — cite RESEARCH.md Pattern 2 verbatim (no existing in-repo analog; this is genuinely new to the codebase, first use of `next/server`'s `after`).

---

### `src/app/actions/regenerate-scene-image.ts` and `src/app/actions/retry-scene-video.ts` (server actions, CRUD / request-response)

**Analog:** `src/app/actions/generate-video.ts` in full (lines 109-252) — the entire dispatch-gate-record shape: `checkCeiling` → try dispatch → `recordSpend` (unconditional `billed: true`) → `recordGeneration` (dual write) → `updateSceneVideo`/`updateSceneImage` targeted write → plain-language `message` only, never provider text or a path.

**Signature change to make (per RESEARCH.md Pattern 3):**
```typescript
// OLD (Phase 2): export async function generateSceneVideoAction(storyId: string, scene: Scene, imagePath: string)
// NEW (Phase 4): export async function generateSceneVideoAction(storyId: string, sceneNumber: number)
// -- resolves scene + imagePath + imagesApprovedAt server-side via findStoryWithScenes(storyId)
```

**Retry-cap check placement** — same position as the `checkCeiling` call (`generate-video.ts:117-129`), add immediately after the approval check, before any file read or provider dispatch:
```typescript
if (scene.videoAttempts >= maxSceneRetryAttempts()) {
  return { ok: false, videoPath: null, videoDataUrl: null, message: "This scene's video has reached its limit of ${n} attempts. The other scenes aren't affected — you can continue with what's ready, or start a new story to try again.", durationSeconds };
}
```
(Copy from UI-SPEC Copywriting Contract, verbatim, `{n}` interpolated from `maxSceneRetryAttempts()`.)

**Attempt-increment write** — new `generation-repository.ts` functions mirroring `updateSceneVideo`/`updateSceneImage`'s exact shape (lines 151-166), best-effort try/catch, never throws:
```typescript
// existing shape to mirror (generation-repository.ts:151-166)
export async function updateSceneVideo(
  storyId: string, sceneNumber: number, videoPath: string | null, status: SceneAssetStatus,
  client: PrismaClient = prisma,
): Promise<void> {
  try {
    await client.scene.update({
      where: { storyId_sceneNumber: { storyId, sceneNumber } },
      data: { videoPath, videoStatus: status },
    });
  } catch (err) { console.error(`generation-repository: updateSceneVideo failed for story ${storyId} scene ${sceneNumber}`, err); }
}
// NEW incrementVideoAttempt(storyId, sceneNumber, client) follows this exact shape:
// data: { videoAttempts: { increment: 1 } }
```

---

### `src/app/actions/get-story-status.ts` (server action, polling read)

**Analog:** `src/app/actions/load-story.ts` lines 73-133 — reuse `storyDir(storyId)` pre-validation (lines 74-78) and `findStoryWithScenes` as the read, but return a much lighter shape (no data: URLs — just `sceneNumber`, `videoStatus`, `videoAttempts` per scene, per RESEARCH.md's own example) since this is polled every few seconds.

**Imports pattern** (lines 1-9 of `load-story.ts`, trimmed):
```typescript
"use server";
import { storyDir } from "../../core/storage-paths.ts";
import { findStoryWithScenes } from "../../core/persistence/story-repository.ts";
```

**Validate-before-query pattern** (`load-story.ts:74-90`, identical shape to reuse):
```typescript
try { storyDir(storyId); } catch { return null; }
let row;
try { row = await findStoryWithScenes(storyId); } catch (err) { console.error(...); return null; }
if (!row) return null;
```

---

### `src/app/actions/list-stories.ts` (server action, CRUD read-list)

**Analog:** `src/core/persistence/story-repository.ts` lines 138-145 (`listAcceptedFingerprints`) — same `client.story.findMany({ select: {...} })` shape, no `where` filter needed (list everything), order by `createdAt desc`.

```typescript
// story-repository.ts:138-145 (existing, to mirror)
export async function listAcceptedFingerprints(
  client: PrismaClient = prisma,
): Promise<AcceptedFingerprint[]> {
  return client.story.findMany({
    where: { uniquenessStatus: UniquenessStatus.ACCEPTED },
    select: { id: true, protagonistWant: true, centralObstacle: true, endingShape: true },
  });
}
// NEW listStoriesWithSceneCounts(client) follows this shape:
// findMany({ select: { id, title, createdAt, imagesApprovedAt, scenes: { select: { videoStatus: true } } }, orderBy: { createdAt: "desc" } })
// -- status is COMPUTED in the action/view layer from imagesApprovedAt + scene.videoStatus per UI-SPEC's status vocabulary, not stored
```

---

### `src/app/actions/open-story-folder.ts` (server action, file-I/O)

**Analog:** No direct in-repo analog for opening a folder (new capability); closest structural analog for the "validate id before touching the filesystem, refuse on malformed input" shape is `load-story.ts` lines 74-78 / `storage-paths.ts` lines 34-46 (`assertValidStoryId`, throws on anything outside `^[a-z0-9-]+$`).

**Use RESEARCH.md's own worked Code Example verbatim** (it was built directly against this repo's `storage-paths.ts` and is the correct pattern):
```typescript
"use server";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { storyDir } from "../../core/storage-paths.ts";

export async function openStoryFolderAction(storyId: string): Promise<{ ok: boolean; message: string }> {
  let relativeDir: string;
  try {
    relativeDir = storyDir(storyId);
  } catch {
    return { ok: false, message: "This story's folder could not be found." };
  }
  const absoluteDir = resolve(relativeDir);
  execFile("explorer.exe", [absoluteDir], (err) => {
    if (err) console.error(`openStoryFolderAction: explorer.exe reported an error for ${absoluteDir}`, err);
  });
  return { ok: true, message: "Opening the folder..." };
}
```

---

### `src/core/retry/caps.ts` (utility/config, transform)

**Analog:** `src/core/uniqueness/check.ts` lines 35-53 (`maxRegenerationAttempts`) — copy verbatim, only the env var name and constant differ.

```typescript
// check.ts:35-53 (existing, mirror exactly)
export const DEFAULT_MAX_REGENERATION_ATTEMPTS = 3;

export function maxRegenerationAttempts(env: Record<string, string | undefined> = process.env): number {
  const raw = env.MAX_UNIQUENESS_REGENERATION_ATTEMPTS;
  if (raw === undefined) {
    return DEFAULT_MAX_REGENERATION_ATTEMPTS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_MAX_REGENERATION_ATTEMPTS;
  }
  return parsed;
}
// NEW maxSceneRetryAttempts(env) in src/core/retry/caps.ts:
// same shape, env var MAX_SCENE_RETRY_ATTEMPTS, DEFAULT_MAX_SCENE_RETRY_ATTEMPTS = 3
```

---

### `prisma/schema.prisma` (migration)

**Analog:** same file, existing `Story`/`Scene` models (read this session; current fields verified at `prisma/schema.prisma:44-90` per RESEARCH.md's own citation). Add fields inline, matching existing nullable-DateTime and Int-with-default conventions already used elsewhere in the schema (e.g. `regenerationAttempt Int @default(0)` already on `Story`).

```prisma
model Story {
  // ...existing fields unchanged...
  imagesApprovedAt   DateTime?
}
model Scene {
  // ...existing fields unchanged...
  imageAttempts      Int        @default(0)
  videoAttempts      Int        @default(0)
}
```

---

### `src/app/page.tsx` (EXTENDED — page/state-machine component)

**Analog:** same file's existing `screen` state-machine (`useState<Screen>`, line 31) and `handleGenerateImages`/`handleGenerateVideo` handlers (lines 139-199+) plus the SceneCard-mapping block (lines 230-264) and primary-CTA-button block (lines 266-276).

**Screen-state-machine extension pattern** — add `"video-status"` (and optionally `"library"`) to the existing `Screen` union and extend the state machine the same way `"review-images"` was already added; do NOT introduce a router — CONTEXT.md/02-CONTEXT.md D-03 already established single-page-no-routing as the deliberate convention for this project.

**Primary CTA button pattern** (`page.tsx:266-276`, exact class string to reuse for "Approve These Images" / "Continue to Video Generation" / "Generate All Videos" / "Open Output Folder"):
```typescript
<button
  type="button"
  disabled={!canGenerateVideo || videoLoading}
  onClick={handleGenerateVideo}
  className="rounded-full bg-foreground px-5 py-3 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
>
  {videoLoading ? "Generating video..." : `Generate Video for Scene ${videoSceneNumber ?? 1} (one scene only, for now)`}
</button>
```
(Verbatim per UI-SPEC's "loading" row: disable + label swap to an in-progress phrase, no new pattern.)

**State to remove, not extend:** `videoResult`/`videoLoading` (single-scene shape, `page.tsx` lines 50-51, ~160-283) is fully superseded by the new per-scene DB-backed polling model — RESEARCH.md's own "State of the Art" table flags this explicitly.

---

### `src/components/story/VideoStatusScreen.tsx` (NEW component)

**Analog:** `src/components/story/StoryReview.tsx` in full — screen-shell shape (`flex flex-col gap-8`), section headings (`text-lg font-medium`), error-banner block (lines 91-95), and single primary-CTA-button-at-bottom convention (lines 97-104). Also reuses Screen 3's existing grid (`grid grid-cols-1 gap-4 sm:grid-cols-2`, per UI-SPEC) and the already-built `SceneVideo`/`SceneCard` components directly, one row per scene.

**Error banner pattern** (`StoryReview.tsx:91-95`, reuse verbatim class string):
```typescript
{error && (
  <p className="rounded border border-red-300 bg-red-50 p-3 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
    {error}
  </p>
)}
```

---

### `src/components/scenes/SceneVideo.tsx` (EXTENDED — new `capped` state)

**Analog:** same file, existing `failed` state branch (lines 58-75) — the `capped` state is a variant of this branch with no `onRetry` button rendered (UI-SPEC: "no button — retries exhausted") and amber styling instead of red (mirroring the existing amber warning convention in `StoryReview.tsx` lines 28-32).

```typescript
// existing failed-state shape to mirror (SceneVideo.tsx:58-75), swap red->amber, drop the button:
if (state === "capped") {
  return (
    <p className="text-xs text-amber-900 dark:text-amber-200">
      {message}
    </p>
  );
}
```

**Amber styling analog** (`StoryReview.tsx:28-32`):
```typescript
<p className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
  {warning}
</p>
```

---

### `src/components/story/MyStoriesList.tsx` (NEW, soft LIBRARY-01)

**Analog:** `src/components/story/StoryReview.tsx` for screen-shell/typography conventions (Display 24px title, Body list items); empty-state copy is locked in UI-SPEC ("No stories yet" / "Create your first story to see it appear here." / "Create Your First Story" CTA using the same primary-button class as above).

## Shared Patterns

### Server-side unbypassable gate (approval + retry cap)
**Source:** `src/app/actions/generate-video.ts` lines 117-129 (`checkCeiling` placement)
**Apply to:** `generate-all-videos.ts`, `retry-scene-video.ts`, `regenerate-scene-image.ts`, and the refactored `generate-video.ts` itself — every gate (approval, image-attempt cap, video-attempt cap) must live inside the single dispatch function, never only in a caller or the UI. Never duplicate the check per-caller (RESEARCH.md Pitfall 1).

### Best-effort persistence writes (never throw)
**Source:** `src/core/persistence/generation-repository.ts` lines 8-22 (module-level doc comment) and every function in that file (`updateSceneImage`/`updateSceneVideo`, lines 130-166)
**Apply to:** All new persistence functions (`markImagesApproved`, `incrementImageAttempt`, `incrementVideoAttempt`, `listStoriesWithSceneCounts`) — wrap in try/catch, log once server-side, never propagate into the caller's returned result.

### Injectable-default `client = prisma` parameter
**Source:** `src/core/persistence/story-repository.ts` (every exported function) and `generation-repository.ts` (same)
**Apply to:** Every new repository function, for test-injectability with a temp-file client (matches `check.test.ts`'s convention).

### storyId/sceneNumber validated before filesystem or query use
**Source:** `src/core/storage-paths.ts` lines 34-46 (`assertValidStoryId`/`assertValidSceneNumber`); `load-story.ts` lines 74-78
**Apply to:** `open-story-folder.ts` (mandatory — this is the security-relevant gate per RESEARCH.md's threat table), `get-story-status.ts`, and any action taking a raw `storyId` string from the client.

### Plain-language-only messages, never provider text/paths
**Source:** `generate-video.ts`'s `message` field convention throughout; `SceneVideo.tsx`/`SceneCard.tsx` doc comments (T-02-06, T-03-15)
**Apply to:** Every new action's return type and every new/extended component prop — no raw provider text, model IDs, filesystem paths, attempt counts as raw numbers without a sentence, ever reaches a rendered prop.

### Primary-CTA button styling (accent reserved for exactly one button per screen)
**Source:** `StoryReview.tsx` lines 97-104; `page.tsx` lines 266-276
**Apply to:** "Approve These Images", "Continue to Video Generation", "Generate All Videos", "Open Output Folder", "Create Your First Story" — reuse the exact class string `rounded-full bg-foreground px-5 py-3 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]`; secondary per-scene actions ("Regenerate this image", "Try again") reuse `SceneVideo.tsx`'s existing outline-pill button class (lines 66-68).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `next/server`'s `after()` usage inside `generate-all-videos.ts` | server action | event-driven/background | No prior background-dispatch code exists in this repo; RESEARCH.md's own Pattern 2 (sourced from official Next.js docs, not this codebase) is the primary reference — treat it as the analog since none exists locally |
| `open-story-folder.ts`'s `execFile("explorer.exe", ...)` call | server action | file-I/O (OS interop) | No prior OS-process-spawning code exists in this repo; RESEARCH.md's Code Example (verified against this repo's own `storage-paths.ts`) is the primary reference |

## Metadata

**Analog search scope:** `src/app/actions/`, `src/app/page.tsx`, `src/components/scenes/`, `src/components/story/`, `src/core/persistence/`, `src/core/uniqueness/`, `src/core/storage-paths.ts`, `prisma/schema.prisma`
**Files scanned:** 10 read in full this session (`generate-video.ts`, `load-story.ts`, `check.ts`, `story-repository.ts`, `generation-repository.ts`, `SceneVideo.tsx`, `SceneCard.tsx`, `StoryReview.tsx`, `storage-paths.ts`, `page.tsx` excerpt), plus `create-story.ts`/`generate-images.ts` referenced via RESEARCH.md's own direct reads (not re-read this session to avoid duplicate context cost — their patterns are already fully captured in RESEARCH.md's Sources section and this document's citations of `generate-video.ts`, which shares their exact conventions)
**Pattern extraction date:** 2026-09-14

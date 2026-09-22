---
phase: 02-core-generation-pipeline
reviewed: 2026-09-13T00:00:00Z
depth: standard
files_reviewed: 30
files_reviewed_list:
  - .gitignore
  - eslint.config.mjs
  - next-env.d.ts
  - next.config.ts
  - package.json
  - postcss.config.mjs
  - src/app/actions/create-story.ts
  - src/app/actions/generate-images.ts
  - src/app/actions/generate-video.ts
  - src/app/globals.css
  - src/app/layout.tsx
  - src/app/page.tsx
  - src/components/scenes/SceneCard.tsx
  - src/components/scenes/SceneVideo.tsx
  - src/components/story/CreateStoryForm.tsx
  - src/components/story/StoryReview.tsx
  - src/core/storage-paths.test.ts
  - src/core/storage-paths.ts
  - src/core/story/director.test.ts
  - src/core/story/director.ts
  - src/core/story/schema.ts
  - src/core/story/styles.test.ts
  - src/core/story/styles.ts
  - src/core/story/validate-scene-plan.test.ts
  - src/core/story/validate-scene-plan.ts
  - src/providers/llm/gemini.test.ts
  - src/providers/llm/gemini.ts
  - src/scripts/check-boundaries.ts
  - src/scripts/story-probe.ts
  - tsconfig.json
findings:
  critical: 1
  warning: 4
  info: 5
  total: 10
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-09-13T00:00:00Z
**Depth:** standard
**Files Reviewed:** 30
**Status:** issues_found

## Summary

Reviewed the Story Director pipeline (`director.ts`, `schema.ts`, `validate-scene-plan.ts`, `styles.ts`), the Gemini LLM provider wrapper (`gemini.ts`), the three provider-calling Server Actions (`create-story.ts`, `generate-images.ts`, `generate-video.ts`), path-construction (`storage-paths.ts`), the client components/pages, and the tooling scripts (`check-boundaries.ts`, `story-probe.ts`).

Overall the checkCeiling-before/recordSpend-after discipline is applied consistently and every provider-calling action has a single gated dispatch point with no bypass. The client/server boundary holds for everything under `src/components/`, and no raw prompt/model-id/filesystem path is rendered in reviewed UI text. `storage-paths.ts` correctly rejects a malicious `storyId` or `sceneNumber`.

The one finding classified Critical is a spend-accounting asymmetry in `generate-video.ts`: unlike the story/image actions (which conservatively count *any* dispatched call, including a blocked one, toward spend), the video action only records spend when a local file was actually produced, treating a client-side timeout as "not billed." If Veo bills a long-running operation once dispatched (rather than only on our own successful poll), this under-counts real spend against the hard $15 ceiling — the opposite of the "always over-count, never under-count" convention this codebase otherwise follows everywhere else. Several warnings also apply: an unvalidated third parameter in the path-builder, a missing try/catch around scene-image file writes that can silently drop already-paid-for results, a boundary-check script whose client-bundle scan misses `src/app/page.tsx`, and no server-side guard against a whitespace-only idea burning a paid Story Director call.

## Critical Issues

### CR-01: Video spend accounting under-counts a timed-out/blocked call, unlike every other paid path in this codebase

**File:** `src/app/actions/generate-video.ts:165-172`
**Issue:** In `generate-video.ts`, `recordSpend` is called with `billed: Boolean(result.filePath)`. Since `result.filePath` is null whenever the call is blocked *or* times out (checked immediately below at lines 174-192), both failure modes are recorded as "not billed" — i.e., not counted toward the running total. Compare this to the identical-shaped code in `director.ts:183-190` and `generate-images.ts:148-155`, where `billed: !result.blocked` deliberately counts *any dispatched call, including a blocked one*, toward spend ("conservative accounting" per the code's own comments), because a dispatched call may already have cost money regardless of what the local process could observe.

A client-side polling timeout is exactly the scenario where the underlying Veo operation was genuinely dispatched and may still complete (and be billed) on Google's side after this process gives up waiting. Marking that outcome `billed: false` means the local ledger can silently miss real spend, which directly contradicts this project's hard, no-exception $15/month cap ("every paid provider call must pass a pre-flight … check — no exceptions, no bypass via retry", CLAUDE.md).
**Fix:**
```ts
// Mirror the story/image convention: any dispatched call counts, including
// a timeout or block, since the provider may have already incurred cost.
recordSpend({
  call: `scene-video:${storyId}:${scene.scene_number}`,
  model: VIDEO_MODEL_ID,
  estimatedUsd,
  usageMetadata: result.usageMetadata,
  billed: true, // dispatched call; conservative accounting like the other two actions
  at: new Date().toISOString(),
});
```
If `veo.ts`'s `generateVideo` can positively confirm a call was *never* dispatched to the provider at all (e.g. a local validation error before any network request), that specific case may legitimately stay `billed: false` — but a `timedOut` result must not, since the operation was dispatched. Verify against `providers/video/veo.ts`'s actual polling/timeout semantics before deciding the exact boundary.

## Warnings

### WR-01: `sceneImagePath`'s `extension` parameter is concatenated into the path with no shape validation

**File:** `src/core/storage-paths.ts:58-61`
**Issue:** `storyId` and `sceneNumber` are both validated by a throwing assertion before use (as the module's own header comment documents), but the third parameter, `extension`, is only ever `.replace(/^\./, "")`'d — a single leading dot is stripped, nothing else is checked. `extension.replace(/^\./, "")` only removes one leading character; a value like `"../../evil"` becomes `"./../evil"`, which is then concatenated straight into the returned path (`.../image.` + that value), reintroducing a `../` traversal segment into the final string. Today the only real caller (`generate-images.ts`'s `extensionForMimeType`) always returns a value matching `/^[a-z0-9]+$/i` or a hardcoded string, so this isn't currently reachable — but the module is the codebase's sole path-injection boundary, and this parameter is exported as part of its public API with no equivalent guard to the other two.
**Fix:**
```ts
const EXTENSION_PATTERN = /^[a-z0-9]+$/i;

export function sceneImagePath(storyId: string, sceneNumber: number, extension: string): string {
  const ext = extension.replace(/^\./, "");
  if (!EXTENSION_PATTERN.test(ext)) {
    throw new Error(`Invalid file extension "${extension}": must be alphanumeric only.`);
  }
  return `${sceneDir(storyId, sceneNumber)}/image.${ext}`;
}
```

### WR-02: A filesystem write failure mid-loop discards every already-generated scene status in `generateSceneImagesAction`

**File:** `src/app/actions/generate-images.ts:171-172`
**Issue:** `mkdirSync(...)` and `writeFileSync(imagePath, result.bytes)` are called with no surrounding try/catch, unlike every other fallible step in this same function (the `checkCeiling` call, the `generateImage` call, and the caller's own outer try/catch in `page.tsx`). If either call throws (e.g. a locked file, a full disk, or a permissions error on the wife's laptop), the exception propagates out of the `for` loop and out of the whole action, discarding the `statuses` array accumulated for every scene processed so far — even though `recordSpend` has *already* been called for the scene whose write just failed (and for every prior scene). The caller (`page.tsx`'s `handleGenerateImages`) only shows a single generic "Something went wrong" message and `sceneStatuses` is never updated, so the wife has no way to see which (already-paid-for) scenes actually succeeded.
**Fix:**
```ts
try {
  mkdirSync(sceneDir(storyId, scene.scene_number), { recursive: true });
  writeFileSync(imagePath, result.bytes);
} catch (err) {
  console.error(`generateSceneImagesAction: failed to write scene ${scene.scene_number}'s image to disk`, err);
  statuses.push({
    sceneNumber: scene.scene_number,
    imagePath: null,
    imageDataUrl: null,
    ok: false,
    message: "The image was generated but could not be saved. Please try again.",
  });
  continue; // do not set `stopped`; the paid call succeeded, only the write failed
}
```

### WR-03: `check-boundaries.ts`'s client-bundle scan does not cover `src/app/*.tsx`, so a violation in `page.tsx` (or any future `"use client"` file outside `src/components/`) would go undetected

**File:** `src/scripts/check-boundaries.ts:56`
**Issue:** Invariant 1's stated purpose is "No file under `src/components/` imports a provider module or the spend ledger … this is what keeps `GEMINI_API_KEY` out of the client bundle." But `src/app/page.tsx` is *also* a `"use client"` file that ships to the browser, and it lives outside `src/components/`, so `componentFiles = allFiles.filter((f) => f.includes("src/components/"))` never inspects it. Today `page.tsx` only imports Server Actions and provider-free `core/` modules, so there is no live violation — but the script's own name and stated invariant ("client bundle must never import a provider or the spend ledger") implies a guarantee that doesn't actually hold for every client file in the tree, only for one directory of them.
**Fix:** Scan for any file containing a `"use client"` directive (or at minimum, also include `src/app/**/*.tsx` non-action, non-server files) rather than hardcoding the `src/components/` path:
```ts
const clientFiles = allFiles.filter((f) => {
  if (!f.endsWith(".tsx")) return false;
  const content = readFileSync(f, "utf8");
  return /^["']use client["'];?/m.test(content);
});
```

### WR-04: No server-side guard against a whitespace-only idea/character description triggering a paid Story Director call

**File:** `src/app/actions/create-story.ts:25`, `src/components/story/CreateStoryForm.tsx:53,64`
**Issue:** The only input guard on `idea` and `characterDescription` is the HTML `required` attribute on the two `<textarea>` elements in `CreateStoryForm.tsx`. HTML's `required` validation only rejects a value whose length is exactly zero — a value of `" "` (or any whitespace-only string) satisfies `required` and submits successfully. `createStoryAction` (and `runStoryDirector`/`buildStoryPrompt` beneath it) performs no `.trim().length > 0` check before dispatching a real, budget-gated Gemini call, so a whitespace-only submission still burns a paid Story Director call (checkCeiling passes, the call is dispatched, spend is recorded) for guaranteed-useless output.
**Fix:**
```ts
export async function createStoryAction(input: StoryDirectorInput): Promise<CreateStoryActionResult> {
  if (!input.idea.trim() || !input.characterDescription.trim()) {
    return { ok: false, error: "Please describe your story idea and the main character before creating a story." };
  }
  try {
    // ...
```

## Info

### IN-01: `SceneCard`/`SceneVideo`'s `onGenerateVideo` prop is defined but never passed by the only caller

**File:** `src/components/scenes/SceneCard.tsx:26`, `src/app/page.tsx:153-170`
**Issue:** `SceneCardProps.onGenerateVideo` exists and is threaded down into `SceneVideo`'s `onGenerate`, which — when present — renders a per-card "Generate video for this scene" button (`SceneVideo.tsx:78-89`). `page.tsx` never passes `onGenerateVideo` to `SceneCard` (only `onRetryVideo`), so that code path is currently dead: the video-target scene's card always falls through to the `waitingHint` text, and the only way to start generation is the page-level button below the grid. This isn't wrong (the design intentionally routes through one button), but the unused prop/branch is worth either wiring up or removing so a future reader doesn't need to trace call sites to learn it's unreachable.
**Fix:** Either pass `onGenerateVideo={isVideoTarget ? handleGenerateVideo : undefined}` from `page.tsx`, or delete the `onGenerate`/button branch from `SceneVideo.tsx` if the single global button is the intended permanent design.

### IN-02: `GenerateStoryResult.estimatedUsd` doesn't reflect the model that actually served the request

**File:** `src/providers/llm/gemini.ts:202`
**Issue:** `const estimatedUsd = LLM_PRICE_PER_CALL[primaryModel] ?? LLM_PRICE_PER_CALL[PRIMARY_MODEL];` uses `primaryModel` (the model *requested*), not `modelUsed` (the model that *actually* served the response after a possible 403/404 fallback). When the fallback path runs, `modelUsed` is `gemini-3.8-flash` but this field still reports the pro-preview price. It happens to be harmless today because `runStoryDirector` computes and uses its own separate conservative estimate for the actual `recordSpend`/`checkCeiling` calls rather than this field, but the field is part of the function's public return type and its name/doc strongly implies it reflects the real dispatched cost.
**Fix:** `const estimatedUsd = LLM_PRICE_PER_CALL[modelUsed] ?? LLM_PRICE_PER_CALL[PRIMARY_MODEL];`

### IN-03: `mimeTypeForImagePath` failures are reported with a misleading "could not be read" message

**File:** `src/app/actions/generate-video.ts:121-135`
**Issue:** `readFileSync(imagePath)` and `mimeTypeForImagePath(imagePath)` (which throws on an unrecognized extension) are both wrapped in the same try/catch, which unconditionally returns "The scene's image could not be read, so no video could be generated." If the actual failure is an unrecognized extension (the image file exists and is perfectly readable), the message describes the wrong problem.
**Fix:** Compute the mime type first, in its own try/catch, with a distinct message ("This scene's image format isn't supported for video generation.") before attempting the read.

### IN-04: `layout.tsx` still ships the default `create-next-app` metadata

**File:** `src/app/layout.tsx:15-18`
**Issue:** `metadata.title`/`description` are the scaffold defaults ("Create Next App" / "Generated by create next app"), not this product's actual name ("AI Animated YouTube Shorts Studio"). Minor, but it's user-facing (browser tab title) and easy to fix.
**Fix:**
```ts
export const metadata: Metadata = {
  title: "AI Animated YouTube Shorts Studio",
  description: "Turn a story idea into animated YouTube Shorts assets.",
};
```

### IN-05: Video generation always targets `story.scenes[0]`, which is only guaranteed to be "scene 1" if the array happens to be in numbering order

**File:** `src/app/page.tsx:83`, `111`
**Issue:** `handleGenerateVideo` uses `story.scenes[0]` and the code's own comment describes this as animating "the first scene of the story." `validateScenePlan` (in `director.ts`) verifies that `scene_number`s form a complete 1..N set with no gaps/duplicates, but it validates a *sorted copy* — it never reorders or asserts anything about the original array's order. Nothing in the schema or validator guarantees `scenes[0].scene_number === 1`. In practice the UI label (`Generate Video for Scene ${videoSceneNumber}`) stays internally consistent with whichever scene ends up at index 0, so this wouldn't crash or lie to the user, but the "animates the first scene" intent in the comments/design docs could silently target a different scene number than expected if the model ever returns scenes out of order.
**Fix:** Either select explicitly by `scene_number === 1` (`story.scenes.find((s) => s.scene_number === 1)`) or sort `story.scenes` by `scene_number` once after a successful `runStoryDirector` call, so downstream consumers can rely on array order.

---

_Reviewed: 2026-09-13T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

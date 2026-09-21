---
phase: 06-reliability-secrets-hygiene-output-correctness
reviewed: 2026-09-21T00:00:00Z
depth: standard
files_reviewed: 36
files_reviewed_list:
  - package.json
  - prisma/migrations/20260920113239_phase6_reliability_fields/migration.sql
  - prisma/schema.prisma
  - src/app/actions/create-story.ts
  - src/app/actions/generate-images.ts
  - src/app/actions/generate-video.ts
  - src/app/actions/get-story-status.ts
  - src/app/actions/regenerate-scene-image.ts
  - src/app/page.tsx
  - src/components/story/VideoStatusScreen.tsx
  - src/core/approval/gates.test.ts
  - src/core/approval/gates.ts
  - src/core/budget/dispatch-chain.ts
  - src/core/config/provider-key.test.ts
  - src/core/config/provider-key.ts
  - src/core/config/provider-timeouts.ts
  - src/core/output/episode-export.test.ts
  - src/core/output/fixtures/veo-720x1280-4s.mp4
  - src/core/output/mp4-validation.test.ts
  - src/core/output/mp4-validation.ts
  - src/core/persistence/generation-repository.test.ts
  - src/core/persistence/generation-repository.ts
  - src/core/persistence/story-repository.ts
  - src/core/persistence/story-view.test.ts
  - src/core/story/director.test.ts
  - src/core/story/director.ts
  - src/core/uniqueness/check.test.ts
  - src/core/uniqueness/check.ts
  - src/core/video/stuck-threshold.ts
  - src/lib/log-response.test.ts
  - src/lib/log-response.ts
  - src/providers/image/gemini-image.ts
  - src/providers/llm/gemini.ts
  - src/providers/video/veo.test.ts
  - src/providers/video/veo.ts
  - src/scripts/check-boundaries.ts
  - src/scripts/missing-key-probe.ts
  - src/scripts/secrets-audit.ts
findings:
  critical: 1
  warning: 5
  info: 0
  total: 6
status: issues_found
disposition:
  fixed: [CR-01, WR-01, WR-02, WR-03]
  deferred: [WR-04]
  no_action_needed: [WR-05]
---

# Phase 6: Code Review Report

**Reviewed:** 2026-09-21T00:00:00Z
**Depth:** standard
**Files Reviewed:** 36
**Status:** issues_found

## Summary

This phase closes reliability/secrets-hygiene/output-correctness gaps in a real-money generation
pipeline. The core gated-dispatch invariants the task asked me to focus on mostly hold up under
direct tracing:

- All four real paid-dispatch entry points (`runStoryDirector`, `compareViaLlm`,
  `generateSceneImagesAction`, `dispatchSceneVideo`) call `assertApiKeyConfigured()` as their
  literal first statement, ahead of `checkBudget` and any provider call — confirmed by reading
  each function body, not just its doc comment.
- `evaluateVideoDispatch`/`evaluateBatchDispatch` check story-approval strictly before the
  per-scene retry-cap check in every branch, confirmed both by reading the guard-clause order and
  by the dedicated ordering tests in `gates.test.ts`.
- `mp4-validation.ts`'s `evaluateMp4Info` cannot silently skip the aspect-ratio proof: missing
  width/height is an explicit `valid: false` branch, not a skipped check, and `CORRUPT_VIDEO_MESSAGE`
  is provably free of byte counts, dimensions, container terms, and paths (asserted directly by
  `mp4-validation.test.ts`).
- The D-05 video corruption exemption is spent (cleared) immediately before the paid `generateVideo`
  dispatch inside `generate-video.ts`, in the same function that checked the API key first — no
  ordering hazard there.

However, one genuine correctness bug was found in the *image* regeneration path's exemption
bookkeeping (the two-file split between `regenerate-scene-image.ts` and `generate-images.ts`
creates an ordering hazard the video path's single-function design avoids), plus several
warning-level reliability/quality gaps in the video-status polling UI and in the textual nature of
`check-boundaries.ts`'s newer invariants. Details below.

## Critical Issues

### CR-01: Image-regeneration attempt/exemption bookkeeping is spent before the missing-API-key guard runs, so a local-only refusal can burn a scene's limited attempt (or its one-shot free retry)

**File:** `src/app/actions/regenerate-scene-image.ts:115-121` (writer) and `src/app/actions/generate-images.ts:132-145` (guard)

**Issue:** `regenerateSceneImageAction` writes its D-03/D-05 bookkeeping (`incrementImageAttempt` or,
when exempt, `clearImageSaveCorrupted`) *before* calling into `generateSceneImagesAction`:

```ts
// regenerate-scene-image.ts:115-121
if (decision.capExempt) {
  await clearImageSaveCorrupted(storyId, sceneNumber);
} else {
  await incrementImageAttempt(storyId, sceneNumber);
}

const statuses = await generateSceneImagesAction(storyId, [thatOneScene], characterBible, styleBible);
```

`generateSceneImagesAction` only checks for a configured API key *after* being called:

```ts
// generate-images.ts:132-145
try {
  assertApiKeyConfigured();
} catch (err) {
  if (err instanceof MissingApiKeyError) {
    return scenes.map((scene) => ({ ...ok: false, message: MISSING_API_KEY_MESSAGE }));
  }
  throw err;
}
```

So when the API key is missing, `regenerateSceneImageAction` has already incremented the scene's
`imageAttempts` counter (or, worse, already cleared a save-corruption exemption that was supposed to
buy exactly one free retry) before discovering that zero calls will ever be dispatched. This
directly contradicts the invariant this same file documents immediately above the write ("A local
failure that never reaches Gemini's Image API must not consume one of the scene's limited
image-regeneration attempts; only a call that reaches the real dispatch boundary must write
something, even if it dies mid-call") and mirrors `generate-video.ts`'s WR-02 fix, which this file's
own comment claims to follow but does not actually replicate — `generate-video.ts` places its
bookkeeping write *inside* the same function that already checked the API key first, so no such
gap exists there; `regenerate-scene-image.ts` places it in a different file that runs *before* that
check.

Concretely: if the API key is ever unset (a real, documented startup-misconfiguration state this
phase's own STARTUP-02 work targets), a wife who clicks "regenerate image" on a scene loses one of
its three attempts for nothing, or — if that scene was carrying a hard-won D-05 exemption from a
prior local save failure — loses the exemption itself with no compensating dispatch ever having
happened. Repeated across a session, this can push a scene to its retry cap purely from
misconfiguration, not from any real attempt.

**Fix:** Move the `assertApiKeyConfigured()` check to the top of `regenerateSceneImageAction` (or any
equivalent guard) so it runs before the `capExempt` increment/clear, e.g.:

```ts
import { MissingApiKeyError, MISSING_API_KEY_MESSAGE, assertApiKeyConfigured } from "../../core/config/provider-key.ts";

export async function regenerateSceneImageAction(storyId: string, sceneNumber: number): Promise<RegenerateSceneImageResult> {
  try {
    assertApiKeyConfigured();
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return { ok: false, sceneNumber, imageDataUrl: null, message: MISSING_API_KEY_MESSAGE, capMessage: null, approvalNotice: null };
    }
    throw err;
  }
  // ...existing storyDir/findStoryWithScenes/evaluateImageRegeneration logic...
  // ...capExempt increment/clear stays exactly where it is, now safely after the guard...
}
```

## Warnings

### WR-01: `isSecretKey`'s token-count suffix exemption is name-based and unscoped, so it can exempt a genuinely secret-shaped field from redaction

**File:** `src/lib/log-response.ts:18-34`

**Issue:** The Phase 6 fix for the token-count false positive narrows redaction like this:

```ts
const SAFE_TOKEN_FIELD_SUFFIX = /tokencount$|tokensdetails$/i;

function isSecretKey(key: string): boolean {
  const lowered = key.toLowerCase();
  if (lowered.includes("token") && SAFE_TOKEN_FIELD_SUFFIX.test(lowered)) {
    return lowered.includes("key") || lowered.includes("authorization");
  }
  return lowered.includes("key") || lowered.includes("token") || lowered.includes("authorization");
}
```

This is a pure name-pattern match with no awareness of *where* in the object tree the key sits (it
is not scoped to `usageMetadata`/`tokensDetails` paths specifically — `redactValue` calls it for
every key in the tree). Any field whose name contains "token" and happens to end in "TokenCount" or
"TokensDetails" — verified real SDK fields today, but not a closed set going forward — is exempted
from redaction unless it *also* contains "key" or "authorization". For example, a hypothetical
field named `sessionTokenCount` or `refreshTokensDetails` that actually carried secret material
would print in full via `logRawResponse`. This is a real (if currently narrow) weakening introduced
by this phase's fix, not merely a false-positive reduction — the original pre-fix behavior redacted
*any* key containing "token" unconditionally, which was strictly safer at the cost of over-redacting
real usage telemetry.

**Fix:** Scope the exemption to the actual usage-metadata paths rather than matching on name alone —
e.g., pass a `path: string[]` down through `redactValue`/`redactLargeStrings` and only apply
`SAFE_TOKEN_FIELD_SUFFIX` when the path's root is `usageMetadata` (or `tokensDetails`/`tokenCount`
appears under it), so an unrelated field elsewhere in the tree that happens to share the suffix
still redacts unconditionally.

### WR-02: `VideoStatusScreen`'s "Open Output Folder" affordance is unreachable once any single scene permanently fails, even though the shown message promises otherwise

**File:** `src/components/story/VideoStatusScreen.tsx:103-133`, `src/app/page.tsx:742-745,686-707`

**Issue:** The cap-reached message shown for a permanently-failed scene explicitly says: *"This
scene's video has reached its limit of N attempts. The other scenes aren't affected — you can
continue with what's ready, or start a new story to try again."* (`gates.ts:113-116`,
`page.tsx:660-661`). But `VideoStatusScreen`'s "Open Output Folder" button, and `page.tsx`'s
`finalizeEpisodeAction` trigger, are gated entirely on `allReady`:

```tsx
// VideoStatusScreen.tsx:114-133
{allReady && (
  <>
    <p>Every scene is ready. ...</p>
    {onOpenOutputFolder && <button ...>Open Output Folder</button>}
  </>
)}
```

```ts
// page.tsx:742-745
const allVideosReady = story !== null && story.scenes.length > 0 &&
  story.scenes.every((scene) => videoScenes[scene.scene_number]?.videoState === "ready");
```

`allVideosReady` requires literally every scene to be `"ready"` — a scene that is `"capped"` (cap
reached) or in the `budgetExceeded` state never satisfies this, so once even one scene permanently
fails, `allReady` can never become true on this screen, and neither the "Open Output Folder" button
nor the automatic `finalizeEpisodeAction()` call (`page.tsx:691-707`, itself gated on
`nothingLeftToRetry`, see WR-03 below) is ever reachable from here again for that story. The
already-generated, already-paid-for videos for every other scene have no path to CapCut from this
screen, directly contradicting the "you can continue with what's ready" promise. (I could not
verify from the files in scope whether the Library/"My Stories" screen offers an independent
folder-opening path for a story in this state — `MyStoriesList.tsx` and `open-story-folder.ts` are
outside this review's file set — so this may already have a workaround elsewhere; flagging based on
what is provable from the reviewed files.)

**Fix:** Gate the folder/finalize affordance on "every scene is in a terminal state (ready, capped,
or budget-exceeded)" rather than "every scene is ready", e.g. introduce a
`allSettled`/`nothingLeftToRetry`-style predicate shared between the poll-stop condition and the
button visibility, and change the success copy to reflect partial completion when not every scene
succeeded.

### WR-03: The video-status poll never stops once a scene fails due to budget exhaustion (only cap-reached scenes stop it), so `finalizeEpisodeAction` can never fire for that story

**File:** `src/app/page.tsx:686-707`

**Issue:**

```ts
const nothingLeftToRetry =
  status.scenes.length > 0 &&
  status.scenes.every(
    (row) => row.videoStatus === "READY" || (row.videoStatus === "FAILED" && row.capReached),
  );
if (nothingLeftToRetry) {
  clearInterval(intervalId);
  // ...finalizeEpisodeAction(...) fires here...
}
```

This only treats `READY` or `FAILED && capReached` as terminal. A scene that is `FAILED` because the
monthly budget is exhausted (`row.budgetExceeded`, computed in `get-story-status.ts:161` and
rendered as the same non-retryable "capped" style row in `page.tsx:668-671`) does **not** satisfy
`capReached`, so `nothingLeftToRetry` never becomes true for a story stuck in that state. The
3-second poll (and its `getStoryStatusAction`/conditional `loadStoryAction` calls) runs forever for
as long as the wife leaves that screen open, and — compounding WR-02 above — `finalizeEpisodeAction`
is never invoked for that story even though its other scenes may already be `READY`.

**Fix:** Include the same budget-exceeded condition this file already computes for the row's visual
state in the stop condition: `row.videoStatus === "READY" || (row.videoStatus === "FAILED" && (row.capReached || row.budgetExceeded))`.

### WR-04: `check-boundaries.ts` invariants 8-10 are pure substring/text checks that can be satisfied without the guarantee they claim to enforce

**File:** `src/scripts/check-boundaries.ts:484-598`

**Issue:** Invariant 8 requires a provider file's *comment-stripped* source to contain the literal
substring `timeout:` once it imports `@google/genai`. `stripWholeLineComments` (line 215-220) only
removes a line whose *trimmed text starts with* `//` — it does not strip inline trailing comments,
JSDoc/block comments, or string literals. A line like
`const hint = "increase your timeout: setting";` or `/* set timeout: here */` anywhere in the file
would satisfy this invariant's content check without the file actually setting an SDK
`HttpOptions.timeout` anywhere, silently defeating the very regression this invariant exists to
catch (a hung request wedging `serializeDispatch`'s shared queue forever).

Invariants 9 and 10 are similarly textual: invariant 9 only asserts that the literal substring
`await incrementVideoAttempt(` appears exactly once and precedes `await generateVideo(` by string
index — it cannot distinguish "unconditionally reached" from "reached only inside some future
conditional branch nobody intended to gate it on" (today's `if (capExempt) {...} else { await
incrementVideoAttempt(...) }` already demonstrates the call is legitimately conditional on one
flag; the check cannot tell that flag apart from a hypothetical unintended one added later).
Invariant 10 similarly only compares character indices of the last `SceneAssetStatus.READY`
occurrence against the `validateMp4Buffer(` call's index, which cannot detect a new READY write
added inside a branch that is reachable without ever executing the validation call, so long as it
is textually positioned after it in the file.

These are useful regression nets for the specific edits this phase anticipated, but their own doc
comments overstate the guarantee ("structurally protects... from ever becoming conditional",
"structurally unreachable without validation ever having run") — they are line/substring-order
checks, not control-flow analysis, and can pass vacuously against a differently-shaped regression.

**Fix:** At minimum, extend `stripWholeLineComments` to also strip inline trailing comments and
string-literal contents before the invariant-8 scan (or check for the exact SDK config shape,
e.g. `httpOptions:\s*{[^}]*timeout:`, rather than a bare substring). For invariants 9/10, consider a
lightweight AST-based check (TypeScript's own compiler API is already a devDependency) if false
negatives here are a real concern, or explicitly downgrade the doc comments' claims to match what a
textual check can actually prove.

### WR-05: `check-boundaries.ts`'s `ALLOWED_BUDGET_MODULE_IMPORT_PATHS` was not updated for this phase's own new gated call sites

**File:** `src/scripts/check-boundaries.ts:129-137`

**Issue:** The allow-list enumerates seven files as the only permitted importers of
`src/core/budget/`. Cross-checking against this phase's actual gated dispatch sites: `create-story.ts`,
`generate-images.ts`, and `generate-video.ts` all import `assertApiKeyConfigured` from
`src/core/config/provider-key.ts` (a sibling module under `src/core/config/`, not `src/core/budget/`),
so this specific list is not stale for Phase 6's STARTUP-02 work — but the list's own header comment
claims it was reconciled against "the plan's own enumerated six-item list" plus one discovered
omission, with no mention of a process for keeping it in sync as new call sites are added (e.g. a
future budget-status or export action). Since invariant 7 fails closed (a new importer not on the
list breaks the build) rather than failing open, this is a low-severity maintainability note rather
than a live defect — recorded here only because the review was asked to assess whether these
invariants would catch a real regression, and an allow-list that must be remembered by hand for
every new gated site is a recurring source of the exact "real touch site missed by hand-enumeration"
failure mode this file's own comments describe happening twice already (05-01/05-03).

**Fix:** No code change required now (the list is currently accurate); consider a comment or a
generated-from-source check that fails loudly the next time a new legitimate touch site is added but
not enumerated, rather than relying on the next plan's author remembering this file exists.

---

## Disposition

- **Fixed immediately** (small, contained, directly bearing on this phase's own reliability/secrets-hygiene promises): **CR-01** (`regenerateSceneImageAction` now calls `assertApiKeyConfigured()` as its literal first statement, before the D-03/D-05 bookkeeping write, mirroring `generate-video.ts`'s proven single-function shape), **WR-01** (`isSecretKey`/`redactValue` now thread an `insideUsageMetadata` path flag through the recursion, so the token-count-suffix exemption only applies inside a subtree actually rooted at a key literally named `usageMetadata` — verified against the real `@google/genai` response shape at all three call sites, not assumed), **WR-02** (`page.tsx`'s `allVideosSettled` and `VideoStatusScreen`'s internal `everySceneReady`/`anySceneReady` checks now gate the Open Output Folder affordance on "nothing left to retry" rather than "literally every scene ready," with three honest completion messages — full success, partial success, and the zero-success edge case — verified against `exportEpisodeAssets`' actual zero-clips behavior rather than assumed safe), **WR-03** (`nothingLeftToRetry` now also treats `row.budgetExceeded` as terminal, matching the same condition already used for the row's visual "capped" state, so a budget-exhausted story's poll stops and `finalizeEpisodeAction` fires for its already-ready scenes). Verified: full `test:lib` suite (320/320), `typecheck`, `build`, and all `check-boundaries.ts` invariants plus `secrets-audit.ts` still pass after every fix.
- **Deferred** (a real design decision, not a same-day patch; no Phase 7 exists yet to anchor it to, so this is a candidate for a future hardening pass rather than a specific phase number): **WR-04** — `check-boundaries.ts` invariants 8-10 are textual/substring checks, not control-flow analysis. Closing the gap properly (stripping inline/block comments and string literals before the invariant-8 scan, or moving invariants 9-10 to an AST-based check using TypeScript's own compiler API) is a meta-level tooling-strength redesign, not a one-line fix, and the invariants still catch the specific regressions this phase anticipated today.
- **No action needed**: **WR-05** — the reviewer's own assessment confirms the allow-list is currently accurate; the finding is a forward-looking process note (how to keep it in sync as new call sites are added), not a live defect.

_Reviewed: 2026-09-21T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

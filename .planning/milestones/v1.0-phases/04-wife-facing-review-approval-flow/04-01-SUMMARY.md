---
phase: 04-wife-facing-review-approval-flow
plan: 01
subsystem: api
tags: [prisma, sqlite, server-actions, access-control, node-test]

requires:
  - phase: 03-persistence-structural-uniqueness
    provides: Story/Scene/GenerationRecord Prisma schema, story-repository.ts/generation-repository.ts persistence layer, maxRegenerationAttempts() env-configurable-cap pattern
provides:
  - "Story.imagesApprovedAt / Scene.imageAttempts / Scene.videoAttempts / SceneAssetStatus.GENERATING (migration 20260914153829_phase4_approval_and_attempts)"
  - "src/core/approval/gates.ts -- pure, zero-I/O access-control surface: evaluateVideoDispatch, evaluateApproval, evaluateImageRegeneration"
  - "src/core/retry/caps.ts -- maxSceneRetryAttempts(), mirrors maxRegenerationAttempts() exactly"
  - "generateSceneVideoAction(storyId, sceneNumber) -- server-resolved image path, approval gate, and retry cap all inside the single dispatch function"
  - "check-boundaries.ts invariant 5 -- single paid image/video dispatch point, structurally enforced"
  - "src/lib/test-db.ts -- shared, migration-count-safe temp-database test helper"
affects: [04-02-PLAN.md, 04-03-PLAN.md, 04-04-PLAN.md]

actuals:
  tokens: 17656
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Server-side unbypassable gate: a precondition check (approval, retry cap) lives at the top of the single function that dispatches a paid provider call, never only in a caller or the UI"
    - "Server-resolved asset paths: a Server Action resolves imagePath/videoPath itself from the database via [storyId, sceneNumber], never accepts one as a client argument"
    - "Structural single-dispatch-point enforcement via check-boundaries.ts import-specifier scanning, not just code review"

key-files:
  created:
    - src/core/approval/gates.ts
    - src/core/approval/gates.test.ts
    - src/core/retry/caps.ts
    - src/core/retry/caps.test.ts
    - src/lib/test-db.ts
    - prisma/migrations/20260914153829_phase4_approval_and_attempts/migration.sql
  modified:
    - prisma/schema.prisma
    - src/core/persistence/story-repository.ts
    - src/core/persistence/generation-repository.ts
    - src/app/actions/generate-video.ts
    - src/app/page.tsx
    - src/scripts/check-boundaries.ts
    - src/scripts/story-probe.ts
    - src/core/persistence/story-view.test.ts
    - src/lib/db.test.ts
    - src/lib/spend-ledger.test.ts
    - src/types/better-sqlite3.d.ts
    - .env.local.example
    - package.json

key-decisions:
  - "Migration directory generated as 20260914153829_phase4_approval_and_attempts (real timestamp), not the plan's 20260914120000 placeholder -- used verbatim everywhere below"
  - "Migration used a full Scene table RedefineTables rather than two plain ALTER TABLE ADD COLUMN statements, because Prisma's SQLite diff engine batches multiple new columns on one table into a rebuild -- additive, no data loss, verified against the real prisma/dev.db's 3 pre-existing story rows"
  - "safeMotionPrompt's camera/environment fallback narrowing accepted as documented, not a regression: Scene has no camera/environment columns, so the rewrite path always uses the existing fallback phrasing, exactly as any live-generated scene that omitted those fields already did"
  - "evaluateImageRegeneration deliberately has no approval check (D-02 scopes approval to video only); alreadyApproved is returned so plan 04-02 can surface the one-time amber heads-up rather than silently voiding approval"

patterns-established:
  - "Pattern 1 (RESEARCH.md): server-side-unbypassable gate -- approval, then per-scene retry cap, then spend ceiling, in that fixed order, inside the single dispatch function"
  - "Pattern 3 (RESEARCH.md): server-resolved asset paths, never client-supplied"

requirements-completed: [APPROVAL-01, IMAGE-02, VIDEO-04, UI-01]

coverage:
  - id: D1
    description: "generateSceneVideoAction refuses to dispatch when a story's images are unapproved, through the single dispatch point (not just the UI)"
    requirement: "APPROVAL-01"
    verification:
      - kind: unit
        ref: "src/core/approval/gates.test.ts#evaluateVideoDispatch refuses an unapproved story with the exact approval string, even when every scene is READY"
        status: pass
      - kind: unit
        ref: "src/core/approval/gates.test.ts#evaluateVideoDispatch: an unapproved story with a nonexistent scene number returns the approval refusal, not the scene-not-found refusal (ordering)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Per-scene video-attempt cap refuses dispatch at the configured limit, with the number interpolated into the message, mirroring maxRegenerationAttempts' env-configurable-with-safe-default pattern"
    requirement: "VIDEO-04"
    verification:
      - kind: unit
        ref: "src/core/approval/gates.test.ts#evaluateVideoDispatch refuses a scene at exactly the cap, and the message contains the interpolated cap number"
        status: pass
      - kind: unit
        ref: "src/core/retry/caps.test.ts (8 cases: absent/valid/zero/negative/fractional/non-numeric/empty env values)"
        status: pass
    human_judgment: false
  - id: D3
    description: "generateSceneVideoAction resolves the scene's image path itself from the database, accepting no filesystem path from the browser -- closes WINDOWS ledger item 7 (restored scenes can retry video again)"
    requirement: "VIDEO-04"
    verification:
      - kind: unit
        ref: "src/core/approval/gates.test.ts#evaluateVideoDispatch grants an approved story with a READY scene, handing back the scene's own imagePath"
        status: pass
      - kind: integration
        ref: "npm run typecheck / npm run build (generateSceneVideoAction(storyId: string, sceneNumber: number) signature, page.tsx call site updated)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A single scene's image-regeneration attempt cap is enforced independently of video approval state -- regenerating an image is never blocked by story-level approval"
    requirement: "IMAGE-02"
    verification:
      - kind: unit
        ref: "src/core/approval/gates.test.ts#evaluateImageRegeneration grants with alreadyApproved=true for an approved story (regeneration is NOT blocked by approval)"
        status: pass
    human_judgment: false
  - id: D5
    description: "check-boundaries.ts invariant 5 makes the single paid dispatch point structural: a new file importing the video/image provider outside its one allowed action file fails the boundary check"
    verification:
      - kind: integration
        ref: "node src/scripts/check-boundaries.ts (5 OK lines, no BOUNDARY CHECK FAILED)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Every refusal message returned to the browser is plain language, never a path/model id/scene id/provider text (UI-01)"
    requirement: "UI-01"
    verification:
      - kind: unit
        ref: "src/core/approval/gates.test.ts (all 18 cases assert exact locked/plain-language message strings)"
        status: pass
    human_judgment: true
    rationale: "Full interactive three-screen human-check (create -> review -> approve, no leaked prompts/paths in the rendered UI) is deferred to end-of-phase UAT, per this project's established WINDOWS #4 convention -- no browser-driving tool available in this executor session."

duration: 19min
completed: 2026-09-14
status: complete
---

# Phase 4 Plan 1: Server-Side Approval Gate and Per-Scene Retry Caps Summary

**A server-side, unbypassable approval gate and per-scene image/video retry caps now live inside the single function that dispatches Veo, which also resolves its own image path from the database instead of trusting the browser — closing WINDOWS ledger item 7 and making the gate structurally impossible to route around, enforced by a new `check-boundaries.ts` invariant.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-09-14T15:36:10Z
- **Completed:** 2026-09-14T15:54:31Z
- **Tasks:** 3
- **Files modified:** 20 (excluding `.planning/`)

## Accomplishments

- `Story.imagesApprovedAt`, `Scene.imageAttempts`/`videoAttempts`, and `SceneAssetStatus.GENERATING` added via migration `20260914153829_phase4_approval_and_attempts`, applied cleanly against the real `prisma/dev.db` with its 3 pre-existing story rows intact
- `src/core/approval/gates.ts`: a pure, zero-I/O access-control module (`evaluateVideoDispatch`, `evaluateApproval`, `evaluateImageRegeneration`) covered by 18 unit tests, including the load-bearing ordering assertion that an unapproved story refuses before a scene-not-found check ever runs
- `generateSceneVideoAction(storyId, sceneNumber)` refactored to resolve the scene's image, duration, and motion prompt server-side from the database — no longer accepts a client-supplied path or `Scene` object, closing WINDOWS ledger item 7 (restored scenes can retry video again)
- `check-boundaries.ts` invariant 5: outside `src/scripts/`, only `generate-video.ts`/`generate-images.ts` may import the video/image provider — a future second Veo call site fails the structural gate rather than silently skipping the approval/retry checks
- `src/core/retry/caps.ts` (`maxSceneRetryAttempts`) mirrors `maxRegenerationAttempts()` exactly; `MAX_SCENE_RETRY_ATTEMPTS` env-configurable with a safe default of 3 on any absent/malformed value (8 test cases)
- `src/lib/test-db.ts`: a shared, migration-count-safe temp-database helper (`applyAllMigrations` sorts and applies every migration directory, not just the first) — replaces two duplicated private helpers that would have silently built temp databases missing every Phase 4 column

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "this scene's video is refused until the story's images are approved"** — `82ae695` (feat)
2. **Task 2: Per-scene attempt counters made durable, plus a shared temp-database test helper** — `8e37071` (feat)
3. **Task 3: Make the single paid dispatch point structural, and add the image-regeneration gate** — `1c116be` (feat)

**Plan metadata:** (recorded below, after this SUMMARY is committed)

## Files Created/Modified

- `prisma/schema.prisma` — `Story.imagesApprovedAt`, `Scene.imageAttempts`/`videoAttempts`, `SceneAssetStatus.GENERATING`
- `prisma/migrations/20260914153829_phase4_approval_and_attempts/migration.sql` — the real generated migration (see Deviations for its shape)
- `src/core/approval/gates.ts` / `gates.test.ts` — the phase's access-control surface, 18 passing tests
- `src/core/retry/caps.ts` / `caps.test.ts` — env-configurable per-scene retry cap, 8 passing tests
- `src/lib/test-db.ts` — shared `applyAllMigrations`/`tmpDatabaseUrl`, supersedes duplicated private helpers
- `src/core/persistence/story-repository.ts` — `markImagesApproved`, extended `StoryWithScenes`
- `src/core/persistence/generation-repository.ts` — `incrementImageAttempt`/`incrementVideoAttempt`
- `src/app/actions/generate-video.ts` — refactored to the new `(storyId, sceneNumber)` signature with the three-gate order (approval → retry cap → ceiling)
- `src/app/page.tsx` — call site updated; `canGenerateVideo` no longer depends on a client-held `imagePath`; retry always wired
- `src/scripts/check-boundaries.ts` — new invariant 5
- `src/scripts/story-probe.ts`, `src/core/persistence/story-view.test.ts`, `src/lib/db.test.ts`, `src/lib/spend-ledger.test.ts`, `src/types/better-sqlite3.d.ts` — deviation fixes, see below
- `.env.local.example`, `package.json` — `MAX_SCENE_RETRY_ATTEMPTS=3` documented; `test:lib` enumerates `gates.test.ts`/`caps.test.ts`

## Decisions Made

- **Real migration directory name:** `20260914153829_phase4_approval_and_attempts` (Prisma's actual generation timestamp), not the plan's `20260914120000` placeholder. Used verbatim in every reference above and in the codebase.
- **`safeMotionPrompt` narrowing accepted as documented, not a regression:** `Scene` has no `camera`/`environment` columns, so the server-resolved rewrite path always falls back to `safeMotionPrompt`'s existing defaults ("a slow, gentle camera drift" / "the scene") — the exact same fallback any live-generated scene omitting those optional fields already triggered. No behavior change to a real generation.
- **`evaluateImageRegeneration` has no approval check by design:** D-02 scopes approval to gating video generation only; regenerating an image spends image money, not video money. `alreadyApproved` is returned so plan 04-02 can surface a one-time heads-up rather than silently leaving her unaware the approved set changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migration used a full Scene table RedefineTables, not two plain ALTER TABLE ADD COLUMN statements**
- **Found during:** Task 1, Step 2 (running `npx prisma migrate dev`)
- **Issue:** The plan's `<action>` expected "three ALTER TABLE ... ADD COLUMN statements and no table rebuild." The generated SQL instead does one `ALTER TABLE Story ADD COLUMN` plus a full `Scene` table redefinition (Prisma's SQLite diff engine batches multiple new columns on one table into a rebuild rather than sequential `ADD COLUMN`s).
- **Fix:** None needed — the migration is additive and safe (`INSERT INTO new_Scene ... SELECT ... FROM Scene`, no data loss). Verified directly: `prisma migrate status` reports applied, `PRAGMA table_info` shows all 3 new columns, and the real `prisma/dev.db`'s 3 pre-existing `Story` rows survived intact.
- **Files modified:** none (documentation-only acknowledgment)
- **Verification:** `node -e "...PRAGMA table_info..."` prints `MIGRATION OK`; `SELECT COUNT(*) FROM Story` returns 3 both before and after
- **Committed in:** `82ae695`

**2. [Rule 3 - Blocking] Fixed two pre-existing compile breaks caused directly by the `generateSceneVideoAction` signature change and the `StoryWithScenes` interface extension**
- **Found during:** Task 1, running `npm run typecheck` after the refactor
- **Issue:** `src/core/persistence/story-view.test.ts`'s hand-built fixtures were missing the newly-required `imageAttempts`/`videoAttempts` scene fields and `imagesApprovedAt` story field; `src/scripts/story-probe.ts`'s two `generateSceneVideoAction(storyId, scene, imagePath)` call sites no longer matched the new 2-argument signature.
- **Fix:** Added the missing fields to every `story-view.test.ts` fixture. Simplified `story-probe.ts`'s video-only probe mode to `generateSceneVideoAction(storyId, sceneNumber)`, removing the disk-based `findSceneImagePath` helper and the now-inapplicable `--duration=`/`--motion-prompt=` overrides (the action resolves these from the database now, for every caller, including this dev probe — consistent with APPROVAL-01's "through any path" wording). Both flags now print a no-op notice if passed rather than silently doing nothing. The `--images --video` chain mode is documented as now expected to refuse with "story could not be found" (it never calls `createStoryAction`, so nothing is ever persisted for it to approve) — a real proof run needs the standalone `--story-id=<id> --video=<n>` mode against an actually-persisted, actually-approved story.
- **Files modified:** `src/core/persistence/story-view.test.ts`, `src/scripts/story-probe.ts`
- **Verification:** `npm run typecheck` and `npm run build` both pass clean
- **Committed in:** `82ae695`

**3. [Rule 1 - Bug] Fixed two stale `spend-ledger.test.ts` assertions hardcoding the pre-Phase-3 $3.00 ceiling**
- **Found during:** Task 2, running `npm run test:lib`
- **Issue:** Two tests hardcoded `ceilingUsd: 3` / a `$3.00`-crossing scenario, but `DEV_CEILING_USD` was explicitly raised to `3.25` by the requester in Phase 3. Confirmed pre-existing and unrelated to this plan's changes via `git stash` (fails identically on the pre-04-01 commit).
- **Fix:** Both tests now reference `DEV_CEILING_USD` directly instead of a hardcoded `3`/`3.00`, so they stay correct across any future explicit ceiling change rather than silently drifting stale again. Fixed (not just logged) because it directly blocked this task's own `npm run test:lib` verification gate.
- **Files modified:** `src/lib/spend-ledger.test.ts`
- **Verification:** `node --test src/lib/spend-ledger.test.ts` — 11/11 pass; `npm run test:lib` — 152/152 pass
- **Committed in:** `8e37071`

**4. [Rule 3 - Blocking] Regenerated the Prisma client and exported `DatabaseInstance` from the better-sqlite3 ambient module**
- **Found during:** Task 2, running the new database-backed tests
- **Issue:** `npx prisma migrate dev` did not automatically regenerate `src/generated/prisma`, so the new columns read back as `undefined`. Separately, `src/types/better-sqlite3.d.ts`'s `DatabaseInstance` interface existed but wasn't `export`ed, so `src/lib/test-db.ts` couldn't name the type directly.
- **Fix:** Ran `npx prisma generate`. Added `export` to the `DatabaseInstance` interface declaration.
- **Files modified:** `src/generated/prisma/*` (gitignored, not committed), `src/types/better-sqlite3.d.ts`
- **Verification:** `node --test src/core/persistence/generation-repository.test.ts src/lib/db.test.ts` — 14/14 pass
- **Committed in:** `8e37071`

---

**Total deviations:** 4 auto-fixed (1 documented no-op, 2 blocking compile/infra fixes, 1 bug fix in a stale test)
**Impact on plan:** All deviations were necessary to make this plan's own stated verification gates pass, or to document a benign difference between the plan's expected migration shape and Prisma's actual output. No scope creep beyond what was directly caused by this plan's changes.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None — no external service configuration required. `MAX_SCENE_RETRY_ATTEMPTS` is documented in `.env.local.example` with a working default (3) requiring no action.

## Next Phase Readiness

- The approval gate, retry caps, and server-resolved image path are proven end-to-end (unit tests + real migration against the live `prisma/dev.db`) and ready for plan 04-02 (the Approve control) and 04-03 (batch video/retry UI) to build directly on top of `evaluateVideoDispatch`/`evaluateApproval`/`evaluateImageRegeneration` and `markImagesApproved`/`incrementImageAttempt`/`incrementVideoAttempt`.
- `check-boundaries.ts` invariant 5 is in place before any later plan could introduce a second Veo/Gemini-Image call site — the structural guard 04-RESEARCH.md's Pitfall 1 called for exists now, not retrofitted later.
- No blockers. Dev spend ledger unchanged at $3.0870 of $3.25 — zero real paid provider calls were made anywhere in this plan, confirmed before and after every task.

---
*Phase: 04-wife-facing-review-approval-flow*
*Completed: 2026-09-14*

## Self-Check: PASSED

All key-files.created verified present on disk; all 3 task commit hashes (82ae695, 8e37071, 1c116be) verified present in git log. All plan-level `<verification>` commands re-run and confirmed passing: `npx prisma migrate status` (applied), `PRAGMA table_info` (all 3 new columns), `npm run test:lib` (152/152), `node src/scripts/check-boundaries.ts` (5 OK lines), `npm run typecheck` and `npm run build` (clean), dev spend ledger unchanged at 3.0870.

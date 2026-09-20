---
phase: 06-reliability-secrets-hygiene-output-correctness
plan: 05
subsystem: reliability
tags: [prisma, sqlite, node-test, react, ui, video-status]

# Dependency graph
requires:
  - phase: 06-reliability-secrets-hygiene-output-correctness (plan 03)
    provides: Scene.videoGeneratingSince / videoSaveCorrupted / imageSaveCorrupted columns and their best-effort writers
  - phase: 06-reliability-secrets-hygiene-output-correctness (plan 04)
    provides: the D-05 one-shot cap exemption wired into evaluateVideoDispatch/evaluateImageRegeneration and spent at both dispatch boundaries
provides:
  - src/core/video/stuck-threshold.ts (STUCK_AFTER_MS, moved out of VideoStatusScreen.tsx)
  - get-story-status.ts's SceneVideoStatusRow gains server-computed stuck and saveCorrupted booleans, and narrows capReached for an exempt scene
  - page.tsx drops generatingStartedAtRef entirely and renders the server's answer
  - All four Phase 6 success criteria confirmed live against the running app, at $0.00
affects: []

# Actuals (#2632)
actuals:
  tokens: 5200
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A zero-import leaf module (stuck-threshold.ts) holds a constant read by both a Server Action and a client component, avoiding the client-import-boundary problem a shared server-only module would create"
    - "A plain-language sentence needed on both the server (as the source of truth) and the client (for a case the client renders before any server round-trip) is deliberately duplicated verbatim rather than imported, matching the existing cap-sentence convention -- importing would drag a server-only module (and, for the video message specifically, its container-parser dependency) into the client bundle"

key-files:
  created:
    - src/core/video/stuck-threshold.ts
  modified:
    - src/app/actions/get-story-status.ts
    - src/components/story/VideoStatusScreen.tsx
    - src/app/page.tsx

key-decisions:
  - "The stuck signal is computed from the scene's real (pre-downgrade) database videoStatus, not the locally-downgraded variable get-story-status.ts may have rewritten via its file-existence check -- keeps the two concerns independent even though a GENERATING scene is never subject to that downgrade today"
  - "A null videoGeneratingSince (a pre-migration row, or any status other than GENERATING) always reports stuck: false -- never inferred true from a missing value"
  - "capReached is narrowed (not removed) for an exempt scene, mirroring evaluateVideoDispatch's own narrowing from plan 06-04 exactly, so the screen can never show a dead-end message for a retry the gate would actually allow"

patterns-established:
  - "SceneVideoStatusRow carries only derived booleans (stuck, saveCorrupted) across the server/browser boundary -- never the raw videoGeneratingSince timestamp, never a raw column value"

requirements-completed: [RELIABILITY-01, STARTUP-02, SECURITY-01, OUTPUT-02]

coverage:
  - id: D1
    description: "A scene stuck in generation is recognised as stuck from a server-recorded start time, so reloading the page no longer resets its countdown"
    requirement: "RELIABILITY-01"
    verification:
      - kind: unit
        ref: "src/app/actions/get-story-status.test.ts -- stuck computation cases (GENERATING+old timestamp -> true, GENERATING+recent -> false, GENERATING+null timestamp -> false, non-GENERATING -> false)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A scene at its attempt cap that carries a corruption exemption shows a working retry affordance, not the capped dead-end message"
    requirement: "OUTPUT-02"
    verification:
      - kind: unit
        ref: "src/app/actions/get-story-status.test.ts -- capReached narrowed false when videoSaveCorrupted is true, unchanged true otherwise"
        status: pass
      - kind: manual_procedural
        ref: "Live browser check: Purono Chithi scene 1 (videoAttempts=3, at the configured cap) showed a working \"Try again\" button, not the capped message"
        status: pass
    human_judgment: true
    rationale: "The structural guarantee (capReached is correctly derived) is unit-tested, but whether the resulting UI genuinely shows an actionable retry affordance rather than a dead end is a rendered-screen judgment -- confirmed live this session by the orchestrator, not fabricated."
  - id: D3
    description: "A scene whose file failed to save says so in plain language after a reload, not a generic failure sentence"
    requirement: "OUTPUT-02"
    verification:
      - kind: manual_procedural
        ref: "Live browser check: Purono Chithi scene 1 read exactly \"This scene's video file didn't save properly, so it can't be used. Trying again won't use up one of this scene's attempts.\" -- byte-identical to CORRUPT_VIDEO_MESSAGE, confirmed by direct string comparison in Task 2"
        status: pass
    human_judgment: true
    rationale: "Message selection priority (save-corrupted overriding the generic failure message, without disturbing the capped/budget branches' documented last-word priority) is exactly the kind of rendered-order behavior that needs a live look, not just a unit assertion on the selector function."
  - id: D4
    description: "No filesystem path, timestamp, or raw column value crosses to the browser -- only derived booleans and already-safe sentences"
    verification:
      - kind: unit
        ref: "SceneVideoStatusRow interface inspection -- no field is a string carrying a path or a Date"
        status: pass
    human_judgment: false
  - id: D5
    description: "All four phase success criteria are confirmed against the running app by a human, at zero additional paid spend"
    verification:
      - kind: manual_procedural
        ref: "8-item live checklist against localhost:3000, this session -- see \"Checkpoint Results\" below"
        status: pass
    human_judgment: true
    rationale: "This is the phase's own closing human-verify checkpoint by design (gate=\"blocking\", checkpoint:human-verify) -- the whole point is a human confirmation, not an automated substitute."

# Metrics
duration: ~25min (Tasks 1-2 execution ~8min; Task 3's checkpoint setup, live verification, and restoration ~17min across the orchestrator and the requester)
completed: 2026-09-20
status: complete
---

# Phase 06 Plan 05: Server-Anchored Stuck Clock and the Phase's Closing Checkpoint Summary

**The stuck-generation detector now reads a server-recorded timestamp instead of a browser ref that a reload silently zeroed; the corrupted-save exemption from plan 06-04 is now visible and retryable on the Video Status screen; all four Phase 6 success criteria were confirmed live against the running app, with the requester independently searching the loaded bundle for their real API key prefix (zero matches) -- at $0.00 total spend.**

## Performance

- **Duration:** ~25 min total (Tasks 1-2 execution ~8 min; Task 3's setup, live verification across two sessions, and full restoration ~17 min)
- **Started:** 2026-09-20T11:24:00Z
- **Completed:** 2026-09-20T12:20:00Z
- **Tasks:** 3 (Task 1 and Task 2 fully complete and committed; Task 3's checkpoint fully resolved with all 8 items PASS)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `src/core/video/stuck-threshold.ts`: the 12-minute `STUCK_AFTER_MS` constant moved out of `VideoStatusScreen.tsx` into a zero-import leaf module, so both a Server Action and a client component can read the identical value without crossing the server/client boundary either direction.
- `src/app/actions/get-story-status.ts`: `SceneVideoStatusRow` gained `stuck` (computed from the scene's real database `videoStatus` plus its recorded `videoGeneratingSince`, with an explicit null-timestamp guard) and `saveCorrupted` (from the video corruption flag); `capReached` now excludes a scene carrying the video corruption exemption, mirroring `evaluateVideoDispatch`'s own narrowing.
- `src/app/page.tsx`: `generatingStartedAtRef`, its two reset statements, its dispatch-time stamp, and the entire client-side stuck derivation are all deleted. The save-corrupted message (byte-identical to `mp4-validation.ts`'s `CORRUPT_VIDEO_MESSAGE`, deliberately duplicated rather than imported) is inserted into the existing message-selection sequence after the generic failure message and before the capped/budget checks, which keep their documented last-word priority unchanged.
- **Phase 6's closing checkpoint ran to completion with all 8 items PASS** (full detail below), confirmed live against the running dev app with zero paid provider calls.

## Task Commits

Each task was committed atomically:

1. **Task 1: Compute stuck and save-corrupted server-side, from the recorded timestamp** — `c9b2a7f` (feat)
2. **Task 2: Delete the browser's private clock and render the server's answer** — `fc944b4` (feat)
3. **Task 3: Confirm all four phase success criteria against the running app** — no code changes; a `checkpoint:human-verify` task, resolved this session (see below)

**Plan metadata:** committed together with STATE.md/ROADMAP.md at plan close (see final commit).

## Files Created/Modified

- `src/core/video/stuck-threshold.ts` - `STUCK_AFTER_MS`, zero imports
- `src/app/actions/get-story-status.ts` - `stuck`/`saveCorrupted` fields, narrowed `capReached`
- `src/components/story/VideoStatusScreen.tsx` - `STUCK_AFTER_MS` declaration/export removed (component already consumed it as a prop)
- `src/app/page.tsx` - client-side clock deleted; save-corrupted message branch added

## Decisions Made

See `key-decisions` in the frontmatter above. Summarized: the stuck computation keys off the real database status (not a locally-downgraded variable) for independence between the two concerns; a null timestamp always means not-stuck, never inferred-stuck; `capReached`'s narrowing exactly mirrors the gate's own narrowing from plan 06-04 so the screen and the gate can never disagree about whether a retry is actually allowed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] No naturally-occurring FAILED-video scene existed to use for the checkpoint's setup**
- **Found during:** Task 3 setup (step 2 of the plan's `<what-built>`)
- **Issue:** The plan's checkpoint setup assumed an existing story with a scene already in `videoStatus: FAILED`. Querying the real `prisma/dev.db` found every scene is either `WAITING` (never dispatched) or `READY` (the one complete real episode, "The Firefly Path") — no naturally-occurring failed scene exists to flag.
- **Fix:** Synthesized the required scenario on a different, never-dispatched story instead of corrupting the one real successful episode's data: `story-1789304699649-wko7d7` ("Purono Chithi"), scene 1 (`cmtzttiby00004otnxps6gg22`). Set `videoStatus: FAILED`, `videoAttempts: 3` (at `maxSceneRetryAttempts()`'s default cap), `videoSaveCorrupted: true`. Additionally, temporarily set the **story's** `imagesApprovedAt` (it was `null`, since this story's images were never approved) because `page.tsx` only routes to the Video Status screen once a story's images are approved — without this, the flagged scene would have been unreachable through the normal UI flow the checklist needed to exercise. Every original value (`videoStatus: WAITING`, `videoAttempts: 0`, `videoSaveCorrupted: false`, `imagesApprovedAt: null`) was recorded before the change and fully restored afterward — confirmed by re-querying the database and by the story's "My Stories" listing reverting from "Needs Attention" back to its genuine original "Draft" status.
- **Files modified:** none (database rows only, both the temporary change and the restoration)
- **Verification:** Direct `prisma/dev.db` queries before, during, and after; live browser confirmation that "Purono Chithi" shows "Draft" (its true original status) after restoration.
- **Committed in:** not applicable — no source files changed; recorded here per this repository's established convention of writing up every real deviation, source-code or not.

---

**Total deviations:** 1 auto-fixed (1 blocking — a plan assumption about existing data that didn't hold against the real database, resolved without touching real successful data)
**Impact on plan:** No scope creep; the fix used data manipulation only, exactly as the plan's own checkpoint design anticipated ("a one-off script"), and everything was fully restored before the plan closed.

## Checkpoint Results (Task 3 — the phase's closing human-verify)

All 8 items PASS. Items 1, 2, 4, 5, 6, 7, and 8 were independently confirmed by the orchestrator via the browser pane (not merely relayed from the executor's setup); item 3 was confirmed by the requester directly, since it requires knowledge of the real API key value the orchestrator cannot access.

**Before figure recorded:** $15.00 allocated, $5.07 spent, **$9.93 remaining** (via `budget-probe.ts`, zero paid calls).

1. **PASS.** With `.env.local` renamed away and the dev server restarted, `localhost:3000` rendered the ordinary create screen: no blank page, no framework error overlay, no stack trace, no dedicated setup screen. No banner about a missing key was visible before any interaction.
2. **PASS.** Filled in a story idea and character description, clicked "Create Story". Result: exactly one calm sentence — *"This app isn't fully set up yet — its AI service key is missing. Ask whoever installed it to finish the setup steps, then try again."* — containing no environment variable name, no file path, no provider or model name. Console output was clean (no error, no stack trace).
3. **PASS.** The requester opened devtools, searched the loaded page source and JavaScript for the first 8 characters of their real API key, and confirmed zero matches.
4. **PASS.** "The Firefly Path" (the one existing story with a fully completed, real, paid episode) rendered its completed-episode summary cleanly — "Every scene is ready. Your episode's clips are saved and numbered for CapCut." — with no error, confirming this phase's new save-time MP4 validation did not disturb the existing ready path (validation only runs on new dispatches, and this story's assets predate the phase, but the read path that must still recognise them as valid is exercised identically).
5. **PASS.** "Purono Chithi" scene 1 (the flagged scene) showed exactly: *"This scene's video file didn't save properly, so it can't be used. Trying again won't use up one of this scene's attempts."*
6. **PASS.** The same scene showed a working "Try again" button rather than a capped dead-end message, despite `videoAttempts` being at the configured cap (3). The button was **not** pressed, per the plan's explicit instruction — doing so would have dispatched a real paid generation.
7. **PASS.** After resetting `videoSaveCorrupted`/`videoAttempts`/`videoStatus` and the story's `imagesApprovedAt` to their original values and reloading, "Purono Chithi" correctly reverted to its genuine original "Draft" status in the My Stories list (not "Needs Attention").
8. **PASS.** The budget indicator read "$9.93 left of $15.00" before, during, and after the entire checklist — matching the recorded before-figure exactly. `.env.local` is confirmed restored (the dev server's own startup log shows `Environments: .env.local` after the restart), and `.env.local.bak` no longer exists.

**After figure confirmed:** $9.93 remaining — identical to the before figure. Zero dollars spent proving any of Phase 6.

## Issues Encountered

None beyond the recorded deviation above (which was resolved cleanly, not a genuine problem).

## User Setup Required

None — no external service configuration required. The checkpoint's temporary `.env.local` rename was fully reversed before this plan closed.

## Next Phase Readiness

- All 4 Phase 6 requirements (RELIABILITY-01, SECURITY-01, STARTUP-02, OUTPUT-02) have real, live evidence behind them, not just unit-test coverage.
- `prisma/dev.db` ends the phase exactly as it started: Story=5, Scene=25, GenerationRecord=40/$5.0720, one BudgetPeriod row at $15.00 — this plan, and the whole phase, spent $0.00.
- No blockers. Phase 6 is ready for the standard closing pipeline (code review, phase-goal verification, security audit, UAT), matching Phases 1-5's precedent.

## Self-Check: PASSED

Both task commits (`c9b2a7f`, `fc944b4`) confirmed in `git log`. `src/core/video/stuck-threshold.ts` confirmed present on disk. Real `prisma/dev.db` row counts (Story=5, Scene=25, GenerationRecord=40/$5.0720) confirmed unchanged via direct query after the full checkpoint and restoration. The flagged scene and story confirmed reverted to their exact original values.

---
*Phase: 06-reliability-secrets-hygiene-output-correctness*
*Completed: 2026-09-20*

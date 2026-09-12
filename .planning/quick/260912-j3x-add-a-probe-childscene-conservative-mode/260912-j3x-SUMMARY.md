---
phase: quick-260912-j3x
plan: 01
subsystem: testing
tags: [veo, gemini, video-generation, smoke-test, spend-ledger]

# Dependency graph
requires:
  - phase: 01-provider-smoke-test
    provides: dispatchChildVideo, checkCeiling/recordSpend spend-ledger gate, scene-childscene.jpg source asset, CR-03 finding in 01-UAT.md
provides:
  - "--probe=childscene-conservative mode in src/scripts/smoke-test.ts, reusing the existing source image with a pose-change-free motion prompt"
  - "Empirical CR-03 verdict: conservative motion prompts avoid the head/torso kinematic disconnect while remaining visibly usable footage"
  - "Generalized dispatchChildVideo() shared by both childscene variants behind one checkCeiling gate"
affects: [phase-2-story-director, motion-prompt-authoring]

# Actuals (#2632)
actuals:
  tokens: 4350
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Single shared, ceiling-gated dispatch function parameterized by a variant object (motionPrompt/outputPath/ledgerCall/logLabel) instead of duplicating checkCeiling call sites per prompt variant"

key-files:
  created: []
  modified:
    - src/scripts/smoke-test.ts
    - .planning/phases/01-provider-smoke-test/01-UAT.md
    - storage/_smoketest/spend-ledger.json

key-decisions:
  - "Corrected the UAT's ~$0.20 estimate to the real $0.4000 cost (8s x $0.05/sec at 720p) before spending, so the actual figure was unmissable in the plan rather than discovered after the fact."
  - "No automatic retry on a conservative-probe block (unlike the childscene probe's single retry) — this probe investigates motion quality, not blocking, so a retry would silently double spend for no extra signal."
  - "Generalized dispatchChildVideo() to one shared gated dispatch parameterized by a variant object, rather than adding a second copy of the checkCeiling gate."

patterns-established:
  - "Pattern: probe variants share one gated dispatch function; a variant object supplies only the non-gate-relevant differences (prompt, output path, ledger call name, log label)."

requirements-completed: [CR-03]

coverage:
  - id: D1
    description: "childscene-conservative probe mode added, reuses existing source image (zero new childscene-image ledger entries), writes to a distinct output path"
    requirement: CR-03
    verification:
      - kind: unit
        ref: "npm run typecheck"
        status: pass
      - kind: other
        ref: "node src/scripts/smoke-test.ts --probe=bogus | grep childscene-conservative"
        status: pass
      - kind: other
        ref: "gate-shape check: exactly 2 generateVideo dispatch sites (generic + shared child), >=3 checkCeiling sites"
        status: pass
    human_judgment: false
  - id: D2
    description: "Real Veo call dispatched once at $0.4000; ledger totals $1.2010 of $3.00 ceiling; original scene-childscene.mp4 byte-identical before/after"
    requirement: CR-03
    verification:
      - kind: other
        ref: "ledger entry-count + total assertion (node -e script in plan Task 2 verify)"
        status: pass
      - kind: other
        ref: "sha256sum storage/_smoketest/scene-childscene.mp4 before/after"
        status: pass
    human_judgment: false
  - id: D3
    description: "CR-03 empirical verdict: head/torso kinematic disconnect does not reproduce under conservative motion prompt; clip remains visibly usable (not a frozen frame)"
    requirement: CR-03
    verification:
      - kind: manual_procedural
        ref: "Human playback of storage/_smoketest/scene-childscene.mp4 and scene-childscene-conservative.mp4 back to back"
        status: pass
    human_judgment: true
    rationale: "Motion-quality/artifact judgment requires watching rendered video; no ffmpeg/frame-extraction or video-capable read tooling was available in this environment to automate it, and the plan itself designates this as a human-check step."

duration: 26min
completed: 2026-09-12
status: complete
---

# Phase quick-260912-j3x Plan 01: Add childscene-conservative probe mode Summary

**Added a `--probe=childscene-conservative` Veo mode that reuses the approved garden-scene image with a pose-change-free motion prompt, spent $0.4000 to run it once, and confirmed empirically that the CR-03 head/torso kinematic disconnect does not reproduce under conservative (camera + environmental) motion.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-09-12T12:45:00Z (approx)
- **Completed:** 2026-09-12T13:11:52Z
- **Tasks:** 3
- **Files modified:** 3 (smoke-test.ts, spend-ledger.json, 01-UAT.md)

## Accomplishments
- `src/scripts/smoke-test.ts` gained a fourth probe mode, `childscene-conservative`, that reads the existing `scene-childscene.jpg` from disk (never regenerating it) and animates it with `CONSERVATIVE_MOTION_PROMPT` — camera drift and environmental motion only, no character pose-change language.
- Generalized `dispatchChildVideo()` into a single ceiling-gated dispatch shared by the original `childscene` probe and the new `childscene-conservative` probe via a `ChildVideoVariant` object, instead of duplicating the `checkCeiling` gate.
- Ran the real Veo call once: $0.4000 (8s x $0.05/sec at 720p), pushing the ledger to $1.2010 of the $3.00 D-05 dev ceiling, with the original `scene-childscene.mp4` confirmed byte-identical before and after (sha256 unchanged).
- Recorded an explicit, human-verified CR-03 verdict in `01-UAT.md`: the artifact does not reproduce under conservative motion, and the resulting clip still reads as visibly alive (not a frozen frame) — a validated authoring constraint for Phase 2's Story Director.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the childscene-conservative probe mode** - `dfddc5e` (feat)
2. **Task 2: Run the conservative probe for real once ($0.4000 paid Veo call)** - `4868386` (chore)
3. **Task 3: Record the empirical CR-03 verdict in 01-UAT.md** - `df7c458` (test)

**Plan metadata:** committed by orchestrator (docs-only files, per plan constraints)

## Files Created/Modified
- `src/scripts/smoke-test.ts` - Added `CONSERVATIVE_MOTION_PROMPT`, `CONSERVATIVE_SOURCE_IMAGE`/`CONSERVATIVE_OUTPUT_VIDEO`, `mimeTypeForExtension()`, generalized `dispatchChildVideo()` to accept a `ChildVideoVariant`, added `runChildsceneConservativeProbe()`, wired `--probe=childscene-conservative` into `main()` (opt-in, deliberately excluded from `--probe=all`)
- `storage/_smoketest/spend-ledger.json` - New `childscene-conservative-video` entry at $0.4000; total now $1.2010
- `.planning/phases/01-provider-smoke-test/01-UAT.md` - CR-03 Decision, Follow-up probe result, and Phase 2 implication filled in; Current Test block resolved (no longer awaiting user response)

## Decisions Made
- Corrected the UAT's original ~$0.20 cost estimate to the real $0.4000 (8s duration is the fair-comparison constraint, not a shorter/cheaper clip) — stated explicitly in the UAT rather than only in the plan, so the actual spend is traceable at the source of the finding.
- Chose not to retry on a block for the conservative probe (unlike the childscene probe's documented single retry for RAI false positives) — this probe investigates motion quality, not blocking, so a retry would double spend for no signal gain.
- Kept the shared dispatch's checkCeiling → generateVideo → recordSpend ordering unchanged during the generalization, so the refactor could not accidentally drop the budget gate on either variant.

## Deviations from Plan

None - plan executed exactly as written. The one non-automatable step (Task 3's human-check) was handled by opening both clips for the human via the OS default player and relaying their verdict verbatim into `01-UAT.md`, per the plan's own instruction to "record only what was observed."

## Issues Encountered
- No ffmpeg, no python/video libraries, and the file-read tool refuses binary `.mp4` files were available in this environment — none of these could substitute for genuine human playback of the two clips for the CR-03 motion-quality judgment, so that step was routed to the human (coordinator) rather than fabricated. Their verdict (artifact absent, motion still visible) is recorded in `01-UAT.md` and this SUMMARY's `coverage` block (`D3`, `human_judgment: true`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CR-03 is fully resolved with an empirical, human-verified answer: Phase 2's Story Director should favor camera/environmental motion prompts and avoid character pose-change requests as a default motion-prompt authoring constraint.
- Ledger stands at $1.2010 of the $3.00 D-05 dev ceiling ($1.7990 headroom) across Phases 1-4 combined.
- No blockers for closing Phase 1 or proceeding to Phase 2 planning.

---
*Phase: quick-260912-j3x*
*Completed: 2026-09-12*

## Self-Check: PASSED

All created/modified files confirmed present on disk; all three task commits (`dfddc5e`, `4868386`, `df7c458`) confirmed present in `git log`.

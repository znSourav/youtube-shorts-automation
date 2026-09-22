---
phase: 06-reliability-secrets-hygiene-output-correctness
plan: 01
subsystem: reliability
tags: [nextjs, server-actions, prisma, secrets-hygiene, error-handling, gemini, veo]

# Dependency graph
requires:
  - phase: 05-budget-retry-safeguards
    provides: checkBudget/serializeDispatch gated-dispatch pattern this plan's pre-flight guard extends; recordGeneration/recordGenerationAtDispatch best-effort write contract that closed the recordSpend technical debt this plan verifies (not re-fixes)
provides:
  - "assertApiKeyConfigured()/MissingApiKeyError/MISSING_API_KEY_MESSAGE (src/core/config/provider-key.ts) -- the pre-flight guard every future gated dispatch site should call before checkBudget"
  - "check-boundaries.ts invariant 1's core/config forbidden-specifier entry -- future server-only config modules should follow this same client-import-forbidden pattern"
  - "src/scripts/secrets-audit.ts -- an automated, git-history-verified secrets-hygiene gate future plans can extend with new checks"
  - "isSecretKey's safe-token-suffix narrowing pattern (SAFE_TOKEN_FIELD_SUFFIX) -- reusable if a future SDK field needs the same false-positive-avoidance treatment"
affects: [06-02, 06-03, 06-04, 06-05]

# Actuals (#2632)
actuals:
  tokens: 8584
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Synchronous, zero-I/O pre-flight guard (assertApiKeyConfigured) checked before every async budget-gated dispatch, mirroring BudgetExceededError's class shape so every Server Action's existing catch-and-map pattern extends with one more instanceof branch"
    - "A refusal (no dispatch occurred) is never written as a FAILED asset status and never consumes a retry-attempt counter -- distinct from a generation failure, matching the existing evaluateVideoDispatch refusal-branch convention"
    - "Dependency-free structural audit script (node:child_process + node:fs only), same OK:/FAILED shape as check-boundaries.ts, appended to test:lib so a one-time manual review becomes a regression gate"

key-files:
  created:
    - src/core/config/provider-key.ts
    - src/core/config/provider-key.test.ts
    - src/scripts/missing-key-probe.ts
    - src/scripts/secrets-audit.ts
  modified:
    - src/core/story/director.ts
    - src/core/uniqueness/check.ts
    - src/core/uniqueness/check.test.ts
    - src/app/actions/create-story.ts
    - src/app/actions/generate-images.ts
    - src/app/actions/generate-video.ts
    - src/lib/log-response.ts
    - src/lib/log-response.test.ts
    - src/scripts/check-boundaries.ts
    - package.json

key-decisions:
  - "The 'unprotected recordSpend call' technical-debt item CLOSED BY PHASE 5 confirmed a third time (grep -rn recordSpend src/ finds zero call sites in generate-images.ts/director.ts, matching 06-CONTEXT.md and 06-RESEARCH.md) -- no task created for it, per this plan's own scope note"
  - "compareViaLlm has no injectable env parameter for assertApiKeyConfigured (unlike checkBudget's client param) -- check.test.ts's pre-existing tests needed a file-level before/after hook setting a fake GEMINI_API_KEY, mirroring the MONTHLY_BUDGET_USD save/restore convention already used per-test in the same file, rather than weakening the guard or adding a new injectable seam not requested by the plan"
  - "generateSceneImagesAction's missing-key refusal is a single pre-loop check (not per-scene) that returns a full array of per-scene MISSING_API_KEY_MESSAGE statuses without ever calling updateSceneImage -- preserves the existing 'a refusal never corrupts a scene's stored status' invariant dispatchSceneVideo already established"
  - "isSecretKey's safe-token-suffix narrowing still redacts a name that is BOTH token-shaped-safe AND key/authorization-shaped (e.g. a hypothetical apiKeyTokenCount) -- defense in depth with a regression test, per 06-RESEARCH.md Code Example 3's explicit guidance"

patterns-established:
  - "Pre-flight synchronous guard before an async budget check: assertApiKeyConfigured() always runs as literally the first statement of runStoryDirector/compareViaLlm/generateSceneImagesAction/dispatchSceneVideo, strictly before checkBudget, at zero I/O cost"
  - "A five-check structural audit script (secrets-audit.ts) appended to test:lib alongside check-boundaries.ts, both dependency-free and both failing loudly with a non-zero exit"

requirements-completed: [STARTUP-02, SECURITY-01]

coverage:
  - id: D1
    description: "A missing API key on the Create Story path produces the calm, fixed MISSING_API_KEY_MESSAGE sentence instead of a crash or stack trace, proven end-to-end from a cold process with zero dispatch/billing"
    requirement: STARTUP-02
    verification:
      - kind: unit
        ref: "src/core/config/provider-key.test.ts (6 tests)"
        status: pass
      - kind: integration
        ref: "node --env-file-if-exists=.env.local src/scripts/missing-key-probe.ts (PROBE PASS, GenerationRecord count unchanged)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The same guard extended to the remaining three gated dispatch sites (compareViaLlm, generateSceneImagesAction, dispatchSceneVideo) without corrupting scene status or consuming a retry attempt on refusal, and check-boundaries.ts structurally forbids a client file from importing the new module"
    requirement: STARTUP-02
    verification:
      - kind: unit
        ref: "src/core/uniqueness/check.test.ts (23 tests, incl. pre-existing compareViaLlm coverage)"
        status: pass
      - kind: other
        ref: "node src/scripts/check-boundaries.ts (temporary client-import proof, reverted before commit)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Log redaction no longer hides real usage-metadata token-count telemetry while still hiding every secret-shaped field"
    requirement: SECURITY-01
    verification:
      - kind: unit
        ref: "src/lib/log-response.test.ts (13 tests, 8 pre-existing + 5 new)"
        status: pass
    human_judgment: false
  - id: D4
    description: "SECURITY-01's configuration guarantees (.env.local gitignored/untracked, .env.local.example placeholder-only, no NEXT_PUBLIC_ leak in src/) are re-proved automatically on every full test run"
    requirement: SECURITY-01
    verification:
      - kind: other
        ref: "node src/scripts/secrets-audit.ts (5 of 5 OK: lines, exit 0)"
        status: pass
      - kind: integration
        ref: "npm run test:lib (274 tests pass, check-boundaries.ts and secrets-audit.ts both OK)"
        status: pass
    human_judgment: false

duration: 7min (commit-range; investigation/reading time not separately timed)
completed: 2026-09-20
status: complete
---

# Phase 6 Plan 1: Missing-Key Tracer, Guard Expansion, and Automated Secrets Hygiene Summary

**A synchronous assertApiKeyConfigured() pre-flight guard now fires before every budget-gated dispatch, log redaction stopped hiding real Gemini token-count telemetry, and a new secrets-audit.ts script makes SECURITY-01's configuration guarantees an automated gate instead of a one-time manual check.**

## Performance

- **Duration:** ~7 min between first and last task commit (8b32d28 to 3dc5a6b); reading/research time for this session was substantially longer and not separately tracked
- **Started:** 2026-09-20T19:04:11+08:00 (first task commit)
- **Completed:** 2026-09-20T19:10:36+08:00 (last task commit)
- **Tasks:** 3 of 3
- **Files modified:** 14 (4 created, 10 modified)

## Accomplishments

- Added `src/core/config/provider-key.ts` (`MissingApiKeyError`, `MISSING_API_KEY_MESSAGE`, `assertApiKeyConfigured`) mirroring `BudgetExceededError`'s shape, wired as the first statement in `runStoryDirector` and proven end-to-end on the Create Story path by a cold-process probe that dispatches nothing and writes no `GenerationRecord` row.
- Extended the same guard to the remaining three gated dispatch sites (`compareViaLlm`, `generateSceneImagesAction`, `dispatchSceneVideo`), each returning `MISSING_API_KEY_MESSAGE` without corrupting a scene's stored status or consuming a retry attempt -- a refusal is not a generation failure. `check-boundaries.ts` invariant 1 now structurally forbids a client file from importing the new module.
- Narrowed `isSecretKey`'s over-redaction (WINDOWS #2): all twelve verified real usage-metadata field names (`promptTokenCount`, `candidatesTokensDetails`, etc.) now pass through unredacted, while `apiKey`/`x-goog-api-key`/`authorization`/bare `token` remain fully redacted, plus a defense-in-depth case (a name that is both safe-suffix and key-shaped stays redacted).
- Added `src/scripts/secrets-audit.ts`, a five-check structural audit (`.env.local` gitignored/untracked, `.env.local.example` tracked with only the placeholder `*_API_KEY` value, no `src/` file declares `NEXT_PUBLIC_`) appended to `npm run test:lib` alongside `check-boundaries.ts`.
- Confirmed (a third time, independently of 06-CONTEXT.md and 06-RESEARCH.md) that the "unprotected `recordSpend` call" technical-debt item named in Phase 4's code reviews is closed by Phase 5: `grep -rn "recordSpend" src/` finds zero live call sites in `generate-images.ts`/`director.ts` -- only comments, the retired `spend-ledger.ts` module itself, its own tests, and the dev-only `smoke-test.ts` script. No task was created for it, per this plan's own scope note.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "a missing key explains itself on Create Story"** - `8b32d28` (feat)
2. **Task 2: Extend the pre-flight guard to the remaining three gated dispatch sites** - `8e853c4` (feat)
3. **Task 3: Narrow the log redaction false-positive and make secrets hygiene an automated gate** - `3dc5a6b` (fix)

**Plan metadata:** committed alongside this SUMMARY (see Self-Check section).

## Files Created/Modified

- `src/core/config/provider-key.ts` - `MissingApiKeyError`, `MISSING_API_KEY_MESSAGE`, `assertApiKeyConfigured` (new)
- `src/core/config/provider-key.test.ts` - 6 tests covering every behavior bullet (new)
- `src/scripts/missing-key-probe.ts` - cold-process end-to-end probe, $0.00 cost (new)
- `src/scripts/secrets-audit.ts` - 5-check structural secrets-hygiene audit (new)
- `src/core/story/director.ts` - `assertApiKeyConfigured()` as `runStoryDirector`'s first statement
- `src/core/uniqueness/check.ts` - `assertApiKeyConfigured()` as `compareViaLlm`'s first statement
- `src/core/uniqueness/check.test.ts` - file-level fake `GEMINI_API_KEY` before/after hook for pre-existing `compareViaLlm` tests
- `src/app/actions/create-story.ts` - `MissingApiKeyError` branch, ahead of `BudgetExceededError`, in the catch chain
- `src/app/actions/generate-images.ts` - pre-loop guard returning a `MISSING_API_KEY_MESSAGE` status per scene; in-loop catch also branches on `MissingApiKeyError` (defense in depth)
- `src/app/actions/generate-video.ts` - pre-flight guard ahead of `storyDir(storyId)`, no `updateSceneVideo`/`incrementVideoAttempt` on refusal
- `src/lib/log-response.ts` - `isSecretKey` safe-token-suffix narrowing; JSDoc updated
- `src/lib/log-response.test.ts` - 5 new regression tests (12 real field names unchanged, 4 secret-shaped fields still redacted, 1 defense-in-depth case)
- `src/scripts/check-boundaries.ts` - invariant 1 gains `core/config`; a Task 2 comment reworded to avoid tripping `secrets-audit.ts`'s own `NEXT_PUBLIC_` scan
- `package.json` - `test:lib` gains `provider-key.test.ts` and `&& node src/scripts/secrets-audit.ts`

## Decisions Made

- The recordSpend technical-debt item is CLOSED BY PHASE 5 -- confirmed independently this session, no task created (see plan's own scope note, Accomplishments above).
- `compareViaLlm` has no injectable `env` parameter (unlike `checkBudget`'s `client`); rather than adding one not requested by the plan, `check.test.ts` gained a file-level `before`/`after` hook setting a fake `GEMINI_API_KEY`, mirroring the file's own existing `MONTHLY_BUDGET_USD` save/restore convention.
- `generateSceneImagesAction`'s missing-key refusal is checked ONCE before the loop (not per-scene) and returns a full array of per-scene statuses without calling `updateSceneImage` -- preserves "a refusal never corrupts a scene's stored status."
- `isSecretKey`'s narrowing still redacts a name that is both safe-suffix-shaped and key/authorization-shaped, with an explicit regression test, per 06-RESEARCH.md's defense-in-depth guidance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] check.test.ts's pre-existing compareViaLlm tests broke under the new guard**
- **Found during:** Task 2 verification (`npm run test:lib`)
- **Issue:** `compareViaLlm` now calls `assertApiKeyConfigured()` reading `process.env` directly (no injectable parameter). The plain `node --test` invocation `test:lib` uses has no `GEMINI_API_KEY`/`GOOGLE_API_KEY` set, so all 8 pre-existing `compareViaLlm`-exercising tests in `check.test.ts` started throwing `MissingApiKeyError` before reaching the budget/dispatch logic they actually test.
- **Fix:** Added a file-level `before`/`after` hook in `check.test.ts` setting a fake `GEMINI_API_KEY` for the file's duration and restoring the original value afterward -- mirroring the file's own existing per-test `MONTHLY_BUDGET_USD` save/restore convention. Does not touch `assertApiKeyConfigured`'s own behavior or its dedicated test coverage (`provider-key.test.ts`).
- **Files modified:** `src/core/uniqueness/check.test.ts`
- **Verification:** `node --test src/core/uniqueness/check.test.ts` -- 23/23 pass; `npm run test:lib` -- 274/274 pass.
- **Committed in:** `8e853c4` (Task 2 commit)

**2. [Rule 1 - Bug] A Task 2 comment tripped Task 3's own new audit check**
- **Found during:** Task 3 verification (`node src/scripts/secrets-audit.ts`)
- **Issue:** `check-boundaries.ts`'s Task 2 comment (`"non-NEXT_PUBLIC_ variable"`) contained the literal `NEXT_PUBLIC_` substring, which `secrets-audit.ts` check 5 correctly flagged as a false positive -- it scans file *contents*, not just declarations, and only excludes its own path.
- **Fix:** Reworded the comment ("a plain, non-publicly-prefixed variable") to preserve the same meaning without the literal string. Did not weaken check 5's scan (no new exclusion added) -- the check's design intentionally has no allowlist beyond its own file.
- **Files modified:** `src/scripts/check-boundaries.ts`
- **Verification:** `node src/scripts/secrets-audit.ts` -- 5/5 OK, exit 0.
- **Committed in:** `3dc5a6b` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1/3 -- test-environment and self-referential-scan fixes, neither weakens the guarantee it touches).
**Impact on plan:** Both fixes necessary to keep `npm run test:lib` genuinely green; no scope creep, no change to any acceptance criterion's substance.

## Issues Encountered

None beyond the two deviations above.

## User Setup Required

None - no external service configuration required. This plan makes zero paid provider calls (verified: `PROBE PASS` with `GenerationRecord` row count unchanged before/after).

## Next Phase Readiness

- STARTUP-02 and SECURITY-01 (runtime + configuration halves) are both closed for this plan's scope.
- Plans 06-02 through 06-05 can build on `assertApiKeyConfigured`/`MISSING_API_KEY_MESSAGE` as an established pattern, and on `secrets-audit.ts`/`check-boundaries.ts` as the two automated structural gates every future plan's `test:lib` run already exercises.
- No blockers. RELIABILITY-01's differentiated provider-failure messaging (D-01) and OUTPUT-02's MP4 validation remain for later plans in this phase, per 06-RESEARCH.md's architecture map -- untouched by this plan.

---
*Phase: 06-reliability-secrets-hygiene-output-correctness*
*Completed: 2026-09-20*

## Self-Check: PASSED

All created files confirmed present on disk (`src/core/config/provider-key.ts`, `src/core/config/provider-key.test.ts`, `src/scripts/missing-key-probe.ts`, `src/scripts/secrets-audit.ts`, this SUMMARY). All three task commit hashes (`8b32d28`, `8e853c4`, `3dc5a6b`) confirmed present in `git log --oneline --all`.

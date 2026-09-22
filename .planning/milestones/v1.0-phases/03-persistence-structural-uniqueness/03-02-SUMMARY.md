---
phase: 03-persistence-structural-uniqueness
plan: 02
subsystem: uniqueness
tags: [structural-uniqueness, jaccard-similarity, llm-tiebreaker, regeneration-loop, gemini]

# Dependency graph
requires:
  - phase: 03-persistence-structural-uniqueness
    provides: "03-01's Story/Scene Prisma schema, story-repository.ts's listAcceptedFingerprints/markUniquenessStatus, fingerprint.ts's StructuralFingerprint type and FINGERPRINT_INSTRUCTION"
provides:
  - "src/core/uniqueness/similarity.ts -- Unicode-aware Jaccard pre-filter over D-01's three fingerprint fields, zero-cost common path"
  - "src/core/uniqueness/check.ts -- checkUniqueness, runUniqueStoryDirector's bounded regeneration loop, buildComparisonPrompt/buildComparisonSchema, compareViaLlm"
  - "src/providers/llm/gemini.ts's compareStructuralSimilarity/classifyComparisonResponse -- the ceiling-gated LLM tie-breaker call"
  - "createStoryAction wired to runUniqueStoryDirector -- no path reaches the review screen around the uniqueness gate"
  - "D-03/D-04 plain-language wording: the in-flight loading label and the exhaustion warning banner"
affects: [03-04-real-proof-run, phase-04-story-library]

# Actuals (#2632)
actuals:
  tokens: 27750
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Defaulted-collaborator dependency injection (director/historyReader/escalate all optional params defaulting to real implementations) -- same convention spend-ledger.ts uses for its path parameter, lets check.test.ts exercise the full regeneration loop with zero network calls and zero ledger writes"
    - "Named seam pattern: checkUniqueness only ever calls deps.escalate, never a concrete LLM function directly -- Task 1 left the hook undefined-safe, Task 2 filled its default without touching checkUniqueness's signature or any caller"
    - "Fail-toward-different: an empty/unanalysable token set scores 0 (not 1) in jaccardSimilarity, and every LLM-path failure mode (blocked/truncated/unparseable/ceiling-refused) resolves to a pass, never a collision"

key-files:
  created:
    - src/core/uniqueness/similarity.ts
    - src/core/uniqueness/similarity.test.ts
    - src/core/uniqueness/check.ts
    - src/core/uniqueness/check.test.ts
    - src/scripts/uniqueness-probe.ts
  modified:
    - src/core/story/director.ts
    - src/providers/llm/gemini.ts
    - src/providers/llm/gemini.test.ts
    - src/app/actions/create-story.ts
    - src/app/page.tsx
    - src/components/story/CreateStoryForm.tsx
    - src/components/story/StoryReview.tsx
    - .env.local.example
    - package.json

key-decisions:
  - "Kept RESEARCH.md Assumption A1's reasoned 0.75/0.40 thresholds unchanged -- the two A1 fixture pairs validated them exactly as designed (reskin pair: want=0.846, obstacle=0.833, ending=0.778, all clearing 0.75; shared-surface pair: want=0.273, obstacle=0.077, ending=0.100, all well under 0.40), so no threshold move was needed or justified by the evidence gathered this plan."
  - "COMPARISON_MODEL = gemini-3.8-flash (the same GA-tier id generateStory already falls back to) per Assumption A2 -- a cost decision whose failure mode is judgement quality, not spend; no primary/fallback dance needed since this IS already the fallback tier."
  - "compareViaLlm accepts an injectable comparator + ledgerPath (defaulting to the real compareStructuralSimilarity + LEDGER_PATH) specifically so its D-02 AND-of-three logic, blocked-handling, and ceiling-catch behavior are all directly unit-testable with a fake comparator and a temp ledger file, with zero real network calls and zero real ledger writes."
  - "D-03's in-flight status message is a single fixed sentence covering the whole action (generation + uniqueness check + up to 3 regeneration attempts), not a per-attempt streamed status -- this codebase has no streaming/per-attempt progress channel (03-PATTERNS.md's own finding), so this is the D-03 message as the architecture can actually deliver it, not an omission."
  - "The D-04 exhaustion warning and the D-03 loading label are both hand-written, non-locked wording per 03-CONTEXT.md's Specific Ideas note -- neither string contains a story title, id, similarity score, attempt count, or reason code."

patterns-established:
  - "Every LLM-tie-breaker failure mode (blocked, truncated, unparseable, ceiling-refused) resolves to a pass rather than a collision -- fail-open toward letting a story through, since the pre-filter has already flagged the case as uncertain rather than obvious, and a refusal must never manufacture a paid regeneration."
  - "checkCeiling/recordSpend live inside the escalation hook (compareViaLlm), not inside the orchestrator -- the same call-id-per-comparison ('uniqueness-comparison:<pastStoryId>') convention as scene-image/video call ids, keeping this spend separable in the ledger."

requirements-completed: [UNIQUE-01, UNIQUE-02, UNIQUE-03]

coverage:
  - id: D1
    description: "The deterministic pre-filter detects a structural reskin (all three fields align) and rejects it with zero LLM calls, while two genuinely different stories sharing only generic surface words (girl/forest) pass without escalating (UNIQUE-01, UNIQUE-03)"
    requirement: "UNIQUE-01"
    verification:
      - kind: unit
        ref: "src/core/uniqueness/similarity.test.ts#the near-identical reskin pair scores above HIGH_THRESHOLD on all three fields and rejects (UNIQUE-01)"
        status: pass
      - kind: unit
        ref: "src/core/uniqueness/similarity.test.ts#the shared-surface-words pair (girl/forest) scores low and passes despite the generic overlap (UNIQUE-03)"
        status: pass
      - kind: other
        ref: "node src/scripts/uniqueness-probe.ts -- prints both fixture pairs' scores and UNIQUENESS PROBE: ok"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-02's all-three-must-match rule is implemented identically on both the deterministic pre-filter and the LLM tie-breaker path -- a two-of-three alignment always passes, never rejects"
    requirement: "UNIQUE-03"
    verification:
      - kind: unit
        ref: "src/core/uniqueness/similarity.test.ts#a two-of-three alignment passes, never rejects (D-02)"
        status: pass
      - kind: unit
        ref: "src/core/uniqueness/check.test.ts#the same middle-band pair with a fake comparator returning two-of-three-true yields a pass (D-02 applies on the LLM path)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The regeneration loop is bounded by a configurable cap (MAX_UNIQUENESS_REGENERATION_ATTEMPTS, default 3), stops at exactly the cap, and returns the LAST candidate flagged as exhausted -- never a silent accept or silent block (UNIQUE-02, D-04)"
    requirement: "UNIQUE-02"
    verification:
      - kind: unit
        ref: "src/core/uniqueness/check.test.ts#an always-colliding director stops at exactly the configured cap and returns the LAST candidate, not the first"
        status: pass
      - kind: unit
        ref: "src/core/uniqueness/check.test.ts#maxRegenerationAttempts falls back to the default of 3 for absent, 0, -1, and a non-numeric value"
        status: pass
      - kind: unit
        ref: "src/core/uniqueness/check.test.ts#runUniqueStoryDirector honours MAX_UNIQUENESS_REGENERATION_ATTEMPTS=2 read from the real environment"
        status: pass
    human_judgment: false
  - id: D4
    description: "The Unicode-aware tokenizer preserves Bangla-script letters (proving the ASCII-tokenizer trap is avoided) and an empty/unanalysable token set scores 0, never 1"
    verification:
      - kind: unit
        ref: "src/core/uniqueness/similarity.test.ts#tokenize preserves non-Latin letters -- a Bangla-script field scores above 0 against a related Bangla-script field (score=0.846)"
        status: pass
      - kind: unit
        ref: "src/core/uniqueness/similarity.test.ts#jaccardSimilarity returns 0 when either token set is empty, not 1"
        status: pass
    human_judgment: false
  - id: D5
    description: "The LLM tie-breaker is dispatched at most once per borderline past story, never for the obvious-reject or obvious-pass paths, and every failure mode (blocked/truncated/unparseable/ceiling-refused) resolves to a pass rather than a collision"
    requirement: "UNIQUE-03"
    verification:
      - kind: unit
        ref: "src/core/uniqueness/check.test.ts#the comparator is invoked exactly once for one borderline past story and zero times for a history whose every entry falls below the borderline band"
        status: pass
      - kind: unit
        ref: "src/core/uniqueness/check.test.ts#a ceiling refusal on the comparison yields a pass and never invokes the comparator"
        status: pass
      - kind: unit
        ref: "src/core/uniqueness/check.test.ts#the same middle-band pair with a fake comparator returning a blocked result yields a pass and does not throw"
        status: pass
    human_judgment: false
  - id: D6
    description: "Every dispatched comparison call is checkCeiling-gated before dispatch and recordSpend-gated after, including a blocked comparison -- the ledger stayed at exactly $2.9370 across the whole plan (zero real paid calls)"
    verification:
      - kind: unit
        ref: "src/core/uniqueness/check.test.ts#checkCeiling runs before dispatch and recordSpend runs after, including for a blocked comparison"
        status: pass
      - kind: other
        ref: "storage/_smoketest/spend-ledger.json total re-verified at $2.9370 after every task's commit"
        status: pass
    human_judgment: false
  - id: D7
    description: "createStoryAction is unbypassable -- it calls runUniqueStoryDirector, not runStoryDirector, so no path reaches saveStoryWithScenes/the review screen around the uniqueness gate; the success return type carries no field capable of holding a collided story's id or rejected text"
    requirement: "UNIQUE-01"
    verification:
      - kind: unit
        ref: "node src/scripts/check-boundaries.ts -- 4/4 OK lines"
        status: pass
      - kind: manual_procedural
        ref: "grep confirms createStoryAction imports runUniqueStoryDirector (not runStoryDirector) and CreateStorySuccess has exactly 4 fields (ok, data, storyId, uniquenessWarning)"
        status: pass
    human_judgment: false
  - id: D8
    description: "The wife-facing D-03 in-flight label and D-04 exhaustion warning are calm, plain-language, non-technical, and never carry a story title, id, score, attempt count, or reason code"
    verification: []
    human_judgment: true
    rationale: "This plan's own budget-discipline section explicitly prohibits any real paid provider call in its tasks or verification (the ledger has only $0.0630 headroom, reserved entirely for plan 03-04's one real proof run) -- a live npm run dev click-through that actually submits the form would dispatch a real Gemini call and cannot be performed without violating that constraint. Verified instead via direct code inspection of the exact strings committed in create-story.ts and CreateStoryForm.tsx (quoted in this SUMMARY's Decisions), mirroring 03-01-SUMMARY.md's identical waiver precedent for its own Task 2 tracer-gate human-check. A genuine visual confirmation should happen at end-of-phase (/gsd-verify-work) or during plan 03-04's real proof run, at no additional cost since that run happens anyway."

duration: 45min
completed: 2026-09-13
status: complete
---

# Phase 3 Plan 02: Structural Uniqueness Gate Summary

**A Unicode-aware Jaccard pre-filter (0.75/0.40 thresholds, unchanged from research) plus a ceiling-gated `gemini-3.8-flash` tie-breaker now sit between story generation and story review, implementing D-02's all-three-must-match rule on both paths with a bounded 3-attempt regeneration loop and D-03/D-04's plain-language wording.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-09-13 (approx, based on commit history)
- **Completed:** 2026-09-13T19:02:48+08:00
- **Tasks:** 3
- **Files modified:** 14 (5 created, 9 modified)

## Accomplishments

- `src/core/uniqueness/similarity.ts`: a Unicode-property-escape (`\p{L}`/`\p{N}` with the `u` flag) tokenizer -- NOT an ASCII-only character class -- feeding `jaccardSimilarity`/`scoreFingerprints`/`preFilterVerdict`. An empty or punctuation-only token set scores 0, never 1 (fails toward "different"). The two RESEARCH.md Assumption A1 fixture pairs (a near-identical reskin, and a shared-surface-words-but-different-structure pair) both produced their expected opposite verdicts against the ORIGINAL unmoved 0.75/0.40 thresholds -- no threshold tuning was needed.
- `src/core/uniqueness/check.ts`: `checkUniqueness` implements D-02's all-three-elements-must-match rule literally; `runUniqueStoryDirector`'s bounded regeneration loop (mirroring `generate-images.ts`'s sequential shape) stops at `maxRegenerationAttempts()` (default 3, read from `MAX_UNIQUENESS_REGENERATION_ATTEMPTS`, safely degrading on any malformed value) and returns the LAST candidate flagged as exhausted (D-04) rather than the first.
- `src/providers/llm/gemini.ts`: `compareStructuralSimilarity`/`classifyComparisonResponse` mirror `generateStory`/`classifyStoryResponse`'s classify-before-parse ordering exactly; `COMPARISON_MODEL` reuses the existing GA-tier `gemini-3.8-flash` id (Assumption A2's cost decision).
- `src/core/uniqueness/check.ts`'s `compareViaLlm`: the real escalation implementation, checkCeiling-gated before dispatch and recordSpend-gated after (including a blocked comparison), wired as the default value of the escalation hook Task 1 left as a named seam -- `checkUniqueness`'s own signature never changed.
- `createStoryAction` now calls `runUniqueStoryDirector` exclusively -- no code path reaches `saveStoryWithScenes`/the review screen around the uniqueness gate. `CreateStorySuccess` gains `uniquenessWarning: string | null`, a shape with no field capable of holding a collided story's id or rejected text (D-03, enforced structurally, not just by convention).
- D-03/D-04 wording is live: the in-flight button label and the exhaustion warning banner (rendered in `StoryReview.tsx` as a neutral amber banner, distinct from the red error banner).
- Zero real paid provider calls anywhere in this plan; the dev ledger is confirmed unchanged at **$2.9370 of $3.00** after all three tasks.

## Task Commits

1. **Task 1: A colliding story is detected and regenerated end to end, deterministically and for free** - `b02fc7e` (feat)
2. **Task 2: The borderline case gets one targeted, ceiling-gated LLM comparison** - `40df83b` (feat)
3. **Task 3: What she actually sees -- the regeneration status and the exhaustion warning** - `34db202` (feat)

**Plan metadata:** committed alongside this SUMMARY

## Files Created/Modified

- `src/core/uniqueness/similarity.ts` -- pure, dependency-free Unicode-aware Jaccard pre-filter
- `src/core/uniqueness/similarity.test.ts` -- 7 tests, including the two A1 fixture pairs and a real Bangla-script regression test
- `src/core/uniqueness/check.ts` -- orchestration: `checkUniqueness`, `runUniqueStoryDirector`, `buildComparisonPrompt`/`buildComparisonSchema`, `compareViaLlm`, `maxRegenerationAttempts`
- `src/core/uniqueness/check.test.ts` -- 22 tests, zero network calls, zero real ledger writes (every test uses a fake director/historyReader/comparator and a temp ledger path)
- `src/scripts/uniqueness-probe.ts` -- zero-cost CLI probe over the two A1 fixture pairs plus an optional `--against-db` real-history sanity check
- `src/core/story/director.ts` -- optional `avoidPattern` on `StoryDirectorInput`, injected into `buildStoryPrompt`'s instruction block (never the content section), each field truncated to 300 characters
- `src/providers/llm/gemini.ts` -- `compareStructuralSimilarity`, `classifyComparisonResponse`, `COMPARISON_MODEL`
- `src/providers/llm/gemini.test.ts` -- 5 new comparison-classifier fixture tests
- `src/app/actions/create-story.ts` -- calls `runUniqueStoryDirector`, persists accepted/exhausted-shown status + attempt count, returns `uniquenessWarning`
- `src/app/page.tsx` -- holds and clears the warning in state
- `src/components/story/CreateStoryForm.tsx` -- the D-03 in-flight label
- `src/components/story/StoryReview.tsx` -- the D-04 warning banner
- `.env.local.example` -- `MAX_UNIQUENESS_REGENERATION_ATTEMPTS=3`
- `package.json` -- `test:lib` gains the two new test files

## Decisions Made

- **Thresholds kept unchanged (0.75/0.40):** the two A1 fixture pairs validated RESEARCH.md's reasoned starting values exactly as designed --
  - reskin pair (near-identical wording, one word swapped per field): `want=0.846, obstacle=0.833, ending=0.778` -- all clear `HIGH_THRESHOLD=0.75` -> `reject`
  - shared-surface-words pair (girl/forest, genuinely different structure): `want=0.273, obstacle=0.077, ending=0.100` -- all well under `BORDERLINE_THRESHOLD=0.40` -> `pass`
  - No evidence from this plan's fixtures justified moving either threshold.
- **`COMPARISON_MODEL = "gemini-3.8-flash"`** -- the same GA-tier id `generateStory` already falls back to on 403/404. Per Assumption A2, this is a deliberate cost decision: if the cheaper model's true/false judgments prove unreliable in real use, the fix is upgrading this one constant, not a network/pricing change -- the failure mode is judgement quality, not spend.
- **D-03 in-flight label (exact committed wording):** `"Creating your story and making sure it's an original one... this can take a minute"` -- a single fixed sentence covering the whole action (generation + uniqueness check + up to 3 regeneration attempts), since this codebase has no streaming/per-attempt progress channel (03-PATTERNS.md's own finding). This is D-03's message as the architecture can actually deliver it, not an omission of per-attempt "trying again" wording.
- **D-04 exhaustion warning (exact committed wording):** `"This story turned out to be similar to one you've made before. You can use it anyway, or go back and try a different idea."` -- explains what happened, offers using it anyway, offers trying a different idea, reads as neither a refusal nor an error. Contains no story title, id, similarity score, attempt count, or reason code.
- **`compareViaLlm`'s injectable `comparator`/`ledgerPath`:** added specifically so its D-02 AND-of-three logic, blocked-handling, and ceiling-catch behavior are directly unit-testable with a fake comparator and a temp ledger file (`mkdtempSync`), never the real network or the real ledger.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `maxRegenerationAttempts`'s parameter type caused a typecheck failure**
- **Found during:** Task 1, `npm run typecheck` after writing `check.test.ts`
- **Issue:** `maxRegenerationAttempts(env: NodeJS.ProcessEnv = process.env)` required every test-constructed env object to also carry a `NODE_ENV` property (`@types/node`'s `ProcessEnv` interface requires it), which is irrelevant to this function's actual contract.
- **Fix:** Narrowed the parameter type to `Record<string, string | undefined>` -- structurally what the function actually needs, and `process.env` itself satisfies it as the default.
- **Files modified:** `src/core/uniqueness/check.ts`
- **Verification:** `npm run typecheck` passes clean with zero `error TS` lines.
- **Committed in:** `b02fc7e` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug). **Impact on plan:** Necessary for the test suite to typecheck; no scope creep, no new dependency.

## Issues Encountered

- **`npm run lint` fails with a pre-existing, unrelated environment error:** `typescript-eslint does not support TS 7.0` (this project's `typescript` devDependency is pinned to `7.0.2`, ahead of what `eslint-config-next`'s bundled `typescript-eslint` currently supports). **Confirmed pre-existing and unrelated to this plan's changes** by `git stash`-ing every uncommitted Task 3 change and re-running `npm run lint` against the identical failure before those changes existed. This is a devDependency-version incompatibility, not a lint violation in any file this plan touched -- fixing it would mean downgrading/upgrading a package version, which falls outside this plan's scope and outside Rules 1-3's auto-fix boundary (a version change to an unrelated toolchain package, not a bug introduced by this plan's diff). `npm run typecheck` and `npm run build` (the two automated gates lint would otherwise complement) both pass clean. Logged to `.planning/WINDOWS.md` as a lint-warning-category defect for cross-phase visibility.
- **The Task 3 `<human-check>` (live `npm run dev` click-through) could not be performed without violating this plan's own zero-paid-calls budget discipline** -- see coverage item D8's rationale. Verified via direct code inspection instead, mirroring 03-01-SUMMARY.md's identical precedent (its Task 2 tracer-gate human-check was likewise waived for the same reason).

## User Setup Required

None -- no external service configuration required. `MAX_UNIQUENESS_REGENERATION_ATTEMPTS=3` was added to `.env.local.example` with a one-line comment; the default applies automatically if the wife's real `.env.local` never sets it.

## Next Phase Readiness

- The uniqueness gate is fully wired end-to-end at the code level: `createStoryAction` -> `runUniqueStoryDirector` -> deterministic pre-filter -> (borderline only) LLM tie-breaker -> regeneration loop -> persistence with the correct `uniquenessStatus`/`regenerationAttempt` -> D-03/D-04 wording on screen.
- Plan 03-04's real end-to-end proof run has its full $0.0630 headroom intact -- nothing in this plan spent any of it. That run is the first point at which a REAL collision, a REAL regeneration, and a REAL LLM tie-breaker call can be observed together, and where coverage item D8's live visual confirmation should also happen (at no additional cost, since the browser will already be open for the proof run itself).
- **Outstanding:** coverage item D8 (the live in-flight-label/exhaustion-warning visual check) was waived here on budget-preservation grounds, exactly as 03-01's D6 was -- both should be confirmed together at `/gsd-verify-work` time or during plan 03-04's real proof run.
- **Outstanding:** `npm run lint` cannot currently run to completion on this machine due to a pre-existing `typescript`/`typescript-eslint` version mismatch, unrelated to any plan-03 code. Worth a dedicated quick task to pin a compatible `typescript-eslint`/`eslint-config-next` version, separate from this plan's scope.

---
*Phase: 03-persistence-structural-uniqueness*
*Completed: 2026-09-13*

## Self-Check: PASSED

- `src/core/uniqueness/similarity.ts` -- FOUND
- `src/core/uniqueness/similarity.test.ts` -- FOUND
- `src/core/uniqueness/check.ts` -- FOUND
- `src/core/uniqueness/check.test.ts` -- FOUND
- `src/scripts/uniqueness-probe.ts` -- FOUND
- Commit `b02fc7e` -- FOUND in `git log --oneline --all`
- Commit `40df83b` -- FOUND in `git log --oneline --all`
- Commit `34db202` -- FOUND in `git log --oneline --all`
- All plan-level `<verification>` items re-run and passing: `node --test` over all three uniqueness/provider test files (108/108 in the full `test:lib` suite, 0 failures, no network access used); the two A1 fixture pairs produce their expected opposite verdicts in both the unit tests and `node src/scripts/uniqueness-probe.ts` (`UNIQUENESS PROBE: ok`); the regeneration loop provably stops at the configured cap and returns the last candidate; the comparator is invoked zero times on the common path (call-count asserted); `node src/scripts/check-boundaries.ts` exits 0 with all 4 invariants `OK:`; `npm run build` passes clean; `npm run typecheck` passes clean; `storage/_smoketest/spend-ledger.json` total confirmed exactly $2.9370 after the whole plan. `npm run lint` fails on a pre-existing, unrelated environment issue (see Issues Encountered) -- confirmed not caused by this plan's diff.

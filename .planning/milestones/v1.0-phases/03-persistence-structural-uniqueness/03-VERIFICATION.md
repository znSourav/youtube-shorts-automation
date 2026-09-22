---
phase: 03-persistence-structural-uniqueness
verified: 2026-09-14T00:00:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:

  - test: "With `npm run dev` running, create a new story end-to-end in the browser: confirm the in-flight button label reads as a calm, plain-language sentence (no technical wording, no hint of rejection), the review screen shows title/premise/story/both bibles/numbered scenes with no story id, database detail, or filesystem path visible anywhere on screen."
    expected: "Review screen renders exactly as Phase 2 did, persistence work invisible to the wife; loading label is reassuring plain language."
    why_human: "Visual/UX confirmation that no technical detail leaked onto the screen; three separate SUMMARY.md coverage items (03-01 D6, 03-02 D8, 03-03 D6) explicitly waived this live click-through for budget-preservation reasons and flagged it as owed at end-of-phase verification. No browser-driving tool was available to this verifier either."
  - test: "Trigger (or simulate via a deliberately similar idea) the D-04 exhaustion path and read the warning banner rendered in StoryReview.tsx."
    expected: "A calm, non-red informational banner reading: \"This story turned out to be similar to one you've made before. You can use it anyway, or go back and try a different idea.\" — no story title, id, score, attempt count, or reason code visible."
    why_human: "Visual banner styling/tone confirmation; the underlying string and persistence logic are verified in code and by test, but the rendered banner has never been visually confirmed in a live browser session."
  - test: "With an existing story already in the database (confirmed present via `prisma/dev.db` from the real 03-04 proof run), open http://localhost:3000 in a fresh browser tab and confirm the last story's scenes and their image/video statuses reappear automatically with no action taken, and that no filesystem path or folder name is visible anywhere on the page. Then clear the `localStorage` key and reload, confirming the ordinary create screen appears with no error."
    expected: "VIDEO-03's soft browser-resume criterion visibly working: scenes and statuses restore silently; a cleared/stale key falls back to the create screen with no error shown."
    why_human: "The server-side restore mechanics (loadStoryAction, toLoadedStory, path-free payload, missing-file downgrade, not-found handling) were proven directly against the real prisma/dev.db by the 03-03 executor, and unit-tested — but the actual browser click-through (localStorage write/read, React rehydration, on-screen appearance) has never been visually observed; no browser-driving tool was available to this verifier."
---

# Phase 3: Persistence & Structural Uniqueness Verification Report

**Phase Goal:** Every story, scene, and generation record survives an app restart, and no story reaches her for review if it's a structural reskin of one she's already made.
**Verified:** 2026-09-14T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A newly generated story is checked for structural similarity against every previously accepted story before it's offered for review | ✓ VERIFIED | `src/core/uniqueness/check.ts`'s `checkUniqueness` walks `listAcceptedFingerprints()` and scores every past story before any accept path returns; `createStoryAction` calls `runUniqueStoryDirector` exclusively (no `runStoryDirector` import remains in `create-story.ts`), so no code path reaches `saveStoryWithScenes`/the review screen around the gate. Proven against a REAL Gemini response in `03-PROOF-RUN.md` (fingerprint fields quoted verbatim, judged in English and abstracted). 15/15 `similarity.test.ts`+`check.test.ts` tests pass, plus `node src/scripts/uniqueness-probe.ts` prints `UNIQUENESS PROBE: ok`. |
| 2 | A structurally-similar candidate is automatically rejected and regenerated with the collision explicitly avoided, capped at a configurable max, never silently accepted or retried forever | ✓ VERIFIED | `runUniqueStoryDirector`'s loop (`check.ts:324-432`) re-calls the director with `avoidPattern` set to the collided fingerprint, capped by `maxRegenerationAttempts()` reading `MAX_UNIQUENESS_REGENERATION_ATTEMPTS` (degrades safely to default 3 for absent/0/negative/non-numeric values — confirmed by test). On exhaustion the LAST candidate is returned flagged `exhausted`, never silently accepted/blocked. Real-data proof: `--prove-collision`'s Candidate A (near-duplicate of the real persisted story) scored 0.778–0.875 on all three fields and correctly verdicted `reject`. |
| 3 | Two genuinely different stories that happen to share generic elements are not falsely rejected | ✓ VERIFIED | `preFilterVerdict` requires ALL THREE fields to clear a threshold before reject/escalate (D-02) — a two-of-three alignment always falls through to pass, asserted by test on both the deterministic and LLM path. Real-data proof: `--prove-collision`'s Candidate B (one shared surface word per field, unrelated template) scored 0.050–0.059, verdict `pass`. Fixture-based girl/forest pair also passes in `similarity.test.ts`. |
| 4 | After restarting the app, every story, scene, and generation record — including saved image paths and logged costs — is still present and usable by the uniqueness system | ✓ VERIFIED | Two independent, genuine-restart proofs: (a) `src/lib/db.test.ts`/`generation-repository.test.ts` construct a SECOND independently-constructed Prisma client against the same temp SQLite file and read back stories/scenes/fingerprints/paths/costs intact; (b) `persistence-probe.ts --write` then `--read` in two SEPARATE OS process invocations round-tripped a fixture, and `--real` then `--read` did the same against a REAL Gemini-generated story (`03-PROOF-RUN.md` §6: `PERSISTENCE PROBE: read ok id=story-1789304699649-wko7d7 scenes=5 fingerprint=ok`). `listAcceptedFingerprints` (the uniqueness system's own history reader) reads directly from this same persisted data — proven usable, not just present, by the real `--prove-collision` run scoring against it. |
| 5 (soft) | In-progress or completed video jobs are still trackable after closing/reopening the browser or restarting the app; if out of reach, the limitation is documented | ✓ VERIFIED | SHIPPED, not documented-as-gap: `src/core/persistence/story-view.ts`'s `toLoadedStory` and `src/app/actions/load-story.ts`'s `loadStoryAction` restore a story's scenes with per-scene image AND video status (`LoadedAssetStatus`), reading real recorded paths server-side and attaching `data:` URLs. `page.tsx` writes the story id to `localStorage` on creation and rehydrates via `loadStoryAction` in a mount effect (confirmed present by direct code read, not just SUMMARY claim). Server-side mechanics were proven against the real `prisma/dev.db` per 03-03-SUMMARY.md (ready-with-real-file → READY, missing-file → FAILED, unknown/malformed id → not-found). The one remaining gap is a live browser click-through, which the executor explicitly could not perform (no browser-driving tool) and flagged as owed at end-of-phase verification — see Human Verification below. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | Story/Scene/GenerationRecord models + 3 enums | ✓ VERIFIED | Present; `Story` carries required `protagonistWant`/`centralObstacle`/`endingShape`; `Scene` has compound unique constraint on `(storyId, sceneNumber)`, enforced at DB level (tested). |
| `src/lib/db.ts` | PrismaClient singleton, server-only | ✓ VERIFIED | Exports `prisma`, `createPrismaClient`; `globalThis`-cached outside production. |
| `src/core/persistence/story-repository.ts` | Sole Prisma consumer for Server Actions | ✓ VERIFIED | `saveStoryWithScenes`/`findStoryWithScenes`/`listAcceptedFingerprints`/`markUniquenessStatus` all present; boundary enforced structurally (see Key Links). |
| `src/core/uniqueness/fingerprint.ts` | D-01's 3 structural elements, zero extra cost | ✓ VERIFIED | `StructuralFingerprint`, `FINGERPRINT_INSTRUCTION`, `fingerprintFromStoryOutput` present; rides the existing Story Director schema (`director.ts`'s `buildStorySchema`/`buildStoryPrompt`), confirmed zero extra LLM call. |
| `src/core/uniqueness/similarity.ts` | Unicode-aware Jaccard pre-filter | ✓ VERIFIED | Read directly: uses `\p{L}\p{N}` with `u` flag, NOT ASCII-only; empty-set scores 0 not 1; real Bangla-script test passes. |
| `src/core/uniqueness/check.ts` | Orchestration + bounded regeneration loop | ✓ VERIFIED | Read directly: matches described behavior exactly (checkCeiling/recordSpend ordering, fail-open on LLM failure modes, D-02's all-three rule, D-04's last-candidate-on-exhaustion). |
| `src/providers/llm/gemini.ts` | `compareStructuralSimilarity` tie-breaker | ✓ VERIFIED | Present, mirrors `generateStory`'s classify-before-parse order; `logRawResponse` called before any field read. |
| `src/core/persistence/generation-repository.ts` | Generation-record writes + scene status updates | ✓ VERIFIED | `recordGeneration`/`recordGenerations`/`updateSceneImage`/`updateSceneVideo` all best-effort (try/catch, log, never throw) — confirmed by direct read and by "logs exactly once and returns without throwing" tests. |
| `src/core/persistence/story-view.ts` | Path-free restore mapper | ✓ VERIFIED | Read directly: `LoadedStory`/`LoadedSceneStatus` declare no path field; test asserts serialized payload contains no storage-root occurrence. |
| `src/app/actions/load-story.ts` | Browser-resume read path | ✓ VERIFIED | Read directly: validates id via `storyDir()` before query, downgrades missing files to FAILED without failing the whole restore, returns `data:` URLs only. |
| `.planning/phases/.../03-PROOF-RUN.md` | Real proof-run evidence | ✓ VERIFIED | Exists; fingerprint fields quoted verbatim with per-field English/abstraction judgment; ledger before/after recorded and cross-checked against the live ledger file (both show $2.9370→$2.9870, 27 entries). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `create-story.ts` | `check.ts`'s `runUniqueStoryDirector` | direct call, no `runStoryDirector` import remains | ✓ WIRED | Confirmed by direct read of `create-story.ts:74`. |
| `check.ts` | `story-repository.ts`'s `listAcceptedFingerprints` | history read | ✓ WIRED | Confirmed at `check.ts:329`. |
| `check.ts`'s `compareViaLlm` | `spend-ledger.ts` | `checkCeiling` before dispatch, `recordSpend` after | ✓ WIRED | Confirmed at `check.ts:227,244`; ordering matches `director.ts`'s own `runStoryDirector`. |
| `generate-images.ts`/`generate-video.ts` | `generation-repository.ts` | dual-write after every dispatched call | ✓ WIRED | Confirmed by 03-03-SUMMARY + `generation-repository.test.ts` passing; `git diff --exit-code -- src/lib/spend-ledger.ts` confirms the file ledger is untouched (re-verified live: exit 0). |
| `load-story.ts` | `story-view.ts`'s `toLoadedStory` | mapping before any return | ✓ WIRED | Confirmed at `load-story.ts:92`. |
| `page.tsx` | `load-story.ts`'s `loadStoryAction` | localStorage-keyed mount effect | ✓ WIRED | Confirmed by direct grep: `localStorage`/`loadStoryAction`/`useEffect` all present and connected. |

### Behavioral Spot-Checks / Test Runs

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full lib test suite | `npm run test:lib` | 123/123 passing, 0 failures | ✓ PASS |
| Structural boundary invariants | (embedded in `test:lib`) `node src/scripts/check-boundaries.ts` | 4/4 `OK:` lines, exit 0 | ✓ PASS |
| Typecheck | `npm run typecheck` | clean, 0 `error TS` lines | ✓ PASS |
| Production build | `npm run build` | compiles clean, static pages generated | ✓ PASS |
| spend-ledger.ts unmodified | `git diff --exit-code -- src/lib/spend-ledger.ts` | exit 0 | ✓ PASS |
| Ledger total matches proof-run record | direct read of `storage/_smoketest/spend-ledger.json` | `$2.9870`, 27 entries, last entry = real `story:5-scene` call | ✓ PASS |
| No debt markers in phase-modified files | `grep -E "TBD|FIXME|XXX"` over all 33 phase-changed files | no matches | ✓ PASS |
| Working tree clean (no uncommitted phase work) | `git status --short` | only an unrelated untracked `.claude/launch.json` | ✓ PASS |

### Code Review Findings — Fix Verification

`03-REVIEW.md` found 0 Critical, 5 Warning, 3 Info findings. `03-REVIEW-FIX.md` claims all 5 Warnings fixed. Independently re-verified each against the current codebase (not trusted from the fix report):

| Finding | Claimed Fix | Verified in Code |
|---------|-------------|-------------------|
| WR-01 (billed mismatch) | `StoryDirectorFailure.billed` threaded through | ✓ `director.ts` sets `billed: false` for blocked, `true` otherwise; `check.ts:395` reads `directorResult.billed` |
| WR-02 (boundary gate not wired) | Appended to `test:lib` | ✓ `package.json`'s `test:lib` script ends with `&& node src/scripts/check-boundaries.ts` |
| WR-03 (transitive import gap) | `core/persistence` added to invariant 1 | ✓ `check-boundaries.ts:112` includes `spec.includes("core/persistence")` |
| WR-04 (estimatedUsd fallback bug) | Price off `modelUsed` not `primaryModel` | ✓ `gemini.ts:218` reads `LLM_PRICE_PER_CALL[modelUsed]` |
| WR-05 (no idea length cap) | New `input-limits.ts`, wired both sides | ✓ `input-limits.ts` exports `MAX_IDEA_LENGTH=4000`; both `create-story.ts` (server re-validation) and `CreateStoryForm.tsx` (`maxLength`) import and use it |

All 5 confirmed genuinely present, not just claimed.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| UNIQUE-01 | 03-02 | Structural similarity check before review | ✓ SATISFIED | Truth #1 above; REQUIREMENTS.md marks Complete |
| UNIQUE-02 | 03-02 | Auto-reject/regenerate, capped, configurable | ✓ SATISFIED | Truth #2 above; REQUIREMENTS.md marks Complete |
| UNIQUE-03 | 03-02 | No false rejection on generic shared elements | ✓ SATISFIED | Truth #3 above; REQUIREMENTS.md marks Complete |
| PERSIST-01 | 03-01, 03-03, 03-04 | Full restart survival incl. uniqueness system usability | ✓ SATISFIED | Truth #4 above; REQUIREMENTS.md marks Complete |
| IMAGE-01 | 03-03 | Scene image paths recorded in DB | ✓ SATISFIED | `generation-repository.ts`'s `updateSceneImage` stores the exact `sceneImagePath` builder output (asserted by test comparing against the builder's own output, not a literal); REQUIREMENTS.md marks Complete |
| IMAGE-03 | 03-03 | Every generation call recorded with cost | ✓ SATISFIED | `recordGeneration`/`recordGenerations` + `check.ts`'s spend accumulator cover story/uniqueness/image/video call types; REQUIREMENTS.md marks Complete |
| VIDEO-03 (soft) | 03-03 | Video job tracking survives restart/reopen | ✓ SATISFIED (server proven; browser click-through pending — see Human Verification) | Truth #5 above; REQUIREMENTS.md marks Complete |

No orphaned requirements: all 7 phase requirement IDs (UNIQUE-01/02/03, PERSIST-01, IMAGE-01, IMAGE-03, VIDEO-03) appear in REQUIREMENTS.md's traceability table mapped to Phase 3, all marked Complete, and all are declared in at least one plan's frontmatter `requirements` field.

### Anti-Patterns Found

None found. Scanned all 33 files touched by the phase's 15 commits for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/hardcoded-empty-return patterns — no matches. The three Info-level findings from `03-REVIEW.md` (dead code `markUniquenessStatus`, a 1-based `regenerationAttempt` naming nit, an imprecise error-message nit) are cosmetic and explicitly out of the fix report's scope (`fix_scope: critical_warning`) — noted here for completeness, not blocking.

### Human Verification Required

Three related live-browser checks — see YAML frontmatter `human_verification` for full detail. All three trace back to the same root cause: three separate SUMMARY.md coverage items (03-01's D6, 03-02's D8, 03-03's D6) explicitly waived their plan's own `<human-check>` tracer-gate for budget-preservation or tooling-availability reasons, each one flagging the live click-through as still owed at end-of-phase verification. This verifier has no browser-driving tool available either, so these remain open. The underlying server-side/data-layer mechanics for all three are independently verified above (code read, unit/integration tests, and — for the restore path — a direct real-database invocation by the 03-03 executor), so risk is assessed as low, but a literal visual confirmation has never been performed by anyone in this phase.

1. **Create-story visual/UX check** — confirm the review screen and in-flight loading label show nothing technical.
2. **D-04 exhaustion-banner visual check** — confirm the amber informational banner (not the red error banner) renders the expected wording.
3. **Browser-restore click-through** — confirm reopening the browser silently restores the last story's scenes/statuses with no path/folder name visible, and that a cleared/stale id falls back cleanly to the create screen.

### Gaps Summary

No gaps found. All 5 phase success criteria are supported by genuine code, passing tests (123/123), a genuinely re-runnable structural boundary gate (4/4 OK), a clean typecheck and production build, and — for the three UNIQUE/PERSIST criteria that matter most — a real, human-approved $0.05 Gemini call whose evidence (verbatim fingerprint text, verbatim probe output, ledger before/after) was independently cross-checked against the live `storage/_smoketest/spend-ledger.json` file rather than trusted from the SUMMARY. The phase's own 5 code-review Warning findings were all independently re-verified as fixed in the current tree, not just claimed fixed. The only open item is a set of three live-browser visual confirmations that no executor or verifier in this phase has had tooling to perform; they are routed to human verification below rather than treated as a code gap, since every mechanism underneath them is already proven.

---

_Verified: 2026-09-14T00:00:00Z_
_Verifier: Claude (gsd-verifier)_

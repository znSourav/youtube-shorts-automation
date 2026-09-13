---
phase: 03-persistence-structural-uniqueness
plan: 04
subsystem: uniqueness
tags: [real-proof-run, structural-fingerprint, gemini, jaccard-similarity, spend-ledger]

# Dependency graph
requires:
  - phase: 03-persistence-structural-uniqueness
    provides: "03-01's persistence layer and fingerprint fields, 03-02's similarity pre-filter and regeneration loop, 03-03's generation-record durability -- this plan spends the phase's one remaining real call to prove all three against real generated data"
provides:
  - "Observed (not assumed) evidence that D-01's three structural fingerprint fields ride the real Story Director call in English and abstracted, at zero extra cost"
  - "PERSIST-01 proven against real generated data via a genuine two-process restart"
  - "UNIQUE-01/UNIQUE-03 proven against real generated data via a zero-cost, deterministically-derived collision proof"
  - "src/scripts/uniqueness-probe.ts --prove-collision -- reusable for any future real story without further spend"
  - "src/scripts/persistence-probe.ts --real D-05 fixture-cleanup + last-story-id tracking, reusable for future real proof runs"
affects: [phase-04-story-library]

# Actuals (#2632)
actuals:
  tokens: 8400
  tasks: 2
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mechanically-derived collision-proof candidates (word-drop-and-reverse for a near-duplicate, extracted-word-in-a-fixed-template for shared-surface-words) instead of hand-written fixture text -- deterministic, repeatable, and reusable against any future real accepted story with zero additional cost"
    - "A small gitignored marker file (persistence-probe-last-id.txt) carries a story id across separate node process invocations of the same CLI probe, the same throwaway-state convention spend-ledger.ts's own segregated storage/_smoketest/ path already established"

key-files:
  created:
    - .planning/phases/03-persistence-structural-uniqueness/03-PROOF-RUN.md
  modified:
    - src/scripts/persistence-probe.ts
    - src/scripts/uniqueness-probe.ts
    - .gitignore
    - storage/_smoketest/spend-ledger.json

key-decisions:
  - "Task 1's checkpoint was answered 'Approve the $0.05 run now' -- the plan's own 'approve' option, selected by a human, not auto-approved (gate=\"blocking-human\" per the plan's own frontmatter)."
  - "The real story idea used was an elderly postman delivering a decades-old undelivered letter -- a fourth premise genuinely unrelated to Phase 2's boy/kite, girl/bangle, and fisherman/paper-boat stories in protagonist, setting, central object, and emotional arc."
  - "Collision-proof candidates are derived mechanically (word-drop-and-reverse; extracted-word-in-fixed-template) rather than hand-written, so --prove-collision is deterministic, repeatable, and reusable against any future real story at zero cost."

patterns-established:
  - "A CLI probe's D-05-style fixture cleanup lives inside the mode that needs it (--real), not as a separate manual step -- the same self-contained-probe convention persistence-probe.ts already used for --write's own re-runnability."

requirements-completed: [UNIQUE-01, UNIQUE-03, PERSIST-01]

coverage:
  - id: D1
    description: "Exactly one real paid provider call dispatched by this entire plan, at the estimated $0.0500, only after a human explicitly approved it against the $0.0630 remaining headroom"
    requirement: "PERSIST-01"
    verification:
      - kind: other
        ref: "storage/_smoketest/spend-ledger.json -- exactly one new entry (story:5-scene, $0.05), total moved from $2.9370 to $2.9870"
        status: pass
      - kind: manual_procedural
        ref: "Task 1's checkpoint recorded verbatim in this SUMMARY and 03-PROOF-RUN.md; no call dispatched before it was answered"
        status: pass
    human_judgment: false
  - id: D2
    description: "A real Gemini-generated story comes back carrying all three D-01 structural elements populated, in English, abstracted enough to compare"
    requirement: "PERSIST-01"
    verification:
      - kind: other
        ref: "03-PROOF-RUN.md section 5 -- all three fingerprint fields quoted verbatim, judged in English and abstracted per field"
        status: pass
    human_judgment: true
    rationale: "Whether abstracted, noun-free English phrasing genuinely captures D-01's three elements (rather than merely satisfying the non-null schema constraint) is a judgment call no script can make -- the plan's own <human-check> requires a human to read the three quoted fields and the two collision candidates and confirm the verdicts read as correct judgements, not merely arithmetic that happened to land right."
  - id: D3
    description: "That real story, its scenes, and its fingerprint are persisted and readable by a separate process afterwards"
    requirement: "PERSIST-01"
    verification:
      - kind: manual_procedural
        ref: "node --env-file=.env.local src/scripts/persistence-probe.ts --read (separate OS process from --real) -- PERSISTENCE PROBE: read ok id=story-1789304699649-wko7d7 scenes=5 fingerprint=ok numbers=1, 2, 3, 4, 5"
        status: pass
    human_judgment: false
  - id: D4
    description: "A near-duplicate of the real story's own structure is rejected by the uniqueness gate, and a candidate sharing only its surface nouns is not -- both proven against the real persisted row at $0.00 additional cost"
    requirement: "UNIQUE-01"
    verification:
      - kind: other
        ref: "node --env-file=.env.local src/scripts/uniqueness-probe.ts --prove-collision -- candidate A (near-duplicate) verdict=reject, candidate B (shared-surface-words) verdict=pass, UNIQUENESS PROBE: collision proof ok, exit 0"
        status: pass
    human_judgment: true
    rationale: "The plan's <human-check> requires confirming the two collision-proof verdicts read as correct judgements about the specific derived texts, not merely favorable arithmetic -- see 03-PROOF-RUN.md section 7."
  - id: D5
    description: "The probe's own synthetic fixture story never contaminates the accepted history the real candidate is compared against (D-05/T-03-23)"
    verification:
      - kind: other
        ref: "persistence-probe.ts --real now deletes the story-probe-persistence fixture row and its children before dispatch; confirmed via direct DB query that only the fixture existed pre-dispatch and the real story's regenerationAttempt=1 (no collision, consistent with an empty history at check time)"
        status: pass
    human_judgment: false
  - id: D6
    description: "spend-ledger.ts remains byte-for-byte unmodified and DEV_CEILING_USD was never raised"
    verification:
      - kind: other
        ref: "git diff --exit-code -- src/lib/spend-ledger.ts (exit 0)"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-09-13
status: complete
---

# Phase 3 Plan 04: Real Proof-Run — Fingerprint, Persistence, and Collision Proof Summary

**Spent the phase's single remaining $0.05 of dev-ceiling headroom on one real Story Director call (a fourth, unrelated postman/undelivered-letter idea), which came back with all three D-01 structural fingerprint fields genuinely in English and abstracted, persisted and survived a real two-process restart, and derived two zero-cost collision-proof candidates from it via a new `--prove-collision` probe mode — confirming 03-RESEARCH.md's zero-extra-cost fingerprint bet against real data for the first time.**

## Performance

- **Duration:** ~35 min
- **Started:** ~2026-09-13T12:33Z (approx)
- **Completed:** 2026-09-13T13:08:14Z
- **Tasks:** 2 (1 checkpoint, 1 auto)
- **Files created:** 1
- **Files modified:** 4

## Accomplishments

- **Task 1's checkpoint was approved by a human**, verbatim: "Approve the $0.05 run now" — the plan's own `approve` option. Recorded here and in `03-PROOF-RUN.md`. No call was dispatched before this response.
- **`src/scripts/persistence-probe.ts`'s `--real` mode now deletes the fixture probe row first (D-05/T-03-23)** — the synthetic `story-probe-persistence` row and its children are removed before any dispatch, so the real candidate is compared against a genuinely empty (or genuinely real) accepted history, never a hand-written fixture.
- **Dispatched exactly one real Story Director call**, run exactly once with no retry, for a genuinely fourth story idea (an elderly postman finally delivering a decades-old undelivered letter) — unrelated to Phase 2's boy/kite, girl/bangle, and fisherman/paper-boat stories in protagonist, setting, central object, and emotional arc alike.
- **The fingerprint bet holds against real data**: `protagonist_want`, `central_obstacle`, and `ending_shape` all came back in English, fully abstracted (no character name, species, object, or setting noun), while the rest of the story (title, premise, theme, emotional arc, ending, scene purposes) correctly stayed in the submitted Banglish — the narrow `FINGERPRINT_INSTRUCTION` do-not-translate exception held exactly as designed on a real response, observed for the first time this phase.
- **PERSIST-01 proven against real generated data**: a genuinely separate `node` process read the story, its 5 scenes (numbered 1–5, no gaps/duplicates), and all three fingerprint columns back intact.
- **`src/scripts/uniqueness-probe.ts` gains `--prove-collision`**, dispatching nothing: it derives two candidates mechanically from the real accepted history — a structural near-duplicate (word-drop-and-reverse, same token content) that the pre-filter correctly rejected, and a shared-surface-words-only candidate (one real word per field, extracted mechanically, placed in a fixed unrelated racing-story template) that correctly passed. Both proofs ran at $0.00 additional cost.
- **The ledger moved from $2.9370 to exactly $2.9870** — one new entry, no more. `spend-ledger.ts` itself is untouched (`git diff --exit-code` confirmed), and `DEV_CEILING_USD` was never raised.
- **`03-PROOF-RUN.md` records everything verbatim**: the checkpoint response, the idea used, the full raw-response console log, real `usageMetadata` recovered from the ledger entry itself, all three fingerprint fields quoted with a per-field English/abstraction judgment, persistence proof, both collision candidates with scores/verdicts, and Assumption A1's 0.75/0.40 thresholds assessed against real data (Candidate A landed on `reject`, not `escalate` — the pre-filter alone caught it with zero LLM calls, no evidence to move either threshold).

## Task Commits

1. **Task 1: Approve the single $0.05 real proof run against the remaining $0.0630 of headroom** — checkpoint only, no code; approval recorded above and in `03-PROOF-RUN.md`.
2. **Task 2: Run it once, derive the free proofs from it, and write down exactly what happened** — `01d167d` (feat)

**Plan metadata:** committed alongside this SUMMARY

## Files Created/Modified

- `.planning/phases/03-persistence-structural-uniqueness/03-PROOF-RUN.md` — full verbatim evidence document, modelled on `02-PROOF-RUN.md`
- `src/scripts/persistence-probe.ts` — `--real` now deletes the fixture row first (D-05), uses a genuinely fourth story idea, and records the resulting story id to a small gitignored marker file (`storage/_smoketest/persistence-probe-last-id.txt`) so a subsequent `--read` (run in a separate process, no `--id` given) reads the real story rather than the fixture; `--read` also gains an explicit `--id=<storyId>` flag
- `src/scripts/uniqueness-probe.ts` — new `--prove-collision` mode: reads the real accepted history, mechanically derives a near-duplicate candidate and a shared-surface-words candidate, scores and classifies both, prints `UNIQUENESS PROBE: collision proof ok`/`unexpected`
- `.gitignore` — added `storage/_smoketest/*.txt` so the new marker file never needs manual staging/ignoring
- `storage/_smoketest/spend-ledger.json` — the real ledger entry this run added

## Decisions Made

- **Task 1 approval (verbatim):** "Approve the $0.05 run now" — the plan's own `approve` option. This was a human decision on a `gate="blocking-human"` checkpoint, never auto-approved regardless of mode.
- **Story idea (verbatim, Banglish):** "Ekjon briddho postman tar chithir bag-e onek bochorer purono ekta na-deya chithi khuje pay, ebong seta thik thikanay pouche debar jonno gramer pothe rowna dey." — a fourth, unrelated premise (elderly postman, undelivered letter, belated-duty-and-closure arc), distinct from all three of Phase 2's real dev-test stories.
- **Collision-proof candidates are derived mechanically, not hand-written** — Candidate A (near-duplicate): drop every 5th word by index, reverse the remainder (same token set, no scoring effect from the reversal since `jaccardSimilarity` is set-based). Candidate B (shared-surface-words): extract the first content word (>4 chars) from each real fingerprint field and place it inside a fixed, structurally unrelated racing-competition template held as a script constant. This makes `--prove-collision` deterministic, repeatable, and reusable against any future real story at zero cost, rather than depending on fixture text someone has to keep hand-authoring.
- **Kept RESEARCH.md Assumption A1's 0.75/0.40 thresholds unchanged** — the real near-duplicate candidate scored 0.778–0.875 across all three fields, comfortably clearing 0.75 and landing on `reject` directly (not `escalate`), meaning the deterministic pre-filter caught it with zero LLM calls. No evidence from this real-data run justified moving either threshold, consistent with 03-02-SUMMARY.md's own fixture-based finding.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `--read`'s fixed target id would have read the wrong story after `--real`**
- **Found during:** Task 2, while designing how a `--read` invocation (per the plan's own `<verify>` block, called with no `--id` argument) could possibly read back the story `--real` had just created in a SEPARATE process invocation, when `--read` was hardcoded to the fixture's `PROBE_STORY_ID`.
- **Issue:** The plan's own automated verification runs `--real` then `--read` as two separate commands with no id passed between them, but the pre-existing `--read` implementation always read the fixed fixture id. Without a fix, `--read` would have reported the FIXTURE row (which `--real` now deletes before dispatch) rather than proving persistence of the REAL story, silently failing to satisfy PERSIST-01's real-data proof — the entire point of this plan.
- **Fix:** Added a small gitignored marker file (`storage/_smoketest/persistence-probe-last-id.txt`) that both `--write` and `--real` write their resulting story id to; `--read` reads from it when no explicit `--id=<storyId>` flag is given, falling back to the fixture id only if neither mode has ever run. This preserves 03-01's existing `--write` → `--read` two-process PERSIST-01 test exactly as before, while also making `--real` → `--read` work correctly.
- **Files modified:** `src/scripts/persistence-probe.ts`, `.gitignore`
- **Verification:** Ran `--real` then `--read` as two separate `node` process invocations; `--read` correctly reported the real story's id, scenes, and intact fingerprint columns.
- **Committed in:** `01d167d` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking). **Impact on plan:** Necessary for the plan's own stated verification sequence (`--real` then bare `--read`) to actually prove what it claims to prove; no scope creep, no new dependency.

## Issues Encountered

None. The real call succeeded cleanly on the first and only attempt — no block, no ceiling refusal, no non-English or proper-noun-bearing fingerprint field. See `03-PROOF-RUN.md` section 10.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **03-RESEARCH.md's zero-extra-cost fingerprint bet is now observed, not assumed** — the phase's central architectural risk closed with real evidence.
- **PERSIST-01, UNIQUE-01, and UNIQUE-03 all close with real-data evidence**: real restart-survival, real near-duplicate rejection, real shared-surface-words pass.
- **The phase spent exactly $0.05 as budgeted**, with explicit prior human consent on record — total ledger now $2.9870 of $3.00.
- **Remaining `DEV_CEILING_USD` headroom is $0.0130** — below the cost of any further real call in any category (story/image/video). Phase 4 will need this same explicit-consent conversation reopened before any further real paid probing against this same ledger; this plan does not settle that, only records that Phase 3 closes with real evidence rather than a documented gap.
- **Outstanding from prior plans, still unresolved and out of this plan's scope**: `npm run lint`'s pre-existing `typescript`/`typescript-eslint` version mismatch (documented in `03-02-SUMMARY.md` and `WINDOWS.md`); the live browser click-through checks waived in 03-01/03-02/03-03 for budget-preservation reasons remain owed at end-of-phase/`gsd-verify-work` — this plan's own `--prove-collision`/`--real`/`--read` runs were CLI-only, not a browser session, so they do not themselves close those waivers, though the underlying persistence/fingerprint/uniqueness code paths they waived on are now proven against real data by this plan.

---
*Phase: 03-persistence-structural-uniqueness*
*Completed: 2026-09-13*

## Self-Check: PASSED

- `.planning/phases/03-persistence-structural-uniqueness/03-PROOF-RUN.md` — FOUND
- `src/scripts/persistence-probe.ts` — FOUND, contains `--prove-collision`-adjacent D-05 cleanup and `LAST_STORY_ID_PATH` logic
- `src/scripts/uniqueness-probe.ts` — FOUND, contains `--prove-collision`
- Commit `01d167d` — FOUND in `git log --oneline --all`
- All plan-level `<verification>` items re-run and passing: pre-run ledger check (`LEDGER BEFORE 2.9370`), `persistence-probe.ts --real` (exit 0, `PERSISTENCE PROBE: real ok`, all three fingerprint values non-empty), `persistence-probe.ts --read` in a separate process (exit 0, `PERSISTENCE PROBE: read ok`, `fingerprint=ok`), `uniqueness-probe.ts --prove-collision` (exit 0, `UNIQUENESS PROBE: collision proof ok`, two candidate lines printed), post-run ledger check (`LEDGER AFTER 2.9870 entries=27`, no `OVERSPEND`), `git diff --exit-code -- src/lib/spend-ledger.ts` (exit 0), `npm run test:lib` (123/123 passing), `npm run build` (clean), `node src/scripts/check-boundaries.ts` (4/4 `OK:` lines).

---
phase: 01-provider-smoke-test
plan: 04
subsystem: providers
tags: [gemini, veo, image-generation, video-generation, safety-filter, spend-ledger, real-api-calls, cost-reconciliation]

# Dependency graph
requires:
  - phase: 01-provider-smoke-test (plan 03)
    provides: "src/providers/image/gemini-image.ts (generateImage), src/providers/video/veo.ts (generateVideo), src/scripts/smoke-test.ts (generic probe, --image-only, childscene stub), real per-call response shapes"
provides:
  - "D-01's second (representative, safety-probing) generation: real paid child-protagonist probe, classified PASS on both image and video — Gemini/Veo did NOT false-positive on wholesome children's-story content"
  - "generateImage() style field (D-02) composed into the prompt, ready for Phase 2's real style-preset system to build on"
  - "--report CLI mode: cost reconciliation with zero paid calls and zero required GEMINI_API_KEY"
  - "Empirical price-reconciliation finding: neither price constant can be independently re-derived from provider usageMetadata (both left UNRESOLVED, unchanged)"
affects: []

actuals:
  tokens: 4036
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Retry-through-the-gate pattern: dispatchChildVideo() is the single dispatch point for both the first Veo attempt and its one allowed retry, so checkCeiling() is structurally impossible to skip on the retry path (D-04, T-01-02)"
    - "Classified-block-is-success reporting: unlike the generic probe (where any block is a bug to investigate), the childscene probe treats a classified block as the probe's valid, reportable outcome — this run happened to classify PASS on both calls"
    - "--report as a read-only reconciliation mode: reads the ledger, makes no SDK calls, requires no API key — verified by running it before, and again after, the real paid calls in this plan without ever setting GEMINI_API_KEY"

key-files:
  created: []
  modified:
    - src/providers/image/gemini-image.ts
    - src/scripts/smoke-test.ts
    - storage/_smoketest/spend-ledger.json

key-decisions:
  - "Style is composed into the prompt as a single prefixed sentence (\"${style} style. ${prompt}\"), not a preset registry — Phase 2 owns the real six-preset Style Bible system per CONTEXT.md Deferred Ideas; building more here would be scope creep this plan explicitly disclaims."
  - "Both price constants (IMAGE_PRICE_PER_CALL, VIDEO_PRICE_PER_SECOND) were left UNCHANGED in code. Per Task 2's explicit instruction not to invent a reconciliation: neither provider's usageMetadata carries a publishable per-token or per-second dollar rate to independently re-derive the flat pricing-page figures against, so both are reported UNRESOLVED (not CONFIRMED, not CORRECTED) with the raw evidence attached — see Price Reconciliation below."
  - "The image and video call ids for this plan's probe reuse the plan-specified literal strings childscene-image / childscene-video in the ledger, matching Task 2's automated ledger-integrity check."

patterns-established:
  - "Pattern: when a plan's optional retry logic and its unconditional CLI-mode addition are authored in one edit pass on the same file, note the commit-granularity deviation explicitly in the SUMMARY rather than silently presenting them as if they were two atomic task commits — see Deviations below."

requirements-completed: []  # Phase 1 carries no requirement IDs by design (technical spike) — see PLAN.md frontmatter note.

coverage:
  - id: D1
    description: "D-01's second, representative generation ran as a distinct probe on real product-shaped content (Soft hand-painted 2D style, child-protagonist garden scene) and its outcome is recorded with the provider's own classification fields (ROADMAP SC-4)"
    verification:
      - kind: integration
        ref: "node --env-file=.env.local src/scripts/smoke-test.ts --probe=childscene (real paid call)"
        status: pass
      - kind: unit
        ref: "inline node -e CHILD PROBE outcome-line check (PLAN.md Task 1 <verify>) -> CHILD PROBE OUTCOME: PASS png=1194252B mp4=4189540B"
        status: pass
    human_judgment: true
    rationale: "01-VALIDATION.md classifies distinguishing a real content-policy block from the documented non-deterministic RAI false positive as manual-only judgment. This run classified PASS on both calls (no block occurred), so the retry-judgment scenario wasn't exercised, but the plan's own human-check (viewing the image, playing the video) is still recorded here for the end-of-phase UAT batch."
  - id: D2
    description: "A Veo block, had one occurred, would be retried exactly once through the same checkCeiling() gate as a first attempt (D-04) — implemented via a single dispatch helper, not exercised this run since no block occurred"
    verification:
      - kind: static
        ref: "src/scripts/smoke-test.ts: dispatchChildVideo() is the only call site for generateVideo() in the childscene path, invoked identically for the first attempt and the retry, each preceded by checkCeiling()"
        status: pass
    human_judgment: false
  - id: D3
    description: "Price constants (IMAGE_PRICE_PER_CALL, VIDEO_PRICE_PER_SECOND) are reconciled against observed usageMetadata via a --report mode that makes no paid calls (ROADMAP SC-3)"
    verification:
      - kind: integration
        ref: "node src/scripts/smoke-test.ts --report (no GEMINI_API_KEY set, no network call) -> TOTAL LEDGER $0.8010, REMAINING HEADROOM $2.1990"
        status: pass
      - kind: unit
        ref: "inline node -e ledger-integrity check (PLAN.md Task 2 <verify>) -> LEDGER OK entries=5 total=$0.8010 headroom=$2.1990"
        status: pass
    human_judgment: false
  - id: D4
    description: "The phase's cumulative ledger total stays at or below the $3.00 D-05 ceiling after this plan's two real calls"
    verification:
      - kind: unit
        ref: "spend-ledger.json entries sum to $0.8010 (5 entries: generic-image x2, generic-video, childscene-image, childscene-video)"
        status: pass
    human_judgment: false

duration: ~15min active execution (real API calls + verification + reconciliation)
completed: 2026-09-12
status: complete
---

# Phase 1 Plan 4: D-01 Representative Safety Probe + Cost Reconciliation Summary

**D-01's second, representative generation — a child-protagonist "Soft hand-painted 2D" garden scene — passed Gemini's and Veo's safety filters cleanly on the first attempt (no block, no retry needed), and both hardcoded price constants are left explicitly unresolved (not corrected) because neither provider's `usageMetadata` publishes a rate that can independently re-derive them.**

## Critical Finding — Lead With This

**CHILD PROBE: PASS on both image and video.** The requester's own example scene — a little girl searching for her lost cat who discovers a magical garden, rendered in the "Soft hand-painted 2D" style — was generated by Gemini's `gemini-3.1-flash-image` and animated by Veo 3.1 Lite (8s, 720p, 9:16) with **no safety block on either call**: `promptFeedback.blockReason` was absent on the image response, and `raiMediaFilteredCount`/`raiMediaFilteredReasons` were both absent (not zero — absent) on the completed Veo operation. The Veo retry path (RESEARCH.md Pitfall 3) was implemented but not exercised, since no block occurred to retry.

This directly answers CONTEXT.md's `<specifics>` risk: **Gemini and Veo remain viable providers for this product's actual content type** (wholesome, child-protagonist animated storybook scenes) on this empirical sample of one representative prompt. This is a positive signal, not a guarantee — a single passing sample doesn't rule out false positives on other prompts/scenes, but it directly contradicts the hypothesis that this content category is categorically unsupported.

Visual confirmation: the generated PNG shows a recognizable little girl with pigtails kneeling in a lush, glowing garden with fireflies, matching the prompt content, portrait orientation, "Soft hand-painted 2D" illustration style — not noise, not an unrelated image, not a refusal placeholder.

## Performance

- **Duration:** ~15 min active execution (code changes, one real image call, one real 8s Veo call with ~60-90s of polling, both automated verify scripts, the --report reconciliation run twice, and this SUMMARY)
- **Completed:** 2026-09-12T04:59:53Z (commit `b0cc2bb`)
- **Tasks:** 2 (Task 1: D-01 representative probe; Task 2: price reconciliation)
- **Files modified:** 3 (`src/providers/image/gemini-image.ts`, `src/scripts/smoke-test.ts`, `storage/_smoketest/spend-ledger.json`) — `scene-childscene.png`/`.mp4`, `childscene-run.log`, and `cost-report.log` are gitignored per D-06

## Accomplishments

- **Task 1:**
  - `generateImage()` in `src/providers/image/gemini-image.ts` gained an optional `style` field, composed into the prompt sent to the model as `"${style} style. ${prompt}"` — a single free-text descriptor, not a preset registry (Phase 2's real system per CONTEXT.md Deferred Ideas).
  - `src/scripts/smoke-test.ts`'s `childscene` branch — an explicit stub left by plan 01-03 — is now a full probe: `checkCeiling` → image dispatch → classify → `CHILD PROBE:` outcome line → (if unblocked) PNG write → `checkCeiling` → video dispatch via a single `dispatchChildVideo()` helper → classify → `CHILD PROBE:` outcome line → (if blocked) retry through the same helper (same `checkCeiling` gate) → final `CHILD PROBE:` outcome line labelled `(video, retry)` → cost/ledger summary.
  - Ran the real probe: `node --env-file=.env.local src/scripts/smoke-test.ts --probe=childscene` → exit 0, `CHILD PROBE: PASS (image)`, `CHILD PROBE: PASS (video)`, `IMAGE COST $0.0670`, `VIDEO COST $0.4000`, `TOTAL THIS RUN $0.4670`, `LEDGER TOTAL $0.8010`.
  - Both of Task 1's automated `<verify>` checks pass: the run itself (exit 0) and the inline `node -e` classifier script (`CHILD PROBE OUTCOME: PASS png=1194252B mp4=4189540B`).
  - Visually confirmed `scene-childscene.png`: a little girl with pigtails kneeling among glowing flowers and fireflies in a lush garden, a small stone cottage visible down the path, warm sunlight — matches the D-01 scene brief and the "Soft hand-painted 2D" style, portrait 9:16.
- **Task 2:**
  - Added a `--report` mode to `smoke-test.ts` that reads `spend-ledger.json`, prints one row per entry (`call`, `model`, `estimatedUsd`, raw `usageMetadata`), a total line, and a remaining-headroom line — making zero paid calls and requiring no `GEMINI_API_KEY`. Verified this explicitly: ran `node src/scripts/smoke-test.ts --report` (no `--env-file`, no key set) both before and after Task 1's real calls; both runs succeeded.
  - Mirrored the second (post-Task-1) run into `storage/_smoketest/cost-report.log`.
  - Performed the price reconciliation against RESEARCH.md's Open Question 2 and Assumption A4 — see **Price Reconciliation** below. Conclusion: both constants left **unresolved and unchanged**, with the raw evidence attached rather than a fabricated derivation.
  - All three of Task 2's automated `<verify>` checks pass: the report run itself, the ledger-integrity `node -e` check (`LEDGER OK entries=5 total=$0.8010 headroom=$2.1990`), and `npm run typecheck`.

## Price Reconciliation (ROADMAP SC-3, RESEARCH.md Open Question 2 / Assumption A4)

**`IMAGE_PRICE_PER_CALL["gemini-3.1-flash-image"] = 0.067` — status: UNRESOLVED, unchanged.**
Evidence: across all 3 real image calls to date (2 generic teacup calls in plan 01-03, 1 childscene call in this plan), `usageMetadata.candidatesTokensDetails` reports a constant `{ modality: "IMAGE", tokenCount: 1120 }` regardless of prompt length (`promptTokenCount` varied 12→68 between the shorter teacup prompt and the longer, style-prefixed childscene prompt, but the IMAGE-modality token count never moved). This is *consistent* with a flat per-image charge — a variable-token billing scheme would be expected to show the image-token count move with output complexity or prompt length, and it did not — but consistency is corroborative, not proof. Google's pricing page (per RESEARCH.md, fetched live 2026-09-12) publishes only the flat `$0.067`/image effective price; it does not publish a per-image-token dollar rate. Without that rate, `$0.067` cannot be independently re-derived from the 1120-token figure — there is nothing to multiply it by. No counter-evidence surfaced to suggest the figure is wrong, so it is kept as-is, but per Task 2's explicit instruction this is reported as an honest UNRESOLVED rather than a fabricated CONFIRMED.

**`VIDEO_PRICE_PER_SECOND["720p"] = 0.05` — status: UNRESOLVED, unchanged.**
Evidence: Veo's operation response `usageMetadata` (i.e., `operation.response`) contains only `{ generatedVideos: [{ video: { uri } }] }` on both the 4s tracer clip (plan 01-03) and this plan's 8s childscene clip — no cost field, no billed-duration field, no token count of any kind. There is nothing in either provider response to cross-check the locally-computed `durationSeconds × $0.05/s` figure against; that figure comes entirely from the pricing page, applied client-side to a duration the caller itself chose. A true reconciliation would require Google Cloud's own Billing dashboard, which this session has no access to. Reported UNRESOLVED rather than CONFIRMED for the same reason as above: absence of counter-evidence is not the same as independent verification.

**Neither constant was corrected** — Task 2's action explicitly permits (and this plan's own honesty requirement prefers) an explicit unresolved answer with raw figures attached over inventing a reconciliation the data cannot support.

## Task Commits

1. **Task 1 + Task 2 (combined — see Deviations): D-01 representative probe, style field, and --report reconciliation mode** — `b0cc2bb` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE.md + ROADMAP.md)

## Files Created/Modified

- `src/providers/image/gemini-image.ts` — `GenerateImageParams.style` field, composed into the prompt text before dispatch
- `src/scripts/smoke-test.ts` — `runChildsceneProbe()`, `dispatchChildVideo()`, `runReport()`, `--report` CLI flag, `--probe=childscene`/`--probe=all` now fully wired (no more "unimplemented" stubs)
- `storage/_smoketest/spend-ledger.json` — gained 2 real entries (`childscene-image`, `childscene-video`), tracked in git per D-05

## Decisions Made

- Kept `style` as a single prefixed sentence in the prompt text rather than any structured config — matches CONTEXT.md's explicit deferral of the real preset system to Phase 2.
- Both price constants left unchanged in code; the reconciliation's honest conclusion was "cannot independently verify from available data," not "verified correct" or "found wrong." See Price Reconciliation above.
- `dispatchChildVideo()` is the single call site for `generateVideo()` in the childscene path (used identically for the first attempt and the one allowed retry) specifically so `checkCeiling()` cannot structurally be skipped on the retry branch — a direct implementation of D-04's retry-safety requirement, independent of whether a retry was ever exercised this run.

## Deviations from Plan

### Documented, Not a Code Defect — Commit Granularity

**1. [Deviation] Task 1 and Task 2's code changes landed in a single commit, not two**
- **Found during:** Preparing to commit Task 1's work
- **Issue:** The `--report` CLI plumbing (Task 2) was authored in the same edit pass to `src/scripts/smoke-test.ts` as the childscene probe (Task 1), because both required touching `main()`'s probe-dispatch logic and it was more reliable to get that logic right once than to patch it twice. By the time this was noticed, the combined diff was already staged for Task 1's commit.
- **Why not split retroactively:** Per this executor's own protocol, commits are never amended — splitting would require a `git reset` of an already-verified, working commit purely for commit-granularity cosmetics, which carries more risk (of breaking a verified state) than value. Task 2 itself required **no further code changes** once the reconciliation concluded "unresolved, unchanged" — so there was no natural second commit to make even if the code had been split correctly the first time.
- **Impact:** None on functionality or verification — both tasks' automated `<verify>` blocks pass independently against the single commit's resulting code. The only effect is that `git log` shows one commit covering both tasks' source changes instead of two.
- **Files:** `src/providers/image/gemini-image.ts`, `src/scripts/smoke-test.ts` (both already committed in `b0cc2bb`)

---

**Total deviations:** 1 (process/commit-granularity only, no functional impact)
**Impact on plan:** None on correctness, budget, or scope. All acceptance criteria for both tasks are independently verified and passing.

## Issues Encountered

None — both real API calls (image, video) succeeded on the first attempt with no safety block, no timeout, no unclassified error. The Veo `generateVideos` deprecation warning (already logged as WINDOWS #1 from plan 01-03) printed again on this run, unchanged from before — not a new finding, not re-logged.

## Broken-Windows Ledger

No new entries. This plan produced no stub, skipped test, or unrun `<verify>` — every `<verify>` block in this plan's tasks was executed against the real, paid API responses. The two open items from plan 01-03 (`veo.ts` `source:` migration, `log-response.ts` over-redaction) remain open and unaffected by this plan's work.

## Threat Flags

None. No new trust boundaries, endpoints, or schema changes beyond what `01-04-PLAN.md`'s own `<threat_model>` already anticipated (T-01-02 retry-gate safety, T-01-01 secret non-disclosure, T-01-09 verbatim provider text, T-01-10 ledger traceability) — this plan's implementation satisfies each as designed:
- T-01-02: `dispatchChildVideo()` routes every dispatch (including the unexercised retry) through `checkCeiling()`.
- T-01-01: `logRawResponse` (unchanged from plan 01-02/01-03) redacts payload and secret-shaped fields before any print; the real `GEMINI_API_KEY` never appears in code, `childscene-run.log`, or `cost-report.log`.
- T-01-09: `CHILD PROBE: PASS` lines carry no provider reason text this run (nothing was blocked), so the verbatim-text requirement wasn't exercised, but the code path (`imageResult.block?.reason`, `videoResult.blockReason`) prints the provider's raw string directly, never a paraphrase.
- T-01-10: Both `childscene-image` and `childscene-video` ledger entries carry the real `usageMetadata` returned by each call, unmodified.

## User Setup Required

None. The `GEMINI_API_KEY` established in plan 01-03 was reused directly; `.env.local` was not modified this plan.

## Next Phase Readiness

- All four ROADMAP Phase 1 success criteria are now satisfied and evidenced across plans 01-03/01-04: SC-1 (image produced, viewable — teacup and girl-in-garden, both visually confirmed), SC-2 (image animated into playable 9:16 720p MP4 — 4s and 8s clips, both container-signature-verified), SC-3 (real per-call cost printed and reconciled — `--report` mode, both constants explicitly honest-unresolved), SC-4 (provider errors/safety blocks surface as named, verbatim messages, retry-safe — implemented and proven functional even though no block occurred to exercise the retry branch itself).
- **D-01's core product-viability question is answered positively on this sample:** Gemini and Veo generated and animated a real, wholesome, child-protagonist scene with no safety block. Phase 2 can proceed building STORY-*/IMAGE-*/VIDEO-* requirements on top of these provider integrations without the open question of "will safety filters reject our actual content" hanging over the build. This is not a guarantee against future false positives (RESEARCH.md Pitfall 3 remains real, generally, for Veo), but it directly rebuts "this content category is categorically unsupported."
- Ledger total after this plan: **$0.8010** against the $3.00 Phase 1-4 ceiling — well within budget, $2.199 of headroom remains for Phases 2-4's own smoke-testing needs.
- Two deferred items from plan 01-03 remain open in `.planning/WINDOWS.md` (Veo `source:` migration, `log-response.ts` over-redaction) — unaffected by, and not addressed in, this plan.
- `generateImage()`'s `style` field is a minimal composition, ready for Phase 2's real Style Bible system to either reuse directly or supersede.
- The `<human-check>` blocks from both this plan and plan 01-03 (PNG viewer, MP4 playback for both the teacup and the girl-in-garden clips) are recorded for the end-of-phase UAT batch — this executor's own visual inspection of `scene-childscene.png` is a strong positive signal, but final operator sign-off (including both MP4 playbacks) is still outstanding.

---
*Phase: 01-provider-smoke-test*
*Completed: 2026-09-12*

## Self-Check: PASSED
All 3 modified files (`src/providers/image/gemini-image.ts`, `src/scripts/smoke-test.ts`, `storage/_smoketest/spend-ledger.json`) and the task commit (`b0cc2bb`) verified present on disk / in git log below.
</content>

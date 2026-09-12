---
phase: 01-provider-smoke-test
verified: 2026-09-12T05:30:20Z
status: human_needed
score: 19/21 must-haves verified
behavior_unverified: 2
overrides_applied: 0
process_note: >
  ROADMAP.md tags this phase `Mode: mvp`, but the phase Goal text is not a User Story
  ("As a X, I want Y, so that Z.") and the verification task explicitly frames this phase
  as "a deliberate technical spike, not a wife-facing deliverable" with no requirement IDs.
  `gsd-tools query user-story.validate` on the ROADMAP goal returns valid=false, as expected
  for a non-user-story goal. Standard goal-backward verification (not MVP User Flow Coverage)
  was applied, matching the phase's actual nature (an operator-run CLI spike with no UI, no
  wife-facing flow) and the orchestrator's own framing. Flagging for visibility rather than
  refusing to verify — refusing would only block a technical spike that was never meant to
  carry a User Story goal.
behavior_unverified_items:
  - truth: "A provider error or safety block prints its exact blockReason/finishReason/raiMediaFilteredReasons value and exits non-zero (ROADMAP SC-4, 01-03 must_haves)"
    test: "Trigger a genuine Gemini promptFeedback.blockReason or Veo raiMediaFilteredReasons block on a real call (not the budget-ceiling refusal, which WAS live-verified during this verification pass) and confirm the exact provider reason text is printed verbatim and the process exits non-zero."
    expected: "The block/finishReason path in gemini-image.ts and veo.ts (defensive classify-before-parse, RESEARCH.md Pattern 1) fires and prints the verbatim reason; process does not hang or throw an unhandled exception."
    why_human: "Both real Phase 1 runs (generic + childscene probes) returned PASS on every call — no genuine provider block occurred in either run, so this specific branch was never exercised against live provider data. The code is present, structurally correct (order: blockReason -> finishReason -> inline data), and the sibling budget-refusal path was live-verified during this verification (see Behavioral Spot-Checks), but the provider-block branch itself remains unexercised. Forcing a live block would need either an intentionally content-policy-violating prompt or a non-deterministic RAI false positive — neither of which this budget-constrained phase should chase deliberately."
  - truth: "A Veo RAI block is retried exactly once and both outcomes are reported, rather than a single block being treated as proof of categorical non-viability (01-04 must_haves, RESEARCH.md Pitfall 3)"
    test: "Trigger a genuine Veo raiMediaFilteredReasons block on the childscene probe and confirm dispatchChildVideo() is invoked a second time (labelled 'retry'), through the same checkCeiling() gate, and both outcomes are printed as distinct CHILD PROBE lines."
    expected: "Exactly one retry, both outcomes printed with the provider's verbatim reason text, no more than two total Veo dispatches for the probe."
    why_human: "The childscene probe passed on the first attempt in the actual Phase 1 run — no block occurred, so the retry branch was never executed. Code review confirms dispatchChildVideo() is the single call site used identically for both the first attempt and the retry (each preceded by checkCeiling()), which is a verifiable structural/static fact independent of whether a live retry fired — that structural claim is scored VERIFIED below. Only the live retry-dispatch behavior itself is unverified."
human_verification:
  - test: "Play storage/_smoketest/scene-generic.mp4 in a media player."
    expected: "~4-second portrait (9:16) clip showing a ceramic teacup on a wooden table with visible motion (gentle camera drift / steam), not a frozen frame."
    why_human: "01-VALIDATION.md classifies video playback as manual-only. Automated checks in this verification confirmed a real, correctly-sized ISO media container (ftyp signature at bytes 4-8, 835998 bytes) and the source PNG was visually confirmed to be a genuine, on-prompt teacup image — but playback smoothness and portrait framing require a human to actually watch it. Not yet operator-confirmed per both 01-03-SUMMARY.md and 01-04-SUMMARY.md."
  - test: "Play storage/_smoketest/scene-childscene.mp4 in a media player."
    expected: "~8-second portrait (9:16) clip of a hand-painted-style girl in a glowing garden, with visible motion, matching the 'Soft hand-painted 2D' style."
    why_human: "Same as above — container/size verified programmatically (ftyp signature, 4189540 bytes) and the source JPEG was visually confirmed as a genuine, on-brief, on-style image during this verification, but playback itself was never confirmed by a human. Not yet operator-confirmed per 01-04-SUMMARY.md."
  - test: "Read the provider-block classification code paths in src/providers/image/gemini-image.ts and src/providers/video/veo.ts, and decide whether structural/static review is sufficient sign-off for ROADMAP SC-4, or whether a deliberate low-cost block-triggering test should be run before Phase 2 relies on this machinery."
    expected: "A human decision: accept the current evidence (real API response shapes observed and matched RESEARCH.md's Pattern 1 exactly on the non-block branch; classification order verified by code read; the sibling budget-refusal error path was live-verified to print a clear message and exit 2, not hang) as sufficient for a technical spike phase, or request an explicit block-path exercise."
    why_human: "This is a judgment call about how much residual risk is acceptable to carry into Phase 2 for code that 'survives into Phase 2 unchanged' per 01-03-PLAN.md's own objective — not something a script can decide."
---

# Phase 1: Provider Smoke Test Verification Report

**Phase Goal:** Prove that Gemini's image generation model and Veo 3.1 Lite's image-to-video model both genuinely work end-to-end from this codebase, with real per-call cost visible, before any persistence or interface investment is made. This is the riskiest, least-proven part of the whole project (a paid-preview API) and must be de-risked first.
**Verified:** 2026-09-12T05:30:20Z
**Status:** human_needed
**Re-verification:** No — initial verification

This report also cross-references the applied code-review fixes recorded in `01-REVIEW-FIX.md` (7/7 findings fixed) against the current codebase, rather than treating the phase as unreviewed. Both critical findings (CR-01, CR-02) and all five warning findings (WR-01..05) were independently re-verified present in the code during this pass (see Anti-Patterns / Code Review Fix Verification section below), not just re-read from the fix report.

## Goal Achievement

### Observable Truths

Merged from ROADMAP Phase 1 Success Criteria (SC-1..SC-4) and all four plans' `must_haves.truths` frontmatter (21 truths total after dedupe — ROADMAP SC-1..SC-4 map directly onto 01-03/01-04 truths #1-4 below).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `git check-ignore .env.local` exits 0 before any key file exists (01-01, T-01-01) | ✓ VERIFIED | `git check-ignore -q .env.local` exits 0; re-ran during this verification |
| 2 | `storage/_smoketest/spend-ledger.json` is NOT gitignored (D-05) | ✓ VERIFIED | `git check-ignore -q storage/_smoketest/spend-ledger.json` exits 1 (not ignored); `git ls-files storage/` shows only this file tracked |
| 3 | `import('@google/genai')` resolves and exports `GoogleGenAI` at a 2.x version | ✓ VERIFIED | Re-ran live: `GoogleGenAI type: function`, `version: 2.22.0` |
| 4 | A human explicitly confirmed `@google/genai`'s legitimacy before install (T-01-SC) | ✓ VERIFIED | 01-01-SUMMARY.md records verbatim human response: "Approved" |
| 5 | `checkCeiling()` refuses a call that would exceed $3.00, naming ceiling/spent/refused (D-04, D-05) | ✓ VERIFIED | `spend-ledger.test.ts` (2 tests) + live spot-check performed during this verification: real refusal message `"ceiling is $3.00, already spent $3.70... this call would add $0.07..."`, exit code 2 |
| 6 | A present-but-unparseable ledger halts paid calls instead of reading as $0 | ✓ VERIFIED | `spend-ledger.test.ts`: "throws on a present-but-unparseable file rather than reading it as $0 spent" — passes |
| 7 | A first run with no ledger file starts at $0 spent without error | ✓ VERIFIED | `spend-ledger.test.ts`: "returns { ceilingUsd: 3, entries: [] } when the file does not exist" — passes |
| 8 | `recordSpend()` round-trips through disk | ✓ VERIFIED | `spend-ledger.test.ts`: round-trip test passes |
| 9 | Raw provider response loggable with base64 redacted to kilobytes not megabytes | ✓ VERIFIED | `log-response.test.ts` (8 tests) pass; live evidence: real response contained a ~1.4MB `thoughtSignature` field (01-03-SUMMARY) yet `generic-run.log` is only 2484 bytes |
| 10 | Generic probe writes a non-empty PNG that opens in an image viewer (ROADMAP SC-1) | ✓ VERIFIED | `scene-generic.jpg` (791761 bytes, real JPEG signature `ffd8ffe0`); visually inspected during this verification — a genuine, on-prompt ceramic teacup on a wooden table, portrait orientation |
| 11 | That image is submitted to Veo and a playable 9:16 720p MP4 is written (ROADMAP SC-2) | ✓ VERIFIED (mechanics) — playback pending human confirmation | `scene-generic.mp4` (835998 bytes, `ftyp` at bytes 4-8 confirmed live); actual playback is a Human Verification item below |
| 12 | Each paid call prints a USD cost line and appends a matching ledger entry (ROADMAP SC-3) | ✓ VERIFIED | `generic-run.log`/`childscene-run.log` contain `IMAGE COST $`/`VIDEO COST $`/`TOTAL THIS RUN $`/`LEDGER TOTAL $` lines; `spend-ledger.json` has matching entries for all 5 calls |
| 13 | A provider error or safety block prints its exact reason and exits non-zero (ROADMAP SC-4) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Classification code present and structurally correct (verified by reading); sibling budget-refusal error path live-verified (exit 2, clear message, no hang); genuine provider-block branch never fired in either real run — see `behavior_unverified_items` |
| 14 | Every paid call preceded by `checkCeiling()`; Veo unreachable without a good image first (D-03, D-04) | ✓ VERIFIED | Code review: explicit early-return guard in `smoke-test.ts`; live evidence from 01-03-SUMMARY: `--image-only` run wrote PNG, wrote no MP4, printed the deliberate-non-dispatch line |
| 15 | All generated artifacts land under `storage/_smoketest/`, never under `storage/stories/` (D-06) | ✓ VERIFIED | `find storage -maxdepth 1 -type d` shows only `storage/_smoketest`; no `storage/stories` directory exists |
| 16 | D-01's second generation runs as a distinct probe using "Soft hand-painted 2D" + a child-protagonist garden scene from the requester's own example idea | ✓ VERIFIED | `scene-childscene.jpg` visually inspected — girl with pigtails, glowing garden, fireflies, stone cottage, matches CONTEXT.md's `<specifics>` scene and D-02's style exactly |
| 17 | Whether safety filters accept/reject this content is established empirically and reported with the exact reason | ✓ VERIFIED | Both calls returned PASS; `promptFeedback.blockReason` absent and `raiMediaFilteredCount`/`raiMediaFilteredReasons` absent (not zero) — a genuine, reported empirical finding, not an assumption |
| 18 | A Veo RAI block is retried exactly once and both outcomes reported (RESEARCH.md Pitfall 3) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `dispatchChildVideo()` single-call-site design verified by code read; retry branch never executed (no block occurred) — see `behavior_unverified_items` |
| 19 | The retry passes through `checkCeiling()` exactly as a first attempt (D-04) | ✓ VERIFIED (static) | Code review: `dispatchChildVideo()` calls `checkCeiling()` as its first statement and is the only call site for both the first attempt and the retry — this is a structural guarantee independent of whether the retry ever fired |
| 20 | Hardcoded price constants reconciled against observed `usageMetadata` (ROADMAP SC-3) | ✓ VERIFIED | `--report` mode re-run live during this verification produces `TOTAL LEDGER $0.8010`, `REMAINING HEADROOM $2.1990`; SUMMARY honestly reports both constants UNRESOLVED (not fabricated CONFIRMED) with raw token-count evidence attached |
| 21 | Total ledger spend across the phase stays at or below the $3.00 ceiling (D-05) | ✓ VERIFIED | `spend-ledger.json`: 5 entries sum to $0.8010, well under $3.00 |

**Score:** 19/21 truths verified (2 present, behavior-unverified)

### Prohibitions

| # | Prohibition | Status | Evidence |
|---|-------------|--------|----------|
| 1 | No real API key value in any git-tracked file | ✓ VERIFIED | `git log --all -p` / `git grep` across full history found only the placeholder and test-fixture strings (`AIzaSyTESTVALUE...` in `log-response.test.ts`), never a real key |
| 2 | `.env.local` never added to git | ✓ VERIFIED | `git ls-files` confirms `.env.local` is untracked; `.gitignore` excludes it |
| 3 | Response logger never emits values of `key`/`token`/`authorization`-named fields | ✓ VERIFIED | `log-response.test.ts` passes; live logs grepped for `authorization`/`apiKey` — no matches |
| 4 | `checkCeiling()` never allows a call through on NaN/negative/non-finite estimate | ✓ VERIFIED | 3 dedicated tests pass; code checks `Number.isFinite` before any disk read |
| 5 | Unit tests never touch the real ledger | ✓ VERIFIED | All ledger tests use `node:os.tmpdir()` paths; `git status`/diff before and after test run confirm the real ledger file was untouched |
| 6 | No request object/client config/header map ever logged — only response objects | ✓ VERIFIED | Code review of `gemini-image.ts` and `veo.ts`: `logRawResponse` is only ever called with `response` or `operation`, never `ai`, params, or config |
| 7 | `GEMINI_API_KEY` never appears in stdout, any file under `storage/`, or the SUMMARY | ✓ VERIFIED | Grepped all `storage/_smoketest/*.log` and `spend-ledger.json` for key-shaped substrings — no matches |
| 8 | `@google/generative-ai` never imported (EOL 2025-11-30) | ✓ VERIFIED | Package absent from `node_modules`; no import statements found in `src/` |
| 9 | Safety block never silently retried past or reported as a generic no-output error | ✓ VERIFIED | Code always prints `CHILD PROBE: BLOCKED reason=<verbatim>` — structurally guaranteed, though the block itself never fired live |
| 10 | Phase must not conclude a provider categorically rejects this content on one block | ✓ VERIFIED | SUMMARY explicitly frames the PASS result as "a positive signal, not a guarantee" |
| 11 | Total ledger spend must not exceed $3.00 | ✓ VERIFIED | $0.8010 total |

All 11 prohibitions hold.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json`, `tsconfig.json`, `.gitignore`, `.env.local.example` | Scaffold with exact pins | ✓ VERIFIED | All present, `engines` field added (WR-05), pins match RESEARCH.md |
| `src/lib/spend-ledger.ts` | $3.00 ceiling gate, exports match contract | ✓ VERIFIED | All 7 exports present; CR-01 fail-closed validation of loaded ledger shape confirmed present; WR-02 lock-file mitigation confirmed present |
| `src/lib/spend-ledger.test.ts` | 11 tests | ✓ VERIFIED | 11/11 pass |
| `src/lib/log-response.ts` | Redaction, secret-safe logging | ✓ VERIFIED | WR-01 ancestor-path-only `seen` tracking confirmed present (fixes false-positive `[CIRCULAR]` on diamond references) |
| `src/lib/log-response.test.ts` | 8 tests | ✓ VERIFIED | 8/8 pass |
| `src/providers/image/gemini-image.ts` | `generateImage`, `IMAGE_PRICE_PER_CALL` | ✓ VERIFIED | Both exported; classify-before-parse order confirmed (`promptFeedback.blockReason` → `finishReason` → inline data) |
| `src/providers/video/veo.ts` | `generateVideo`, `VIDEO_PRICE_PER_SECOND`, polling, download | ✓ VERIFIED | Both exported; 10-minute poll ceiling present; `ai.files.download` used, not hand-rolled |
| `src/scripts/smoke-test.ts` | CLI entry point, all flags | ✓ VERIFIED | `--probe=`, `--image-only`, `--report` all implemented; CR-02 `extensionForMimeType` confirmed present; WR-03 `runReport()` try/catch confirmed present; WR-04 `util.inspect` fallback confirmed present |
| `storage/_smoketest/scene-generic.{jpg,mp4}` | ROADMAP SC-1/SC-2 evidence | ✓ VERIFIED | Both present, real content confirmed (JPEG signature, `ftyp` container, visual inspection) |
| `storage/_smoketest/scene-childscene.{jpg,mp4}` | D-01 representative probe evidence | ✓ VERIFIED | Both present, real content confirmed |
| `storage/_smoketest/spend-ledger.json` | 5 tracked entries | ✓ VERIFIED | Tracked in git, 5 entries, total $0.8010 |
| `storage/_smoketest/cost-report.log` | Reconciliation output | ✓ VERIFIED | Present, matches live `--report` re-run during this verification |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `package.json` | `node_modules/@google/genai` | dependency pin `^2.22.0` | ✓ WIRED | Installed at exactly `2.22.0`; `GoogleGenAI` export confirmed live |
| `.gitignore` | `.env.local` | ignore rule predating the key file | ✓ WIRED | `git check-ignore` exits 0 |
| `src/scripts/smoke-test.ts` | `src/lib/spend-ledger.ts` | `checkCeiling()`/`recordSpend()` at every paid call site | ✓ WIRED | Confirmed by code read at all 4 dispatch points (generic image, generic video, childscene image, childscene video via `dispatchChildVideo`) |
| `src/scripts/smoke-test.ts` | `src/providers/image/gemini-image.ts` | `generateImage()` return consumed | ✓ WIRED | Bytes flow from `imageResult.bytes` into the PNG write and then into `generateVideo()`'s `imageBytes` param |
| `src/providers/image/gemini-image.ts` | `src/providers/video/veo.ts` | image bytes feed video generation | ✓ WIRED | Confirmed end-to-end via 2 real paid runs — this is the chain the whole phase exists to prove, and it produced real, size-correct, container-valid MP4s both times |
| `src/providers/video/veo.ts` | `storage/_smoketest/scene-*.mp4` | `ai.files.download()` with explicit `downloadPath` | ✓ WIRED | Both MP4s exist at exactly the D-06 segregated path |

### Data-Flow Trace (Level 4)

Not applicable in the conventional sense — this phase has no UI or rendered view. The equivalent trace is provider response → bytes → disk write → next-stage input, which is covered by Key Link Verification above and is real (paid, live API data), not mocked or static.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit test suite passes | `npm run test:lib` | 19/19 pass, 0 fail | ✓ PASS |
| Typecheck clean | `npm run typecheck` | No output, exit 0 | ✓ PASS |
| SDK entry point resolves | `node -e "import('@google/genai')..."` | `GoogleGenAI type: function`, `version: 2.22.0` | ✓ PASS |
| EOL package absent | `ls node_modules/@google/generative-ai` + grep `src/` | Not found; no imports | ✓ PASS |
| Ledger artifacts are real, non-empty, correct container | `node -e` byte-signature checks on all 4 media files | JPEG (`ffd8ffe0`) x2, MP4 (`ftyp`) x2, sizes 791761/835998/1194252/4189540 bytes | ✓ PASS |
| Budget-ceiling refusal path (live, performed during this verification) | Temporarily saturated a scratch copy of the ledger to $3.70, ran `smoke-test.ts --probe=generic --image-only` | `SPEND CEILING REFUSAL: Refusing call: ceiling is $3.00, already spent $3.70, this call would add $0.07 for a projected total of $3.77.` Exit code 2. No network call attempted. Ledger restored byte-identical to HEAD afterward (`diff` confirmed clean). | ✓ PASS |
| No key/secret leakage in any persisted log or ledger | `grep -i "GEMINI_API_KEY\|authorization\|apiKey"` across all `storage/_smoketest/*.log` and `spend-ledger.json` | No matches | ✓ PASS |
| Provider safety-block reporting (SC-4 block branch) | N/A — no live block occurred in either real run | Not exercised | ? SKIP → routed to Human Verification / behavior_unverified |
| Veo RAI retry-on-block | N/A — no live block occurred | Not exercised | ? SKIP → routed to Human Verification / behavior_unverified |

### Code Review Fix Verification

`01-REVIEW-FIX.md` claims 7/7 findings fixed (2 critical, 5 warning). Independently re-verified each against the current source, not re-read from the fix report:

| ID | Claim | Independently Confirmed |
|----|-------|--------------------------|
| CR-01 | `checkCeiling` fails closed on malformed ceiling/entry | ✓ Confirmed — `checkCeiling` validates `ledger.ceilingUsd` is finite/positive; `totalSpentUsd` throws on invalid `estimatedUsd` (read `spend-ledger.ts` lines 111-159) |
| CR-02 | Image files named by actual `mimeType`, not hardcoded `.png` | ✓ Confirmed — `extensionForMimeType()` present in `smoke-test.ts`, used at both write sites; on-disk files are `.jpg` (real content is JPEG, `ffd8ffe0` signature) |
| WR-01 | `seen` WeakSet tracks only current ancestor path | ✓ Confirmed — `seen.delete(value)` present after both array and object branches in `log-response.ts` |
| WR-02 | Lock file guards `recordSpend`'s read-modify-write | ✓ Confirmed — `withLedgerFileLock()` present, exclusive-create lock with 2s timeout; documented as a partial mitigation (TOCTOU on `checkCeiling`-then-dispatch remains, explicitly accepted as residual risk for Phase 5) |
| WR-03 | `runReport()` has the same error handling as sibling probes | ✓ Confirmed — try/catch with `CeilingExceededError` → exit 2, else → exit 1, present in `runReport()` |
| WR-04 | `util.inspect` used instead of `String()` for non-Error thrown values | ✓ Confirmed — `formatLogArg` uses `inspect(arg, { depth: null })` |
| WR-05 | `engines` field declares minimum Node version | ✓ Confirmed — `"engines": { "node": ">=20.6.0" }` present in `package.json` |

All 7 fixes verified present and functioning, not just claimed.

### Requirements Coverage

Phase 1 carries no requirement IDs by explicit design. REQUIREMENTS.md states verbatim: *"Phase 1 (Provider Smoke Test) intentionally carries no requirement mappings — it is a technical spike that de-risks the AI provider integrations before any wife-facing capability is built on top of them, per explicit project sequencing guidance."* Cross-referenced against REQUIREMENTS.md's Traceability table: no requirement ID maps to Phase 1, confirming no orphaned requirements exist for this phase. All 33 v1 requirements map to Phases 2-6 instead. This is consistent across ROADMAP.md, REQUIREMENTS.md, and all four plans' `requirements: []` frontmatter with identical justification comments.

### Anti-Patterns Found

Scanned all phase-modified files (`src/lib/*.ts`, `src/providers/**/*.ts`, `src/scripts/*.ts`) for debt markers (`TBD`/`FIXME`/`XXX`), warning markers (`TODO`/`HACK`/`PLACEHOLDER`), and stub patterns.

**None found.** The only matches for "placeholder" are legitimate documentation of the redaction feature's own placeholder-output behavior (e.g., `log-response.ts`'s doc comment "becomes a length-naming placeholder"), not incomplete work.

Two pre-existing, explicitly-documented, non-blocking deviations remain open in `.planning/WINDOWS.md` (both logged during 01-03, unaffected by later plans):
1. `veo.ts` uses the deprecated top-level `image`/`prompt` `GenerateVideosParameters` shape (SDK warns removal "not before 2026-07-31"); migration deferred to Phase 2's first real Veo call to avoid an unverified change to code that survives into Phase 2.
2. `log-response.ts`'s `isSecretKey()` over-redacts `usageMetadata` fields containing the substring "token" (e.g. `promptTokenCount`) in printed/mirrored logs — cosmetic only, the real `usageMetadata` in `spend-ledger.json` is unaffected (confirmed: the ledger JSON read during this verification shows unredacted `promptTokenCount`/`candidatesTokenCount` values).

Neither blocks the phase goal — both are informational-tier, correctly triaged as out-of-scope-but-tracked rather than silently dropped.

### Human Verification Required

See frontmatter `human_verification` for the structured form. Summary:

1. **Play `storage/_smoketest/scene-generic.mp4`** — confirm ~4s portrait clip with visible motion (mechanics already verified: real ISO container, correct size).
2. **Play `storage/_smoketest/scene-childscene.mp4`** — confirm ~8s portrait clip with visible motion in the "Soft hand-painted 2D" style (mechanics already verified).
3. **Judgment call on SC-4's unexercised block-handling branch** — accept the current static/structural evidence as sufficient for this technical-spike phase, or request a deliberate low-cost block-triggering test before Phase 2 builds on this code.

### Gaps Summary

No FAILED truths, no MISSING/STUB artifacts, no NOT_WIRED key links, no blocker anti-patterns. Both critical and all five warning code-review findings are independently confirmed fixed in the current codebase.

The phase's core, expensive, genuinely risky claim — "Gemini image generation and Veo 3.1 Lite image-to-video work end-to-end from this codebase, with real cost visible" — is proven with real, paid, verifiable evidence: two real generations (teacup + child-protagonist garden scene), both producing real JPEGs and real playable-container MP4s, both logged with accurate per-call costs, total spend $0.8010 against a $3.00 dev ceiling. This is the hardest and most valuable part of the phase goal, and it holds up under independent re-verification, not just SUMMARY narrative.

The two gaps are narrower and lower-stakes than the phase's core claim:
- Two `<human-check>` items (MP4 playback) that both SUMMARYs themselves flagged as pending operator sign-off — never claimed as done, so this is not a discrepancy between SUMMARY and reality, just an outstanding step.
- SC-4's "reports a genuine provider block" behavior is implemented and structurally sound but was never exercised against live blocked data, because neither real generation triggered a block — which is itself the positive finding this phase was designed to surface (D-01's core question: "do Gemini/Veo false-positive on wholesome children's content?" — answered "no, not on this sample").

Recommendation: this phase's expensive, hard-to-fake goal is achieved. The remaining items are standard end-of-phase human sign-off, not rework.

---

*Verified: 2026-09-12T05:30:20Z*
*Verifier: Claude (gsd-verifier)*

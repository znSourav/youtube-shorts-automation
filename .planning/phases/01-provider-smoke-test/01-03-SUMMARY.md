---
phase: 01-provider-smoke-test
plan: 03
subsystem: providers
tags: [gemini, veo, image-generation, video-generation, tracer, spend-ledger, real-api-calls]

# Dependency graph
requires:
  - phase: 01-provider-smoke-test (plan 01)
    provides: "TypeScript/ESM scaffold, @google/genai installed"
  - phase: 01-provider-smoke-test (plan 02)
    provides: "src/lib/spend-ledger.ts (checkCeiling/recordSpend/loadLedger/totalSpentUsd), src/lib/log-response.ts (logRawResponse)"
provides:
  - "src/providers/image/gemini-image.ts — generateImage()/IMAGE_PRICE_PER_CALL, survives into Phase 2"
  - "src/providers/video/veo.ts — generateVideo()/VIDEO_PRICE_PER_SECOND, survives into Phase 2"
  - "src/scripts/smoke-test.ts — CLI entry point, generic probe + --image-only implemented, childscene left as explicit unimplemented stub for 01-04"
  - "Real, verified image->video tracer: storage/_smoketest/scene-generic.png + scene-generic.mp4, both classified good, ledger total $0.334"
affects: [01-04]

actuals:
  tokens: 4460
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Defensive response classification (RESEARCH.md Pattern 1): promptFeedback.blockReason -> candidate.finishReason -> inline data, in that order, never the reverse"
    - "Empirical-shape verification: logRawResponse called on the raw response BEFORE any field is parsed, so the real shape (confirmed against node_modules/@google/genai's own .d.ts, not just docs) drove the parsing code"
    - "D-03 guard implemented as an explicit early-return after a real PNG is written and classified good, not as sequential statements that happen to run in order"
    - "Console-output mirroring via a temporary console.log/console.error monkey-patch in smoke-test.ts, so provider-module prints (poll lines, raw-response dumps) are captured into generic-run.log without changing those modules' call sites"

key-files:
  created:
    - src/providers/image/gemini-image.ts
    - src/providers/video/veo.ts
    - src/scripts/smoke-test.ts
  modified: []

key-decisions:
  - "Kept scene-generic.png's literal filename/extension even though the model returned image/jpeg bytes, not image/png — the plan's own <verify> script and <artifacts_this_phase_produces> hardcode this exact path; documented the real mimeType as a finding instead of renaming the artifact or fixing 'silently'."
  - "Left veo.ts using the (working, deprecation-warned) top-level image/prompt GenerateVideosParameters shape rather than migrating to the SDK's newer source: {...} shape live during this task — the currently-proven shape already satisfies every acceptance criterion; an unverified migration risked introducing a new, unproven bug into code that survives into Phase 2 for the sake of silencing a warning that (per the SDK's own message) has no forced-removal date before 2026-07-31. Documented as a Deviation for Phase 2 follow-up rather than spending another $0.20 to re-verify a non-functional style change."
  - "Did not modify src/lib/log-response.ts's isSecretKey() even though it over-redacts usageMetadata fields like promptTokenCount (matches the substring 'token') — that file was outside this task's declared files_modified, the real usageMetadata is unaffected in storage/_smoketest/spend-ledger.json (only the printed/logged copy is redacted), and SCOPE BOUNDARY directs logging out-of-scope discoveries rather than fixing them. Logged to WINDOWS.md."
  - "durationSeconds passed to Veo as a number (4), not the string \"4\" RESEARCH.md's Code Examples showed — the installed SDK's own GenerateVideosConfig.durationSeconds is typed number; this is exactly the docs-vs-reality drift the plan told this task to watch for, caught by reading node_modules/@google/genai's .d.ts before writing any code rather than after a runtime failure."

patterns-established:
  - "Pattern: before writing parsing code against a documented-but-unverified response shape, read the installed SDK's own .d.ts (not just RESEARCH.md or Google's docs pages) — this caught the durationSeconds number-vs-string mismatch before a single API call was made, one layer earlier than the plan's own 'log the raw response and adapt' fallback."

requirements-completed: []  # Phase 1 carries no requirement IDs by design (technical spike) — see PLAN.md frontmatter note.

coverage:
  - id: D1
    description: "Running the generic probe writes a non-empty PNG (real teacup image, visually confirmed) to storage/_smoketest/ (ROADMAP SC-1)"
    verification:
      - kind: integration
        ref: "node --env-file=.env.local src/scripts/smoke-test.ts --probe=generic --image-only (real paid call)"
        status: pass
      - kind: manual
        ref: "Viewed storage/_smoketest/scene-generic.png directly — a recognisable ceramic teacup on a wooden table in soft daylight, 9:16 portrait"
        status: pass
    human_judgment: true
    rationale: "01-VALIDATION.md classifies image-quality judgment as manual-only; this executor's own visual inspection is a strong positive signal but the operator's own sign-off is still recorded for the end-of-phase UAT batch per the plan's <verify> human-check."
  - id: D2
    description: "That same image is submitted to Veo 3.1 Lite and a playable 9:16 720p MP4 is written to storage/_smoketest/ (ROADMAP SC-2)"
    verification:
      - kind: integration
        ref: "node --env-file=.env.local src/scripts/smoke-test.ts --probe=generic (real paid call, full run)"
        status: pass
      - kind: unit
        ref: "inline node -e ISO-container/box-type/size check (PLAN.md Task 2 <verify>) -> TRACER ARTIFACTS OK png=791761B mp4=835998B ledger=$0.3340"
        status: pass
      - kind: manual
        ref: "MP4 playback (portrait, ~4s, motion) — not yet operator-verified"
        status: pending
    human_judgment: true
    rationale: "01-VALIDATION.md classifies video playback as manual-only; recorded for the end-of-phase UAT batch."
  - id: D3
    description: "Each paid call prints a USD cost line and appends a matching entry to spend-ledger.json (ROADMAP SC-3)"
    verification:
      - kind: unit
        ref: "generic-run.log contains IMAGE COST $, VIDEO COST $, TOTAL THIS RUN $, LEDGER TOTAL $ (all four confirmed present)"
        status: pass
      - kind: unit
        ref: "spend-ledger.json gained generic-image (x2, one per run) and generic-video entries, each with real usageMetadata"
        status: pass
    human_judgment: false
  - id: D4
    description: "checkCeiling precedes every paid call; the video call is unreachable without a good image first (D-03); --image-only exits before any video spend"
    verification:
      - kind: integration
        ref: "--image-only run wrote the PNG, wrote no MP4, printed 'VIDEO CALL DELIBERATELY NOT DISPATCHED'"
        status: pass
      - kind: static
        ref: "src/scripts/smoke-test.ts: checkCeiling(videoEstimate) and the video dispatch are gated behind an explicit early return that only executes after imageResult.bytes is confirmed non-empty and classified unblocked"
        status: pass
    human_judgment: false
  - id: D5
    description: "No request object, client config, header map, or the real GEMINI_API_KEY value ever reaches stdout, a log file, or the ledger (T-01-01)"
    verification:
      - kind: unit
        ref: "Searched generic-run.log and spend-ledger.json for the first 12 characters of the real key — no match in either file"
        status: pass
      - kind: static
        ref: "Only response objects (never ai, request params, or config) are ever passed to logRawResponse in gemini-image.ts and veo.ts"
        status: pass
    human_judgment: false

duration: ~20min active execution (Task 2, from resumed after the human-action checkpoint to final commit) + checkpoint wait for GEMINI_API_KEY setup
completed: 2026-09-12
status: complete
---

# Phase 1 Plan 3: End-to-End Tracer — Gemini Image to Veo Video Summary

**A real, paid, end-to-end tracer that turns one generic teacup prompt into a classified-good Gemini image and animates it into a playable 9:16 720p MP4 via Veo 3.1 Lite, with per-call cost printed and ledgered ($0.334 total against the $3.00 dev ceiling) — the riskiest dependency in the whole project now proven to work from this codebase.**

## Performance

- **Duration:** ~20 min of active execution for Task 2 (Task 1 was a human-action checkpoint waiting on real `GEMINI_API_KEY` + billing setup, resumed once the coordinator confirmed `.env.local` was populated)
- **Completed:** 2026-09-12T12:43:56+08:00 (Task 2 commit)
- **Tasks:** 2 (Task 1 `checkpoint:human-action`, Task 2 `type="tracer"`)
- **Files modified:** 4 (3 new source files, 1 ledger update — `storage/_smoketest/scene-generic.png`/`.mp4`/`generic-run.log` are gitignored per D-06)

## Accomplishments

- **Task 1 (checkpoint):** Verified `.env.local` exists, `GEMINI_API_KEY` is present and non-placeholder (53 chars), and `git check-ignore -q .env.local` still exits 0 — all without ever reading or printing the key's value. Confirmed via `node -e fs.existsSync(...)` and a regex match on the file, never via `cat`/`Read`.
- **Task 2 (tracer):**
  - `src/providers/image/gemini-image.ts` — `generateImage()` calls `ai.models.generateContent({ model: "gemini-3.1-flash-image", contents, config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } } })`, classifies `promptFeedback.blockReason` then `candidates[0].finishReason` before ever looking at `parts[].inlineData`, logs the full raw response via `logRawResponse` before any parsing, and falls back to `gemini-2.5-flash-image` on a 403/404 (not exercised — primary model worked on the first call).
  - `src/providers/video/veo.ts` — `generateVideo()` calls `ai.models.generateVideos({ model: "veo-3.1-lite-generate-preview", ... })`, polls `ai.operations.getVideosOperation` every 10s with a hard 10-minute ceiling (printing a waiting line each iteration), reads `raiMediaFilteredCount`/`raiMediaFilteredReasons` before assuming success, and downloads via `ai.files.download`.
  - `src/scripts/smoke-test.ts` — CLI entry point implementing `--probe=generic|childscene|all` (default `all`) and `--image-only`. Sequences `checkCeiling → image → recordSpend → classify → write PNG → (guard) → checkCeiling → video → recordSpend → classify → write MP4 → cost summary`. Mirrors every printed line (from this file and both provider modules) into `storage/_smoketest/generic-run.log` via a temporary `console.log`/`console.error` monkey-patch. `--probe=childscene` prints an explicit "not implemented in plan 01-03" message and exits 1, per plan instruction, so 01-04 fills it without restructuring anything.
- **Two real, paid API runs** (with explicit human approval for the ~$0.267 spend, after Claude Code's own auto-mode permission classifier initially blocked the first attempt and required an explicit unblock):
  1. `--probe=generic --image-only` — wrote `scene-generic.png` (747,874 bytes), printed `IMAGE COST $0.0670`, exited 0.
  2. `--probe=generic` (full run) — wrote a **new** `scene-generic.png` (791,761 bytes) and `scene-generic.mp4` (835,998 bytes), printed `IMAGE COST $0.0670`, `VIDEO COST $0.2000`, `TOTAL THIS RUN $0.2670`, `LEDGER TOTAL $0.3340`, exited 0.
- Visually confirmed `scene-generic.png`: a recognisable ceramic teacup and saucer with a small blue floral motif, a spoon, and a teapot on a rustic wooden table in front of a sunlit garden window — matches the prompt, portrait orientation, not noise or a solid colour.
- Confirmed the ISO base media container signature (`ftyp` at bytes 4-8) on `scene-generic.mp4` and that both files clear the plan's minimum-size thresholds.
- Confirmed via a targeted string search that the real `GEMINI_API_KEY`'s first 12 characters appear in neither `generic-run.log` nor `spend-ledger.json`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Real, billing-enabled `GEMINI_API_KEY` in `.env.local`** — checkpoint only, no code change; human confirmed key present, non-placeholder, and still gitignored.
2. **Task 2: End-to-end tracer — generic prompt, image to video, through every layer** — `e32a88b` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE.md + ROADMAP.md)

## Files Created/Modified

- `src/providers/image/gemini-image.ts` — `generateImage()`, `IMAGE_PRICE_PER_CALL`
- `src/providers/video/veo.ts` — `generateVideo()`, `VIDEO_PRICE_PER_SECOND`
- `src/scripts/smoke-test.ts` — CLI entry point, `checkCeiling` sequencing, console-mirroring log helper
- `storage/_smoketest/spend-ledger.json` — gained 3 real entries (2x `generic-image`, 1x `generic-video`), tracked in git per D-05

## Empirical Findings (this phase's own deliverable per PLAN.md `<output>`)

**1. Real response shape for `ai.models.generateContent` (image generation) — matched RESEARCH.md's assumed shape exactly**, with one addition RESEARCH.md didn't call out:
```
response.candidates[0].content.parts[0] = {
  inlineData: { mimeType: "image/jpeg", data: "<base64>" },
  thoughtSignature: "<base64, ~1.4MB>"   // NOT documented in RESEARCH.md's Code Examples
}
response.candidates[0].finishReason = "STOP"
response.promptFeedback = undefined (not blocked)
response.usageMetadata = {
  promptTokenCount: 12,
  candidatesTokenCount: 1536,      // varied slightly between the two real calls (1536, then 1524)
  totalTokenCount: 1548,
  promptTokensDetails: [{ modality: "TEXT", tokenCount: 12 }],
  candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }],  // constant across both calls
  serviceTier: "standard"
}
```
`candidates[0].content.parts[].inlineData.{data,mimeType}` — the shape RESEARCH.md's Code Examples recommended — was correct on the first real call; the Veo docs page's mismatched `generatedImages[0].image.imageBytes` shape (Pitfall 1) was never encountered because the plan's own recommended code path (not the Veo docs snippet) was used from the start.

**2. `mimeType` was `image/jpeg`, not `image/png`** — RESEARCH.md's Code Examples assumed PNG; the model returned JPEG on both real calls. `ImageConfig.outputMimeType` exists in the SDK's types but its own doc comment says "This field is not supported in Gemini API," confirming there is currently no way to force PNG output on this call path. The file is still written as `scene-generic.png` (matching this plan's own hardcoded artifact path and `<verify>` script), and still opens correctly in standard viewers since they sniff actual file content rather than trusting the extension — but the extension is now known to be misleading for any future code that validates PNG magic bytes.

**3. `usageMetadata` token counts (Open Question 2 in RESEARCH.md):** ~12 prompt tokens + 1120 image tokens + a small variable remainder (1536/1524 total across the two calls) were billed per call, but the flat `$0.067` per-call price (not a token-rate calculation) was used for cost tracking, matching RESEARCH.md's Standard Stack pricing table. No token-to-dollar conversion rate was derived or needed — the real token counts are now captured in the ledger for a future cross-check against the actual Google Cloud billing dashboard, which this session did not have access to.

**4. Real Veo operation response shape** — matched RESEARCH.md's Code Examples: `{ name, done: true, response: { generatedVideos: [{ video: { uri } }] } }`. `raiMediaFilteredCount`/`raiMediaFilteredReasons` were both absent (not just zero) on a clean pass — no block occurred. The operation completed within 3 polls (~30s), well under the 10-minute ceiling.

**5. `veo-3.1-lite-generate-preview` model ID and `gemini-3.1-flash-image` model ID both worked on the first attempt** — the RESEARCH.md Assumption A2 fallback to `gemini-2.5-flash-image` was never needed.

**6. Estimated vs. observed cost: exact match.** Estimated $0.067 (image) + $0.20 (video, 4s × $0.05/s) = $0.267 planned; actual ledger total for this plan's two runs is $0.334 (two image calls at $0.067 each from the `--image-only` run plus the full run, plus one video call at $0.20) — exactly as expected once the two-run verification sequence (image-only first, then full) specified by the plan's own `<verify>` block is accounted for.

## Decisions Made

- Kept `scene-generic.png`'s literal filename despite the actual `image/jpeg` bytes — the plan's own `<verify>` script and artifact list hardcode this path; renaming would break the plan's own automated check. Documented as a finding above instead.
- Left `veo.ts` on the (working, deprecation-warned) top-level `image`/`prompt` `GenerateVideosParameters` shape rather than migrating to `source: {...}` live during this task, to avoid spending additional real money re-verifying an unproven code change to code that survives into Phase 2. See Deviations below.
- Did not touch `src/lib/log-response.ts`'s over-broad `isSecretKey()` substring match (redacts `promptTokenCount` etc. because they contain "token") — out of this task's declared `files_modified`, and the real `usageMetadata` is unaffected since it's stored in the ledger unredacted; only the printed/logged copy is affected. Logged to WINDOWS.md per SCOPE BOUNDARY.
- `durationSeconds` passed as the number `4`, not RESEARCH.md's string `"4"` — the installed SDK's `GenerateVideosConfig.durationSeconds` is typed `number` (confirmed by reading `node_modules/@google/genai/dist/node/node.d.ts` before writing any code), an empirical correction caught one layer earlier than the plan's "log the raw response and adapt" fallback.
- Ran the `--image-only` verification before the full run, per the plan's own `<verify>` ordering, which is why the ledger shows two `generic-image` entries rather than one.

## Deviations from Plan

### Auto-fixed Issues

None required — both provider modules worked correctly against the real API on the first attempt; no Rule 1-3 auto-fixes were needed on `gemini-image.ts`, `veo.ts`, or `smoke-test.ts` themselves.

### Documented, Not Fixed (out of scope per SCOPE BOUNDARY / deliberately deferred)

**1. [Deviation] Veo `generateVideos` deprecation warning not migrated live**
- **Found during:** Task 2, full run
- **Issue:** `ai.models.generateVideos({ image, prompt, ... })` (top-level args) printed: `"The generateVideos method with prompt/image/video arguments is deprecated and will be removed in a future major release (not before 2026-07-31). Please use the source argument instead."`
- **Why not fixed now:** The call succeeded and produced a fully classified-good result; switching to `source: { image, prompt }` is a mechanical migration the SDK's own message prescribes, but doing so without a live re-verification call risks introducing an unproven regression into code that survives into Phase 2, for the cost of an additional ~$0.20 real spend that the plan's own budget-consciousness (D-04/D-05, "if the ledger total is materially above [$0.267], stop and report it") argues against spending unnecessarily.
- **Recommendation:** Migrate `veo.ts` to the `source:` parameter shape early in Phase 2, verified on that phase's first real Veo call (which will happen anyway).
- **Files:** `src/providers/video/veo.ts` (unchanged)

**2. [Deviation] `log-response.ts`'s secret-key redaction is over-broad, hides legitimate token-count telemetry**
- **Found during:** Task 2, both real calls
- **Issue:** `isSecretKey()` in `src/lib/log-response.ts` (plan 01-02) matches any key containing the substring `"token"`, which also catches `promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`, `promptTokensDetails`, `candidatesTokensDetails` — none of which are secrets. The printed/logged `usageMetadata` in `generic-run.log` shows `"[REDACTED:secret]"` for all of these, even though the real values are present, unredacted, in `spend-ledger.json` (verified above under Empirical Findings #3).
- **Why not fixed now:** `src/lib/log-response.ts` is not in this task's declared `files_modified`; the bug does not block any of Task 2's acceptance criteria (the real usage data is captured correctly in the ledger, just not visible in the console-mirrored log).
- **Files:** `src/lib/log-response.ts` (unchanged)
- **Logged to WINDOWS.md:** yes (see below)

## Broken-Windows Ledger

Both documented-not-fixed items above were appended to `.planning/WINDOWS.md`:
```
gsd_run windows append --kind deviation --phase 01 --file src/providers/video/veo.ts \
  --description "generateVideos top-level image/prompt args are deprecated (SDK warning: removed no earlier than 2026-07-31); migrate to source:{image,prompt} shape, verified on Phase 2's first real Veo call"
gsd_run windows append --kind deviation --phase 01 --file src/lib/log-response.ts \
  --description "isSecretKey() substring-matches 'token', over-redacting usageMetadata fields like promptTokenCount/candidatesTokenCount in printed logs (real values are unaffected in spend-ledger.json)"
```

## Threat Flags

None — no new trust boundaries, endpoints, or schema changes introduced beyond what `01-03-PLAN.md`'s own `<threat_model>` already anticipated (T-01-01, T-01-02, T-01-07, T-01-08), and this task's implementation satisfies each of those mitigations as designed (see coverage D4/D5 above).

## Issues Encountered

- **Claude Code's own auto-mode Bash permission classifier blocked the first attempt** to run `node --env-file=.env.local src/scripts/smoke-test.ts --probe=generic --image-only` (a real paid API call), independent of the GSD checkpoint protocol. Execution paused and reported this back rather than attempting to route around it. The coordinator confirmed explicit human approval for the ~$0.267 spend, after which the retry succeeded with no further blocks.

## User Setup Required

None further — the `GEMINI_API_KEY` / billing setup required by this plan's `user_setup` frontmatter was completed by the coordinator during Task 1's checkpoint (confirmed present, non-placeholder, still gitignored, value never read or printed).

## Next Phase Readiness

- `generateImage()` and `generateVideo()` both exist with the exact exported signatures this phase's `<artifacts_this_phase_produces>` promised (`IMAGE_PRICE_PER_CALL`, `VIDEO_PRICE_PER_SECOND`), verified against two real paid API calls each, and are ready for plan 01-04 to extend (style parameter, childscene probe) without restructuring.
- `src/scripts/smoke-test.ts`'s `--probe=childscene` branch is an explicit, loud stub (`UNIMPLEMENTED PROBE`, exit 1) exactly as this plan specified, so 01-04 can fill it in directly.
- Ledger total after this plan: **$0.334** against the $3.00 Phase 1-4 ceiling (well within budget; not materially above the plan's own $0.267 estimate once the two-run `--image-only`-then-full verification sequence is accounted for).
- Two deferred items (Veo `source:` migration, `log-response.ts` over-redaction) are recorded in `.planning/WINDOWS.md` for visibility before `/gsd-ship`.
- The `<human-check>` (PNG viewer + MP4 playback) from `01-03-PLAN.md`'s `<verify>` block is recorded here for the end-of-phase UAT batch — this executor's own visual inspection of `scene-generic.png` is a strong positive signal, but final operator sign-off (including MP4 playback) is still outstanding.

---
*Phase: 01-provider-smoke-test*
*Completed: 2026-09-12*

## Self-Check: PASSED
All 4 created/modified files (`src/providers/image/gemini-image.ts`, `src/providers/video/veo.ts`, `src/scripts/smoke-test.ts`, `storage/_smoketest/spend-ledger.json`) and the task commit (`e32a88b`) verified present on disk / in git log.

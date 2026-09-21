---
phase: 06-reliability-secrets-hygiene-output-correctness
verified: 2026-09-22T00:00:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 4/4
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 6: Reliability, Secrets Hygiene & Output Correctness Verification Report (Re-verification)

**Phase Goal:** The tool fails safely and honestly at every edge — provider errors, missing keys, malformed output files — instead of corrupting state or leaking secrets, and is trustworthy to hand over for unsupervised use.
**Verified:** 2026-09-22T00:00:00Z
**Status:** passed
**Re-verification:** Yes — previous VERIFICATION.md (2026-09-21T00:00:00Z, status: passed, 4/4, verified against `e60558a`) was stale relative to 3 commits that landed after it, all closing findings from a subsequent, dedicated Phase 6 security audit: `4fcc1cb` (fixes for T-06-05, T-06-09), `e1d9443` (corrections to that fix's own justifying comment plus an `invariant 10` hardening, per a second independent audit pass — ESC-1/ESC-4), `5888045` (06-SECURITY.md, docs only). This is a re-verification matching Phase 5's own precedent (05-VERIFICATION.md), not a full re-audit from scratch.

## What Changed Since the Previous Pass

Independently inspected all 3 commits via `git show` rather than trusting SUMMARY/SECURITY claims:

| Commit | File | Change | Nature |
|--------|------|--------|--------|
| `4fcc1cb` | `src/providers/video/veo.ts` | New exported `withTimeout<T>()` helper; `ai.files.download()` call wrapped in `withTimeout(..., VIDEO_DOWNLOAD_TIMEOUT_MS, ...)`; a caught timeout/error returns `{ downloadFailed: true }` (a result field) instead of throwing | Additive — closes T-06-05 (unbounded download could wedge the shared `serializeDispatch` queue app-wide) |
| `4fcc1cb` | `src/core/config/provider-timeouts.ts` | New `VIDEO_DOWNLOAD_TIMEOUT_MS = 120_000` constant | Additive |
| `4fcc1cb` | `src/app/actions/generate-video.ts` | New `if (result.downloadFailed)` branch (FAILED + `setVideoSaveCorrupted` + `CORRUPT_VIDEO_MESSAGE`, same D-05 treatment as a failed validation); readback-failure branch (`readFileSync(result.filePath)` catch) rewritten from writing `READY` unvalidated to writing `FAILED` + `setVideoSaveCorrupted` + `CORRUPT_VIDEO_MESSAGE` | Behavior change, scoped to two failure branches — closes T-06-09 (an unvalidated file could reach `READY`) |
| `4fcc1cb` | `src/providers/video/veo.test.ts` | 4 new tests for `withTimeout` (resolves-before-deadline, passthrough-rejection, times-out, timer-cleared-on-early-resolve) | Additive test coverage |
| `e1d9443` | `src/providers/video/veo.ts` | Removed `httpOptions: { timeout: ... } }` from the `ai.files.download()` call (was added in `4fcc1cb`, found net-negative by a second audit pass); both comments above the download call rewritten to state the verified SDK mechanism | Correction — narrows the prior commit's own change; no new capability added or removed beyond the one removed config key |
| `e1d9443` | `src/core/config/provider-timeouts.ts` | `VIDEO_DOWNLOAD_TIMEOUT_MS`'s doc comment rewritten to correct a factual claim about the SDK (ESC-1) | Comment-only |
| `e1d9443` | `src/app/actions/generate-video.ts` | New comment above the `result.blocked \|\| !result.filePath` check explaining why it must stay after the `result.downloadFailed` check | Comment-only — no logic changed in this file this commit |
| `e1d9443` | `src/scripts/check-boundaries.ts` | Invariant 10 hardened from "last `READY` occurrence follows `validateMp4Buffer`" to "exactly one `validateMp4Buffer` call AND exactly one `READY` write, and it follows" (ESC-4) | Additive — strictly narrows what can pass, catching the exact blind spot that let T-06-09 go undetected by the pre-audit invariant |
| `5888045` | `06-SECURITY.md` (new file) | Threat register, 21 threats + 2 audit-surfaced (T-06-05, T-06-09), 3 new accepted risks (AR-03/04/05), `threats_open: 0` | Documentation |

**Verdict on "fixes are genuine, not just claimed" :** Confirmed independently, not taken on SUMMARY/06-SECURITY.md's word.
- `withTimeout`: read directly in `veo.ts` (lines 97-111) — a real `Promise.race`-shaped wrapper with `clearTimeout` on both resolution paths, not a stub. Its own 4 unit tests were re-run live (below) and exercise the exact cleanup/cancellation invariant that matters here (timer cleared on early resolve, so no stray rejection after the promise it wraps has already settled) — this is genuine behavioral evidence, not presence-only.
- `generate-video.ts`'s two rewritten branches: read directly (lines 359-374 for `downloadFailed`, lines 396-431 for the readback-failure branch) — both now write `FAILED` + `setVideoSaveCorrupted` + `CORRUPT_VIDEO_MESSAGE`, never `READY`. Grepped the whole file: `SceneAssetStatus.READY` appears exactly once (line 474, the validated success path); `validateMp4Buffer(` appears exactly once (line 441) — matches `check-boundaries.ts` invariant 10's own exact-count requirement, live-confirmed OK below.
- `check-boundaries.ts` invariant 10 hardening: read the diff directly (`git show e1d9443 -- src/scripts/check-boundaries.ts`) — the old shape used `lastIndexOf`, which is exactly what let a second, earlier, unvalidated `READY` write (T-06-09) go undetected; the new shape counts occurrences of both `validateMp4Buffer(` and `SceneAssetStatus.READY` and requires exactly 1 of each. This is a real tightening, not a cosmetic comment change.
- `httpOptions.timeout` removal from the download call: confirmed the call site (`veo.ts` line 231-239) no longer passes a `config`/`httpOptions` argument to `ai.files.download()`, only `file` and `downloadPath` — matches the commit message's claim exactly. Invariant 8 (every `@google/genai`-importing provider file must set a `timeout:` key somewhere in the file) is a file-level check, not a per-call-site check — `veo.ts` still sets `httpOptions: { timeout: VIDEO_HTTP_TIMEOUT_MS }` on its two other calls (`generateVideos`, `getVideosOperation`), so removing it from the download call does not regress invariant 8 (confirmed by reading the invariant's implementation, not assumed).

## Live Checks Re-run Against Current HEAD (5888045)

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Full test:lib suite (unit tests + check-boundaries + secrets-audit) | `npm run test:lib` | 324/324 pass, 0 fail (4 more than the prior pass's 320 — the new `withTimeout` tests) | ✓ PASS |
| Structural boundary gate, incl. hardened invariant 10 | (run as part of `test:lib`) | `OK: generate-video.ts's success-path READY write is unreachable before its validateMp4Buffer call` — all other 13 boundary lines also `OK`, none `FAILED` | ✓ PASS |
| Secrets audit | (run as part of `test:lib`) | `SECRETS AUDIT OK: all 5 checks passed.` | ✓ PASS |
| Type check | `npm run typecheck` | Clean, zero `error TS` output | ✓ PASS |
| Production build | `npm run build` | `Compiled successfully in 1240ms`, 4 static pages generated, zero errors | ✓ PASS |
| Exact-count regression check: one `READY` write, one `validateMp4Buffer` call | `grep -c` on `generate-video.ts` | `SceneAssetStatus.READY` → 1, `validateMp4Buffer(` → 1 | ✓ PASS |
| No debt markers introduced | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across the 5 touched source files | No matches | ✓ PASS |

No regressions found. All checks that passed in the prior verification still pass on current HEAD; both fixes are genuinely present and behaviorally correct in the diffs (not just claimed in SUMMARY/06-SECURITY.md prose).

## Goal Achievement (Full Re-check)

Re-verified all 4 must-have truths from the prior pass against current HEAD — not merely diffed against the 3 new commits — since a re-verification must independently confirm the whole must-haves list, not just the delta.

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A provider failure (error, timeout, rate limit, malformed response) is caught and shown to her in plain language, leaving only the affected scene in a clearly failed-but-retryable state without corrupting any other scene's data. | ✓ VERIFIED (strengthened) | All prior evidence stands (unchanged: `VideoBlockKind`, `blockStage` propagation, `provider-timeouts.ts`'s three HTTP timeout constants at the six `@google/genai` call sites). **New this pass:** the download phase — previously the one genuinely unbounded call in the whole provider layer, since `ai.files.download()` carried no timeout of any kind before `4fcc1cb` — is now bounded by `withTimeout(..., VIDEO_DOWNLOAD_TIMEOUT_MS, ...)`, closing the one gap where a stall could wedge `serializeDispatch`'s shared queue for every future paid dispatch app-wide (T-06-05), not just video. `withTimeout`'s cancellation/cleanup behavior (timer cleared on early resolution, so no stray timeout fires after the wrapped promise settles) is directly exercised by 4 passing unit tests, re-run live this pass — this is genuine behavioral evidence for a state-transition/cleanup invariant, not presence-only. A download failure/timeout surfaces as `{ downloadFailed: true }`, a result field (not a thrown error), so `dispatchSceneVideo`'s own spend-recording logic still runs — the scene is marked `FAILED` with the plain-language `CORRUPT_VIDEO_MESSAGE`, isolated to that one scene. |
| 2 | If a required API key is missing, the app still starts and clearly explains to her what's missing, never crashing with a stack trace and never exposing secret values in the browser. | ✓ VERIFIED (unchanged) | None of the 3 delta commits touch `provider-key.ts`, `missing-key-probe.ts`, or any of the 5 gated dispatch sites (confirmed via `git show --stat` on all 3 commits). All prior evidence stands unmodified. |
| 3 | API keys live only in server-side configuration, are never sent to client-side JavaScript, and never appear in logs or generated story metadata; `.env.local` is gitignored with only a placeholder-filled `.env.local.example` committed. | ✓ VERIFIED (unchanged) | None of the 3 delta commits touch `.gitignore`, `secrets-audit.ts`, or `log-response.ts`. `SECRETS AUDIT OK: all 5 checks passed` re-run live this pass, unchanged result. |
| 4 | Every saved video file is confirmed to be a valid, non-empty, playable MP4 at approximately the requested duration and 9:16 dimensions when requested — never a text or image file mislabeled as `.mp4`. | ✓ VERIFIED (strengthened, prior gap closed) | `mp4-validation.ts` itself is unchanged. **New this pass:** the one branch that previously bypassed validation entirely — a readback failure after a successful download wrote `READY` with the real path and no `validateMp4Buffer` call at all (T-06-09) — now writes `FAILED` + `setVideoSaveCorrupted`, never `READY`. `SceneAssetStatus.READY` now appears exactly once in the whole file (grep-confirmed: count = 1), matching `validateMp4Buffer(`'s own single occurrence (count = 1), and `check-boundaries.ts` invariant 10 was hardened from a last-occurrence-position check to an exact-count-of-one check specifically because the old shape is what let this exact bypass go undetected (ESC-4) — re-run live this pass, `OK`. This closes a real, previously-live gap in OUTPUT-02's own guarantee, not a theoretical one: before this fix, an unvalidated file genuinely could have reached `READY` and then her CapCut folder. |

**Score:** 4/4 truths verified (0 present, behavior-unverified), 0 regressions from the prior pass. Two of the four truths (RELIABILITY-01-mapped truth 1, OUTPUT-02-mapped truth 4) are now measurably stronger than at the prior "passed" verification — both close a genuinely live gap the phase's own follow-up security audit found, not a defensive tightening against a hypothetical.

### Required Artifacts (Spot Re-check on Delta-Touched Files)

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/providers/video/veo.ts` | `withTimeout` helper wrapping the download call; download call carries no `httpOptions.timeout` (ESC-1 correction) | ✓ VERIFIED | Both confirmed by direct read; 4 unit tests pass live |
| `src/core/config/provider-timeouts.ts` | `VIDEO_DOWNLOAD_TIMEOUT_MS` constant, corrected comment | ✓ VERIFIED | Present, comment matches the verified SDK mechanism per `git show` |
| `src/app/actions/generate-video.ts` | `downloadFailed` branch (FAILED, not READY); readback-failure branch rewritten (FAILED, not READY) | ✓ VERIFIED | Both branches read directly; exactly one `READY` write remains in the file |
| `src/scripts/check-boundaries.ts` | Invariant 10 hardened to exact-count | ✓ VERIFIED | Diff read directly; live run reports `OK` |
| `.planning/phases/06-reliability-secrets-hygiene-output-correctness/06-SECURITY.md` | Threat register, `threats_open: 0`, T-06-05/T-06-09 documented as closed with a two-pass audit trail | ✓ VERIFIED | Present; frontmatter `status: verified`, `threats_open: 0`; both threats' dispositions cross-checked against the actual diffs above, not taken on the document's word |
| All other Phase 6 artifacts (unchanged since prior pass) | — | ✓ VERIFIED (carried forward) | No commit since the prior pass touches `provider-key.ts`, `missing-key-probe.ts`, `secrets-audit.ts`, `log-response.ts`, `.gitignore`, `mp4-validation.ts`, `gates.ts`, `prisma/schema.prisma` — confirmed via `git show --stat` on all 3 delta commits |

### Key Link Verification (Delta-Relevant Only)

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `veo.ts` `ai.files.download()` call | `withTimeout(..., VIDEO_DOWNLOAD_TIMEOUT_MS, "video download timed out")` | direct wrap | ✓ WIRED | veo.ts:231-239 |
| `withTimeout` catch block | `{ downloadFailed: true }` result field | direct return, not a throw | ✓ WIRED | veo.ts:240-264 — confirmed the catch does not re-throw |
| `generate-video.ts` `result.downloadFailed` | `SceneAssetStatus.FAILED` + `setVideoSaveCorrupted` + `CORRUPT_VIDEO_MESSAGE` | direct branch, positioned before the `result.blocked \|\| !result.filePath` check | ✓ WIRED | generate-video.ts:359-374, ordering comment at 376-384 explains why the position matters |
| `generate-video.ts` readback `catch` block | `SceneAssetStatus.FAILED` + `setVideoSaveCorrupted` + `CORRUPT_VIDEO_MESSAGE` (no longer `READY`) | direct branch rewrite | ✓ WIRED | generate-video.ts:396-431 |
| `check-boundaries.ts` invariant 10 | `generate-video.ts`'s exact `READY`/`validateMp4Buffer` counts | static text-count analysis | ✓ WIRED | Re-run live, `OK` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| `withTimeout` resolves with the inner value before the deadline | `npm run test:lib` (includes `veo.test.ts`) | `✔ withTimeout resolves with the inner promise's value when it settles before the deadline` | ✓ PASS |
| `withTimeout` passes through the inner rejection, not its own timeout message, when the inner promise rejects first | `npm run test:lib` | `✔ withTimeout rejects with the inner promise's own rejection reason, not the timeout message, when the inner promise rejects first` | ✓ PASS |
| `withTimeout` rejects with the timeout message when the inner promise never settles | `npm run test:lib` | `✔ withTimeout rejects with the timeout message when the inner promise never settles before the deadline` | ✓ PASS |
| `withTimeout`'s timer is cleared on early resolution (no stray rejection after settling — the cleanup invariant this fix depends on) | `npm run test:lib` | `✔ withTimeout's timer does not fire after an early resolution (no unhandled rejection)` | ✓ PASS |
| Full test:lib suite | `npm run test:lib` | `tests 324 / pass 324 / fail 0` | ✓ PASS |
| Type check | `npm run typecheck` | Clean | ✓ PASS |
| Production build | `npm run build` | Compiled successfully, 4 static pages | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| STARTUP-02 | 06-01 | Missing API key: app still starts, explains itself, no crash/leak | ✓ SATISFIED (unchanged) | Untouched by the delta; prior pass's evidence stands |
| SECURITY-01 | 06-01, 06-05 | Keys server-side only, never in logs/browser, `.env.local` hygiene | ✓ SATISFIED (unchanged) | Untouched by the delta; `secrets-audit.ts` re-run live, unchanged result |
| RELIABILITY-01 | 06-02, 06-03, 06-04 | Provider failures classified and shown in plain language, scene isolation | ✓ SATISFIED (strengthened) | The one previously-unbounded provider call (video download) is now timeout-bounded; a stall/error is caught, classified, and isolated to the one scene without wedging the shared dispatch queue app-wide |
| OUTPUT-02 | 06-03, 06-04, 06-05 | Every saved video is a genuine, non-empty, playable, 9:16 MP4 | ✓ SATISFIED (strengthened, prior gap closed) | The one branch that could previously reach `READY` without validation now cannot — exactly one `READY` write remains in the file, structurally enforced by the hardened invariant 10 |

No orphaned requirements — `.planning/REQUIREMENTS.md` maps exactly these 4 requirement IDs to Phase 6 (lines 121, 145, 146, 150), all marked `[x]`/`Complete`, unchanged by this delta.

### Anti-Patterns Found

None. Scanned the 5 source files touched by the 3 delta commits (`veo.ts`, `veo.test.ts`, `provider-timeouts.ts`, `generate-video.ts`, `check-boundaries.ts`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` — zero matches.

### Security Audit (Independently Read, Not Just Cited)

- **06-SECURITY.md**: 21 original threats + T-06-05/T-06-09 (found open by pass 1, closed same-day, confirmed closed by an independent pass 2) = 0 open. Pass 2 also escalated one factual correction to the T-06-05 fix's own justifying comment (ESC-1, addressed in `e1d9443`) and hardened invariant 10 (ESC-4, also in `e1d9443`) — both independently re-confirmed against the live diffs above, not taken on the document's word. Three new accepted risks (AR-03, AR-04, AR-05) surfaced during the T-06-05 investigation, all below the `high` block threshold, all explicitly noted as not affecting `checkBudget`'s hard ceiling — read in full; rationale is specific to this codebase's actual SDK behavior (empirically verified per the document, not assumed), not boilerplate.
- **Sign-off checklist** in 06-SECURITY.md: all 4 items checked, `threats_open: 0` in frontmatter, `status: verified`.

### Gaps Summary

None. This re-verification independently confirmed (not merely cited) that the 3 commits landed since the prior "passed" verification genuinely close two real, previously-open findings from the phase's own follow-up security audit (T-06-05: unbounded video download that could wedge the shared dispatch queue app-wide; T-06-09: an unvalidated file that could reach `READY` and her CapCut folder) without introducing any regression to the 4 previously-verified truths. Both fixes strengthen exactly the two requirements the task anticipated (RELIABILITY-01 via the new download timeout bound, OUTPUT-02 via closing the one path that bypassed MP4 validation) and neither weakens STARTUP-02 or SECURITY-01, which remain untouched by the delta. The correction commit (`e1d9443`) itself demonstrates a genuine second-pass audit catching and fixing a factual error in the first fix's own comment (the SDK's `httpOptions.timeout` claim) plus a real hardening of the structural invariant that let T-06-09 go undetected in the first place — both independently re-verified against the live diff, not taken on the audit document's word. The full `test:lib` suite (324/324, 4 more tests than the prior pass), `typecheck`, and `build` all ran clean during this verification session.

---

_Verified: 2026-09-22T00:00:00Z_
_Verifier: Claude (gsd-verifier)_

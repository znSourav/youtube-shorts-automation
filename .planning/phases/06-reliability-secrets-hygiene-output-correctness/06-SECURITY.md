---
phase: "06"
slug: "reliability-secrets-hygiene-output-correctness"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-22"
---

# Phase 06 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Server Action return value → browser | The only channel from server to client; every string crossing it must be pre-approved plain language | Plain-language text, booleans -- never a path, prompt, model id, or story id |
| `process.env` → provider modules | Where the raw API key lives; must never be read outside a server-only module | The API key value itself |
| Provider response → server console | Where `logRawResponse` prints; redaction is the control | Raw provider JSON, redacted before printing |
| Working tree → git history | Where `.env.local` must never cross | The real API key |
| Provider download → local filesystem | Where a non-video payload, or an unbounded/failed transfer, could reach a scene's video path | Downloaded MP4 bytes |
| Local filesystem → scene READY status | Where a mislabeled or unvalidated file could be promoted to a usable asset | A validated (or, before this audit's fix, sometimes unvalidated) byte buffer |
| Validation verdict → browser message | Where byte counts, dimensions, and container terminology could leak | A fixed plain-language sentence only |
| Provider HTTP request → shared `serializeDispatch` queue | Where one unbounded request starves every future paid dispatch app-wide | Nothing crosses a process boundary; the risk is in-process queue starvation |
| npm registry → `node_modules` | Where a supply-chain substitution could enter the build | `mp4box` package contents |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-06-01 | Information Disclosure | `MISSING_API_KEY_MESSAGE` return path | high | mitigate | Fixed exported constant, never `err.message`; forbidden-substring test | closed |
| T-06-02 | Information Disclosure | `isSecretKey` in `src/lib/log-response.ts` | high | mitigate | Path-scoped exemption (post-WR-01), still redacts key/authorization-shaped names inside `usageMetadata`; regression tests | closed |
| T-06-03 | Information Disclosure | `src/core/config/` reachability from client bundle | medium | mitigate | check-boundaries.ts invariant 1 includes `core/config` | closed |
| T-06-04 | Information Disclosure | `.env.local.example` drift | medium | mitigate | `secrets-audit.ts` check 4, exact-placeholder compare | closed |
| T-06-05 | Denial of Service | `ai.files.download()` in `veo.ts`, inside `serializeDispatch` | high | mitigate | Whole call wrapped in a manual `withTimeout` race (120s); a stall or error returns `downloadFailed: true` instead of throwing, so spend still records. See Audit Trail note below for a mid-audit correction to this fix's own reasoning. | closed |
| T-06-06 | Information Disclosure | Raw `blockReason`/RAI reason/`detail` reaching browser | high | mitigate | Five named exported constants; `blockReason` only equality-compared, never interpolated; forbidden-substring tests | closed |
| T-06-07 | Tampering | Retry-cap increment conditional on failure cause (D-02) | medium | mitigate | check-boundaries.ts invariant 9, exact-count + ordering | closed |
| T-06-08 | Denial of Service | Timeout too tight, aborting a legitimate slow call | medium | accept | Deliberately generous named constants; post-abort retry still passes `checkBudget` | closed |
| T-06-SC | Tampering | `mp4box` npm install | high | mitigate | Pinned `2.4.1`, registry-resolved + SHA-512 integrity, BSD-3-Clause, no `preinstall`/`install`/`postinstall` | closed |
| T-06-09 | Spoofing | Unvalidated file promoted to READY | high | mitigate | The readback-failure branch no longer writes READY at all -- FAILED + D-05 exemption instead, mirroring the failed-validation branch. Exactly one `SceneAssetStatus.READY` write remains in the file (grep-confirmed and now structurally enforced by invariant 10 -- see ESC-4 below). | closed |
| T-06-10 | Information Disclosure | `Mp4ValidationResult.reason` reaching browser | medium | mitigate | `reason` only to `console.error`; browser gets fixed `CORRUPT_VIDEO_MESSAGE`; exclusion test | closed |
| T-06-11 | Tampering | New Scene columns widening browser exposure | low | accept | Server-side decision code only; derived booleans exposed, no raw column value | closed |
| T-06-12 | Denial of Service | Malformed buffer hanging the container parser | low | accept | Synchronous, try-wrapped parse; minimum-size/signature pre-filters reject cheap garbage first | closed |
| T-06-13 | Elevation of Privilege | D-05 cap-bypass exemption, unbounded retries | high | mitigate | One-shot exemption cleared before every paid call; CR-01 fix (regenerate-scene-image.ts) confirmed closing an ordering gap that could have let a missing key spend the exemption for nothing; `checkBudget` unchanged | closed |
| T-06-14 | Elevation of Privilege | New branches bypassing APPROVAL-01 | high | mitigate | Approval guard strictly precedes cap guard in both single and batch paths; dedicated test | closed |
| T-06-15 | Tampering | Exemption inferred from browser state | medium | mitigate | Flag read only off the server-fetched `StoryWithScenes` row; no client-supplied value reaches either gate function | closed |
| T-06-16 | Information Disclosure | Save-failure message leaking filesystem detail | medium | mitigate | Fixed sentence, no path/error/byte count; underlying error stays in `console.error` | closed |
| T-06-17 | Information Disclosure | New status-row fields widening browser exposure | low | accept | Booleans derived server-side; the raw timestamp itself never returned | closed |
| T-06-18 | Information Disclosure | `page.tsx` duplicating the MP4-validation message | medium | mitigate | Sentence duplicated verbatim rather than imported; no `mp4-validation` import in any `.tsx` file. See ESC advisory note below -- the automated gate this claim relies on is narrower than the plan described. | closed |
| T-06-19 | Spoofing | Pre-migration row reported as stuck | low | mitigate | Explicit non-null check on the recorded start time precedes the elapsed comparison | closed |
| T-06-20 | Information Disclosure | Checkpoint exposing the real key during `.env.local` rename | medium | mitigate | Performed live this phase: 8/8 checklist items PASS (06-05-SUMMARY.md); rename-not-edit, contents never printed, bundle searched for a prefix only | closed |

**threats_open: 0** -- 21 of 21 original threats closed. T-06-05 and T-06-09 were found OPEN by the first audit pass (below), fixed same-day, and confirmed closed by a second, independent audit pass.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03 | ESC-2 (new, surfaced during T-06-05's fix) | The installed SDK's file downloader pipes an HTTP response body into a write stream via a bare `.pipe()` with no `error` listener of its own -- a genuine network error on that stream (not just the timeout case veo.ts explicitly guards against) is an unhandled `Readable` `error` event, which Node treats as an uncaught exception. Empirically confirmed this pre-dates Phase 6 entirely: it is a latent characteristic of `@google/genai`'s own download implementation, not something this phase's fix introduces or worsens -- the fix deliberately does NOT pass `httpOptions.timeout` to this call specifically to avoid adding a *new*, deliberate trigger for it (see veo.ts's comment above the download call). Next.js registers a process-level `uncaughtException` handler that logs rather than crashes (`node_modules/next/dist/server/lib/router-server.js`), so the dev server observed in this project should survive such an event -- but this was not independently re-verified against this specific app's own runtime wiring beyond reading that handler exists in the framework. Severity: medium (below the `high` block threshold) because a genuine mid-download network error is rare relative to the timeout path already handled, and the worst case (an unrecorded, already-billed Veo call) is a spend-tracking drift, not an uncontrolled overspend -- `checkBudget`'s hard ceiling is unaffected either way. | Project owner (via GSD phase planning + this audit) | 2026-09-22 |
| AR-04 | ESC-3 (new, surfaced during T-06-05's fix) | `withTimeout`'s external race cannot cancel the SDK's underlying download stream (the SDK exposes no handle for that, and hand-rolling the download to gain one would abandon this codebase's explicit "don't hand-roll download/auth-header wiring" convention for a low-value gain). A download that stalls past the 120s deadline leaves one open file descriptor and one partial file at the scene's own deterministic output path until the OS-level connection eventually drops or the process exits. Severity: low -- the leak is bounded (one fd per stalled download, not unbounded), self-limiting (a retry overwrites the same deterministic path), and does not affect money-safety or secrets. | Project owner (via GSD phase planning + this audit) | 2026-09-22 |
| AR-05 | ESC-5 (new, surfaced during T-06-05's fix) | A download failure now grants the D-05 one-shot free-retry exemption (`setVideoSaveCorrupted`), same as a failed validation verdict. Under a *persistent* download failure (e.g. a network path that deterministically cannot reach the download host), every retry re-spends the exemption via `clearVideoSaveCorrupted` instead of incrementing `videoAttempts`, so the 3-attempt cap never engages for that scene. This is D-05's existing one-shot design (Phase 6, 06-04) extended from a rare local hiccup to a now-plausible deterministic trigger, not a new mechanism. `checkBudget`'s hard $15 ceiling is the unaffected backstop regardless -- each retry still costs real Veo generation money and is still gated by it, so the project's core "never exceed budget" guarantee holds; the practical effect of this risk is at most "she can burn budget faster than 3 attempts would normally allow against one stubborn scene," not an uncapped spend. Severity: medium (below the `high` block threshold). | Project owner (via GSD phase planning + this audit) | 2026-09-22 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-22 (pass 1) | 21 | 19 | 2 | gsd-security-auditor (opus), register authored at plan time across all 5 plans |
| 2026-09-22 (pass 2, targeted re-verification) | 2 (T-06-05, T-06-09 only) | 2 | 0 | gsd-security-auditor (opus), independent re-check against the fix commit |

**Pass 1 findings (T-06-05, T-06-09):** both genuinely open, not theoretical. T-06-05: `veo.ts`'s `ai.files.download()` call (unlike the other six Google GenAI call sites in this codebase) carried no timeout at all -- a stall would wedge `serializeDispatch`'s shared queue for every future paid dispatch app-wide, not just video. T-06-09: `generate-video.ts`'s readback-failure branch wrote `SceneAssetStatus.READY` with the real path whenever the just-downloaded file could not be read back for its inline preview, without ever calling `validateMp4Buffer` -- a leftover from before OUTPUT-02's validation existed, invisible to invariant 10's original last-occurrence-only check. Both fixed same-day (commit `4fcc1cb`) and confirmed present, correctly placed, and effective by pass 2.

**Pass 2 escalation (ESC-1):** pass 2 confirmed both threats closed but escalated one factual error in the T-06-05 fix's own justifying comment: it claimed `httpOptions.timeout` does not cover `ai.files.download()`'s body-transfer phase at all. Verified wrong for the installed SDK (`@google/genai`'s `ApiClient.apiCall` deliberately keeps the abort armed through body consumption, per its own source comment) -- but pass 2 also independently, empirically confirmed (a faithful replica of the SDK's pipe/finished sequence run on this project's Node version) that the abort's resulting stream error does not propagate through the SDK's bare `.pipe()` to settle `finished(writer)` either way, so the SDK's own timeout cannot unblock this call regardless of whether it fires. Net effect: the manual `withTimeout` wrapper was, and remains, genuinely necessary (the fix's conclusion was right), but passing `httpOptions.timeout` to this specific call was net-negative -- it added a real crash risk (an unhandled `Readable` `error` event on abort, AR-03 above) for a bound that couldn't have helped anyway. Corrected same-day (commit `e1d9443`): the timeout config removed from this one call site, both comments rewritten to state the verified mechanism, `provider-timeouts.ts`'s constant comment corrected.

**Pass 2 hardening (ESC-4):** invariant 10's original shape (verify the *last* `SceneAssetStatus.READY` occurrence follows `validateMp4Buffer`) is exactly what let T-06-09 survive undetected -- an earlier, unvalidated READY write existed in the same file, and the last-occurrence check never saw it. Hardened same-day (commit `e1d9443`) to require an exact count of one, mirroring invariant 9's own pattern; the stale doc paragraph describing the now-removed second write was rewritten. This closes the specific blind spot a second write anywhere in the file created; it still cannot prove the single surviving write is unconditionally reachable from every branch (that needs real control-flow analysis, not a text-order check) -- 06-REVIEW.md's WR-04 remains the tracking item for that deeper, deliberately-deferred redesign.

**ESC-2, ESC-3, ESC-5:** newly surfaced during pass 2's investigation of the T-06-05 fix, not present in the original 21-threat register (no `## Threat Flags` section exists in any Phase 6 SUMMARY.md -- the register was authored entirely at plan time, so nothing corrects for surface discovered during implementation or its own follow-up fix). All three are below the `high` block threshold; recorded as AR-03, AR-04, AR-05 above rather than left as unregistered gaps. None affects `checkBudget`'s hard ceiling.

**ESC advisory note (T-06-18, not a threat-register gap):** pass 1 also noted that `06-05-PLAN.md`'s claim "`npm run build` and `check-boundaries.ts` both gate this" (the client-side message duplication staying safe) overstates check-boundaries.ts invariant 1's actual forbidden-import list, which does not include `core/output`. The threat is closed today by convention only (confirmed no such import exists), with no regression net if one were added later. No code change made; recorded for awareness, matching this project's existing convention of noting a claim/reality gap rather than silently accepting it (05-SECURITY.md's T-05-11 precedent).

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-22

---
phase: "04"
slug: "wife-facing-review-approval-flow"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-09-16"
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|----------------|
| browser → Server Action | `storyId`/`sceneNumber` arrive as untrusted, client-supplied serialized arguments on every action in this phase (approve, regenerate, generate-video, generate-all-videos, retry, get-status, open-folder, list-stories) | story/scene identifiers, never trusted as authorization |
| Server Action → paid provider (Veo, Gemini Image) | crossing this boundary spends real money against the project's hard budget ceiling | approval state, retry-cap counters, estimated cost |
| Server Action → SQLite | a client-supplied id becomes a query key and, elsewhere in the app, a directory name | story/scene rows, approval timestamp, attempt counters, asset paths |
| Server Action → local filesystem (write) | the episode export creates, overwrites, and removes files under a directory named by a client-supplied id | copied video/image bytes, written story.json/story.txt |
| Server Action → operating system | the single highest-consequence boundary in this phase: a string becoming an argument to a spawned process | an absolute directory path, passed to `execFile("explorer.exe", [...])` |
| Server Action → browser | every returned field from every action in this phase is a candidate for leaking a filesystem path, model id, or story id | plain-language messages, booleans, counts — never raw provider/DB internals by contract |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-04-01 (04-01) | Elevation of Privilege | `generateSceneVideoAction` / any Veo call site | high | mitigate | Approval check is branch 2 of `evaluateVideoDispatch`, called at the top of the only function that dispatches Veo (now `dispatchSceneVideo`, wrapped by the app-wide `generateSceneVideoAction` mutex added in this session's sixth code-review pass); `check-boundaries.ts` invariant 5 makes a second call site a failing structural gate | closed |
| T-04-01 (04-02) | Elevation of Privilege | approval state written by a path other than the wife's explicit action | high | mitigate | `markImagesApproved` is the only writer of `imagesApprovedAt`, called from exactly one action (`approveStoryImagesAction`) that runs `evaluateApproval` first; no function anywhere clears the column | closed |
| T-04-01 (04-03) | Elevation of Privilege | `generateAllVideosAction` and `retrySceneVideoAction` as Veo callers | high | mitigate | Neither reaches Veo directly; both route through `generateSceneVideoAction`. `retrySceneVideoAction` is a one-line delegation with no logic of its own; `check-boundaries.ts` invariant 5 fails the build if either file imports the provider directly | closed |
| T-04-03 (04-01) | Information Disclosure | refusal messages returned to the browser | medium | mitigate | Every `gates.ts` branch returns a fixed plain-language sentence; `gates.ts` has no access to a path except `scene.imagePath`, returned only on `allowed: true`, consumed internally and never crossing back as a path | closed |
| T-04-03 (04-02) | Information Disclosure | `RegenerateSceneImageResult` crossing back to the browser | medium | mitigate | The result type declares no path-shaped field; `LoadStorySuccess` gains a boolean `imagesApproved`, never the raw timestamp | closed |
| T-04-03 (04-03) | Information Disclosure | `getStoryStatusAction` polled every three seconds | medium | mitigate | `SceneVideoStatusRow` declares no path-shaped field; the action reads no files and builds no data: URLs; ready media is fetched through the existing `loadStoryAction` transport, which already guarantees a data: URL | closed |
| T-04-03 (04-04) | Information Disclosure | `EpisodeOutputResult` and `ListStoriesResult` crossing back to the browser | medium | mitigate | Neither type has a path-shaped field; a dedicated test asserts no `LibraryStoryRow` key matches `/path/i` | closed |
| T-04-04 (04-01) | Denial of Service (spend exhaustion) | per-scene retry click-loop | high | mitigate | `Scene.videoAttempts` checked at the same dispatch point as approval; `incrementVideoAttempt` (this session's WR-02/fifth-pass fix) runs immediately before the real Veo dispatch, so a purely local failure never consumes an attempt while a dispatched call always does | closed |
| T-04-04 (04-02) | Denial of Service (spend exhaustion) | repeated "Regenerate this image" clicks on one stuck scene | high | mitigate | `evaluateImageRegeneration` refuses at the attempt cap; `incrementImageAttempt` runs before dispatch (WR-06, second code-review pass); the client disables every regenerate control while one is in flight | closed |
| T-04-04 (04-03) | Denial of Service (spend exhaustion) | repeated "Generate All Videos" presses, or a retry loop on one scene | high | mitigate | Substantially hardened beyond the plan-time mitigation during this session's code review: `evaluateBatchDispatch` excludes READY/GENERATING/at-cap scenes (fourth pass); `evaluateVideoDispatch` additionally refuses an already-READY scene (fourth pass); a story-scoped in-flight guard (`storiesWithRunningBatch`) refuses a second concurrent batch for the same story outright (fourth pass, reserved synchronously before any `await`, independently proven with a standalone concurrency script); an app-wide dispatch mutex (`videoDispatchChain`, CR-03, second pass) guarantees at most one paid video call is ever mid-flight, closing a real TOCTOU race between the batch and a manual retry that could otherwise have exceeded the budget ceiling | closed |
| T-04-05 (04-01/02/03) | Tampering | client-supplied `sceneNumber` addressing another story's scene | medium | mitigate | The scene is always resolved from the already-loaded `story.scenes` array for that `storyId`; the write path uses the `[storyId, sceneNumber]` compound unique key; `storyDir(storyId)` rejects any id outside `^[a-z0-9-]+$` before any query runs | closed |
| T-04-06 (04-03) | Denial of Service (stuck state) | an `after()` callback dropped by a process restart mid-batch | medium | mitigate | `Scene.videoStatus` is written GENERATING before dispatch, so an interrupted scene is visibly in flight; `STUCK_AFTER_MS` surfaces a retry affordance past twelve minutes. Known, documented residual limitation (recorded in STATE.md's decision log, sixth code-review pass): the stuck-detector's own clock is client-side only and resets on reload — tracked for a future phase, not a data-integrity or spend risk | closed |
| T-04-07 (04-04) | Tampering (command injection) | `openStoryFolderAction` → `execFile("explorer.exe", [...])` | high | mitigate | `storyDir(storyId)` runs first and throws on any id outside `^[a-z0-9-]+$`, so no separator, dot-segment, quote, or shell metacharacter can survive into the argument; `execFile` passes an argument array with no shell, so no quoting layer exists to exploit even if validation were bypassed; `check-boundaries.ts` invariant 6 makes a second process-spawning call site a failing structural gate | closed |
| T-04-08 (04-04) | Tampering (path traversal on write) | `exportEpisodeAssets`'s `copyFileSync`/`writeFileSync`/`rmSync` targets | high | mitigate | Every destination is produced by a `storage-paths.ts` builder routing through `assertValidStoryId`/`assertValidSceneNumber`, throwing rather than concatenating; every source is the database's own recorded path for a scene of that same story, never a client string; a bad id produces no write at all — asserted by test | closed |
| T-04-09 (04-04) | Tampering (stale artifact) | a clip left in `output/` for a scene no longer ready | medium | mitigate | Every export removes the clip of any scene it places in `clipsMissing`; the removal target is built by `outputClipPath` from a scene number already present in the loaded row, so it cannot address anything outside that story's own output directory. Extended in this session's sixth code-review pass: a story that recorded a real asset but whose directory has vanished now reports `folderMissing` and writes nothing, rather than silently recreating an empty shell | closed |
| T-04-10 (04-04) | Information Disclosure | `story.json`/`story.txt` written in plaintext to local disk | low | accept | Single-user local tool on the requester's own Windows machine, no accounts, no network exposure, no secrets in the payload — only the wife's own story content, which the original brief explicitly asks to be written there; no API key, model id, or credential included | closed (accepted) |
| T-04-11 (04-04) | Denial of Service (list growth) | `listStoriesAction` reading every story row on every Library visit | low | accept | Single local user producing a handful of stories per month against SQLite; the query selects five narrow columns with no scene bodies and no file reads | closed (accepted) |
| T-04-SC (all plans) | Tampering | npm/pip/cargo installs | high | accept | No package-manager install task exists in any of the four plans; 04-RESEARCH.md's Package Legitimacy Audit records zero proposed packages for this phase | closed (accepted) |

*Status: open · closed · open — below `high` threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` (`high`) count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| AR-04-01 | T-04-10 | Plaintext story documents on local disk, single-user machine, no secrets in payload — see mitigation column | Project owner (docs/original-brief.md §23 requires these documents) | 2026-09-16 |
| AR-04-02 | T-04-11 | Unpaginated Library list at single-user, low-volume scale | Project owner (documented, low-cost future change if ever needed) | 2026-09-16 |
| AR-04-03 | T-04-SC | No package installs occurred in any of this phase's four plans | Project owner (per 04-RESEARCH.md Package Legitimacy Audit, zero proposed packages) | 2026-09-16 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|----------------|--------|------|--------|
| 2026-09-16 | 17 (across 4 plan-time threat registers, several categories recurring per plan) | 17 | 0 | Claude (orchestrator, register-authored-at-plan-time short-circuit path: ASVS level 1, `register_authored_at_plan_time: true` for all four plans, ASVS-L1 grep-depth verification already performed independently — and more thoroughly than a fresh L1 pass would achieve — across this session's six-pass code review, which read and re-verified every mitigation's live implementation multiple times: `evaluateVideoDispatch`/`evaluateApproval`/`evaluateImageRegeneration`/`evaluateBatchDispatch` in `gates.ts`, `check-boundaries.ts`'s all six structural invariants, `storage-paths.ts`'s `assertValidStoryId`/`assertValidSceneNumber`, `open-story-folder.ts`'s `execFile` argument-array call, `episode-export.ts`'s path-validated writes and stale-clip removal, and the CR-03/fourth-pass spend-ceiling concurrency mutex and story-scoped batch guard added during this session specifically to close a real DoS/spend-exhaustion gap the original T-04-04 mitigation plans did not fully anticipate) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-16

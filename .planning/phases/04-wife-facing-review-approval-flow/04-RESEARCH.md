# Phase 4: Wife-Facing Review & Approval Flow - Research

**Researched:** 2026-09-14
**Domain:** Next.js App Router Server Actions + Prisma/SQLite persistence extension; no new external providers or packages
**Confidence:** HIGH (this phase extends four already-proven, already-read code modules from Phases 2-3 rather than introducing new technology)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (Approval mechanism):** Approval is a single, deliberate action the wife takes — an explicit "Approve these images" (or equivalent plain-language) control — not an automatic unlock that fires the moment every scene has an image. This is a real decision point distinct from "images finished generating," matching APPROVAL-01's strong "through any path, not just the visible UI" wording. Reversibility: reversible.
- **D-02 (Approval scope):** Approval is granted once, for the whole story's set of scene images together — not per-scene individual approvals. One "Approve" action covers every scene in that story. Video generation for the story is blocked (server-side, not just UI-disabled) until this single approval is recorded.
- **D-03 (Retry caps):** Each scene carries its own fixed numeric cap on both image regeneration attempts and video retry attempts — mirroring Phase 3's `MAX_UNIQUENESS_REGENERATION_ATTEMPTS` pattern (env-configurable, safe default on any malformed/absent value). This is NOT solely a budget-check limit (Phase 5's monthly budget gate is separate) — the point is protecting against an accidental click-loop burning money on one stuck scene, independent of remaining monthly ceiling.
  - Claude's/planner's discretion: exact numeric default (e.g. 3) and exact plain-language copy at cap-exhaustion — follow the established Phase-3-style pattern: calm, non-alarming, explains what happened and what she can still do, never a silent disable.
- **D-04 (Batch video trigger):** Video generation is triggered by a single "Generate All Videos" action (or equivalent) once the story is approved — not a per-scene individual trigger. This one action kicks off every approved scene's video generation, with each scene's job then tracked independently afterward (per-scene status, independent retry, one scene's failure never blocking or affecting another's).
- **D-05 (New screen):** The video-job status view is a genuinely new, dedicated fourth screen (create → review story → review+approve images → video status) — not an extension bolted onto the existing image-review screen. The image-review screen stays focused on reviewing/approving images; the new screen is purpose-built for watching video jobs progress, retrying failures, and reaching the finished output.

### Claude's Discretion

- Story Library (LIBRARY-01, soft requirement) was not selected for discussion this session. It remains one of the two items explicitly acceptable to document-as-limitation if the phase's other substantial work leaves no time. Research/planning should size it honestly against what the other four decisions already commit to (see "Story Library Sizing" below — sized SMALL, should not be the first thing cut).
- Exact numeric retry-cap default, exact plain-language copy for approval buttons/cap-exhaustion messages/status labels, and exact visual layout of the new fourth screen are research/planning/UI-design concerns, not put to the user this session. This phase is flagged `UI hint: yes` in ROADMAP.md — expect the plan-phase workflow's UI-SPEC gate to fire given the new fourth screen and approval flow are real new frontend surface.
- Output folder access (OUTPUT-01, OUTPUT-03) was not separately discussed; the existing `storage-paths.ts` scene-numbered convention already in place since Phase 2 is the natural foundation to build on rather than reinventing a new structure.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. No scope-creep topics came up.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| APPROVAL-01 | Video generation cannot start — through any path, not just the visible UI — until the wife has explicitly approved a story's scene images | See "Approval-State Persistence & Server-Side Gate" — new `Story.imagesApprovedAt` field, gate lives inside `generateSceneVideoAction` itself (the single dispatch point), not only in the new batch orchestrator |
| IMAGE-02 | Wife can regenerate a single scene's image without affecting any other scene's image, video, or status | See "Single-Scene Image Regeneration" — new `regenerateSceneImageAction(storyId, sceneNumber)`, loads scene/bible data server-side from DB rather than trusting client-supplied scene data |
| VIDEO-02 | Wife can generate videos for every approved scene, each tracked as an independent job with its own status | See "Batch Video Orchestration" — `after()`-based dispatch pattern, per-scene DB status as the source of truth, client polls a lightweight status-read action |
| VIDEO-04 | Wife can retry a single failed scene's video without regenerating any other scene, retry counts toward that scene's cap | See "Per-Scene Retry-Cap Persistence" and "Batch Video Orchestration" — `retrySceneVideoAction(storyId, sceneNumber)` reusing `generateSceneVideoAction`, resolving `imagePath` server-side (closes WINDOWS #7) |
| LIBRARY-01 (soft) | Wife can see a list of all past stories with title, date, status, scene count; open any to view details; no duplicates from normal use | See "Story Library Sizing" — sized SMALL: one list Server Action + one list screen, reusing existing `loadStoryAction`/review-images screen (read-only) for details; `Story.id` is already the DB primary key so no duplicate-entry risk exists structurally |
| OUTPUT-01 | Completed episode assets in a predictable folder structure, openable directly from the app | See "Output Folder Access" — `storage/stories/<id>/` already satisfies this; new `openStoryFolderAction` using `execFile("explorer.exe", [absolutePath])` |
| OUTPUT-03 | Output clips numbered so she can import into CapCut in the correct order, no extra tooling | See "Output Folder Access" — existing `storage/stories/<id>/scenes/NN/video.mp4` convention already zero-pads scene numbers; confirms whether this alone satisfies CapCut ordering or whether a consolidated copy step is needed |
| UI-01 | Full flow completable with only plain-language buttons/status text; errors explain what to do next, never developer/API terminology | See "UI-SPEC Gate Expectation" and every action's message-shape convention (all four existing Server Actions already follow this; new ones must too) |
</phase_requirements>

## Summary

Phase 4 is a pure extension of proven Phase 2/3 infrastructure — no new provider, no new npm package, no new external API. Every one of the five "especially investigate" areas has a concrete, low-risk answer grounded directly in code already in this repository: the approval gate is one nullable `DateTime` column on `Story` checked inside `generateSceneVideoAction` (the same place `checkCeiling` already lives); the retry caps are two `Int` counter columns on `Scene` checked the same way `maxRegenerationAttempts()` already works; the batch video trigger is solved by Next.js 15.1+'s now-stable `after()` API (confirmed present and supported for Server Functions on Node.js-server deployment in the installed Next.js 16.3.5), which lets one Server Action kick off N sequential per-scene video calls that continue running after the HTTP response returns, with the database (not the HTTP response) as the single source of truth the new fourth screen polls; the fourth screen is new frontend surface that will trigger the `/gsd-ui-phase` UI-SPEC gate at plan time; and Story Library is small enough (one list query + reuse of the existing detail view) that it should not be the first thing cut under time pressure.

The one structural bug this research surfaces that the planner must account for: `generateSceneVideoAction` currently takes a client-supplied `imagePath` string as a parameter (Phase 2 design, when only one scene ever existed). For VIDEO-02's batch dispatch and VIDEO-04's single-scene retry to work safely and to close WINDOWS #7 (a restored scene's video cannot currently be regenerated because the browser never holds a filesystem path, by design — T-03-15), the video-generation call must resolve `imagePath` server-side from the database (`Scene.imagePath`) keyed by `storyId` + `sceneNumber`, never accept it as a Server Action argument from client state.

**Primary recommendation:** Add `imagesApprovedAt DateTime?` to `Story` and `imageAttempts Int @default(0)` / `videoAttempts Int @default(0)` to `Scene` in one Prisma migration; refactor `generateSceneVideoAction` to look up its own `imagePath` and check the approval gate + video-attempt cap at its own top (single unbypassable dispatch point, unchanged pattern from Phase 2's `checkCeiling`); build the batch "Generate All Videos" action using `after()` for background dispatch with DB-status polling for the new fourth screen; treat Story Library as in-scope-by-default (small), not pre-emptively descoped.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Approval gate (APPROVAL-01) | API / Backend (Server Action) | Database (persisted flag) | Must be unbypassable "through any path" — a UI-only disabled button is insufficient; the check must live inside the same function that dispatches the paid Veo call, exactly where `checkCeiling` already lives |
| Single-scene image regeneration (IMAGE-02) | API / Backend (Server Action) | Database (per-scene status/attempt count) | Existing `generateSceneImagesAction` pattern already isolates per-scene writes (`updateSceneImage` keyed by `[storyId, sceneNumber]`); a single-scene variant is a narrower reuse, not new architecture |
| Batch video dispatch + per-scene tracking (VIDEO-02, VIDEO-04) | API / Backend (Server Action + `after()`) | Database (Scene.videoStatus as source of truth), Browser (polling) | No job queue is in scope (PROJECT.md Out of Scope); the database already is the durable per-scene status store (Phase 3), so the new screen polls it rather than the app inventing a second status channel |
| Video-status screen (D-05) | Browser / Client | API (polling read) | New dedicated screen; purely a rendering + polling concern once the backend writes per-scene status durably |
| Retry-cap enforcement (D-03) | API / Backend (Server Action) | Database (attempt counters) | Same unbypassable-gate reasoning as approval; must be checked at the single dispatch point, not only disabled in the UI |
| Story Library (LIBRARY-01) | API / Backend (list query) | Browser (list screen) | Purely additive read of already-persisted `Story` rows; no new write path, no new risk surface |
| Output folder access (OUTPUT-01, OUTPUT-03) | API / Backend (Server Action invoking `explorer.exe`) | — | OS-level folder opening cannot happen in the browser sandbox; must be a server-side Node.js `child_process` call, gated to only ever operate on `storyDir(storyId)`-derived paths (never a raw client string) |

## Standard Stack

No new libraries are required for this phase. Every capability is implementable with what is already installed.

### Core (already installed, reused)
| Library | Version (from package.json) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.5 | App Router, Server Actions, `after()` API | Already the project's framework; `after()` ships stable since 15.1.0, confirmed present in 16.3.5's own docs [CITED: nextjs.org/docs/app/api-reference/functions/after] |
| @prisma/client / prisma | 7.10.0 | Schema migration for the two new fields/columns | Already the project's ORM (Phase 3) |
| react / react-dom | 19.2.8 | New fourth screen, approval button, library list | Already the project's UI layer |
| node:child_process (builtin) | Node >=20.6.0 (project engines) | Opening the output folder in Windows Explorer | Zero-dependency, no new package needed — `execFile` is a Node builtin |

### Supporting
None. No new package is needed anywhere in this phase's scope.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `after()`-based background dispatch for batch video | A real job queue (BullMQ/Redis) | Explicitly out of scope per PROJECT.md ("complex job queues" excluded); `after()` is the officially supported, zero-infrastructure alternative for a single-process local Node app |
| `execFile("explorer.exe", [path])` for folder-open | `child_process.exec('start "" "<path>"')` | `exec` runs through `cmd.exe`'s shell parser, requiring careful quoting (the `start ""` trick to avoid the first quoted arg being treated as a window title); `execFile` passes arguments as an array with no shell involved, avoiding injection/quoting risk entirely [CITED: multiple Node.js child_process guides — see Sources] |
| A new `Story.status` enum for Library | A computed status derived client/server-side from existing `uniquenessStatus` + `imagesApprovedAt` + scene video statuses | A new enum column is a bigger schema commitment (and another thing to keep in sync); a computed label from already-true data avoids a second source of truth for "status" — recommended, but flagged as planner's discretion, not locked |

**Installation:** None required — no `npm install` needed for this phase.

**Version verification:** `next@16.3.5` is already pinned in `package.json` (read directly, not searched) [VERIFIED: package.json:24]. `after()`'s stability was confirmed for exactly this installed version via the official Next.js docs page, which is served with `version: 16.3.5` in its own frontmatter, matching the installed version exactly [CITED: nextjs.org/docs/app/api-reference/functions/after].

## Package Legitimacy Audit

No external packages are proposed for this phase. Every capability (approval gate, retry caps, batch dispatch, new screen, library list, folder-open) is buildable with libraries already installed and verified in Phases 1-3, plus Node.js/Next.js builtins.

**Packages removed due to [SLOP] verdict:** none — none were proposed.
**Packages flagged as suspicious [SUS]:** none — none were proposed.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────────┐
                         │              Browser (React, "use client")   │
                         │                                               │
  create-story-form ───▶│  Screen 1: Create  ──▶  Screen 2: Story Review│
                         │                              │                │
                         │                              ▼                │
                         │        Screen 3: Review + Approve Images      │
                         │        (existing screen, extended)            │
                         │        - per-scene [Regenerate Image]         │
                         │        - single [Approve These Images] button │
                         │                              │                │
                         │                              ▼                │
                         │        Screen 4 (NEW): Video Status           │
                         │        - [Generate All Videos] (once)         │
                         │        - per-scene status row + [Retry]       │
                         │        - polls status every N seconds         │
                         │        - [Open Output Folder] once ready      │
                         └───────────────┬───────────────────────────────┘
                                         │ Server Action calls
                                         ▼
                         ┌─────────────────────────────────────────────┐
                         │        src/app/actions/ (Server Actions)      │
                         │                                               │
                         │  approveStoryImagesAction(storyId)            │
                         │    → sets Story.imagesApprovedAt = now()      │
                         │                                               │
                         │  regenerateSceneImageAction(storyId, n)       │
                         │    → checks imageAttempts cap, reuses         │
                         │      generateSceneImagesAction's per-scene    │
                         │      logic for exactly one scene              │
                         │                                               │
                         │  generateAllVideosAction(storyId)             │
                         │    → asserts imagesApprovedAt is set          │
                         │      (THE unbypassable gate)                  │
                         │    → after(): sequential per-scene            │
                         │      generateSceneVideoAction() calls,        │
                         │      each ceiling-gated + attempt-capped      │
                         │    → returns immediately ("dispatched")       │
                         │                                               │
                         │  retrySceneVideoAction(storyId, n)            │
                         │    → asserts imagesApprovedAt is set          │
                         │    → checks videoAttempts cap                 │
                         │    → resolves imagePath from DB (not client)  │
                         │    → calls generateSceneVideoAction()         │
                         │                                               │
                         │  getStoryStatusAction(storyId)                │
                         │    → lightweight read of Scene rows for the   │
                         │      polling screen                           │
                         │                                               │
                         │  listStoriesAction()  (LIBRARY-01)            │
                         │    → reads Story rows with scene counts       │
                         │                                               │
                         │  openStoryFolderAction(storyId)               │
                         │    → storyDir(storyId), execFile(explorer.exe)│
                         └───────────────┬───────────────────────────────┘
                                         │
                                         ▼
                         ┌─────────────────────────────────────────────┐
                         │   src/core/persistence/  (Prisma, SQLite)     │
                         │   Story.imagesApprovedAt, Scene.imageAttempts,│
                         │   Scene.videoAttempts, Scene.videoStatus, ... │
                         └───────────────┬───────────────────────────────┘
                                         │
                                         ▼
                         ┌─────────────────────────────────────────────┐
                         │  storage/stories/<id>/scenes/NN/{image,video}│
                         └───────────────────────────────────────────────┘
```

### Recommended Project Structure

No new top-level directories are needed. Additions fit the existing layout:

```
src/
├── app/
│   ├── actions/
│   │   ├── approve-images.ts          # NEW — D-01/D-02
│   │   ├── regenerate-scene-image.ts  # NEW — IMAGE-02
│   │   ├── generate-all-videos.ts     # NEW — VIDEO-02, D-04
│   │   ├── retry-scene-video.ts       # NEW — VIDEO-04
│   │   ├── get-story-status.ts        # NEW — polling read for Screen 4
│   │   ├── list-stories.ts            # NEW — LIBRARY-01 (soft)
│   │   └── open-story-folder.ts       # NEW — OUTPUT-01
│   └── page.tsx                        # EXTENDED — 4th screen + approval UI
├── components/
│   ├── scenes/                         # SceneCard/SceneVideo extended with
│   │   │                                # retry-cap-exhausted state
│   └── story/                          # StoryReview extended with Approve
│       └── VideoStatusScreen.tsx       # NEW component (D-05)
├── core/
│   ├── persistence/
│   │   ├── story-repository.ts         # EXTENDED — markImagesApproved,
│   │   │                                # listStoriesWithSceneCounts
│   │   └── generation-repository.ts    # EXTENDED — incrementImageAttempt,
│   │                                    # incrementVideoAttempt, cap reads
│   └── retry/
│       └── caps.ts                     # NEW — maxSceneRetryAttempts(),
│                                        # mirrors uniqueness/check.ts's
│                                        # maxRegenerationAttempts() pattern
prisma/
└── schema.prisma                       # EXTENDED — imagesApprovedAt,
                                         # imageAttempts, videoAttempts
```

### Pattern 1: Server-Side-Unbypassable Gate (Approval + Retry Cap)

**What:** A precondition check that lives at the top of the single function that dispatches a paid provider call — not in the calling Server Action, not in the UI — so no code path can reach the paid call without passing it.
**When to use:** APPROVAL-01's "through any path, not just the visible UI" wording; D-03's retry caps.
**Example (extends the existing pattern already in `generate-video.ts`):**
```typescript
// Source: existing generateSceneVideoAction in src/app/actions/generate-video.ts:109-129
// (checkCeiling call already demonstrates this exact "gate at the top of the
// single dispatch function" shape — the new approval + attempt-cap checks
// are new guards added at the same position, before any Veo call)
export async function generateSceneVideoAction(
  storyId: string,
  sceneNumber: number, // CHANGED: no longer accepts client-supplied imagePath
): Promise<GenerateSceneVideoResult> {
  const story = await findStoryWithScenes(storyId); // resolves imagePath + imagesApprovedAt server-side
  if (!story) { /* plain-language not-found message */ }

  if (!story.imagesApprovedAt) {
    // APPROVAL-01: this check cannot be reached by ANY caller (batch or
    // single retry) without going through this function, so it is the
    // single unbypassable gate the requirement demands.
    return { ok: false, /* ... */ message: "These images haven't been approved yet. Approve them before generating video." };
  }

  const scene = story.scenes.find(s => s.sceneNumber === sceneNumber);
  if (!scene?.imagePath) { /* plain-language message */ }

  if (scene.videoAttempts >= maxSceneRetryAttempts()) {
    // D-03: same unbypassable-gate placement as the approval check above.
    return { ok: false, /* ... */ message: "This scene has reached its retry limit. [calm explanation of what she can still do]" };
  }

  // ... existing checkCeiling(estimatedUsd) call, unchanged from Phase 2 ...
}
```

### Pattern 2: `after()`-Based Batch Dispatch with DB-Polled Status

**What:** A Server Action that validates preconditions synchronously (so the caller gets an immediate plain-language error if something is wrong), then schedules the actual sequential per-scene work inside `after()` so the HTTP response returns immediately, while the browser polls a separate lightweight read action for progress.
**When to use:** D-04's batch "Generate All Videos" trigger — sequential dispatch of N videos (each potentially taking minutes, per Phase 2's real evidence of Veo generation+polling time) must not block one long-running Server Action call from the browser's perspective, and per-scene progress must be independently visible on the new D-05 screen while other scenes are still generating.
**Example:**
```typescript
// Source: Next.js official docs, after() — CITED, see Sources.
// https://nextjs.org/docs/app/api-reference/functions/after
"use server";
import { after } from "next/server";

export async function generateAllVideosAction(storyId: string): Promise<{ ok: boolean; message: string }> {
  const story = await findStoryWithScenes(storyId);
  if (!story) return { ok: false, message: "This story could not be found." };
  if (!story.imagesApprovedAt) {
    return { ok: false, message: "Approve the scene images before generating videos." };
  }

  const approvedScenes = story.scenes.filter(s => s.imageStatus === "READY");

  after(async () => {
    // Runs AFTER the response above has already returned to the browser.
    // Sequential, ceiling-gated per call -- mirrors generateSceneImagesAction's
    // existing sequential loop (02-*/generate-images.ts), one long-lived
    // background task in this same Node.js process (this app is `next start`,
    // a persistent Node.js server -- NOT a serverless/Vercel deployment --
    // so `after()`'s Node.js-server support path applies directly, no
    // `waitUntil` shim needed; see Sources).
    for (const scene of approvedScenes) {
      await generateSceneVideoAction(storyId, scene.sceneNumber); // writes Scene.videoStatus itself
    }
  });

  return { ok: true, message: "Video generation has started for every approved scene." };
}
```
```typescript
// The new Screen 4 polls this lightweight read action on an interval
// (e.g. setInterval(..., 3000)) instead of waiting on the action above.
"use server";
export async function getStoryStatusAction(storyId: string) {
  const story = await findStoryWithScenes(storyId); // cheap SELECT, no provider call
  return story?.scenes.map(s => ({ sceneNumber: s.sceneNumber, videoStatus: s.videoStatus, videoAttempts: s.videoAttempts })) ?? null;
}
```

**Caveats the planner must account for (see Common Pitfalls below):** `after()` callbacks are NOT guaranteed to survive a dev-server restart or an HMR reload mid-flight (Next.js dev mode recompiles/restarts the module graph on file changes); this is acceptable for a local single-user tool but should be a documented limitation, not silently assumed reliable.

### Pattern 3: Server-Resolved Asset Paths (Never Client-Supplied)

**What:** Any Server Action that needs a scene's `imagePath`/`videoPath` resolves it itself from the database via `storyId` + `sceneNumber`, never accepts it as an argument from browser state.
**When to use:** Every new action this phase adds that touches a filesystem path (`retrySceneVideoAction`, `generateAllVideosAction`'s internal dispatch, `regenerateSceneImageAction`). This directly fixes the gap WINDOWS #7 documents: after a browser restore, `page.tsx` currently disables video retry entirely because it has no `imagePath` to pass (by design — T-03-15 forbids a path ever reaching the browser). Resolving the path server-side removes the need for the browser to hold it at all, closing this gap as a byproduct of the correct architecture rather than as a special case.
**Example:** see Pattern 1's `generateSceneVideoAction(storyId, sceneNumber)` signature change above — this is the same change, viewed from this angle.

### Anti-Patterns to Avoid

- **UI-only approval gating:** Disabling the "Generate All Videos" button in React when images aren't approved is necessary for UX but is NOT the APPROVAL-01 gate itself — the requirement's own wording ("through any path, not just the visible UI") means the check must additionally live server-side inside the dispatch function, exactly as `checkCeiling` already does.
- **Blocking Server Action for the whole batch:** Awaiting all N video generations inside one Server Action call (no `after()`) would leave the browser's `await generateAllVideosAction(...)` call pending for potentially 10+ minutes (N scenes × minutes-per-Veo-call), with no way to show independent per-scene progress until the entire call resolves — directly undermining D-05's "watching video jobs progress" requirement.
- **Client-supplied filesystem paths:** Any new action accepting `imagePath`/`videoPath` as a parameter from the browser repeats Phase 2's original design limitation and reopens the T-03-15 path-leak risk on any new code path that logs or echoes that parameter.
- **A second, parallel status channel:** Inventing a new in-memory job-tracking structure (e.g. a module-level `Map<storyId, JobStatus>`) instead of using `Scene.videoStatus` as the single source of truth would create two things that can disagree and would not survive an app restart, violating VIDEO-03's already-delivered restart-survival guarantee.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Running background work after a Server Action responds | A custom `setTimeout`/fire-and-forget async call with no framework support, or a full job-queue library | Next.js's built-in, stable `after()` (next/server) | Officially supported for exactly this use case in Server Functions on Node.js-server deployment; avoids introducing infrastructure (job queue) explicitly excluded by PROJECT.md |
| Per-scene retry-cap bookkeeping | A separate table/file tracking attempt counts | Two `Int` columns directly on `Scene` (mirrors how `imagePath`/`videoStatus` already live there) | Keeps one row per scene as the single source of truth, consistent with the existing schema shape and query patterns (`updateSceneImage`/`updateSceneVideo`) |
| Opening a folder from a web app | A shell-quoting-fragile `exec("start ...")` call, or a new "open" npm package | `child_process.execFile("explorer.exe", [absolutePath])` (Node builtin) | Array-based arguments avoid shell-injection/quoting bugs entirely; no new dependency for a one-line OS call |

**Key insight:** Every "new" mechanism this phase seems to need (background dispatch, retry caps, folder access) has a narrow, already-idiomatic solution inside the stack already chosen — the risk in this phase is architectural placement (where the gate lives) and data-flow direction (server resolves paths, never trusts the client), not missing tooling.

## Common Pitfalls

### Pitfall 1: Approval Gate Checked Only in the New Batch Action, Not the Retry Path

**What goes wrong:** `generateAllVideosAction` checks `imagesApprovedAt` correctly, but `retrySceneVideoAction` (VIDEO-04) is implemented as a thin wrapper that forgets to re-check it, on the (false) assumption that "if a scene already has a video job, it must have been approved already."
**Why it happens:** The two actions are built at different times / by different plan waves, and the check feels redundant for a scene that's already mid-flight.
**How to avoid:** Put the approval check inside `generateSceneVideoAction` itself (Pattern 1), not in either of its two callers — then it's structurally impossible to skip regardless of which caller is used or added later.
**Warning signs:** Any new Server Action that calls Veo without first calling (or being nested inside a function that calls) the approval check.

### Pitfall 2: `after()` Silently Dropped by Dev-Server Restarts

**What goes wrong:** During local development (`next dev --webpack`, per this project's existing script), editing any file mid-generation can trigger a recompile that drops in-flight `after()` work, leaving a scene stuck at "generating" in the database forever with no error recorded.
**Why it happens:** `after()`'s guarantee is scoped to "the platform's default or configured max duration" of a live process — a dev-mode restart is an out-of-band process kill, not a graceful completion.
**How to avoid:** The planner should scope any live proof-run video-generation testing to `npm run build && npm run start` (production mode, a stable persistent process) rather than `npm run dev`, and/or add a "stuck too long" affordance on the status screen (e.g., a scene sitting at "generating" for an unreasonable time surfaces a retry option rather than spinning forever).
**Warning signs:** A scene's `videoStatus` staying `WAITING`/an intermediate state indefinitely after a known dev-server restart during testing.

### Pitfall 3: Dev Spend Ledger Has Almost No Headroom Left

**What goes wrong:** Phase 3 closed with the shared `DEV_CEILING_USD` dev-testing ledger at **$3.0870 of $3.25 — only $0.163 headroom** (orchestrator-verified live via `node src/scripts/smoke-test.ts --report` immediately before this research was corrected — the $3.25 ceiling itself was set by explicit requester approval during Phase 3, but the $2.9870 figure this document originally cited was the ledger's PRE-ceiling-raise total from before Phase 3's two live UAT proof calls (+$0.10 combined) landed; correct the stale figure everywhere it appears in this document to $3.0870/$0.163). Batch multi-scene video generation is the single most expensive operation built so far — Phase 2's ONE video call alone cost $0.20-0.40 real (per PROJECT.md/STATE.md history); a 5-7 scene batch run would cost roughly $1.00-$2.80 at the same per-scene rate, which cannot fit in $0.163 of remaining headroom under any circumstance.
**Why it happens:** Easy to assume "the plan can just run a real proof at the end" without checking the ledger state first.
**How to avoid:** Any plan proposing a real multi-scene batch-video proof run in this phase MUST either (a) be sized to 1-2 scenes maximum and explicitly checkpoint-gated for human approval of a new `DEV_CEILING_USD` figure before running (mirroring Phase 3's exact precedent — the user named a new number, not Claude), or (b) defer the full-scale batch proof to a `checkpoint:human-verify` step, or (c) rely on code-level verification (unit tests on the gating/counting logic with a fake video provider, zero real spend) as the primary evidence, with a real call deferred/minimized.
**Warning signs:** A plan task that dispatches more than 1-2 real Veo calls without a preceding explicit-approval checkpoint for a new ceiling figure.

### Pitfall 4: `explorer.exe` Non-Zero Exit Code Mistaken for Failure

**What goes wrong:** `explorer.exe` on Windows is known to return non-zero exit codes in some circumstances even when the folder opens successfully (a long-documented Windows Explorer quirk).
**Why it happens:** Explorer's process-exit semantics don't reliably map to success/failure the way most CLI tools do.
**How to avoid:** Treat a successful `execFile` callback (i.e., no thrown error / callback fired) as sufficient evidence the command was dispatched, rather than gating the UI's success message strictly on a zero exit code; if a synchronous existence check (`storyDir(storyId)` must resolve to a real, existing directory before attempting to open it) already passed, that is the meaningful pre-condition to verify.
**Warning signs:** A "folder could not be opened" error message appearing even though Explorer visibly opened during manual testing.
[ASSUMED — this specific quirk is training knowledge, not verified via an authoritative source this session; flag for the planner to treat OUTPUT-01's success/failure UI copy conservatively (e.g. "Opening the folder..." rather than a strict success/failure confirmation) rather than building strict exit-code-based error handling around it.]

## Code Examples

### Prisma Schema Additions
```prisma
// Source: extends the EXISTING schema read directly this session
// (prisma/schema.prisma:44-90) -- exact current field list quoted below.
model Story {
  // ...all existing fields unchanged (id, title, premise, fullStory, theme,
  // emotionalArc, ending, protagonistWant, centralObstacle, endingShape,
  // characterBible, styleBible, uniquenessStatus, regenerationAttempt,
  // createdAt, scenes, generationRecords -- verbatim from
  // prisma/schema.prisma:44-68)...
  imagesApprovedAt   DateTime?  // NEW -- D-01/D-02/APPROVAL-01. Null = not
                                 // approved. Set once, for the whole story,
                                 // by approveStoryImagesAction. Never reset
                                 // by a single-scene image regeneration
                                 // (IMAGE-02) -- D-02 scopes approval to the
                                 // whole set, and re-approval after a
                                 // regeneration is a UX question for the
                                 // planner/UI-SPEC to resolve explicitly,
                                 // not an accidental side effect of this
                                 // field's mere presence.
}

model Scene {
  // ...all existing fields unchanged (id, storyId, story, sceneNumber,
  // storyPurpose, imagePrompt, motionPrompt, durationSeconds, imagePath,
  // imageStatus, videoPath, videoStatus, createdAt, generationRecords --
  // verbatim from prisma/schema.prisma:70-90)...
  imageAttempts      Int        @default(0)  // NEW -- D-03, IMAGE-02
  videoAttempts      Int        @default(0)  // NEW -- D-03, VIDEO-04
}
```

### Retry-Cap Reader (mirrors `maxRegenerationAttempts()` exactly)
```typescript
// Source: src/core/uniqueness/check.ts:35-53 (read this session, verbatim
// pattern this new module should mirror for env-var name and safe-default
// semantics -- only the env var name and default constant differ).
export const DEFAULT_MAX_SCENE_RETRY_ATTEMPTS = 3;

export function maxSceneRetryAttempts(env: Record<string, string | undefined> = process.env): number {
  const raw = env.MAX_SCENE_RETRY_ATTEMPTS;
  if (raw === undefined) return DEFAULT_MAX_SCENE_RETRY_ATTEMPTS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_MAX_SCENE_RETRY_ATTEMPTS;
  }
  return parsed;
}
```

### Output Folder Open
```typescript
// Source: pattern confirmed via Node.js child_process community guidance
// (execFile avoids shell-quoting issues that exec("start ...") has) --
// CITED, see Sources. storyDir() call is VERIFIED against this session's
// own read of src/core/storage-paths.ts:52-55.
"use server";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { storyDir } from "../../core/storage-paths.ts";

export async function openStoryFolderAction(storyId: string): Promise<{ ok: boolean; message: string }> {
  let relativeDir: string;
  try {
    relativeDir = storyDir(storyId); // throws on a malformed id -- T-02-07's existing validation
  } catch {
    return { ok: false, message: "This story's folder could not be found." };
  }
  const absoluteDir = resolve(relativeDir);
  execFile("explorer.exe", [absoluteDir], (err) => {
    // explorer.exe's exit-code semantics are unreliable (Pitfall 4) --
    // logged server-side only, never surfaced as a hard failure to her.
    if (err) console.error(`openStoryFolderAction: explorer.exe reported an error for ${absoluteDir}`, err);
  });
  return { ok: true, message: "Opening the folder..." };
}
```

## State of the Art

| Old Approach (Phase 2 design) | Current Approach (this phase) | When Changed | Impact |
|--------------------------------|-------------------------------|---------------|--------|
| `generateSceneVideoAction(storyId, scene, imagePath)` — browser passes the image path it received from `generateSceneImagesAction`'s own response | `generateSceneVideoAction(storyId, sceneNumber)` — resolves `imagePath` server-side from `Scene.imagePath` | This phase (VIDEO-02/VIDEO-04) | Closes WINDOWS #7 (restored scenes can't retry video) as a byproduct of the correct data-flow direction, not a special case |
| One scene, one video, one client-side result slot (`page.tsx`'s `videoResult` state) | N scenes, N independent jobs, DB-backed status, polled by the new screen | This phase (D-04, D-05) | New screen component, new polling action, no job-queue infrastructure needed thanks to `after()` |
| Image-review screen also hosted the (single) Generate Video button | Image-review screen hosts only image review + the single Approve action; video generation moves to its own screen entirely | This phase (D-05) | Cleaner separation of concerns matching the locked decision; also isolates the paid-video-call UI from the free-to-browse image-review UI |

**Deprecated/outdated:** The single-scene-only `videoResult` state shape in `page.tsx` (lines 50-51, 160-183, 194-283 as read this session) is fully superseded by this phase's per-scene DB-backed status model — the planner should expect to remove, not extend, that state shape.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `explorer.exe`'s non-zero exit code does not reliably indicate a real failure | Common Pitfalls #4, Code Examples | Low — worst case is either a false "success" message on a genuine failure, or overly defensive error-suppression; either way the wife can just try again, and the folder-open action has no paid-call or data-integrity consequence |
| A2 | A single "Approve These Images" action should NOT be automatically re-required after a single-scene image regeneration (IMAGE-02) unless the planner/UI-SPEC decides otherwise | Code Examples (Prisma schema comment) | Medium — if the wife regenerates Scene 4's image AFTER approving, and video generation for other scenes proceeds without her seeing the new Scene 4 image, that could surprise her; this is a genuine product-behavior decision (re-approve on any post-approval regeneration? Or trust the single approval to cover regenerations too?) the planner should make explicit rather than let happen by omission |
| A3 | `next dev --webpack`'s recompile-on-change behavior can interrupt an in-flight `after()` callback mid-run | Common Pitfalls #2 | Medium — if wrong (i.e. `after()` survives dev-mode recompiles more gracefully than assumed), the planner over-engineers a "stuck" detector that wasn't needed; if right and unaddressed, a real dev-testing session could leave scenes stuck at an intermediate status with no path to retry (should be mitigated regardless by allowing retry on any non-READY video status, which VIDEO-04 already requires) |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Does approving images need to be re-confirmed after a post-approval single-scene regeneration?**
   - What we know: D-02 locks "one Approve action covers every scene in that story"; IMAGE-02 locks that regeneration doesn't affect other scenes' status.
   - What's unclear: Whether regenerating Scene 4's image AFTER the story-level approval should silently leave the approval intact (simplest, matches literal D-02 wording) or should reset `imagesApprovedAt` to null for that story (safer — she re-confirms before spending on video with a possibly-different Scene 4 image).
   - Recommendation: Default to leaving the approval intact (simplest, matches D-02's literal "one Approve action" framing) but require `regenerateSceneImageAction` to warn her in its returned message if approval is already recorded, so the choice is visible rather than silent. Planner should confirm with the CONTEXT/UI-SPEC step rather than the executor deciding silently.

2. **Should a real multi-scene batch-video proof run happen in this phase, given the $0.163 remaining dev-ledger headroom?**
   - What we know: The exact current ledger state (`$3.0870 of $3.25`, live-verified via `node src/scripts/smoke-test.ts --report`), and Phase 2's real per-video cost ($0.20-0.40).
   - What's unclear: Whether the planner should scope this phase's Nyquist validation to code-level tests only (fake video provider, zero spend) plus a 1-scene real proof, deferring a genuine multi-scene batch proof to a later explicit-approval checkpoint.
   - Recommendation: Plan for code-level verification as the primary evidence for VIDEO-02/VIDEO-04's batch/retry logic; gate any real multi-scene proof behind an explicit `checkpoint:human-verify` requesting a specific new ceiling figure from the requester, exactly matching Phase 3's own precedent.

## Environment Availability

No new external dependencies (tools, services, CLIs) are introduced by this phase — it uses only the Next.js/Prisma/Node.js stack already proven working in Phases 1-3, plus the Windows-builtin `explorer.exe`, which is present on every Windows installation by definition (the target machine is confirmed Windows 11 Home per the environment context).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| explorer.exe | OUTPUT-01 folder-open | ✓ (Windows builtin, not independently verifiable via a package-manager query, but guaranteed present on any Windows install) | OS builtin | — |
| Next.js `after()` | VIDEO-02 batch dispatch | ✓ — confirmed via official docs matching the installed `next@16.3.5` exactly | 15.1.0+ (stable), present in 16.3.5 | If unavailable for any reason, fall back to a synchronous sequential loop inside the Server Action itself (accepting the long-blocking-call UX tradeoff Pattern 2 exists to avoid) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none currently missing — `after()`'s fallback is noted above defensively.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node's built-in `node --test` runner (no external test framework — matches Phase 1-3's established convention) [VERIFIED: package.json:15 — `"test:lib": "node --test src/lib/spend-ledger.test.ts src/lib/log-response.test.ts src/core/story/styles.test.ts src/core/story/validate-scene-plan.test.ts src/core/story/director.test.ts src/providers/llm/gemini.test.ts src/core/storage-paths.test.ts src/lib/db.test.ts src/core/uniqueness/similarity.test.ts src/core/uniqueness/check.test.ts src/core/persistence/generation-repository.test.ts src/core/persistence/story-view.test.ts && node src/scripts/check-boundaries.ts"`] |
| Config file | none — `.test.ts` files are listed explicitly in the `test:lib` npm script, not auto-discovered |
| Quick run command | `node --test src/core/retry/caps.test.ts` (new file, pattern matches `check.test.ts`'s existing per-module test file convention) |
| Full suite command | `npm run test:lib` (must add every new `.test.ts` file this phase creates to this script's explicit file list, mirroring how every prior phase's plans did) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| APPROVAL-01 | `generateSceneVideoAction` refuses to dispatch when `imagesApprovedAt` is null, regardless of caller | unit (injected fake DB reader, no real Veo call) | `node --test src/app/actions/generate-video.test.ts` | ❌ Wave 0 — no test file for `generate-video.ts` exists yet |
| IMAGE-02 | Regenerating one scene's image does not alter another scene's `imagePath`/`imageStatus`/`videoStatus` | unit | `node --test src/app/actions/regenerate-scene-image.test.ts` | ❌ Wave 0 |
| VIDEO-02 / VIDEO-04 | Batch dispatch writes independent per-scene status; a single scene's failure does not block/alter others; retry increments only that scene's `videoAttempts` | unit (fake video provider injected, zero real spend) | `node --test src/app/actions/generate-all-videos.test.ts` and `.../retry-scene-video.test.ts` | ❌ Wave 0 |
| D-03 (retry cap) | `maxSceneRetryAttempts()` env-parsing safe-default behavior (mirrors `check.test.ts`'s coverage of `maxRegenerationAttempts()`) | unit | `node --test src/core/retry/caps.test.ts` | ❌ Wave 0 |
| LIBRARY-01 (soft) | `listStoriesAction` returns correct title/date/status/scene-count for N seeded stories, no duplicates | unit (temp SQLite file, same convention as `db.test.ts`) | `node --test src/app/actions/list-stories.test.ts` | ❌ Wave 0 |
| OUTPUT-01/03 | `openStoryFolderAction` refuses a malformed `storyId` before ever calling `execFile` (reuses `storyDir()`'s existing validation, already covered by `storage-paths.test.ts`) | unit (execFile call mocked/injected) | `node --test src/app/actions/open-story-folder.test.ts` | ❌ Wave 0 |
| UI-01 | Error messages surfaced by every new action are plain-language (manual/UAT check, not automatable the way message CONTENT quality is judged) | manual-only | — | — (UAT, per this project's established "no automated test suite beyond targeted unit tests" convention [VERIFIED: PROJECT.md Key Decisions table — "No automated test suite; rely on the acceptance-test checklist plus targeted unit tests for budget math and uniqueness scoring"]) |

### Sampling Rate
- **Per task commit:** `node --test <the file just changed's corresponding .test.ts>`
- **Per wave merge:** `npm run test:lib` (must be updated to include every new test file, matching every prior phase's plans)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus the manual UAT walkthrough (create → review → approve → generate → status → output) since UI-01 is fundamentally a human-judgment requirement

### Wave 0 Gaps
- [ ] `src/app/actions/generate-video.test.ts` — does not exist yet; needed to cover the approval-gate + retry-cap + server-resolved-path refactor with zero real Veo calls (inject a fake `generateVideo` the way `check.test.ts` injects a fake `director`)
- [ ] `src/core/retry/caps.test.ts` — needed for D-03's env-parsing safe-default coverage
- [ ] `src/app/actions/list-stories.test.ts`, `.../open-story-folder.test.ts`, `.../regenerate-scene-image.test.ts`, `.../generate-all-videos.test.ts`, `.../retry-scene-video.test.ts` — none exist yet; all new actions this phase adds
- [ ] `test:lib` npm script in `package.json` must be extended to list every new test file (existing convention — the script currently hardcodes an explicit file list rather than globbing)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Single local user, no auth in scope (PROJECT.md Out of Scope) |
| V3 Session Management | No | No session/auth system exists |
| V4 Access Control | Yes | The approval gate and retry-cap gate ARE this phase's access-control surface — must be enforced server-side inside the single dispatch function, not client-side only (Pattern 1) |
| V5 Input Validation | Yes | Every new action taking a `storyId`/`sceneNumber` must route it through existing validated helpers (`storyDir()`, the Prisma `[storyId, sceneNumber]` compound unique key) before use — same pattern every existing action already follows |
| V6 Cryptography | No | No new secrets/crypto surface introduced this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via `storyId` reaching `execFile`/a shell | Tampering | `storyDir(storyId)` already throws on any id outside `^[a-z0-9-]+$` (verified this session, `src/core/storage-paths.ts:28-40`) before the resolved path ever reaches `execFile`; `execFile` (array-args, no shell) additionally avoids shell-metacharacter injection even if validation were somehow bypassed |
| Approval-bypass via a new/forgotten call site | Elevation of Privilege (in the sense of bypassing a wife-only gate the app enforces on her behalf against accidental spend) | Pattern 1 — gate lives inside the single dispatch function, not per-caller |
| Filesystem path disclosure to the browser | Information Disclosure | Continue T-03-15's existing convention: no new Server Action return type may include a raw `imagePath`/`videoPath` string field — server resolves paths internally only (Pattern 3) |

## Sources

### Primary (HIGH confidence — read directly this session)
- `prisma/schema.prisma` (this repo) — current Story/Scene/GenerationRecord shape, read in full
- `src/app/actions/generate-video.ts`, `generate-images.ts`, `load-story.ts`, `create-story.ts` (this repo) — existing Server Action patterns, read in full
- `src/core/persistence/generation-repository.ts`, `story-repository.ts`, `story-view.ts` (this repo) — existing persistence-layer conventions, read in full
- `src/core/storage-paths.ts` (this repo) — existing path-validation convention, read in full
- `src/core/uniqueness/check.ts` (this repo) — `maxRegenerationAttempts()` pattern this phase's retry caps mirror, read in full
- `src/scripts/check-boundaries.ts` (this repo) — structural invariants any new file must keep satisfying, read in full
- `src/lib/spend-ledger.ts` (this repo) — current `DEV_CEILING_USD = 3.25` state, read in full
- `.planning/WINDOWS.md` (this repo) — item #7, the exact restored-scene-video-retry gap this phase's server-resolved-path refactor closes
- `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/phases/04-.../04-CONTEXT.md` (this repo)
- `docs/original-brief.md` (this repo) — §7/§8/§14/§17-25's original schema/output/retry-cap intent

### Secondary (MEDIUM confidence — official docs fetched this session)
- [next.js `after()` API reference](https://nextjs.org/docs/app/api-reference/functions/after) — fetched directly, version frontmatter confirmed `16.3.5` matching this project's installed Next.js exactly; stable since 15.1.0, supported for Server Functions on Node.js-server deployment

### Tertiary (LOW confidence — WebSearch only, flagged for validation)
- Node.js `child_process.execFile` vs `exec` for opening Windows folders — general community guidance (GitHub issues, dev.to posts), not an official Node.js API-reference statement specifically about folder-opening; the underlying `execFile` API itself is well-documented Node.js builtin behavior, but the "use it for folder-opening to avoid quoting bugs" recommendation is community best-practice, not a spec requirement
- `explorer.exe` non-zero-exit-code quirk (Common Pitfalls #4) — training-knowledge only, marked `[ASSUMED]`, not independently re-verified this session

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; every mechanism (schema fields, `after()`, `execFile`) is either already-installed or an official, version-matched Next.js API
- Architecture: HIGH — every pattern is a direct, narrow extension of an already-proven Phase 2/3 pattern read from this repo this session
- Pitfalls: MEDIUM — the `after()`-dev-mode-interruption and `explorer.exe`-exit-code pitfalls are `[ASSUMED]`/community-sourced, not independently reproduced this session; the dev-ledger-headroom pitfall's $3.25 ceiling figure is HIGH (read from source), but its original $2.9870-total/$0.263-headroom claim was stale (pre-dated Phase 3's final two live UAT calls) and was corrected to the live-verified $3.0870/$0.163 by the orchestrator before planning began

**Research date:** 2026-09-14
**Valid until:** 30 days (stable stack; no fast-moving external API surface touched by this phase specifically — unlike Phases 1-3, this phase does not add a new call to Gemini/Veo, it only orchestrates existing, already-proven calls differently)

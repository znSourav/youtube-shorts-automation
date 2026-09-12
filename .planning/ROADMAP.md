# Roadmap: AI Animated YouTube Shorts Studio

## Overview

The journey runs risk-first: prove the two paid, unproven AI provider integrations (Gemini image generation and Veo 3.1 Lite image-to-video) actually work before investing a single hour in persistence, uniqueness checking, or UI. From there, each phase adds one more increasingly complete end-to-end slice — first the full creative pipeline for a single story with no safety nets, then durable storage and the structural-uniqueness system that makes every story genuinely original, then the real wife-facing review/approval/output flow, then hardened budget and retry safeguards in front of every paid call, and finally the reliability, secrets-hygiene, and output-correctness polish that makes the tool trustworthy to hand over and use unsupervised. By the end, a story idea typed in Bangla or Banglish becomes a complete, structurally-unique, budget-safe episode's worth of local video assets ready for CapCut — durably stored, safely bounded, and usable by a non-technical person.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Provider Smoke Test** - Prove Gemini image generation and Veo 3.1 Lite image-to-video both work end-to-end with real cost visibility, before anything is built on top of them
- [ ] **Phase 2: Core Generation Pipeline** - A typed idea flows automatically through the Story Director to a full set of local scene images and video clips for one story
- [ ] **Phase 3: Persistence & Structural Uniqueness** - Stories, scenes, and generation records survive a restart, and structurally-similar stories are rejected and regenerated before reaching review
- [ ] **Phase 4: Wife-Facing Review & Approval Flow** - The non-technical target user can run the full create → review → approve → generate → find-output flow using only plain-language UI
- [ ] **Phase 5: Budget & Retry Safeguards** - Every paid call is guarded by a hard monthly budget check that no retry can bypass
- [ ] **Phase 6: Reliability, Secrets Hygiene & Output Correctness** - The tool fails safely and honestly at every edge instead of corrupting state or leaking secrets

## Phase Details

### Phase 1: Provider Smoke Test

**Goal**: Prove that Gemini's image generation model and Veo 3.1 Lite's image-to-video model both genuinely work end-to-end from this codebase, with real per-call cost visible, before any persistence or interface investment is made. This is the riskiest, least-proven part of the whole project (a paid-preview API) and must be de-risked first.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: None — this is a technical spike, not a wife-facing deliverable. It de-risks the provider integrations that STORY-*, IMAGE-*, and VIDEO-* requirements depend on in Phase 2 onward.
**Success Criteria** (what must be TRUE):

  1. Running a throwaway script or route produces one AI-generated scene image, saved as a local file that can be opened and viewed.
  2. That same image is submitted to Veo 3.1 Lite and produces one playable local MP4 clip (9:16, 720p) via image-to-video.
  3. The actual/estimated cost of both calls is printed or logged, so real per-call pricing is known before the budget system is built on assumptions.
  4. A provider error (auth failure, rate limit, malformed response) surfaces as a clear message in the output, not a silent hang or an uncaught crash.

**Plans:** 1/4 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Project scaffold, secrets hygiene, and gated SDK install

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-02-PLAN.md — $3.00 spend-ceiling ledger and secret-safe response logger (no paid calls)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-03-PLAN.md — Tracer: one generic prompt through image → video, end to end

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 01-04-PLAN.md — D-01 child-protagonist safety probe and empirical cost reconciliation

### Phase 2: Core Generation Pipeline

**Goal**: A wife-typed idea flows automatically through the Story Director to a full set of local scene images and video clips for one story, proving the entire creative chain works before persistence, uniqueness checking, or polish are added.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: STARTUP-01, STORY-01, STORY-02, STORY-03, STORY-04, STORY-05, SCENE-01, SCENE-02, VIDEO-01
**Success Criteria** (what must be TRUE):

  1. She can start the app with one documented command and reach it at localhost:3000 with no compilation errors and no fatal startup errors.
  2. Typing a story idea in Bangla script, or in Banglish, produces an equally coherent story (title, beginning, middle, ending) with no manual translation step required.
  3. She can describe a character and pick a style/mood in plain language, and the app automatically produces a Character Bible, a Style Bible, and a 5-7 scene breakdown — she never writes or sees a raw AI prompt.
  4. The scene breakdown always has exactly the requested number of scenes, numbered 1..N with no gaps or duplicates, and character appearance/clothing/features carry forward across consecutive scene prompts so scenes stay visually consistent.
  5. She can animate one approved scene image into a 9:16, 720p Veo clip and confirm the result end-to-end before committing to generating a full episode.

**Plans**: TBD

### Phase 3: Persistence & Structural Uniqueness

**Goal**: Every story, scene, and generation record survives an app restart, and no story reaches her for review if it's a structural reskin of one she's already made.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: UNIQUE-01, UNIQUE-02, UNIQUE-03, PERSIST-01, IMAGE-01, IMAGE-03, VIDEO-03 (soft — per REQUIREMENTS.md this is one of the two items where a documented limitation is an acceptable outcome if the 24-hour deadline is at risk)
**Success Criteria** (what must be TRUE):

  1. A newly generated story is checked for structural similarity — protagonist, conflict, mechanism, ending, not just surface nouns — against every previously accepted story before it's offered for review.
  2. A structurally-similar candidate is automatically rejected and regenerated with the collision explicitly avoided, capped at a configurable maximum number of attempts, rather than being silently accepted or retried forever.
  3. Two genuinely different stories that happen to share generic elements (e.g. both involve a girl, a forest) are not falsely rejected.
  4. After restarting the app, every story, scene, and generation record — including saved image paths and logged costs — is still present and usable by the uniqueness system.
  5. (Soft) In-progress or completed video jobs are still trackable after closing/reopening the browser or restarting the app; if this proves out of reach in the available time, the limitation is documented rather than silently broken.

**Plans**: TBD

### Phase 4: Wife-Facing Review & Approval Flow

**Goal**: The actual non-technical target user can complete the full create-story-form → review-screens → approval → video-status-screen → find-output flow using only plain-language buttons and status text.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: APPROVAL-01, IMAGE-02, VIDEO-02, VIDEO-04, LIBRARY-01 (soft — per REQUIREMENTS.md this is one of the two items where a documented limitation is an acceptable outcome if the 24-hour deadline is at risk), OUTPUT-01, OUTPUT-03, UI-01
**Success Criteria** (what must be TRUE):

  1. Video generation cannot start for a story — through any path, not just the visible UI — until she has explicitly approved that story's scene images.
  2. She can regenerate a single scene's image without affecting any other scene's image, video, or status.
  3. She can generate videos for every approved scene in an episode, see each scene's video job tracked and displayed with its own status on a dedicated status screen, and retry a single failed scene without affecting any other scene.
  4. She can open a finished episode's output folder directly from the app and find its clips numbered in the correct order for CapCut import.
  5. (Soft) She can see a list of all past stories with title, date, status, and scene count, and open any one to view its details, with no duplicate entries created by normal use; if this proves out of reach in the available time, the limitation is documented rather than silently broken.
  6. She can complete the entire create → review → approve → generate → output flow using only plain-language buttons and status text, and any error explains what to do next rather than showing developer/API terminology.

**Plans**: TBD
**UI hint**: yes

### Phase 5: Budget & Retry Safeguards

**Goal**: No paid provider call can ever fire in a way that would exceed the configured monthly budget, and no retry of any kind can bypass that guarantee.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: BUDGET-01, BUDGET-02, BUDGET-03, BUDGET-04, BUDGET-05
**Success Criteria** (what must be TRUE):

  1. Every paid call (LLM, image, video) is preceded by a check that current month-to-date spend plus the estimated cost of the request does not exceed the configured monthly budget, and is refused with a clear explanation if it would.
  2. Changing the monthly budget (e.g. via `MONTHLY_BUDGET_USD`) takes effect without a code change.
  3. She can see running month-to-date spend broken down by generation type (video/image/LLM) against the configured limit.
  4. Retrying any failed generation passes through the exact same budget check as a first attempt — retries cannot bypass the budget.
  5. Once a scene hits its configured maximum image or video retries, further retries are refused with a clear message rather than looping.

**Plans**: TBD

### Phase 6: Reliability, Secrets Hygiene & Output Correctness

**Goal**: The tool fails safely and honestly at every edge — provider errors, missing keys, malformed output files — instead of corrupting state or leaking secrets, and is trustworthy to hand over for unsupervised use.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: RELIABILITY-01, SECURITY-01, STARTUP-02, OUTPUT-02
**Success Criteria** (what must be TRUE):

  1. A provider failure (error, timeout, rate limit, malformed response) is caught and shown to her in plain language, leaving only the affected scene in a clearly failed-but-retryable state without corrupting any other scene's data.
  2. If a required API key is missing, the app still starts and clearly explains to her what's missing, never crashing with a stack trace and never exposing secret values in the browser.
  3. API keys live only in server-side configuration, are never sent to client-side JavaScript, and never appear in logs or generated story metadata; `.env.local` is gitignored with only a placeholder-filled `.env.local.example` committed.
  4. Every saved video file is confirmed to be a valid, non-empty, playable MP4 at approximately the requested duration and 9:16 dimensions when requested — never a text or image file mislabeled as `.mp4`.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Provider Smoke Test | 1/4 | In Progress|  |
| 2. Core Generation Pipeline | 0/TBD | Not started | - |
| 3. Persistence & Structural Uniqueness | 0/TBD | Not started | - |
| 4. Wife-Facing Review & Approval Flow | 0/TBD | Not started | - |
| 5. Budget & Retry Safeguards | 0/TBD | Not started | - |
| 6. Reliability, Secrets Hygiene & Output Correctness | 0/TBD | Not started | - |

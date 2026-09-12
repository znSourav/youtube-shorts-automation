# Requirements: AI Animated YouTube Shorts Studio

**Defined:** 2026-09-12
**Core Value:** One simple idea in → one genuinely original, structurally-unique animated episode's worth of local video assets out, without ever exceeding the $15 experiment budget or silently shipping a story that's a thin reskin of a previous one.

## v1 Requirements

Requirements for the 24-hour MVP. Each maps to a roadmap phase.

> Per the original brief, **LIBRARY-01**, **VIDEO-03**, and **BUDGET's restart-reconciliation behavior** are the first three to cut if the 24-hour deadline is at risk — a documented limitation is an acceptable outcome for these specifically, not a failed MVP. Everything else in this list is a hard requirement.

### Startup

- [x] **STARTUP-01**: Wife can start the whole app with one documented command and reach it at `localhost:3000` on a fresh install, with no compilation errors and no fatal startup errors
- [ ] **STARTUP-02**: If a required API key is missing, the app still starts and clearly explains what's missing in the UI instead of crashing or showing a stack trace, and never exposes secret values in the browser

### Story

- [x] **STORY-01**: Wife can type a story idea in Bangla script and receive a coherent, original story with a title, beginning, middle, and ending
- [x] **STORY-02**: Wife can type the same idea in Banglish (Latin-script Bangla) with identical results — no manual translation required
- [x] **STORY-03**: Wife can describe a character and pick an animation style/mood in plain language, and never has to write or see an AI prompt
- [x] **STORY-04**: Every generated story includes a Character Bible and a Style Bible, generated automatically from her inputs and the selected style preset
- [x] **STORY-05**: Wife can choose a scene count (5-7) and get an automatically-generated scene-by-scene breakdown, each scene with a clear story purpose

### Uniqueness

- [ ] **UNIQUE-01**: A newly generated story is checked for structural similarity (protagonist, conflict, mechanism, ending, etc. — not just surface nouns) against every previously accepted story before being offered for review
- [ ] **UNIQUE-02**: A structurally-similar candidate is automatically rejected and regenerated with the collision explicitly avoided, rather than silently accepted or endlessly retried — capped at a configurable maximum number of attempts
- [ ] **UNIQUE-03**: Two genuinely different stories that happen to share generic elements (e.g. both involve a girl, a forest) are not falsely rejected

### Scene

- [x] **SCENE-01**: Every approved story produces exactly the requested number of scenes, numbered 1..N, with no duplicates or gaps
- [x] **SCENE-02**: Generated scene prompts explicitly carry forward character appearance/clothing/features so consecutive scenes stay visually consistent

### Image

- [ ] **IMAGE-01**: Wife can trigger scene image generation for an approved story and see every scene's image once ready, saved locally with paths recorded in the database
- [ ] **IMAGE-02**: Wife can regenerate a single scene's image without affecting any other scene's image, video, or status
- [ ] **IMAGE-03**: Every image generation call is recorded with its estimated (and actual, where available) cost

### Approval

- [ ] **APPROVAL-01**: Video generation cannot start — through any path, not just the visible UI — until the wife has explicitly approved a story's scene images

### Video

- [ ] **VIDEO-01**: Wife can animate a single approved scene image into a 9:16, 720p video clip via Veo 3.1 Lite and confirm the result end-to-end before committing to a full episode
- [ ] **VIDEO-02**: Wife can generate videos for every approved scene in an episode, with each scene tracked as an independent job showing its own status
- [ ] **VIDEO-03**: Closing and reopening the browser, or restarting the app, does not lose track of in-progress or completed video jobs
- [ ] **VIDEO-04**: Wife can retry a single failed scene's video without regenerating any other scene, and the retry counts toward that scene's retry limit

### Budget

- [ ] **BUDGET-01**: Every paid generation call is preceded by a check that current month-to-date spend plus the estimated cost of the request does not exceed the configured monthly budget; the call is refused with a clear explanation if it would
- [ ] **BUDGET-02**: The monthly budget limit is configurable (e.g. via `MONTHLY_BUDGET_USD`) and enforced without a code change
- [ ] **BUDGET-03**: Wife can see running month-to-date spend broken down by generation type (video/image/LLM) against the configured limit
- [ ] **BUDGET-04**: A retry of any failed generation passes through the same budget check as a first attempt — retries cannot bypass the budget
- [ ] **BUDGET-05**: Each scene has a configurable maximum number of image and video retries; once reached, further retries are refused with a clear message rather than looping

### Reliability

- [ ] **RELIABILITY-01**: A provider failure (error, timeout, rate limit, malformed response) is caught, shown to the wife in plain language, and leaves the affected scene in a clearly failed-but-retryable state without corrupting other scenes' data

### Security

- [ ] **SECURITY-01**: API keys live only in server-side configuration, are never sent to client-side JavaScript, never appear in logs or generated story metadata; `.env.local` is gitignored with only a placeholder-filled `.env.local.example` committed

### Persistence

- [ ] **PERSIST-01**: Every story, scene, and generation record persists in local SQLite and is still present, with the uniqueness system still able to use it, after the app is restarted

### Library

- [ ] **LIBRARY-01**: Wife can see a list of all past stories with title, date, status, and scene count, and open any one to view its details, with no duplicate entries created by normal use

### Output

- [ ] **OUTPUT-01**: Every completed episode's assets are written to a predictable local folder structure (story.json, story.txt, character reference, per-scene image+video, numbered output clips) that the wife can open directly from the app
- [ ] **OUTPUT-02**: Every saved video file is a valid, non-empty, playable MP4 at approximately the requested duration and 9:16 dimensions when requested — never a text or image file mislabeled as `.mp4`
- [ ] **OUTPUT-03**: Output clips are numbered so the wife can import them into CapCut in the correct order with no extra tooling beyond CapCut itself

### UI

- [ ] **UI-01**: A non-technical user can complete the full flow (create story → review story → review images → approve → generate videos → open output) using only plain-language buttons and status text, with errors that explain what to do next rather than developer/API terminology

## v2 Requirements

Acknowledged but deferred — only relevant if the Month 1 experiment validates the concept, per the original brief's own growth path.

### Growth Path

- **GROWTH-01**: Additional/alternate AI providers (video, image, or LLM) behind the same provider interfaces
- **GROWTH-02**: Automated YouTube publishing
- **GROWTH-03**: Automated voice, music, sound-effect, and caption generation
- **GROWTH-04**: Extracted backend / cloud infrastructure if usage outgrows a single local process
- **GROWTH-05**: Multi-user / team support

## Out of Scope

Explicitly excluded from this project, not just this milestone. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Authentication, accounts, multi-user | Single local user (the wife), single machine |
| Cloud hosting, SaaS billing | Local experiment, not a product |
| Redis, PostgreSQL, Kubernetes | No justified need at single-user local scale |
| n8n as application infrastructure | Explicitly rejected as the app itself; may still be consulted as a reference for provider-integration patterns |
| Complex job queues / microservices | A single local Next.js process with client-side polling is sufficient at this scale |
| Vector database for uniqueness checking | A deterministic pre-filter plus a targeted LLM comparison is cheaper and sufficient at this scale |
| Automated voice/music/SFX/caption generation | Wife adds these manually in CapCut by design |
| Automated YouTube publishing | Manual upload by design |
| Veo reference-image and video-extension features | Not available on the Lite tier; the image-first workflow doesn't depend on them |
| ffmpeg / in-app audio stripping | Veo's MP4 passes through as-is; audio is muted/replaced manually in CapCut |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| STARTUP-01 | Phase 2 | Complete |
| STARTUP-02 | Phase 6 | Pending |
| STORY-01 | Phase 2 | Complete |
| STORY-02 | Phase 2 | Complete |
| STORY-03 | Phase 2 | Complete |
| STORY-04 | Phase 2 | Complete |
| STORY-05 | Phase 2 | Complete |
| UNIQUE-01 | Phase 3 | Pending |
| UNIQUE-02 | Phase 3 | Pending |
| UNIQUE-03 | Phase 3 | Pending |
| SCENE-01 | Phase 2 | Complete |
| SCENE-02 | Phase 2 | Complete |
| IMAGE-01 | Phase 3 | Pending |
| IMAGE-02 | Phase 4 | Pending |
| IMAGE-03 | Phase 3 | Pending |
| APPROVAL-01 | Phase 4 | Pending |
| VIDEO-01 | Phase 2 | Pending |
| VIDEO-02 | Phase 4 | Pending |
| VIDEO-03 | Phase 3 | Pending (soft — documented limitation acceptable if time-constrained) |
| VIDEO-04 | Phase 4 | Pending |
| BUDGET-01 | Phase 5 | Pending |
| BUDGET-02 | Phase 5 | Pending |
| BUDGET-03 | Phase 5 | Pending |
| BUDGET-04 | Phase 5 | Pending |
| BUDGET-05 | Phase 5 | Pending |
| RELIABILITY-01 | Phase 6 | Pending |
| SECURITY-01 | Phase 6 | Pending |
| PERSIST-01 | Phase 3 | Pending |
| LIBRARY-01 | Phase 4 | Pending (soft — documented limitation acceptable if time-constrained) |
| OUTPUT-01 | Phase 4 | Pending |
| OUTPUT-02 | Phase 6 | Pending |
| OUTPUT-03 | Phase 4 | Pending |
| UI-01 | Phase 4 | Pending |

**Coverage:** 33/33 v1 requirements mapped. No orphans, no duplicates.

Phase 1 (Provider Smoke Test) intentionally carries no requirement mappings — it is a technical spike that de-risks the AI provider integrations before any wife-facing capability is built on top of them, per explicit project sequencing guidance.

---
*Requirements defined: 2026-09-12*
*Last updated: 2026-09-12 after roadmap creation*

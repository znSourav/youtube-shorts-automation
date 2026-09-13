---
phase: "04"
slug: "wife-facing-review-approval-flow"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-14"
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in, zero external test framework) — matches Phases 1-3's established convention |
| **Config file** | none — `.test.ts` files are listed explicitly in the `test:lib` npm script, not auto-discovered |
| **Quick run command** | `node --test <the file just changed's corresponding .test.ts>` |
| **Full suite command** | `npm run test:lib` — must be extended to include every new test file this phase creates |
| **Estimated runtime** | unit tests: seconds (fake DB/video-provider injection, zero real network calls in Wave 0 tests); real proof runs are separately budget-gated |

---

## Sampling Rate

- **After every task commit:** run the file's own corresponding `.test.ts`
- **After every plan wave:** `npm run test:lib` — fast, no network calls, no cost
- **Phase gate:** full suite green before `/gsd-verify-work`, plus the manual UAT walkthrough (create → review → approve → generate → status → output) since UI-01 is fundamentally a human-judgment requirement

---

## Per-Task Verification Map

Task ID/Wave columns filled in once `/gsd-plan-phase` produces `04-*-PLAN.md`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | APPROVAL-01 | — | `generateSceneVideoAction` refuses to dispatch when `imagesApprovedAt` is null, regardless of caller | unit (injected fake DB reader, no real Veo call) | `node --test src/app/actions/generate-video.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | IMAGE-02 | — | Regenerating one scene's image does not alter another scene's imagePath/imageStatus/videoStatus | unit | `node --test src/app/actions/regenerate-scene-image.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | VIDEO-02, VIDEO-04 | — | Batch dispatch writes independent per-scene status; one scene's failure never blocks/alters another; retry increments only that scene's videoAttempts | unit (fake video provider, zero real spend) | `node --test src/app/actions/generate-all-videos.test.ts` and `.../retry-scene-video.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | IMAGE-02, VIDEO-04 (D-03 cap) | — | `maxSceneRetryAttempts()` env-parsing degrades safely on malformed/absent values (mirrors `check.ts`'s `maxRegenerationAttempts()`) | unit | `node --test src/core/retry/caps.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LIBRARY-01 (soft) | — | `listStoriesAction` returns correct title/date/status/scene-count for N seeded stories, no duplicates | unit (temp SQLite file) | `node --test src/app/actions/list-stories.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | OUTPUT-01, OUTPUT-03 | — | `openStoryFolderAction` refuses a malformed storyId before ever calling execFile | unit (execFile mocked/injected) | `node --test src/app/actions/open-story-folder.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/actions/generate-video.test.ts` — approval-gate + retry-cap + server-resolved-path refactor coverage, zero real Veo calls (inject a fake `generateVideo`)
- [ ] `src/core/retry/caps.test.ts` — env-parsing safe-default coverage for the new per-scene retry cap
- [ ] `src/app/actions/list-stories.test.ts`, `.../open-story-folder.test.ts`, `.../regenerate-scene-image.test.ts`, `.../generate-all-videos.test.ts`, `.../retry-scene-video.test.ts` — none exist yet; all new actions this phase adds
- [ ] `test:lib` npm script extended to list every new test file (existing hardcoded-list convention)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Every new error message (approval-missing, retry-cap-exhausted, video-generation-failed) reads as plain language with no developer/API terminology | UI-01 | Message-quality/tone judgment isn't scriptable | Walk create → review → approve → generate → status → output once live; read every message surfaced along the way |
| The full end-to-end flow is completable by a non-technical user using only plain-language buttons and status text | UI-01, all of Phase 4's requirements together | End-to-end UX judgment isn't scriptable | Full cold-start walkthrough with `npm run dev` running |
| The new fourth (video-status) screen's layout and per-scene status indicators are clear and non-technical | VIDEO-02, VIDEO-03, VIDEO-04 | Visual/UX judgment isn't scriptable | Trigger a batch video generation, observe the status screen live |
| The output folder actually opens in File Explorer with correctly-numbered clips visible | OUTPUT-01, OUTPUT-03 | Requires a real OS-level folder-open action, not scriptable in a unit test | Click the output-folder button on a completed story, confirm Explorer opens to the right path with numbered clips |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency reasonable — Wave 0 tests are all mocked/local; real proof-runs (if any) are separately budget-gated per 04-RESEARCH.md's $3.0870/$3.25 ($0.163 headroom) warning
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

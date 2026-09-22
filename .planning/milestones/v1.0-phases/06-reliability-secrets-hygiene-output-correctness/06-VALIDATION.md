---
phase: "06"
slug: "reliability-secrets-hygiene-output-correctness"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-20"
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node's built-in `node:test` — no third-party test framework, matches every existing test file in the repo |
| **Config file** | none — invoked directly via the file list in `package.json`'s `test:lib` script |
| **Quick run command** | `node --test src/core/config/provider-key.test.ts` (once created) |
| **Full suite command** | `npm run test:lib` (runs every `node:test` file plus `node src/scripts/check-boundaries.ts`) |
| **Estimated runtime** | ~1-2 seconds (matches the existing 263-test suite's current ~1.2s runtime) |

---

## Sampling Rate

- **After every task commit:** Run the single changed/new test file's own `node --test <file>` command
- **After every plan wave:** `npm run test:lib`
- **Before `/gsd-verify-work`:** Full suite must be green, plus `npm run typecheck` and `npm run build`
- **Max feedback latency:** ~2 seconds (full suite + typecheck)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | RELIABILITY-01 | T-06-01 | `veo.ts`'s new `blockKind` discriminator correctly classifies operation-error / RAI-block / no-video-in-response | unit | `node --test src/providers/video/veo.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | RELIABILITY-01 | T-06-01 | `create-story.ts`'s message differentiates `stage: "prompt"` from `"candidate"`/`"parse"` | unit | `node --test src/providers/llm/gemini.test.ts` | ✅ (extend) | ⬜ pending |
| 06-01-03 | 01 | 1 | STARTUP-02 | T-06-02 | `assertApiKeyConfigured` throws `MissingApiKeyError` when both env vars are absent/blank, passes when either is set | unit | `node --test src/core/config/provider-key.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-04 | 01 | 1 | SECURITY-01 | T-06-03 | `isSecretKey` no longer redacts `*TokenCount`/`*TokensDetails` fields, still redacts `key`/`token`/`authorization`-shaped fields | unit | `node --test src/lib/log-response.test.ts` | ✅ (extend) | ⬜ pending |
| 06-01-05 | 01 | 1 | SECURITY-01 | T-06-04 | No `"use client"` file imports a provider/secrets-adjacent module after this phase's changes | structural | `node src/scripts/check-boundaries.ts` | ✅ (existing, in `test:lib`) | ⬜ pending |
| 06-02-01 | 02 | 2 | OUTPUT-02 | T-06-05 | `validateMp4Buffer` accepts a real valid MP4, rejects empty/text/image-mislabeled buffers, rejects wrong-duration/wrong-aspect-ratio | unit | `node --test src/core/output/mp4-validation.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 2 | OUTPUT-02 | T-06-06 | D-05's free-retry flag bypasses the cap gate exactly once, then clears | unit | `node --test src/core/approval/gates.test.ts` | ✅ (extend) | ⬜ pending |
| 06-03-01 | 03 | 3 | RELIABILITY-01 | T-06-07 | A hung provider HTTP call is bounded by `httpOptions.timeout` at every one of the four call sites, not just the poll loop's wall-clock check | unit | `node --test src/providers/video/veo.test.ts src/providers/llm/gemini.test.ts` | ❌ W0 (shared with 06-01-01) | ⬜ pending |
| 06-03-02 | 03 | 3 | RELIABILITY-01 | — | The stuck-generation detector reads a server-anchored `videoGeneratingSince` timestamp, surviving a page reload | unit | `node --test src/app/actions/get-story-status.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/providers/video/veo.test.ts` — new file; `veo.ts` currently has no direct unit tests (only integration coverage via `smoke-test.ts`/`story-probe.ts`) — covers RELIABILITY-01's `blockKind` discriminator and the Wave 3 `httpOptions.timeout` behavior
- [ ] `src/core/config/provider-key.test.ts` — new file, covers STARTUP-02's `assertApiKeyConfigured`/`MissingApiKeyError`
- [ ] `src/core/output/mp4-validation.test.ts` — new file, covers OUTPUT-02's `validateMp4Buffer`. **Blocked on a fixture decision**: the real Veo-generated file this phase's research validated against (`storage/stories/story-1789237907876-npep3b/scenes/01/video.mp4`) is confirmed gitignored (`storage/stories/` in `.gitignore`) and will not exist on a fresh clone or CI. The planner must either commit a small dedicated fixture file under a tracked test-fixtures directory, or generate a minimal synthetic valid-MP4 buffer in the test itself — a skip-if-absent guard against the local `storage/` path is not acceptable for a real automated test.
- [ ] `src/app/actions/get-story-status.test.ts` — new file (does not currently exist), covers the server-anchored `stuck` computation once `videoGeneratingSince` lands
- [ ] Add every new test file above to `package.json`'s `test:lib` script — this project does not auto-discover test files; an unlisted file silently never runs
- [ ] Prisma migration: `npx prisma migrate dev --name phase6_video_generating_since` (adds `Scene.videoGeneratingSince`); a second migration or the same one for D-05's `videoSaveCorrupted`/`imageSaveCorrupted` flag columns, per the planner's schema decision

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| The missing-API-key message appears in place of the normal result when she clicks an action that needs it, with no crash and no persistent banner | STARTUP-02, D-03/D-04 | No component/DOM test framework exists in this repo (established convention since Phase 4); this specific check also requires exercising a real-then-removed env var, which is awkward to fully automate given this environment's own `.env*` access restrictions | With the dev server running, unset the API key, click "Create Story", confirm the plain-language explanation appears where the result normally would; restore the key and confirm normal operation resumes |
| A genuinely corrupted saved video file surfaces the free-retry exemption end to end (no cap consumed, she can retry immediately) | OUTPUT-02, D-05 | Requires either a real corrupted file (expensive — needs a real paid Veo call, then deliberately damaging the saved bytes) or careful test-double injection; not worth a live paid-call proof given the unit-level `validateMp4Buffer` and `gates.ts` coverage already planned | With a completed story, manually truncate/corrupt one scene's saved `video.mp4` on disk, reload the Video Status screen, confirm the scene shows a failed-but-retryable state and that retrying it does not decrement the visible retry-attempts remaining |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

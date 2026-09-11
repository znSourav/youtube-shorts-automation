---
phase: "01"
slug: "provider-smoke-test"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-12"
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — greenfield project, no test infrastructure exists yet |
| **Config file** | none — see Wave 0 |
| **Quick run command** | `node --env-file=.env.local src/scripts/smoke-test.ts` |
| **Full suite command** | same as quick run — this phase has no automated test suite beyond the smoke script's own assertions |
| **Estimated runtime** | ~2-5 minutes (Veo image-to-video polling is the dominant cost, ~10s intervals until done) |

---

## Sampling Rate

- **After every task commit:** Run `node --env-file=.env.local src/scripts/smoke-test.ts` against whatever provider calls have been wired up so far (image-only first, per D-03's sequencing)
- **After every plan wave:** Full end-to-end run (image → video → cost summary) once both providers are wired
- **Before `/gsd-verify-work`:** All four success criteria visibly satisfied in one script run
- **Max feedback latency:** ~300 seconds (accounts for Veo's polling loop)

---

## Per-Task Verification Map

Phase 1 carries no formal requirement IDs (technical spike). Its four roadmap success criteria stand in for requirement IDs here; Task ID/Wave columns are filled in once `/gsd-plan-phase` produces `01-PLAN.md`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 01 | TBD | SC-1 (image produced, viewable) | — | Script writes a non-empty PNG to `storage/_smoketest/` | smoke | script asserts `fs.statSync(path).size > 0`, operator opens file manually | ❌ W0 | ⬜ pending |
| TBD | 01 | TBD | SC-2 (image animated to playable MP4) | — | Script writes a non-empty MP4, image bytes fed forward from SC-1 | smoke | script asserts file size > 0 and video-container magic bytes; operator plays manually | ❌ W0 | ⬜ pending |
| TBD | 01 | TBD | SC-3 (real per-call cost logged) | — | Script prints a cost line after each call | smoke | `node --env-file=.env.local src/scripts/smoke-test.ts` — read stdout | ❌ W0 | ⬜ pending |
| TBD | 01 | TBD | SC-4 (provider errors surface clearly) | T-01-01 (API key leak) | Script classifies `promptFeedback`/`finishReason`/`raiMediaFilteredReasons` before declaring success or failure | smoke | same script/run — validated by the D-01 child-scene probe call itself | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json` + `tsconfig.json` — no scaffold exists yet (RESEARCH.md Pitfall 4)
- [ ] `.gitignore` — must exist before `.env.local` is created, to prevent ever committing the API key
- [ ] `src/scripts/smoke-test.ts` — the script itself, which doubles as this phase's entire test suite
- [ ] `.env.local.example` — placeholder-filled, so the real `.env.local` pattern is established from Phase 1 even though SECURITY-01 isn't formally due until Phase 6

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Generated image looks like a usable scene (not just non-empty bytes) | SC-1 | Visual quality judgment isn't scriptable | Open `storage/_smoketest/scene-*.png` in an image viewer after the run |
| Generated video plays correctly, is portrait 9:16, and motion looks reasonable | SC-2 | Visual/playback judgment isn't scriptable | Open `storage/_smoketest/scene-childscene.mp4` in a media player after the run |
| Whether a safety-filter block on the child-protagonist probe is a real content-policy problem vs. RESEARCH.md's documented non-deterministic false-positive pattern | SC-4 | Requires human judgment on retry-worthiness, not just detecting the block | If blocked, log the exact `raiMediaFilteredReasons`, retry once, and report both outcomes to the requester rather than treating one block as definitive |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

---
phase: "01"
slug: "provider-smoke-test"
status: planned
nyquist_compliant: true
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

Phase 1 carries no formal requirement IDs (technical spike). Its four roadmap success criteria stand in for requirement IDs here. Task ID/Wave columns filled in by `/gsd-plan-phase` on 2026-09-12 against the four plans it produced.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| T1 (scaffold) | 01-01 | 1 | — (Wave 0 gap) | T-01-01 (API key leak), T-01-03 | `.gitignore` excludes `.env.local` before the key file can exist; the spend ledger is deliberately tracked | unit/static | `git check-ignore -q .env.local && ! git check-ignore -q storage/_smoketest/spend-ledger.json` | ❌ W0 | ⬜ pending |
| T2 (legitimacy), T3 (install) | 01-01 | 1 | — (Wave 0 gap) | T-01-SC, T-01-06 | `[SUS]` verdict cleared by a blocking-human checkpoint before install; EOL SDK asserted absent | unit/static | `node -e "…import('@google/genai')…"` asserting the `GoogleGenAI` export and a 2.x version | ❌ W0 | ⬜ pending |
| T1 (ledger) | 01-02 | 2 | D-04/D-05 ceiling (pre-req for SC-3) | T-01-02, T-01-04 | Refuses a call crossing $3.00; a corrupted ledger halts rather than reading as $0 | unit | `node --test src/lib/spend-ledger.test.ts` | ❌ W0 | ⬜ pending |
| T2 (redacting logger) | 01-02 | 2 | pre-req for SC-4 | T-01-01 | Base64 payloads and key/token/authorization fields never reach a log | unit | `node --test src/lib/log-response.test.ts` | ❌ W0 | ⬜ pending |
| T2 (tracer) | 01-03 | 3 | SC-1 (image produced, viewable) | T-01-01 | Script writes a non-empty PNG to `storage/_smoketest/` | smoke | `node --env-file=.env.local src/scripts/smoke-test.ts --probe=generic --image-only`; then `fs.statSync(path).size > 0`; operator opens the file manually | ❌ W0 | ⬜ pending |
| T2 (tracer) | 01-03 | 3 | SC-2 (image animated to playable MP4) | T-01-07, T-01-08 | Script writes a non-empty MP4, image bytes fed forward from SC-1 | smoke | `node --env-file=.env.local src/scripts/smoke-test.ts --probe=generic`; then a `node -e` check asserting size > 10000 B and `ftyp` at bytes 4-8; operator plays it manually | ❌ W0 | ⬜ pending |
| T2 (tracer) | 01-03 | 3 | SC-3 (real per-call cost logged) | T-01-02 | Script prints an `IMAGE COST $` / `VIDEO COST $` line after each call and appends a ledger entry | smoke | same run — read stdout and `storage/_smoketest/generic-run.log` | ❌ W0 | ⬜ pending |
| T1 (child probe) | 01-04 | 4 | SC-4 (provider errors surface clearly) | T-01-02 (retry path) | Script classifies `promptFeedback`/`finishReason`/`raiMediaFilteredReasons` before declaring success or failure; a Veo block is retried exactly once through the same ceiling gate | smoke | `node --env-file=.env.local src/scripts/smoke-test.ts --probe=childscene`; then a `node -e` check asserting one `CHILD PROBE:` outcome line with a non-empty reason where blocked | ❌ W0 | ⬜ pending |
| T2 (reconciliation) | 01-04 | 4 | SC-3 (pricing established, not assumed) | T-01-10 | Hardcoded price constants reconciled against observed `usageMetadata`; unresolved is an allowed, explicit answer | unit/static | `node src/scripts/smoke-test.ts --report` (no key, no network); then a `node -e` ledger-integrity check asserting the phase total is at or below 3.00 | ❌ W0 | ⬜ pending |

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — 18 automated commands across 4 plans; `check verify-failure-directions 1` reports 0 blockers, 0 warnings
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — the only tasks without one are the two checkpoints (01-01 T2, 01-03 T1), each adjacent to an automated task
- [x] Wave 0 covers all MISSING references — `package.json`/`tsconfig.json`/`.gitignore`/`.env.local.example` in plan 01-01, `src/scripts/smoke-test.ts` in plan 01-03
- [x] No watch-mode flags
- [x] Feedback latency < 300s — the dominant cost is Veo polling, bounded at a 10-minute ceiling in plan 01-03; the 4-second tracer clip is the cheapest real proof available and every non-paid check (`node --test`, `npm run typecheck`, `--report`) runs in seconds
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned 2026-09-12 — `wave_0_complete` stays false until the plans execute and the files exist.

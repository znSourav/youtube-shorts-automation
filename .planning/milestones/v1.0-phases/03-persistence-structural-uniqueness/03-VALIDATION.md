---
phase: "03"
slug: "persistence-structural-uniqueness"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-13"
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in, zero external test framework) — matches PROJECT.md's explicit "no automated test suite" decision and Phase 1/2's own established pattern |
| **Config file** | none — `test:lib` script in `package.json` enumerates files explicitly; new test files must be appended to that script string |
| **Quick run command** | `npm run test:lib` (after appending this phase's new test files) |
| **Full suite command** | same as quick run — this project has no separate quick/full split |
| **Estimated runtime** | unit + integration tests: seconds (no real network calls in Wave 0 tests — LLM tie-breaker calls are mocked); real end-to-end proof runs: real paid calls, budget-constrained |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:lib` — fast, no network calls, no cost
- **After every plan wave:** same command (no framework split to sample differently)
- **Phase gate:** `npm run test:lib` green, plus `node src/scripts/check-boundaries.ts` green (extended to cover Prisma-touching code per RESEARCH.md Pitfall 4), before `/gsd-verify-work`

---

## Per-Task Verification Map

Task ID/Wave columns filled in once `/gsd-plan-phase` produces `03-*-PLAN.md`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | PERSIST-01 | — | A record written before "restart" (new PrismaClient instance against the same SQLite file) is still readable | integration | `node --test src/lib/db.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | UNIQUE-01, UNIQUE-03 | — | Deterministic pre-filter returns correct pass/reject/borderline verdict on fixture fingerprint pairs, without false-rejecting genuinely different stories that share generic surface elements | unit | `node --test src/core/uniqueness/similarity.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | UNIQUE-02 | — | Regeneration loop stops at the configured max-attempts cap and never loops forever | unit (mocked LLM, zero real network calls, mirrors `gemini.test.ts`'s fixture-object convention) | `node --test src/core/uniqueness/check.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | IMAGE-03 | — | A generation record row is created with `estimatedUsd` set on every scene-image call | integration | `node --test src/app/actions/generate-images.test.ts` (or an adjacent uniqueness-module test) | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | VIDEO-03 (soft) | — | DB-side video job status survives a fresh `PrismaClient` instantiation | integration (DB half only — real browser-restart UI resume is a Manual-Only item below) | `node --test src/lib/db.test.ts` (shared with PERSIST-01) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/db.test.ts` — Prisma singleton + real restart-survival round trip against a temp SQLite file (isolated path per test, mirroring `spend-ledger.test.ts`'s injectable-path-parameter convention)
- [ ] `src/core/uniqueness/similarity.test.ts` — deterministic pre-filter (Jaccard-style) unit tests, including Assumption A1's sanity-check fixture pairs
- [ ] `src/core/uniqueness/check.test.ts` — orchestration test with a mocked LLM response — zero real network calls, zero ledger spend
- [ ] Append all new test files to `package.json`'s `test:lib` script string
- [ ] `prisma`/`@prisma/client`/`@prisma/adapter-better-sqlite3`/`better-sqlite3` installed, pinned exactly per RESEARCH.md's Standard Stack section (prisma 7.10.0, not the `latest`-tagged 8.0.0-rc.14)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A real collision-and-regenerate cycle reads as genuinely resolving the collision, and the plain-language status message shown during regeneration (D-03) makes sense to a non-technical reader | UNIQUE-01, UNIQUE-02 | Whether a rejection is *correct* (not just mechanically triggered) and whether wording is genuinely plain-language is a human judgment, not scriptable | Trigger a real or fixture-forced collision, read the on-screen status message during the retry, confirm it never shows the rejected story's text or names the past story it collided with (per D-03) |
| Two genuinely different stories sharing generic surface elements (e.g. both involve a girl, a forest) are NOT falsely rejected | UNIQUE-03 | Judging whether two specific real stories are "genuinely different" despite surface overlap requires human reading, not just the deterministic fixture tests in Wave 0 | Generate or construct two real stories sharing a generic surface element but differing in protagonist want/obstacle/ending; confirm neither is rejected |
| The retry-cap-exhausted warning (D-04) reads as plain-language and gives her a real, actionable choice | UNIQUE-02 | UI copy/tone judgment isn't scriptable | Force the regeneration cap to exhaust (or read the implemented copy directly); confirm it explains what happened and offers "use anyway" / "try a different idea" in plain language, never developer terminology |
| Closing and reopening the browser (or restarting the app) does not lose track of an in-progress or completed video job (VIDEO-03, soft) | VIDEO-03 | The automated test only proves the DB half; whether the real browser UI actually resumes correctly on reload is a live behavioral check | With `npm run dev` running, start a video generation, close the tab, reopen `localhost:3000`, confirm the job's status is still visible and correct — or confirm the documented limitation if this was deferred per the soft-requirement escape hatch |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency reasonable — Wave 0 tests are all mocked/local, no real paid-call latency in the automated suite; real proof-runs (if any) are separately budget-gated per RESEARCH.md's $0.0630 headroom warning
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

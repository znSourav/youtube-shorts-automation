# Phase 3: Persistence & Structural Uniqueness - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-13
**Phase:** 3-Persistence & Structural Uniqueness
**Areas discussed:** Uniqueness sensitivity, Regeneration visibility & exhaustion, Dev-test story handling

---

## Uniqueness sensitivity — what counts as "too similar"

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, that's the right bar | Same want+obstacle+ending-shape = too similar, regardless of surface dressing | ✓ |
| Stricter | Additional dimension (mood/tone/style preset/scene count) also triggers rejection | |
| Looser | Only near-identical structure (all elements) should collide, partial overlap passes | |

**User's choice:** Confirmed the three-element bar (want, obstacle/mechanism, ending) matches their mental model.

## Uniqueness sensitivity — borderline / partial-match handling

| Option | Description | Selected |
|--------|-------------|----------|
| All 3 must match to reject | Partial match (2 of 3) passes — keeps false-reject rate low | ✓ |
| 2 of 3 matching is enough | Stricter — rejects on partial overlap even with a different ending |

**User's choice:** All three elements must align before a story is rejected as too-similar.

---

## Regeneration visibility — what she sees during a collision retry

| Option | Description | Selected |
|--------|-------------|----------|
| Brief status message, then final result | "Making sure this is original... trying again" while retrying; rejected text never shown | ✓ |
| Fully invisible | Generic loading state, no indication a collision happened |
| Show her what collided and why | Tell her which past story and what matched — more transparency, more complexity |

**User's choice:** Brief plain-language status message during retries; she only ever reviews the final accepted story.

## Regeneration visibility — retry cap exhausted

| Option | Description | Selected |
|--------|-------------|----------|
| Show last attempt with a plain-language warning | She decides whether to use it anyway or try a different idea | ✓ |
| Hard block | Refuse to show any story; she must change the idea to continue |
| Accept silently, just log it | Show the last attempt as if nothing happened, log the near-miss |

**User's choice:** Show the last attempt with a plain-language warning — her call, nothing silently blocked or silently accepted.

---

## Dev-test story handling

| Option | Description | Selected |
|--------|-------------|----------|
| Start clean, ignore dev-test stories | The 3 real Phase 2 stories were Claude's testing, not her real usage — new database starts empty | ✓ |
| Seed the database with them | Import all 3 as real accepted stories so nothing later can structurally reproduce one of them |

**User's choice:** Start clean. The three Phase 2 dev-test stories (kite/marble boy, grandmother's bangle girl, fisherman/paper-boat) do not seed the uniqueness system.
**Notes:** These story folders stay on disk as harmless orphans with no corresponding database row; they were built before Prisma existed and are not real wife-usage.

---

## Claude's Discretion

- **VIDEO-03 appetite** (soft requirement — surviving a restart without losing in-progress video job tracking) was not selected for discussion. Stays exactly as ROADMAP.md frames it: attempt if it falls out naturally, document the limitation if not — not re-litigated as a fresh topic.
- Exact numeric regeneration-attempt cap (UNIQUE-02 says "configurable maximum") — left to research/planning, informed by the existing 3-attempt content-safety-retry pattern from Phase 2.
- Prisma schema shape (tables/columns for stories, scenes, generation records, cost tracking) — a research/planning concern, not put to the user.
- The deterministic pre-filter's specific mechanics — left to research/planning, informed by the three-element structural definition (want/obstacle/ending) the user confirmed.

## Deferred Ideas

None — discussion stayed within phase scope.

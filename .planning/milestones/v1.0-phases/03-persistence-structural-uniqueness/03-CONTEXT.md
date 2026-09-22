# Phase 3: Persistence & Structural Uniqueness - Context

**Gathered:** 2026-09-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Every story, scene, and generation record survives an app restart (SQLite via Prisma), and no story reaches her for review if it's a structural reskin of one she's already made (a deterministic pre-filter plus a targeted LLM comparison against every previously accepted story, capped at a configurable maximum regeneration attempts). ORM choice (Prisma) and the no-vector-database uniqueness approach were already locked in PROJECT.md's Key Decisions table at roadmap creation — this discussion covers the remaining gray areas: what "too similar" concretely means, what she sees during a collision/regeneration cycle, and how Phase 2's dev-test stories are treated once the uniqueness system goes live.

</domain>

<decisions>
## Implementation Decisions

### Uniqueness sensitivity (UNIQUE-01/UNIQUE-03)
- **D-01:** Structural similarity is judged on exactly three elements: (a) what the protagonist wants/lacks, (b) the central obstacle or mechanism that resolves it, (c) how it ends emotionally. Surface details (species, setting, specific object, character names) never factor into the comparison.
- **D-02:** A story is rejected as too-similar only when **all three** of D-01's elements align with a past story. A partial match (2 of 3) passes — this is the concrete mechanism that satisfies UNIQUE-03's guard against false-rejecting genuinely different stories that happen to share generic surface elements (e.g. both involve a girl, a forest).

### Regeneration visibility & exhaustion (UNIQUE-02)
- **D-03:** While a collision triggers automatic regeneration, she sees a brief plain-language status message (e.g. "Making sure this is original... trying again") — never the rejected story's actual text, never which past story it collided with or why. She only ever reviews the final accepted story.
- **D-04:** If the configurable maximum regeneration attempts are exhausted and every candidate still collided, the **last** generated attempt is shown to her with a plain-language warning that it turned out similar to a past story — her choice whether to use it anyway or type a different idea. Never a silent accept, never a silent hard block, never a forced "you must change your idea" refusal.
- **Claude's/planner's discretion:** the exact numeric retry cap (UNIQUE-02 says "configurable maximum") — pick a sensible default consistent with this project's existing retry patterns (e.g. the 3-attempt pattern already used for content-safety-block retries in Phase 2) unless research surfaces a reason to differ.

### Dev-test story handling
- **D-05:** The three real stories Phase 2's own development/testing produced (`storage/stories/story-*-*/` — the boy-trades-marble-for-a-kite story, the girl-and-grandmother's-broken-bangle story, and the fisherman-and-paper-boat story) do **NOT** seed the new database as "already accepted" stories. The uniqueness system starts clean with an empty history. — **Reversibility:** reversible — nothing prevents seeding them later if this proves wrong; the raw story text/metadata still exists in `02-PROOF-RUN.md` and the gitignored `storage/stories/` folders if ever needed.
- These three story folders stay on disk as harmless orphans — they predate Prisma and have no corresponding database row. They must never appear in any future Story Library UI (Phase 4), which will read from the database, not the filesystem, so this requires no special cleanup or migration step.

### Claude's Discretion
- **VIDEO-03** (surviving a browser/app restart without losing track of in-progress video jobs) was not selected for discussion this session. It remains exactly as ROADMAP.md already frames it: a soft/optional success criterion for this phase — attempt it if it falls out naturally from the persistence work, document the limitation rather than silently breaking it if it doesn't fit in the available time. Not re-opened as a fresh discussion topic.
- Exact Prisma schema shape (table/column design for stories, scenes, generation records, cost tracking) is a research/planning concern, not a user vision question — the user was not asked about this.
- The deterministic pre-filter's specific mechanics (what gets compared cheaply before the LLM judgment call fires) is left to research/planning, informed by D-01/D-02's three-element structural definition above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level
- `.planning/PROJECT.md` § Key Decisions — Prisma as ORM (rationale: migrations, type-safe client, Prisma Studio for a single-developer local SQLite app) and "deterministic pre-filter + targeted LLM call for uniqueness, no vector database" (rationale: cheap/instant for obvious cases, LLM spend only on borderline candidates) are both **already locked**, not open questions for this phase.
- `.planning/REQUIREMENTS.md` §Uniqueness (UNIQUE-01/02/03), §Persistence (PERSIST-01), §Image (IMAGE-01, IMAGE-03), §Video (VIDEO-03, soft) — the exact requirement text this phase must satisfy.
- `.planning/ROADMAP.md` § Phase 3 — goal and the 5 success criteria (criterion 5 is VIDEO-03, marked soft).

### Prior-phase context
- `.planning/phases/01-provider-smoke-test/01-CONTEXT.md` D-06 — Phase 1's throwaway smoke-test outputs live in `storage/_smoketest/`, deliberately separate from `storage/stories/<id>/` (which Phase 2's real dev-test stories — and all future real episodes — use). D-05 above extends this same spirit: real-path stories are not automatically "real" for uniqueness-tracking purposes just because of their file location.
- `.planning/phases/02-core-generation-pipeline/02-CONTEXT.md` D-03 — Phase 2 deliberately built a single-page, no-persistence, no-routing flow specifically so Phase 3 could add persistence and Phase 4 could add the story library/routing on top, rather than Phase 2 half-building structure it didn't need yet.
- `.planning/phases/02-core-generation-pipeline/02-PROOF-RUN.md` — real Story Director output samples (premise/theme/emotional_arc/ending fields) from three real generation runs; useful as concrete input shape for uniqueness-comparison research.

No other external specs/ADRs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/story/schema.ts` (`StoryDirectorOutputSchema`) — already defines structured fields including theme, emotional_arc, and ending per generated story. Worth checking during research whether these already-generated fields can directly back D-01's three-element structural comparison, rather than requiring a new extraction pass over story text.
- `src/lib/spend-ledger.ts` (`checkCeiling`/`recordSpend`) — any new LLM call for the "targeted LLM comparison" step of the uniqueness check must be gated through this exact pattern, unchanged, matching every paid call in Phases 1-2.
- `src/lib/log-response.ts` (`logRawResponse`) — same convention applies to any new raw provider response from a uniqueness-comparison LLM call.
- `src/core/storage-paths.ts` — existing injection-safe path builders for `storage/stories/<id>/scenes/NN/`; the new Prisma schema should likely store/reference these same paths rather than inventing a parallel path scheme.
- `src/scripts/check-boundaries.ts` — the existing client/server and provider-boundary structural gate; extend its invariants to cover Prisma-touching code once it exists (client components must never import Prisma directly, same spirit as the existing provider-import ban).

### Established Patterns
- Every provider-calling function in this codebase is ceiling-gated (`checkCeiling` before, `recordSpend` after) at a single, structurally-enforced call site — the "targeted LLM comparison" call for uniqueness-checking must follow this exact shape.
- Plain-language-only error/status surfacing to the browser (no raw provider text, no model IDs, no file paths) — D-03's "brief status message" must follow this same convention.

### Integration Points
- The uniqueness check sits between story generation and story review (screen 1 → screen 2 in the current single-page flow) — a newly generated story must pass the uniqueness gate before `StoryReview.tsx` ever renders it, mirroring the existing image-generation gate that already sits between image review and video generation.
- `DEV_CEILING_USD` currently has only ~$0.063 of its $3.00 headroom left (see STATE.md) — any real paid LLM calls this phase's research/proof-runs need will require either a very tight budget or an explicit, deliberate ceiling increase discussed with the user before dispatching.

</code_context>

<specifics>
## Specific Ideas

No specific UI mockups or exact wording were given for the status message or the exhaustion warning — "Making sure this is original... trying again" and "This story turned out similar to one you made before" are illustrative phrasing from this discussion, not locked copy. Planning/execution has latitude on exact wording as long as it stays plain-language and non-technical.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No scope-creep topics came up.

</deferred>

---

*Phase: 3-Persistence & Structural Uniqueness*
*Context gathered: 2026-09-13*

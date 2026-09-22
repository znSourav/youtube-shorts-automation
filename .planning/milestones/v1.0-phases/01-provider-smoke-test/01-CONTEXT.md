# Phase 1: Provider Smoke Test - Context

**Gathered:** 2026-09-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove that Gemini's image generation model and Veo 3.1 Lite's image-to-video model both genuinely work end-to-end from this codebase, with real per-call cost visible, before any persistence or interface investment is made. No formal requirements map to this phase — it is a deliberate technical spike that de-risks the paid, unproven provider integrations before STORY-*, IMAGE-*, and VIDEO-* requirements are built on top of them starting in Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Smoke-test content
- **D-01:** Run two test generations, not one — first a trivial generic image prompt (e.g. an object on a table) purely to prove raw plumbing, then a representative prompt using one real style preset plus an actual child-protagonist scene. The second call specifically probes whether Gemini's safety filters false-positive on wholesome children's-story content, which is a real, product-specific risk (this entire channel is animated stories about child protagonists) worth catching in Phase 1 rather than discovering it after Phases 2-4 are built on the untested assumption that it works.
- **D-02:** Use "Soft hand-painted 2D" as the style preset for the representative test — it's the first-listed option in the original brief's style menu and a reasonable, uncontroversial default. Not worth a dedicated decision cycle; Claude's discretion.
- **D-03:** Sequence the two providers rather than firing both blindly — confirm Gemini image generation works first (cheaper, more standard API surface), then only spend on the Veo call once a real generated image exists to feed it, since Veo is the more expensive and less-proven (paid preview) of the two. — **Reversibility:** reversible — pure execution ordering, costs nothing to change.

### Spend guardrail (Phases 1-4)
- **D-04:** Build a tiny standalone spend-ceiling utility starting in this phase — a flat local ledger (e.g. a JSON file) plus a hard-coded ceiling that every paid call in Phases 1-4 checks before firing, refusing with a clear message if it would exceed the ceiling. This exists because the formal BUDGET-01..05 system isn't built until Phase 5, and the requester's original brief was emphatic that the $15 cap must never be accidentally exceeded — relying on manual discipline alone across four phases of iterative pipeline debugging was judged too easy to lose track of.
- **D-05:** The dev/testing ceiling for Phases 1-4 combined is **$3.00 USD**, tracked by the same ledger file across all four phases (not reset per phase). This $3.00 is carved out of the same real $15 total the requester set, not additional to it — there is only one real Google Cloud billing account. Leaving roughly $11-12 of the $15 for the wife's actual post-MVP usage after Phase 5's formal budget system takes over. If Phase 1-4 development genuinely needs more than $3 of real API testing, that requires going back to the requester to explicitly raise the ceiling, not silently spending past it. — **Reversibility:** reversible — the ledger and ceiling are throwaway scaffolding Phase 5's real budget system absorbs or replaces; raising the number is a one-line change.
- **D-06:** Smoke-test output files (generated images/videos) are written to a clearly separate `storage/_smoketest/` location, not mixed into the `storage/stories/<id>/` structure real episodes will use from Phase 2 onward — keeps Phase 3's persistence/library work from ever confusing a throwaway test asset with a real story. — **Reversibility:** reversible.

### Claude's Discretion
- Whether to call the Google GenAI Node SDK (if a current, well-documented SDK cleanly covers Gemini image generation, Veo video generation, and text generation together) versus raw REST calls via `fetch` — this is exactly the kind of current-API-specifics question the phase researcher should resolve against live documentation rather than lock in during discussion.
- Project scaffolding approach: write the Phase 1 smoke test as real files inside the actual Next.js project structure this whole app will use (e.g. `src/providers/image/gemini-image.ts`, `src/providers/video/veo.ts`, invoked by a throwaway CLI script or a single unlisted API route) rather than fully disposable code outside the app — there is no reason to write knowingly-throwaway provider integration code when the real code is roughly the same effort and Phase 2 needs these same provider files anyway. Only the *output artifacts* (D-06) and the *spend ledger* (D-04/D-05) are throwaway; the provider integration code itself is meant to survive into Phase 2.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level context
- `.planning/PROJECT.md` — Core value, constraints, and the Key Decisions table (single-provider Gemini architecture, plain Developer API key over Vertex AI, no ffmpeg, Prisma as ORM). §Context has the specific verified Veo 3.1 Lite and Gemini image model facts (model ID, pricing, capabilities, ToS nuance) as of 2026-09-12 — treat as current but re-verify live during research since "AI APIs change quickly" per the original brief.
- `.planning/REQUIREMENTS.md` — v1 requirement list; Phase 1 maps to none of them directly but de-risks STORY-*, IMAGE-*, VIDEO-* for Phase 2.
- `.planning/ROADMAP.md` §Phase 1 — the four success criteria this phase must satisfy (image produced and viewable; that image animated into a playable 9:16/720p MP4 via Veo; real per-call cost logged; provider errors surface as a clear message, not a silent hang or crash).

No external specs beyond the above — requirements for this phase are fully captured in the decisions here.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
None — project directory was empty at phase start (only `.planning/` and `.git/` exist so far).

### Established Patterns
None yet — this phase establishes the first patterns (provider file layout under `src/providers/`) that Phase 2 onward will follow.

### Integration Points
N/A — first phase.

</code_context>

<specifics>
## Specific Ideas

- The child-protagonist test scene should be drawn from something resembling the actual planned content (e.g. a girl character in a garden setting, per the requester's own example idea in the original brief: "a little girl searches for her lost cat and discovers a magical garden") rather than an unrelated child scene — the point is to probe the *actual* kind of content this product will generate, not a generic stand-in.
- If the safety-filter probe (D-01's second call) is rejected or flagged, that is itself a critical, reportable finding — not a bug to silently retry past. Surface it clearly to the requester with the exact rejection reason if the API provides one, since it would materially affect whether Gemini/Veo remain viable providers for this product at all.

</specifics>

<deferred>
## Deferred Ideas

- The full BUDGET-01..05 system (configurable monthly limit, per-category spend display, retry-aware budget checks, per-scene retry caps) belongs entirely to Phase 5 — D-04/D-05 here are intentionally minimal throwaway scaffolding, not an early implementation of that system.
- The real style-preset configuration system (all 6 styles, Style Bible generation) belongs to Phase 2 — D-02 only picks one preset informally for this phase's single test image.

### Reviewed Todos (not folded)
None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Provider Smoke Test*
*Context gathered: 2026-09-12*

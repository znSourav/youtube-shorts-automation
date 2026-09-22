# Phase 1: Provider Smoke Test - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-12
**Phase:** 1-Provider Smoke Test
**Areas discussed:** Smoke-test content, Spend guardrail (Phases 1-4)

---

## Smoke-test content

| Option | Description | Selected |
|--------|-------------|----------|
| Both: generic then child-scene | Trivial generic prompt first to confirm plumbing, then a real style-preset + child-protagonist scene to also probe safety-filter false positives on wholesome kids' content | ✓ |
| Generic content only | One arbitrary prompt purely to prove plumbing; defers the safety-filter question | |
| Representative content only | Skip the generic test, go straight to the real scene; saves one call but conflates plumbing failures with content-policy failures if it breaks | |

**User's choice:** Both: generic then child-scene (recommended option)
**Notes:** None beyond the recommendation rationale — chosen specifically because a false positive on child-protagonist content would be a product-viability-level risk worth catching immediately.

---

## Spend guardrail (Phases 1-4)

| Option | Description | Selected |
|--------|-------------|----------|
| Tiny spend-ceiling script, starting now | Minimal shared utility — flat local ledger + hard-coded low ceiling — every paid call in Phases 1-4 checks first; Phase 5 formalizes it into the real budget system | ✓ |
| Manual discipline + GCP billing alert | No extra engineering; rely on watching spend plus the Google Cloud billing alert already configured | |

**User's choice:** Tiny spend-ceiling script, starting now (recommended option)
**Notes:** Ceiling set at $3.00 for Phases 1-4 combined (Claude's discretion on the exact figure, not separately asked) — carved out of the same $15 total, not additional to it, leaving roughly $11-12 for the wife's actual post-MVP usage once Phase 5's real budget system takes over.

---

## Claude's Discretion

- Style preset used for the representative test image: "Soft hand-painted 2D" (first-listed option in the original brief's style menu).
- Execution order: confirm Gemini image generation first, then spend on the Veo call only once a real generated image exists to feed it.
- Exact dev/testing spend ceiling figure: $3.00 for Phases 1-4 combined.
- Output location for smoke-test artifacts: `storage/_smoketest/`, kept separate from the real `storage/stories/<id>/` structure.
- Whether to use the official Google GenAI Node SDK vs raw REST calls — left for the phase researcher to resolve against current documentation.
- Provider integration code (not just output artifacts) is written as real files inside the actual Next.js project structure from the start, since Phase 2 needs the same provider files anyway.

## Deferred Ideas

- The full BUDGET-01..05 system (configurable monthly limit, per-category spend display, retry-aware checks, per-scene retry caps) — belongs entirely to Phase 5. The Phase 1 spend-ceiling script is intentionally minimal throwaway scaffolding, not an early version of that system.
- The real style-preset configuration system (all 6 styles, full Style Bible generation) — belongs to Phase 2.

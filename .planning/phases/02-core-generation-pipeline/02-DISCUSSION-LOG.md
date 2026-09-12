# Phase 2: Core Generation Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-12
**Phase:** 2-Core Generation Pipeline
**Areas discussed:** Phase 2 UI scope

---

## Phase 2 UI scope

| Option | Description | Selected |
|--------|-------------|----------|
| Bare functional | One unstyled page, raw buttons/JSON, fully disposable | |
| Closer to the real flow | Distinct create/review/generate screens, basic Tailwind styling | ✓ |

**User's choice:** Closer to the real flow (not the recommended bare-functional option)
**Notes:** More UI investment now to reduce Phase 4's rebuild work later.

---

## Image-first pause (sub-question under UI scope)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, keep the pause | Plain "Generate Videos" button only reachable once images exist | ✓ |
| No, run straight through | Auto-proceed from images to video with no pause | |

**User's choice:** Yes, keep the pause (recommended option)

---

## Routing (sub-question under UI scope)

| Option | Description | Selected |
|--------|-------------|----------|
| One page is fine | Single page carries the story through the whole flow | ✓ |
| Set up /stories/[id] now | Build the real per-story route now | |

**User's choice:** One page is fine (recommended option)

---

## Claude's Discretion

- Proof-run scope & cost strategy — this area was offered for discussion but NOT selected by the user. Decided as Claude's discretion (see CONTEXT.md D-04/D-05): reduced scene count (3) for initial debugging iterations given the $3 dev ceiling's remaining headroom, one full 5-6 scene run once stable; a fresh story idea (not reusing the CR-03 garden-scene content).
- Single vs multi-call Story Director LLM structure — deferred to research/planning.
- Scene continuity prompt-construction mechanism — deferred to research/planning.
- Specific Gemini text model choice — deferred to research.
- Banglish handling — treated as an empirical question for the first real test, not pre-built.

## Deferred Ideas

- SQLite/Prisma persistence, structural-uniqueness checking — Phase 3.
- Server-enforced approval gate, Story Library, real routing, visual polish — Phase 4.
- Formal budget-guard system (MONTHLY_BUDGET_USD, per-category display, configurable retry caps) — Phase 5.
- Reliability/secrets hardening beyond Phase 1's existing work — Phase 6.

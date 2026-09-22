# Phase 4: Wife-Facing Review & Approval Flow - Context

**Gathered:** 2026-09-14
**Status:** Ready for planning

<domain>
## Phase Boundary

The non-technical target user (the wife) can complete the full create → review story → review+approve scene images → generate every approved scene's video → find the finished output flow, using only plain-language buttons and status text, with every paid action gated by a real approval state and per-scene retry caps. This phase turns Phase 2's "one scene only, for now" video proof and Phase 3's persistence/uniqueness foundations into the actual multi-scene, wife-facing product experience.

</domain>

<decisions>
## Implementation Decisions

### Approval mechanism (APPROVAL-01)
- **D-01:** Approval is a single, deliberate action the wife takes — an explicit "Approve these images" (or equivalent plain-language) control — not an automatic unlock that fires the moment every scene has an image. This is a real decision point distinct from "images finished generating," matching APPROVAL-01's strong "through any path, not just the visible UI" wording. — **Reversibility:** reversible — a UI/flow change, not a data-shape commitment.
- **D-02:** Approval is granted once, for the whole story's set of scene images together — not per-scene individual approvals. One "Approve" action covers every scene in that story. Video generation for the story is blocked (server-side, not just UI-disabled) until this single approval is recorded.

### Per-scene retry/regeneration limits (IMAGE-02, VIDEO-04)
- **D-03:** Each scene carries its own fixed numeric cap on both image regeneration attempts and video retry attempts — mirroring Phase 3's `MAX_UNIQUENESS_REGENERATION_ATTEMPTS` pattern (env-configurable, safe default on any malformed/absent value). This is NOT solely a budget-check limit (Phase 5's monthly budget gate is a separate, additional constraint) — the point of this cap is protecting against an accidental click-loop burning real money on one stuck scene, independent of whether the monthly ceiling has room left.
- **Claude's/planner's discretion:** the exact numeric default (e.g. 3, matching the uniqueness system's own default) and the exact plain-language copy shown once a scene's cap is reached — should follow this project's established D-04-style pattern (Phase 3): a calm, non-alarming message explaining what happened and what she can still do, never a silent disable with no explanation, per UI-01's "errors explain what to do next" requirement.

### Video generation & status screen (VIDEO-02, VIDEO-03, VIDEO-04)
- **D-04:** Video generation is triggered by a single "Generate All Videos" action (or equivalent plain-language label) once the story is approved — not a per-scene individual trigger. This one action kicks off every approved scene's video generation, with each scene's job then tracked independently afterward (per-scene status, independent retry, one scene's failure never blocking or affecting another's).
- **D-05:** The video-job status view is a genuinely new, dedicated fourth screen (create → review story → review+approve images → video status) — not an extension bolted onto the existing image-review screen. The image-review screen stays focused on one job (review and approve images); the new screen is purpose-built for watching video jobs progress, retrying failures, and reaching the finished output.

### Claude's Discretion
- **Story Library (LIBRARY-01, soft requirement)** was not selected for discussion this session. It remains exactly as ROADMAP.md/REQUIREMENTS.md already frame it: one of the two items explicitly acceptable to document-as-limitation if the phase's other work (which is already substantial — a new approval gate, per-scene retry caps, batch video generation, and a new status screen) leaves no time. Not re-opened as a fresh discussion topic; research/planning should size it honestly against what Phase 4's other four decisions already commit to.
- Exact numeric retry-cap default, exact plain-language copy for approval buttons/cap-exhaustion messages/status labels, and exact visual layout of the new fourth screen are research/planning/UI-design concerns, not put to the user in this session. This phase is flagged `UI hint: yes` in ROADMAP.md — expect the plan-phase workflow's UI-SPEC gate to fire given the new fourth screen and approval flow are real new frontend surface.
- Output folder access (OUTPUT-01, OUTPUT-03 — opening a finished episode's folder directly from the app, clips numbered for CapCut) was not separately discussed; the existing `storage-paths.ts` scene-numbered convention already in place since Phase 2 is the natural foundation research should build on rather than reinventing a new structure.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level
- `.planning/REQUIREMENTS.md` §Approval (APPROVAL-01), §Image (IMAGE-02), §Video (VIDEO-02/03/04), §Library (LIBRARY-01, soft), §Output (OUTPUT-01/03), §UI (UI-01) — the exact requirement text this phase must satisfy.
- `.planning/ROADMAP.md` § Phase 4 — goal and the 6 success criteria (criterion 5 is Library, marked soft).
- `.planning/PROJECT.md` § Key Decisions — the `recordSpend`/`billed:true` conservative-accounting convention (Phase 2 CR-01) and the `checkCeiling`-before/`recordSpend`-after pattern apply unchanged to every new video-generation call site this phase adds.

### Prior-phase context
- `.planning/phases/02-core-generation-pipeline/02-CONTEXT.md` D-01/D-02/D-03 — Phase 2 deliberately scoped the UI to "closer to the real flow" (not bare-functional), kept an image-first pause before video spend, and built a single page with no `/stories/[id]` routing, explicitly deferring the real library/routing work to this phase.
- `.planning/phases/02-core-generation-pipeline/02-04-SUMMARY.md` and `02-04-PLAN.md` — the existing single-scene "Generate Video" implementation (`generateSceneVideoAction`, the CR-03 motion-prompt guard) this phase extends to every approved scene, not replaces.
- `.planning/phases/03-persistence-structural-uniqueness/03-01-SUMMARY.md` through `03-04-SUMMARY.md` — the Prisma schema (Story/Scene/GenerationRecord), the story-repository.ts/generation-repository.ts persistence layer, the browser-restore mechanism (`load-story.ts`, `story-view.ts`, localStorage-backed restore-on-mount) this phase's new approval state and per-scene video jobs must persist through in the same way.
- `.planning/phases/03-persistence-structural-uniqueness/03-02-SUMMARY.md` — the `MAX_UNIQUENESS_REGENERATION_ATTEMPTS` env-configurable-with-safe-default pattern D-03 above explicitly mirrors for the new per-scene retry caps.

No other external specs/ADRs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/actions/generate-video.ts` (`generateSceneVideoAction`) — Phase 2's ceiling-gated single-scene video call with the CR-03 motion-prompt guard; this phase's batch "Generate All Videos" action orchestrates calling this per approved scene, not reimplementing the Veo call itself.
- `src/core/persistence/story-repository.ts`, `src/core/persistence/generation-repository.ts` — Phase 3's persistence layer already tracks scene image/video paths and statuses; the new approval flag and per-scene retry-attempt counts likely belong as new fields/tables alongside these, not a parallel persistence mechanism.
- `src/core/uniqueness/check.ts` — the `maxRegenerationAttempts()` pattern (env-configurable, safe-default-on-malformed-value) is the direct template for this phase's new per-scene image/video retry caps.
- `src/app/actions/load-story.ts`, `src/core/persistence/story-view.ts` — the existing browser-restore mechanism; the new fourth screen's state (which scenes are approved, video job statuses) must survive a restore the same way Phase 3's scene statuses already do.
- `src/scripts/check-boundaries.ts` — the existing structural client/server/database-boundary gate; any new Server Actions or persistence code this phase adds must keep passing it, extending its invariants if new boundary-relevant modules are introduced.

### Established Patterns
- Single-dispatch-helper-per-call-site with `checkCeiling` immediately before, `recordSpend` immediately after, unconditionally `billed: true` on any dispatched call regardless of local-observed outcome (Phase 2 CR-01 fix) — every new video call site this phase adds must follow this exactly.
- Plain-language-only error/status surfacing to the browser — no raw provider text, model IDs, file paths, or developer terminology anywhere in the new approval/status screens (UI-01).
- `"use client"` files and `src/app/actions/` never import a provider or the database directly — structurally enforced by `check-boundaries.ts`, which this phase's new code must keep satisfying.

### Integration Points
- The new approval gate sits between the existing image-review screen and the new video-status screen — a story's video generation must be blocked at the Server Action level (not just a disabled button) until the approval flag is set, mirroring how the uniqueness gate already sits structurally between story generation and story review.
- The dev-testing spend ledger (`DEV_CEILING_USD`) currently stands at $3.0870 of $3.25 ($0.163 headroom) as of Phase 3's close — any real paid proof-runs this phase's research/planning proposes need to be sized against this realistically, and any further ceiling increase needs the same explicit, user-named-figure approval process established in Phase 3.

</code_context>

<specifics>
## Specific Ideas

No specific UI mockups, exact button copy, or exact screen layouts were given — "Approve these images" and "Generate All Videos" are illustrative plain-language labels from this discussion, not locked copy. The UI-SPEC step (expected to trigger given this phase's `UI hint: yes` flag and genuinely new frontend surface) has latitude on exact wording, layout, and visual design as long as it stays plain-language, non-technical, and follows the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No scope-creep topics came up.

</deferred>

---

*Phase: 4-Wife-Facing Review & Approval Flow*
*Context gathered: 2026-09-14*

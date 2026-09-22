# Phase 5: Budget & Retry Safeguards - Context

**Gathered:** 2026-09-19
**Status:** Ready for planning

<domain>
## Phase Boundary

The real, wife-facing `MONTHLY_BUDGET_USD` system: every paid provider call (LLM, image, video) is preceded by a check against the current month's configured budget and real spend so far, retries pass through the exact same check as a first attempt with no bypass, and she can see her running spend broken down by type against the current limit. This replaces the throwaway `DEV_CEILING_USD` dev-testing ledger (Phases 1-4) as the actual enforcement mechanism for her real usage — it is not an additional layer alongside it.

</domain>

<decisions>
## Implementation Decisions

### Budget baseline (BUDGET-01, BUDGET-03)
- **D-01:** The real budget system's spend tracking starts pre-loaded with the $5.072 already spent during Phases 1-4's development/testing — not $0. Her very first real story is generated against the real remaining headroom (~$9.93 of the current $15 allocation), not a fresh full $15. This follows directly from PROJECT.md's own framing: the dev ceiling was explicitly "carved out of the real $15 total... not additional to it."

### Reset semantics (BUDGET-02)
- **D-02:** Not a one-time lifetime cap, and not automatic calendar-month rollover to a fixed figure. The budget is a **per-month configurable allocation that the requester sets/changes himself each month** (e.g. $15 for month 1, a different figure like $10 for month 2), with **any unused amount from a prior month rolling over and adding to the next month's allocation** (a month that ends with leftover doesn't lose it). — **Reversibility:** costly — this is a ledger/schema-shaping decision (the system must track spend and allocation per calendar month, not just one flat running total), not a single call site; reworking it later to a simple flat cap or true auto-reset would touch the ledger schema and every read of "current budget."
- **D-02a (ruled out explicitly):** No polling of Google's Cloud Billing API for real spend/remaining-budget data. The requester's initial phrasing ("read from Google API how much is left") was clarified on follow-up to mean only the varying/rollover budget amount, not live Billing API integration — the existing PROJECT.md Key Decision against Billing API polling (multi-hour-to-day lag, heavier GCP IAM/service-account setup than the current single API key) stands unchanged. All tracking stays in the app's own internal ledger, the same zero-lag mechanism already proven through Phase 4.

### Spend visibility (BUDGET-03)
- **D-03:** A small, always-visible indicator (not a dedicated new screen, not folded exclusively into the Story Library screen) — visible on the create screen and/or wherever she's likely to be when deciding whether to generate something. Shows the total at a glance (e.g. "$9.93 of $10 remaining") by default; the video/image/LLM type-by-type breakdown appears only when she taps/expands it, matching Phase 4's established "plain language first, detail on demand" pattern (e.g. the Library's computed status labels, the calm cap-reached messages).

### Claude's Discretion
- **BUDGET-05 is very likely already substantially satisfied by Phase 4's existing work**, not something to build fresh: `src/core/retry/caps.ts`'s `maxSceneRetryAttempts()` (env-configurable via `MAX_SCENE_RETRY_ATTEMPTS`, safe-default-on-malformed-value) plus `Scene.videoAttempts`/`imageAttempts` already implement "each scene has a configurable maximum number of image and video retries; once reached, further retries are refused with a clear message." Research/planning should verify this genuinely covers BUDGET-05's exact wording rather than rebuilding a parallel mechanism, and if a gap is found, extend the existing pattern rather than duplicating it.
- **The exact mechanism for carrying the $5.072 forward** (D-01) — e.g. migrating every individual historical `storage/_smoketest/spend-ledger.json` entry into the new real ledger (preserving full per-call audit detail) vs. seeding one summarized "opening balance" entry — is left to planning. Given this project's established preference for preserving detailed history (see e.g. the persistence work in Phase 3), migrating the real entries is likely preferable to collapsing them, but the planner should weigh this against the real ledger's intended schema (see D-02's per-month tracking need).
- **The exact mechanism for how the requester sets each new month's figure** (D-02) is left to planning. BUDGET-02's own wording ("configurable... via `MONTHLY_BUDGET_USD`... enforced without a code change") and this project's established pattern (the requester has directly edited `.env.local`/raised `DEV_CEILING_USD` by hand every time a real spend decision was needed, across Phases 1, 3, and 4) both point toward an env-var-per-month mechanism as the natural fit, but the exact shape (a single `MONTHLY_BUDGET_USD` the requester edits at the start of each month vs. a small persisted month→amount record the app reads) is a research/planning call.
- **The fate of `DEV_CEILING_USD`/the dev-testing ledger after Phase 5 ships** was not discussed this session (the requester did not select it as a topic, and declined to open further gray areas afterward). Given D-02's per-month/rollover redesign means the *shape* of the real ledger will differ meaningfully from the current flat `DEV_CEILING_USD` constant, research/planning should propose a concrete transition (e.g. retire the dev ledger and route all future dev/testing spend through the real system's own accounting, vs. keep a separate throwaway sandbox for future phases like Phase 6's reliability/failure-injection testing) and flag it as a decision point rather than silently picking one.
- Exact numeric plain-language copy for the budget-refused message, the spend-indicator's exact wording/layout, and where precisely on each screen the indicator sits are UI-design concerns for the (likely-triggered, given new frontend surface) UI-SPEC step, not locked here.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level
- `.planning/REQUIREMENTS.md` §Budget (BUDGET-01 through BUDGET-05) — the exact requirement text this phase must satisfy.
- `.planning/ROADMAP.md` § Phase 5 — goal and the 5 success criteria.
- `.planning/PROJECT.md` § Constraints (budget), § Key Decisions — the existing "$15 hard total cap for Month 1," the "no Google Cloud Billing API polling" decision (D-02a above reaffirms it), and the `recordSpend`/`billed:true` conservative-accounting convention every paid call site already follows.

### Prior-phase safety findings (directly load-bearing for this phase's core design)
- `.planning/phases/01-provider-smoke-test/01-REVIEW-FIX.md` (WR-02 entry, and its "Note for the developer" at the end) — **the project's own prior code review already identified that the current `checkCeiling`-then-dispatch-then-`recordSpend` pattern has an unclosed TOCTOU race** (two callers can both pass `checkCeiling` against the same pre-dispatch snapshot before either records spend) and explicitly recommends **"re-evaluating with a reserve-then-commit ledger design when Phase 5's real $15 budget system is built."** Phase 4's own code review independently re-discovered a narrower instance of this exact class of race (an app-wide in-process dispatch mutex was added as a caller-side mitigation for video generation specifically — see `src/app/actions/generate-video.ts`'s `videoDispatchChain`) but that was a single-call-site patch, not the ledger-level fix this note calls for. Research MUST evaluate whether Phase 5's real system should implement the reserve-then-commit redesign at the ledger schema level (a provisional/reserved entry at check time, committed or released at record time) now that the ledger is becoming the actual real-money enforcement gate, not just a dev-testing convenience.
- `src/lib/spend-ledger.ts` (current implementation, read in full during this discussion) — `LedgerEntry`/`Ledger` types, `checkCeiling`/`recordSpend`/`totalSpentUsd`/`loadLedger`, the exclusive-create file lock (`withLedgerFileLock`) that already partially mitigates concurrent-write data loss. This is the direct foundation the real system extends or replaces — not a parallel mechanism to build alongside.

No other external specs/ADRs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/spend-ledger.ts` — `checkCeiling`, `recordSpend`, `totalSpentUsd`, `loadLedger`, `CeilingExceededError`, the lock-file concurrency guard. The real budget system extends/replaces this file's role (currently pointed at the throwaway `storage/_smoketest/spend-ledger.json`), not a new parallel module.
- `src/core/retry/caps.ts` (`maxSceneRetryAttempts`) — the exact env-configurable-with-safe-default pattern already used for per-scene retry caps (Phase 4, D-03); likely already satisfies BUDGET-05 as-is (see Claude's Discretion above).
- Every existing paid-dispatch call site (`src/app/actions/generate-video.ts`'s `dispatchSceneVideo`, `src/app/actions/generate-images.ts`, `src/core/story/director.ts`) already calls `checkCeiling` immediately before and `recordSpend` immediately after its real provider call — the real budget system's enforcement point is the same shape, just pointed at real data instead of the dev ledger.
- `src/scripts/check-boundaries.ts` invariant 5 (single paid-dispatch-point-per-provider) already structurally guarantees there is exactly one call site per provider to update when the real budget system replaces the dev ceiling check — no risk of missing a call site.

### Established Patterns
- Conservative accounting: `recordSpend` is called with `billed: true` unconditionally on any dispatched call, regardless of what this process could locally observe as success (PROJECT.md Key Decision, Phase 2 CR-01) — must carry forward unchanged into the real system.
- Plain-language-only refusal/status messages to the browser, mirroring the calm, non-alarming tone already established for Phase 4's per-scene retry-cap-reached messages (D-03 there) — the real budget-refused message should follow the same tone, not invent a new one.
- `"use client"` files and `src/app/actions/` never import a provider or the database directly — structurally enforced by `check-boundaries.ts`; any new budget-check module this phase adds must keep satisfying it.
- The requester has directly, explicitly set/raised spend ceilings by hand at every real-money decision point so far (Phase 3's raise to $3.25, this session's raise to $6.25) — the real per-month budget figure is expected to follow this same "requester sets it explicitly" pattern, not something inferred or auto-computed.

### Integration Points
- Every one of the four existing paid-dispatch call sites (story, scene-image, scene-video ×2 counting the regenerate path) needs its `checkCeiling`/`recordSpend` calls re-pointed at whatever the real system's equivalent functions turn out to be — this is a real, phase-wide integration surface, not a single new module bolted on somewhere.
- BUDGET-04 ("a retry of any failed generation passes through the same budget check as a first attempt") is very likely already true today for every existing retry path (Phase 4's `retrySceneVideoAction`, `regenerateSceneImageAction` — both delegate to the exact same gated dispatch function a first attempt uses) — research should confirm this holds once the check target changes from the dev ledger to the real system, rather than assuming a fresh mechanism is needed.

</code_context>

<specifics>
## Specific Ideas

No specific UI mockups, exact indicator copy, or exact screen placement were given — the "small always-visible indicator" and "$9.93 of $10 remaining" phrasing are illustrative from this discussion, not locked copy or layout. The requester's own words on the rollover model: "for first month we are considering $15, for second month we may consider $10, for 3rd month if there is some leftover, we will add that to the next month" — this is the authoritative statement of the rollover behavior's intent.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No scope-creep topics came up.

</deferred>

---

*Phase: 5-Budget & Retry Safeguards*
*Context gathered: 2026-09-19*

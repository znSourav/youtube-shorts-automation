# Phase 5: Budget & Retry Safeguards - Research

**Researched:** 2026-09-19
**Domain:** Real-money spend enforcement (LLM/image/video), per-month budget with rollover, retry-cap confirmation — extending an existing Prisma/SQLite + Next.js Server Actions codebase
**Confidence:** HIGH (this phase is almost entirely an extension of code read in full this session; no new external libraries; the only MEDIUM/LOW items are general distributed-systems pattern references and one Next.js env-reload behavior, both flagged below)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Budget baseline (BUDGET-01, BUDGET-03)**
- **D-01:** The real budget system's spend tracking starts pre-loaded with the $5.072 already spent during Phases 1-4's development/testing — not $0. Her very first real story is generated against the real remaining headroom (~$9.93 of the current $15 allocation), not a fresh full $15. This follows directly from PROJECT.md's own framing: the dev ceiling was explicitly "carved out of the real $15 total... not additional to it."

**Reset semantics (BUDGET-02)**
- **D-02:** Not a one-time lifetime cap, and not automatic calendar-month rollover to a fixed figure. The budget is a **per-month configurable allocation that the requester sets/changes himself each month** (e.g. $15 for month 1, a different figure like $10 for month 2), with **any unused amount from a prior month rolling over and adding to the next month's allocation** (a month that ends with leftover doesn't lose it). — **Reversibility:** costly — this is a ledger/schema-shaping decision, not a single call site.
- **D-02a (ruled out explicitly):** No polling of Google's Cloud Billing API for real spend/remaining-budget data. All tracking stays in the app's own internal ledger, the same zero-lag mechanism already proven through Phase 4.

**Spend visibility (BUDGET-03)**
- **D-03:** A small, always-visible indicator (not a dedicated new screen, not folded exclusively into the Story Library screen) — visible on the create screen and/or wherever she's likely to be when deciding whether to generate something. Shows the total at a glance (e.g. "$9.93 of $10 remaining") by default; the video/image/LLM type-by-type breakdown appears only when she taps/expands it, matching Phase 4's established "plain language first, detail on demand" pattern.

### Claude's Discretion
- **BUDGET-05 is very likely already substantially satisfied by Phase 4's existing work** (`src/core/retry/caps.ts`'s `maxSceneRetryAttempts()` plus `Scene.videoAttempts`/`imageAttempts`) — research/planning should verify this genuinely covers BUDGET-05's exact wording rather than rebuilding a parallel mechanism. **Research verdict: confirmed complete, see "BUDGET-05 Gap Analysis" below — no new implementation needed.**
- **The exact mechanism for carrying the $5.072 forward** (D-01) — migrate every historical entry vs. seed one summarized opening-balance entry — left to planning. **Research recommendation: migrate the real entries (preserving per-call detail), see "Migrating the $5.072" below.**
- **The exact mechanism for how the requester sets each new month's figure** (D-02) — a single `MONTHLY_BUDGET_USD` he edits each month vs. a persisted month→amount record — left to planning. **Research recommendation: see "Recommended Schema" below — both are actually needed together (env var as the input, a persisted per-month row as the record of what was already credited).**
- **The fate of `DEV_CEILING_USD`/the dev-testing ledger after Phase 5 ships** was not discussed this session — research/planning should propose a concrete transition and flag it as a decision point. **Research recommendation with explicit flag: see "Open Questions" #1 below — this needs a human decision, not a silent pick.**
- Exact numeric plain-language copy, indicator wording/layout, and screen placement are UI-SPEC concerns, not locked here.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. No scope-creep topics came up.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUDGET-01 | Every paid generation call is preceded by a check that current month-to-date spend plus the estimated cost of the request does not exceed the configured monthly budget; refused with a clear explanation if it would | "Real Call-Site Inventory" (6 touch points, not 4) + "Recommended Schema" + "Reserve/Commit Recommendation" below |
| BUDGET-02 | The monthly budget limit is configurable (e.g. via `MONTHLY_BUDGET_USD`) and enforced without a code change | "Env-Var Reading Pattern" + Pitfall 1 below (dev ceiling's hardcoded-constant anti-pattern must NOT be reused) |
| BUDGET-03 | Wife can see running month-to-date spend broken down by generation type (video/image/LLM) against the configured limit | "Generation-Type Breakdown Is Already Free" below — `GenerationRecord.generationType` already exists and is already written at every real call site |
| BUDGET-04 | A retry of any failed generation passes through the same budget check as a first attempt — retries cannot bypass the budget | "BUDGET-04 Confirmation" below — confirmed true today for both retry paths, stays true automatically once call sites are re-pointed |
| BUDGET-05 | Each scene has a configurable maximum number of image and video retries; once reached, further retries are refused with a clear message rather than looping | "BUDGET-05 Gap Analysis" below — confirmed already fully satisfied by Phase 4 |
</phase_requirements>

## Summary

Phase 5 is overwhelmingly a **data-model and re-pointing exercise**, not new-feature construction: five of its six real requirements are already implemented in spirit by Phase 1-4 code that this research read in full. The two genuinely new pieces of work are (1) replacing the flat, single-ceiling `storage/_smoketest/spend-ledger.json` with a real per-month, rollover-aware allocation record backed by the project's existing Prisma/SQLite stack, and (2) building the wife-facing spend indicator (BUDGET-03), which has zero existing UI today.

The most consequential finding is that **`GenerationRecord`** (already in `prisma/schema.prisma`, already written at every real paid-call site via `recordGeneration`) **already carries everything the real budget ledger needs** — a `generationType` enum (`STORY`/`UNIQUENESS_CHECK`/`IMAGE`/`VIDEO`), `estimatedUsd`, `billed`, and `createdAt` — except the raw `usageMetadata` blob, which is deliberately excluded from it already (T-03-06 privacy convention) and which the enforcement math never needed anyway. This means Phase 5 does not need to invent a second, parallel ledger table: it can **retire `spend-ledger.json`/`LedgerEntry` entirely and promote `GenerationRecord` to be the sole, authoritative spend record**, adding only one new small table (`BudgetPeriod` or similar) to track each calendar month's allocation for rollover math and BUDGET-03's per-month display. This directly answers CONTEXT.md's research questions #2 (schema shape) and #6 (type breakdown) with one unified design instead of two.

The second major finding corrects an assumption in CONTEXT.md's own canonical_refs: it states there are "four existing paid-dispatch call sites" and that `check-boundaries.ts` invariant 5 "should make this enumerable." A direct `grep` for `checkCeiling`/`recordSpend` usage (the actual ledger-touching functions, not provider-import call sites, which is what invariant 5 checks) found **six real touch points across five files**, not four: `director.ts`, `generate-images.ts`, `generate-video.ts` (the three CONTEXT.md named), plus **`src/core/uniqueness/check.ts`'s `compareViaLlm`** (a real LLM dispatch CONTEXT.md's list omitted) and **`src/app/actions/get-story-status.ts`'s read-only headroom probe** (calls `checkCeiling` with no `recordSpend`, purely to compute a UI `budgetExceeded` flag). All six must be re-pointed at whichever real-budget function replaces `checkCeiling`/`recordSpend`; invariant 5 does not enumerate this surface and a new structural invariant is recommended to keep it enumerable going forward.

On the WR-02 TOCTOU question CONTEXT.md flags as "directly load-bearing": this research recommends **against** a full reserve-then-commit ledger redesign (the general pattern researched externally involves reservation tokens, TTL expiry, and reconciliation machinery built for multi-worker distributed systems) and **for** generalizing the in-process serialization mutex Phase 4's own code review already added for video (`videoDispatchChain` in `generate-video.ts`) to cover all six touch points — closing the real-world risk (two overlapping dispatches in the same Node process) without the schema-redesign cost the 01-REVIEW-FIX.md note explicitly deferred, and consistent with this project's own established "single in-process mutex is enough for a single-user local app" precedent. The one residual gap — a separate OS process (a dev CLI probe script) racing the live Next.js server — is explicitly documented as an accepted risk for a single local developer machine, not something Phase 5 needs to close.

**Primary recommendation:** Retire `spend-ledger.json`; promote `GenerationRecord` (unmodified in shape, changed in role) plus one new `BudgetPeriod` allocation table to be the real ledger; re-point all six `checkCeiling`/`recordSpend` touch points at new equivalent functions inside one shared, app-wide dispatch-serialization mutex; migrate the $5.072 as real historical `GenerationRecord` rows; build the BUDGET-03 indicator as new UI reading a new `getBudgetStatusAction`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pre-flight budget check (BUDGET-01) | API / Backend | Database / Storage | The check itself is business logic (a new `src/core/budget/` module), but its data (cumulative spend, cumulative allocation) lives in SQLite — same split `checkCeiling` already has today between `src/lib/` logic and a JSON file. |
| Per-month allocation + rollover bookkeeping (BUDGET-02) | Database / Storage | API / Backend | This is exactly the kind of state that belongs in the existing Prisma/SQLite database, not a flat file — the project already has this infrastructure fully proven (Phase 3). |
| Spend visibility indicator (BUDGET-03) | Frontend Server (SSR) / Browser | API / Backend | A new Server Action (`getBudgetStatusAction`, mirroring `getStoryStatusAction`'s shape) computes the numbers server-side; a new client component renders them — matches the existing "computed status, plain-language rendering" split used throughout Phase 4. |
| Retry-cap enforcement (BUDGET-05) | API / Backend | Database / Storage | Already implemented: `src/core/approval/gates.ts` (pure logic) + `Scene.videoAttempts`/`imageAttempts` (SQLite columns). No change needed. |
| Retry-passes-through-same-check (BUDGET-04) | API / Backend | — | Structural property of the existing single-dispatch-function pattern (`retrySceneVideoAction` → `generateSceneVideoAction`; `regenerateSceneImageAction` → `generateSceneImagesAction`), not a new capability. |
| Env-var configuration reading (`MONTHLY_BUDGET_USD`) | API / Backend | — | Server-only, never sent to the client — must follow `check-boundaries.ts` invariant 1 (no "use client" file may import the budget module) exactly as `spend-ledger.ts` already does. |

## Real Call-Site Inventory (corrects CONTEXT.md's count of "four")

A direct `grep` for `checkCeiling|recordSpend` across `src/` (not `check-boundaries.ts` invariant 5, which only enumerates *provider-import* call sites, not ledger-touching call sites — there is no existing structural invariant for this) found these results `[VERIFIED: local grep + file read this session]`:

| # | File | Function | Calls | Type | In CONTEXT.md's list? |
|---|------|----------|-------|------|------------------------|
| 1 | `src/core/story/director.ts` | `runStoryDirector` | `checkCeiling` + `recordSpend` | LLM (`GenerationType.STORY`) | Yes |
| 2 | `src/core/uniqueness/check.ts` | `compareViaLlm` | `checkCeiling` + `recordSpend` | LLM (`GenerationType.UNIQUENESS_CHECK`) | **No — missed** |
| 3 | `src/app/actions/generate-images.ts` | `generateSceneImagesAction` | `checkCeiling` + `recordSpend` (per scene, in a loop) | Image (`GenerationType.IMAGE`) | Yes |
| 4 | `src/app/actions/generate-video.ts` | `dispatchSceneVideo` | `checkCeiling` + `recordSpend` | Video (`GenerationType.VIDEO`) | Yes |
| 5 | `src/app/actions/get-story-status.ts` | `getStoryStatusAction` | `checkCeiling` only (no dispatch, no `recordSpend`) | Read-only UI headroom probe | **No — missed** |

`src/app/actions/regenerate-scene-image.ts` (`regenerateSceneImageAction`) and `src/app/actions/retry-scene-video.ts` (`retrySceneVideoAction`) do **not** call `checkCeiling`/`recordSpend` directly — they delegate entirely to #3 and #4 respectively `[VERIFIED: src/app/actions/regenerate-scene-image.ts:110, src/app/actions/retry-scene-video.ts:22]`, which is exactly why BUDGET-04 already holds (see below).

**Site #5 is easy to miss** because it is not a dispatch — it exists purely so `getStoryStatusAction` can compute a `budgetExceeded: boolean` flag for the Video Status screen (`src/app/actions/get-story-status.ts:111-130`, comment: *"checkCeiling throws CeilingExceededError purely to report 'no headroom' — it is not a real dispatch"*). It must still be re-pointed at whatever function replaces `checkCeiling`, using the same conservative worst-case-scene-cost estimate it already hardcodes (`MAX_SCENE_VIDEO_COST_USD = 8 * 0.05`, `get-story-status.ts:27`).

**Recommendation:** once Phase 5 lands, add a new `check-boundaries.ts` invariant enumerating every file that imports the real budget module's check/record functions (mirroring invariant 5's shape for provider imports), so this six-site surface stays structurally guaranteed the same way the image/video provider dispatch points already are.

## Generation-Type Breakdown Is Already Free (BUDGET-03, resolves CONTEXT.md question #6)

`prisma/schema.prisma` already declares:

```
enum GenerationType {
  STORY
  UNIQUENESS_CHECK
  IMAGE
  VIDEO
}

model GenerationRecord {
  ...
  generationType GenerationType
  estimatedUsd   Float
  actualUsd      Float?
  billed         Boolean
  createdAt      DateTime @default(now())
  ...
}
```
`[VERIFIED: prisma/schema.prisma:41-46, 109-125]`

Every real paid call already writes one of these rows via `recordGeneration`/`recordGenerations` (`src/core/persistence/generation-repository.ts:73-122`), confirmed at:
- `src/core/story/director.ts` is not itself the writer — `src/core/uniqueness/check.ts:373,382` pushes `GenerationType.STORY` entries for every Story Director attempt.
- `src/core/uniqueness/check.ts:257` pushes `GenerationType.UNIQUENESS_CHECK` for the comparison call.
- `src/app/actions/generate-images.ts:174` (via `generationRecordBase`) writes `GenerationType.IMAGE`.
- `src/app/actions/generate-video.ts:300` (via `generationRecordBase`) writes `GenerationType.VIDEO`.

`[VERIFIED: src/core/uniqueness/check.ts:257,373,382; src/app/actions/generate-images.ts:174; src/app/actions/generate-video.ts:300]`

This means BUDGET-03's "video/image/LLM" breakdown does **not** require deriving type from the ledger's free-text `model` string (CONTEXT.md's question #6 proposed this as the fallback) — it is a direct `GROUP BY generationType` query against `GenerationRecord`, with the display layer combining `STORY` + `UNIQUENESS_CHECK` into one "LLM" bucket (both are Gemini text-model calls; `UNIQUENESS_CHECK` uses `COMPARISON_MODEL = "gemini-3.8-flash"` per `src/providers/llm/gemini.test.ts:118` and `check.ts:224`, which is the same model family, just a different call purpose). **Deriving type from the `model` string (as CONTEXT.md's question #6 proposed) is unnecessary and more fragile** — it works today only because image models happen to contain `"-image"` and no non-image model does; a first-class enum field is a strictly more robust signal that already exists.

**"Month-to-date" filter:** `GenerationRecord.createdAt` already exists on every row, so month-to-date is `WHERE createdAt >= <start of current UTC calendar month>` — no new column needed for that half either.

## Recommended Schema

**Retire `spend-ledger.json`/`LedgerEntry` (`src/lib/spend-ledger.ts`) as the production ledger.** `GenerationRecord` already has every field the real budget check's math needs (`estimatedUsd`, `billed`, `createdAt`, `generationType`) except the raw `usageMetadata` diagnostic blob — which `GenerationRecord`'s own doc comment already deliberately excludes ("Summary fields only — never a raw provider response object, prompt, or usage-metadata blob (T-03-06)", `generation-repository.ts:39-41`) and which `checkCeiling`'s enforcement math never reads anyway (only `estimatedUsd` feeds the ceiling comparison — confirmed by reading `checkCeiling`'s full body, `spend-ledger.ts:139-162`). Consolidating onto one table removes the current dual-write (`spend-ledger.json` + `GenerationRecord`) entirely rather than adding a third.

Add one new Prisma model for the per-month allocation/rollover half, which nothing in the schema currently tracks:

```prisma
// New in Phase 5 — one row per calendar month the app has actually run
// against, created (idempotently, on @@unique(month)) the first time that
// month is touched, using whatever MONTHLY_BUDGET_USD read from process.env
// at that moment. Rollover falls out of SUM(allocatedUsd) across every row
// being compared against SUM(GenerationRecord.estimatedUsd) across every
// row -- a running cumulative total, exactly the same "the ceiling only
// ever grows" shape DEV_CEILING_USD already used across Phases 1-4 (raised
// $3.00 -> $3.25 -> $6.25 by hand), just decomposed into one row per month
// instead of one hand-edited constant.
model BudgetPeriod {
  id           String   @id @default(cuid())
  month        String   @unique // "YYYY-MM", UTC
  allocatedUsd Float
  createdAt    DateTime @default(now())
}
```

**Why this is sufficient for D-02's rollover requirement without a full per-month "spent" column:** the existing `checkCeiling` model already IS a rollover model, structurally — it compares a single cumulative "spent so far" against a single cumulative "ceiling", and the ceiling only ever grows when the requester raises it. D-02's "$15 month 1, $10 month 2, leftover adds to month 2" is achieved automatically if raising the ceiling for month 2 means *adding* $10 to the running total (not resetting it to $10): `SUM(BudgetPeriod.allocatedUsd)` naturally accumulates whatever each month's allocation was, so unspent headroom from month 1 is never lost. Enforcement stays a single comparison: `cumulativeSpent + estimatedCallCost <= cumulativeAllocated`. Month-to-date **display** (BUDGET-03) is a separate, second query filtered to the current calendar month only — it does not need to match the enforcement math's cumulative shape.

**Idempotent monthly crediting:** the first budget check (or a dedicated `ensureCurrentMonthAllocation()` helper called at the top of the check) does an upsert on `BudgetPeriod.month` — if the current UTC month has no row yet, insert one using the current `MONTHLY_BUDGET_USD` env value; if it already has a row, do nothing (this is what prevents double-crediting the same month on every request). `@@unique(month)` plus a Prisma upsert makes this safe even under the residual in-process race discussed below, since SQLite/Prisma will reject a duplicate unique key rather than double-insert.

**Migrating the $5.072 (D-01, resolves CONTEXT.md's open discretion item):** `storage/_smoketest/spend-ledger.json` holds 40 real, dispatched entries totaling exactly **$5.0720** `[VERIFIED: computed via node this session from storage/_smoketest/spend-ledger.json — gemini-3.1-flash-image: $1.072, veo-3.1-lite-generate-preview: $3.300, gemini-3.1-pro-preview: $0.700, 40 entries, ceilingUsd 6.25]`. Recommend migrating each entry into a real `GenerationRecord` row (`storyId: null` is not possible — schema requires a non-null `storyId` FK on `GenerationRecord`, so this needs either (a) relaxing `storyId` to nullable for pre-Phase-5 historical rows, mirroring `sceneId`'s existing nullable pattern, or (b) a one-time seed script that creates a placeholder `Story` row to attach historical entries to). Preserving per-entry detail (rather than one summarized opening-balance row) matches this project's established preference for detailed history (Phase 3's persistence work) and lets the migrated entries still show up correctly in BUDGET-03's type breakdown (`call` field strings like `"story:3-scene"`, `"scene-image:..."`, `"scene-video:..."` map cleanly to `STORY`/`IMAGE`/`VIDEO` — no ambiguous entries in the real file).

## Reserve/Commit Recommendation (WR-02, the "directly load-bearing" finding)

01-REVIEW-FIX.md's WR-02 entry and its "Note for the developer" explicitly recommend re-evaluating the `checkCeiling`-then-dispatch-then-`recordSpend` pattern with a reserve-then-commit ledger redesign now that Phase 5 builds the real enforcement system `[VERIFIED: .planning/phases/01-provider-smoke-test/01-REVIEW-FIX.md:45-49,95]`. General research on this pattern (community sources, not official docs — `[CITED: general web search, not an authoritative single source]`) confirms the pattern is real and does close TOCTOU/double-spend races, but the full version involves atomic reservation tokens, TTL-based expiry for abandoned reservations, and reconciliation logic for partial failures — machinery built for **multi-worker, multi-process** systems.

**This project is a single local Node process serving one user.** Phase 4's own code review already faced the identical race class (two concurrent video dispatches both passing `checkCeiling` before either called `recordSpend`) and chose an **in-process serialization mutex** (`videoDispatchChain` in `generate-video.ts:36,383-396`) over a ledger schema redesign — explicitly scoped to video only, since video was the highest-value/longest-running call at the time.

**Recommendation:** generalize this exact pattern rather than adopt full reserve-then-commit:
- Replace the single video-only `videoDispatchChain` with one shared, app-wide dispatch queue that every one of the six real touch points funnels through (story, uniqueness-comparison, image-per-scene, video, and the read-only headroom probe can skip the queue since it never dispatches).
- This closes the TOCTOU race for every dispatch that can happen through the live Next.js server process, at effectively zero design cost beyond what `generate-video.ts` already proved works.
- **Do not** build a full reserve+release+commit state machine with reservation TTLs — that level of sophistication solves a problem (multiple independent workers/processes racing) this single-process local app does not have on its wife-facing path, and would be a real over-engineering regression against this project's own established "no infrastructure beyond single-user local scale" pattern (`.planning/REQUIREMENTS.md` Out of Scope table: "Complex job queues / microservices... A single local Next.js process... is sufficient at this scale").

**Explicitly documented residual risk:** a separate OS process (a dev CLI probe script — `story-probe.ts`, `smoke-test.ts`, `persistence-probe.ts`) racing the live `npm run dev` server is **not** closed by an in-process mutex, since a mutex only serializes within one Node process/event loop. This is accepted as a residual risk specific to a single local developer machine, not something Phase 5's wife-facing enforcement needs to close — and is further mitigated by the recommendation below to keep dev-probe-script spend on a separate, smaller ceiling that never touches her real monthly allocation at all.

*(A stronger alternative — wrapping the check-and-insert in one SQLite write transaction, which would also close the cross-process gap via SQLite's native single-writer lock — was considered but is flagged `[ASSUMED]`, not recommended as the primary design: this research did not verify Prisma 7's `better-sqlite3` adapter's specific locking-mode guarantees this session, only that Prisma 7 supports `$transaction(async (tx) => ...)` interactive transactions in general `[CITED: prisma.io/docs/orm/fundamentals/transactions]`. If the planner wants the stronger guarantee, this is worth a spike; otherwise the in-process mutex is sufficient and lower-risk to implement in the time this phase has.)*

## BUDGET-05 Gap Analysis (confirms CONTEXT.md's discretion note)

BUDGET-05's literal wording: *"Each scene has a configurable maximum number of image and video retries; once reached, further retries are refused with a clear message rather than looping."*

Already implemented, verified by direct read this session:
- `MAX_SCENE_RETRY_ATTEMPTS` env var, safe-default-3, validated finite-integer-≥1 parsing: `src/core/retry/caps.ts:15-25` — `"An absent, zero, negative, fractional, or non-numeric value degrades to the safe default"`.
- `Scene.imageAttempts`/`Scene.videoAttempts` columns, both `Int @default(0)`: `prisma/schema.prisma:98-99`.
- Refusal with a clear plain-language message once the cap is reached, for **both** image and video: `src/core/approval/gates.ts:79-86` (video: `` `This scene's video has reached its limit of ${maxVideoAttempts} attempts...` ``) and `gates.ts:144-151` (image: `` `This scene's image has reached its limit of ${maxImageAttempts} attempts...` ``).
- Attempt increments happen only at the real dispatch boundary (after the ceiling check passes, immediately before the paid call), never on a local pre-dispatch failure — `generate-video.ts:225-231`, `regenerate-scene-image.ts:100-108` — so a budget refusal never silently burns a retry attempt, and vice versa; the two caps are already correctly independent.

**Verdict: BUDGET-05 requires no new implementation.** The only Phase 5 work touching this area is confirming the existing tests (`src/core/retry/caps.test.ts`, `src/core/approval/gates.test.ts`) still pass unchanged after the ledger re-point (they should, since neither module touches `checkCeiling`/`recordSpend` at all — retry caps are `[VERIFIED: no import of spend-ledger in caps.ts or gates.ts]` fully independent of the budget system by design, per `caps.ts:1-6`'s own comment: *"a click-loop guard independent of Phase 5's monthly budget gate."*).

## BUDGET-04 Confirmation (confirms CONTEXT.md's discretion note)

BUDGET-04: *"A retry of any failed generation passes through the same budget check as a first attempt — retries cannot bypass the budget."*

Confirmed true today for both retry paths by direct read:
- `retrySceneVideoAction` (`src/app/actions/retry-scene-video.ts:18-22`) does nothing except call `generateSceneVideoAction(storyId, sceneNumber)` — the exact same exported function `page.tsx` calls for a first attempt, which internally always calls `dispatchSceneVideo` (touch site #4), which always calls `checkCeiling` before every dispatch.
- `regenerateSceneImageAction` (`src/app/actions/regenerate-scene-image.ts:110`) calls `generateSceneImagesAction(storyId, [thatOneScene], ...)` — the exact same function the first-attempt bulk path calls (touch site #3), which always calls `checkCeiling` before every scene it processes, including a one-element array.

**Verdict: BUDGET-04 holds today and will continue to hold automatically once touch sites #3 and #4 are re-pointed at the real budget check** — there is no separate "retry" code path to audit; retries are structurally the same function call as a first attempt. No new code is needed specifically for BUDGET-04 beyond the general re-pointing work already required for BUDGET-01.

## Standard Stack

### Core
No new external dependencies. `[VERIFIED: package.json read this session — dependencies are @google/genai, @prisma/adapter-better-sqlite3, @prisma/client, better-sqlite3, next, prisma, react, react-dom, zod; no date/money/queue library present or needed]`

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` / `prisma` | 7.10.0 (pinned) | New `BudgetPeriod` model, migration, and queries against `GenerationRecord` | Already the project's proven ORM (Phase 3); pinned exactly per `PROJECT.md`'s own note that `prisma`'s `latest` npm tag once resolved to an unrelated 8.0.0 RC |
| `@prisma/adapter-better-sqlite3` | 7.10.0 | Driver adapter already in use | No change needed |

### Supporting
None new. Month-key derivation (`"YYYY-MM"` from a `Date`) and money display formatting (`.toFixed(2)`) are both trivial with plain JS/`Intl` — do not add a date library (`date-fns`/`dayjs`) or a money library for this; the codebase has none today and the arithmetic needed (UTC year/month extraction, two-decimal display) is a few lines, consistent with this project's own "avoid infrastructure the project doesn't need" convention.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| A new `BudgetPeriod` Prisma model + `GenerationRecord`-as-ledger | Keep `spend-ledger.json` as a flat file, add per-month keys inside its JSON shape | Rejected: loses SQLite's transactional guarantees, duplicates data already in `GenerationRecord`, and the project already migrated its persistence needs to Prisma in Phase 3 — reintroducing a hand-rolled flat-file schema for money-critical data now would be a regression, not a simplification. |
| App-wide in-process mutex | Full reserve-then-commit ledger with reservation tokens/TTL | Rejected for this phase: solves a multi-worker problem this single-process app doesn't have; see "Reserve/Commit Recommendation" above. |
| Deriving spend "type" from `LedgerEntry.model` string matching | `GenerationRecord.generationType` enum (already exists) | The enum is strictly more robust and already populated at every call site — no reason to build the fragile alternative CONTEXT.md's question #6 proposed as a fallback. |

**Installation:** None required — this phase is a Prisma migration (`npx prisma migrate dev`) plus application code, no `npm install`.

## Package Legitimacy Audit

**Not applicable — this phase installs no new external packages.** `[VERIFIED: package.json read in full this session; no new dependency is proposed anywhere in this research]`

## Architecture Patterns

### System Architecture Diagram

```
 Browser (wife's screen)
   │
   │  (poll / page load)
   ▼
 getBudgetStatusAction()  ─────────────┐   [NEW — Server Action]
   │  reads                            │
   ▼                                   │
 src/core/budget/ledger.ts             │   [NEW — core module, mirrors
   │  getBudgetStatus()                │    spend-ledger.ts's role]
   │    - SUM(BudgetPeriod.allocatedUsd)   -> cumulative allocated (rollover)
   │    - SUM(GenerationRecord.estimatedUsd, all-time) -> cumulative spent
   │    - SUM(GenerationRecord.estimatedUsd, this month) -> month-to-date spend
   │    - GROUP BY generationType -> LLM/IMAGE/VIDEO breakdown
   ▼
 SQLite (prisma/dev.db) via src/lib/db.ts
   - BudgetPeriod (NEW table: month, allocatedUsd)
   - GenerationRecord (EXISTING table, promoted to authoritative ledger role)

 ─────────────────────────────────────────────────────────────

 Every paid dispatch (6 touch sites) now goes through ONE shared queue:

 runStoryDirector() ────┐
 compareViaLlm() ───────┤
 generateSceneImagesAction() (per scene) ─┤──▶ budgetDispatchChain (mutex)
 dispatchSceneVideo() ──┤                        │
 getStoryStatusAction() (read-only, no mutex) ────┘  ▼
                                           checkBudget(estimatedUsd)  [NEW]
                                             - ensureCurrentMonthAllocation()
                                             - throw BudgetExceededError if
                                               cumulativeSpent + est > cumulativeAllocated
                                             ▼
                                           (real provider call dispatched)
                                             ▼
                                           recordGeneration(...)  [EXISTING,
                                             unchanged shape, now authoritative]
```

### Recommended Project Structure
```
src/core/budget/               # NEW — mirrors src/core/retry/, src/core/approval/
├── ledger.ts                  # checkBudget(), ensureCurrentMonthAllocation(),
│                               # getBudgetStatus() -- the real-system replacement
│                               # for src/lib/spend-ledger.ts's checkCeiling/recordSpend
├── ledger.test.ts
└── month.ts                   # currentMonthKey(), monthRange() -- trivial UTC
                                # helpers, kept separate so ledger.ts stays pure
                                # business logic (mirrors gates.ts's zero-I/O
                                # design philosophy where practical)
prisma/schema.prisma            # + model BudgetPeriod
prisma/migrations/<ts>_phase5_budget_ledger/migration.sql
src/app/actions/get-budget-status.ts   # NEW Server Action, mirrors get-story-status.ts
src/components/BudgetIndicator.tsx     # NEW, "use client" -- D-03's always-visible
                                        # small indicator, expand-for-breakdown
```

### Pattern 1: Env-var-with-safe-default (already established twice — reuse, do not reinvent)
**What:** Read a configuration number from `process.env`, falling back to a safe default on absent/malformed input, injectable for tests.
**When to use:** `MONTHLY_BUDGET_USD` reading — this is the exact shape `maxSceneRetryAttempts()` and `maxRegenerationAttempts()` already use.
**Example:**
```typescript
// Source: existing repo pattern, src/core/retry/caps.ts:15-25 (adapt for MONTHLY_BUDGET_USD)
export function monthlyBudgetUsd(env: Record<string, string | undefined> = process.env): number {
  const raw = env.MONTHLY_BUDGET_USD;
  if (raw === undefined) {
    return DEFAULT_MONTHLY_BUDGET_USD; // e.g. 15, matching PROJECT.md's stated default
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MONTHLY_BUDGET_USD;
  }
  return parsed;
}
```
**Critical difference from the dev ceiling:** `DEV_CEILING_USD` (`spend-ledger.ts:10`) is a **hardcoded literal constant**, not read from `process.env` at all — it is hand-edited in source on every raise (`3.00` → `3.25` → `6.25`, each a real commit). BUDGET-02 explicitly requires env-var configurability "enforced without a code change" — the real system must NOT copy this specific aspect of the dev ceiling's convention. See Pitfall 1.

### Pattern 2: Injectable-default collaborator (already established three times — reuse)
**What:** Every exported function in `spend-ledger.ts`, `story-repository.ts`, `generation-repository.ts`, and `db.ts` takes its I/O dependency (`path`, `client`) as an optional trailing parameter defaulting to the real implementation.
**When to use:** Every function in the new `src/core/budget/ledger.ts` module, so `ledger.test.ts` can inject a temp-file Prisma client exactly the way `generation-repository.test.ts` and `db.test.ts` already do.

### Pattern 3: Single gated dispatch point per provider (structurally enforced today — extend, don't bypass)
**What:** `check-boundaries.ts` invariant 5 already guarantees exactly one file may import the video provider and exactly one may import the image provider.
**When to use:** The new budget module's `checkBudget`/`commitSpend` (or whatever they're named) should be called from inside those same existing single-dispatch functions (`dispatchSceneVideo`, `generateSceneImagesAction`, `runStoryDirector`, `compareViaLlm`) — do not add new call sites; replace the existing `checkCeiling`/`recordSpend` imports in place.

### Anti-Patterns to Avoid
- **Deriving generation type from the `model` string:** fragile substring matching (works today only because image models happen to contain `"-image"`); use the existing `GenerationRecord.generationType` enum instead.
- **A second, parallel ledger table:** `GenerationRecord` already has everything needed; adding a new `SpendEntry`-style table alongside it would recreate the exact dual-write problem this phase should be eliminating.
- **Hardcoding the monthly figure as a source constant** (mirroring `DEV_CEILING_USD`'s current shape): fails BUDGET-02's literal "enforced without a code change" requirement.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-request write serialization for the budget check | A new file-lock mechanism (mirroring `withLedgerFileLock` in `spend-ledger.ts:59-89`) | The generalized in-process `budgetDispatchChain` mutex (extends `generate-video.ts`'s existing `videoDispatchChain` pattern) | SQLite via Prisma already gives atomic single-statement writes; a hand-rolled `.lock` file was only ever needed because the old ledger was a flat JSON file with no transactional writer of its own. |
| Month arithmetic / rollover bookkeeping | A date library (`date-fns`/`dayjs`) or a bespoke "billing period" abstraction | Plain `Date.prototype.getUTCFullYear()`/`getUTCMonth()` plus one `BudgetPeriod` row per month | The only operation needed is "what UTC calendar month is `now`, and what UTC calendar month is this `createdAt`" — a full date library is unjustified infrastructure for two field extractions, consistent with this project's own "no infrastructure the project doesn't need" convention. |
| Type breakdown for BUDGET-03 | A new classification module (regex/lookup table over model ids) | `GROUP BY GenerationRecord.generationType` | Already a first-class enum column, already populated at every real call site — see "Generation-Type Breakdown Is Already Free" above. |

**Key insight:** almost everything this phase needs already exists in the codebase in a slightly different role (`GenerationRecord` as a durability dual-write → promote to authoritative; `videoDispatchChain` as a video-only mutex → generalize; `maxSceneRetryAttempts`'s env-pattern → replicate for `MONTHLY_BUDGET_USD`). The risk in this phase is *rebuilding* rather than *re-pointing/promoting* — every "Don't Hand-Roll" row above is really the same warning restated for a different sub-problem.

## Common Pitfalls

### Pitfall 1: Copying the dev ceiling's hardcoded-constant pattern instead of reading `process.env`
**What goes wrong:** `DEV_CEILING_USD` is `export const DEV_CEILING_USD = 6.25;` — a source-code literal, not `process.env.DEV_CEILING_USD`. If the real budget system's `MONTHLY_BUDGET_USD` reading follows this same shape by copy-paste habit, BUDGET-02's "configurable... enforced without a code change" requirement silently fails.
**Why it happens:** `spend-ledger.ts` is the most obvious file to copy from, and its constant-based convention is the most visible pattern in it.
**How to avoid:** Use `process.env.MONTHLY_BUDGET_USD`, following `maxSceneRetryAttempts()`'s pattern (an actual env read with a safe default), not `spend-ledger.ts`'s pattern (a hardcoded literal).
**Warning signs:** A `MONTHLY_BUDGET_USD` reference that is a `const X = 15` literal anywhere in `src/core/budget/`.

### Pitfall 2: Missing touch sites #2 and #5
**What goes wrong:** A re-pointing pass that only updates the three files CONTEXT.md's canonical_refs named (`director.ts`, `generate-images.ts`, `generate-video.ts`) leaves `check.ts`'s uniqueness-comparison spend and `get-story-status.ts`'s headroom probe pointed at the retired dev ledger — silently under-counting real spend (the comparison call bypasses the real ceiling entirely) or crashing (the headroom probe imports a module that no longer exists/behaves differently).
**Why it happens:** `check-boundaries.ts` invariant 5 creates a false sense that the dispatch surface is already structurally enumerated; it enumerates *provider* imports, not *ledger* imports.
**How to avoid:** Re-point by `grep`ping for `checkCeiling|recordSpend` (or the equivalent `spend-ledger` import specifier), not by re-reading CONTEXT.md's list.
**Warning signs:** `npm run typecheck` or `node src/scripts/check-boundaries.ts` passing clean while a real dev-ledger import still lingers — neither of those checks catches a stale import of a file that still exists and still exports the old names.

### Pitfall 3: Floating-point drift in cumulative sums
**What goes wrong:** The real ledger data already shows this today — `estimatedUsd: 0.30000000000000004` (`storage/_smoketest/spend-ledger.json`, several video entries, e.g. duration × price-per-second arithmetic). Summing many such floats and comparing with strict `>` against a target can produce off-by-a-fraction-of-a-cent surprises, or a display showing `$9.929999999999998 of $10 remaining`.
**Why it happens:** IEEE 754 float arithmetic; `durationSeconds * VIDEO_PRICE_PER_SECOND["720p"]` (e.g. `6 * 0.05`) does not always land on an exact decimal.
**How to avoid:** Keep `checkCeiling`'s existing convention of comparing raw floats for the enforcement decision (the boundary is already inclusive — `projected > ceiling`, `spend-ledger.ts:156` — a fractional-cent difference at the boundary doesn't change wife-facing behavior meaningfully), but always round to 2 decimals with `.toFixed(2)` at the display layer, exactly as `checkCeiling`'s own error message already does (`spend-ledger.ts:158-160`).
**Warning signs:** A UI test asserting an exact float equality instead of a rounded/formatted string.

### Pitfall 4: Promoting `GenerationRecord` to authoritative without deciding what "authoritative" means for its write-failure contract
**What goes wrong:** `generation-repository.ts`'s file-level comment explicitly documents every write in that module as "BEST-EFFORT BY CONTRACT... never throws" (`generation-repository.ts:8-22`), because today it's a durability dual-write, never the enforcement source. If Phase 5 makes `GenerationRecord` the enforcement source of truth for the **read** side (summing spend) but silently keeps the **write** side best-effort, a swallowed write failure under-counts real spend going forward — functionally the same risk `spend-ledger.ts`'s own `recordSpend` already accepts today (a lock-timeout or crash can lose an entry, logged loudly per `generate-video.ts:275-294`'s own comment), so this is *not a new regression*, but it must be a deliberate, documented decision in the plan, not an accidental side effect of reusing the table.
**Why it happens:** The temptation to leave `recordGeneration`'s contract untouched because "it already works" — true for durability, not automatically true once it also becomes the enforcement ledger's write path.
**How to avoid:** In the plan, explicitly state that the commit-side write failure mode is unchanged from today's `recordSpend` risk profile (log loudly, don't discard an already-paid-for asset) — don't silently assume it, write it down.
**Warning signs:** A code review question "does a failed `recordGeneration` after a real Veo call mean that $0.40 never counts against her budget?" with no documented answer.

### Pitfall 5: Double-crediting a month's allocation on every request
**What goes wrong:** If `ensureCurrentMonthAllocation()` isn't written as a true idempotent upsert keyed on the unique `month` column, a naive "insert a new BudgetPeriod row if none exists this check" written without the DB-level uniqueness constraint doing the enforcing could race under concurrent requests and insert the same month twice, silently doubling her real allocation.
**Why it happens:** Looks like a simple "check then insert" — the exact TOCTOU shape this whole phase is otherwise trying to eliminate, just relocated to a different table.
**How to avoid:** `@@unique([month])` on `BudgetPeriod` plus a Prisma `upsert` (not a manual `findFirst` + `create`), so the database itself rejects the duplicate rather than relying on application-level timing.
**Warning signs:** Two `BudgetPeriod` rows for the same month string in `prisma/dev.db`.

## Code Examples

### Idempotent per-month allocation crediting
```typescript
// Source: adapted from this project's own injectable-default convention
// (src/lib/db.ts:30-35, src/core/persistence/story-repository.ts:8-10)
export async function ensureCurrentMonthAllocation(
  client: PrismaClient = prisma,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const month = currentMonthKey(); // "2026-09"
  const allocatedUsd = monthlyBudgetUsd(env);
  await client.budgetPeriod.upsert({
    where: { month },
    update: {}, // already credited -- do not re-apply a changed env value retroactively
    create: { month, allocatedUsd },
  });
}
```

### Cumulative check (mirrors `checkCeiling`'s fail-closed shape, spend-ledger.ts:139-162)
```typescript
// Source: adapted from existing repo pattern, src/lib/spend-ledger.ts:139-162
export async function checkBudget(estimatedUsd: number, client: PrismaClient = prisma): Promise<void> {
  if (!Number.isFinite(estimatedUsd) || estimatedUsd < 0) {
    throw new BudgetExceededError(`Refusing call: estimated cost ${estimatedUsd} is invalid.`);
  }
  await ensureCurrentMonthAllocation(client);
  const [{ _sum: allocated }, { _sum: spent }] = await Promise.all([
    client.budgetPeriod.aggregate({ _sum: { allocatedUsd: true } }),
    client.generationRecord.aggregate({ _sum: { estimatedUsd: true } }),
  ]);
  const cumulativeAllocated = allocated.allocatedUsd ?? 0;
  const cumulativeSpent = spent.estimatedUsd ?? 0;
  const projected = cumulativeSpent + estimatedUsd;
  if (projected > cumulativeAllocated) {
    throw new BudgetExceededError(
      `Refusing call: budget is $${cumulativeAllocated.toFixed(2)}, already spent $${cumulativeSpent.toFixed(2)}, ` +
        `this call would add $${estimatedUsd.toFixed(2)} for a projected total of $${projected.toFixed(2)}.`,
    );
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Flat JSON ledger (`storage/_smoketest/spend-ledger.json`) with a single hand-edited `ceilingUsd` constant | Prisma/SQLite `GenerationRecord` (existing, promoted) + new `BudgetPeriod` (per-month allocation) | Phase 5 | Real transactional storage, real per-month rollover, no more hand-editing a source constant to raise the ceiling. |
| `checkCeiling`/`recordSpend` as the single dispatch gate | New `checkBudget`/equivalent in `src/core/budget/ledger.ts`, same call shape | Phase 5 | Six touch sites re-pointed, not rebuilt — the calling convention (check-before, record-after) is unchanged. |
| Video-only in-process mutex (`videoDispatchChain`) | App-wide `budgetDispatchChain` covering all real dispatch types | Phase 5 (recommended) | Closes the TOCTOU race for every paid call type, not just video. |

**Deprecated/outdated:**
- `DEV_CEILING_USD` / `spend-ledger.json`: superseded for the wife-facing production path per CONTEXT.md's own domain framing ("not an additional layer alongside it"). Its fate for dev-only CLI probe scripts is an open decision — see Open Questions #1.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Next.js `next dev`'s built-in `.env.local` file-watching means editing `MONTHLY_BUDGET_USD` and saving takes effect without a manual restart, for the `npm run dev` command the wife actually runs (confirmed as her documented start command via STARTUP-01's verification history) | "Env-Var Reading Pattern" / BUDGET-02 | If wrong, BUDGET-02's "enforced without a code change" is still technically satisfied (no code edit needed) but a restart may be required for `next start` production mode — low risk since `npm run dev` is the documented command, but worth a live confirmation during this phase's UAT. |
| A2 | The generalized in-process mutex (`budgetDispatchChain`) sufficiently closes the TOCTOU race for this phase's real-world usage pattern, given dev CLI probe scripts are recommended to stay on a separate, smaller ceiling (see Open Question #1) | "Reserve/Commit Recommendation" | If the requester actually does run a probe script concurrently with the live wife-facing app against the SAME ledger, a narrow cross-process race remains possible — low real-world likelihood for a single-household local app, but not mathematically eliminated. |
| A3 | Prisma 7's `better-sqlite3` driver adapter supports `$transaction(async (tx) => ...)` with sufficient locking guarantees to strengthen the mutex further, if the planner chooses that route instead | "Reserve/Commit Recommendation" (noted as an alternative, not the primary recommendation) | Purely additive risk — this alternative is not recommended as the baseline design, so getting this wrong doesn't affect the primary recommendation's correctness. |

## Open Questions

1. **The fate of `DEV_CEILING_USD`/dev-testing CLI probe scripts after Phase 5 ships (flagged by CONTEXT.md as needing an explicit decision, not a silent pick)**
   - What we know: CONTEXT.md's domain statement says the real system "replaces the throwaway `DEV_CEILING_USD` dev-testing ledger... as the actual enforcement mechanism for her real usage — it is not an additional layer alongside it." This clearly settles that the **wife-facing Server Action paths** (the six touch sites) must use exactly one check (the real one), not the dev ceiling stacked on top.
   - What's unclear: whether future developer-only CLI probe scripts (`story-probe.ts`, `smoke-test.ts`, `persistence-probe.ts`, `uniqueness-probe.ts` — none of which she ever runs) should also be forced onto the real per-month ledger, or should keep a small, separate, clearly-labeled ceiling.
   - Recommendation: keep dev probe scripts on a **separate, small, explicitly-labeled** ceiling (a renamed/repurposed constant, not `MONTHLY_BUDGET_USD`), so a developer's future Phase 6 failure-injection testing session cannot silently consume the wife's real monthly allowance. This is a genuine product-safety concern (accidentally spending her real budget on developer testing), not just a style preference — recommend surfacing this as an explicit `checkpoint:human-verify` or discuss-phase confirmation rather than deciding it silently in the plan.

2. **Exact display semantics for BUDGET-03's "$X of $Y remaining"**
   - What we know: D-03's example ("$9.93 of $10 remaining") is explicitly illustrative, not locked. Two numbers are computable and well-defined: (a) lifetime cumulative headroom (`cumulativeAllocated - cumulativeSpent`, which correctly reflects rollover), and (b) this calendar month's own allocation vs. this calendar month's own spend (which does NOT reflect rollover on its own).
   - What's unclear: which of these two — or some combination — the UI-SPEC step should show as the primary "$X of $Y" figure, given D-03's rollover model means they can diverge (e.g., a month with large carried-over headroom could show "$Y" far bigger than that month's own nominal allocation).
   - Recommendation: pass this decision to the UI-SPEC step with both numbers computed and available; this research recommends showing the cumulative/rollover-inclusive headroom as the primary figure (since that's what actually gates whether a call will be refused) with the current month's own allocation as secondary/expandable detail, consistent with BUDGET-01's literal enforcement math.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All server code | ✓ | ≥20.6.0 (`package.json` engines) | — |
| Prisma / SQLite (`prisma/dev.db`) | New `BudgetPeriod` table, `GenerationRecord` queries | ✓ | Prisma 7.10.0, pinned, already proven in Phase 3 | — |
| `better-sqlite3` driver adapter | Prisma's SQLite access | ✓ | `^12.6.0` | — |

**Missing dependencies with no fallback:** none — this phase extends already-proven infrastructure.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node's built-in `node:test` (no third-party test framework — matches every existing test file in the repo) |
| Config file | none — invoked directly via file list in `package.json`'s `test:lib` script |
| Quick run command | `node --test src/core/budget/ledger.test.ts` (once created) |
| Full suite command | `npm run test:lib` (runs every `node:test` file plus `node src/scripts/check-boundaries.ts`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUDGET-01 | Pre-flight check refuses when projected spend exceeds cumulative allocation | unit | `node --test src/core/budget/ledger.test.ts` | ❌ Wave 0 |
| BUDGET-02 | `MONTHLY_BUDGET_USD` change (env, no code edit) changes enforcement | unit | `node --test src/core/budget/ledger.test.ts` (inject fake env, mirroring `caps.test.ts`'s own convention) | ❌ Wave 0 |
| BUDGET-03 | Month-to-date spend, grouped by type, computed correctly | unit | `node --test src/core/budget/ledger.test.ts` (or a dedicated status test) | ❌ Wave 0 |
| BUDGET-04 | Retry path calls the identical gated function as first attempt | unit (regression) | `node --test src/app/actions/generate-video.test.ts` / existing coverage if present, else add | Check — none of `generate-video.ts`/`regenerate-scene-image.ts` currently has a `.test.ts`; recommend adding at minimum a "retry re-points to the real budget check" assertion in Wave 0 |
| BUDGET-05 | Retry cap refusal message, unchanged behavior | unit (regression only) | `node --test src/core/retry/caps.test.ts src/core/approval/gates.test.ts` | ✅ already exists, no new work |
| Boundary invariants | All six touch sites re-pointed, no stale `spend-ledger` import remains, ideally a new invariant enumerating budget-module imports | structural | `node src/scripts/check-boundaries.ts` | ✅ exists; recommend extending with a new invariant per "Real Call-Site Inventory" above |

### Sampling Rate
- **Per task commit:** `node --test src/core/budget/ledger.test.ts` (fast, no full suite needed mid-task)
- **Per wave merge:** `npm run test:lib`
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus `npm run typecheck`

### Wave 0 Gaps
- [ ] `src/core/budget/ledger.test.ts` — covers BUDGET-01, BUDGET-02, BUDGET-03
- [ ] A migration script/test verifying the $5.072 historical entries land correctly in `GenerationRecord` (D-01)
- [ ] Consider adding `src/app/actions/generate-video.test.ts` / `generate-images.test.ts` if none exist today — needed to assert BUDGET-04 stays true after the re-point (regression coverage for a property that currently holds only structurally, with no direct test asserting it)
- [ ] Prisma migration: `npx prisma migrate dev --name phase5_budget_ledger` (adds `BudgetPeriod`; no `LedgerEntry`-equivalent table needed per "Recommended Schema" above)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Single local user, no auth surface (`REQUIREMENTS.md` Out of Scope) |
| V3 Session Management | No | Same |
| V4 Access Control | Partially | The budget refusal itself IS an access-control decision (refuse a paid call) — already server-side only, never client-enforceable, matching `check-boundaries.ts` invariant 1's existing guarantee that no "use client" file may import the budget module |
| V5 Input Validation | Yes | `MONTHLY_BUDGET_USD` env parsing must reject non-finite/non-positive values exactly as `checkCeiling`'s existing `ceilingUsd` validation does (`spend-ledger.ts:147-151`, fail-closed, not fail-open) |
| V6 Cryptography | No | Not applicable to this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| A malformed/absent `MONTHLY_BUDGET_USD` silently disarming the budget gate (e.g. `someNumber > undefined` evaluating `false` in JS) | Tampering / Denial of correct accounting | Fail closed exactly as `checkCeiling`'s existing CR-01 fix does: validate the loaded allocation is finite and > 0, throw rather than silently pass every future check if not. |
| Client-side budget display used as the actual enforcement boundary | Elevation of Privilege | The refusal must happen server-side inside the same gated Server Action that dispatches the paid call (already the case structurally); the client-side indicator (BUDGET-03) is read-only display, never itself a gate — matches invariant 1's existing guarantee. |
| A developer's dev-testing CLI probe silently consuming the wife's real monthly budget | Tampering (unintended) | See Open Question #1 — recommend keeping dev probes on a separate ceiling. |

## Sources

### Primary (HIGH confidence — direct file reads this session)
- `.planning/phases/05-budget-retry-safeguards/05-CONTEXT.md` — locked decisions and discretion notes
- `.planning/REQUIREMENTS.md` — BUDGET-01 through BUDGET-05 exact wording
- `.planning/PROJECT.md` — $15 default, `billed: true` convention, no-Billing-API decision
- `.planning/phases/01-provider-smoke-test/01-REVIEW-FIX.md` — WR-02 TOCTOU finding and its developer note
- `src/lib/spend-ledger.ts`, `src/lib/spend-ledger.test.ts` — existing ledger implementation in full
- `src/core/retry/caps.ts` — env-var-with-safe-default pattern
- `src/core/approval/gates.ts` — retry-cap refusal logic, already-satisfies-BUDGET-05 evidence
- `src/app/actions/generate-video.ts`, `generate-images.ts`, `regenerate-scene-image.ts`, `retry-scene-video.ts`, `get-story-status.ts` — every real dispatch/retry/status call site
- `src/core/story/director.ts`, `src/core/uniqueness/check.ts` — LLM dispatch call sites (including the one CONTEXT.md's list missed)
- `src/core/persistence/generation-repository.ts` — `GenerationRecord` write contract, best-effort convention
- `prisma/schema.prisma` — full current schema, including `GenerationType` enum
- `src/scripts/check-boundaries.ts` — structural invariants, confirms invariant 5 does not enumerate ledger touch sites
- `storage/_smoketest/spend-ledger.json` — real historical data, summed via `node` this session to confirm $5.072
- `package.json`, `src/lib/db.ts` — dependency list, Prisma client pattern

### Secondary (MEDIUM confidence)
- `prisma.io/docs/orm/fundamentals/transactions` (WebSearch result) — confirms Prisma 7's `$transaction` interactive-transaction API exists; not verified against the specific `better-sqlite3` adapter's locking semantics this session, so treated as supporting context for the noted alternative only, not the primary recommendation.

### Tertiary (LOW confidence)
- General web search results on "reserve-then-commit ledger pattern" (GitHub issues, dev.to posts, not official docs) — used only to confirm the pattern's general shape and its intended problem domain (multi-worker races), which supported the decision to recommend AGAINST adopting it in full for this single-process app.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all decisions grounded in files read this session
- Architecture: HIGH — schema/call-site recommendations grounded in direct reads of every relevant file, including a corrected call-site count
- Pitfalls: HIGH — every pitfall traces to a specific line/comment already in the codebase
- Reserve/commit design judgment: MEDIUM — a real architectural recommendation, not a verified fact; flagged accordingly with an explicit lower-confidence alternative noted

**Research date:** 2026-09-19
**Valid until:** No fixed expiry — this research is grounded entirely in this repository's own code, not external library versions; re-verify only if the underlying files change materially before planning executes.

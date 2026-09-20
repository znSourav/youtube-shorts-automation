# Phase 6: Reliability, Secrets Hygiene & Output Correctness - Context

**Gathered:** 2026-09-20
**Status:** Ready for planning

<domain>
## Phase Boundary

The tool fails safely and honestly at every edge instead of corrupting state or leaking secrets: a provider failure (error, timeout, rate limit, malformed response) leaves only the affected scene in a clearly failed-but-retryable state with a plain-language, failure-type-aware message; a missing API key never crashes the app or exposes a secret, and is explained at the point she needs it; API keys and other secrets never reach client-side JavaScript, logs, or story metadata; and every saved video file is confirmed to genuinely be a valid, playable MP4 — never a mislabeled error response silently marked "ready."

</domain>

<decisions>
## Implementation Decisions

### Provider-failure messaging (RELIABILITY-01)
- **D-01:** The message she sees differs by failure type, not one generic "something went wrong" for everything: a timeout/technical glitch gets a "try again" framing, a content block gets a "try rephrasing your idea" framing, and the existing budget/retry-cap-reached messages stay exactly as they are today. All still calm, plain-language, with no raw provider text, model IDs, or file paths — matching the convention established in Phases 2-5.
- **D-02:** A technical-glitch failure (timeout, malformed response) consumes one of the scene's limited retry attempts, exactly the same as a content-block failure — no special-casing by cause. Keeps Phase 4's existing per-scene retry-cap counter unchanged; the cap's job is "stop an accidental click-loop from burning money," which applies regardless of why a given attempt failed.

### Missing API key at startup (STARTUP-02)
- **D-03:** If the API key is missing, the app starts normally and reaches the ordinary create screen — no dedicated setup screen, no blank page, no crash. She only sees an explanation the moment she takes an action that actually needs the key (e.g. clicking "Create Story"), in place of the usual result — mirroring how a budget refusal already surfaces today.
- **D-04:** The missing-key state is not a persistent banner shown from the moment the app opens. It appears only when and where she hits it, not as a second always-visible UI element alongside the budget indicator.

### Corrupted output file recovery (OUTPUT-02)
- **D-05:** If a saved video/image file turns out to be invalid (not genuinely the asset it claims to be), retrying it does **not** consume one of her limited per-scene retry attempts. Rationale (from discussion): a corrupted save is a bug in this app's own write/download step, not a failed creative attempt — the provider most likely did its job. Charging this against her limited attempts would unfairly shrink the budget she has for actual creative retries. This is a deliberate asymmetry against D-02 above (technical *generation* failures do count; local *save-integrity* failures do not) — the two are genuinely different categories, not an inconsistency.
- **Noted, not asked (technical constraint, not a choice):** recovering a corrupted file will still almost certainly cost a fresh paid generation — this codebase has no mechanism to re-fetch a provider result after the fact, so "free of retry-cap" spares her attempt count but not her real monthly budget. Research/planning should confirm this holds and size accordingly; it is not something for her to decide.

### Claude's Discretion
- **When file validity gets checked** (immediately on save vs. lazily when she opens/uses it) was surfaced as a possible discussion area but not selected. Left to research/planning — lean toward checking at save time if it's cheap to do (catches the problem before she ever sees "ready"), but this is not a locked requirement.
- The exact plain-language copy for each differentiated failure message (D-01), the missing-key explanation text (D-03), and how a corrupted-file recovery is actually phrased to her are research/planning/UI-design concerns, not put to the user this session. Follow the established plain-language, calm, non-alarming convention from Phases 2-5.
- **Two specific technical-debt items already named "Phase 6's job" in prior code reviews** (not re-discussed this session — already decided, just need addressing):
  1. `generate-images.ts`/`director.ts`'s unprotected `recordSpend` call (Phase 4 code review pass 5) — the identical pattern was fixed in `generate-video.ts` but deliberately left here as out-of-scope at the time.
  2. The stuck-generation detector's client-only clock (Phase 4 code review pass 6) — a page reload silently resets the 12-minute countdown even for a scene stuck far longer, because there's no server-recorded "generating since" timestamp.
- **Phase 5's review also flagged one more, in scope for reliability:** the shared `serializeDispatch` queue (`src/core/budget/dispatch-chain.ts`) has no per-call timeout — a single hung provider call could wedge every future generation until the app restarts (05-REVIEW.md WR-01). Whether/how to add a bounded timeout is a research/planning implementation call, not re-opened as a user discussion topic this session.
- Exact mechanism for fixing `log-response.ts`'s `isSecretKey()` over-redaction (it currently matches the substring "token", so legitimate `usageMetadata` token-count fields get redacted alongside real secrets — not a security hole, but noisy/inaccurate) is left to research/planning.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level
- `.planning/REQUIREMENTS.md` §Startup (STARTUP-02), §Reliability (RELIABILITY-01), §Security (SECURITY-01), §Output (OUTPUT-02) — the exact requirement text this phase must satisfy.
- `.planning/ROADMAP.md` § Phase 6 — goal and the 4 success criteria.
- `.planning/PROJECT.md` § Key Decisions — the `billed: true` unconditional-on-dispatch convention (Phase 2 CR-01) and the plain-language-only browser-surfacing convention apply unchanged to every new error path this phase adds.

### Prior-phase context (known, pre-identified technical debt this phase should close)
- `.planning/phases/04-wife-facing-review-approval-flow/04-REVIEW.md` (or equivalent code-review pass 5/6 notes referenced in `.planning/STATE.md`'s Accumulated Context) — the unprotected `recordSpend` call in `generate-images.ts`/`director.ts`, and the stuck-generation detector's client-only clock.
- `.planning/phases/05-budget-retry-safeguards/05-REVIEW.md` WR-01 — the shared dispatch queue's missing per-call timeout.
- `src/lib/log-response.ts` — the existing `isSecretKey()` substring-match over-redaction on "token" (PROJECT.md Context, "WINDOWS #2").

No other external specs/ADRs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/budget/ledger.ts`'s `BudgetExceededError` / the existing budget-refusal surfacing pattern in `create-story.ts`, `generate-images.ts`, `generate-video.ts` — the direct template for D-01's differentiated-by-type failure messaging: these files already catch a specific error type and map it to one fixed plain-language sentence, server-side, with nothing else crossing to the browser.
- `src/core/retry/caps.ts` (`maxSceneRetryAttempts`) and `src/core/approval/gates.ts` — the existing per-scene retry-cap mechanism D-02 keeps unchanged, and D-05 deliberately does NOT touch this counter for file-integrity failures — any new "don't consume the cap" path needs to route around this existing increment, not extend it.
- `src/lib/log-response.ts` (`isSecretKey`, `redactLargeStrings`, `logRawResponse`) — the existing secret-redaction mechanism; already confirmed structurally correct in spirit (never lets a `key`/`token`/`authorization`-named field through), the known issue is over-matching, not under-matching.
- `.env.local.example` (git-tracked) + `.gitignore`'s `.env.local` entry — confirmed already correctly configured this session (`git check-ignore -v .env.local` confirms the match); SECURITY-01's structural half already holds, the remaining work is confirming keys never leak through logs/client bundle/story metadata at runtime.

### Established Patterns
- Every provider-calling function is gated through a single, structurally-enforced dispatch point (`check-boundaries.ts` invariant 5/7) — any new file-integrity check for OUTPUT-02 should sit at the existing write/save boundary in `generate-video.ts`/`generate-images.ts`, not a new parallel path.
- Plain-language-only error/status surfacing to the browser, calm non-alarming tone even at retry-cap exhaustion (Phase 4 D-03's established convention) — every new message this phase adds must follow this exactly.

### Integration Points
- The missing-API-key check (D-03/D-04) needs to sit wherever a paid dispatch is about to fire — likely alongside or just before the existing `checkBudget` call in each of the four gated dispatch functions — so it fires at the same "point of use" moment budget refusals already do, not as a separate new gate.
- A video-file validity check (OUTPUT-02) most naturally sits immediately after `generateVideo()` returns in `generate-video.ts`, right where the file is written to disk — the same place `get-story-status.ts`'s existing lightweight `existsSync` vanished-file check already lives, which this phase's real content-validity check extends rather than replaces.

</code_context>

<specifics>
## Specific Ideas

No specific UI mockups or exact wording were given for any of the new failure messages. The illustrative phrasing above ("try again", "try rephrasing your idea") is not locked copy — planning/execution has latitude on exact wording as long as it stays plain-language, calm, and differentiated by failure type per D-01.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No scope-creep topics came up.

</deferred>

---

*Phase: 6-Reliability, Secrets Hygiene & Output Correctness*
*Context gathered: 2026-09-20*

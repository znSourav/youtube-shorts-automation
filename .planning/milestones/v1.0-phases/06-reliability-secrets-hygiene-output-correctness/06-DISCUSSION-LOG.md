# Phase 6: Reliability, Secrets Hygiene & Output Correctness - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-20
**Phase:** 6-Reliability, Secrets Hygiene & Output Correctness
**Areas discussed:** Provider-failure messaging, Missing API key at startup, Corrupted output file recovery

---

## Provider-failure messaging

| Option | Description | Selected |
|--------|-------------|----------|
| Differentiated by type | Distinct plain-language messages for timeout/technical glitch, content block, and budget/rate limits, each with a framing suited to what she should do next. | ✓ |
| One generic message | Every non-budget provider failure shows the same "Something went wrong, please try again" text. | |

**User's choice:** Differentiated by type.

**Follow-up question:** Does a technical-glitch failure consume one of her limited retry attempts, same as a content-block failure?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, same cap for everything | No special-casing by failure reason; matches how the existing per-scene retry cap already works. | ✓ |
| Technical glitches don't count against the cap | Only a content-block or creative outcome burns a retry attempt. | |

**User's choice:** Yes, same cap for everything.
**Notes:** Keeps Phase 4's existing retry-cap counter unchanged — no new "why did this fail" awareness needed in that mechanism.

---

## Missing API key at startup

| Option | Description | Selected |
|--------|-------------|----------|
| Starts normally, explains at point of use | The app boots to the normal create screen; the explanation appears the moment she tries an action that needs the key. | ✓ |
| Dedicated setup screen first | She's routed to a one-time setup screen before reaching the normal app. | |

**User's choice:** Starts normally, explains at point of use.

**Follow-up question:** Once the app detects the key is missing, how visible should that be?

| Option | Description | Selected |
|--------|-------------|----------|
| Only when she tries an action that needs it | No banner if she's just looking around; the explanation appears exactly where and when she hits the wall. | ✓ |
| Persistent banner from the moment she opens the app | Similar to the always-visible budget indicator. | |

**User's choice:** Only when she tries an action that needs it.
**Notes:** Avoids adding a second always-visible UI element alongside the existing budget indicator.

---

## Corrupted output file recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Free, doesn't count against her cap | A corrupted save isn't a failed creative attempt — the provider likely succeeded; the write/download step is what broke. | ✓ |
| Counts the same as any other retry | One retry-cap rule for everything, no special-casing by cause. | |

**User's choice:** Free, doesn't count against her cap.
**Notes:** Deliberately asymmetric with the provider-failure-messaging decision above — a *generation* failure counts against her cap, a *local save-integrity* failure does not. Claude flagged (not asked, since it's a technical constraint rather than a choice) that recovering a corrupted file will still very likely cost a fresh paid generation, since this codebase has no mechanism to re-fetch a past provider result — the cap exemption spares her attempt count, not her real budget.

---

## Claude's Discretion

- Whether file-validity checks run at save time or lazily on open/use — surfaced as a possible fourth area, not selected for discussion. Left to research/planning.
- Exact plain-language copy for every new message (failure types, missing-key explanation, corrupted-file recovery) — follow the established calm, plain-language convention from Phases 2-5.
- Two items already named "Phase 6's job" by prior code reviews, not re-discussed this session: the unprotected `recordSpend` call in `generate-images.ts`/`director.ts` (Phase 4 review pass 5), and the stuck-generation detector's client-only clock (Phase 4 review pass 6).
- Phase 5's review-flagged missing per-call timeout on the shared dispatch queue (05-REVIEW.md WR-01) — in scope for reliability, exact mechanism left to research/planning.
- Fixing `log-response.ts`'s `isSecretKey()` "token" substring over-redaction — left to research/planning.

## Deferred Ideas

None — discussion stayed within phase scope. No scope-creep topics came up.

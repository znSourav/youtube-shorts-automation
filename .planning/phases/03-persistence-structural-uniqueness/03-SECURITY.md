---
phase: "03"
slug: "persistence-structural-uniqueness"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-09-14"
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Server Actions -> Prisma/SQLite | Story/scene/generation data written and read via `src/core/persistence/` | Story text, both bibles, structural fingerprints, image/video paths, per-call costs |
| LLM comparison call -> Gemini API | The uniqueness tie-breaker (`compareStructuralSimilarity`) dispatches for borderline cases only | Two abstracted fingerprint triples (never raw story text or the wife's input) |
| Browser -> `loadStoryAction` | Restore-on-mount reads a client-supplied story id from localStorage | A story id string, validated before any query |
| Database -> Browser | Restored story/scene data returned to the client | Story/scene content and status (intended); no path, no id beyond what's already client-held, no raw provider text |
| Provider response -> durable record | `GenerationRecord` rows persist alongside the real spend ledger | Summary fields only (cost, model, billed flag, plain-language message) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-01 | Tampering | SQL injection via story-derived or client-derived text reaching a query (recurs across plans 03-01/02/03 as new query call sites are added) | high | mitigate | Prisma's generated, parameterized query API exclusively; `check-boundaries.ts` invariant 4 fails the gate if an unchecked raw-query escape hatch (`$queryRawUnsafe`/`$executeRawUnsafe`) appears anywhere under `src/` — confirmed absent this session, and wired into `test:lib` (WR-02 fix) so it runs on every future change too | closed |
| T-03-02 | Information Disclosure | Prisma client, generated output, or the SQLite file path reaching the browser bundle | high | mitigate | `check-boundaries.ts` invariant 1 bans the Prisma package, generated output, and `src/lib/db.ts` from any `"use client"` file; `src/lib/db.ts` carries a server-only header. Widened by WR-03's fix to also catch a client file importing `core/persistence` directly | closed |
| T-03-03 | Tampering | A Server Action opening its own Prisma client and bypassing the repository's validation | medium | mitigate | `check-boundaries.ts` invariant 3 requires every file under `src/app/actions/` to reach the database only through `src/core/persistence/` | closed |
| T-03-04 | Tampering | Path traversal via a story id or path string written into a database column | medium | mitigate | `saveStoryWithScenes` routes the story id through `storage-paths.ts`'s `storyDir()` before any write; refused as a database key if invalid | closed |
| T-03-05 | Tampering | Unvalidated LLM JSON written into the `characterBible`/`styleBible` Json columns (ASVS V5) | medium | mitigate | `saveStoryWithScenes` only accepts a `StoryDirectorOutput`, a type that can only originate from a successful zod `safeParse` inside `runStoryDirector` | closed |
| T-03-06 | Information Disclosure | Secret-shaped or oversized provider payload persisted into a durable column | medium | mitigate | `GenerationRecord` stores summary fields only (`estimatedUsd`, `model`, `billed`, `ok`, plain-language `message`); no raw response object, prompt, or usage-metadata blob is ever written | closed |
| T-03-07 | Denial of Service (budget) | A paid provider call dispatched by persistence work (plan 03-01) against the near-exhausted dev ceiling | high | mitigate | Plan 03-01 dispatched zero paid calls; `--real` mode was written but not executed until plan 03-04's own gated checkpoint | closed |
| T-03-08 | Denial of Service (budget) | The regeneration loop making unbounded paid Story Director calls | high | mitigate | Bounded by `maxRegenerationAttempts`, defaulting safely to 3 on any malformed/absent env value; every retry re-enters `checkCeiling`; a ceiling refusal mid-loop ends the loop rather than retrying | closed |
| T-03-09 | Denial of Service (budget) | The LLM tie-breaker firing on every candidate instead of only the borderline case | high | mitigate | `preFilterVerdict` escalates only when all three fields land in the borderline band; obvious-reject/obvious-pass paths dispatch nothing, asserted by call-count tests | closed |
| T-03-10 | Tampering | Second-order prompt injection via database-stored fingerprint text re-injected into later prompts | medium | mitigate | Only the three short fingerprint fields are interpolated (never raw story text), each truncated to 300 characters, placed behind a content delimiter; response schema bounds output to three booleans regardless of prompt content | closed |
| T-03-11 | Information Disclosure | A rejected candidate's text, or the identity of the story it collided with, reaching the browser (D-03) | medium | mitigate | Rejected candidates are never persisted or returned; `CreateStorySuccess`'s shape has no field capable of carrying a collided id or rejected text, asserted by test | closed |
| T-03-12 | Repudiation | A dispatched comparison call leaving no ledger record | medium | mitigate | `recordSpend` runs after every dispatched comparison including blocked ones, carrying real usage metadata and a billed flag | closed |
| T-03-13 | Information Disclosure | Raw comparison response logged with secret-shaped or oversized fields | medium | mitigate | `logRawResponse` reused unchanged; redacts key-shaped fields and truncates long strings | closed |
| T-03-14 | Tampering | A client-supplied story id reaching a database read through `loadStoryAction` | medium | mitigate | Routed through `storyDir()` before any query; an id outside the slug pattern is refused as not-found rather than queried | closed |
| T-03-15 | Information Disclosure | A filesystem path reaching the browser through the restore payload | medium | mitigate | `LoadedSceneStatus`/`LoadedStory` declare no path field at all, mechanically asserted by a serialize-then-search test; confirmed live this session (real restore of two real stories, zero path text in either payload) | closed |
| T-03-16 | Information Disclosure | Secret-shaped or oversized provider payload persisted into a `GenerationRecord` message | medium | mitigate | The persisted message is the same plain-language sentence already returned to the browser, never a raw response/prompt/usage metadata | closed |
| T-03-17 | Denial of Service (data loss) | A database write failure discarding an already-paid-for image or video | high | mitigate | All repository write functions are best-effort by contract (catch, log one line, return normally); a DB failure can only cost a durability record, never the paid asset | closed |
| T-03-18 | Repudiation | Substituting database accounting for the real file ledger, silently weakening the budget gate | high | mitigate | `spend-ledger.ts` untouched; `git diff --exit-code` against it is an automated gate on every relevant task; the database record is additive, never a replacement | closed |
| T-03-19 | Denial of Service (budget) | The real proof run (plan 03-04) exceeding remaining dev-ceiling headroom | high | mitigate | Gated behind a `blocking-human` checkpoint stating the exact estimate and exact headroom; exactly one call budgeted, no retry on block, automated post-run check fails if the ledger exceeds the expected total | closed |
| T-03-20 | Tampering | Raising `DEV_CEILING_USD` or repointing `LEDGER_PATH` to route around a refusal | high | mitigate | `git diff --exit-code` against the ledger module permits a difference only when a human's checkpoint answer explicitly named a new figure — exercised for real this session (human named $3.25, both the source constant and the persisted ledger file's `ceilingUsd` were updated and committed with that figure attributed) | closed |
| T-03-21 | Information Disclosure | A secret or oversized raw payload transcribed into the committed proof document | medium | mitigate | The probe prints only already-parsed, already-validated fields, never the raw response object | closed |
| T-03-22 | Repudiation | A real call leaving no record of what it produced | medium | mitigate | `recordSpend` writes the ledger entry as always; `03-PROOF-RUN.md` transcribes fingerprint values verbatim, not summarized | closed |
| T-03-23 | Tampering | The probe's own synthetic fixture story contaminating the comparison history | low | mitigate | Real mode deletes the fixture story row and its children before dispatching, so the real candidate is compared against a genuinely empty (then genuinely real) history | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-14 | 23 | 23 | 0 | Claude (gsd-secure-phase, L1 short-circuit: register_authored_at_plan_time=true, asvs_level=1, threats_open=0) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-14

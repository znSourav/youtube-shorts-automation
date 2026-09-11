# Walking Skeleton — AI Animated YouTube Shorts Studio

**Phase:** 1 (Provider Smoke Test)
**Generated:** 2026-09-12

> **Scope note — read this before comparing against the generic skeleton checklist.**
> The stock Walking Skeleton shape assumes Phase 1 touches routing + database + UI + deployment.
> This project's ROADMAP deliberately does not, and says so: Phase 1's goal is to prove the providers
> work *"before any persistence or interface investment is made."* That is a risk-driven, already-approved
> sequencing choice (PROJECT.md Key Decisions; STATE.md Accumulated Context): prove the riskiest,
> least-controllable dependency — two paid, preview-status third-party AI APIs — before investing in
> anything the team fully controls itself. Routing, database, and UI are consciously deferred, not overlooked.

## Capability Proven End-to-End

An operator can run **one local command** that turns one real AI-generated image into one real AI-generated
video via the two paid providers this entire product depends on, with real per-call cost visible in the
output and any provider error or safety block surfaced as a named, readable reason rather than a silent
hang or an uncaught crash.

The command:

```
node --env-file=.env.local src/scripts/smoke-test.ts
```

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Provider | Google Gemini Developer API — one AI Studio key for LLM, image, and Veo | PROJECT.md Key Decisions: one key and one billing account is the simplest possible budget tracking against a $15 cap. |
| SDK | `@google/genai@^2.22.0` (not raw `fetch`, not `@google/generative-ai`) | CONTEXT.md left this to Claude's discretion; RESEARCH.md resolved it: `@google/generative-ai` reached EOL 2025-11-30, and the current SDK already provides the long-running-operation polling and authenticated file download this phase would otherwise hand-roll. |
| Image model | `gemini-3.1-flash-image` (no `-preview` suffix), fallback `gemini-2.5-flash-image` | Canonical id per the models docs page. RESEARCH.md Pitfall 1 records that Google's Veo docs page shows a `-preview` variant *and* a mismatched response shape — do not copy it. |
| Video model | `veo-3.1-lite-generate-preview`, 9:16, 720p | Verified twice (PROJECT.md §Context, RESEARCH.md); 1080p is 1.6x the cost and locked to 8s. |
| Call surface | `ai.models.generateContent` → `ai.models.generateVideos` → `ai.operations.getVideosOperation` → `ai.files.download` | The only image→video chain Google documents end-to-end. The newer Interactions API is deliberately not adopted for half a chain (COVERAGE.md `gemini-image:interactions-api-surface`). |
| Runtime | Node.js v24.20.0 running `.ts` natively, `--env-file=.env.local` for config | Both verified locally by the researcher. Zero extra runtime dependencies: no `tsx`, no `ts-node`, no `dotenv`. |
| Module system | ESM (`"type": "module"`), relative imports carry the literal `.ts` extension | Node's native type stripping does not rewrite import specifiers. `allowImportingTsExtensions` + `erasableSyntaxOnly` in `tsconfig.json` keep the editor and the runtime in agreement. |
| Test runner | Node's built-in `node --test` | Zero dependencies. Used only for the pure-logic units (spend ledger, response redaction) — the deterministic pieces whose failure paths cannot be exercised with real paid calls. |
| Secrets | `.env.local` (gitignored from its first commit) + committed `.env.local.example` | Establishes the SECURITY-01 convention from Phase 1 even though it is not formally due until Phase 6 — a key committed once is committed forever. |
| Directory layout | `src/providers/<medium>/<vendor>.ts`, `src/lib/*.ts`, `src/scripts/*.ts`, artifacts under `storage/` | CONTEXT.md Claude's Discretion: the provider integration code is written to survive into Phase 2, not as throwaway. Only the output artifacts and the spend ledger are throwaway. |
| Spend guardrail | Flat JSON ledger at `storage/_smoketest/spend-ledger.json`, hard $3.00 ceiling, checked before every paid call | D-04/D-05. Deliberately minimal throwaway scaffolding that Phase 5's BUDGET-01..05 system absorbs or replaces. |
| Output segregation | `storage/_smoketest/`, never `storage/stories/<id>/` | D-06. Keeps Phase 3's persistence and library work from ever mistaking a throwaway test asset for a real story. |

## Stack Touched in Phase 1

- [x] **Project scaffold** — `package.json`, `tsconfig.json`, `.gitignore`, `.env.local.example`, and `node --test` as the test runner. Minimal and real, **not** a full Next.js app: `create-next-app` belongs to Phase 2 (STARTUP-01), and the throwaway CLI script does not need it.
- [ ] **Routing** — *explicitly not touched.* There is no HTTP surface in Phase 1. The Next.js App Router arrives in Phase 2 with STARTUP-01. CONTEXT.md offered an "unlisted API route" alternative to the CLI script; the CLI script was chosen, so no access-control surface exists to weaken.
- [ ] **Database** — *explicitly not touched.* SQLite via Prisma arrives in Phase 3 (PERSIST-01). The only durable state in Phase 1 is one flat JSON ledger file.
- [ ] **UI** — *explicitly not touched.* The wife-facing interface arrives in Phase 4 (UI-01). Phase 1's entire interface is stdout, which is exactly what ROADMAP SC-3 asks for ("printed or logged").
- [x] **"Deployment"** — reinterpreted for a local desktop tool: a single documented local run command, `node --env-file=.env.local src/scripts/smoke-test.ts`, that exercises the full provider chain. There is no deployed environment; PROJECT.md rules out cloud hosting entirely.

## Out of Scope (Deferred to Later Slices)

Consciously deferred in Phase 1 — this list exists so later phases do not re-litigate the minimalism:

- Next.js App Router, `localhost:3000`, and any HTTP route — Phase 2 (STARTUP-01)
- The Story Director LLM, Character Bible, Style Bible, scene breakdown — Phase 2 (STORY-01..05, SCENE-01/02)
- SQLite, Prisma, and any schema at all — Phase 3 (PERSIST-01)
- Structural uniqueness checking — Phase 3 (UNIQUE-01..03)
- Every wife-facing screen, the image-approval gate, per-scene retry, the story library — Phase 4
- The real `MONTHLY_BUDGET_USD` budget system, per-category spend display, retry-aware budget checks, per-scene retry caps — Phase 5 (BUDGET-01..05). The Phase 1 ledger is a $3.00 dev ceiling, not an early implementation of that system.
- The full six-style preset configuration system — Phase 2. Phase 1 hardcodes "Soft hand-painted 2D" for one probe (D-02).
- MP4 dimension/duration validation beyond container and size checks — Phase 6 (OUTPUT-02)
- Graceful missing-key startup behaviour, plain-language error surfacing to a non-technical user — Phase 6 (STARTUP-02, RELIABILITY-01)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering the architectural
decisions above (mirrors `.planning/ROADMAP.md`):

- **Phase 2 — Core Generation Pipeline:** a typed idea flows through the Story Director to a full set of local scene images and video clips for one story. Reuses `src/providers/image/gemini-image.ts` and `src/providers/video/veo.ts` unchanged.
- **Phase 3 — Persistence & Structural Uniqueness:** stories, scenes, and generation records survive a restart; structurally-similar stories are rejected and regenerated before reaching review.
- **Phase 4 — Wife-Facing Review & Approval Flow:** the non-technical user completes create → review → approve → generate → find-output using only plain-language UI.
- **Phase 5 — Budget & Retry Safeguards:** the real monthly budget check that no retry can bypass; absorbs or replaces this phase's throwaway ledger.
- **Phase 6 — Reliability, Secrets Hygiene & Output Correctness:** fails safely and honestly at every edge instead of corrupting state or leaking secrets.

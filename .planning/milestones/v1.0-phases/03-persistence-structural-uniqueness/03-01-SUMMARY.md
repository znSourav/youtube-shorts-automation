---
phase: 03-persistence-structural-uniqueness
plan: 01
subsystem: database
tags: [prisma, sqlite, better-sqlite3, persistence, uniqueness-fingerprint]

# Dependency graph
requires:
  - phase: 02-core-generation-pipeline
    provides: "runStoryDirector, StoryDirectorOutputSchema, storage-paths.ts path builders, check-boundaries.ts's existing invariant structure, the Server Action plain-language-error convention"
provides:
  - "Story/Scene/GenerationRecord Prisma schema + committed migration, the on-disk contract plans 03-02/03-03 and Phases 4-6 read"
  - "src/lib/db.ts PrismaClient singleton over the better-sqlite3 driver adapter"
  - "src/core/persistence/story-repository.ts -- the sole Prisma consumer Server Actions may import"
  - "src/core/uniqueness/fingerprint.ts -- StructuralFingerprint type, FINGERPRINT_INSTRUCTION, fingerprintFromStoryOutput"
  - "D-01's three structural fingerprint fields riding the existing Story Director schema at zero extra LLM cost"
  - "Server-side story id generation (generateStoryId), browser no longer invents its own"
  - "check-boundaries.ts invariants 1 (widened)/3/4 -- structural Prisma-boundary enforcement"
affects: [03-02-uniqueness-gate, 03-03-generation-records, 03-04-real-proof-run, phase-04-story-library]

# Actuals (#2632)
actuals:
  tokens: 13500
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: ["prisma@7.10.0", "@prisma/client@7.10.0", "@prisma/adapter-better-sqlite3@7.10.0", "better-sqlite3@12.11.1"]
  patterns:
    - "PrismaClient singleton cached on globalThis outside production (mirrors spend-ledger.ts's module-level-state shape)"
    - "Injectable trailing client parameter (client = prisma) on every repository function, same convention as spend-ledger.ts's path=LEDGER_PATH"
    - "Structural fingerprint fields ride the existing paid LLM call instead of a second extraction call"
    - "check-boundaries.ts invariant pattern extended (offenders array + OK/FAILED block) rather than replaced"

key-files:
  created:
    - prisma.config.ts
    - prisma/schema.prisma
    - prisma/migrations/20260913102648_init/migration.sql
    - src/lib/db.ts
    - src/lib/db.test.ts
    - src/core/uniqueness/fingerprint.ts
    - src/core/story/story-id.ts
    - src/core/persistence/story-repository.ts
    - src/scripts/persistence-probe.ts
    - src/types/better-sqlite3.d.ts
  modified:
    - package.json
    - next.config.ts
    - .gitignore
    - .env.local.example
    - src/core/story/schema.ts
    - src/core/story/director.ts
    - src/app/actions/create-story.ts
    - src/app/page.tsx
    - src/scripts/story-probe.ts
    - src/scripts/check-boundaries.ts

key-decisions:
  - "Task 2's tracer-gate human-check (live browser click-through) was WAIVED by the user, who chose to preserve the $0.0630 dev-ceiling headroom for plan 03-04's separately-budgeted real proof run instead of spending ~$0.05 on this click-through -- substituted with a code-review of the actual committed diff (see Deviations)."
  - "db.test.ts applies the committed migration.sql directly via a raw better-sqlite3 connection rather than shelling out to the Prisma CLI's migrate-deploy command -- faster per test run and exercises the exact SQL this project ships, at the cost of a small ambient .d.ts (see Deviations)."
  - "check-boundaries.ts's walk() now excludes src/generated/ entirely -- Prisma's own generated client type-declares $queryRawUnsafe/$executeRawUnsafe as part of its API surface, which is not the same as application code calling them."

patterns-established:
  - "Prisma boundary invariants (client-bundle ban, actions-must-go-through-repository, no-raw-SQL) live in check-boundaries.ts alongside the existing provider-import invariants, following the same offenders-array-plus-OK/FAILED-block shape."
  - "Every new repository/service module in src/core/ takes an optional trailing client/path parameter defaulting to the real singleton, enabling temp-file/temp-path test isolation without touching production code."

requirements-completed: [PERSIST-01]

coverage:
  - id: D1
    description: "A story written by one node process survives a real restart and is read back intact -- title, scenes, and all three fingerprint columns -- by a genuinely separate node process (PERSIST-01's mechanical proof)"
    requirement: "PERSIST-01"
    verification:
      - kind: integration
        ref: "src/lib/db.test.ts#a story written by one client is readable, with fingerprint columns intact, by a SECOND independently constructed client against the same file (PERSIST-01)"
        status: pass
      - kind: manual_procedural
        ref: "node --env-file=.env.local src/scripts/persistence-probe.ts --write (process 1) then --read (process 2, separate Bash/OS invocation)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Prisma + SQLite installed and pinned exactly to 7.10.0 (never latest, which resolves to an 8.0.0-rc.* release candidate), with a postinstall self-heal for fresh clones"
    verification:
      - kind: other
        ref: "npx prisma -v reports 7.10.0 for both prisma and @prisma/client; automated pin-check script prints PINS OK"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-01's three structural fingerprint fields (protagonistWant/centralObstacle/endingShape) are non-nullable Story columns, produced by the existing Story Director call at zero extra LLM cost, always written in English per the narrow do-not-translate exception"
    verification:
      - kind: unit
        ref: "prisma/schema.prisma -- required, non-nullable String columns; src/core/story/director.ts buildStorySchema required array"
        status: pass
    human_judgment: true
    rationale: "Whether a REAL Story Director response actually produces abstracted, noun-free, English-only fingerprint text (as opposed to merely satisfying the schema's required-string constraint) can only be judged against a real LLM call -- this plan makes zero paid calls, so that judgment is deferred to plan 03-04's real proof run."
  - id: D4
    description: "Story id generated server-side by createStoryAction and returned to the browser; page.tsx no longer invents its own id"
    verification:
      - kind: unit
        ref: "grep confirms no generateStoryId definition remains in src/app/page.tsx; createStoryAction returns storyId"
        status: pass
    human_judgment: false
  - id: D5
    description: "Prisma cannot reach the browser bundle, cannot be reached from a Server Action except through the repository, and cannot use raw SQL -- each asserted structurally"
    verification:
      - kind: integration
        ref: "node src/scripts/check-boundaries.ts (4/4 OK lines); negative test confirmed non-zero exit when a forbidden import was temporarily added to page.tsx (invariant 1) and create-story.ts (invariant 3), then reverted"
        status: pass
    human_judgment: false
  - id: D6
    description: "The persistence work is invisible to the wife -- no story id, database detail, or file path ever renders on the review screen"
    verification: []
    human_judgment: true
    rationale: "The plan's own tracer-gate <human-check> for this was WAIVED by the user (budget-preservation decision, see Deviations) and substituted with a code-review of the actual diff rather than a live browser click-through. The diff shows the id flows through React state exactly as before (previously client-generated, now server-generated) and no JSX rendering code was touched; StoryReview.tsx (the actual rendering component) isn't part of this diff. Flagged human_judgment: true because the live visual check was never actually performed -- verify-work should confirm this at end-of-phase once a real story is created for other reasons."

duration: 55min
completed: 2026-09-13
status: complete
---

# Phase 3 Plan 01: Persistence & Structural Uniqueness Tracer Summary

**Prisma 7.10.0 + better-sqlite3 driver-adapter persistence, proven with a genuine two-process restart, plus D-01's zero-extra-cost structural fingerprint fields riding the existing Story Director call.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3 (1 checkpoint, 1 tracer, 1 hardening)
- **Files created:** 10
- **Files modified:** 10
- **Commits:** 2 code commits (`cac7103`, `3525edf`)

## Accomplishments

- Installed and exact-pinned `prisma`, `@prisma/client`, `@prisma/adapter-better-sqlite3` to `7.10.0` (never `latest`, which currently resolves to an `8.0.0-rc.14` release candidate) plus `better-sqlite3@^12.6.0` (resolved `12.11.1`); added a `postinstall: prisma generate` script so a fresh clone self-heals (STARTUP-01 not regressed)
- Wrote `prisma/schema.prisma` (Story/Scene/GenerationRecord models, three enums) and `prisma.config.ts` (Prisma 7's required config-file location for `datasource.url`); ran the initial migration, committed to `prisma/migrations/`
- Built `src/lib/db.ts` — a `PrismaClient` singleton over the `better-sqlite3` driver adapter, `globalThis`-cached outside production, server-only
- Built `src/core/uniqueness/fingerprint.ts` — D-01's three abstracted structural elements (`protagonistWant`/`centralObstacle`/`endingShape`), always written in English regardless of the story's own script, riding the existing Story Director call at **zero extra LLM cost**
- Built `src/core/persistence/story-repository.ts` — the sole module outside `src/lib/db.ts`/`src/scripts/`/tests permitted to touch Prisma; `saveStoryWithScenes` writes Story+Scenes in one transaction and refuses a story id that can't produce a valid `storage/stories/<id>/` path
- `createStoryAction` now generates the story id server-side and persists via the repository; `page.tsx` no longer invents its own id (D-05's history starts empty — nothing was seeded from Phase 2's dev-test stories)
- **Proved PERSIST-01 for real**: `node ... persistence-probe.ts --write` in one OS process, then `node ... persistence-probe.ts --read` in a genuinely separate OS process (two distinct Bash tool invocations), read back 3 scenes with all three fingerprint columns intact
- Extended `check-boundaries.ts` with three new/widened structural invariants (client-bundle Prisma ban, actions-must-go-through-repository, no-raw-SQL-escape-hatch) and `src/lib/db.test.ts`'s 5 integration tests (two-client restart, accepted/exhausted-shown filtering, duplicate-scene-number database-level rejection, video-status DB-half survival, invalid-id refusal)
- Zero paid provider calls dispatched anywhere in this plan; ledger confirmed unchanged at **$2.9370 of $3.00** before and after

## Task Commits

1. **Task 1: Confirm the three Prisma-scoped packages before installing them (T-03-SC)** — checkpoint only, no code; approval recorded below
2. **Task 2: End-to-end "a generated story survives a real restart"** — `cac7103` (feat)
3. **Task 3: Harden the slice — restart-survival integration test and the Prisma boundary gates** — `3525edf` (test)

**Plan metadata:** committed alongside this SUMMARY

## Files Created/Modified

- `prisma.config.ts` — Prisma 7 config, `datasource.url` fallback `file:./prisma/dev.db`
- `prisma/schema.prisma` — `Story`/`Scene`/`GenerationRecord` models, `UniquenessStatus`/`SceneAssetStatus`/`GenerationType` enums
- `prisma/migrations/20260913102648_init/migration.sql` — committed migration history
- `src/lib/db.ts` — `PrismaClient` singleton, `DEFAULT_DATABASE_URL`, `createPrismaClient(url?)`
- `src/lib/db.test.ts` — 5 integration tests against a `mkdtempSync` temp SQLite file
- `src/core/uniqueness/fingerprint.ts` — `StructuralFingerprint`, `FINGERPRINT_INSTRUCTION`, `fingerprintFromStoryOutput`
- `src/core/story/story-id.ts` — `generateStoryId()`, shared by the Server Action and both CLI probes
- `src/core/persistence/story-repository.ts` — `saveStoryWithScenes`, `findStoryWithScenes`, `listAcceptedFingerprints`, `markUniquenessStatus`, re-exports `UniquenessStatus`
- `src/scripts/persistence-probe.ts` — `--write`/`--read`/`--real` CLI probe (`--real` not run by this plan)
- `src/types/better-sqlite3.d.ts` — minimal ambient declaration (see Deviations)
- `package.json` — pinned dependencies, `postinstall` script, `test:lib` gains `db.test.ts`
- `next.config.ts` — `serverExternalPackages` for the native SQLite binding
- `.gitignore` — excludes `src/generated/` and `prisma/dev.db*`, keeps `prisma/migrations/` tracked
- `.env.local.example` — adds `DATABASE_URL`
- `src/core/story/schema.ts`, `src/core/story/director.ts` — three new fingerprint fields (schema + `buildStorySchema` + `buildStoryPrompt`)
- `src/app/actions/create-story.ts`, `src/app/page.tsx` — server-side id generation + persistence, browser id-generator removed
- `src/scripts/story-probe.ts` — imports the shared `generateStoryId` instead of a local copy
- `src/scripts/check-boundaries.ts` — widened invariant 1, new invariants 3 and 4

## Decisions Made

- **Task 1 approval (verbatim, from the dispatch context — given before this run started, not re-prompted):** "The human independently confirmed all four packages on npm (prisma@7.10.0, @prisma/client@7.10.0, @prisma/adapter-better-sqlite3@7.10.0 all resolve to github.com/prisma/prisma.git; better-sqlite3 resolves to github.com/WiseLibs/better-sqlite3.git — verified via `npm view <pkg> repository.url` both by research and independently by the orchestrator), and explicitly approved proceeding with the pinned install (prisma@7.10.0, @prisma/client@7.10.0, @prisma/adapter-better-sqlite3@7.10.0, better-sqlite3@^12.6.0 — exact pins, no `latest`/`^` range on the three Prisma-scoped packages)."
- **Task 2 tracer-gate human-check waiver (verbatim from the coordinator):** "Task 2's human-check is waived. The user chose to preserve the remaining $0.0630 dev-ceiling headroom for plan 03-04's own separately-budgeted real uniqueness-collision proof run, rather than spend ~$0.05 on this click-through. Substituted evidence in place of the live click-through: I (the orchestrator) read the actual `git show cac7103 -- src/app/page.tsx src/app/actions/create-story.ts` diff myself. Findings: `createStoryAction` now returns `storyId` as a data field on the success result; `page.tsx` sets it into `setStoryId(result.storyId)` -- this is the exact same React-state-only usage pattern that existed before this plan (previously client-generated via `Date.now()`, now server-generated), per D-03's original comment 'never shown to the wife.' No JSX rendering code was touched by this commit, and `StoryReview.tsx` (the component that actually renders review content) isn't even part of this diff. The id was never rendered on screen before Phase 3 and nothing in this change alters that code path." Task 2 is marked complete on this basis; the live browser check is deferred to end-of-phase verification (see coverage D6).
- `db.test.ts` applies the committed `migration.sql` directly through a raw `better-sqlite3` connection (not the Prisma CLI's `migrate deploy`) — faster per test run (no CLI subprocess spin-up) and exercises the exact SQL this project ships. This required a minimal local ambient `.d.ts` declaration for `better-sqlite3`'s default export rather than installing `@types/better-sqlite3` — a new package-manager install mid-task is excluded from auto-fix under this project's deviation rules and would need its own legitimacy checkpoint, so the ambient declaration avoids that entirely while fully typing the one call shape this file needs.
- `next.config.ts`'s `serverExternalPackages` alone was sufficient to make `npm run build` pass with the native SQLite binding present — the `tsconfig.json` `exclude` lever the plan flagged as a fallback was **not** needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `check-boundaries.ts`'s new invariant 4 initially flagged Prisma's own generated client as an offender**
- **Found during:** Task 3, first run of `node src/scripts/check-boundaries.ts` after adding invariant 4
- **Issue:** The walk() helper scanned `src/generated/prisma/` along with application code. Prisma's generated client type-*declares* `$queryRawUnsafe`/`$executeRawUnsafe` as part of its own API surface (that's the whole point of the method existing), so the substring scan flagged `src/generated/prisma/internal/class.ts` and `prismaNamespace.ts` as false-positive offenders — the check was testing whether the method NAME appears in a file, not whether application code CALLS it.
- **Fix:** Excluded the `generated` directory entirely from `walk()`'s traversal — it is gitignored, regenerated vendor output, not application code this structural gate is meant to review.
- **Files modified:** `src/scripts/check-boundaries.ts`
- **Verification:** Re-ran `node src/scripts/check-boundaries.ts` — all 4 invariants print `OK:`, no false positives; negative-test confirmed the check still correctly fails when a REAL offending import is added to application code.
- **Committed in:** `3525edf` (Task 3 commit)

**2. [Rule 3 - Blocking] `db.test.ts` failed typecheck: missing type declarations for `better-sqlite3`**
- **Found during:** Task 3, `npm run typecheck` after writing `db.test.ts`
- **Issue:** `import Database from "better-sqlite3"` has no bundled TypeScript types and no `@types/better-sqlite3` package was installed, so `tsc --noEmit` failed with `TS7016: Could not find a declaration file for module 'better-sqlite3'`.
- **Fix:** Rather than running `npm install --save-dev @types/better-sqlite3` (a new package-manager install, which this project's deviation rules explicitly exclude from auto-fix — it would need its own legitimacy checkpoint per Rule 3's package-install carve-out), added a minimal local ambient declaration (`src/types/better-sqlite3.d.ts`) covering only the one call shape this test file uses (constructor + `.exec()` + `.close()`).
- **Files modified:** `src/types/better-sqlite3.d.ts` (new)
- **Verification:** `npm run typecheck` passes clean with zero `error TS` lines.
- **Committed in:** `3525edf` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking). **Impact on plan:** Both fixes were necessary for correctness of the new structural gate and for the test suite to typecheck; neither introduced scope creep or a new third-party dependency.

## Issues Encountered

None beyond the two deviations above and the Task 2 tracer-gate checkpoint (resolved by the coordinator's waiver — see Decisions Made and coverage item D6).

## User Setup Required

None — no external service configuration required. `DATABASE_URL="file:./prisma/dev.db"` was added to both `.env.local` and `.env.local.example`; no action needed from the user since `.env.local` already existed with `GEMINI_API_KEY` and now also carries the new variable.

## Next Phase Readiness

- The persistence architecture is proven end to end and committed: Server Action → repository → Prisma → SQLite file → a genuinely separate process reads it back intact.
- Plan 03-02 (uniqueness gate) can build directly on `src/core/uniqueness/fingerprint.ts` and `story-repository.ts`'s `listAcceptedFingerprints`/`markUniquenessStatus` without further schema changes.
- Plan 03-03 (scene/cost records) can build on the `GenerationRecord` model, which exists in the schema but has no writer yet (deliberately — Task 2 wrote no `imagePath`/`videoPath`/`GenerationRecord` rows, all staying null/unused until 03-03).
- Plan 03-04's real end-to-end proof run has its full $0.0630 headroom intact — nothing in this plan spent any of it, and the `--real` mode of `persistence-probe.ts` is written and ready for that plan to invoke.
- **Outstanding:** coverage item D6 (the live "persistence work is invisible to the wife" browser check) was waived here on budget-preservation grounds and substituted with a code-review; a real end-to-end run (whether in 03-04 or at `/gsd-verify-work` time) should include a quick visual confirmation of the review screen once a real story is generated for other reasons, at no additional cost.

---
*Phase: 03-persistence-structural-uniqueness*
*Completed: 2026-09-13*

## Self-Check: PASSED

- `prisma.config.ts` — FOUND
- `prisma/schema.prisma` — FOUND
- `prisma/migrations/20260913102648_init/migration.sql` — FOUND
- `src/lib/db.ts` — FOUND
- `src/lib/db.test.ts` — FOUND
- `src/core/uniqueness/fingerprint.ts` — FOUND
- `src/core/story/story-id.ts` — FOUND
- `src/core/persistence/story-repository.ts` — FOUND
- `src/scripts/persistence-probe.ts` — FOUND
- `src/types/better-sqlite3.d.ts` — FOUND
- Commit `cac7103` — FOUND in `git log --oneline --all`
- Commit `3525edf` — FOUND in `git log --oneline --all`
- All plan-level `<verification>` items re-run and passing: `npx prisma -v` (7.10.0/7.10.0), `npm run typecheck` (clean), `npm run build` (clean, no tsconfig exclusion needed), committed migration present + `prisma/dev.db` gitignored, two-process probe (write/read across separate OS processes) confirmed, `npm run test:lib` (78/78 passing), `node src/scripts/check-boundaries.ts` (4/4 OK lines), ledger unchanged at $2.9370

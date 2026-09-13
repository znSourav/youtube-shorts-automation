# Phase 3: Persistence & Structural Uniqueness - Research

**Researched:** 2026-09-13
**Domain:** Prisma ORM + SQLite persistence on Windows/Next.js 16, deterministic + LLM-assisted structural-similarity detection
**Confidence:** HIGH (Prisma+SQLite setup — verified via real local execution on this exact machine), MEDIUM (uniqueness architecture — grounded in in-repo schema + locked decisions, no real paid proof-run performed this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Uniqueness sensitivity (UNIQUE-01/UNIQUE-03)**
- **D-01:** Structural similarity is judged on exactly three elements: (a) what the protagonist wants/lacks, (b) the central obstacle or mechanism that resolves it, (c) how it ends emotionally. Surface details (species, setting, specific object, character names) never factor into the comparison.
- **D-02:** A story is rejected as too-similar only when **all three** of D-01's elements align with a past story. A partial match (2 of 3) passes.

**Regeneration visibility & exhaustion (UNIQUE-02)**
- **D-03:** While a collision triggers automatic regeneration, she sees a brief plain-language status message (e.g. "Making sure this is original... trying again") — never the rejected story's actual text, never which past story it collided with or why. She only ever reviews the final accepted story.
- **D-04:** If the configurable maximum regeneration attempts are exhausted and every candidate still collided, the **last** generated attempt is shown to her with a plain-language warning. Never a silent accept, never a silent hard block, never a forced refusal.
- **Claude's/planner's discretion:** exact numeric retry cap — pick a sensible default consistent with this project's existing retry patterns (e.g. the 3-attempt pattern already used for content-safety-block retries in Phase 2) unless research surfaces a reason to differ.

**Dev-test story handling**
- **D-05:** Phase 2's three real dev-test story folders (`storage/stories/story-*-*/`) do **NOT** seed the new database as "already accepted." The uniqueness system starts clean with an empty history. Reversible. These folders stay on disk as harmless orphans, never surfaced in a future Story Library UI (which reads from the database, not the filesystem).

### Claude's Discretion
- VIDEO-03 (surviving a browser/app restart without losing track of in-progress video jobs) is a soft/optional criterion — attempt it if it falls out naturally from the persistence work, document the limitation if it doesn't fit in available time.
- Exact Prisma schema shape (table/column design) is a research/planning concern.
- The deterministic pre-filter's specific mechanics are left to research/planning, informed by D-01/D-02.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. No scope-creep topics came up.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UNIQUE-01 | New story checked for structural similarity against every previously accepted story before review | §Architecture Patterns "Uniqueness Pipeline"; §Code Examples deterministic pre-filter + targeted LLM call |
| UNIQUE-02 | Structurally-similar candidate auto-rejected and regenerated, capped at configurable max attempts | §Architecture Patterns "Regeneration Loop"; default cap recommendation in §Common Pitfalls |
| UNIQUE-03 | Genuinely different stories sharing generic elements are not falsely rejected | §Architecture Patterns "Structural Fingerprint Extraction" — abstracted, noun-free fingerprint fields keep comparison off surface nouns |
| PERSIST-01 | Every story/scene/generation record persists in SQLite and survives restart, usable by uniqueness system | §Standard Stack, §Architecture Patterns "Prisma Schema", verified via real local migrate+query round-trip |
| IMAGE-01 | Scene image generation triggerable for approved story, images visible, paths recorded in DB | §Architecture Patterns "Integration into generate-images.ts" |
| IMAGE-03 | Every image generation call recorded with estimated (and actual, where available) cost | §Architecture Patterns "GenerationRecord table"; §Architectural Responsibility Map (dual-write clarification vs. spend-ledger.ts) |
| VIDEO-03 (soft) | Video job tracking survives browser/app restart | §Open Questions "VIDEO-03 feasibility"; recommendation to document as partial/limited if time-constrained |
</phase_requirements>

## Summary

This phase adds Prisma + SQLite persistence to a codebase that currently keeps all state in React
component state (`src/app/page.tsx`), and layers a three-element structural-similarity uniqueness
gate in front of story review. Both halves were investigated **by actually running the real
tooling on this exact Windows/Node v24.20.0 machine**, not just reading docs — because this machine
has a documented history of blocking native binaries (Turbopack's SWC binary is already
Application-Control-blocked, forcing `--webpack` fallback), so whether Prisma's native pieces
(the CLI's `schema-engine-windows.exe`, and `better-sqlite3`'s native `.node` binding) would hit
the same wall was a real open risk, not a formality.

**They do not.** A full real local probe — `npm install`, `prisma migrate dev`, `prisma generate`,
and a live create/read round-trip through `@prisma/adapter-better-sqlite3` — completed successfully
end to end on this machine with zero Application Control interference. This is the single most
important finding of this research: the "native binary" risk that broke Turbopack does **not**
recur for Prisma's SQLite path on this machine, refuting rather than confirming the initial
concern (see §Sources, "Local verification probe").

The second major finding is a **critical version-pinning risk**: `npm view prisma version`
currently resolves to `8.0.0-rc.14` (a release candidate carrying the `latest` dist-tag), while
`@prisma/client`'s `latest` tag is the stable `7.10.0`. Installing both packages with an
unpinned `^`/`latest` spec would silently install a mismatched CLI/runtime major-version pair.
**Every install command in this document pins both packages to the exact same `7.10.0`.**

The third finding shapes the uniqueness design: `src/core/story/schema.ts`'s existing
`StoryDirectorOutputSchema` (`premise`, `theme`, `emotional_arc`, `ending`) is **not** a clean
match for D-01's three required elements (protagonist want/lack, central obstacle/mechanism,
emotional ending shape) — it's adjacent but not 1:1, and reusing it as-is would require a second
LLM call just to re-interpret prose into the three elements. The cheaper, zero-extra-cost path is
to add three new, explicitly abstracted fields directly to the **same** Story Director response
schema (no new LLM call — this rides the story-generation call the app already pays for), then
run a hand-rolled deterministic token-similarity pre-filter over those three short fields, and
reserve a targeted LLM comparison call for the rare case where a candidate scores
borderline-high on all three deterministic scores against some past story.

**Primary recommendation:** Add `protagonist_want`, `central_obstacle`, `ending_shape` to the
Story Director's own response schema (zero extra LLM cost); persist Story/Scene/GenerationRecord
via Prisma 7.10.0 + `@prisma/adapter-better-sqlite3` + `better-sqlite3` (all version-pinned exactly
as verified in this document); gate the uniqueness comparison's LLM tie-breaker through the
existing `checkCeiling`/`recordSpend` pattern unchanged; and treat `DEV_CEILING_USD`'s ~$0.06
remaining headroom as a hard blocker on any real paid uniqueness proof-run until the user
consciously raises it.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Story/Scene/GenerationRecord persistence | Database / Storage | API / Backend (Prisma Client, server-only) | SQLite file is the source of truth; only server-side code (Server Actions, `src/core/`) may touch it |
| Structural fingerprint extraction | API / Backend | — | Rides the existing Story Director LLM call (`src/core/story/director.ts`) — no new tier, no new call site |
| Deterministic similarity pre-filter | API / Backend | — | Pure in-process function over already-persisted fingerprint text; no I/O beyond the DB read of past stories |
| Targeted LLM tie-breaker comparison | API / Backend | Database / Storage (reads past fingerprints) | Ceiling-gated paid call, same shape as `runStoryDirector` |
| Cost/spend accounting | API / Backend | Database / Storage (new GenerationRecord rows) | **Dual-write, not a replacement**: `spend-ledger.ts`'s file-based `checkCeiling`/`recordSpend` remains the enforcement GATE (unchanged, Phase 5 owns the real budget system); a new Prisma `GenerationRecord` row is written *in addition*, purely to satisfy IMAGE-03/PERSIST-01's persistence requirement. Do not let this phase merge or replace the ledger gate |
| Video job status (VIDEO-03, soft) | Database / Storage | Browser / Client (resume affordance) | DB-side status tracking falls out of the Scene table naturally; browser-side "resume after restart" needs a new minimal read-path this phase doesn't otherwise need — see Open Questions |
| Client/server boundary enforcement | Browser / Client (negative constraint) | — | `check-boundaries.ts` must gain a new invariant: no `"use client"` file may import the Prisma client or its generated output, mirroring the existing provider-import ban |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `prisma` | `7.10.0` **(exact pin, not `latest`)** | Migration CLI, schema tooling | Locked in PROJECT.md Key Decisions; `latest` dist-tag is `8.0.0-rc.14` (a release candidate) — 7.10.0 is the actual current stable release `[VERIFIED: npm registry `npm view prisma@7.10.0 version` — see Sources]` |
| `@prisma/client` | `7.10.0` **(exact pin, must match `prisma`'s version)** | Generated type-safe query client | Same major/minor as the CLI is required; a mismatched pair (e.g. CLI 8.x + client 7.x) is exactly the failure mode `npm view prisma version` vs `npm view @prisma/client version` surfaced in this session `[VERIFIED: npm registry, confirmed both resolve to 7.10.0 with matching `engines`]` |
| `@prisma/adapter-better-sqlite3` | `7.10.0` (match Prisma's version) | Driver adapter — **required**, not optional, in Prisma 7 | Prisma 7 removed the bundled Rust query-engine binary in favor of a WASM query compiler that talks to the database only through an explicit driver adapter; there is no "just use SQLite" path without one `[VERIFIED: local probe — `new PrismaClient({})` with no adapter is not a supported call shape in 7.10.0; confirmed via CITED docs below and reproduced locally]` `[CITED: prisma.io/docs/guides/upgrade-prisma-orm/v7]` |
| `better-sqlite3` | `^12.6.0` (peer range required by the adapter above; `12.11.1` resolved in this session) | Synchronous native SQLite driver | Required peer of `@prisma/adapter-better-sqlite3`; synchronous API is a good fit for a single local process with no connection-pool concerns `[VERIFIED: npm registry — `npm view @prisma/adapter-better-sqlite3@7.10.0 dependencies` returned `{"better-sqlite3": "^12.6.0", ...}`]` |

### Supporting

None required. The deterministic uniqueness pre-filter should be **hand-rolled** (see Don't
Hand-Roll) — a normalized-token Jaccard similarity function is ~20 lines and matches this
codebase's existing zero-dependency convention (`spend-ledger.ts`, `log-response.ts` use only
`node:fs`).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@prisma/adapter-better-sqlite3` | `@prisma/adapter-libsql` (Turso's libSQL client) | Only needed for Bun or remote/embedded-replica SQLite; this project is plain Node.js + a local file, so `better-sqlite3` is the simpler, more direct choice `[CITED: prisma.io/docs SQLite database connector]` |
| Hand-rolled Jaccard similarity | `natural` or `string-similarity` npm packages | Unnecessary dependency for three short, structured text fields; the existing codebase has zero NLP dependencies and this doesn't need one either |
| Prisma | Drizzle ORM (brief's own §7 explicitly allows either) | Prisma is already locked in PROJECT.md Key Decisions ("migrations, type-safe client, Prisma Studio") — not reopened by this research |

**Installation** (exact pins — do not use `@latest` for any of these four):
```bash
npm install prisma@7.10.0 @prisma/client@7.10.0 @prisma/adapter-better-sqlite3@7.10.0 better-sqlite3@^12.6.0
```

Add to `package.json` scripts (so a fresh `npm install` self-heals the generated client, matching
STARTUP-01's "one documented command" requirement — untested in this session, standard Prisma
convention `[CITED: prisma.io generator docs]`):
```json
"postinstall": "prisma generate"
```

**Version verification:** confirmed via `npm view prisma@7.10.0 version` / `npm view
@prisma/client@7.10.0 version` — both return `7.10.0`; `engines` for both is
`^20.19 || ^22.12 || >=24.0`, satisfied by this machine's Node v24.20.0
`[VERIFIED: npm registry, commands run this session]`.

## Package Legitimacy Audit

Ran via `gsd_run query package-legitimacy check --ecosystem npm <pkg>` this session.

| Package | Registry | Age of latest publish | Weekly Downloads | Source Repo | Verdict | Disposition |
|---------|----------|------------------------|-------------------|--------------|---------|-------------|
| `prisma` | npm | published 2026-09-12 (1 day before this research) | 12,653,834/wk | github.com/prisma/prisma-cli | SUS (`too-new`) | **Approved, pinned to `7.10.0` not `latest`** — the "too-new" flag is on the very-recent `8.0.0-rc.14` release, not the package's legitimacy; 12.6M weekly downloads and a matching official repo confirm this is the real, canonical package |
| `@prisma/client` | npm | published 2026-08-25 | 12,208,207/wk | github.com/prisma/prisma | SUS (`too-new`) | **Approved, pinned to `7.10.0`** — same reasoning; huge download count, official repo |
| `@prisma/adapter-better-sqlite3` | npm | published 2026-08-25 | 149,275/wk | github.com/prisma/prisma | SUS (`too-new`) | **Approved, pinned to `7.10.0`** — official Prisma monorepo package, lower absolute downloads than the core packages simply because driver adapters are new (Prisma 7 architecture), not because it's illegitimate |
| `better-sqlite3` | npm | published 2026-08-05 | 7,725,408/wk | github.com/WiseLibs/better-sqlite3 | OK | Approved, no flags |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** all three Prisma-scoped packages, but only because their
*latest published version* is recent — cross-checked against download counts, deprecation status,
and matching official GitHub repos, all four are judged genuinely legitimate. The real, actionable
risk this audit surfaces is **version pinning** (see Standard Stack above), not package identity.

**Known transitive vulnerability (informational, no action required this phase):** `npm audit` on
a real local install of `prisma@7.10.0` reports 4 high-severity advisories in `mysql2` (bundled by
`@prisma/config` for its multi-database CLI tooling, unused by this SQLite-only app at runtime) and
`deepmerge-ts` (stack exhaustion on deeply recursive merges). Both are **dev-time-only** transitive
dependencies of the `prisma` CLI package, never bundled into the Next.js app that ships to the
wife's browser or into `@prisma/client`'s runtime surface `[VERIFIED: local `npm audit` output,
this session — see Sources]`. `npm audit fix --force` would downgrade to `prisma@6.19.3`, a
breaking regression away from the intended v7 architecture — not recommended.

## Architecture Patterns

### System Architecture Diagram

```
Browser (page.tsx, "use client")
    │  calls createStoryAction(input)
    ▼
Server Action: createStoryAction  ── "use server"
    │
    ├─▶ runStoryDirector(input)              [src/core/story/director.ts, unchanged call site]
    │       │  checkCeiling → generateStory() → recordSpend
    │       ▼
    │   StoryDirectorOutput (now includes protagonist_want / central_obstacle / ending_shape)
    │
    ▼
runUniquenessCheck(candidate, storyId)        [NEW: src/core/uniqueness/check.ts]
    │
    ├─▶ prisma.story.findMany({ where: { uniquenessStatus: "ACCEPTED" } })   [read past fingerprints]
    │
    ├─▶ deterministicPreFilter(candidate.fingerprint, pastFingerprints)      [pure fn, no I/O, no LLM]
    │       │
    │       ├── 0-1 fields "high similarity" for every past story → PASS, no LLM call
    │       │
    │       └── all 3 fields "borderline+" for some past story → escalate ONE targeted LLM call
    │               │
    │               ▼
    │           compareStructuralSimilarity(candidate, bestMatch)  [NEW, src/providers/llm/gemini.ts]
    │               checkCeiling → generateContent (small JSON schema) → recordSpend
    │               returns { protagonist_match, obstacle_match, ending_match }: booleans
    │
    ├─▶ if all-3-true (deterministic OR LLM-confirmed) → REJECT, retry runStoryDirector
    │       with an "avoid this pattern" instruction, up to MAX_UNIQUENESS_REGENERATION_ATTEMPTS
    │
    └─▶ else → ACCEPT
    │
    ▼
prisma.story.create(...) + prisma.scene.createMany(...) + prisma.generationRecord.create(...)
    │  [PERSIST-01 — survives restart]
    ▼
Return StoryDirectorOutput to browser → StoryReview.tsx renders (screen 2, unchanged)
```

### Recommended Project Structure

```
prisma/
├── schema.prisma          # datasource (no url — moved to prisma.config.ts), models below
└── migrations/            # committed to git (schema history)
prisma.config.ts           # NEW at repo root — datasource.url, migrations.path (Prisma 7 requirement)
src/
├── generated/
│   └── prisma/            # `prisma generate` output — gitignored, regenerated via postinstall
├── lib/
│   ├── db.ts               # NEW — PrismaClient singleton (globalThis pattern), server-only
│   ├── spend-ledger.ts     # UNCHANGED — still the real ceiling gate this phase
│   └── log-response.ts     # UNCHANGED
├── core/
│   ├── story/               # UNCHANGED (director.ts, schema.ts gain 3 new fields)
│   └── uniqueness/          # NEW
│       ├── fingerprint.ts   # types + prompt-instruction text for the 3 new schema fields
│       ├── similarity.ts    # deterministic pre-filter (pure fn, unit-testable, zero deps)
│       └── check.ts         # orchestrates: read past stories → pre-filter → LLM tie-breaker → verdict
├── providers/
│   └── llm/gemini.ts       # gains compareStructuralSimilarity() alongside generateStory()
└── scripts/
    └── check-boundaries.ts # gains invariant 3: no "use client" file imports src/lib/db.ts or @prisma/client
```

### Pattern 1: Prisma Client Singleton (avoid dev hot-reload churn)

**What:** A module-level singleton stored on `globalThis` in development so Next.js's dev-server
module re-evaluation doesn't open a fresh SQLite file handle / client instance on every reload.
**When to use:** Always, for any server-side Prisma access in this codebase.
**Example** (adapted to this repo's conventions — `.ts` extension imports per `allowImportingTsExtensions`, no `enum`/class-heavy patterns to respect `erasableSyntaxOnly`):
```typescript
// src/lib/db.ts — server-only, never imported by a "use client" file
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: InstanceType<typeof PrismaClient> | undefined;
}

function createClient() {
  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" });
  return new PrismaClient({ adapter });
}

export const prisma = globalThis.__prisma ?? createClient();
if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
```
Source pattern confirmed standard practice across multiple current sources `[CITED:
robinwieruch.de/next-prisma-sqlite, dev.to Prisma+Next.js singleton articles — see Sources]`; the
specific adapter wiring (`PrismaBetterSqlite3`) is `[VERIFIED: local probe]` — reproduced and run
successfully this session (see §Sources "Local verification probe" for the exact commands and
real output).

### Pattern 2: Prisma 7 config file (required, not optional)

**What:** `prisma.config.ts` at the repo root now owns the database connection URL; `schema.prisma`'s
`datasource` block no longer accepts a `url` field for `migrate`/`studio` commands.
**When to use:** Required for any `prisma migrate dev`, `prisma studio`, or `prisma db push` invocation in v7.
**Example** — this exact file was written and exercised (`prisma migrate dev` succeeded against it) this session:
```typescript
// prisma.config.ts (repo root)
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: { path: path.join("prisma", "migrations") },
  datasource: { url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" },
});
```
`[VERIFIED: local probe]` — omitting `datasource.url` produces the exact error `"Error: The
datasource.url property is required in your Prisma config file when using prisma migrate dev."`,
reproduced verbatim this session before the fix above resolved it.

### Pattern 3: Prisma schema (stories/scenes/generation records)

Grounded in the original build brief's own §7 Database section (the project's primary spec,
`docs/original-brief.md` lines 185-248) `[CITED: docs/original-brief.md §7]`, narrowed by
CONTEXT.md's D-01/D-02 (fingerprint stores 3 fields, not the brief's fuller 12-field example) and
extended with a `GenerationRecord` shape that satisfies IMAGE-03's cost-tracking requirement:

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "sqlite"
}

enum UniquenessStatus {
  PENDING
  ACCEPTED
  REJECTED_COLLISION
  REJECTED_EXHAUSTED_SHOWN
}

enum SceneAssetStatus {
  WAITING
  READY
  FAILED
}

enum GenerationType {
  STORY
  UNIQUENESS_CHECK
  IMAGE
  VIDEO
}

model Story {
  id                String            @id                     // matches existing storyId format, e.g. "story-<ts>-<rand>"
  title             String
  premise           String
  fullStory         String
  theme             String
  emotionalArc      String
  ending            String
  protagonistWant   String                                     // D-01 element (a) — abstracted, noun-free phrasing
  centralObstacle   String                                     // D-01 element (b)
  endingShape       String                                     // D-01 element (c)
  characterBible    Json
  styleBible        Json
  uniquenessStatus  UniquenessStatus  @default(PENDING)
  regenerationAttempt Int             @default(0)
  createdAt         DateTime          @default(now())
  scenes            Scene[]
  generationRecords GenerationRecord[]
}

model Scene {
  id                     String            @id @default(cuid())
  storyId                String
  story                  Story             @relation(fields: [storyId], references: [id])
  sceneNumber            Int
  storyPurpose           String
  imagePrompt            String
  motionPrompt           String
  durationSeconds        Int?
  imagePath              String?
  imageStatus            SceneAssetStatus  @default(WAITING)
  videoPath              String?
  videoStatus            SceneAssetStatus  @default(WAITING)
  createdAt              DateTime          @default(now())
  generationRecords      GenerationRecord[]

  @@unique([storyId, sceneNumber])
}

model GenerationRecord {
  id             String          @id @default(cuid())
  storyId        String
  story          Story           @relation(fields: [storyId], references: [id])
  sceneId        String?
  scene          Scene?          @relation(fields: [sceneId], references: [id])
  generationType GenerationType
  model          String
  estimatedUsd   Float
  actualUsd      Float?
  billed         Boolean
  ok             Boolean
  message        String
  createdAt      DateTime        @default(now())
}
```

**Enum caveat (`erasableSyntaxOnly` compatibility — verified, not assumed):** this project's
`tsconfig.json` sets `"erasableSyntaxOnly": true`, which rejects non-erasable TypeScript syntax
such as real `enum` declarations anywhere in the type-checked file set. A real risk was that
Prisma's `enum` schema keyword might generate a TypeScript `enum` in the client output, which
would then fail this project's own `tsc --noEmit`. **Verified locally this session that it does
not**: Prisma 7.10.0 generates enums as a `const` object + derived union type
(`export const StoryStatus = { DRAFT: 'DRAFT', ... } as const; export type StoryStatus = ...`),
which is fully erasable-syntax-compliant `[VERIFIED: local probe — exact generated file content
captured in Sources]`. No workaround needed.

**SQLite enum storage caveat:** SQLite has no native enum type; Prisma emits the column as plain
`TEXT` with a client-side default, with **no** database-level `CHECK` constraint enforcing the
allowed values `[VERIFIED: local probe — real generated `migration.sql` captured in Sources]`.
Validation of enum values is therefore Prisma-client-only, not DB-enforced — acceptable for a
single-process app where Prisma Client is the only writer, but worth knowing if any future direct
SQL/Prisma Studio edit could write an invalid string into that column.

### Pattern 4: Structural fingerprint extraction — zero extra LLM cost

**What:** Extend `StoryDirectorOutputSchema` (`src/core/story/schema.ts`) and `buildStorySchema`
(`src/core/story/director.ts`) with three new required string fields, generated by the **same**
Story Director call the app already pays for — no second LLM call for extraction.
**Why not reuse `premise`/`theme`/`ending`:** verified against real captured output in
`02-PROOF-RUN.md` §3 — e.g. `ending`: "শিশুটিকে তার কাগজের নৌকা ফিরিয়ে দিয়ে করিম এক অদ্ভুত
আত্মতৃপ্তি নিয়ে নিজের নৌকায় ফিরে যান" (returning the boat, Korim feels a strange contentment) —
this is close to "ending shape" but still carries surface nouns (boat, Korim) and isn't phrased for
cross-story structural comparison. `premise` similarly mixes protagonist-want with setting nouns.
Repurposing these fields would require a *second* LLM call just to abstract them — defeating the
zero-extra-cost goal `[VERIFIED: `docs/../02-PROOF-RUN.md` lines 136-139, quoted above verbatim; and `src/core/story/schema.ts` lines 27-35, confirmed no existing field maps 1:1 to D-01's three elements]`.
**Recommendation:** add explicit prompt instructions to `buildStoryPrompt` requiring these three
new fields be written in *abstracted* language (no character names, no species, no setting nouns),
directly enabling UNIQUE-03's "generic surface overlap must not falsely collide" requirement:

```typescript
// src/core/story/schema.ts — additions to StoryDirectorOutputSchema.story
protagonist_want: z.string(),   // e.g. "a character seeks to return a found object to its rightful owner"
central_obstacle: z.string(),   // e.g. "the owner's identity is unknown and must be discovered"
ending_shape: z.string(),       // e.g. "quiet personal satisfaction from an act of honesty"
```

### Pattern 5: Deterministic pre-filter (no vector database, no new dependency)

**What:** Normalized-token Jaccard similarity over each of the three fingerprint fields
independently. Cheap, in-process, testable with zero I/O.
```typescript
// src/core/uniqueness/similarity.ts
const STOPWORDS = new Set(["a", "an", "the", "to", "of", "and", "or", "is", "their", "its"]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((tok) => tok.length > 0 && !STOPWORDS.has(tok)),
  );
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = [...setA].filter((tok) => setB.has(tok)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}
```
**Thresholds (Claude's/planner's discretion — no external standard applies to this exact
use case):** recommend two bands — `>= 0.75` per-field = "obvious match, skip the LLM call
entirely and reject directly" (matches D-02's "all three align" wording literally, since exact/
near-exact structural phrasing between two independently-generated stories is already strong
signal); `0.4-0.75` per field = "borderline, escalate to the targeted LLM call" only when **all
three** fields land in this band or above for the *same* past story; `< 0.4` on any field = pass,
no LLM call. This keeps the common case (genuinely different stories) at zero LLM cost, matching
PROJECT.md's stated rationale for rejecting a vector database.

### Pattern 6: Regeneration loop with negative-constraint prompt injection

**What:** On a rejected candidate, re-call `runStoryDirector` with an added server-authored
instruction (not user content — stays outside `CONTENT_DELIMITER`, so `buildStoryPrompt`'s existing
prompt-injection boundary is untouched) describing the collided pattern abstractly:
```typescript
// appended to buildStoryPrompt's instruction block, only when regenerating
`Avoid this specific story pattern, which has already been used: a protagonist who ` +
`${collidedFingerprint.protagonistWant}, facing ${collidedFingerprint.centralObstacle}, ` +
`ending with ${collidedFingerprint.endingShape}. Produce a structurally different story.`
```
Loop within a single Server Action invocation (no streaming, no job queue — matches
`generateSceneImagesAction`'s existing sequential-loop-within-one-call shape); cap at
`MAX_UNIQUENESS_REGENERATION_ATTEMPTS` (recommend `3`, matching Phase 2's established
content-safety-retry precedent per CONTEXT.md's own discretion note); on exhaustion, return the
last candidate with `uniquenessStatus: "REJECTED_EXHAUSTED_SHOWN"` per D-04.

### Anti-Patterns to Avoid
- **Calling the LLM tie-breaker for every story regardless of pre-filter score:** defeats the
  entire cost rationale PROJECT.md documents for rejecting a vector database. The pre-filter must
  be the default path; the LLM call is the exception.
- **Persisting a rejected candidate's raw story text where the browser could ever fetch it:**
  D-03 requires the wife never sees a collided story's actual text. Store it in the DB for
  regeneration-prompt purposes only; never return it from any Server Action tied to the review screen.
- **Treating `spend-ledger.ts`'s file ledger and the new `GenerationRecord` table as the same
  system:** they are not (see Architectural Responsibility Map) — do not remove or bypass
  `checkCeiling`/`recordSpend` in favor of a Prisma-only accounting scheme this phase.
- **Using `prisma.$queryRawUnsafe` with any story-derived string:** Prisma's parameterized query
  builder (or `$queryRaw` tagged templates) must be the only path for any raw SQL, matching this
  codebase's existing injection-safety posture in `storage-paths.ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| SQLite migrations, schema versioning | Hand-written `ALTER TABLE` scripts | `prisma migrate dev` | Already locked (PROJECT.md); verified working end-to-end this session |
| Type-safe DB access | Hand-written SQL string builders | `@prisma/client`'s generated, typed query API | Eliminates a whole class of typo/injection bugs the existing codebase doesn't need to reinvent |
| Semantic/embedding similarity | A custom embedding pipeline or a vector DB | The deterministic Jaccard pre-filter + targeted LLM call (Pattern 5/Architecture) | Explicitly rejected as unnecessary infrastructure in PROJECT.md Key Decisions; this scale (a handful of stories, three short fields) does not need it |

**Key insight:** normalized-token Jaccard similarity is NOT "rolling your own NLP" in the sense
this heading usually warns against — it's a well-understood ~20-line algorithm with no numerically
subtle edge cases (unlike, say, hand-rolled cryptography or hand-rolled date/timezone math). The
warning in this domain is about NOT reaching for TF-IDF corpus statistics or embeddings at this
scale — that complexity buys nothing when comparing at most a few dozen short strings.

## Common Pitfalls

### Pitfall 1: Installing Prisma packages via `latest`/unpinned ranges
**What goes wrong:** `npm install prisma @prisma/client` (or any `^7`/`latest` spec) can resolve
`prisma` to `8.0.0-rc.14` while `@prisma/client` resolves to `7.10.0` — a broken, unsupported
mismatched pair.
**Why it happens:** `prisma`'s `latest` npm dist-tag currently points to a pre-release; `@prisma/client`'s does not `[VERIFIED: npm registry dist-tags, this session]`.
**How to avoid:** Pin both (and `@prisma/adapter-better-sqlite3`) to the exact same version string, `7.10.0`, in every install command and in `package.json`.
**Warning signs:** `npx prisma -v` reporting a different major version than `@prisma/client`'s `package.json`.

### Pitfall 2: `prisma migrate dev` failing with a config error
**What goes wrong:** `Error: The datasource.url property is required in your Prisma config file when using prisma migrate dev.`
**Why it happens:** Prisma 7 moved the connection URL out of `schema.prisma`'s `datasource` block into `prisma.config.ts`; a schema copied from pre-v7 tutorials/examples will still have `url = env("DATABASE_URL")` inside the `datasource` block, which v7 silently ignores for CLI commands.
**How to avoid:** Use Pattern 2's `prisma.config.ts` shape exactly; keep `datasource db { provider = "sqlite" }` with **no** `url` line in `schema.prisma`.
**Warning signs:** the exact error string above, reproduced verbatim this session.

### Pitfall 3: Generated Prisma Client import failing with "no export named PrismaClient"
**What goes wrong:** `import { PrismaClient } from "./generated/prisma/client.ts"` throwing an ESM resolution error.
**Why it happens:** this is **not** a Prisma/TypeScript incompatibility — it happens only when the
consuming project's `package.json` lacks `"type": "module"`, causing Node to default to CJS
resolution for a file containing `import`/`export` syntax. This project's `package.json` already
declares `"type": "module"` (confirmed by reading it this session), so **this pitfall does not
apply here** — flagged only because it was a real dead-end hit and resolved during this session's
verification, and is worth knowing if any test harness or script creates its own isolated
`package.json` without that field.
**How to avoid:** Never create a nested `package.json` for test/probe scripts without carrying
forward `"type": "module"`.

### Pitfall 4: `check-boundaries.ts` not extended to cover Prisma
**What goes wrong:** A future `"use client"` component could accidentally import `src/lib/db.ts`
or `@prisma/client` directly, shipping SQLite access code (and potentially the DB file path) into
the browser bundle.
**Why it happens:** the current script (`src/scripts/check-boundaries.ts` invariant 1) only greps
client-file imports for `/providers/` or `spend-ledger` substrings — it has no Prisma-awareness yet
`[VERIFIED: src/scripts/check-boundaries.ts:64-71, read this session — the exact substring list is `spec.includes("/providers/") || spec.includes("spend-ledger")`]`.
**How to avoid:** add a third substring check (`"@prisma/client"` or `"/generated/prisma"` or
`"lib/db"`) to invariant 1's offender list as part of this phase's plan.
**Warning signs:** `npm run` equivalent of `node src/scripts/check-boundaries.ts` passing green
even after such an import is added — meaning the gate is silently not covering the new surface.

### Pitfall 5: `test:lib` script is a hardcoded file list, not a glob
**What goes wrong:** a new `*.test.ts` file for the uniqueness pre-filter or the Prisma singleton
silently never runs.
**Why it happens:** `package.json`'s `test:lib` script enumerates every test file by exact path
(`node --test src/lib/spend-ledger.test.ts src/lib/log-response.test.ts ...`) rather than using a
glob pattern `[VERIFIED: package.json, read this session, `"test:lib": "node --test src/lib/spend-ledger.test.ts src/lib/log-response.test.ts src/core/story/styles.test.ts ..."`]`.
**How to avoid:** any new test file this phase adds (e.g. `src/core/uniqueness/similarity.test.ts`)
must be manually appended to that script string.
**Warning signs:** a new test file exists on disk but never appears in CI/local test output.

## Code Examples

### Story record persistence after uniqueness acceptance
```typescript
// src/core/uniqueness/check.ts (sketch — orchestration shape only)
import { prisma } from "../../lib/db.ts";
import { jaccardSimilarity } from "./similarity.ts";
import type { StoryDirectorOutput } from "../story/schema.ts";

const HIGH_THRESHOLD = 0.75;
const BORDERLINE_THRESHOLD = 0.4;

export async function checkUniqueness(candidate: StoryDirectorOutput) {
  const past = await prisma.story.findMany({
    where: { uniquenessStatus: "ACCEPTED" },
    select: { id: true, protagonistWant: true, centralObstacle: true, endingShape: true },
  });

  for (const p of past) {
    const scores = {
      want: jaccardSimilarity(candidate.story.protagonist_want, p.protagonistWant),
      obstacle: jaccardSimilarity(candidate.story.central_obstacle, p.centralObstacle),
      ending: jaccardSimilarity(candidate.story.ending_shape, p.endingShape),
    };
    if (scores.want >= HIGH_THRESHOLD && scores.obstacle >= HIGH_THRESHOLD && scores.ending >= HIGH_THRESHOLD) {
      return { collided: true, withStoryId: p.id, viaLlm: false };
    }
    if (scores.want >= BORDERLINE_THRESHOLD && scores.obstacle >= BORDERLINE_THRESHOLD && scores.ending >= BORDERLINE_THRESHOLD) {
      // escalate to the single targeted LLM call for this specific past story only
      // (checkCeiling/recordSpend-gated, mirrors runStoryDirector's shape)
    }
  }
  return { collided: false };
}
```

### Real, captured error/output evidence from this session's local probe
```
$ npx prisma migrate dev --name init          # BEFORE adding datasource.url to prisma.config.ts
Loaded Prisma config from prisma.config.ts.
Prisma schema loaded from prisma\schema.prisma.
Error: The datasource.url property is required in your Prisma config file when using prisma migrate dev.

$ npx prisma migrate dev --name init          # AFTER fix
Datasource "db": SQLite database "dev.db" at "file:./dev.db"
SQLite database dev.db created at file:./dev.db
Applying migration `20260913055430_init`
Your database is now in sync with your schema.

$ node probe.mts                              # real create + findMany round trip, incl. Json field
CREATED: {"id":"story-test-1","title":"JSON round trip","characterBible":{"name":"Test","appearance":"tall"},"createdAt":"..."}
FOUND characterBible type: object {"name":"Test","appearance":"tall"}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| Prisma Client generated with a bundled Rust query-engine binary | Prisma Client generated as TypeScript/WASM query-compiler source, requiring an explicit driver adapter | Prisma 7.0 (2026) | The "just install `@prisma/client` and go" tutorials still widely circulating online (written for v5/v6) will not work as-is; `@prisma/adapter-better-sqlite3` is mandatory, not optional, for this project |
| `datasource.url` inside `schema.prisma` | `datasource.url` inside `prisma.config.ts` | Prisma 7.0 (2026) | Copy-pasting a v6-era `schema.prisma` will fail `migrate dev` with the exact error captured in Pitfall 2 |

**Deprecated/outdated:** `prisma-client-js` generator provider (pre-v7 default) — this project's
schema uses the current `prisma-client` generator provider, confirmed working this session.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Recommended Jaccard similarity thresholds (0.75 / 0.4) | Pattern 5 | No external standard exists for this exact "3-field structural fingerprint" comparison; thresholds are a reasoned starting point, not empirically tuned. If wrong, either false-positive collisions (UNIQUE-03 regression) or false-negative misses (UNIQUE-01 regression) — must be validated against at least 2-3 real story pairs (one genuinely similar, one genuinely different sharing surface nouns) during execution, not assumed correct from research alone |
| A2 | `gemini-3.8-flash` (the existing GA-tier fallback model) is an adequate, cheaper choice for the targeted uniqueness comparison call rather than `gemini-3.1-pro-preview` | Architecture (LLM tie-breaker) | If the cheaper model produces unreliable true/false judgments on structural matching, the comparison quality (not cost) suffers — recommend a small manual spot-check before relying on it for real users |
| A3 | Adding a `postinstall: "prisma generate"` script satisfies STARTUP-01's "one documented command" constraint without further changes | Standard Stack | Not run/tested this session (would require modifying the actual project's package.json, out of scope for research-only investigation); if `npm install` is not part of the wife's actual startup flow (e.g. node_modules is pre-shipped), this step would need to move into the `dev`/`start` script chain instead |

## Open Questions

1. **VIDEO-03 (soft) — does browser/app-restart video-job tracking fall out naturally?**
   - What we know: writing scene `videoStatus`/`videoPath` to the DB at each transition
     (`WAITING → READY/FAILED`) is a near-zero-cost addition once the `Scene` table exists for
     PERSIST-01/IMAGE-01 anyway — the DB-side half is essentially free.
   - What's unclear: today's `page.tsx` holds `storyId` **only** in React state (confirmed by
     reading the file this session — `generateStoryId()` is called client-side and never placed in
     a URL or `localStorage`), and there is deliberately no `/stories/[id]` route yet (Phase 2's
     D-03, reserved for Phase 4). Without *some* client-side pointer back to a story id, a real
     browser restart has no way to know which story's DB rows to re-fetch — DB persistence alone
     does not solve the UI-resume half of VIDEO-03.
   - Recommendation: implement the DB-side status writes as a natural byproduct of the Scene
     schema (near-zero extra cost); treat the UI-resume half (persisting `storyId` to
     `localStorage` + a new "load story by id" Server Action + a `page.tsx` mount-time rehydrate)
     as the explicitly time-boxed stretch goal CONTEXT.md's discretion note already permits —
     attempt it if time allows, otherwise document precisely this gap (DB has the truth, UI has no
     resume path yet) as the accepted VIDEO-03 limitation, exactly as ROADMAP.md anticipates.

2. **Exact Jaccard similarity thresholds (see Assumption A1)**
   - What we know: the algorithm and field scope (three abstracted fields, not raw prose) are sound.
   - What's unclear: the specific 0.75/0.4 cutoffs are unvalidated against real story pairs.
   - Recommendation: the plan should include a Wave 0 or early-task step that runs the pre-filter
     against 2-3 hand-constructed fixture pairs (one deliberately near-identical structurally, one
     deliberately sharing only surface nouns) as a fast, zero-cost sanity check before trusting the
     thresholds against real generated stories.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Node.js | Prisma CLI + client `engines` requirement (`^20.19 \|\| ^22.12 \|\| >=24.0`) | ✓ | v24.20.0 | — |
| npm | package installs | ✓ | 11.19.0 | — |
| `better-sqlite3` native binding | SQLite driver adapter | ✓ (verified — installs AND executes a real query on this machine) | 12.11.1 (resolved from `^12.6.0`) | — |
| Prisma CLI native `schema-engine-windows.exe` | `migrate dev` / `migrate deploy` | ✓ (verified — executed successfully, real migration applied) | bundled with `prisma@7.10.0` | — |
| Windows Application Control policy | (background risk factor — already blocks Turbopack's SWC binary per prior phases) | Confirmed **not** blocking for the two native binaries above `[VERIFIED: local probe, this session]` | — | — |

**Missing dependencies with no fallback:** none identified.
**Missing dependencies with fallback:** none identified — this is a fully-verified-available
dependency set for this exact machine, a stronger result than most phases get from research alone.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none (Node's built-in `node --test`, zero external test framework) — matches PROJECT.md's explicit "no automated test suite" decision |
| Config file | none — `test:lib` script in `package.json` enumerates files explicitly |
| Quick run command | `npm run test:lib` (after appending new test files to the script string — see Pitfall 5) |
| Full suite command | same — this project has no separate "quick vs full" split |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| PERSIST-01 | A record written before "restart" (new PrismaClient instance against the same file) is still readable | integration | `node --test src/lib/db.test.ts` | ❌ Wave 0 |
| UNIQUE-01/02/03 | Deterministic pre-filter returns correct pass/reject/borderline verdict on fixture fingerprint pairs | unit | `node --test src/core/uniqueness/similarity.test.ts` | ❌ Wave 0 |
| UNIQUE-02 | Regeneration loop stops at `MAX_UNIQUENESS_REGENERATION_ATTEMPTS`, never loops forever | unit (mocked LLM, no real network call — mirrors `gemini.test.ts`'s fixture-object convention) | `node --test src/core/uniqueness/check.test.ts` | ❌ Wave 0 |
| IMAGE-03 | A `GenerationRecord` row is created with `estimatedUsd` set on every scene-image call | integration | `node --test src/app/actions/generate-images.test.ts` (or extend `src/core/uniqueness`-adjacent test) | ❌ Wave 0 |
| VIDEO-03 (soft) | DB-side video status survives a fresh `PrismaClient` instantiation | integration (DB half only) | `node --test src/lib/db.test.ts` (shared with PERSIST-01) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:lib` (after adding new files to the script)
- **Per wave merge:** same (no framework split exists to sample differently)
- **Phase gate:** `npm run test:lib` green, plus `node src/scripts/check-boundaries.ts` green (extended per Pitfall 4), before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/lib/db.test.ts` — Prisma singleton + real restart-survival round trip against a temp SQLite file (use a `mkdtempSync`-style isolated path per test, mirroring `spend-ledger.test.ts`'s injectable-`path`-parameter convention)
- [ ] `src/core/uniqueness/similarity.test.ts` — Jaccard function unit tests, including the Assumption A1 sanity-check fixture pairs
- [ ] `src/core/uniqueness/check.test.ts` — orchestration test with a mocked LLM response (zero real network calls, zero ledger spend)
- [ ] Append all new test files to `package.json`'s `test:lib` script string (Pitfall 5)
- [ ] `prisma` + `@prisma/client` + `@prisma/adapter-better-sqlite3` + `better-sqlite3` install, pinned exactly per Standard Stack

**Real paid proof-run budget warning:** any test that exercises the *real* LLM tie-breaker call
(not a mocked fixture) consumes `DEV_CEILING_USD` headroom, which stood at **$0.0630 of $3.00** as
of Phase 2's close (STATE.md, confirmed current this session). At most one small real call fits
before `CeilingExceededError` fires. Do not attempt a real end-to-end proof run (real collision +
real regeneration + real LLM tie-breaker) without first getting the user's explicit, conscious
approval to raise `DEV_CEILING_USD` — silently raising it to route around a refusal is prohibited
per this project's own established convention (STATE.md, PROJECT.md Context section).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No | Single local user, no auth surface (PROJECT.md Out of Scope) |
| V3 Session Management | No | No sessions — single local process |
| V4 Access Control | No | No multi-user boundary exists |
| V5 Input Validation | Yes | Validate `character_bible`/`style_bible` JSON against the existing `StoryDirectorOutputSchema` zod schemas (`src/core/story/schema.ts`) **before** writing to Prisma `Json` columns — do not let unvalidated LLM output reach the DB unchecked, since the uniqueness system reads these fields back later |
| V6 Cryptography | No | No secrets stored in any new table; `GEMINI_API_KEY` must never be written to any DB column (mirrors SECURITY-01's existing spirit, formally Phase 6's requirement) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| SQL injection via story-derived text reaching a raw query | Tampering | Prisma's generated, parameterized query API exclusively; never `$queryRawUnsafe` with any story/scene-derived string. This codebase has no raw-SQL need for this phase's scope |
| Path traversal via a DB-stored `imagePath`/`videoPath` string | Tampering | Continue routing every path through `storage-paths.ts`'s existing validated builders (`sceneImagePath`, `sceneVideoPath`) before it is ever written to a Prisma column — never accept a path string from the LLM or client directly into a DB write |
| Secret/API-key leakage into a `GenerationRecord.message` or `usageMetadata`-equivalent field | Information Disclosure | Reuse `log-response.ts`'s `redactLargeStrings` convention if any raw provider payload is ever persisted; prefer persisting only the already-redaction-safe summary fields (`estimatedUsd`, `model`, `ok`, plain-language `message`) shown in the Prisma schema above, never the raw response object |

## Sources

### Primary (HIGH confidence)
- Local verification probe, this session (isolated scratch directory, not the project repo):
  `npm install prisma@7.10.0 @prisma/client@7.10.0 @prisma/adapter-better-sqlite3@7.10.0
  better-sqlite3@^12.6.0`, followed by a real `prisma migrate dev`, `prisma generate`, and a live
  create/read/Json-round-trip through `PrismaClient({ adapter: new PrismaBetterSqlite3(...) })` —
  all executed successfully on this exact Windows machine, Node v24.20.0. Also verified: enum
  fields generate as erasable `const`-object types (not real TypeScript `enum`); SQLite stores
  enums as plain `TEXT` with no `CHECK` constraint; omitting `prisma.config.ts`'s `datasource.url`
  produces a specific, reproduced error message.
- `npm view prisma version` / `npm view prisma dist-tags` / `npm view @prisma/client version` /
  `npm view @prisma/adapter-better-sqlite3@7.10.0 dependencies` / `npm view better-sqlite3
  version` / `npm audit` — all run this session against the live npm registry.
- `gsd_run query package-legitimacy check` — run this session for all four new packages.
- `src/core/story/schema.ts`, `src/core/story/director.ts`, `src/lib/spend-ledger.ts`,
  `src/lib/log-response.ts`, `src/core/storage-paths.ts`, `src/scripts/check-boundaries.ts`,
  `src/app/actions/create-story.ts`, `src/app/actions/generate-images.ts`,
  `src/app/actions/generate-video.ts`, `src/app/page.tsx`, `src/providers/llm/gemini.ts`,
  `package.json`, `tsconfig.json` — all read directly this session.
- `docs/original-brief.md` §6, §7, §11, §21, §22 — read directly this session.
- `.planning/phases/02-core-generation-pipeline/02-PROOF-RUN.md` — read directly this session for real Story Director output shape.

### Secondary (MEDIUM confidence)
- prisma.io official docs: "Upgrade to Prisma ORM 7", SQLite database connector page, generator
  reference page (`moduleFormat`/`generatedFileExtension` options) — cross-checked against this
  session's local reproduction, which confirmed the documented behavior.
- Community articles on the Prisma Client singleton pattern for Next.js (robinwieruch.de, dev.to) — cross-checked against the general Next.js hot-reload module-caching mechanism, not independently re-derived from first principles this session.

### Tertiary (LOW confidence)
- None retained — every WebSearch-sourced claim in this document was either cross-checked against
  a local reproduction or explicitly marked `[CITED]` rather than `[VERIFIED]`.

## Metadata

**Confidence breakdown:**
- Standard stack (Prisma/SQLite versions, driver adapter requirement, native-binary compatibility): HIGH — verified via real local execution on the target machine, not just documentation
- Architecture (uniqueness fingerprint/pre-filter/LLM-tiebreaker design): MEDIUM — grounded in locked project decisions and real in-repo schema, but the specific similarity thresholds (Assumption A1) are reasoned, not empirically validated against real story pairs
- Pitfalls: HIGH for the Prisma/Windows-specific ones (all reproduced with real error output); MEDIUM for the uniqueness-design ones (reasoned from architecture, not yet exercised in code)

**Research date:** 2026-09-13
**Valid until:** 30 days for the Prisma/SQLite findings (stable-ish ecosystem, but the `prisma`
`latest` dist-tag pointing at an `8.0.0-rc.*` release candidate as of this research date means the
version pin in this document should be re-checked if planning is delayed by more than a few weeks)

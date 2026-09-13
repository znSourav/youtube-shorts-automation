# Phase 3: Persistence & Structural Uniqueness - Pattern Map

**Mapped:** 2026-09-13
**Files analyzed:** 13 (new + modified)
**Analogs found:** 11 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|---------------|
| `prisma/schema.prisma` | model/config | CRUD | *(none — first Prisma schema in repo)* | no-analog, use RESEARCH.md Pattern 3 |
| `prisma.config.ts` | config | CRUD | *(none — first Prisma config)* | no-analog, use RESEARCH.md Pattern 2 |
| `src/lib/db.ts` | service (singleton) | CRUD | `src/lib/spend-ledger.ts` | role-match (server-only stateful lib module) |
| `src/lib/db.test.ts` | test | CRUD | `src/lib/spend-ledger.test.ts` | exact (tmp-path-isolated integration test convention) |
| `src/core/story/schema.ts` (modified — add 3 fields) | model | transform | itself (existing file) | exact — extend in place |
| `src/core/story/director.ts` (modified — prompt instructions) | service | request-response | itself (existing file) | exact — extend in place |
| `src/core/uniqueness/fingerprint.ts` | utility | transform | `src/core/story/schema.ts` (types-only module) | role-match |
| `src/core/uniqueness/similarity.ts` | utility | transform | `src/core/storage-paths.ts` (pure fn, zero-dep, validated-input style) | role-match |
| `src/core/uniqueness/similarity.test.ts` | test | transform | `src/lib/spend-ledger.test.ts` (unit-test structure, `node:test`+`assert/strict`) | role-match |
| `src/core/uniqueness/check.ts` | service (orchestrator) | event-driven / request-response | `src/core/story/director.ts` (`runStoryDirector`: checkCeiling → dispatch → recordSpend → validate) | exact — same ceiling-gated orchestration shape |
| `src/core/uniqueness/check.test.ts` | test | request-response | `src/lib/spend-ledger.test.ts` (mocked/fixture style) | role-match |
| `src/providers/llm/gemini.ts` (modified — add `compareStructuralSimilarity`) | service (provider) | request-response | itself (existing `generateStory`/`classifyStoryResponse`) | exact — extend in place |
| `src/app/actions/create-story.ts` (modified — call uniqueness check after director) | controller (Server Action) | request-response | itself (existing file) + `src/app/actions/generate-images.ts` (sequential-loop-with-ceiling-gate shape for the regeneration loop) | exact — extend in place |
| `src/scripts/check-boundaries.ts` (modified — new invariant 3) | utility (structural gate) | batch | itself (existing file) | exact — extend in place |
| `package.json` (modified — `test:lib` string, `postinstall`) | config | CRUD | itself (existing file) | exact — extend in place |

## Pattern Assignments

### `src/lib/db.ts` (service, CRUD — Prisma singleton)

**Analog:** `src/lib/spend-ledger.ts`

**Module-level state + lazy-init pattern** (`src/lib/spend-ledger.ts` lines 1-27):
```typescript
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const DEV_CEILING_USD = 3.0;
export const LEDGER_PATH = "storage/_smoketest/spend-ledger.json";

export type LedgerEntry = { call: string; model: string; estimatedUsd: number; usageMetadata: unknown | null; billed: boolean; at: string };
export type Ledger = { ceilingUsd: number; entries: LedgerEntry[] };

export class CeilingExceededError extends Error {}
```
`db.ts` should mirror this file's top-of-file shape: exported constants first (e.g. a `DATABASE_URL` default), then the exported types/singleton, matching this codebase's "constants and types before logic" convention. Use RESEARCH.md's exact `globalThis.__prisma` singleton code (Pattern 1) — it already follows this repo's `.ts`-extension-import convention (`"../generated/prisma/client.ts"`) and avoids `enum`/class-heavy shapes per `erasableSyntaxOnly`.

**Injectable path parameter for testability** (`src/lib/spend-ledger.ts` lines 94, 136, 171 — `path: string = LEDGER_PATH` default parameter on every exported function): `db.ts`'s equivalent is `DATABASE_URL` as a constructor/env parameter with a default, exactly as `PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" })` in RESEARCH.md Pattern 1 already does — this is the same "default path, override for tests" shape as `spend-ledger.ts`.

---

### `src/lib/db.test.ts` (test)

**Analog:** `src/lib/spend-ledger.test.ts`

**tmp-dir isolation pattern** (lines 1-25):
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function tmpLedgerPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "spend-ledger-test-"));
  return join(dir, "spend-ledger.json");
}
```
`db.test.ts` must use the identical `mkdtempSync(join(tmpdir(), "prisma-test-"))` pattern to build an isolated SQLite file path per test — never point at the real `prisma/dev.db`, exactly as this file never points at the real ledger. The "restart survival" test (PERSIST-01) should instantiate two separate `PrismaClient` objects against the same tmp file path (simulating a process restart) and assert the second instance can read what the first wrote — the equivalent of this file's `loadLedger`-after-`recordSpend` round trip (lines 43-53 pattern, `test(...)` + `assert.deepEqual`/`assert.throws`).

---

### `src/core/story/schema.ts` (modified — add 3 fields)

**Analog:** itself (extend in place), same file lines 27-35

**Current shape to extend:**
```typescript
export const StoryDirectorOutputSchema = z.object({
  story: z.object({
    title: z.string(),
    premise: z.string(),
    story: z.string(),
    theme: z.string(),
    emotional_arc: z.string(),
    ending: z.string(),
    // ADD:
    // protagonist_want: z.string(),
    // central_obstacle: z.string(),
    // ending_shape: z.string(),
  }),
  ...
```
Match the file's existing comment convention (block comment above the schema explaining WHY each field maps to a spec, e.g. lines 3-9) — add a comment tying the 3 new fields to CONTEXT.md D-01's three elements, mirroring how lines 3-9 already cite `docs/original-brief.md §10`.

---

### `src/core/story/director.ts` (modified — prompt instructions + schema)

**Analog:** itself, `buildStorySchema` (lines 41-113) and `buildStoryPrompt` (lines 129-162)

**`buildStorySchema`'s `properties.story.required` array** (lines 54-55) must gain the 3 new field names — mirrors how every other field was added: property definition + required-array entry, both updated together (this is the exact reason `StoryDirectorOutputSchema`'s own comment, lines 3-9, says required-ness "follows `buildStorySchema`'s own `required` arrays" — the two files are kept in lockstep by convention, not accident).

**`buildStoryPrompt`'s instruction-array-join pattern** (lines 136-159): add a new joined-array entry instructing the model to write the 3 new fields in *abstracted* language (RESEARCH.md Pattern 4), in the same imperative, single-sentence-per-array-item style as the existing 8 instructions (e.g. line 152's duration-variation instruction, line 153's motion-prompt constraint). The regeneration-loop's "avoid this pattern" injection (RESEARCH.md Pattern 6) is a **new conditional array item**, appended only when regenerating — same array-based composition, not a separate prompt-building function.

---

### `src/core/uniqueness/similarity.ts` (utility, transform — pure fn)

**Analog:** `src/core/storage-paths.ts`

**Validated-input, pure-function, zero-dependency style** (`src/core/storage-paths.ts` lines 34-46, 52-72):
```typescript
const STORY_ID_PATTERN = /^[a-z0-9-]+$/;

function assertValidStoryId(storyId: string): void {
  if (typeof storyId !== "string" || !STORY_ID_PATTERN.test(storyId)) {
    throw new Error(`Invalid story id "${String(storyId)}": ...`);
  }
}

export function storyDir(storyId: string): string {
  assertValidStoryId(storyId);
  return `${STORAGE_ROOT}/${storyId}`;
}
```
`similarity.ts`'s `jaccardSimilarity`/`tokenize` (RESEARCH.md Pattern 5) should follow this file's convention: small private helper functions (`tokenize`, mirroring `assertValidStoryId`/`pad2`) feeding one or two exported pure functions, each with a doc comment explaining the WHY (this file's comment block at lines 1-21 is the model — explain why Jaccard/thresholds were chosen, matching how storage-paths.ts explains why `/` concatenation was chosen over `node:path.join`). No I/O, no classes — matches this file exactly.

---

### `src/core/uniqueness/similarity.test.ts` (test, transform)

**Analog:** `src/lib/spend-ledger.test.ts`

Same `node:test` + `assert/strict` structure (lines 1-2, 43-59: one `test(...)` block per behavior, short descriptive string as the first arg, `assert.ok`/`assert.deepEqual`/`assert.throws` as the assertion). No tmp-dir/fs needed here since `similarity.ts` is pure — closer to this file's `totalSpentUsd` tests (lines 55-59: construct a fixture object, call the pure function, assert the numeric result) than to its ledger-file tests. Must include the RESEARCH.md Open Question #2 fixture pairs (one near-identical structurally, one sharing only surface nouns) as explicit `test(...)` cases.

---

### `src/core/uniqueness/check.ts` (service, orchestrator)

**Analog:** `src/core/story/director.ts`'s `runStoryDirector` (lines 171-232)

**Ceiling-gated dispatch + record + result-union shape**:
```typescript
export async function runStoryDirector(input: StoryDirectorInput): Promise<StoryDirectorResult> {
  const estimatedUsd = Math.max(...Object.values(LLM_PRICE_PER_CALL));
  checkCeiling(estimatedUsd);

  const prompt = buildStoryPrompt(input);
  const result = await generateStory({ prompt, responseSchema: schema });

  recordSpend({
    call: `story:${input.sceneCount}-scene`,
    model: result.modelUsed,
    estimatedUsd,
    usageMetadata: result.usageMetadata,
    billed: !result.blocked,
    at: new Date().toISOString(),
  });

  if (result.blocked) {
    return { ok: false, reason: "blocked", ... };
  }
  const parsed = StoryDirectorOutputSchema.safeParse(result.raw);
  if (!parsed.success) { return { ok: false, reason: "parse_failed", ... }; }
  return { ok: true, data: parsed.data, ... };
}
```
`check.ts`'s `checkUniqueness`/orchestration function (RESEARCH.md Code Examples) must follow this exact discriminated-union return shape (`{ collided: true, ... } | { collided: false }`, analogous to `StoryDirectorSuccess | StoryDirectorFailure`), and the LLM tie-breaker branch must call `checkCeiling`/`recordSpend` in the identical order (check → dispatch → record, always record even on a blocked/failed comparison, conservative accounting per `spend-ledger.ts`'s own documented convention). The **regeneration loop** (calling `runStoryDirector` again on collision, capped at `MAX_UNIQUENESS_REGENERATION_ATTEMPTS`) should follow `generate-images.ts`'s sequential-loop-with-a-`stopped`-flag shape (see below) rather than recursion — same "no job queue, single Server-Action-invocation loop" pattern already established for scene images.

**Sequential loop with stop condition** (`src/app/actions/generate-images.ts` lines 100-125):
```typescript
let stopped = false;
for (const scene of scenes) {
  if (stopped) { statuses.push({ ...skipped }); continue; }
  try {
    checkCeiling(estimatedUsd);
  } catch (err) {
    stopped = true;
    const message = err instanceof CeilingExceededError ? "..." : "...";
    statuses.push({ ...failed, message });
    continue;
  }
  ...
}
```
Reuse this exact "cap attempts, push a status/result per attempt, stop and mark remaining as skipped on ceiling-exceeded" shape for the regeneration loop, with attempts replacing scenes.

---

### `src/core/uniqueness/check.test.ts` (test)

**Analog:** `src/lib/spend-ledger.test.ts` (fixture/mock style) — no existing mocked-LLM test file was found in scope (`gemini.test.ts` referenced in RESEARCH.md/package.json exists but was not read this session; use its convention per RESEARCH.md's own note: "mirrors gemini.test.ts's fixture-object convention"). Structure: `node:test` + `assert/strict`, construct a fake past-fingerprint array and a fake LLM response object (no real network call, no real ledger spend — inject a tmp ledger path exactly as `spend-ledger.test.ts` does via `tmpLedgerPath()`).

---

### `src/providers/llm/gemini.ts` (modified — add `compareStructuralSimilarity`)

**Analog:** itself, `generateStory`/`classifyStoryResponse` (lines 1-80+)

**Provider pricing-table + classify-before-parse convention** (lines 13-16, 76-80):
```typescript
export const LLM_PRICE_PER_CALL: Record<string, number> = {
  "gemini-3.1-pro-preview": 0.05,
  "gemini-3.8-flash": 0.01,
};

export function classifyStoryResponse(
  response: RawGenerateContentResponse,
  modelUsed: string,
  fallbackUsed: boolean,
  estimatedUsd: number,
) { ... }
```
`compareStructuralSimilarity` (RESEARCH.md Architecture diagram) should add its own price constant (or reuse `LLM_PRICE_PER_CALL` with the same model id, since RESEARCH.md Assumption A2 recommends the cheaper `gemini-3.8-flash` fallback tier), define a `RawGenerateContentResponse`-shaped loose interface (line 56-63) so its own test file can build plain fixture objects with zero SDK dependency, and call `logRawResponse` on the raw response exactly as the existing story-generation path does (per RESEARCH.md's "same convention applies to any new raw provider response" note in CONTEXT.md's Reusable Assets).

---

### `src/app/actions/create-story.ts` (modified — insert uniqueness gate)

**Analog:** itself (existing structure, lines 25-82) + `src/app/actions/generate-images.ts` (plain-language error mapping)

**Plain-language error-mapping convention** (lines 38-81 — every internal failure reason mapped to exactly one non-technical sentence, never the raw provider/internal detail):
```typescript
if (result.reason === "blocked" && result.blockReason === "MAX_TOKENS") {
  return { ok: false, error: "The response was cut short before it finished. Please try again with fewer scenes." };
}
...
} catch (err) {
  if (err instanceof CeilingExceededError) {
    return { ok: false, error: "The monthly generation budget has been reached, so no new story can be created right now." };
  }
  console.error("createStoryAction: unexpected error", err);
  return { ok: false, error: "A network or server problem prevented the story from being created. Please try again." };
}
```
After `runStoryDirector` succeeds, insert a call to `checkUniqueness`/the regeneration loop before returning `{ ok: true, data: result.data }` — on exhaustion (D-04), return `ok: true` with the last candidate PLUS a new plain-language warning field (not an `ok: false`, since D-04 requires showing the story, not blocking it — this is a genuinely new response shape, not reuse of the existing failure union). On mid-loop regeneration attempts, this action does not stream a status back per-attempt within a single call (no SSE/streaming in this codebase) — the D-03 "Making sure this is original... trying again" message is therefore either a fixed client-side loading-state string shown for the action's whole duration (simplest, matches this codebase's no-streaming convention) or requires a new mechanism; recommend the fixed-string, no-streaming approach as consistent with every other action in this codebase.

---

### `src/scripts/check-boundaries.ts` (modified — new invariant 3)

**Analog:** itself, invariant 1 (lines 55-80)

**Existing offender-list-substring-check pattern**:
```typescript
const offenders1: string[] = [];
for (const file of clientFiles) {
  const specifiers = importSpecifiers(readFileSync(file, "utf8"));
  for (const spec of specifiers) {
    if (spec.includes("/providers/") || spec.includes("spend-ledger")) {
      offenders1.push(`${file} -> "${spec}"`);
    }
  }
}
```
Per RESEARCH.md Pitfall 4, extend this exact `spec.includes(...)` check with a third substring option: `spec.includes("@prisma/client") || spec.includes("/generated/prisma") || spec.includes("lib/db")`. Follow the file's established pattern of a separate `offenders2`/`offenders3` array, its own `if (offendersN.length > 0) { failed = true; console.log("BOUNDARY CHECK FAILED (invariant N -- ...)"); ... }` block (lines 82-101 is the template for a NEW invariant 3, not an edit to invariant 1's block — invariant 1's own offender check should just gain the extra `||` clause).

---

## Shared Patterns

### Ceiling gate (checkCeiling / recordSpend)
**Source:** `src/lib/spend-ledger.ts` (`checkCeiling` lines 136-159, `recordSpend` lines 171-181)
**Apply to:** `src/core/uniqueness/check.ts` (LLM tie-breaker call), any modified provider call in `src/providers/llm/gemini.ts`
```typescript
const estimatedUsd = Math.max(...Object.values(LLM_PRICE_PER_CALL));
checkCeiling(estimatedUsd);
const result = await generateStory({ prompt, responseSchema: schema });
recordSpend({
  call: `story:${input.sceneCount}-scene`,
  model: result.modelUsed,
  estimatedUsd,
  usageMetadata: result.usageMetadata,
  billed: !result.blocked,
  at: new Date().toISOString(),
});
```
Never bypass or replace this with the new `GenerationRecord` Prisma table — per RESEARCH.md's Architectural Responsibility Map, the Prisma row is a **dual write**, not a replacement.

### Plain-language error/status surfacing
**Source:** `src/app/actions/create-story.ts` (lines 38-81), `src/app/actions/generate-images.ts` (`plainLanguageBlockMessage`, lines 72-80)
**Apply to:** Every new/modified Server Action surfacing a uniqueness-check outcome; D-03's regeneration status message; D-04's exhaustion warning
```typescript
function plainLanguageBlockMessage(block?: ImageBlockClassification): string {
  if (!block) return "The image could not be generated for an unknown reason. Please try again.";
  if (block.stage === "prompt") return "The image request was blocked before generation started. Please try a different description.";
  return "The image generation did not return a usable image. Please try again.";
}
```
No raw story text, no past-story id, no internal reason code ever crosses into a returned string — only a hand-picked plain sentence, exactly as every existing action does.

### Injection-safe path building
**Source:** `src/core/storage-paths.ts` (`assertValidStoryId`, `sceneImagePath`, lines 34-72)
**Apply to:** Any Prisma `imagePath`/`videoPath` column write in the new schema
```typescript
export function sceneImagePath(storyId: string, sceneNumber: number, extension: string): string {
  const ext = extension.replace(/^\./, "");
  if (!EXTENSION_PATTERN.test(ext)) { throw new Error(`Invalid file extension "${extension}": must be alphanumeric only.`); }
  return `${sceneDir(storyId, sceneNumber)}/image.${ext}`;
}
```
Every path written to a new `Scene.imagePath`/`Scene.videoPath` Prisma column must be produced by these existing validated builders — never a raw string from the LLM or client (RESEARCH.md Security Domain, Path traversal row).

### Response redaction before logging
**Source:** `src/lib/log-response.ts` (`redactLargeStrings`, `logRawResponse`, lines 75-89)
**Apply to:** Any raw response from the new `compareStructuralSimilarity` provider call
```typescript
export function logRawResponse(label: string, value: unknown): void {
  console.log(`${label}\n${JSON.stringify(redactLargeStrings(value), null, 2)}`);
}
```

### `node --test` unit test structure
**Source:** `src/lib/spend-ledger.test.ts` (whole file)
**Apply to:** `src/lib/db.test.ts`, `src/core/uniqueness/similarity.test.ts`, `src/core/uniqueness/check.test.ts`
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
test("description of one behavior", () => {
  // arrange, act, assert.ok/deepEqual/throws
});
```
Plus: **every new test file must be manually appended to `package.json`'s `test:lib` script string** (RESEARCH.md Pitfall 5 — this is not a glob).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `prisma/schema.prisma` | model/config | CRUD | First Prisma schema in this repo — no prior SQL/ORM schema file exists to pattern-match against. Use RESEARCH.md Pattern 3 (fully specified, locally-verified schema) directly. |
| `prisma.config.ts` | config | CRUD | First Prisma config file — no analog. Use RESEARCH.md Pattern 2 directly (locally verified this session, including the exact error it prevents). |

## Metadata

**Analog search scope:** `src/lib/`, `src/core/`, `src/app/actions/`, `src/providers/llm/`, `src/scripts/`, `package.json`
**Files scanned:** 13 (all tracked via `git ls-files`, confirmed non-mirror paths)
**Pattern extraction date:** 2026-09-13

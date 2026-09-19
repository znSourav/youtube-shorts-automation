# Phase 5: Budget & Retry Safeguards - Pattern Map

**Mapped:** 2026-09-19
**Files analyzed:** 11 (5 new, 6 modified/re-pointed)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/core/budget/ledger.ts` (new) | service | CRUD (check + record, DB-backed) | `src/lib/spend-ledger.ts` (role/shape) + `src/core/persistence/generation-repository.ts` (DB access style) | role-match (logic shape exact, storage backend differs: file→Prisma) |
| `src/core/budget/month.ts` (new) | utility | transform | `src/core/retry/caps.ts` (env-var-with-safe-default utility) | role-match |
| `src/core/budget/ledger.test.ts` (new) | test | request-response (unit) | `src/core/retry/caps.test.ts` | exact (test style/framework) |
| `prisma/schema.prisma` — `model BudgetPeriod` (modified) | model | CRUD | `model GenerationRecord` / `model Scene` in same file | exact |
| `src/app/actions/get-budget-status.ts` (new) | route (Server Action) | request-response | `src/app/actions/get-story-status.ts` | exact |
| `src/components/BudgetIndicator.tsx` (new) | component | request-response (client, polls/reads server action) | `src/components/story/VideoStatusScreen.tsx` (expand-for-detail, plain-language, "use client") | role-match |
| `src/core/story/director.ts` (modified — re-point) | service | request-response (paid dispatch) | itself, pattern already established (checkCeiling/recordSpend call shape) | exact |
| `src/core/uniqueness/check.ts` (modified — re-point) | service | request-response (paid dispatch) | `src/core/story/director.ts` (identical checkCeiling/recordSpend shape) | exact |
| `src/app/actions/generate-images.ts` (modified — re-point) | route (Server Action) | request-response (paid dispatch, per-scene loop) | `src/app/actions/generate-video.ts` (identical checkCeiling/recordSpend/recordGeneration shape) | exact |
| `src/app/actions/generate-video.ts` (modified — re-point + generalize mutex) | route (Server Action) | request-response (paid dispatch) | itself (existing `videoDispatchChain`, to be generalized) | exact |
| `src/app/actions/get-story-status.ts` (modified — re-point headroom probe) | route (Server Action) | request-response (read-only) | itself (existing `checkCeiling` read-only usage) | exact |

Not separately listed but structurally unchanged (delegate to the above, no direct edits needed): `src/app/actions/retry-scene-video.ts`, `src/app/actions/regenerate-scene-image.ts` — both call the same re-pointed functions above, confirmed by direct read (`retry-scene-video.ts:22` calls `generateSceneVideoAction`; `regenerate-scene-image.ts:110` calls `generateSceneImagesAction`). No pattern work needed for these two files beyond regression testing (BUDGET-04).

## Pattern Assignments

### `src/core/budget/ledger.ts` (service, CRUD)

**Analog:** `src/lib/spend-ledger.ts` (logic/API shape) + `src/core/persistence/generation-repository.ts` (Prisma access style) + `src/lib/db.ts` (injectable-client convention)

**Fail-closed validation pattern** (`src/lib/spend-ledger.ts:139-162`, `checkCeiling`):
```typescript
export function checkCeiling(estimatedUsd: number, path: string = LEDGER_PATH): void {
  if (!Number.isFinite(estimatedUsd) || estimatedUsd < 0) {
    throw new CeilingExceededError(
      `Refusing call: estimated cost ${estimatedUsd} is not a valid non-negative finite number.`,
    );
  }
  const ledger = loadLedger(path);
  const ceiling = ledger.ceilingUsd;
  if (!Number.isFinite(ceiling) || ceiling <= 0) {
    throw new CeilingExceededError(
      `Refusing call: ledger ceilingUsd (${ceiling}) is not a valid positive finite number — ` +
        `refusing rather than silently allowing unlimited spend.`,
    );
  }
  const spent = totalSpentUsd(ledger);
  const projected = spent + estimatedUsd;
  // Inclusive boundary: projected total exactly equal to the ceiling is allowed.
  if (projected > ceiling) {
    throw new CeilingExceededError(
      `Refusing call: ceiling is $${ceiling.toFixed(2)}, already spent $${spent.toFixed(2)}, ` +
        `this call would add $${estimatedUsd.toFixed(2)} for a projected total of $${projected.toFixed(2)}.`,
    );
  }
}
```
Copy this exact shape for `checkBudget(estimatedUsd, client?)`: throw a dedicated error class (`BudgetExceededError`, not a boolean return — "a boolean return can be ignored at a call site by accident, a throw cannot"), validate `estimatedUsd` first, validate the loaded allocation is finite/positive before comparing, inclusive boundary (`projected > cumulativeAllocated`, not `>=`), and a plain-language message with `.toFixed(2)` throughout (Pitfall 3 in RESEARCH.md).

**Injectable-default client parameter** (`src/lib/db.ts:30-35`, `src/core/persistence/generation-repository.ts:73-78`):
```typescript
export async function recordGeneration(
  storyId: string,
  record: PendingGenerationRecord,
  sceneNumber?: number,
  client: PrismaClient = prisma,
): Promise<void> { ... }
```
Every exported function in `ledger.ts` and `month.ts` must take `client: PrismaClient = prisma` (or `env: Record<string,string|undefined> = process.env` for env readers) as a trailing optional param — this is what lets `ledger.test.ts` inject a temp-file/mock client instead of touching the real `prisma/dev.db`, mirroring `generation-repository.ts`'s and `spend-ledger.ts`'s own convention exactly.

**Idempotent upsert pattern for `ensureCurrentMonthAllocation`** — no direct existing analog (first upsert in codebase); RESEARCH.md's own worked example (already vetted against Pitfall 5's double-crediting risk) is the pattern to use verbatim:
```typescript
export async function ensureCurrentMonthAllocation(
  client: PrismaClient = prisma,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const month = currentMonthKey();
  const allocatedUsd = monthlyBudgetUsd(env);
  await client.budgetPeriod.upsert({
    where: { month },
    update: {}, // already credited -- do not re-apply a changed env value retroactively
    create: { month, allocatedUsd },
  });
}
```

**Error class pattern** (`src/lib/spend-ledger.ts:30`):
```typescript
export class CeilingExceededError extends Error {}
```
→ `export class BudgetExceededError extends Error {}` in `ledger.ts`, exported alongside `checkBudget`/`getBudgetStatus`, same as `CeilingExceededError` is exported alongside `checkCeiling`.

**Best-effort write contract note (Pitfall 4, must be a deliberate, documented decision):** `recordGeneration` in `generation-repository.ts:79-104` never throws — it try/catches its own DB write and logs. Since `GenerationRecord` is being promoted to the enforcement read-side source of truth, the plan must explicitly state (in a code comment on `ledger.ts` or on the re-pointed call sites) that a swallowed `recordGeneration` failure has the same under-counting risk `recordSpend`'s own lock-timeout risk already carried — not a new regression, but must not be silently assumed.

---

### `src/core/budget/month.ts` (utility, transform)

**Analog:** `src/core/retry/caps.ts` (full file — env-var-with-safe-default, fail-closed to a safe value)

**Full env-read pattern to replicate for `monthlyBudgetUsd`** (`src/core/retry/caps.ts:15-25`):
```typescript
export function maxSceneRetryAttempts(env: Record<string, string | undefined> = process.env): number {
  const raw = env.MAX_SCENE_RETRY_ATTEMPTS;
  if (raw === undefined) {
    return DEFAULT_MAX_SCENE_RETRY_ATTEMPTS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_MAX_SCENE_RETRY_ATTEMPTS;
  }
  return parsed;
}
```
Adapt directly for `monthlyBudgetUsd(env)`: read `process.env.MONTHLY_BUDGET_USD`, default on absent/non-finite/`<= 0` (not `< 1`, since this is a dollar amount not an integer count), return the default `DEFAULT_MONTHLY_BUDGET_USD` (15, per PROJECT.md).

**Explicit anti-pattern warning (Pitfall 1 in RESEARCH.md):** do NOT copy `spend-ledger.ts:10`'s `export const DEV_CEILING_USD = 6.25;` hardcoded-literal shape for the monthly figure — that file is the *wrong* analog for this specific piece even though it's the "obvious" one to copy from, since it's a source constant, not an env read. `caps.ts` is the correct analog for `month.ts`'s env-reading half.

**`currentMonthKey()`/`monthRange()`** — no existing analog (first UTC month-key helper in the codebase); per RESEARCH.md's own "Don't Hand-Roll" table, keep this to plain `Date.prototype.getUTCFullYear()`/`getUTCMonth()`, no date library. Two functions: `currentMonthKey(now: Date = new Date()): string` returning `"YYYY-MM"`, and `monthRange(monthKey: string): { start: Date; end: Date }` for month-to-date filtering in `getBudgetStatus`.

---

### `src/core/budget/ledger.test.ts` (test)

**Analog:** `src/core/retry/caps.test.ts` (full file — `node:test`, plain-object env injection, one assertion per `test()` block, never mutates `process.env`)

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

test("an absent MAX_SCENE_RETRY_ATTEMPTS returns DEFAULT_MAX_SCENE_RETRY_ATTEMPTS", () => {
  assert.equal(maxSceneRetryAttempts({}), DEFAULT_MAX_SCENE_RETRY_ATTEMPTS);
});
```
Use this exact `node:test` + `node:assert/strict` style, no third-party framework (matches every test file in the repo, confirmed by RESEARCH.md's "Test Framework" table). For DB-touching tests, inject a real Prisma client pointed at a temp SQLite file as the `client` param, mirroring `generation-repository.test.ts`/`db.test.ts`'s convention (per RESEARCH.md Pattern 2) — do not mock Prisma.

---

### `prisma/schema.prisma` — `model BudgetPeriod` (model, CRUD)

**Analog:** existing `model GenerationRecord` (`prisma/schema.prisma:109+`) and `model Scene` (`:82+`) for field/id conventions in the same file.

```prisma
model BudgetPeriod {
  id           String   @id @default(cuid())
  month        String   @unique // "YYYY-MM", UTC
  allocatedUsd Float
  createdAt    DateTime @default(now())
}
```
Matches existing convention: `@id @default(cuid())` (as `Scene.id`, `GenerationRecord.id` both use), `@unique` for the natural key (mirrors `Scene`'s `@@unique([storyId, sceneNumber])` compound-key convention, here a single-column unique), `DateTime @default(now())` for `createdAt` (as `GenerationRecord.createdAt` already does). Migration command: `npx prisma migrate dev --name phase5_budget_ledger`, same as Phase 3's established migration convention.

---

### `src/app/actions/get-budget-status.ts` (route/Server Action, request-response)

**Analog:** `src/app/actions/get-story-status.ts` (full file read — read-only polling Server Action, cheap SELECT, `"use server"`, plain-language-safe result shape)

**File-header/import pattern** (`get-story-status.ts:1-16`):
```typescript
"use server";

import { maxSceneRetryAttempts } from "../../core/retry/caps.ts";
import { checkCeiling, CeilingExceededError } from "../../lib/spend-ledger.ts";
```
→ `get-budget-status.ts` opens with `"use server";` then imports `getBudgetStatus` (or equivalent) from `../../core/budget/ledger.ts` — never imports Prisma or the budget module's internals directly from a client component (invariant 1).

**Result-shape pattern, computed server-side, safe defaults on any failure** (`get-story-status.ts:56-86`):
```typescript
export interface StoryStatusResult {
  ok: boolean;
  imagesApproved: boolean;
  scenes: SceneVideoStatusRow[];
  maxAttempts: number;
}

export async function getStoryStatusAction(storyId: string): Promise<StoryStatusResult> {
  const maxAttempts = maxSceneRetryAttempts();
  try {
    storyDir(storyId);
  } catch {
    return { ok: false, imagesApproved: false, scenes: [], maxAttempts };
  }
  ...
}
```
Adapt: `getBudgetStatusAction(): Promise<BudgetStatusResult>` with fields like `cumulativeAllocatedUsd`, `cumulativeSpentUsd`, `monthToDateSpentUsd`, `monthlyAllocationUsd`, `breakdown: { type: "LLM"|"IMAGE"|"VIDEO"; spentUsd: number }[]` — same "never throw to the caller, return an `ok`/safe-default shape on any internal failure" discipline `getStoryStatusAction` already follows (its `try/catch` around `findStoryWithScenes`, `get-story-status.ts:76-82`).

**Error-swallowing/logging convention** (`get-story-status.ts:79-82`):
```typescript
} catch (err) {
  console.error(`getStoryStatusAction: failed to read story ${storyId}`, err);
  return { ok: false, imagesApproved: false, scenes: [], maxAttempts };
}
```
Same one-line `console.error` naming the action + context, never a raw stack trace or provider payload sent to the browser.

---

### `src/components/BudgetIndicator.tsx` (component, request-response)

**Analog:** `src/components/story/VideoStatusScreen.tsx` (full "use client" component, plain-language error rendering, Tailwind utility classes, polling-friendly)

**"use client" + plain-language error rendering pattern** (`VideoStatusScreen.tsx:1,79-83`):
```typescript
"use client";

{error && (
  <p className="rounded border border-red-300 bg-red-50 p-3 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
    {error}
  </p>
)}
```
Reuse this exact color/spacing convention for a budget-refused message state.

**Expand-for-detail pattern:** no direct existing "tap to expand" component exists yet in the codebase (RESEARCH.md confirms zero existing UI for BUDGET-03) — CONTEXT.md's D-03 cites "the Library's computed status labels, the calm cap-reached messages" as the tone precedent, not a structural analog. Structure `BudgetIndicator` as: a small always-visible summary line (`"$X of $Y remaining"`) using the same `text-black dark:text-zinc-50` base text convention seen throughout (`VideoStatusScreen.tsx:77`), with a client-side `useState` toggle revealing the per-type breakdown table — this is a new UI pattern, not a copy, but must match the established Tailwind palette (`zinc`/`red` families) and avoid introducing a new spacing increment or icon library per 04-UI-SPEC.md's constraint (cited in RESEARCH.md Pattern re: `VideoStatusScreen.tsx`'s own design comment).

**Props-drilled callback pattern** (`VideoStatusScreen.tsx:26-50`, `VideoStatusScreenProps`): keep `BudgetIndicator` a pure presentational component receiving a `BudgetStatusResult`-shaped prop plus no owned data-fetching — the parent page/server component calls `getBudgetStatusAction()` and passes the result down, same separation `page.tsx` already uses for `VideoStatusScreen`.

---

### `src/core/story/director.ts`, `src/core/uniqueness/check.ts`, `src/app/actions/generate-images.ts`, `src/app/actions/generate-video.ts`, `src/app/actions/get-story-status.ts` (re-point, modified)

**Analog:** each other (the pattern is already fully consistent across all five files) — this is a mechanical re-point, not new code.

**Import re-point** (`src/core/story/director.ts:1`, `src/core/uniqueness/check.ts:10`, `src/app/actions/generate-video.ts:6`):
```typescript
// BEFORE (all five files, same import shape):
import { CeilingExceededError, checkCeiling, recordSpend } from "../../lib/spend-ledger.ts";
// or (director.ts / get-story-status.ts, which don't need recordSpend):
import { checkCeiling, CeilingExceededError } from "../../lib/spend-ledger.ts";

// AFTER (re-point to the new module, same import shape/position):
import { BudgetExceededError, checkBudget, commitSpend } from "../budget/ledger.ts"; // adjust relative path per file depth
```

**Dispatch-boundary call shape, unchanged** (`generate-video.ts:225-274`, the canonical example — same shape in `director.ts:221-256` and `check.ts:227-244`):
```typescript
// D-03 (WR-02 fix): increment/checkCeiling immediately before the real
// paid dispatch, never before a local pre-dispatch failure.
await incrementVideoAttempt(storyId, sceneNumber);
let result;
try {
  result = await generateVideo({ ... });
} catch (err) {
  console.error(`generateSceneVideoAction: scene ${sceneNumber} threw`, err);
  await updateSceneVideo(storyId, sceneNumber, null, SceneAssetStatus.FAILED);
  return { ok: false, videoPath: null, videoDataUrl: null, message: "...", durationSeconds };
}
try {
  recordSpend({ call: `scene-video:${storyId}:${sceneNumber}`, model: VIDEO_MODEL_ID, estimatedUsd, usageMetadata: result.usageMetadata, billed: true, at: new Date().toISOString() });
} catch (err) {
  console.error(`generateSceneVideoAction: recordSpend failed for story ${storyId} scene ${sceneNumber} -- the Veo call succeeded and was billed, but this cost may be missing from the ledger`, err);
}
```
Replace `checkCeiling(estimatedUsd)` calls with `await checkBudget(estimatedUsd)` (now async since it hits Prisma) and `recordSpend({...})` calls with `await commitSpend({ estimatedUsd, ... })` (or fold into the existing `recordGeneration` call directly if the plan decides `ledger.ts`'s commit side IS `recordGeneration` — RESEARCH.md's "Recommended Schema" section explicitly recommends retiring the dual-write in favor of `GenerationRecord` alone). Preserve the exact try/catch-and-log-loudly shape around the commit call — never let a commit-side failure discard an already-paid-for asset (Pitfall 4).

**Read-only headroom-probe re-point** (`get-story-status.ts:116-130`, `MAX_SCENE_VIDEO_COST_USD` constant at `:27`):
```typescript
let budgetExceeded = false;
if (videoStatus === "FAILED" && !capReached) {
  try {
    checkCeiling(MAX_SCENE_VIDEO_COST_USD);
  } catch (err) {
    if (err instanceof CeilingExceededError) {
      budgetExceeded = true;
    } else {
      throw err;
    }
  }
}
```
Re-point to `checkBudget(MAX_SCENE_VIDEO_COST_USD)` / `BudgetExceededError`, `await` added since the new check is DB-backed — everything else (the conservative worst-case-cost constant, the catch-and-set-a-flag shape, never dispatching or recording) stays unchanged.

**Mutex generalization** (`generate-video.ts:33-36`):
```typescript
// CR-03 (04-REVIEW.md, second pass): app-wide serialization mutex for every
// call into dispatchSceneVideo -- see the generateSceneVideoAction wrapper
// below for the full rationale.
let videoDispatchChain: Promise<unknown> = Promise.resolve();
```
Per RESEARCH.md's Reserve/Commit Recommendation: extract this into a shared `budgetDispatchChain` mutex living in `src/core/budget/ledger.ts` (or a small dedicated `src/core/budget/dispatch-chain.ts`), and have `director.ts`, `check.ts`, `generate-images.ts`, and `generate-video.ts` each chain their dispatch through it — same `let chain: Promise<unknown> = Promise.resolve(); chain = chain.then(...)` idiom, just promoted from video-only to shared. `get-story-status.ts`'s read-only probe explicitly does NOT need the mutex (never dispatches).

---

## Shared Patterns

### Fail-closed numeric validation
**Source:** `src/lib/spend-ledger.ts:139-152` (`checkCeiling`'s own validation of `estimatedUsd` and `ceiling`)
**Apply to:** `checkBudget`, `monthlyBudgetUsd`, `ensureCurrentMonthAllocation` — every new numeric input (env-read or argument) must reject `NaN`/non-finite/non-positive with an explicit throw or safe-default, never silently comparing against `undefined`/`NaN` (which evaluates falsy in JS and would disarm the gate).
```typescript
if (!Number.isFinite(estimatedUsd) || estimatedUsd < 0) {
  throw new CeilingExceededError(`Refusing call: estimated cost ${estimatedUsd} is not a valid non-negative finite number.`);
}
```

### Injectable-default collaborator parameters
**Source:** `src/lib/db.ts:30-35`, `src/core/persistence/generation-repository.ts:73-78`, `src/lib/spend-ledger.ts:97` (`path: string = LEDGER_PATH`)
**Apply to:** every exported function in `src/core/budget/ledger.ts` and `month.ts` — trailing optional `client: PrismaClient = prisma` / `env: Record<string,string|undefined> = process.env` parameters, so tests inject fakes without mutating global state.

### Best-effort DB write contract, logged loudly never thrown
**Source:** `src/core/persistence/generation-repository.ts:8-22` (file header doc comment) and every function body (e.g. `:97-104`)
**Apply to:** any write path inside `checkBudget`'s commit half — must not discard an already-paid-for asset over a DB hiccup; log with `console.error` naming the story/scene/type, matching the exact wording style of `generate-video.ts:289-293`.

### Plain-language-only messages to the browser
**Source:** `src/core/approval/gates.ts:79-86,144-151` (retry-cap refusal messages), `generate-video.ts:308,315` (video failure messages)
**Apply to:** `BudgetExceededError` messages surfaced through `get-budget-status.ts` and `BudgetIndicator.tsx` — no raw provider errors, no stack traces, calm non-alarming tone matching Phase 4's established cap-reached copy.

### `"use server"` / `"use client"` boundary discipline
**Source:** `check-boundaries.ts` invariant 1 (no client import of provider/ledger/db) and invariant 3 (Server Actions reach DB only through `src/core/persistence/`)
**Apply to:** `src/core/budget/ledger.ts` must never be imported by `BudgetIndicator.tsx` directly — only through `get-budget-status.ts`'s Server Action, exactly as `spend-ledger.ts` is never imported by a "use client" file today.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/components/BudgetIndicator.tsx` (expand-for-detail interaction specifically) | component | request-response | No existing "tap to expand for detail" client component exists in the codebase yet (RESEARCH.md confirms zero existing UI for BUDGET-03); tone/palette precedent exists (`VideoStatusScreen.tsx`) but the expand interaction itself is new — flagged for the UI-SPEC step per CONTEXT.md's own note that exact layout is left to UI-SPEC, not locked here. |
| `currentMonthKey()`/`monthRange()` in `month.ts` | utility | transform | First UTC-month-key helper in the codebase; RESEARCH.md's own worked recommendation (plain `Date.prototype.getUTCFullYear()/getUTCMonth()`) is the pattern to follow, not an existing file. |
| `ensureCurrentMonthAllocation`'s upsert | service | CRUD | First `.upsert()` call in the codebase (all existing Prisma writes are `.create()`/`.update()`); RESEARCH.md's own Code Examples section supplies the exact snippet to use, vetted against Pitfall 5. |

## Metadata

**Analog search scope:** `src/lib/`, `src/core/retry/`, `src/core/persistence/`, `src/app/actions/`, `src/components/`, `src/core/story/`, `src/core/uniqueness/`, `prisma/schema.prisma`
**Files scanned:** 11 (all read in full this session: `spend-ledger.ts`, `caps.ts`, `caps.test.ts`, `get-story-status.ts`, `generate-video.ts` [imports + dispatch section], `generation-repository.ts`, `db.ts`, `director.ts`/`check.ts` [grep-located sections], `retry-scene-video.ts`/`regenerate-scene-image.ts` [grep-located sections], `VideoStatusScreen.tsx`, `prisma/schema.prisma` [grep-located model sections])
**Pattern extraction date:** 2026-09-19

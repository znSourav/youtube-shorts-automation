# Phase 1: Provider Smoke Test - Research

**Researched:** 2026-09-12
**Domain:** Google Gemini image generation + Veo 3.1 Lite image-to-video, called from Node.js/TypeScript
**Confidence:** MEDIUM (official docs verified live today, but Google's own documentation contains an internal inconsistency — see Common Pitfalls #1)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Run two test generations, not one — first a trivial generic image prompt (e.g. an object on a table) purely to prove raw plumbing, then a representative prompt using one real style preset plus an actual child-protagonist scene. The second call specifically probes whether Gemini's safety filters false-positive on wholesome children's-story content.
- **D-02:** Use "Soft hand-painted 2D" as the style preset for the representative test — Claude's discretion, not a dedicated decision cycle.
- **D-03:** Sequence the two providers rather than firing both blindly — confirm Gemini image generation works first (cheaper, more standard API surface), then only spend on the Veo call once a real generated image exists to feed it. Reversibility: reversible.
- **D-04:** Build a tiny standalone spend-ceiling utility starting in this phase — a flat local ledger (e.g. a JSON file) plus a hard-coded ceiling that every paid call in Phases 1-4 checks before firing, refusing with a clear message if it would exceed the ceiling.
- **D-05:** The dev/testing ceiling for Phases 1-4 combined is **$3.00 USD**, tracked by the same ledger file across all four phases (not reset per phase). Carved out of the same real $15 total, not additional to it. Reversibility: reversible.
- **D-06:** Smoke-test output files (generated images/videos) are written to a clearly separate `storage/_smoketest/` location, not mixed into the `storage/stories/<id>/` structure real episodes will use from Phase 2 onward. Reversibility: reversible.

### Claude's Discretion

- Whether to call the Google GenAI Node SDK versus raw REST calls via `fetch` — this phase's researcher (this document) resolves it: **use the `@google/genai` SDK** (see Standard Stack below).
- Project scaffolding approach: write the Phase 1 smoke test as real files inside the actual Next.js project structure this whole app will use (e.g. `src/providers/image/gemini-image.ts`, `src/providers/video/veo.ts`, invoked by a throwaway CLI script or a single unlisted API route) rather than fully disposable code outside the app. Only the *output artifacts* (D-06) and the *spend ledger* (D-04/D-05) are throwaway; the provider integration code itself is meant to survive into Phase 2.

### Deferred Ideas (OUT OF SCOPE)

- The full BUDGET-01..05 system (configurable monthly limit, per-category spend display, retry-aware budget checks, per-scene retry caps) belongs entirely to Phase 5 — D-04/D-05 here are intentionally minimal throwaway scaffolding, not an early implementation of that system.
- The real style-preset configuration system (all 6 styles, Style Bible generation) belongs to Phase 2 — D-02 only picks one preset informally for this phase's single test image.

</user_constraints>

## Summary

Phase 1 is a de-risking spike, not a feature build: prove Gemini image generation and Veo 3.1 Lite image-to-video both genuinely work end-to-end from this codebase, with real cost visible and errors surfaced clearly, before any persistence or UI investment happens.

The research confirms the project's Sept-2026-vintage prior verification (in PROJECT.md) is still accurate: Veo 3.1 Lite is model id `veo-3.1-lite-generate-preview`, priced at $0.05/sec (720p) and $0.08/sec (1080p), still in Preview status, supports image-to-video, 9:16, and 4/6/8-second durations at 720p (1080p is locked to 8s only — not a blocker since the phase targets 720p). The Gemini Developer API's "no API Client directed at under-18s" clause is also unchanged (terms last updated 2026-04-28).

The one genuinely new, high-value finding: **`@google/genai` is confirmed as the current, single, official Node/TypeScript SDK** covering text, native image generation, and Veo video generation together (the older `@google/generative-ai` package reached end-of-life 2025-11-30, so this is no longer even a close call). However, Google's own documentation is internally inconsistent about the *exact* call shape for image generation as of today — the dedicated image-generation docs page has migrated to a newer "Interactions API" surface, while the Veo docs page's own worked image-to-video example still uses the older `ai.models.generateContent` + `ai.models.generateVideos` pattern, and that example itself mixes response-shape conventions from two different Gemini API generations (see Pitfall #1). This is exactly the kind of drift a smoke-test phase exists to catch — the plan must treat the SDK call shape as something to verify empirically against the live API response (by logging the full raw response object) on the very first call, not something to copy from documentation blindly.

A second high-value, unplanned finding: this machine's Node.js v24.20.0 runs `.ts` files natively (verified locally, no `tsx`/`ts-node` needed) and supports `node --env-file=.env.local` for loading environment variables (also verified locally) — so the smoke-test CLI script needs **zero extra runtime dependencies** beyond `@google/genai` itself.

**Primary recommendation:** Use `@google/genai` (npm, latest `2.22.0`) called via `ai.models.generateContent` (image) and `ai.models.generateVideos` / `ai.operations.getVideosOperation` / `ai.files.download` (video), run directly with `node --env-file=.env.local <script>.ts` (no `tsx`, no `dotenv`), and write the script defensively: log the full raw response JSON on every call, explicitly branch on `promptFeedback.blockReason` / `finishReason` / `raiMediaFilteredReasons` rather than only checking for the presence of image/video bytes, and compute cost client-side from `usageMetadata`/duration since neither API returns a dollar figure directly.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Gemini image generation call | API/Backend (Node script or Next.js API route, server-side only) | — | Requires the secret API key; must never run client-side (SECURITY-01 applies from Phase 1 onward even though it isn't formally required until Phase 6) |
| Veo image-to-video call + polling | API/Backend | — | Same secret-key constraint; long-running poll loop belongs server-side, not in a browser tab |
| Spend ledger (D-04/D-05) | API/Backend | Database/Storage (flat JSON file on local disk) | A pre-flight check every paid call must pass through before firing; the ledger itself is just a local file, no DB needed at this scale |
| Generated output files (image PNG, video MP4) | Database/Storage (local filesystem, `storage/_smoketest/`) | — | D-06 locks this to a throwaway path, distinct from the real `storage/stories/<id>/` structure Phase 2+ will use |
| Cost/error reporting to the operator | API/Backend (console/log output) | — | Phase 1 has no UI; "printed or logged" per the phase's own success criteria is sufficient — no Browser/Client tier exists yet |

No Browser/Client, Frontend-SSR, or CDN/Static tier is in scope for Phase 1 — there is no UI in this phase (UI-01 is Phase 4).

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@google/genai` | `^2.22.0` (verified on npm registry, published 2026-09-10) | Single Node/TS SDK for Gemini text, image generation, and Veo video generation | Official Google package (`googleapis/js-genai`), 18M weekly downloads; the only supported path since `@google/generative-ai` reached end-of-life 2025-11-30 `[CITED: env.dev/guides/gemini-api-env-variables via WebSearch, cross-referenced with npm deprecation status]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| *(none required)* | — | — | Node.js v24 (installed on this machine, `[VERIFIED: local `node --version` → v24.20.0]`) runs `.ts` files natively and supports `node --env-file=.env.local` for env loading — both confirmed by running them directly in this environment (see Code Examples). No `tsx`, `ts-node`, or `dotenv` needed for this phase's throwaway/CLI-invoked script. |
| `typescript` | `7.0.2` (verified on npm registry) | Editor/type-checking only, not required at runtime given native `.ts` execution | Add as a devDependency once `package.json` exists so the rest of the Next.js project (Phase 2+) has type-checking; not load-bearing for Phase 1 itself |
| `@types/node` | `22.20.2` (verified on npm registry) | Type definitions for `process.env`, `fs`, `Buffer`, etc. during editing | Same as above — editor convenience only |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@google/genai` SDK | Raw REST via `fetch` | CONTEXT.md left this open explicitly. Raw REST is viable (Google publishes a REST reference) but requires hand-rolling the long-running-operation polling loop and multipart/base64 handling the SDK already provides via `ai.operations.getVideosOperation` and `ai.files.download`. No reason to hand-roll this for a phase whose whole point is speed to a working smoke test. |
| `ai.models.generateContent` (used in this research's recommendation) | `ai.interactions.create` (newer Interactions API, GA June 2026) | The Interactions API is Google's now-recommended *general* entry point and the image-generation docs page has fully migrated to it. However, no evidence was found of an Interactions-API-documented image→video chaining pattern equivalent to the Veo page's own generateContent→generateVideos example. Given Phase 1's single most load-bearing requirement is that exact chain (image feeds directly into video), staying on the path Google's own Veo docs demonstrate end-to-end is lower-risk than adopting the newer surface for only half the chain. **Flagged for empirical verification during execution — see Pitfall #1.** |
| Native Node `--env-file` | `dotenv` package | `dotenv` is the ecosystem-standard choice and would work fine (verified `[OK]` in Package Legitimacy Audit), but is unnecessary — Node 20+'s built-in `--env-file` flag does the same job with zero added dependencies `[VERIFIED: ran `node --env-file=.env.local` locally against a test .env file, printed the value correctly]`. |

**Installation:**
```bash
npm install @google/genai
npm install -D typescript @types/node
```

**Version verification:** Confirmed live against the npm registry on 2026-09-12:
```
npm view @google/genai version        → 2.22.0 (published 2026-09-10)
npm view typescript version           → 7.0.2
npm view @types/node version          → 22.20.2
```

## Package Legitimacy Audit

| Package | Registry | Age (latest publish) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----------------------|-----------|--------------|---------|-------------|
| `@google/genai` | npm | 2 days (2026-09-10) | 17.98M/wk | github.com/googleapis/js-genai | `[SUS]` — flagged only on the mechanical "too-new" signal (most recent *version bump*, not the package's actual age) | Approved with note — see below |
| `typescript` | npm | not separately audited (ubiquitous, not installed as a risk vector) | n/a | microsoft/TypeScript | not run | Approved (devDependency only, not runtime-critical) |
| `@types/node` | npm | not separately audited | n/a | DefinitelyTyped/DefinitelyTyped | not run | Approved (devDependency only) |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `@google/genai` — the legitimacy gate's "too-new" heuristic triggered purely because the most recent version (`2.22.0`) was published 2 days before this research ran. This is a false-positive pattern for a heavily-released, official Google SDK (18M weekly downloads, first-party `googleapis` GitHub org, no postinstall script). The planner should still add a lightweight `checkpoint:human-verify` before the first `npm install @google/genai` per protocol, but the verification is a one-line "confirm this resolves to `googleapis/js-genai` on npm," not a deep vetting exercise.

## Architecture Patterns

### System Architecture Diagram

```
operator (terminal)
      │
      │ runs: node --env-file=.env.local src/scripts/smoke-test.ts
      ▼
┌─────────────────────────────────────────────────────────────┐
│  smoke-test.ts (throwaway CLI entry point)                   │
│                                                                │
│   1. loadSpendLedger()  ──────► reads storage/_smoketest/    │
│                                 spend-ledger.json             │
│   2. checkCeiling(estimatedCost) ─► refuse + clear message   │
│      if projected total > $3.00                              │
│                                                                │
│   3. generateImage(prompt, styleConfig)                      │
│        │                                                      │
│        ▼                                                      │
│   src/providers/image/gemini-image.ts                        │
│        │  ai.models.generateContent({ model, contents, ... })│
│        ▼                                                      │
│   [Gemini API] ── inspect promptFeedback / finishReason ──►  │
│        │            before trusting image bytes present       │
│        ▼                                                      │
│   write PNG ──► storage/_smoketest/scene.png                 │
│   recordSpend(actualOrEstimatedCost) ──► spend-ledger.json    │
│                                                                │
│   4. generateVideo(imageBytes, motionPrompt)                 │
│        │                                                      │
│        ▼                                                      │
│   src/providers/video/veo.ts                                 │
│        │  ai.models.generateVideos({ model, image, config }) │
│        ▼                                                      │
│   [Veo API] ──► operation (long-running)                     │
│        │                                                      │
│        ▼  poll every ~10s                                    │
│   ai.operations.getVideosOperation({ operation })             │
│        │  inspect raiMediaFilteredReasons before assuming     │
│        │  success once operation.done === true                │
│        ▼                                                      │
│   ai.files.download(...) ──► storage/_smoketest/scene.mp4     │
│   recordSpend(durationSeconds * pricePerSecond)               │
│        │                                                      │
│        ▼                                                      │
│   5. print summary: files written, total cost, any provider  │
│      errors/blocks surfaced in plain text                     │
└─────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── providers/
│   ├── image/
│   │   └── gemini-image.ts     # generateImage(prompt, config) -> {bytes, mimeType, cost}
│   └── video/
│       └── veo.ts               # generateVideo(image, prompt, config) -> {filePath, cost}
├── lib/
│   └── spend-ledger.ts          # loadLedger(), checkCeiling(), recordSpend() — throwaway for Phases 1-4
└── scripts/
    └── smoke-test.ts            # throwaway CLI entry point calling the above in sequence
storage/
└── _smoketest/                  # D-06: throwaway output location, separate from storage/stories/<id>/
    ├── scene-generic.png
    ├── scene-childscene.png
    ├── scene-childscene.mp4
    └── spend-ledger.json
```

### Pattern 1: Defensive response inspection (not "check for bytes, assume success")

**What:** Every provider call result is classified by explicitly reading `promptFeedback`, `finishReason`, and (for Veo) `raiMediaFilteredReasons`/`raiMediaFilteredCount` *before* checking whether usable bytes are present — never the reverse.
**When to use:** Every single call in this phase, especially the D-01 child-protagonist probe, where a silent/ambiguous block would defeat the entire point of the test.
**Example:**
```typescript
// Source: ai.google.dev/api/generate-content (REST reference, field names verbatim)
// classify BEFORE checking for image bytes
if (response.promptFeedback?.blockReason) {
  console.error(`BLOCKED (prompt-level): ${response.promptFeedback.blockReason}`);
  // surface clearly, do not silently retry or hang
} else {
  const candidate = response.candidates?.[0];
  if (!candidate || candidate.finishReason?.startsWith('IMAGE_')) {
    console.error(`BLOCKED or incomplete (output-level): finishReason=${candidate?.finishReason ?? 'NO_CANDIDATE'}`);
  } else {
    // only now look for inlineData
  }
}
```

### Anti-Patterns to Avoid

- **Trusting the Veo docs page's image-generation code sample verbatim:** it calls `ai.models.generateContent(...)` but parses the response as `imageResponse.generatedImages[0].image.imageBytes` — that is the response shape for a *different* method (`generateImages`, the Imagen-family API), not `generateContent`'s actual `candidates[0].content.parts[].inlineData.data` shape. Copying this snippet as-is will likely throw a `TypeError` reading `.generatedImages` of `undefined`. See Pitfall #1.
- **Checking only for the presence of `inlineData`/video bytes to decide success:** as shown in a real reported bug (a third-party client library silently returned an empty result on a Gemini image-generation safety block because it never inspected `finishReason`), this produces exactly the "silent hang or uncaught crash" Phase 1's success criteria explicitly forbid.
- **Treating a single Veo rejection as definitive:** a real, closed-as-not-planned GitHub issue on `googleapis/js-genai` (#1272) documents non-deterministic false-positive RAI blocks where an identical prompt/image succeeds on retry. Don't conflate "this one attempt was blocked" with "this content is categorically unsupported" in the phase's reporting — log the exact `raiMediaFilteredReasons` text and note it may not reproduce.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Long-running video generation polling | Custom setTimeout/retry loop with manual operation-status parsing | `ai.operations.getVideosOperation({ operation })` from `@google/genai` | The SDK already wraps the exact polling contract Google's own Veo docs demonstrate; hand-rolling it risks missing operation-shape edge cases (e.g., error vs. done vs. still-running) |
| Downloading the resulting video file | Manual `fetch` + auth-header wiring to a separate files endpoint | `ai.files.download({ file, downloadPath })` | The SDK handles the auth header on the download step automatically — this was one of this phase's explicit open research questions and the SDK resolves it for free |
| .env loading for a CLI script | `dotenv` package, or manual `fs.readFileSync('.env.local')` parsing | Node's built-in `--env-file=.env.local` flag | Verified working locally on Node 24.20.0; zero added dependency for a throwaway script |

**Key insight:** Every piece of plumbing this phase needs (auth, image bytes in/out, long-running-operation polling, authenticated file download) is already provided by the official SDK. The only genuinely custom code this phase should write is the ~30-line spend ledger (intentionally minimal per D-04) and the response-classification logic in Pattern 1 above, which is product-specific (surfacing safety blocks clearly) rather than generic plumbing.

## Common Pitfalls

### Pitfall 1: Google's own Veo docs page mixes two incompatible Gemini API response shapes in one code sample

**What goes wrong:** The image-to-video worked example on `ai.google.dev/gemini-api/docs/veo` calls `ai.models.generateContent({ model: "gemini-3.1-flash-image-preview", prompt })` but then reads the result as `imageResponse.generatedImages[0].image.imageBytes`. The dedicated image-generation docs page (`ai.google.dev/gemini-api/docs/image-generation`) lists the canonical model id as `gemini-3.1-flash-image` (no `-preview` suffix) and shows a *different* API surface entirely (the newer Interactions API, `ai.interactions.create`, returning `output_image.data`). Neither of those matches `generateContent`'s actual documented response shape, `candidates[0].content.parts[].inlineData.data`.
**Why it happens:** Google's docs are mid-migration from `generateContent` to the new Interactions API (GA'd June 2026) and appear to have a stale/uncorrected code sample on the Veo page specifically — likely copy-pasted from an older Imagen-era (`generateImages`) example when the Veo page was last written.
**How to avoid:** Do not copy the Veo docs' image-generation snippet verbatim. Call `ai.models.generateContent({ model: "gemini-3.1-flash-image", contents: [...] })`, and on the very first real call, `console.log(JSON.stringify(response, null, 2))` the full raw object before writing any parsing code, so the actual shape returned by the SDK today is confirmed empirically rather than assumed from either doc page. This is squarely what a smoke-test phase is for.
**Warning signs:** `TypeError: Cannot read properties of undefined (reading '0')` or similar when accessing `.generatedImages[0]` — this means the docs' mismatched shape was trusted instead of the live response.

### Pitfall 2: Silent/ambiguous blocks look identical to a bug unless explicitly classified

**What goes wrong:** A response with no image and no thrown exception is genuinely ambiguous — it could mean "safety-blocked" (an important, reportable finding per this phase's own success criteria) or "our parsing code is wrong" (a bug). Naive code that only checks `if (imageBytes) { save } else { throw generic error }` cannot tell these apart, and per this phase's own explicit requirement, a provider error must "surface as a clear message... not a silent hang or an uncaught crash."
**Why it happens:** The natural code path is "look for success data, else assume failure" — but Gemini's block signal lives in a *different* field (`promptFeedback`/`finishReason`) than the success payload, and naive code never looks there.
**How to avoid:** Always inspect `promptFeedback.blockReason` and `candidate.finishReason` explicitly and print their exact values, regardless of whether image bytes are present. See Pattern 1.
**Warning signs:** The script exits with a generic "no image returned" error and no further detail — this is the exact failure mode the D-01 child-protagonist probe exists to catch and report precisely.

### Pitfall 3: A single Veo rejection may be a non-deterministic false positive, not a real policy block

**What goes wrong:** Treating one blocked Veo attempt as proof that Veo categorically rejects the content type (e.g., "Veo won't animate child-protagonist scenes") when a documented, real-world GitHub issue shows the same prompt/image succeeding on a subsequent retry.
**Why it happens:** Veo's RAI (responsible-AI) filtering has been reported as non-deterministic for at least the audio-safety category (googleapis/js-genai#1272, closed as not planned by Google — i.e., acknowledged behavior, not expected to change).
**How to avoid:** If Veo blocks the D-01 child-protagonist clip, log the exact `raiMediaFilteredReasons` text, and note in the phase's findings whether a retry was attempted and what it returned, rather than reporting a single block as definitive proof of non-viability.
**Warning signs:** N/A — this is a reporting-accuracy concern, not a code bug.

### Pitfall 4: Project has no `package.json`, no `.gitignore`, and no Next.js scaffold yet

**What goes wrong:** CONTEXT.md's discretion note assumes writing "real files inside the actual Next.js project structure," but `[VERIFIED: directory listing of project root, 2026-09-12]` the project currently contains only `.claude/`, `.git/`, and `.planning/` — no `package.json`, no `src/`, no Next.js app. If the plan assumes these exist, the first task will fail immediately.
**Why it happens:** This is genuinely the first phase of the project; STARTUP-01 (full Next.js app reachable at localhost:3000) isn't due until Phase 2.
**How to avoid:** Phase 1's plan must include a minimal-but-real scaffolding step first: `package.json` (with `@google/genai`, `typescript`, `@types/node`), a `tsconfig.json`, and a `.gitignore` that excludes `.env.local` and `storage/_smoketest/` outputs from `git status` noise (images/video binaries shouldn't be committed) — before any provider code is written. Full Next.js App Router scaffolding (`create-next-app`) is not required for Phase 1's throwaway CLI script and can be deferred to Phase 2, unless the plan specifically wants the "unlisted API route" option from CONTEXT.md's discretion note, in which case Next.js scaffolding must happen now instead.
**Warning signs:** N/A — checked directly.

## Code Examples

### Minimal Gemini image generation call (recommended shape, pending empirical confirmation — see Pitfall 1)

```typescript
// Source: @google/genai README (github.com/googleapis/js-genai) + ai.google.dev REST reference field names
import { GoogleGenAI } from "@google/genai";
import { writeFileSync } from "node:fs";

const ai = new GoogleGenAI({}); // picks up GEMINI_API_KEY or GOOGLE_API_KEY from env automatically

const response = await ai.models.generateContent({
  model: "gemini-3.1-flash-image", // canonical id per ai.google.dev/gemini-api/docs/models — NOT the "-preview" variant seen on the Veo page
  contents: prompt,
  config: {
    responseModalities: ["IMAGE"], // per REST reference field naming; confirm against logged raw response
    imageConfig: { aspectRatio: "9:16" },
  },
});

console.log(JSON.stringify(response, null, 2)); // ALWAYS log raw shape first run — see Pitfall 1

if (response.promptFeedback?.blockReason) {
  console.error(`Blocked: ${response.promptFeedback.blockReason}`);
} else {
  const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (part?.inlineData) {
    writeFileSync("storage/_smoketest/scene.png", Buffer.from(part.inlineData.data, "base64"));
  } else {
    console.error(`No image in response. finishReason=${response.candidates?.[0]?.finishReason}`);
  }
}
```

### Veo 3.1 Lite image-to-video with polling and download

```typescript
// Source: ai.google.dev/gemini-api/docs/veo (verbatim structure, model id corrected to the Lite variant)
let operation = await ai.models.generateVideos({
  model: "veo-3.1-lite-generate-preview",
  prompt: motionPrompt,
  image: { imageBytes: base64PngBytes, mimeType: "image/png" },
  config: { aspectRatio: "9:16", resolution: "720p", durationSeconds: "8" },
});

while (!operation.done) {
  console.log("Waiting for video generation to complete...");
  await new Promise((resolve) => setTimeout(resolve, 10000));
  operation = await ai.operations.getVideosOperation({ operation });
}

if (operation.response?.raiMediaFilteredCount) {
  console.error(`Blocked: ${operation.response.raiMediaFilteredReasons?.join("; ")}`);
} else {
  await ai.files.download({
    file: operation.response.generatedVideos[0].video,
    downloadPath: "storage/_smoketest/scene.mp4",
  });
  console.log("Saved storage/_smoketest/scene.mp4");
}
```

### Cost calculation (neither API returns a dollar amount directly)

```typescript
// Pricing verified live 2026-09-12 against ai.google.dev/gemini-api/docs/pricing
const IMAGE_PRICE_PER_CALL = { "gemini-3.1-flash-image": 0.067 }; // per generated image, model-dependent
const VIDEO_PRICE_PER_SECOND = { "720p": 0.05, "1080p": 0.08 };

const imageCost = IMAGE_PRICE_PER_CALL["gemini-3.1-flash-image"];
const videoCost = 8 /* durationSeconds */ * VIDEO_PRICE_PER_SECOND["720p"];
console.log(`Image cost: $${imageCost.toFixed(4)}  Video cost: $${videoCost.toFixed(2)}  Total: $${(imageCost + videoCost).toFixed(2)}`);
```

### Running the script with zero extra dependencies

```bash
# Both verified locally on this machine, 2026-09-12 (Node v24.20.0)
node --env-file=.env.local src/scripts/smoke-test.ts
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `@google/generative-ai` package | `@google/genai` unified SDK | EOL 2025-11-30 `[CITED via WebSearch]` | If any old tutorial/training-data code references `@google/generative-ai`, it is dead — do not use it |
| Dedicated Imagen models (`imagen-4.0-generate-001` etc.) for image generation | Native Gemini image models (`gemini-3.1-flash-image` family, "Nano Banana") | Imagen 4 shut down August 2026 per PROJECT.md, reconfirmed still the case today | Matches PROJECT.md's existing decision; no change needed |
| `generateContent` as Gemini's primary API surface | New "Interactions API" (`ai.interactions.create`) GA'd June 2026, now the documented default on the image-generation docs page | June 2026 | `generateContent` "remains fully supported" per official docs, and is what this research recommends for Phase 1 specifically because it's what the Veo page's own image→video example chains from — see Alternatives Considered |
| `tsx`/`ts-node` for running TypeScript scripts | Node's native `.ts` execution (type-stripping) | Confirmed working on Node v24.20.0 installed here | Removes a dependency for this phase's CLI script |

**Deprecated/outdated:**
- `@google/generative-ai`: end-of-life, do not install.
- Dedicated Imagen models: shut down, not available regardless.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | The exact `generateContent` request/response field names shown in Code Examples (`responseModalities`, `imageConfig.aspectRatio`, `candidates[0].content.parts[].inlineData`) are correct as of today, given Google's documented inconsistency (Pitfall 1) | Code Examples, Pitfall 1 | First real API call may need field-name adjustment; mitigated by the "log raw response first" instruction baked into the recommended code |
| A2 | `gemini-3.1-flash-image` (no `-preview` suffix) is billable/generally-available rather than allowlist-gated, since the models page lists it without a preview flag | Standard Stack, Code Examples | If actually preview/allowlist-gated, the call may 403/404 and the plan should fall back to `gemini-2.5-flash-image` (confirmed legacy-but-available) |
| A3 | The Interactions API does not yet document an image→video chaining pattern equivalent to the Veo page's `generateContent`→`generateVideos` example (based on an absence in the fetched Interactions API overview page, not an explicit "not supported" statement) | Architecture Patterns, Alternatives Considered | If it does exist, the recommended `generateContent` path is still valid (officially "fully supported") but the newer path might be smoother — worth a 5-minute check during Phase 1 execution before locking in the pattern for Phase 2 |
| A4 | `IMAGE_PRICE_PER_CALL` figures are effectively per-generated-image rather than a token-rate that could vary with image resolution/size choices | Code Examples (cost calc) | Actual per-call cost should still be cross-checked against `usageMetadata` token counts × the token-based price once the real response is seen, per the phase's own success criteria #3 |

**If this table is empty:** N/A — see entries above; none of these block starting the phase, all are resolvable by the "log the raw response and adjust" pattern this research recommends throughout.

## Open Questions

1. **Does the Interactions API support an image→video chaining recipe equivalent to the Veo page's `generateContent`→`generateVideos` example?**
   - What we know: The Interactions API overview page doesn't mention Veo at all; the Veo page's own worked example uses the older `models.generateContent`/`models.generateVideos` methods.
   - What's unclear: Whether this is because the Interactions API genuinely doesn't support this chain yet, or simply because that specific docs page hasn't been updated to show it.
   - Recommendation: Proceed with `models.generateContent`/`models.generateVideos` for Phase 1 (officially "fully supported," and it's the only *documented, chained* path found). Re-evaluate for Phase 2 once more usage-in-the-wild exists.

2. **What exact numeric cost does `usageMetadata` yield for a single `gemini-3.1-flash-image` call, and does it match the flat per-image price found on the pricing page?**
   - What we know: The REST reference confirms `usageMetadata` exists with token-count fields; the pricing page gives a flat effective per-image dollar figure.
   - What's unclear: Whether image generation is actually billed per-token (with a huge fixed token count per image) or as a flat per-call charge — this affects whether the cost-calculation code should read `usageMetadata` or just hardcode the per-image price.
   - Recommendation: Log `usageMetadata` on the first real call and compare against the flat price; this is squarely what Phase 1's success criteria #3 exists to establish empirically.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Node.js | Running the smoke-test script at all | ✓ `[VERIFIED: local check]` | v24.20.0 | — |
| npm | Installing `@google/genai` | ✓ `[VERIFIED: local check]` | 11.19.0 | — |
| git | Committing phase work | ✓ `[VERIFIED: local check]` | 2.55.0 | — |
| `package.json` / Next.js scaffold | Writing files into "the actual Next.js project structure" per CONTEXT.md discretion note | ✗ `[VERIFIED: directory listing, only `.claude/`, `.git/`, `.planning/` exist]` | — | Plan must scaffold a minimal `package.json` + `tsconfig.json` as its first task (see Pitfall 4); full `create-next-app` can be deferred to Phase 2 unless the "unlisted API route" option is chosen instead of a CLI script |
| `.gitignore` | Excluding `.env.local` (the API key) and binary output files from commits | ✗ `[VERIFIED: no `.gitignore` present at project root]` | — | Plan must create one before the API key file exists, not after |
| Gemini API key / GCP billing enabled | Making any real paid call at all | ✗ per `.planning/STATE.md` Blockers/Concerns: "Requester had not yet created the AI Studio API key / enabled billing at planning time" | — | No code-level fallback — this is a hard external blocker; the plan should surface this explicitly as a prerequisite/checkpoint before any paid-call task, not assume it's already resolved |

**Missing dependencies with no fallback:**
- Gemini API key / billing — Phase 1 cannot execute its paid-call success criteria without this. The plan must include an explicit checkpoint confirming the key exists (e.g., `.env.local` populated) before attempting any real API call.

**Missing dependencies with fallback:**
- `package.json`/Next.js scaffold and `.gitignore` — both are simple scaffolding tasks the plan itself must include as prerequisite steps; not blocking, just not yet done.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — greenfield project, no test infrastructure exists yet `[VERIFIED: directory listing]` |
| Config file | none — see Wave 0 |
| Quick run command | `node --env-file=.env.local src/scripts/smoke-test.ts` (the smoke-test script itself IS the verification for this phase) |
| Full suite command | same as quick run — this phase has no automated test suite, only the smoke script's own assertions |

### Phase Requirements → Test Map

Phase 1 carries no formal requirement IDs (explicitly, per ROADMAP.md and REQUIREMENTS.md — it is a technical spike). Its four success criteria map to manual/scripted checks embedded in the smoke-test script itself rather than a pytest/jest suite:

| Success Criterion | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| SC-1: image produced and viewable | Script writes a non-empty PNG to `storage/_smoketest/` | smoke (scripted assertion) | script asserts `fs.statSync(path).size > 0` after write, then operator opens the file manually | ❌ Wave 0 — script doesn't exist yet |
| SC-2: same image animated into playable MP4 | Script writes a non-empty MP4 to `storage/_smoketest/`, image bytes fed forward from SC-1's output | smoke (scripted assertion + manual playback) | script asserts file size > 0 and magic bytes look like a video container; operator plays the file manually | ❌ Wave 0 |
| SC-3: real per-call cost printed/logged | Script prints a cost line after each call | smoke (visual inspection of console output) | `node --env-file=.env.local src/scripts/smoke-test.ts` — read stdout | ❌ Wave 0 |
| SC-4: provider errors surface clearly, no silent hang/crash | Script classifies `promptFeedback`/`finishReason`/`raiMediaFilteredReasons` before declaring success or failure (Pattern 1) | smoke (intentionally trigger via the D-01 child-scene probe, inspect output) | same script, same run — this criterion is validated by the D-01 test call itself | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** Run the smoke script against whatever provider calls have been wired up so far (image-only first, per D-03's sequencing).
- **Per wave merge:** Full end-to-end run (image → video → cost summary) once both providers are wired.
- **Phase gate:** All four success criteria visibly satisfied in one script run before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `package.json` + `tsconfig.json` — no scaffold exists yet (Pitfall 4)
- [ ] `.gitignore` — must exist before `.env.local` is created, to prevent ever committing the API key
- [ ] `src/scripts/smoke-test.ts` — the script itself, which doubles as this phase's entire test suite
- [ ] `.env.local.example` — placeholder-filled, so the real `.env.local` pattern is established from Phase 1 even though SECURITY-01 isn't formally due until Phase 6

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | No | Single local user, no auth system exists or is needed at this scale |
| V3 Session Management | No | No sessions in a CLI script |
| V4 Access Control | Minimal | If the "unlisted API route" option is chosen instead of a CLI script, it must not be reachable from any client-facing nav/link — "unlisted" is a documented, intentional discretion-level weakening the plan should note explicitly, not silently rely on |
| V5 Input Validation | Yes | The smoke-test's prompts are hardcoded/developer-authored, not user input, so injection risk is minimal this phase — but the spend-ceiling check (D-04) is itself a form of input validation on cost and must run before every paid call, no exceptions |
| V6 Cryptography | No hand-rolling needed | No cryptographic operations in this phase beyond HTTPS transport, which the SDK handles |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| API key committed to git or logged to console | Information Disclosure | `.gitignore` excludes `.env.local` from the very first commit of this phase (Pitfall 4); never `console.log` full request objects that might contain the key — log response bodies, not request headers |
| Unbounded provider spend (a bug causing a retry loop, or simply forgetting the ceiling check) | Denial of Service (against the $15 budget, not a conventional service) | D-04/D-05's spend-ceiling check, called before every paid call, refusing with a clear message rather than firing — this is the phase's own explicit decision, research confirms no standard library is needed for something this simple (a flat JSON file read/check/write) |
| Committing generated binary output (images/video) to git | N/A (hygiene, not a security threat per se) | `.gitignore` should also exclude `storage/_smoketest/*.png` and `*.mp4` — keeps the repo clean and avoids accidentally publishing test content |

## Sources

### Primary (HIGH confidence)
- Direct local verification, 2026-09-12: `node --version` → v24.20.0; `npm --version` → 11.19.0; `git --version` → 2.55.0; `npm view @google/genai version` → 2.22.0 (published 2026-09-10); `npm view typescript version` → 7.0.2; `npm view @types/node version` → 22.20.2; native `.ts` execution and `node --env-file` both confirmed by running them directly in this environment; project root directory listing confirmed no `package.json`/`.gitignore`/Next.js scaffold exists.
- `gsd_run query package-legitimacy check` — `@google/genai` verdict SUS (too-new heuristic, false-positive per manual review of its actual signals: 17.98M weekly downloads, official `googleapis/js-genai` repo, no postinstall script), `tsx` verdict SUS (not used, see Alternatives Considered), `dotenv` verdict OK (not used, see Alternatives Considered).

### Secondary (MEDIUM confidence — official Google documentation fetched live today via WebFetch)
- `ai.google.dev/gemini-api/docs/models` — canonical image-generation model IDs
- `ai.google.dev/gemini-api/docs/image-generation` — Interactions-API image generation shape
- `ai.google.dev/gemini-api/docs/veo` — Veo image-to-video worked example (with the noted internal inconsistency, Pitfall 1)
- `ai.google.dev/gemini-api/docs/models/veo-3.1-lite-generate-preview` — model status, last updated 2026-08-18
- `ai.google.dev/gemini-api/docs/pricing` — Veo and image-generation pricing
- `ai.google.dev/api/generate-content` — REST schema field names (`usageMetadata`, `promptFeedback.blockReason`, `finishReason`)
- `ai.google.dev/gemini-api/docs/interactions-overview` — Interactions API scope and `@google/genai` version requirement (`2.3.0+`)
- `ai.google.dev/gemini-api/terms` — Additional ToS, confirmed still current (updated 2026-04-28) re: the under-18 API Client clause
- `github.com/googleapis/js-genai` (README) — SDK install/usage pattern
- `github.com/googleapis/js-genai/issues/1272` — real, first-party-repo bug report confirming Veo's blocked-video response shape (`raiMediaFilteredCount`/`raiMediaFilteredReasons`) and non-deterministic false-positive behavior; closed as not planned (i.e., Google-acknowledged, ongoing behavior)

### Tertiary (LOW confidence — third-party blogs/community, used only for corroboration, not as a primary source for any locked claim)
- `aifreeapi.com` post on Gemini image silent-failure detection patterns — used only to corroborate the response-classification approach in Pattern 1, not for any specific field name (those were cross-checked against the official REST reference)
- `apiyi.com` help-center posts on Veo 3.1 Lite duration/resolution constraints — used only to corroborate the 720p-vs-1080p duration limit, treat as needing a second confirmation if this ever becomes load-bearing beyond Phase 1

## Metadata

**Confidence breakdown:**
- Standard stack (`@google/genai` as the SDK choice, package versions): HIGH — directly verified against the npm registry and official SDK repo today
- API call shape (exact request/response field names for image generation): MEDIUM — official docs are internally inconsistent as of today (Pitfall 1); the plan must verify empirically on first real call
- Veo call shape and pricing: MEDIUM-HIGH — the Veo-specific docs page is internally consistent and was last updated 2026-08-18 (recent), pricing cross-checked against a second official page
- Pitfalls (safety-block response shapes, non-deterministic RAI filtering): MEDIUM — grounded in official REST reference field names plus a real, first-party GitHub issue, not just community blogs

**Research date:** 2026-09-12
**Valid until:** ~7 days (fast-moving domain — Google shipped a new "Interactions API" GA and multiple new model families within the last few months of this research; re-verify model IDs and call shapes if this phase's execution slips more than a week past this research date)

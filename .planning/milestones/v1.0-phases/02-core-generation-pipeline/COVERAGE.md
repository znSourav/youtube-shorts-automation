# API Coverage — Gemini text generation (Story Director surface, new in Phase 2)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Surface enumerated from `.planning/phases/02-core-generation-pipeline/02-RESEARCH.md` (live-verified 2026-09-12 against `ai.google.dev/api/generate-content`, `ai.google.dev/gemini-api/docs/structured-output`, `ai.google.dev/gemini-api/docs/models`) and `docs/original-brief.md` §10/§27.
>
> **Scope of this matrix:** the Gemini **text-generation** surface only. The image (`gemini-image:*`) and video (`veo:*`) surfaces were enumerated and decided in `.planning/phases/01-provider-smoke-test/COVERAGE.md` and are **not re-decided here** — Phase 2 consumes `src/providers/image/gemini-image.ts` and `src/providers/video/veo.ts` unchanged. The three `gemini-text:*` rows recorded in the Phase 1 matrix as forward-looking placeholders are superseded and re-decided in full below, against the same full-coverage baseline (no opt-out carried over silently).

| capability | decision | reason |
|---|---|---|
| `gemini-text:generate-content-single-turn` | INTEGRATE | The Story Director is one stateless request per story (`ai.models.generateContent`) — the call the whole phase is built on. |
| `gemini-text:response-mime-type-json` | INTEGRATE | `responseMimeType: "application/json"` is what makes the Story/Character Bible/Style Bible/scene-array output machine-parseable instead of prose to scrape. |
| `gemini-text:structured-output-response-schema` | INTEGRATE | `responseSchema` expresses the full nested shape of `docs/original-brief.md` §10 in one request (STORY-04, SCENE-01, SCENE-02). |
| `gemini-text:dynamic-array-bounds-min-max-items` | INTEGRATE | `minItems`/`maxItems` set per request to the caller's scene count is half of STORY-05's enforcement (the other half is the post-generation validator — schema enforcement is documented as best-effort, not a guarantee). |
| `gemini-text:max-output-tokens-configuration` | INTEGRATE | Explicitly set to 16384. The unset default of 8192 can truncate a 7-scene × 13-field response mid-JSON (RESEARCH.md Pitfall 2). |
| `gemini-text:system-instruction` | INTEGRATE | Carries the never-show-a-raw-prompt framing, the character-continuity instruction (SCENE-02), and the conservative-motion constraint (CR-03) without mixing them into the wife's own free text. |
| `gemini-text:multilingual-input` | INTEGRATE | Bangla script and romanized Banglish with no manual translation step (STORY-01, STORY-02) — the single most product-load-bearing text capability. |
| `gemini-text:model-tier-fallback` | INTEGRATE | `gemini-3.1-pro-preview` primary (creative-writing quality), `gemini-3.8-flash` GA fallback on 403/404 — same `isNotFoundOrForbidden` classifier `gemini-image.ts` already uses for its Preview-tier risk. |
| `gemini-text:usage-metadata-accounting` | INTEGRATE | `usageMetadata.promptTokenCount`/`candidatesTokenCount` logged on every call and recorded on every ledger entry — the empirical input Phase 5's real budget system (BUDGET-01..05) needs. |
| `gemini-text:block-reason-and-finish-reason-surfacing` | INTEGRATE | `promptFeedback.blockReason` and `candidates[0].finishReason` are classified before the response text is parsed, exactly as Phase 1 established for image/video. `MAX_TOKENS` specifically must be distinguishable from a content block. |
| `gemini-text:safety-settings-threshold-configuration` | OPT-OUT | No source artifact decides a threshold policy. Phase 1's D-01 probe showed default filters pass this product's actual content type; observing default behaviour is the decided position. Re-decide if a real block occurs. |
| `gemini-text:streaming-generate-content-stream` | OPT-OUT | A single synchronous structured-output call is what a Server Action needs; D-01's screens display a completed story, so there is no incremental-display consumer for a token stream. |
| `gemini-text:multi-turn-chat-sessions` | OPT-OUT | The Story Director is stateless per story. Regeneration re-runs the single call with a fresh prompt rather than continuing a conversation; no refinement loop is in scope this milestone. |
| `gemini-text:temperature-topk-topp-sampling` | OPT-OUT | No source artifact specifies a sampling policy. This phase's creative-quality lever is model tier plus prompt construction, not sampling parameters; model defaults are accepted deliberately. |
| `gemini-text:stop-sequences` | OPT-OUT | Meaningless under JSON mode — the response is bounded by `responseSchema`, not by a textual terminator. |
| `gemini-text:thinking-budget-configuration` | OPT-OUT | Text-generation cost is negligible against this project's $15 cap (dwarfed by a single Veo second), so there is no cost pressure to tune a thinking budget; defaults accepted. |
| `gemini-text:function-calling-and-tools` | OPT-OUT | Re-decided for this surface: the Story Director produces JSON, it orchestrates nothing. The app's own sequencing lives in Server Actions, not in model-driven tool calls. |
| `gemini-text:context-caching` | OPT-OUT | Re-decided for this surface: one call per story with a fresh prompt each time — there is no repeated prefix across calls worth caching at single-user scale. |
| `gemini-text:batch-api` | OPT-OUT | One in-progress story at a time by design (D-03: single page, no story library this phase). Nothing to batch. |
| `gemini-text:embeddings` | OPT-OUT | `.planning/PROJECT.md` Key Decisions explicitly rules out a vector database; UNIQUE-01..03 (Phase 3) use a deterministic fingerprint pre-filter plus a targeted LLM comparison. |
| `gemini-text:multimodal-prompt-parts-file-input` | OPT-OUT | The Story Director's input is text only — idea, character description, style preset id, mood, scene count. No image or file is fed to the text model. |
| `gemini-text:compare-stories` | OPT-OUT | The second `LLMProvider` method named in `docs/original-brief.md` §27. UNIQUE-01..03 are Phase 3 work; the interface slot is named now and implemented there, not stubbed here. |
| `gemini-text:interactions-api-surface` | OPT-OUT | Re-confirmed live 2026-09-12: `generateContent` remains fully supported for structured JSON output with no deprecation notice, and the installed `@google/genai@2.22.0` already exceeds the Interactions API's `2.3.0+` floor. Migrating adds a new API surface for zero capability gain this milestone. |

## Notes

- **Every `INTEGRATE` row above is exercised by Phase 2's own plans** — there are no aspirational rows. `model-tier-fallback` is the one row whose fallback branch may not fire during this phase's proof runs (it fires only on a 403/404 from the Preview-tier model); the branch is implemented and its absence of exercise is reported honestly rather than claimed as verified.
- **Nothing carried over silently.** The three `gemini-text:*` rows in Phase 1's matrix (`story-generation`, `structured-json-output`, `multilingual-input`) were forward-looking placeholders written before this surface was researched. They are superseded by the finer-grained rows above, each re-decided from a full-coverage baseline.
- **`safety-settings-threshold-configuration` is the one row most likely to need re-deciding.** It is an OPT-OUT by absence of a decision, not by a judgment that thresholds are wrong. If the Story Director is ever blocked on wholesome children's-story input, that opt-out becomes a live product decision, not an implementation detail.

*Matrix created: 2026-09-12 (phase planning) — durable subtraction record, extends rather than replaces `.planning/phases/01-provider-smoke-test/COVERAGE.md`.*

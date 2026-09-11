# API Coverage — Google Gemini Developer API (image generation, Veo 3.1 Lite video, Story Director text)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Surface enumerated from `.planning/phases/01-provider-smoke-test/01-RESEARCH.md` and `.planning/PROJECT.md` §Context — not from the provider's global endpoint catalogue.
> Single provider by decision (PROJECT.md Key Decisions: "Single provider: Google Gemini for LLM + image + Veo 3.1 Lite"), so one matrix covers the whole product surface.

| capability | decision | reason |
|---|---|---|
| `gemini-image:text-to-image` | INTEGRATE | Phase 1 proves it; every scene image in the product comes from this call. |
| `gemini-image:aspect-ratio-control` | INTEGRATE | `imageConfig.aspectRatio: "9:16"` — YouTube Shorts is portrait-only. |
| `gemini-image:model-tier-selection` | INTEGRATE | `gemini-3.1-flash-image` primary, `gemini-2.5-flash-image` documented fallback per RESEARCH.md Assumption A2. |
| `gemini-image:usage-metadata-accounting` | INTEGRATE | Required by ROADMAP Phase 1 SC-3 (real per-call cost known before the budget system is built on assumptions) and by BUDGET-01..05 in Phase 5. |
| `gemini-image:safety-block-reason-surfacing` | INTEGRATE | `promptFeedback.blockReason` / `candidate.finishReason` — required by ROADMAP Phase 1 SC-4 and probed directly by D-01's second call. |
| `gemini-image:image-editing-and-refinement` | OPT-OUT | Per-scene regeneration (IMAGE-02, Phase 4) re-generates from the scene prompt; the product never edits an existing image. |
| `gemini-image:multi-image-reference-conditioning` | OPT-OUT | Character consistency is carried by Character Bible prompt text across scenes (Phase 2 SC-4), not by image conditioning. |
| `gemini-image:safety-threshold-configuration` | OPT-OUT | No source artifact decides a threshold policy; Phase 1 observes and reports default-filter behaviour (D-01) rather than tuning it. Raising this would need a new decision. |
| `gemini-image:streaming-responses` | OPT-OUT | Generation is batch/background work behind a status screen (VIDEO-02, Phase 4); no consumer for a token stream. |
| `gemini-image:interactions-api-surface` | OPT-OUT | No documented image→video chaining recipe on `ai.interactions.create`; `generateContent` is officially fully supported. Re-evaluate in Phase 2 (RESEARCH.md Open Question 1). |
| `veo:image-to-video` | INTEGRATE | The single most load-bearing call in the product; Phase 1 exists to prove it. |
| `veo:text-to-video` | OPT-OUT | The product is image-first by design (PROJECT.md: approved scene images animate into clips); a text-to-video path would bypass the mandatory image-approval gate (APPROVAL-01). |
| `veo:aspect-ratio-9-16` | INTEGRATE | YouTube Shorts. |
| `veo:aspect-ratio-16-9` | OPT-OUT | Not part of this product — the channel is Shorts-only. |
| `veo:resolution-720p` | INTEGRATE | $0.05/sec; ROADMAP Phase 1 SC-2 names 720p explicitly. |
| `veo:resolution-1080p` | OPT-OUT | $0.08/sec is 1.6x the cost against a $15 total cap, and is locked to 8s only; 720p satisfies every stated criterion. |
| `veo:duration-4-6-8s` | INTEGRATE | Phase 1 exercises 4s (tracer) and 8s (representative probe) to establish both ends of the per-clip cost range empirically. |
| `veo:long-running-operation-polling` | INTEGRATE | `ai.operations.getVideosOperation` — RESEARCH.md "Don't Hand-Roll". |
| `veo:authenticated-file-download` | INTEGRATE | `ai.files.download` — RESEARCH.md "Don't Hand-Roll"; resolves the phase's auth-on-download open question for free. |
| `veo:rai-filter-reason-surfacing` | INTEGRATE | `raiMediaFilteredCount` / `raiMediaFilteredReasons` — required by ROADMAP SC-4; RESEARCH.md Pitfall 3 documents non-deterministic false positives that must be reported, not retried past. |
| `veo:audio-in-output` | OPT-OUT | Pass-through, deliberately untouched: PROJECT.md Key Decisions rules out ffmpeg and in-app audio stripping; audio is muted/replaced manually in CapCut. |
| `veo:reference-image-conditioning` | OPT-OUT | Not supported on the Veo 3.1 Lite tier at all (PROJECT.md §Context, reconfirmed in RESEARCH.md). |
| `veo:video-extension` | OPT-OUT | Not supported on the Veo 3.1 Lite tier at all (PROJECT.md §Context, reconfirmed in RESEARCH.md). |
| `gemini-text:story-generation` | INTEGRATE | Story Director (STORY-01..05); owned by Phase 2, recorded here because it shares the same API key, the same SDK client, and the same budget ledger. |
| `gemini-text:structured-json-output` | INTEGRATE | Character Bible / Style Bible / scene breakdown need machine-parseable output (Phase 2 SC-3, SC-4). |
| `gemini-text:multilingual-input` | INTEGRATE | Bangla and Banglish input with no manual translation step (Phase 2 SC-2). |
| `gemini-text:function-calling-and-tools` | OPT-OUT | Not part of this product — the Story Director produces text/JSON, it does not orchestrate tool calls. |
| `gemini-text:context-caching` | OPT-OUT | Not needed at this scale (single user, a handful of stories/month); adds a cache-lifecycle surface for no measurable saving against a $15 cap. |
| `gemini-text:embeddings` | OPT-OUT | PROJECT.md Key Decisions explicitly rules out a vector database for uniqueness; UNIQUE-01..03 use a deterministic pre-filter plus a targeted LLM comparison. |
| `gemini-api:vertex-ai-auth-surface` | OPT-OUT | PROJECT.md Key Decisions: plain Developer API key, not Vertex AI — faster setup, one key, one billing account. The ToS ambiguity was surfaced and consciously accepted. |

## Notes

- **Phase 1 exercises** every `INTEGRATE` row prefixed `gemini-image:` and `veo:`. The `gemini-text:` rows are integrated in Phase 2 and are recorded here because the matrix is a durable, product-level subtraction record, not a per-phase checklist.
- **Nothing was carried over silently.** This is the product's first integration, so there is no prior matrix whose opt-outs could leak in.
- **`veo:reference-image-conditioning` and `veo:video-extension`** are tier-unavailable rather than declined. If the project ever moves off the Lite tier, both rows must be re-decided rather than inherited.

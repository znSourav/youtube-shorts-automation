# Phase 2: Core Generation Pipeline - Context

**Gathered:** 2026-09-12
**Status:** Ready for planning

<domain>
## Phase Boundary

A wife-typed idea (Bangla or Banglish) flows automatically through the Story Director to a full set of local scene images and video clips for one story, proving the entire creative chain works. This is the first phase with a real Next.js app (STARTUP-01) and the first real LLM-driven story generation (STORY-01..05, SCENE-01/02) — built on Phase 1's already-proven, already-committed Gemini image and Veo providers (VIDEO-01). No persistence (SQLite/Prisma), no structural-uniqueness checking, and no polished review/approval UI belong to this phase — those are Phase 3, Phase 3, and Phase 4 respectively.

</domain>

<decisions>
## Implementation Decisions

### UI Scope
- **D-01:** Closer to the real flow, not bare-functional — distinct create/review/generate screens with basic Tailwind styling (no design polish), roughly matching the original brief's own mockups (`docs/original-brief.md` §9, §18, §19) in spirit. More work now than a raw-JSON throwaway page, but meaningfully reduces what Phase 4 has to rebuild. — **Reversibility:** reversible — these are just React components/pages, not an architectural commitment.
- **D-02:** Keep the image-first pause even with this lighter UI — a plain "Generate Videos" action that's only reachable once every scene image exists, honoring `docs/original-brief.md` §12's image-first cost-control principle (don't spend on video before a human/operator has had a chance to see the images). The *formal, server-enforced* approval gate (APPROVAL-01) is still Phase 4's job — Phase 2 just needs the natural sequencing, not the hard block.
- **D-03:** Single page for now — no `/stories/[id]` route yet. One page creates a story and carries it through story review → image review → video generation, in-memory/on-disk, without a story-library or per-story URL. Persistence (Phase 3) and the real library/routing (Phase 4) build on top of this later rather than Phase 2 pre-building routing structure they don't need yet.

### Proof-run scope (Claude's discretion — not selected for discussion)
- **D-04:** Use a reduced scene count (3, not the full 5-7) for the initial debugging passes while the Story Director's prompt engineering gets tuned — structured LLM output feeding into a multi-stage image+video pipeline rarely works perfectly on the first attempt, and the Phase 1-4 dev ceiling only has ~$1.80 of its $3.00 left (Phase 1 + the CR-03 follow-up already spent $1.2010). Once the pipeline is confirmed stable at small scale, run it once at a full 5-6 scene count to validate the real target range — not repeatedly at full scale while still debugging. This is a testing-cost decision, not a product constraint: `STORY-05`'s actual requirement (the *system* must support a wife-chosen 5-7 scene count) is unaffected — the scene count stays a parameter, never hardcoded.
- **D-05:** The specific story idea used for Phase 2's proof run(s) should be genuinely different from the CR-03 follow-up's "girl in a magical garden" content (already tested in Phase 1) rather than reusing it — the point of Phase 2 is proving the *Story Director* can turn a fresh idea into a full story, not re-running content already validated. Any reasonable original idea works; no specific idea was mandated.

### Claude's Discretion
- Whether the Story Director runs as one structured LLM call (story + Character Bible + Style Bible + fingerprint-shaped fields + scene plan together) or multiple sequential calls — lean toward one structured call for simplicity per `docs/original-brief.md` §10's own framing as a single structured output, but confirm Gemini's current structured-output/JSON-mode capability and token limits during research before locking this in.
- Exact mechanism for carrying character continuity into every scene's `image_prompt` (SCENE-02) — likely the full Character Bible text (or a condensed form of it) folded into every scene's image prompt rather than assumed-from-context, but the precise prompt-construction pattern is implementation detail for planning/research, not a founder-vision question.
- Which specific Gemini text model to use for the Story Director (Flash vs Pro-tier) — creative-writing quality matters here (avoiding generic "AI slop", meaningful emotional arcs), so this should be confirmed against current Gemini model docs during research, not assumed from Phase 1's image/video model choices.
- Whether Banglish input needs any special system-prompt handling or just works via Gemini's native multilingual capability — treat as an empirical question for the first real Story Director test, not a pre-built abstraction.
- The 6 named animation styles (`docs/original-brief.md` §26) need a config-driven Style Bible mapping (e.g. `core/story/styles.ts` or a small JSON config) — not hardcoded per-component prompts. This is already locked by the original brief and PROJECT.md, not a fresh decision, but flagged here since Phase 2 is where it must actually get built (STORY-04).
- Phase 1's existing provider files (`src/providers/image/gemini-image.ts`, `src/providers/video/veo.ts`) are extended/reused as-is (not rewritten) — Phase 2 adds a new `src/providers/llm/gemini.ts` for the Story Director alongside them, plus the real Next.js app scaffold (App Router) that Phase 1 deliberately did not build.

### Deferred Ideas (OUT OF SCOPE for Phase 2)
- SQLite/Prisma persistence, structural-uniqueness fingerprint comparison — Phase 3.
- Server-enforced approval gate, Story Library, real routing (`/stories/[id]`), full visual polish — Phase 4.
- Budget-guard formalization (the real `MONTHLY_BUDGET_USD` check, per-category spend display, configurable retry caps) — Phase 5. Phase 2 still routes every paid call through the existing Phase 1 spend-ledger/ceiling utilities (now proven and code-reviewed) as a stopgap, not a new budget system.
- Reliability/secrets hardening beyond what Phase 1 already built — Phase 6.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Original specification
- `docs/original-brief.md` §9 (wife's workflow UI mockup) — informs D-01's screen layout
- `docs/original-brief.md` §10 (Story Director output schema: Story, Character Bible, Style Bible, Scene plan fields) — the authoritative schema for STORY-04/SCENE-01/SCENE-02
- `docs/original-brief.md` §12 (image-first workflow) — informs D-02
- `docs/original-brief.md` §14 (video duration strategy — 4/6/8s per scene, don't default to max length) — governs per-scene duration choice, VIDEO-01
- `docs/original-brief.md` §17 (character consistency approach) — informs the continuity mechanism noted under Claude's Discretion
- `docs/original-brief.md` §18-19 (human approval / video generation UI mockups) — informs D-01
- `docs/original-brief.md` §26 (animation styles → Style Bible mapping, config-driven) — governs STORY-04's style system
- `docs/original-brief.md` §27 (provider abstraction interfaces: LLMProvider, ImageProvider, VideoProvider) — the LLM provider (new in Phase 2) must follow the same interface pattern Phase 1's image/video providers already established

### Project-level context
- `.planning/PROJECT.md` §Key Decisions — includes the Phase 1-validated motion-prompt constraint (avoid character pose-change requests in `motion_prompt` generation — camera/environmental motion only) and the confirmed single-provider (Gemini) architecture
- `.planning/REQUIREMENTS.md` — Phase 2 requirement IDs: STARTUP-01, STORY-01, STORY-02, STORY-03, STORY-04, STORY-05, SCENE-01, SCENE-02, VIDEO-01
- `.planning/ROADMAP.md` §Phase 2 — the 5 success criteria this phase must satisfy
- `.planning/phases/01-provider-smoke-test/01-RESEARCH.md` — current `@google/genai` SDK usage patterns, Pitfall 1 (docs-vs-actual-response-shape drift — log raw responses before trusting field names), Pitfall 2 (classify blockReason/finishReason before trusting output)
- `.planning/phases/01-provider-smoke-test/01-01-SUMMARY.md` through `01-04-SUMMARY.md` and `.planning/quick/260912-j3x-*/260912-j3x-SUMMARY.md` — what Phase 1 actually built and verified (provider files, spend ledger, response logger, real API shapes)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/providers/image/gemini-image.ts` — `generateImage()`, already handles classify-before-parse, mimeType-correct file extension (CR-02 fix), spend-ceiling gated. Reuse directly.
- `src/providers/video/veo.ts` — `generateVideo()`, already handles polling, RAI-block classification, `ai.files.download`. Reuse directly; note the CR-03 motion-prompt constraint applies to every future `motion_prompt` this phase generates.
- `src/lib/spend-ledger.ts` — `checkCeiling()`/`recordSpend()`/`loadLedger()`, fail-closed on malformed data (CR-01 fix). Every new paid call (including the new LLM calls) should route through this.
- `src/lib/log-response.ts` — `logRawResponse()`/`redactLargeStrings()`, secret-safe. Reuse for the new LLM provider's raw-response logging (Pitfall 1 applies to text/structured-output responses too, not just image/video).
- `.gitignore` already excludes `.env.local` and `storage/_smoketest/*` outputs — extend the pattern for wherever Phase 2's real story output lands (likely `storage/stories/`), consistent with the original brief §8's storage layout.

### Established Patterns
- Defensive response classification (check `blockReason`/`finishReason` before trusting output) — apply to the new Story Director LLM calls too, not just image/video.
- Spend-ceiling gate before every paid call, no exceptions — carries forward unchanged.
- `.env.local` holds `GEMINI_API_KEY`, read via `node --env-file` in Phase 1's CLI-script pattern; Phase 2 moves this into a real Next.js server-side environment (still never exposed client-side, per SECURITY-01 even though it's formally a Phase 6 requirement).

### Integration Points
- New: Next.js App Router scaffold (`src/app/`), a single page wiring the create-story form to a server action that calls the new LLM provider, then the existing image/video providers in sequence.
- New: `src/providers/llm/gemini.ts` implementing an `LLMProvider`-shaped interface (`docs/original-brief.md` §27) alongside the existing `ImageProvider`/`VideoProvider`-shaped modules.
- New: `src/core/story/` for Story Director orchestration logic (prompt construction, structured-output parsing) — kept separate from the React components per the brief's own architectural principle ("UI should not contain provider-specific AI logic").

</code_context>

<specifics>
## Specific Ideas

- Style presets must read as original visual directions, never as an attempt to reproduce a specific living artist's or studio's exact signature (`docs/original-brief.md` §9) — this constraint applies when writing the Style Bible config content for each of the 6 presets.
- Scene durations should vary (e.g. 6/6/4/6/6/6s), not default to the max every time (`docs/original-brief.md` §14) — matters for both realism of the proof-run cost estimate and for the eventual real product.

</specifics>

<deferred>
## Deferred Ideas

- Full persistence, uniqueness system, approval enforcement, story library, budget formalization, and reliability hardening — see `<decisions>` Deferred Ideas above for the phase-by-phase breakdown; not repeated here.

### Reviewed Todos (not folded)
None — discussion stayed within phase scope.

</deferred>

---

*Phase: 2-Core Generation Pipeline*
*Context gathered: 2026-09-12*

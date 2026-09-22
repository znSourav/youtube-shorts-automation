---
phase: "02"
slug: "core-generation-pipeline"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-09-13"
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser (wife) -> Server Actions | Form submissions from `CreateStoryForm`/`StoryReview`/`SceneCard` | Free-text idea/character description, style/mood/scene-count selections |
| Server Actions -> Gemini/Veo APIs | `createStoryAction`, `generateSceneImagesAction`, `generateSceneVideoAction` dispatch paid calls | `GEMINI_API_KEY`, constructed prompts, scene image bytes |
| Provider response -> local filesystem | Generated images/videos written under `storage/stories/<id>/scenes/NN/` | Story id and scene number used to build write paths |
| Server Actions -> Browser | Status, story content, and failure text surfaced to the wife | Story/scene content (intended), plain-language errors only (never raw provider text) |
| npm registry -> local install | Phase 2's `create-next-app` scaffold and new dependencies (next, react, react-dom, zod, eslint) | Package source code executed locally |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-SC | Tampering | `npx create-next-app` / `npm install` of next, react, react-dom, zod, eslint (plan 02-01) | high | mitigate | `gate="blocking-human"` package-legitimacy checkpoint before any install; download counts and source repos recorded in 02-RESEARCH.md; self-verified via `npm view <pkg> repository.url` this session | closed |
| T-02-09 | Tampering | `create-next-app` writing into the populated Phase 1 repo (plan 02-01) | high | mitigate | Scaffolded into `.scaffold-tmp/` with `--skip-install`, only non-conflicting paths copied, config files merged by hand; verified every Phase 1 artifact and secret file survived | closed |
| T-02-10 | Information Disclosure | `.env.local` (real `GEMINI_API_KEY`) during scaffolding (plan 02-01) | high | mitigate | `.env.local` explicitly excluded from every scaffold write; merged `.gitignore` asserted to still carry `.env.local`; confirmed never committed | closed |
| T-02-11 | Information Disclosure | Next.js client bundle reading the API key (plan 02-01) | medium | mitigate | Key stays unprefixed (no `NEXT_PUBLIC_`), server-only by default; structural gate lands as T-02-01 below | closed |
| T-02-01 | Information Disclosure | `GEMINI_API_KEY` reaching the client bundle via a client component importing a provider (plans 02-02, 02-03) | high | mitigate | Providers imported only from `src/core/`/`src/app/actions/`; `check-boundaries.ts` asserts structurally that `src/components/` (widened to every `"use client"` file per WR-03) never imports a provider or the ledger — verified passing live this session | closed |
| T-02-04 | Denial of Service (budget) | Every paid call site: Story Director LLM call (02-02), the per-scene image loop (02-03), the single-scene Veo call (02-04) | high | mitigate | `checkCeiling` runs immediately before every dispatch, `recordSpend` immediately after, at every one of the three call sites; no automatic retry on any path; `DEV_CEILING_USD` verified still `3.0` (never raised) with real ledger total $2.9370/$3.00 confirmed this session | closed |
| T-02-02 | Information Disclosure | Raw LLM response logged with secret-shaped or oversized fields (plan 02-02) | medium | mitigate | `logRawResponse` (Phase 1, unchanged) redacts `*key*`/`*token*`/`*authorization*`-shaped keys and truncates long strings | closed |
| T-02-03 | Tampering | Prompt injection via the wife's free-text idea overriding Story Director instructions (plan 02-02) | low | mitigate | User text placed in a delimited content section, never concatenated into the instruction section; `responseSchema` bounds response shape; zod `safeParse` + `validateScenePlan` reject non-conforming output; single trusted local user keeps impact low | closed |
| T-02-06 | Information Disclosure | Provider error strings, model ids, blockReasons, or filesystem paths rendered in the browser (plans 02-02, 02-03, 02-04) | medium | mitigate | Every action maps every failure mode to one plain-language sentence; verbatim provider text stays server-side via `logRawResponse`/console only; confirmed by direct source read of `create-story.ts`, `generate-images.ts`, `generate-video.ts` this session | closed |
| T-02-08 | Repudiation | A paid call that leaves no ledger record (plans 02-02, 02-03, 02-04) | medium | mitigate | `recordSpend` runs after every dispatch including blocked/timed-out ones. The 02-04 Veo call site originally under-counted a client-side polling timeout as `billed: false`; caught by this phase's code review (CR-01) and fixed to unconditional `billed: true`, verified present in current source | closed |
| T-02-07 | Tampering | `storage-paths.ts` building write paths from a model-supplied scene number and a story id (plans 02-03, 02-04) | medium | mitigate | Scene numbers validated as positive integers, story ids validated against a slug pattern before any path construction; anything else throws. WR-01 closed a residual gap in `sceneImagePath`'s extension parameter (`EXTENSION_PATTERN` guard), verified present in current source | closed |
| T-02-12 | Tampering | A model-generated `motion_prompt` requesting a character pose change, producing unusable (already-paid-for) footage (plan 02-04) | medium | mitigate | Prompt-level instruction in `buildStoryPrompt` constrains motion to camera/environment; `generateSceneVideoAction` adds a second-layer guard rewriting pose-change phrasing before dispatch; empirically validated via the Phase 1 CR-03 probe and this phase's own real video generations, both confirmed artifact-free by direct playback | closed |
| T-02-13 | Spoofing | A saved `.mp4` that is actually a text or image file (plan 02-04) | medium | mitigate | Container check asserts non-trivial file size and an `ftyp` box at byte offset 4 before acceptance; independently re-verified this session on both real generated clips | closed |

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
| 2026-09-13 | 13 | 13 | 0 | Claude (gsd-secure-phase, L1 short-circuit: register_authored_at_plan_time=true, asvs_level=1, threats_open=0) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-13

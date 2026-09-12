# AI Animated YouTube Shorts Studio

## What This Is

A local Next.js + TypeScript tool that turns a simple story idea (typed in Bangla or Banglish) into a complete original animated YouTube Short's worth of assets: an AI-written story with character/style bibles, a 5-7 scene breakdown, AI-generated scene images, and AI image-to-video clips — ready for manual assembly (voice, music, captions) in CapCut. Built for one non-technical user (the requester's wife) running it on her own Windows laptop.

## Core Value

One simple idea in → one genuinely original, structurally-unique animated episode's worth of local video assets out, without ever exceeding the $15 experiment budget or silently shipping a story that's a thin reskin of a previous one.

## Business Context

- **Customer**: The requester's wife — sole user, exploring whether an AI-animated YouTube Shorts channel is viable.
- **Revenue model**: YouTube ad monetization on original, AI-assisted animated Shorts (not built by this tool — this MVP only produces the raw clips; publishing and monetization happen manually, outside this tool).
- **Success metric**: Whether the concept is worth continuing past Month 1 — measured by whether the tool reliably produces structurally-original, usable episodes within budget, not by view counts (out of scope for this tool).
- **Strategy notes**: Full YouTube-policy reasoning (why the uniqueness system exists, what counts as "AI slop" to avoid) came from the requester's original build brief, provided in chat and not duplicated here.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Wife can type a story idea in Bangla or Banglish and get a coherent original story back
- [ ] Every story ships with a Character Bible, Style Bible, and 5-7 scene plan generated automatically — she never writes or sees raw prompts
- [ ] New stories are checked for structural similarity against all past stories (not just noun-swapping) and rejected/regenerated if too similar, up to a capped number of attempts
- [ ] Scene images generate before any video spend, with a mandatory human approval checkpoint and per-scene regeneration
- [ ] Approved scenes animate via Veo 3.1 Lite image-to-video (9:16, 720p, 4/6/8s), with independent per-scene status, retry, and progress display
- [ ] Every paid generation is checked against a configurable hard monthly budget ($15 default) before it fires — no exceptions, no infinite retries, no bypass via retry
- [ ] All stories, scenes, and generation records persist in local SQLite and survive an app restart
- [ ] Finished episode assets land in a predictable local folder structure, correctly numbered for CapCut import
- [ ] Story Library lists past stories with status, for both her and the uniqueness system

### Out of Scope

- Automated voice/music/SFX/caption generation — she adds these manually in CapCut
- Automated YouTube publishing — manual upload
- Authentication, multi-user support, cloud hosting, SaaS billing — single local user, single machine
- Redis, PostgreSQL, Kubernetes, n8n, complex job queues/microservices — unjustified complexity for a single-user local experiment
- Vector database for uniqueness checking — a cheap deterministic pre-filter plus a targeted LLM comparison is sufficient at this scale
- Reference-image and video-extension features of higher Veo tiers — the image-first workflow doesn't depend on them

## Context

- The requester supplied an extremely detailed build brief (externally authored via ChatGPT) covering architecture, data schema, UX flow, and a 34-item acceptance test checklist (AT-01 through AT-34). That brief is the primary spec — it was verified against current facts during brainstorming rather than re-derived from scratch.
- Provider facts verified against official docs during brainstorming (September 2026): Veo 3.1 Lite is model id `veo-3.1-lite-generate-preview`, priced at $0.05/sec at 720p and $0.08/sec at 1080p, still in paid preview status. Image-to-video, 9:16, and 4/6/8-second durations are confirmed; reference-image and video-extension features are not supported on this tier (expected — the image-first workflow doesn't need them). Imagen 4 is already deprecated (shut down August 2026), so image generation uses Gemini's native image models instead.
- A real commercial-terms nuance was surfaced and consciously accepted rather than ignored: the Gemini Developer API's Additional Terms of Service bar "API Clients... directed towards or likely to be accessed by individuals under 18." Judgment call made with the requester: the private, single-adult-operated local generation tool (not the downstream YouTube channel it feeds) is the "API Client" in the ToS sense. Proceeding on that reading rather than moving to Vertex AI, which would remove the ambiguity at the cost of a heavier setup (GCP project, billing account, service account credentials instead of one API key).
- Single-provider architecture: Google Gemini Developer API, one AI Studio API key, used for the LLM (Story Director), image generation, and video (Veo 3.1 Lite) alike — chosen over spreading across providers for simplicity of billing and budget tracking.
- At the time of planning, the requester had a Google account but had not yet created the AI Studio API key or enabled billing — expected to complete that in parallel with early implementation.

## Constraints

- **Budget**: $15 USD hard total cap for Month 1 (configurable via `MONTHLY_BUDGET_USD`), target actual spend $8-10. Every paid provider call must pass a pre-flight `current_month_spend + estimated_request_cost <= monthly_budget` check — no exceptions, no bypass via retry.
- **Tech stack**: Next.js (App Router) + TypeScript + SQLite (via Prisma) + local filesystem only, single process, started with one local command. Explicitly no separate backend service, no cloud infrastructure, no n8n.
- **Timeline**: Roughly 24 hours to a working golden-path MVP (idea → reviewed story → approved images → generated videos → local MP4s ready for CapCut) — not a polished product. Scope ruthlessly against this.
- **Commercial-use**: All generated assets must be commercially usable for a monetized YouTube channel — verified per-provider against current terms, never assumed from "an API exists" or "there's a free tier."
- **Platform**: Must run locally on the requester's Windows laptop with a single documented start command; no developer environment expected on the user's (wife's) side.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single provider: Google Gemini for LLM + image + Veo 3.1 Lite | One API key and billing account, simplest possible budget tracking, still clears the cost/commercial/capability bar | — Pending |
| Plain Gemini Developer API key, not Vertex AI | Faster setup; "API Client" in the ToS is judged to be the private local tool, not the YouTube channel | — Pending |
| No ffmpeg, no in-app audio stripping | Veo's MP4 passes through as-is; audio gets muted/replaced manually in CapCut as originally planned — avoids a native binary dependency for a 24-hour MVP | — Pending |
| Prisma as the ORM | Best Next.js/TypeScript developer experience for a single-developer local SQLite app: migrations, a type-safe client, and Prisma Studio for manual DB inspection while debugging | — Pending |
| Deterministic pre-filter + targeted LLM call for uniqueness, no vector database | Cheap and instant for the obvious cases; the LLM is only spent on borderline-similar candidates; avoids infrastructure the project doesn't need | — Pending |
| No automated test suite; rely on the acceptance-test checklist plus targeted unit tests for budget math and uniqueness scoring | Disproportionate effort for a 24-hour single-user MVP; the requester's own AT-01 through AT-34 checklist is the real verification gate | — Pending |
| `MONTHLY_BUDGET_USD` stays exactly $15, despite a real RM/USD mismatch discovered during Phase 1 execution (50 RM funded ≈ $11-12 USD at current rates, 80 RM eventual top-up ≈ $18-20 USD — neither matches $15 cleanly) | Requester's explicit choice: keep the originally-speced figure rather than resync to either the currently-funded or eventual-total RM amount; the app's own spend ledger (not Google's Billing API — real-time, zero-lag, and the actual enforced gate) is what checks against this number, so the mismatch is a funding-cushion question, not a code-correctness one | ✓ Good |
| No Google Cloud Billing API polling for live remaining-budget display | Billing data has an inherent multi-hour-to-day lag (aggregation pipeline, not real-time), so it would be a strictly weaker signal than the app's own zero-lag internal ledger if used as a gate — and reading real billing data needs billing-account-level IAM/service-account setup, a meaningfully bigger lift than an API key. The GCP billing alert already recommended during provider setup serves the same "catch drift against Google's real numbers" purpose via email, without the lag problem or the extra permissions | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-12 after initialization*

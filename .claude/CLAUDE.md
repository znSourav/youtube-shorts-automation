<!-- GSD:project-start source:PROJECT.md -->

## Project

**AI Animated YouTube Shorts Studio**

A local Next.js + TypeScript tool that turns a simple story idea (typed in Bangla or Banglish) into a complete original animated YouTube Short's worth of assets: an AI-written story with character/style bibles, a 5-7 scene breakdown, AI-generated scene images, and AI image-to-video clips — ready for manual assembly (voice, music, captions) in CapCut. Built for one non-technical user (the requester's wife) running it on her own Windows laptop.

**Core Value:** One simple idea in → one genuinely original, structurally-unique animated episode's worth of local video assets out, without ever exceeding the $15 experiment budget or silently shipping a story that's a thin reskin of a previous one.

### Constraints

- **Budget**: $15 USD hard total cap for Month 1 (configurable via `MONTHLY_BUDGET_USD`), target actual spend $8-10. Every paid provider call must pass a pre-flight `current_month_spend + estimated_request_cost <= monthly_budget` check — no exceptions, no bypass via retry.
- **Tech stack**: Next.js (App Router) + TypeScript + SQLite (via Prisma) + local filesystem only, single process, started with one local command. Explicitly no separate backend service, no cloud infrastructure, no n8n.
- **Timeline**: Roughly 24 hours to a working golden-path MVP (idea → reviewed story → approved images → generated videos → local MP4s ready for CapCut) — not a polished product. Scope ruthlessly against this.
- **Commercial-use**: All generated assets must be commercially usable for a monetized YouTube channel — verified per-provider against current terms, never assumed from "an API exists" or "there's a free tier."
- **Platform**: Must run locally on the requester's Windows laptop with a single documented start command; no developer environment expected on the user's (wife's) side.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->

## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

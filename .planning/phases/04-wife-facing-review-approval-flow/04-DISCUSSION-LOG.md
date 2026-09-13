# Phase 4: Wife-Facing Review & Approval Flow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-14
**Phase:** 4-Wife-Facing Review & Approval Flow
**Areas discussed:** Approval mechanism, Per-scene retry/regeneration limits, Video generation & status screen shape

---

## Approval mechanism — trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Deliberate explicit approval | A real "I approve these images" action she consciously takes | ✓ |
| Automatic once all images are ready | Keep today's existing pattern -- video unlocks with no extra click | |

**User's choice:** A deliberate, explicit approval action is required — not an automatic unlock.

## Approval mechanism — scope

| Option | Description | Selected |
|--------|-------------|----------|
| One approval for the whole story | A single "Approve all" action for the whole set of scene images | ✓ |
| Per-scene individual approval | Each scene needs its own explicit approve action | |

**User's choice:** One approval action covers the whole story's set of images.

---

## Per-scene retry/regeneration limits

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed numeric cap per scene | e.g. 3 attempts each, mirroring Phase 3's uniqueness-regeneration-cap pattern | ✓ |
| Budget-only limit | No artificial cap; only the real monthly budget check stops her | |

**User's choice:** A fixed numeric cap per scene, independent of the budget check.

---

## Video generation trigger

| Option | Description | Selected |
|--------|-------------|----------|
| One "Generate All Videos" action | A single click kicks off every approved scene's video | ✓ |
| Per-scene individual trigger | She clicks Generate Video separately per scene | |

**User's choice:** One batch action generates every approved scene's video.

## Video status screen

| Option | Description | Selected |
|--------|-------------|----------|
| New dedicated fourth screen | A genuinely new screen purpose-built for video job tracking | ✓ |
| Extend the existing image-review screen | Same screen grows video-status UI on scene cards | |

**User's choice:** A new, dedicated fourth screen.

---

## Claude's Discretion

- **Story Library appetite** (LIBRARY-01, soft requirement) was not selected for discussion. Stays exactly as ROADMAP.md/REQUIREMENTS.md frame it: attempt if time allows given the substantial scope of the other four decisions, document as a limitation if not — not re-litigated as a fresh topic.
- Exact numeric retry-cap default and exact plain-language copy for approval buttons, cap-exhaustion messages, and status labels — left to research/planning, informed by Phase 3's established D-04-style calm-messaging pattern.
- Output folder access mechanics (OUTPUT-01/03) — not separately discussed; existing `storage-paths.ts` conventions are the expected foundation.

## Deferred Ideas

None — discussion stayed within phase scope.

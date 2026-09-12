---
status: testing
phase: 01-provider-smoke-test
source: [01-VERIFICATION.md]
started: 2026-09-12T14:35:00Z
updated: 2026-09-12T14:35:00Z
---

## Current Test

number: 4
name: Decide how to respond to the CR-03 motion-coherence finding (head/body disconnect on scene-childscene.mp4)
expected: |
  A decision on next steps — see Gaps section.
awaiting: user response

## Tests

### 1. Play storage/_smoketest/scene-generic.mp4 in a media player
expected: ~4-second portrait (9:16) clip showing a ceramic teacup on a wooden table with visible motion (gentle camera drift / steam), not a frozen frame.
result: PASS — user confirmed working correctly.

### 2. Play storage/_smoketest/scene-childscene.mp4 in a media player
expected: ~8-second portrait (9:16) clip of a hand-painted-style girl in a glowing garden, with visible motion, matching the "Soft hand-painted 2D" style.
result: ISSUE — container/playback mechanics are fine, but a real motion-quality defect was found: when the girl's head turns backward, her torso stays facing forward — a body-horror-looking kinematic disconnect. User's exact words: "the head is on the back but the body is on the same front!!" See Gaps.

### 3. Judgment call — SC-4's unexercised provider-block-reporting branch
expected: A decision — accept the current evidence (code is structurally correct, classify-before-parse order verified by reading; the sibling budget-refusal error path was live-verified to print a clear message and exit 2, not hang; no genuine provider block occurred in either real run to exercise this exact branch) as sufficient for a technical-spike phase, or request a deliberate low-cost block-triggering test before Phase 2 relies on this code.
result: PASS — user accepted current evidence, no forced block test requested.

## Summary

total: 3
passed: 2
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

### CR-03 (new, UAT-discovered): Veo 3.1 Lite motion coherence breaks down on a head-turn request
**Severity:** Important finding, not a code defect — the pipeline plumbing (image gen -> video gen -> file write -> cost log) worked exactly as designed; this is a content-quality characteristic of Veo 3.1 Lite's output on this specific motion request.
**What happened:** `CHILD_MOTION_PROMPT` in `src/scripts/smoke-test.ts` asked for "the little girl looks around for her cat" — a relatively mild, vague request. Veo interpreted this as a head-turn-to-look-behind motion and animated the head independently of the torso, producing a kinematically incoherent (and visually disturbing) result: head faces backward while the body remains front-facing.
**Why it matters:** this is a real product-viability signal for an animated-story channel where characters need to move, gesture, and turn — not just an isolated glitch on one throwaway test clip. Directly relevant to Phase 2, where the Story Director will generate real per-scene motion prompts for actual episodes.
**Options presented to user:** (A) spend ~$0.20 more now to test a deliberately more conservative motion prompt (avoid requesting any body/head pose change; camera + environment motion only) and see if that avoids the artifact — direct, cheap signal for Phase 2's motion-prompt design; (B) accept as a known Veo 3.1 Lite limitation to design around in Phase 2 (favor camera/environmental motion prompts over character pose-change requests) and close Phase 1 now without further spend.
**Decision:** [pending — awaiting user response]

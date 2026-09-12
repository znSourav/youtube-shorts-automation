---
status: complete
phase: 01-provider-smoke-test
source: [01-VERIFICATION.md]
started: 2026-09-12T14:35:00Z
updated: 2026-09-12T13:14:48.838Z
---

## Current Test

number: 4
name: Decide how to respond to the CR-03 motion-coherence finding (head/body disconnect on scene-childscene.mp4)
expected: |
  A decision on next steps — see Gaps section.
result: RESOLVED — option (A) taken; conservative-motion probe run, artifact does not reproduce. See Gaps > CR-03.

## Tests

### 1. Play storage/_smoketest/scene-generic.mp4 in a media player
expected: ~4-second portrait (9:16) clip showing a ceramic teacup on a wooden table with visible motion (gentle camera drift / steam), not a frozen frame.
result: PASS — user confirmed working correctly.

### 2. Play storage/_smoketest/scene-childscene.mp4 in a media player
expected: ~8-second portrait (9:16) clip of a hand-painted-style girl in a glowing garden, with visible motion, matching the "Soft hand-painted 2D" style.
result: RESOLVED — container/playback mechanics were fine from the start; a real motion-quality defect was found (when the girl's head turns backward, her torso stays facing forward — a body-horror-looking kinematic disconnect; user's exact words: "the head is on the back but the body is on the same front!!"). Root-caused to the motion prompt's vague "looks around" language and closed via quick task 260912-j3x: a conservative-motion follow-up clip (scene-childscene-conservative.mp4) confirmed the artifact does not reproduce when the motion prompt avoids requesting any character pose change. See Gaps > CR-03 for full detail.

### 3. Judgment call — SC-4's unexercised provider-block-reporting branch
expected: A decision — accept the current evidence (code is structurally correct, classify-before-parse order verified by reading; the sibling budget-refusal error path was live-verified to print a clear message and exit 2, not hang; no genuine provider block occurred in either real run to exercise this exact branch) as sufficient for a technical-spike phase, or request a deliberate low-cost block-triggering test before Phase 2 relies on this code.
result: PASS — user accepted current evidence, no forced block test requested.

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

All 3 items resolved. Item 2's issue (CR-03 motion-coherence finding) was root-caused and empirically closed via a real follow-up probe, not merely accepted — see Gaps > CR-03.

## Gaps

### CR-03 (new, UAT-discovered): Veo 3.1 Lite motion coherence breaks down on a head-turn request
**Severity:** Important finding, not a code defect — the pipeline plumbing (image gen -> video gen -> file write -> cost log) worked exactly as designed; this is a content-quality characteristic of Veo 3.1 Lite's output on this specific motion request.
**What happened:** `CHILD_MOTION_PROMPT` in `src/scripts/smoke-test.ts` asked for "the little girl looks around for her cat" — a relatively mild, vague request. Veo interpreted this as a head-turn-to-look-behind motion and animated the head independently of the torso, producing a kinematically incoherent (and visually disturbing) result: head faces backward while the body remains front-facing.
**Why it matters:** this is a real product-viability signal for an animated-story channel where characters need to move, gesture, and turn — not just an isolated glitch on one throwaway test clip. Directly relevant to Phase 2, where the Story Director will generate real per-scene motion prompts for actual episodes.
**Options presented to user:** (A) spend ~$0.20 more now to test a deliberately more conservative motion prompt (avoid requesting any body/head pose change; camera + environment motion only) and see if that avoids the artifact — direct, cheap signal for Phase 2's motion-prompt design; (B) accept as a known Veo 3.1 Lite limitation to design around in Phase 2 (favor camera/environmental motion prompts over character pose-change requests) and close Phase 1 now without further spend.
**Decision:** Option (A) was taken — quick task 260912-j3x added a `--probe=childscene-conservative` mode and ran it once for real. The actual cost was **$0.4000** (8s x $0.05/sec at 720p), not the ~$0.20 the option text estimated — the UAT's original figure undercounted duration; corrected here so the real cost is unmissable rather than discovered after the fact.

**Follow-up probe result:**
- Command: `npm run smoke -- --probe=childscene-conservative`
- Source image reused (not regenerated): `storage/_smoketest/scene-childscene.jpg` (1,194,252 bytes) — ledger's `childscene-image` entry count stayed at 1, proving no image regeneration.
- Output: `storage/_smoketest/scene-childscene-conservative.mp4` (4,800,379 bytes)
- Actual cost: $0.4000 (one `childscene-conservative-video` ledger entry)
- Post-run ledger total: **$1.2010** of the $3.00 D-05 ceiling ($1.7990 headroom remaining)
- Original `storage/_smoketest/scene-childscene.mp4` confirmed byte-identical before and after the run (sha256 `b793cbc64e1ae4588d5940ac34894d3df80c10d344ce70d6c754d1bcaa963c29` unchanged), so the two clips could be compared side by side.
- **Verdict (human playback of both clips, back to back):** The head/torso kinematic disconnect does **NOT** reproduce under the conservative motion prompt — it is gone. The conservative clip still shows enough visible motion (softly pulsing flowers, drifting fireflies, gentle camera push-in) to read as alive and usable as an episode shot; it is not a frozen/still frame.

**Phase 2 implication:** The CR-03 artifact is motion-prompt-dependent, not an unconditional Veo 3.1 Lite limitation — a conservative motion prompt (camera drift + environmental motion only, no character pose-change language) avoids the head/torso disconnect while still producing visibly alive footage. The Story Director's per-scene motion-prompt generation should favor camera and environmental motion (drift, push-in, pulsing/glowing effects, particle motion, breeze-driven cloth/hair sway) and avoid requesting character body or head pose changes (turning, looking, reaching, walking, gesturing) as a default authoring constraint.

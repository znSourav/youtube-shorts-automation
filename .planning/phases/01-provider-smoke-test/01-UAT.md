---
status: testing
phase: 01-provider-smoke-test
source: [01-VERIFICATION.md]
started: 2026-09-12T14:35:00Z
updated: 2026-09-12T14:35:00Z
---

## Current Test

number: 1
name: Play storage/_smoketest/scene-generic.mp4 in a media player
expected: |
  ~4-second portrait (9:16) clip showing a ceramic teacup on a wooden table with visible motion (gentle camera drift / steam), not a frozen frame.
awaiting: user response

## Tests

### 1. Play storage/_smoketest/scene-generic.mp4 in a media player
expected: ~4-second portrait (9:16) clip showing a ceramic teacup on a wooden table with visible motion (gentle camera drift / steam), not a frozen frame.
result: [pending]

### 2. Play storage/_smoketest/scene-childscene.mp4 in a media player
expected: ~8-second portrait (9:16) clip of a hand-painted-style girl in a glowing garden, with visible motion, matching the "Soft hand-painted 2D" style.
result: [pending]

### 3. Judgment call — SC-4's unexercised provider-block-reporting branch
expected: A decision — accept the current evidence (code is structurally correct, classify-before-parse order verified by reading; the sibling budget-refusal error path was live-verified to print a clear message and exit 2, not hang; no genuine provider block occurred in either real run to exercise this exact branch) as sufficient for a technical-spike phase, or request a deliberate low-cost block-triggering test before Phase 2 relies on this code.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

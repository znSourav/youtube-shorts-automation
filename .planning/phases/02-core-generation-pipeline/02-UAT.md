---
status: testing
phase: 02-core-generation-pipeline
source: [02-VERIFICATION.md]
started: 2026-09-13T04:17:33Z
updated: 2026-09-13T04:17:33Z
---

## Current Test

number: 1
name: Full cold-start browser walkthrough (create -> review story -> generate images -> generate video)
expected: |
  Three distinct screens appear in order on one page with no URL change; the Generate Video
  control stays visibly disabled with a plain-language reason until every scene has an image,
  then enables; nowhere on any screen does a prompt, a model name, a file path, or developer/API
  terminology appear; the scene images visibly show the same character across scenes.
awaiting: user response

## Tests

### 1. Full cold-start browser walkthrough
expected: Three distinct screens appear in order on one page with no URL change; the Generate Video control stays visibly disabled with a plain-language reason until every scene has an image, then enables; nowhere on any screen does a prompt, a model name, a file path, or developer/API terminology appear; the scene images visibly show the same character across scenes.
result: [pending]

### 2. Play both real generated MP4 files
expected: Each plays; is portrait 9:16 at roughly 720p; shows visible, coherent motion; and does not show the head/torso kinematic disconnect the Phase 1 CR-03 probe identified (i.e. the second-layer motion-prompt guard in generate-video.ts actually produced usable, camera/environment-only motion).
result: [pending]

### 3. Read 02-PROOF-RUN.md and judge Character Bible / Style Bible / scene breakdown quality
expected: The bibles and scene purposes should read as specific, usable creative direction the wife could act on, not generic placeholder text.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

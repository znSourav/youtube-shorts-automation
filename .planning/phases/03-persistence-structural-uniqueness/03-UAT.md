---
status: testing
phase: 03-persistence-structural-uniqueness
source: [03-VERIFICATION.md]
started: 2026-09-14T00:15:00Z
updated: 2026-09-14T00:15:00Z
---

## Current Test

number: 1
name: Create-story flow shows no technical detail on screen
expected: |
  Review screen renders exactly as Phase 2 did, persistence work invisible to the wife;
  loading label is reassuring plain language.
awaiting: user response

## Tests

### 1. Create-story flow shows no technical detail on screen
expected: With `npm run dev` running, create a new story end-to-end in the browser: the in-flight button label reads as a calm, plain-language sentence (no technical wording, no hint of rejection), the review screen shows title/premise/story/both bibles/numbered scenes with no story id, database detail, or filesystem path visible anywhere on screen.
result: [pending]

### 2. D-04 exhaustion banner reads correctly
expected: A calm, non-red informational banner reading "This story turned out to be similar to one you've made before. You can use it anyway, or go back and try a different idea." -- no story title, id, score, attempt count, or reason code visible.
result: [pending]

### 3. Browser-restore click-through
expected: With an existing story already in the database, opening localhost:3000 in a fresh browser tab restores the last story's scenes/statuses automatically with no path visible; clearing the localStorage key and reloading falls back cleanly to the create screen with no error.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

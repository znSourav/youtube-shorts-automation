---
phase: "02"
slug: "core-generation-pipeline"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-12"
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in, no added dependency) — same pattern Phase 1 established |
| **Config file** | none — plain `node --test` invocation via `package.json`'s `test:lib` script |
| **Quick run command** | `npm run test:lib` (script's file list extended to include Phase 2's new test files) |
| **Full suite command** | same as quick run — no separate quick/full split; `node:test` runs are fast (unit tests, no network calls) |
| **Estimated runtime** | unit tests: seconds. Manual end-to-end proof runs: several minutes each (Veo polling dominates), real paid calls |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:lib` — fast, no network calls, no cost
- **After every plan wave:** One real end-to-end manual proof run at D-04's reduced scale (3 scenes) through the actual app UI
- **Phase gate:** One full-scale (5-6 scene) real run before `/gsd-verify-work`, per D-04's "confirm stable small, validate real range once" strategy — not repeated full-scale runs while still debugging

---

## Per-Task Verification Map

Task ID/Wave columns filled in once `/gsd-plan-phase` produces `02-*-PLAN.md`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | SCENE-01 | — | Scene numbering is 1..N, no gaps/duplicates, for valid and deliberately-malformed inputs | unit | `node --test src/core/story/validate-scene-plan.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | STORY-04 | — | Every one of the 6 style presets resolves to a complete style-bible seed with no missing fields | unit | `node --test src/core/story/styles.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SCENE-02 | — | Character-continuity folding mechanism actually inserts Character Bible fields into constructed prompts (mechanical check, not creative-quality judgment) | unit | `node --test src/core/story/director.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | STORY-05 | — | Structured-output schema produces `minItems === maxItems === n` for the requested scene count | unit | `node --test src/core/story/director.test.ts` (same file as above) | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | STORY-01, STORY-02, STORY-03, VIDEO-01, STARTUP-01 | T-01-01 (API key leak, carried forward) | Real end-to-end generation quality/behavior: Bangla vs Banglish coherence, no raw prompt ever shown, one full image→video chain | manual/smoke | Manual run through the app's screens (real paid API calls, human judgment on creative quality), per D-04/D-05's proof-run methodology | ❌ W0 — this is the app itself, not a script | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/core/story/validate-scene-plan.test.ts` — covers SCENE-01
- [ ] `src/core/story/styles.test.ts` — covers STORY-04
- [ ] `src/core/story/director.test.ts` — covers SCENE-02 (mechanical continuity check) and STORY-05 (schema shape)
- [ ] `package.json`'s `test:lib` script extended to include the three new test files above
- [ ] No new test framework install needed — `node:test` already proven in this repo

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bangla and Banglish input produce equally coherent stories | STORY-02 | Creative/linguistic quality judgment isn't scriptable; RESEARCH.md flags a real, evidence-backed risk that Banglish may degrade quality (academic study on a related task) — this needs an actual empirical side-by-side comparison, not an assumption of parity | Submit the same idea once in Bangla script and once in Banglish; compare story coherence, title/beginning/middle/ending presence |
| The wife-facing screens never expose a raw AI prompt | STORY-03 | UI/content judgment | Walk through create → review → generate; confirm image_prompt/motion_prompt text never renders anywhere in the UI |
| Generated Character Bible / Style Bible / scene breakdown read as coherent and usable, not garbled or generic | STORY-01, STORY-04 | Creative-quality judgment isn't scriptable | Read the full structured output from one real proof run |
| One scene image → Veo clip plays correctly (9:16, 720p, visible motion, no CR-03-style artifact) | VIDEO-01 | Visual/playback judgment isn't scriptable, same as Phase 1's AT-27-style checks | Open the generated MP4 in a media player |
| App starts with one documented command, no compile errors, reachable at localhost:3000 | STARTUP-01 | First-run experience judgment | Run the documented start command from a clean state |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency reasonable given real paid-call proof runs are inherently slower than Phase 1's
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

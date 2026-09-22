# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-09-23
**Phases:** 6 | **Plans:** 26 | **Sessions:** Multiple (at least one paused on a usage limit mid-Phase-6-execution and resumed in a later session)

### What Was Built
- The full creative pipeline: a typed idea (Bangla or Banglish) flows through a Story Director to a Character/Style Bible, a 5-7 scene breakdown, AI-generated scene images, and AI image-to-video clips — end to end, real providers, no simulation.
- A structural-uniqueness system (deterministic pre-filter + targeted LLM tie-breaker) that rejects reskinned stories on protagonist/conflict/mechanism/ending, not just surface nouns.
- The complete wife-facing flow (create → review → approve → generate → output) with a Story Library, using only plain-language UI and errors.
- A real, SQLite-backed monthly budget gate ($15 cap, configurable) wired into every paid dispatch app-wide via one serialized queue, with a live spend indicator and per-scene retry caps.
- Reliability, secrets-hygiene, and output-correctness hardening: differentiated provider-failure messaging, a bounded timeout on every provider HTTP call, real MP4 container/duration/aspect validation before any video is ever marked ready, and an automated secrets-hygiene gate.

### What Worked
- Risk-first phase sequencing (Phase 1 spent its entire budget proving the two paid, unproven provider APIs work before a single hour went into persistence or UI) paid off — no late-discovered provider incompatibility ever forced a redesign.
- The tracer-first pattern inside each phase (one real, thin, end-to-end slice proven before expanding) caught real bugs early and cheaply — e.g. Phase 3's Bangla-script tokenizer bug was caught from research alone, before it ever touched real data.
- Real, paid verification instead of assumed behavior repeatedly surfaced provider quirks no documentation predicted: Gemini's actual image MIME type, Veo's `durationSeconds` typing, the RAI block-reason shape, and — most surprisingly — that Bangla-script prompts and Banglish prompts have measurably different content-safety block rates in practice, the opposite of what pre-implementation research hypothesized.
- Independent, adversarial verification at every layer (code review, security audit, phase-goal verification, each a separate pass) reliably caught real defects the implementing pass missed. Phase 6 is the sharpest example: a security audit found two genuine high-severity gaps (an unbounded video download that could wedge the app's entire dispatch queue, and a path that could mark a corrupted video file "ready" unvalidated) that an earlier, already-thorough code-review pass missed entirely. A *second* audit pass then caught that the first fix's own justifying comment misdescribed the SDK — the fix still worked, but for a different, empirically-verified reason.
- The D-05 "free retry for a local failure after a successful paid call" pattern, established once (image save corruption), generalized cleanly to two more independently-discovered trigger points (video save corruption, then video download failure) with no new design work required.

### What Was Inefficient
- The original ~24-hour MVP timeline was abandoned almost immediately in favor of full process rigor, by explicit requester choice — worth naming plainly as a real miss against the original ask, not just a footnote, even though it was the right call.
- Several plans needed a genuine second corrective pass after first reaching "complete": Phase 4's checkpoint found a real restore-screen bug that needed fixing, not waiving; Phase 6's security-audit fix needed a second correction after a second audit pass caught a wrong technical claim in it. "First pass complete" was not a reliable signal on its own anywhere in this project — budget real contingency for a second pass as a norm, not an exception.
- A specific class of bug — money-correctness invariants (a timeout wrongly marked `billed: false`, a budget-check TOCTOU race, a dev-ceiling unit mismatch between RM and USD) — was independently rediscovered by review three separate times across three separate phases rather than being caught by a standing checklist the first time. This class of defect is subtle and recurring enough to deserve a dedicated up-front pattern doc for future money-handling code, not just per-phase review.

### Patterns Established
- Verify a third-party SDK's real behavior empirically when a security-relevant claim about it can be tested, not just read from source — reading `@google/genai`'s source alone produced a plausible-but-wrong claim about how its own timeout interacts with a stream download; a small reproduction script caught what the reading missed.
- The D-05 exemption pattern (a local, non-generation failure after an already-successful, already-billed paid call grants a one-shot free retry instead of consuming one of the scene's limited attempts) is now a proven, reusable template for any future "succeeded upstream, unconfirmed locally" failure mode.
- `check-boundaries.ts` is a living, evolving structural-invariant suite, not a write-once gate — invariants get hardened in direct response to real defects found (e.g. a "last occurrence" check widened to an "exact count" check after a second, earlier occurrence slipped through undetected), and the suite's own known limitations (textual pattern-matching, not real control-flow analysis) are tracked openly rather than overstated.

### Key Lessons
1. An independent adversarial pass (a fresh-context security or code review) reliably finds real, severity-worthy defects the implementing pass's own self-review misses, even inside an already-rigorous process — budget for it every phase, not only when something feels risky.
2. Reading a dependency's source is necessary but not sufficient to know its real runtime behavior; when a security-relevant claim about third-party behavior can be tested empirically, test it before writing it into a comment as fact.
3. "Local failure after an already-successful, already-billed paid call" is a distinct, recurring failure category — worth its own dedicated exemption path everywhere it can occur, not a one-off special case.
4. Real per-provider content-safety and commercial-terms quirks are not reliably knowable from documentation or general model knowledge; they require real paid calls, read carefully, before the assumption is trusted anywhere downstream — twice in this project, the pre-implementation hypothesis about which script/wording was "riskier" was proven backwards by real data.

### Cost Observations
- Model mix: predominantly Sonnet 5 for phase planning/execution/code-review work; Opus reserved specifically for the higher-stakes verifier and security-auditor agent roles.
- Sessions: spanned multiple sessions, including at least one interrupted mid-Phase-6-execution by a usage limit and resumed later with full context intact.
- Notable: total real provider spend across the entire 6-phase, 26-plan milestone was $5.0720 of the $15.00 budget — despite extensive *real* (never simulated) paid verification at every phase, the tool never came close to its own hard ceiling.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | Multiple | 6 | Established the full GSD pipeline (discuss → research → plan → plan-check → execute → code-review → security-audit → verify → UAT → transition) as the standing default for every phase, chosen deliberately over the original 24-hour deadline. |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 324 (`node:test`, no framework) | Every phase's success criteria independently verified (code review + security audit + phase-goal verification + UAT) | `mp4box` (pinned, audited) — the only new runtime dependency added across the whole milestone |

### Top Lessons (Verified Across Milestones)

1. Independent adversarial verification (review, audit) finds real defects self-review misses — verified repeatedly within v1.0 itself, not yet cross-milestone.

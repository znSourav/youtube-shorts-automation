---
phase: 01-provider-smoke-test
fixed_at: 2026-09-12T14:20:00Z
review_path: .planning/phases/01-provider-smoke-test/01-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-09-12T14:20:00Z
**Source review:** .planning/phases/01-provider-smoke-test/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (critical + warning): 7
- Fixed: 7
- Skipped: 0

**Verification environment:** `workflow.use_worktrees` is `false` in `.planning/config.json`, so all edits, syntax checks, and test runs below were performed directly in the main checkout (no isolated worktree was created). These results are reproducible from this same working tree.

## Fixed Issues

### CR-01: Spend ceiling gate trusts the on-disk ledger shape and silently no-ops on a malformed ceiling or entry

**Files modified:** `src/lib/spend-ledger.ts`
**Commit:** 79e9a2c
**Applied fix:** `checkCeiling` now validates the *loaded* ledger's `ceilingUsd` (must be finite and `> 0`) in addition to the caller-supplied estimate, throwing `CeilingExceededError` if it is missing or malformed. `totalSpentUsd` now validates each entry's `estimatedUsd` (finite, non-negative) and throws rather than silently treating a bad entry as $0. This closes the fail-open path the review demonstrated (`someNumber > undefined` → `false`), making the gate fail closed on any malformed on-disk state — no exceptions, no bypass. All 11 existing `spend-ledger.test.ts` cases pass unchanged.

### CR-02: Generated image files are written with a hardcoded `.png` extension regardless of actual content type

**Files modified:** `src/scripts/smoke-test.ts`, `.gitignore`; renamed on-disk artifacts `storage/_smoketest/scene-generic.png` -> `scene-generic.jpg` and `scene-childscene.png` -> `scene-childscene.jpg`
**Commit:** d3b4b6d
**Applied fix:** Added `extensionForMimeType(mimeType)` (png/jpg/webp, with a documented `.png` fallback for an unrecognized/missing mimeType) and used it at both write call sites instead of hardcoding `.png`. Verified via `git ls-files storage/_smoketest/` that only `spend-ledger.json` is git-tracked in that directory — the `.png`/`.mp4`/`.log` artifacts are gitignored, so renaming the two mislabeled files (confirmed JPEG via byte-signature `FF D8 FF E0`) to `.jpg` needed no commit for the artifacts themselves. Extended `.gitignore`'s `storage/_smoketest/` patterns to also cover `*.jpg` and `*.webp` so future runs' correctly-extensioned artifacts stay ignored the same way `*.png` already was.

### WR-01: `redactLargeStrings` false-positives "[CIRCULAR]" for shared (non-cyclic) object references

**Files modified:** `src/lib/log-response.ts`
**Commit:** 37c6504
**Applied fix:** `redactValue` now removes each object from the `seen` `WeakSet` after its children have been processed (`seen.delete(value)` in both the array and object branches), so `seen` tracks only the current ancestor path rather than every object visited anywhere in the whole tree. A true cycle (object still on the current path) is still reported as `[CIRCULAR]`; a "diamond" reference from two separate, non-nested branches is now redacted normally. All 8 existing `log-response.test.ts` cases pass unchanged, including the genuine self-reference cycle test.

### WR-02: `checkCeiling` + `recordSpend` are not atomic — a TOCTOU race is a real bypass path

**Files modified:** `src/lib/spend-ledger.ts`
**Commit:** ce1a5f7
**Applied fix (partial mitigation, documented as such):** Added an exclusive-create lock file (`writeFileSync(lockPath, "", { flag: "wx" })`, short poll/backoff, 2s timeout) guarding `recordSpend`'s read-modify-write, closing the data-loss half of the race — two concurrent `recordSpend` calls can no longer silently clobber each other's ledger entry. This does **not** close the full `checkCeiling`-then-dispatch-then-`recordSpend` window (two processes can still both pass `checkCeiling` against the same pre-dispatch snapshot before either records) — fully eliminating that requires a reserve-then-commit ledger schema redesign, which changes the `LedgerEntry` shape and the public API contract exercised by the existing test suite. Given this file's safety-criticality, that larger redesign was deliberately deferred rather than rushed through an automated fix pass; it is called out here for a human decision, and is a natural fit for Phase 5's real budget system. Manually verified the lock mechanism (acquire blocks while held, times out after ~2s, releases and succeeds once free — see commit message) since true multi-process concurrency is hard to exercise from this environment. All 11 existing `spend-ledger.test.ts` cases pass unchanged.

### WR-03: `runReport()` has no error handling, unlike its sibling probe functions

**Files modified:** `src/scripts/smoke-test.ts`
**Commit:** 11740d6
**Applied fix:** Wrapped `runReport()`'s body in the same `try { ... } catch (err) { ... }` pattern as `runGenericProbe`/`runChildsceneProbe` (exit code 2 for `CeilingExceededError`, 1 for anything else), so a corrupted/unparseable ledger now produces the script's own error-reporting convention instead of an unhandled exception.

### WR-04: `formatLogArg` silently loses information for non-`Error` thrown values

**Files modified:** `src/scripts/smoke-test.ts`
**Commit:** c5fcadd
**Applied fix:** Replaced the `String(arg)` fallback with `util.inspect(arg, { depth: null })` for non-string, non-`Error` values, so a plain-object thrown value (e.g. the `{status?, code?}`-shaped SDK errors this call chain produces) is now written to the persisted `.log` file the same way it already appears on the live terminal, instead of collapsing to `"[object Object]"`.

### WR-05: `package.json` has no `engines` field despite depending on a Node-version-sensitive CLI flag

**Files modified:** `package.json`
**Commit:** c3c1949
**Applied fix:** Added `"engines": { "node": ">=20.6.0" }`, matching the version floor required by the `smoke` script's `node --env-file=.env.local` flag.

## Skipped Issues

None — all 7 in-scope findings (2 critical, 5 warning) were fixed. Info-tier findings (IN-01 through IN-04) were out of scope for this run (`fix_scope: critical_warning`).

## Post-fix verification

Run from the main checkout (no worktree; `workflow.use_worktrees` is `false`):

```
$ npm run typecheck
> tsc --noEmit
(no output — clean)

$ node --test src/lib/spend-ledger.test.ts
ℹ tests 11
ℹ pass 11
ℹ fail 0

$ node --test src/lib/log-response.test.ts
ℹ tests 8
ℹ pass 8
ℹ fail 0
```

All pre-existing tests pass unchanged after all 7 fixes; `npm run typecheck` reports no errors.

**Note for the developer:** WR-02's fix is a partial mitigation (see above) — the remaining cross-process check-then-dispatch race is a real, acknowledged residual risk for this phase's single-user smoke-test tool, not a false alarm to dismiss. Recommend re-evaluating with a reserve-then-commit ledger design when Phase 5's real $15 budget system is built.

---

_Fixed: 2026-09-12T14:20:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

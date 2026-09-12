---
phase: 01-provider-smoke-test
plan: 01
subsystem: infra
tags: [nodejs, typescript, npm, google-genai, esm, scaffold]

# Dependency graph
requires: []
provides:
  - "Minimal TypeScript/ESM project scaffold (package.json, tsconfig.json, .gitignore, .env.local.example)"
  - "@google/genai 2.22.0 installed and its GoogleGenAI export verified to resolve under this project's ESM config"
  - "Secrets hygiene convention (.env.local gitignored before it can exist; spend-ledger path deliberately tracked)"
affects: [01-02, 01-03, 01-04]

actuals:
  tokens: 8200
  tasks: 3
  commits: 2

tech-stack:
  added: ["@google/genai@2.22.0", "typescript@7.0.2", "@types/node@22.20.2"]
  patterns:
    - "Node v24 native .ts execution via `node --env-file=.env.local`, zero tsx/ts-node/dotenv dependencies"
    - ".gitignore written before any secret-bearing file can exist (T-01-01)"
    - "storage/_smoketest/ output isolated from storage/stories/<id>/, spend-ledger.json deliberately un-ignored (D-05/D-06)"

key-files:
  created:
    - package.json
    - package-lock.json
    - tsconfig.json
    - .gitignore
    - .env.local.example
  modified: []

key-decisions:
  - "Human confirmed @google/genai's npm page resolves to github.com/googleapis/js-genai under the @google scope before install, clearing RESEARCH.md's [SUS] too-new-heuristic false positive (T-01-SC)."
  - "No tsx/ts-node/dotenv added — Node v24.20.0 natively runs .ts and supports --env-file, verified locally in RESEARCH.md."

patterns-established:
  - "Pattern: .gitignore precedes any file it protects — applied here for .env.local, will generalize to any future secret file in this project."

requirements-completed: []  # Phase 1 carries no requirement IDs by design (technical spike) — see PLAN.md frontmatter note.

coverage:
  - id: D1
    description: "Project scaffold (package.json, tsconfig.json, .gitignore, .env.local.example) created with exact version pins and .env.local gitignored before it can exist"
    verification:
      - kind: unit
        ref: "node -e SCAFFOLD OK inline check (PLAN.md Task 1 <verify>)"
        status: pass
      - kind: unit
        ref: "git check-ignore -q .env.local && ! git check-ignore -q storage/_smoketest/spend-ledger.json (PLAN.md Task 1 <verify>)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Human confirmed @google/genai package legitimacy before install (npm Repository link = googleapis/js-genai, publisher = @google scope)"
    verification: []
    human_judgment: true
    rationale: "gate=\"blocking-human\" checkpoint by design — package-legitimacy confirmation is never auto-approvable, in any mode."
  - id: D3
    description: "@google/genai 2.22.0 installed; GoogleGenAI export resolves via dynamic import under this project's ESM config; EOL package @google/generative-ai confirmed absent"
    verification:
      - kind: unit
        ref: "node -e SDK OK GoogleGenAI @ 2. inline check (PLAN.md Task 3 <verify>)"
        status: pass
    human_judgment: false

duration: 4min (Task 1 to Task 3 commits) + checkpoint wait
completed: 2026-09-12
status: complete
---

# Phase 1 Plan 1: Scaffold and SDK Install Summary

**Minimal TypeScript/ESM scaffold with @google/genai 2.22.0 installed and its GoogleGenAI export verified to resolve, secrets hygiene established before any key file exists.**

## Performance

- **Duration:** ~4 min of active execution across the two commits (checkpoint wait time between Task 1 and Task 3 excluded)
- **Started:** 2026-09-12T03:39:19Z (Task 1 commit)
- **Completed:** 2026-09-12T03:43:28Z (Task 3 commit)
- **Tasks:** 3 (Task 1 auto, Task 2 checkpoint:human-verify, Task 3 auto)
- **Files modified:** 5 (package.json, package-lock.json, tsconfig.json, .gitignore, .env.local.example)

## Accomplishments
- Wrote `.gitignore` first (before any other file), excluding `.env.local`, `node_modules/`, and `storage/_smoketest/*.{png,mp4,log}` while deliberately leaving `storage/_smoketest/spend-ledger.json` tracked (D-05/D-06)
- Wrote `package.json` (ESM `"type": "module"`, exact pins `@google/genai@^2.22.0`, `typescript@7.0.2`, `@types/node@22.20.2`) and `tsconfig.json` (strict, `allowImportingTsExtensions` + `erasableSyntaxOnly` both true) per RESEARCH.md's Standard Stack
- Wrote `.env.local.example` with the literal placeholder `GEMINI_API_KEY=your-api-key-here`
- Human explicitly confirmed `@google/genai`'s npm page legitimacy (Repository → `github.com/googleapis/js-genai`, publisher → `@google` scope) before any install ran, clearing RESEARCH.md's `[SUS]` too-new-heuristic false positive
- Ran `npm install --no-audit --no-fund`; verified `@google/genai@2.22.0` installed, `GoogleGenAI` resolves as a function via dynamic `import('@google/genai')`, and the EOL `@google/generative-ai` package is absent

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold package.json, tsconfig.json, .gitignore, and .env.local.example** - `0141f9f` (feat)
2. **Task 2: Confirm @google/genai legitimacy before installing it** - checkpoint only, no code change; human response recorded below
3. **Task 3: Install dependencies and prove the SDK entry point resolves** - `22ab48e` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE.md + ROADMAP.md)

## Files Created/Modified
- `package.json` - ESM package manifest, dependency/devDependency pins, `typecheck`/`test:lib`/`smoke` scripts
- `package-lock.json` - Lockfile generated by `npm install`, resolves `@google/genai` to `registry.npmjs.org/@google/genai/-/genai-2.22.0.tgz`
- `tsconfig.json` - Strict, type-check-only config with `allowImportingTsExtensions`/`erasableSyntaxOnly` for Node's native `.ts` execution
- `.gitignore` - Excludes `node_modules/`, `.env.local`, and smoke-test binary/log outputs; leaves `spend-ledger.json` tracked
- `.env.local.example` - Placeholder template (`GEMINI_API_KEY=your-api-key-here`) pointing at https://aistudio.google.com/apikey

## Decisions Made
- Human approved `@google/genai`'s legitimacy verbatim as: **"Approved"** — confirming the npm page's Repository link resolves to `github.com/googleapis/js-genai` and the publisher is the `@google` npm scope, per the checkpoint's `<how-to-verify>` steps. No discrepancy was reported, so Task 3 proceeded.
- No `tsx`, `ts-node`, or `dotenv` added — RESEARCH.md verified Node v24.20.0 (installed here) runs `.ts` natively and supports `--env-file`, per plan instruction.

## Deviations from Plan

None - plan executed exactly as written.

**Peer-dependency / install-script warnings (recorded verbatim per Task 3's action instruction, not auto-fixed):**
```
npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead
npm warn install-scripts 2 packages have install scripts not yet covered by allowScripts:
npm warn install-scripts   @google/genai@2.22.0 (preinstall: echo 'preinstall: no-op')
npm warn install-scripts   protobufjs@7.6.6 (postinstall: node scripts/postinstall)
```
These are advisory only — no `ERESOLVE`/`E401`/`ENOTFOUND` error occurred, `npm install` exited 0, and no package was added to silence them. `@google/genai`'s preinstall script is a documented no-op (`echo`); `protobufjs`'s postinstall is a standard, widely-used transitive dependency of Google's gRPC/protobuf tooling. Neither warranted a separate legitimacy checkpoint since Task 2 already cleared the direct dependency, and `typescript`/`@types/node` were pre-approved in the same RESEARCH.md audit.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required by this plan. (Note: the phase-level `user_setup` for `GEMINI_API_KEY` / billing-enabled Google Cloud project, per PLAN.md frontmatter, is still outstanding and will gate the paid-call plans later in this phase — 01-02/01-03/01-04 — not this scaffold-only plan.)

## Next Phase Readiness
- `package.json`, `tsconfig.json`, `.gitignore`, `.env.local.example` all exist with verified-correct contents; `@google/genai` 2.x is installed and its entry point resolves — Plan 01-02 (spend ledger + log-response lib) can proceed immediately.
- Blocker carried forward from STATE.md: the requester still needs to create the AI Studio API key and enable billing before any plan in this phase that makes a real paid provider call (01-03 onward) can execute against real providers.

---
*Phase: 01-provider-smoke-test*
*Completed: 2026-09-12*

## Self-Check: PASSED
All created files and both task commits (`0141f9f`, `22ab48e`) verified present on disk / in git log.

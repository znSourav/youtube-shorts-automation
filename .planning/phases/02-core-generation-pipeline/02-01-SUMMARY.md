---
phase: 02-core-generation-pipeline
plan: 01
subsystem: app-scaffold-and-style-config
tags: [nextjs, scaffold, style-bible, config-driven, tailwind, story-04, startup-01]
status: complete

dependency-graph:
  requires: []
  provides:
    - "src/app/ (Next.js 16 App Router scaffold: layout.tsx, page.tsx, globals.css)"
    - "src/core/story/styles.ts (STYLE_PRESETS, MOOD_OPTIONS, StylePreset)"
    - "npm run dev/build/start (documented single-command app startup)"
  affects:
    - "package.json (merged Phase 1 + Next.js dependency set and scripts)"
    - "tsconfig.json (merged Node-ESM + Next-bundler compiler options)"
    - ".gitignore (Next.js build artifacts + storage/stories/ added)"

tech-stack:
  added:
    - "next@16.3.5"
    - "react@19.2.8 / react-dom@19.2.8"
    - "zod@^4.6.2"
    - "tailwindcss@^4 / @tailwindcss/postcss@^4"
    - "eslint@^9 / eslint-config-next@16.3.5"
  patterns:
    - "Config-driven Style Bible presets (no hardcoded prompts in React components)"
    - "Relative .ts-extension imports for src/core|providers|app/actions|scripts; @/* alias reserved for src/components and src/app/*.tsx"

key-files:
  created:
    - src/app/layout.tsx
    - src/app/page.tsx
    - src/app/globals.css
    - src/app/favicon.ico
    - public/ (file.svg, globe.svg, next.svg, vercel.svg, window.svg)
    - next.config.ts
    - postcss.config.mjs
    - eslint.config.mjs
    - next-env.d.ts
    - src/core/story/styles.ts
    - src/core/story/styles.test.ts
  modified:
    - package.json
    - package-lock.json
    - tsconfig.json
    - .gitignore

decisions:
  - "Scaffolded into a temp dir named scaffold-tmp (not the plan's literal .scaffold-tmp) because npm rejects project names starting with a period"
  - "Switched dev/build scripts to next dev --webpack / next build --webpack because this Windows machine's Application Control policy blocks the native Turbopack SWC binary (@next/swc-win32-x64-msvc); WASM-only Turbopack is unsupported, webpack compiles cleanly"
  - "Set agentRules: false in next.config.ts and removed the auto-generated root AGENTS.md/CLAUDE.md stubs -- Next 16's next dev regenerates these on every run and the root CLAUDE.md stub would shadow this project's real .claude/CLAUDE.md"
  - "gemini-3.1-pro-preview vs gemini-3.8-flash model choice deferred to plan 02-02 (this plan does not touch the LLM provider)"

actuals:
  tokens: 34500
  tasks: 3
  commits: 2

metrics:
  duration: "~13 min executor time (plus an async pause between Task 1's checkpoint and its approval)"
  completed: 2026-09-12
---

# Phase 2 Plan 1: Next.js Scaffold + Style Bible Config Summary

Merged a Next.js 16 App Router scaffold onto Phase 1's existing CLI-script repo without losing any Phase 1 artifact, and built the 6-preset config-driven Style Bible system (STORY-04) the Story Director will consume in plan 02-02.

## What Was Built

**Task 1 — Package legitimacy checkpoint (human-verify, gate=blocking-human):** Coordinator confirmed all five `[SUS]`-flagged packages (`next`, `react`, `react-dom`, `zod`, `eslint`) resolve to their official repositories via `npm view <pkg> repository.url` against the live npm registry, matching 02-RESEARCH.md's audit table exactly. No install command ran before this approval.

**Task 2 — Next.js scaffold merge:** Ran `create-next-app@16.3.5` into an isolated temp directory (npm-name-legal `scaffold-tmp`, not the plan's literal `.scaffold-tmp` — see Deviations) with `--skip-install --disable-git --yes`, then copied only the scaffold-owned files (`src/app/{layout,page,globals.css,favicon.ico}`, `public/`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `next-env.d.ts`) into the repo root, leaving Phase 1's `src/lib/`, `src/providers/`, `src/scripts/`, `.env.local`, and `.env.local.example` completely untouched. `package.json`, `tsconfig.json`, and `.gitignore` were merged by hand per the plan's explicit field-by-field reconciliation, then `npm install` ran and `scaffold-tmp/` was deleted.

**Task 3 — Style Bible preset system (STORY-04):** `src/core/story/styles.ts` exports `STYLE_PRESETS` (a `Record<string, StylePreset>` with exactly the 6 named ids from `docs/original-brief.md` §26), each carrying all 9 Style Bible fields from §10 (`medium`, `line_style`, `color_palette`, `lighting`, `texture`, `character_rendering`, `background_rendering`, `animation_characteristics`, `camera_language`) written as original visual directions — no living artist, studio, or franchise signature referenced anywhere. `MOOD_OPTIONS` exports the 5 mood strings from §9's dropdown. The module has zero import statements, so `node --test` exercises it with no bundler. `src/core/story/styles.test.ts` covers preset count/keys, field completeness, the signature-free constraint (via a `FORBIDDEN_SIGNATURE_TERMS` list), and mood-options non-emptiness — all 5 tests pass, and `package.json`'s `test:lib` script now runs 24 tests total (was 19).

## Verification Evidence

- `npm run test:lib` — 24/24 pass (19 Phase 1 + 5 new styles tests)
- `npm run typecheck` — exits 0, no `error TS` lines
- `npm run build` — exits 0 (webpack backend; see Deviations), static export of `/` and `/_not-found` succeeds
- `npm run dev` — serves `GET / 200` at `http://localhost:3000` (confirmed twice: once before the `agentRules: false` fix, once after, to prove the fix didn't regress startup)
- Phase 1 survival check (`test -f` + `grep -q` chain across `gemini-image.ts`, `veo.ts`, `spend-ledger.ts`, `log-response.ts`, `.env.local`, `.env.local.example`, `@google/genai` in package.json, `smoke` script, `allowImportingTsExtensions` in tsconfig) — printed `PHASE1 SURVIVED OK`
- `.env.local` — never opened or edited by any Write/Edit tool call this plan; existence confirmed before and after the merge; its content could not be directly inspected (sandbox denies reads of this specific file), which is itself consistent with it never being touched
- `styles.ts` contains zero `^import` lines (`grep -c "^import"` → `0`)

## Final Merged `tsconfig.json` (load-bearing for plan 02-02's tracer)

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["dom", "dom.iterable", "ES2023"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "types": ["node"],
    "paths": { "@/*": ["./src/*"] },
    "plugins": [{ "name": "next" }],
    "allowJs": true
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`allowImportingTsExtensions` survived the merge and is confirmed working through the webpack build path (`npm run build` succeeded with it in place, and `npm run typecheck` passes with Phase 1's `.ts`-suffixed relative imports intact). Note `jsx` ended up as `"react-jsx"` rather than the plan's literally-specified `"preserve"` — Next's own build step auto-corrected this as a "mandatory change" on first `npm run build` (`next.js uses the React automatic runtime`); `allowJs: true` and `.next/dev/types/**/*.ts` in `include` were added the same way. This is Next 16's own tooling reconciling the config, not a manual plan deviation, and it did not affect any of the load-bearing options (`allowImportingTsExtensions`, `moduleResolution: "bundler"`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `"@/*"` paths) the plan called out as the actual reconciliation goals.

## Dependency Versions Actually Pinned (from `.scaffold-tmp/package.json` at scaffold time)

- `next`: `16.3.5`
- `react` / `react-dom`: `19.2.8` (research had projected `19.3.0`; the scaffold pinned `19.2.8` — the exact version create-next-app actually resolved at execution time, copied verbatim per the plan's instruction to trust the scaffold's own lockstep versions rather than research's advance estimate)
- `@tailwindcss/postcss`, `tailwindcss`: `^4`
- `eslint`: `^9` (resolved to `9.39.5`; npm printed a deprecation notice that 9.39.5 is "no longer supported" in favor of the eslint 10.x line, but this is the version `create-next-app@16.3.5`'s own template pins, copied verbatim per the plan's step 3 instruction)
- `eslint-config-next`: `16.3.5`
- `@types/react` / `@types/react-dom`: `^19`
- `zod`: `^4.6.2` (added per plan instruction, not part of the scaffold's own dependency set)

No `create-next-app` flag was rejected — `--typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --use-npm --skip-install --disable-git --yes` all ran as given.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Scaffold temp directory renamed from `.scaffold-tmp` to `scaffold-tmp`**
- **Found during:** Task 2, Step 1
- **Issue:** `npx create-next-app@16.3.5 .scaffold-tmp ...` failed immediately: "Could not create a project called \".scaffold-tmp\" because of npm naming restrictions: name cannot start with a period." `create-next-app` derives the npm package name from the target directory name, and npm package names cannot start with `.`.
- **Fix:** Used `scaffold-tmp` (no leading dot) as the temp directory instead. Functionally identical isolation; `.gitignore`'s new entry was added as `scaffold-tmp/` rather than `.scaffold-tmp/` to match.
- **Files modified:** `.gitignore` (entry name only)
- **Commit:** `241a3f7`

**2. [Rule 3 - Blocking issue] `npm run typecheck` fails on a fresh scaffold before any build has run (`Cannot find name 'LayoutProps'`)**
- **Found during:** Task 2, first `npm run typecheck` per the plan's verify order (typecheck before build)
- **Issue:** The scaffold's `src/app/layout.tsx` uses Next 16's ambient `LayoutProps<"/">` type, which is generated into `.next/types/routes.d.ts` by `next dev`/`next build`'s typed-routes feature — and `.next/` does not exist until one of those has run at least once. On a genuinely fresh scaffold, `tsc --noEmit` run before any build/dev pass fails with `error TS2304: Cannot find name 'LayoutProps'`.
- **Fix:** Ran `npm run build` once first (which also generates `.next/types`), then re-ran `npm run typecheck`, which then passed cleanly. No source code was changed for this fix — it is a one-time bootstrap-ordering fact about this Next.js version, not a defect in the merged config.
- **Files modified:** none (ordering only)
- **Commit:** n/a (no code change; captured here for the executor and verifier's benefit)

**3. [Rule 3 - Blocking issue] Turbopack unusable on this machine — native SWC binary blocked by Windows Application Control policy**
- **Found during:** Task 2, first `npm run build`
- **Issue:** `next build` (Turbopack, the Next 16 default) failed: "Turbopack is not supported on this platform (win32/x64) because native bindings are not available. Only WebAssembly (WASM) bindings were loaded." The underlying cause, printed repeatedly in the log: `Attempted to load @next/swc-win32-x64-msvc, but an error occurred: An Application Control policy has blocked this file.` This is a Windows Defender Application Control (WDAC)-class restriction on this specific machine blocking execution of the native `.node` binary — not something fixable from inside the repo or npm install.
- **Fix:** Changed `package.json`'s `dev` and `build` scripts to `next dev --webpack` / `next build --webpack` (Next's own documented fallback for exactly this error). `npm run start` is unchanged (it only serves a pre-built output, no compilation). Re-ran the full verify chain (`build`, `typecheck`, `dev` → HTTP 200) after the change; all passed.
- **Files modified:** `package.json`
- **Commit:** `241a3f7`
- **Note for the wife's laptop:** this is a policy on *this* execution machine, not necessarily the target Windows laptop. If her machine allows the native Turbopack binary, `next dev`/`next build` would still work fine without `--webpack` (webpack is strictly a compatibility fallback, not a required change) — but leaving `--webpack` in place is the safer, universally-working default given STARTUP-01 requires zero compilation errors on a non-technical user's machine and there is no way to detect the target laptop's Application Control policy in advance.

**4. [Rule 3 - Blocking issue] `next dev` auto-generates a root `AGENTS.md`/`CLAUDE.md` that would shadow this project's real `.claude/CLAUDE.md`**
- **Found during:** Task 2, after starting `npm run dev` for the HTTP-200 check
- **Issue:** Next.js 16's `next dev` (per its own generated `AGENTS.md`: "This block is written and re-added by `next dev`") wrote a root-level `AGENTS.md` and a root-level `CLAUDE.md` (a one-line `@AGENTS.md` stub) into the repo on every dev-server start. This project's `.planning/config.json` already designates `.claude/CLAUDE.md` as the authoritative agent-instructions file; a second, auto-regenerating root `CLAUDE.md` is exactly the kind of ambiguity `project_context`'s CLAUDE.md-enforcement rule exists to avoid — some tooling checks repo-root `CLAUDE.md` by default, and this one would shadow the real one with near-empty content.
- **Fix:** Set `agentRules: false` in `next.config.ts` (Next's documented opt-out) and deleted the two generated stub files. Rebuilt and restarted `next dev` to confirm the setting holds (no `AGENTS.md`/`CLAUDE.md` regenerated) and the app still serves HTTP 200.
- **Files modified:** `next.config.ts`; deleted `AGENTS.md`, `CLAUDE.md` (both untracked, never committed)
- **Commit:** `241a3f7`

**5. [Rule 3 - Blocking issue] `FORBIDDEN_SIGNATURE_TERMS` test false-positive on the generic word "illumination"**
- **Found during:** Task 3, first `node --test src/core/story/styles.test.ts` run
- **Issue:** The `soft-hand-painted-2d` preset's `lighting` field legitimately uses the common English word "illumination" ("diffuse, storybook-soft illumination"), which collided with a forbidden-term list entry meant to catch the animation studio "Illumination" (Despicable Me/Minions). The bare word is ordinary lighting vocabulary, not a studio signature reference.
- **Fix:** Changed the forbidden-term entry from `"illumination"` to `"illumination entertainment"` (the studio's actual full name) — still guards against an organic studio-signature reference while no longer flagging generic prose.
- **Files modified:** `src/core/story/styles.test.ts`
- **Commit:** `f193d78`

### Human-check deferred

Task 2's `<verify>` block lists an automated `DEV HTTP 200` check (passed twice) plus a `<human-check>` item ("open http://localhost:3000 in a browser and confirm the Next.js starter page renders with styling and no console errors"). Task 2 is `type="auto"`, not a `checkpoint:human-verify`, so this executor did not block on that specific visual confirmation — the automated HTTP-200 fetch and a clean `next build`/`next dev` log (no compile errors, no red-flagged output) are the evidence recorded here. The coordinator/user can independently confirm the visual render at their convenience; nothing in this plan's `acceptance_criteria` or `done` statement required it before commit.

## Known Stubs

None. `src/app/page.tsx` is the unmodified `create-next-app` starter page (the plan's own scope: "scaffold placeholder this plan, real create form in plan 02-02") — this is explicitly out of scope for this plan, not a stub masking missing functionality.

## Threat Flags

None. All new surface (npm packages, scaffold files, config merge) was already covered by this plan's own `<threat_model>` (T-02-SC, T-02-09, T-02-10, T-02-11) and no new trust boundary was introduced beyond what those four threats already describe.

## Self-Check: PASSED

- `src/app/layout.tsx` — FOUND
- `src/app/page.tsx` — FOUND
- `src/app/globals.css` — FOUND
- `next.config.ts` — FOUND
- `postcss.config.mjs` — FOUND
- `eslint.config.mjs` — FOUND
- `src/core/story/styles.ts` — FOUND
- `src/core/story/styles.test.ts` — FOUND
- Commit `241a3f7` — FOUND in `git log --oneline --all`
- Commit `f193d78` — FOUND in `git log --oneline --all`

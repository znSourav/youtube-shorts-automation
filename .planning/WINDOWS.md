---
schema_version: 1
open_count: 5
waived_count: 0
fixed_count: 0
total_count: 5
last_updated: 2026-09-13T11:05:25.660Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | src/providers/video/veo.ts |  | generateVideos top-level image/prompt args are deprecated (SDK warning: removed no earlier than 2026-07-31); migrate to source:{image,prompt} shape, verified on Phase 2's first real Veo call | open |  | 2026-09-12T04:46:28.286Z |  |
| 2 | 01 | deviation | src/lib/log-response.ts |  | isSecretKey() substring-matches 'token', over-redacting usageMetadata fields like promptTokenCount/candidatesTokenCount in printed logs (real values are unaffected in spend-ledger.json) | open |  | 2026-09-12T04:46:28.726Z |  |
| 3 | 2 | unrun-verify | package.json |  | npm run lint cannot run: typescript-eslint 8.70.0 (latest published) rejects TypeScript 7.0.2, no compatible upstream release exists yet -- confirmed pre-existing before this plan's changes | open |  | 2026-09-12T18:36:48.345Z |  |
| 4 | 2 | unrun-verify | src/app/page.tsx |  | Full interactive three-screen human-check (create -> story review -> image review, Generate Videos gating, no leaked prompts/paths, character consistency) deferred to end-of-phase UAT -- no browser-driving tool available in this executor session | open |  | 2026-09-12T18:36:48.757Z |  |
| 5 | 03 | lint-warning | package.json |  | npm run lint fails: typescript-eslint does not support TS 7.0 (project pins typescript@7.0.2) -- pre-existing environment issue, confirmed via git stash to predate 03-02's changes | open |  | 2026-09-13T11:05:25.660Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "01",
    "file": "src/providers/video/veo.ts",
    "line": null,
    "description": "generateVideos top-level image/prompt args are deprecated (SDK warning: removed no earlier than 2026-07-31); migrate to source:{image,prompt} shape, verified on Phase 2's first real Veo call",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T04:46:28.286Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "01",
    "file": "src/lib/log-response.ts",
    "line": null,
    "description": "isSecretKey() substring-matches 'token', over-redacting usageMetadata fields like promptTokenCount/candidatesTokenCount in printed logs (real values are unaffected in spend-ledger.json)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T04:46:28.726Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "unrun-verify",
    "phase": "2",
    "file": "package.json",
    "line": null,
    "description": "npm run lint cannot run: typescript-eslint 8.70.0 (latest published) rejects TypeScript 7.0.2, no compatible upstream release exists yet -- confirmed pre-existing before this plan's changes",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T18:36:48.345Z",
    "resolved_at": null
  },
  {
    "id": 4,
    "kind": "unrun-verify",
    "phase": "2",
    "file": "src/app/page.tsx",
    "line": null,
    "description": "Full interactive three-screen human-check (create -> story review -> image review, Generate Videos gating, no leaked prompts/paths, character consistency) deferred to end-of-phase UAT -- no browser-driving tool available in this executor session",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T18:36:48.757Z",
    "resolved_at": null
  },
  {
    "id": 5,
    "kind": "lint-warning",
    "phase": "03",
    "file": "package.json",
    "line": null,
    "description": "npm run lint fails: typescript-eslint does not support TS 7.0 (project pins typescript@7.0.2) -- pre-existing environment issue, confirmed via git stash to predate 03-02's changes",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-13T11:05:25.660Z",
    "resolved_at": null
  }
]
````

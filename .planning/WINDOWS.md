---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 0
total_count: 2
last_updated: 2026-09-12T04:46:28.726Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | src/providers/video/veo.ts |  | generateVideos top-level image/prompt args are deprecated (SDK warning: removed no earlier than 2026-07-31); migrate to source:{image,prompt} shape, verified on Phase 2's first real Veo call | open |  | 2026-09-12T04:46:28.286Z |  |
| 2 | 01 | deviation | src/lib/log-response.ts |  | isSecretKey() substring-matches 'token', over-redacting usageMetadata fields like promptTokenCount/candidatesTokenCount in printed logs (real values are unaffected in spend-ledger.json) | open |  | 2026-09-12T04:46:28.726Z |  |

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
  }
]
````

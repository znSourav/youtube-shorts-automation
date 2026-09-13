# Phase 3 Plan 4, Task 2 — Proof-Run Evidence

Recorded per the plan's own instruction: exactly one real paid Story Director call was dispatched
this session, only after a human explicitly approved it against the $0.0630 of remaining
`DEV_CEILING_USD` headroom. Every number below is a real, verbatim result from that one real call,
captured 2026-09-13.

## 1. Task 1's checkpoint — human response, recorded verbatim

**Checkpoint:** "Dispatch one real, 5-scene Story Director call — estimated $0.0500 — to prove the
structural fingerprint and the persistence chain against a real model response?"

**Human's response, verbatim:** "Approve the $0.05 run now" — selecting exactly the plan's own
`approve` option, **"Approve the single $0.05 run now"**.

Per the plan's own acceptance criteria: this was a human decision, not an auto-approval
(`gate="blocking-human"` is never bypassed, in any mode, including this project's `mode: yolo`).
No provider call was dispatched before this response was given — the pre-run ledger check below
was the first automated step, and it ran only after this checkpoint was answered.

## 2. The idea used, and why it is a genuinely fourth, unrelated premise

Phase 2's three real dev-test stories (see `02-PROOF-RUN.md`) were:

1. A **boy** trades a marble for a **kite** — a longing/coming-of-age arc.
2. A **girl** finds her **grandmother's broken bangle** — a family-history/reunion-with-the-past
   arc.
3. An old **fisherman** returns a lost **paper boat** to its owner — a
   duty-discharged/quiet-satisfaction arc, resolved through searching and finding.

This run's idea is a **fourth, unrelated premise** — different protagonist (an elderly
**postman**, not a child and not a fisherman), different central object (an old **undelivered
letter**, not a kite/bangle/boat), different setting (a village postal route, not a garden,
a grandmother's room, or a riverbank), and a different emotional arc (**belated duty and closure**
through finally delivering something decades late, not discovery/family-history/searching-and-
returning).

**Idea, as submitted (Banglish — matching the product's real expected input register):**
> Ekjon briddho postman tar chithir bag-e onek bochorer purono ekta na-deya chithi khuje pay,
> ebong seta thik thikanay pouche debar jonno gramer pothe rowna dey.

**English gloss** (never sent to the model — for this document's readers only): An elderly
postman finds an old, decades-undelivered letter in his mailbag, and sets out along the village
road to finally deliver it to the correct address.

**Character description used:** "An elderly postman with silver hair and a weathered face,
wearing a faded khaki uniform and cap, carrying a worn leather mail bag, riding an old bicycle."

Style preset: `soft-hand-painted-2d`. Mood: `Emotional`. Scene count: 5.

## 3. Preparing the history (D-05) — fixture row removed before dispatch

Before dispatching anything, `persistence-probe.ts --real` was extended to delete the `--write`
fixture row (`story-probe-persistence`, "The Returned Kite") and its children first. Confirmed via
a direct database query immediately before the run: the only row in the database was the fixture
(`uniquenessStatus: ACCEPTED`). After the fixture-deletion step ran (inside `--real`, before
dispatch), the accepted history the real candidate was checked against was empty — meaning the
real candidate could not collide with anything, and the regeneration loop's zero-cost pre-filter
path was exercised with a genuinely empty history rather than the synthetic fixture. This is
D-05/T-03-23 applied with more force to a hand-written fixture, exactly as the plan specifies.

## 4. The dispatch — full probe output, verbatim

Ledger confirmed at **$2.9370** immediately before dispatch (matching the plan's own pre-condition
exactly, verified via the automated pre-run check).

**Run it exactly once — no retry was attempted, regardless of outcome, per the plan's own
instruction.** The run succeeded on the first and only attempt.

**Raw response log, printed to the server console by `logRawResponse` (verbatim, exactly as
printed — payload text/thoughtSignature fields redacted per `log-response.ts`'s own
secret/payload-safety convention, `usageMetadata` fields redacted by the same convention's known
substring-match-on-"token" over-redaction, documented pre-existing as WINDOWS #2):**

```
generateContent raw response (model=gemini-3.1-pro-preview)
{
  "sdkHttpResponse": {
    "headers": {
      "alt-svc": "h3=\":443\"; ma=2592000,h3-29=\":443\"; ma=2592000",
      "content-encoding": "gzip",
      "content-type": "application/json; charset=UTF-8",
      "date": "Sun, 13 Sep 2026 13:04:59 GMT",
      "server": "scaffolding on HTTPServer2",
      "server-timing": "gfet4t7; dur=82694",
      "transfer-encoding": "chunked",
      "vary": "Origin, X-Origin, Referer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "SAMEORIGIN",
      "x-gemini-service-tier": "standard",
      "x-xss-protection": "0"
    }
  },
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "[REDACTED:7118 chars]",
            "thoughtSignature": "[REDACTED:37872 chars]"
          }
        ],
        "role": "model"
      },
      "finishReason": "STOP",
      "index": 0
    }
  ],
  "modelVersion": "gemini-3.1-pro-preview",
  "responseId": "KZ-maqHTBuHFg8UPhca26QI",
  "usageMetadata": {
    "promptTokenCount": "[REDACTED:secret]",
    "candidatesTokenCount": "[REDACTED:secret]",
    "totalTokenCount": "[REDACTED:secret]",
    "promptTokensDetails": "[REDACTED:secret]",
    "thoughtsTokenCount": "[REDACTED:secret]",
    "serviceTier": "standard"
  }
}
```

**Model / tier:** `gemini-3.1-pro-preview` (primary Preview tier). **`fallbackUsed`: false** — the
403/404 GA-fallback path in `src/providers/llm/gemini.ts` was never exercised.

**`finishReason`: `STOP`** — a clean, unblocked, uncut response (not `MAX_TOKENS`, not a
content-safety block).

**Real `usageMetadata` (recovered from the ledger entry itself, which stores the unredacted
object — the console-log redaction above only affects what the server prints, not what
`recordSpend` writes to disk):**
```json
{
  "promptTokenCount": 821,
  "candidatesTokenCount": 2207,
  "totalTokenCount": 10707,
  "promptTokensDetails": [{ "modality": "TEXT", "tokenCount": 821 }],
  "thoughtsTokenCount": 7679,
  "serviceTier": "standard"
}
```

**Probe's own printed output, verbatim:**
```
PERSISTENCE PROBE: real ok id=story-1789304699649-wko7d7 scenes=5 usd=2.9870
  protagonist_want: a character seeks to deliver a long-lost message to its intended recipient
  central_obstacle: the message has been delayed for decades and the destination is far away
  ending_shape: quiet emotional closure from fulfilling a long-overdue duty
Ledger total: $2.9870 of $3.00
```

Exit code: `0`.

## 5. The three fingerprint fields, quoted verbatim, with the human judgment this run exists to capture

This is the primary evidence this whole $0.05 run was spent to produce: does a REAL Gemini
response come back carrying D-01's three structural elements, in English, abstracted enough to
compare — the zero-extra-cost bet 03-RESEARCH.md made and never observed against a real response
until now?

### `protagonist_want`
> "a character seeks to deliver a long-lost message to its intended recipient"

- **In English?** Yes — every word is English.
- **Abstracted (names no character, species, object, or setting)?** Yes. It says "a character"
  (not "the postman"), "a long-lost message" (not "a letter"), "its intended recipient" (not
  a name or place). This is a structural summary of D-01 element (a) — what the protagonist
  wants — not a restatement of the plot's surface nouns.

### `central_obstacle`
> "the message has been delayed for decades and the destination is far away"

- **In English?** Yes.
- **Abstracted?** Yes. "the message" and "the destination" are the only nouns, both generic
  placeholders for D-01 element (b) — the obstacle/mechanism — not the specific letter, village,
  or bicycle the actual scenes describe.

### `ending_shape`
> "quiet emotional closure from fulfilling a long-overdue duty"

- **In English?** Yes.
- **Abstracted?** Yes. No character, no object, no place — a pure emotional-shape description of
  D-01 element (c), matching the ending's felt quality (quiet closure) rather than its plot event
  (a postman handing over a letter).

**Verdict: the fingerprint bet holds against a real response.** All three fields came back
genuinely in English (the narrow, deliberate do-not-translate exception in
`FINGERPRINT_INSTRUCTION` held, even though the rest of the story — title, premise, theme,
emotional arc, ending, scene purposes — correctly stayed in the Banglish script the idea was
submitted in, confirmed by direct database query below), and all three are genuinely abstracted:
no character name, no species, no specific object ("message" not "letter"), and no setting noun
appears in any of the three fields. **No non-English or proper-noun-bearing fingerprint field was
observed — there is nothing to carry into STATE.md's concerns on this point.**

**The rest of the story, for contrast (confirmed staying in the input script, direct DB query):**
- Title: "Purono Chithi" (Old Letter)
- Premise: "Ekjon briddho postman tar chithir bag-e onek bochorer purono ekta na-deya chithi khuje
  pay, ebong seta thik thikanay pouche debar jonno gramer pothe rowna dey."
- Theme: "Somoy periye geleo bhalobasha ebong bhalobashar smriti kokhono hariye jay na."
- Emotional arc: "Ashchorjo theke shuru kore, drirho sankalpo, ebong oboseshe ekti govir
  prashanti."
- Ending: "Chithita prapoker kache pouche deoar por postman er nisshobdo o shantipurno biday."
- Scene purposes (5, numbered 1–5, no gaps/duplicates): "Purono chithita khuje paoa." /
  "Gramer pothe jatra shuru kora." / "Pother majhe niri-bili poribesh dekhano." / "Thikanay
  pouche chithita deya." / "Shantipurno biday."
- Scene durations: 6, 8, 4, 6, 8 — varied, not defaulted to the maximum.

This is the exact split `FINGERPRINT_INSTRUCTION`'s narrow carve-out predicts: every field except
the three fingerprint fields stays in the submitted script; the three fingerprint fields alone
switch to English.

## 6. Persistence — story id, uniqueness status, attempt count, and the separate-process read

- **Story id:** `story-1789304699649-wko7d7`
- **Uniqueness status persisted:** `ACCEPTED`
- **Regeneration attempt:** `1` — accepted on the first attempt, no collision, no regeneration
  needed (expected, since D-05's fixture-deletion step left the accepted history empty before
  this dispatch).
- **Scenes persisted:** 5, numbered 1–5, no gaps or duplicates.

**Separate-process read-back (`persistence-probe.ts --read`, run in a genuinely separate `node`
process invocation from the one that wrote it — PERSIST-01 proven against real generated data,
not fixture data), verbatim:**
```
PERSISTENCE PROBE: read ok id=story-1789304699649-wko7d7 scenes=5 fingerprint=ok numbers=1, 2, 3, 4, 5
```
Exit code: `0`. All three fingerprint columns (`protagonistWant`/`centralObstacle`/`endingShape`)
and all 5 scenes came back intact after the restart.

## 7. Collision proof — derived for free from the real accepted history

`uniqueness-probe.ts --prove-collision` dispatched nothing (zero additional cost). It read the
real story's fingerprint back through `listAcceptedFingerprints` (the only accepted row in the
database at this point, following D-05's fixture-deletion) and derived two candidates from it
mechanically — no hand-written text, fully deterministic and repeatable.

**Full output, verbatim:**
```
UNIQUENESS PROBE: collision candidate=A(near-duplicate) want=0.875 obstacle=0.778 ending=0.875 verdict=reject
UNIQUENESS PROBE: collision candidate=B(shared-surface-words) want=0.050 obstacle=0.053 ending=0.059 verdict=pass
UNIQUENESS PROBE: collision proof ok
```
Exit code: `0`.

### Candidate A — structural near-duplicate (must be caught)

Built by keeping the SAME underlying token content as the real fingerprint (dropping roughly one
word in five, deterministically by array index, and reversing the remaining word order —
`jaccardSimilarity` is a set comparison, so the reversal has no scoring effect; the token overlap
is what a reskin looks like to the pre-filter). Scores: `want=0.875, obstacle=0.778,
ending=0.875` — **all three clear `HIGH_THRESHOLD=0.75`, verdict `reject`.**

**Assumption A1's 0.75/0.40 thresholds, checked against real data:** Candidate A landed on
**`reject`, not `escalate`** — every field cleared the high threshold directly, so the
deterministic pre-filter alone caught this reskin with zero LLM calls, exactly the common-case
zero-cost path 03-RESEARCH.md's threshold design was meant to serve. The 0.75 boundary reads
correctly against this real fingerprint text: a near-duplicate scoring 0.778–0.875 across all
three fields is comfortably clear of the 0.75 line, with no field landing close enough to the
boundary to raise a concern about threshold placement. No evidence from this run suggests moving
either threshold — consistent with 03-02-SUMMARY.md's own fixture-based finding.

### Candidate B — shared surface words only (must NOT be rejected)

Built by mechanically extracting the first content word (length > 4, ASCII letters) from each of
the real story's three fingerprint fields — `"character"` (from `protagonist_want`), `"message"`
(from `central_obstacle`), and `"quiet"` (from `ending_shape`) — and placing them inside a fixed,
structurally unrelated template (a competitor racing to win first place), held as a constant in
the script:
- `protagonistWant`: "a competitor wants to win first place in a village race, thinking about the
  character the whole time"
- `centralObstacle`: "a faster rival keeps beating them in every practice round despite the
  message"
- `endingShape`: "pride and excitement after finally crossing the finish line first, near the
  quiet"

Scores: `want=0.050, obstacle=0.053, ending=0.059` — **all three well under
`BORDERLINE_THRESHOLD=0.40`, verdict `pass`.** A single shared surface word per field, inside an
otherwise completely different structural template, does not manufacture a false rejection — this
is UNIQUE-03's guard, now proven against real generated data rather than a hand-written fixture
pair.

## 8. Ledger — before and after this run

| Stage | Total | Entries |
|---|---|---|
| Before this plan (confirmed via automated pre-run check) | **$2.9370** | 26 |
| New entry (`story:5-scene`, `gemini-3.1-pro-preview`, `estimatedUsd: 0.05`, `billed: true`) | +$0.0500 | +1 |
| After this plan (confirmed via automated post-run check) | **$2.9870** | 27 |

Exactly one new ledger entry was created by this entire plan. No image-typed or video-typed entry
was created. `git diff --exit-code -- src/lib/spend-ledger.ts` exits `0` — the ledger module
itself was never touched, and `DEV_CEILING_USD` was never raised.

## 9. Verification re-run after the real call

- `node -e ...` pre-run ledger check: `LEDGER BEFORE 2.9370` — confirmed before dispatch.
- `persistence-probe.ts --real`: exit `0`, `PERSISTENCE PROBE: real ok`, all three fingerprint
  values non-empty.
- `persistence-probe.ts --read` (separate process): exit `0`, `PERSISTENCE PROBE: read ok`,
  `fingerprint=ok`.
- `uniqueness-probe.ts --prove-collision`: exit `0`, `UNIQUENESS PROBE: collision proof ok`, two
  candidate score lines printed.
- `node -e ...` post-run ledger check: `LEDGER AFTER 2.9870 entries=27` — no `OVERSPEND`.
- `git diff --exit-code -- src/lib/spend-ledger.ts`: exit `0` — no diff.
- `npm run test:lib`: 123/123 passing, 0 failures.
- `npm run build`: clean.
- `node src/scripts/check-boundaries.ts`: 4/4 `OK:` lines.

## 10. Carried forward — nothing new

Unlike `02-PROOF-RUN.md`, this run produced no blocked attempts, no non-English fingerprint field,
and no proper-noun leakage — the single real call succeeded cleanly on the first and only attempt.
The remaining `DEV_CEILING_USD` headroom after this plan is **$0.0130** — below the cost of any
further real story, image, or video call in any category. Any further real paid probing in Phase
4 needs the same explicit human-consent conversation this plan's Task 1 modeled, not a silent
ceiling raise.

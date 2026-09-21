// Dependency-free structural check (node:fs/node:path only, no shell grep)
// so it runs identically on Windows and POSIX shells. Asserts invariants
// that a one-time code review cannot re-verify on every commit:
//
// 1. No "use client" file (wherever it lives in src/, not just under
//    src/components/) imports a provider module, the spend ledger, the
//    real budget module, the Prisma client package, the generated Prisma
//    output, the database module, or the persistence layer directly --
//    this is what keeps GEMINI_API_KEY, the real-budget refusal decision,
//    and SQLite access out of the client bundle (T-02-01, T-03-02, T-05-02).
//    Each of these checks the file's own DIRECT import specifiers only, not
//    transitive imports one hop away -- see the "core/persistence" entry
//    below for why that specific substring is listed explicitly rather than
//    relied upon transitively.
// 2. Every file under src/app/actions/ reaches the LLM provider only by
//    importing from src/core/, never directly -- keeps runStoryDirector's
//    ceiling gate as the LLM's single dispatch point (T-02-04). Image and
//    video providers are deliberately NOT included in this invariant: per
//    02-RESEARCH.md's Architecture Patterns (Pattern 3) and this phase's own
//    plan, a Server Action IS the single call site for generateImage/
//    generateVideo (one scene, sequentially, no fan-out), so the ceiling
//    gate living directly inside that same action file is already the
//    single dispatch point -- there is no second call site to guard against.
// 3. Every file under src/app/actions/ reaches the database only by
//    importing from src/core/persistence/, never by importing the Prisma
//    client package, the generated output, or the database module directly
//    (T-03-03) -- keeps src/core/persistence/story-repository.ts's id
//    validation unskippable.
// 4. No file under src/ calls Prisma's unchecked raw-query escape hatch
//    (T-03-01) -- $queryRawUnsafe or $executeRawUnsafe.
// 5. Outside src/scripts/, a file may import the video provider only if it
//    IS src/app/actions/generate-video.ts, and may import the image
//    provider only if it IS src/app/actions/generate-images.ts (Phase 4,
//    plan 04-01 Task 3). This is what makes the approval gate and the
//    per-scene retry caps (src/core/approval/gates.ts, checked inside
//    generateSceneVideoAction) structurally unbypassable: a future Server
//    Action cannot reach Veo or Gemini Image without going through the one
//    function that already checks them (04-RESEARCH.md Pitfall 1).
// 6. Outside src/scripts/, a file may import a specifier containing
//    "child_process" only if it IS src/app/actions/open-story-folder.ts
//    (Phase 4, plan 04-04 Task 2). Spawning an operating-system process is
//    the single highest-consequence thing this application does with a
//    client-supplied string (a story id, however narrowly validated) -- so
//    it gets one file, one call site, and one validated argument, and a
//    second call site anywhere else is a failing gate rather than a review
//    miss.
// 7. Outside src/scripts/ (developer probe tools) and outside
//    src/core/budget/ itself (the module's own internals), a file may
//    import the real budget module (src/core/budget/) only if it is one of
//    the enumerated gated touch sites (Phase 5, plan 05-04). Invariant 5
//    enumerates the image/video PROVIDER import surface, not the BUDGET
//    MODULE's own import surface -- 05-RESEARCH.md found that gap is
//    exactly how two of the six real touch sites (the image and video
//    dispatch actions) were missed when the surface was enumerated by hand
//    for plans 05-01/05-03. This invariant's companion half additionally
//    forbids importing the now-retired development ledger
//    (src/lib/spend-ledger.ts) from anywhere outside src/scripts/ or
//    src/lib/ itself, so it cannot creep back onto a wife-facing path.
//
// 8. Every file under src/providers/ that imports the Google GenAI SDK
//    (@google/genai) must also import src/core/config/provider-timeouts.ts
//    AND its comment-stripped source must set the "timeout:" option key on
//    a config object (Phase 6, plan 06-02; 05-REVIEW.md WR-01,
//    06-RESEARCH.md Pattern 6). This is what keeps a single hung provider
//    HTTP call from being able to wedge serializeDispatch's shared queue
//    forever -- a future provider file that forgets the import or the
//    config key fails the build instead of silently reintroducing the gap.
// 9. src/app/actions/generate-video.ts's awaited `incrementVideoAttempt`
//    call must appear exactly once, and must textually precede the awaited
//    `generateVideo` dispatch call, on comment-stripped source (Phase 6,
//    plan 06-02; D-02). This structurally protects the retry-cap increment
//    from ever becoming conditional on the CAUSE of a failure -- a future
//    edit adding failure-type branching around the dispatch could otherwise
//    accidentally make the increment skip on one branch and not another.
//
// 10. src/app/actions/generate-video.ts's `validateMp4Buffer` call and its
//     `SceneAssetStatus.READY` status write must each appear EXACTLY ONCE,
//     and the READY write must appear at a higher character index than the
//     validate call, on comment-stripped source (Phase 6, plan 06-03;
//     OUTPUT-02; hardened after the Phase 6 security audit's T-06-09
//     finding -- ESC-4). This keeps the READY write structurally
//     unreachable without validation ever having run first, AND -- the
//     exact-count requirement, mirroring invariant 9's own pattern -- fails
//     the build the moment a second, earlier READY write is reintroduced
//     anywhere in the file, rather than only checking the position of the
//     LAST one. A prior version of this invariant checked only the last
//     occurrence's position, which is exactly what let T-06-09's
//     unvalidated readback-failure READY write (since removed) go
//     undetected: it existed earlier in the file, so the last-occurrence
//     check still passed. This still cannot prove the single surviving
//     write is unconditionally reached from every branch (that needs real
//     control-flow analysis, not a text-order check -- 06-REVIEW.md WR-04,
//     still deferred); it only closes the specific blind spot a second
//     write anywhere in the file created.
//
// Run with: node src/scripts/check-boundaries.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_ROOT = "src";

// This script's own path, relative to SRC_ROOT-walked output -- excluded
// from invariant 4's scan so the forbidden-method-name string constants
// held here do not report themselves as an offender.
const SELF_PATH = "src/scripts/check-boundaries.ts";

// Invariant 5's allow-list -- the ONLY files outside src/scripts/ permitted
// to import a video/image provider directly, held as named constants (not
// inlined per-branch) so the rule is a single, clearly-named source of
// truth rather than a repeated string literal.
const ALLOWED_VIDEO_DISPATCH_PATH = "src/app/actions/generate-video.ts";
const ALLOWED_IMAGE_DISPATCH_PATH = "src/app/actions/generate-images.ts";

// Invariant 6's allow-list -- the ONLY file outside src/scripts/ permitted
// to import a specifier containing "child_process" (Phase 4, plan 04-04).
const ALLOWED_PROCESS_SPAWN_PATH = "src/app/actions/open-story-folder.ts";

// Invariant 7's allow-list -- the ONLY files outside src/scripts/ and
// outside src/core/budget/ itself permitted to import the real budget
// module (src/core/budget/), held as one named constant array (mirroring
// invariant 5's/6's convention) so the enumerated real touch sites are a
// single source of truth. Six of these are the plan's own enumerated list
// (the story director, the uniqueness check, the scene-image action, the
// scene-video action, the story-status action, and the not-yet-created
// budget-status action plan 05-05 adds, included now so that plan needs no
// edit here); create-story.ts is a seventh real touch site this plan found
// while building this invariant -- it already imports BudgetExceededError
// directly (plan 05-03) to catch a refusal from the story director /
// uniqueness check it calls, and the plan's own hand-enumerated six-item
// list omitted it. Leaving it out would have made this invariant fail
// against the real codebase on the very commit that introduces it -- the
// exact "a real touch site missed by hand-enumeration" failure mode this
// invariant exists to close, this time in this plan's own list rather than
// invariant 5's.
const ALLOWED_BUDGET_MODULE_IMPORT_PATHS = [
  "src/core/story/director.ts",
  "src/core/uniqueness/check.ts",
  "src/app/actions/generate-images.ts",
  "src/app/actions/generate-video.ts",
  "src/app/actions/get-story-status.ts",
  "src/app/actions/create-story.ts",
  "src/app/actions/get-budget-status.ts",
];

// Invariant 7's companion allow-list -- the ONLY file outside src/scripts/
// and outside src/lib/ itself permitted to import the retired development
// ledger (src/lib/spend-ledger.ts). historical-import.ts (plan 05-02) type-
// imports its LedgerEntry shape to reconcile the dev ledger's 40 historical
// entries against GenerationRecord -- a completed, one-time migration
// already run for real (05-02-SUMMARY.md). It reads the ledger's TYPE SHAPE
// only (a type-only import, never a runtime value) and is never called from
// any wife-facing dispatch path.
const ALLOWED_RETIRED_LEDGER_IMPORT_PATH = "src/core/budget/historical-import.ts";

// Invariant 8's constants -- the exact SDK specifier every provider file's
// import is checked against, the timeouts module's specifier fragment every
// such file must also import, and the literal HttpOptions field name
// (per 06-RESEARCH.md Pattern 6) that must appear on a config object. Held
// as named constants so the scan below has one source of truth rather than
// a repeated literal.
const GOOGLE_GENAI_SPECIFIER = "@google/genai";
const PROVIDER_TIMEOUTS_SPECIFIER_FRAGMENT = "core/config/provider-timeouts";
const TIMEOUT_OPTION_KEY = "timeout:";

// Held as named constants (not inlined into the scan below) so invariant 4
// can skip this file's own path without also needing string-literal
// obfuscation to avoid self-matching.
const RAW_SQL_METHOD_1 = "$queryRawUnsafe";
const RAW_SQL_METHOD_2 = "$executeRawUnsafe";

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    // src/generated/ is Prisma's own gitignored, regenerated output -- it
    // is not application code this gate reviews, and its API surface
    // legitimately DEFINES $queryRawUnsafe/$executeRawUnsafe as methods
    // (invariant 4 checks whether APPLICATION code CALLS them, not whether
    // the generated client type-declares them).
    if (entry === "generated") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

// Covers static `import ... from "x"` / side-effect `import "x"`, dynamic
// `import("x")`, and `export ... from "x"` re-exports -- a specifier reaching
// this scanner through any of the three forms carries the same forbidden
// module just as much as a static import does (WR-03, 05-REVIEW.md): a
// re-export or a lazily-`await import()`-ed module still ships whatever it
// touches into the same bundle this gate exists to keep clean.
const IMPORT_SPECIFIER_PATTERNS = [
  /import\s+(?:[^'";]*?from\s+)?["']([^"']+)["']/g,
  /import\s*\(\s*["']([^"']+)["']\s*\)/g,
  /export\s+(?:[^'";]*?from\s+)?["']([^"']+)["']/g,
];

function importSpecifiers(content: string): string[] {
  const specifiers: string[] = [];
  for (const pattern of IMPORT_SPECIFIER_PATTERNS) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}

// Invariant 8: strips every whole-line "//" comment (a line whose trimmed
// text starts with "//") so a doc comment merely mentioning the timeout
// option key can never satisfy the content check on its own -- only a real
// config-object key counts.
function stripWholeLineComments(content: string): string {
  return content
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

function main(): void {
  const allFiles = walk(SRC_ROOT).map(normalize);
  let failed = false;

  // Invariant 1 -- any "use client" file ships to the browser, not just ones
  // under src/components/ (e.g. src/app/page.tsx is also a client file and
  // lives outside that directory).
  const clientFiles = allFiles.filter((f) => {
    if (!f.endsWith(".tsx") && !f.endsWith(".ts")) return false;
    const content = readFileSync(f, "utf8");
    return /^["']use client["'];?/m.test(content);
  });
  const offenders1: string[] = [];
  for (const file of clientFiles) {
    const specifiers = importSpecifiers(readFileSync(file, "utf8"));
    for (const spec of specifiers) {
      if (
        spec.includes("/providers/") ||
        spec.includes("spend-ledger") ||
        spec.includes("@prisma/client") ||
        spec.includes("/generated/prisma") ||
        spec.includes("lib/db") ||
        // WR-03: story-repository.ts/generation-repository.ts themselves
        // import lib/db and @prisma/client types, but neither of those
        // substrings appears in a client file's OWN import specifier when it
        // imports the persistence layer one hop away
        // (e.g. "@/core/persistence/story-repository") -- this gate only
        // string-matches direct imports, not transitive ones, so without
        // this entry a client component reaching straight into
        // src/core/persistence/ instead of through a Server Action would
        // ship database-access code into the client bundle undetected.
        spec.includes("core/persistence") ||
        // Phase 5 (T-05-02): src/core/budget/ledger.ts is a second sanctioned
        // database-touching core module (it imports lib/db directly, the
        // same one-hop-away gap the core/persistence entry above closes) --
        // without this entry a client component reaching straight into
        // src/core/budget/ instead of through a Server Action would ship
        // real-budget-enforcement/database-access code into the client
        // bundle undetected.
        spec.includes("core/budget") ||
        // Phase 6 (06-01, Task 2, T-06-03): src/core/config/provider-key.ts
        // reads the raw key-bearing environment variables (GOOGLE_API_KEY /
        // GEMINI_API_KEY). Next would not inline a plain, non-publicly-
        // prefixed variable into the client bundle regardless, but a client
        // file importing this module must still fail the build -- defense
        // in depth, the same reasoning the core/budget entry above already
        // carries.
        spec.includes("core/config")
      ) {
        offenders1.push(`${file} -> "${spec}"`);
      }
    }
  }
  if (offenders1.length > 0) {
    failed = true;
    console.log(
      "BOUNDARY CHECK FAILED (invariant 1 -- client bundle must never import a provider, the spend ledger, the real budget module, the server-only configuration module, or the database layer):",
    );
    for (const offender of offenders1) {
      console.log(`  ${offender}`);
    }
  } else {
    console.log(
      "OK: no \"use client\" file imports a provider, the spend ledger, the real budget module, the server-only configuration module, or the database layer",
    );
  }

  // Invariant 2
  const actionFiles = allFiles.filter((f) => f.includes("src/app/actions/"));
  const offenders2: string[] = [];
  for (const file of actionFiles) {
    const specifiers = importSpecifiers(readFileSync(file, "utf8"));
    for (const spec of specifiers) {
      if (spec.includes("/providers/llm/")) {
        offenders2.push(`${file} -> "${spec}"`);
      }
    }
  }
  if (offenders2.length > 0) {
    failed = true;
    console.log("BOUNDARY CHECK FAILED (invariant 2 -- src/app/actions/ must reach the LLM provider only through src/core/):");
    for (const offender of offenders2) {
      console.log(`  ${offender}`);
    }
  } else {
    console.log("OK: src/app/actions/ files reach the LLM provider only through src/core/");
  }

  // Invariant 3 -- every file under src/app/actions/ must reach the
  // database only by importing from src/core/persistence/, never by
  // importing the Prisma client package, the generated output, or the
  // database module directly (T-03-03). This is what keeps
  // story-repository.ts's storyDir() id validation unskippable.
  const offenders3: string[] = [];
  for (const file of actionFiles) {
    const specifiers = importSpecifiers(readFileSync(file, "utf8"));
    for (const spec of specifiers) {
      if (spec.includes("@prisma/client") || spec.includes("/generated/prisma") || spec.includes("lib/db")) {
        offenders3.push(`${file} -> "${spec}"`);
      }
    }
  }
  if (offenders3.length > 0) {
    failed = true;
    console.log(
      "BOUNDARY CHECK FAILED (invariant 3 -- src/app/actions/ must reach the database only through src/core/persistence/):",
    );
    for (const offender of offenders3) {
      console.log(`  ${offender}`);
    }
  } else {
    console.log("OK: src/app/actions/ files reach the database only through src/core/persistence/");
  }

  // Invariant 4 -- no file under src/ may call Prisma's unchecked raw-query
  // escape hatch (T-03-01). Scans file CONTENTS (not just import
  // specifiers) for the two forbidden method-name substrings, since
  // $queryRawUnsafe/$executeRawUnsafe are called as methods on an already-
  // imported client, not imported themselves. Skips this script's own path
  // (its own string constants would otherwise report themselves) -- the
  // walk() helper already excludes *.test.ts files.
  const offenders4: string[] = [];
  for (const file of allFiles) {
    if (file === SELF_PATH) continue;
    const content = readFileSync(file, "utf8");
    if (content.includes(RAW_SQL_METHOD_1) || content.includes(RAW_SQL_METHOD_2)) {
      offenders4.push(file);
    }
  }
  if (offenders4.length > 0) {
    failed = true;
    console.log("BOUNDARY CHECK FAILED (invariant 4 -- no file may call Prisma's unchecked raw-query escape hatch):");
    for (const offender of offenders4) {
      console.log(`  ${offender}`);
    }
  } else {
    console.log("OK: no file calls Prisma's unchecked raw-query escape hatch");
  }

  // Invariant 5 -- outside src/scripts/ (developer probe tools, excluded --
  // smoke-test.ts, story-probe.ts, and persistence-probe.ts legitimately
  // import the providers directly), a file may import the video provider
  // only if it IS the single allowed video dispatch file, and may import
  // the image provider only if it IS the single allowed image dispatch
  // file. This is what keeps the approval gate and per-scene retry caps
  // (src/core/approval/gates.ts) unbypassable: a second Veo/Gemini-Image
  // call site would fail this gate rather than silently skip the checks
  // that live inside the one allowed dispatch function.
  const offenders5: string[] = [];
  for (const file of allFiles) {
    if (file.startsWith("src/scripts/")) continue;
    const specifiers = importSpecifiers(readFileSync(file, "utf8"));
    for (const spec of specifiers) {
      if (spec.includes("/providers/video/") && file !== ALLOWED_VIDEO_DISPATCH_PATH) {
        offenders5.push(`${file} -> "${spec}"`);
      }
      if (spec.includes("/providers/image/") && file !== ALLOWED_IMAGE_DISPATCH_PATH) {
        offenders5.push(`${file} -> "${spec}"`);
      }
    }
  }
  if (offenders5.length > 0) {
    failed = true;
    console.log(
      "BOUNDARY CHECK FAILED (invariant 5 -- the video and image providers must each have a single paid dispatch point):",
    );
    for (const offender of offenders5) {
      console.log(`  ${offender}`);
    }
  } else {
    console.log("OK: the image and video providers each have a single paid dispatch point");
  }

  // Invariant 6 -- outside src/scripts/, a file may import a specifier
  // containing "child_process" only if it IS the single allowed
  // process-spawning file. Scans import specifiers only (not file
  // contents), so a comment mentioning "child_process" cannot trip this
  // gate -- only an actual import can.
  const offenders6: string[] = [];
  for (const file of allFiles) {
    if (file.startsWith("src/scripts/")) continue;
    if (file === ALLOWED_PROCESS_SPAWN_PATH) continue;
    const specifiers = importSpecifiers(readFileSync(file, "utf8"));
    for (const spec of specifiers) {
      if (spec.includes("child_process")) {
        offenders6.push(`${file} -> "${spec}"`);
      }
    }
  }
  if (offenders6.length > 0) {
    failed = true;
    console.log("BOUNDARY CHECK FAILED (invariant 6 -- only the output-folder action may spawn an operating-system process):");
    for (const offender of offenders6) {
      console.log(`  ${offender}`);
    }
  } else {
    console.log("OK: only the output-folder action may spawn an operating-system process");
  }

  // Invariant 7 -- outside src/scripts/ and outside src/core/budget/ itself,
  // a file may import the real budget module only if it is one of the
  // enumerated gated touch sites above (ALLOWED_BUDGET_MODULE_IMPORT_PATHS).
  // This is what makes that enumerated list structurally enforced rather
  // than merely documented: a future call site importing core/budget/
  // without being added here fails the build instead of silently skipping
  // the check that lives inside checkBudget.
  const offenders7a: string[] = [];
  for (const file of allFiles) {
    if (file.startsWith("src/scripts/")) continue;
    if (file.startsWith("src/core/budget/")) continue;
    if (ALLOWED_BUDGET_MODULE_IMPORT_PATHS.includes(file)) continue;
    const specifiers = importSpecifiers(readFileSync(file, "utf8"));
    for (const spec of specifiers) {
      if (spec.includes("core/budget")) {
        offenders7a.push(`${file} -> "${spec}"`);
      }
    }
  }

  // Invariant 7's companion -- outside src/scripts/ and outside src/lib/
  // itself, no file may import the retired development ledger
  // (src/lib/spend-ledger.ts), except the one enumerated
  // ALLOWED_RETIRED_LEDGER_IMPORT_PATH. Under Decision A1 (05-01-SUMMARY.md)
  // this is what keeps the retired ledger from creeping back onto a
  // wife-facing path; under A2 it would be trivially satisfied (the module
  // gone) but is kept anyway so a future reintroduction still fails the
  // gate.
  const offenders7b: string[] = [];
  for (const file of allFiles) {
    if (file.startsWith("src/scripts/")) continue;
    if (file.startsWith("src/lib/")) continue;
    if (file === ALLOWED_RETIRED_LEDGER_IMPORT_PATH) continue;
    const specifiers = importSpecifiers(readFileSync(file, "utf8"));
    for (const spec of specifiers) {
      if (spec.includes("spend-ledger")) {
        offenders7b.push(`${file} -> "${spec}"`);
      }
    }
  }

  if (offenders7a.length > 0) {
    failed = true;
    console.log("BOUNDARY CHECK FAILED (invariant 7 -- the real budget module's import surface must be enumerated):");
    for (const offender of offenders7a) {
      console.log(`  ${offender}`);
    }
  } else {
    console.log("OK: the real budget module has an enumerated import surface");
  }

  if (offenders7b.length > 0) {
    failed = true;
    console.log(
      "BOUNDARY CHECK FAILED (invariant 7 companion -- the retired development ledger must not be imported outside src/scripts/ or src/lib/):",
    );
    for (const offender of offenders7b) {
      console.log(`  ${offender}`);
    }
  } else {
    console.log("OK: the retired development ledger is not imported outside src/scripts/ or src/lib/");
  }

  // Invariant 8 -- every file under src/providers/ that imports the Google
  // GenAI SDK must also import provider-timeouts.ts AND must actually set
  // the "timeout:" option key on a config object, checked against the
  // file's comment-stripped source (05-REVIEW.md WR-01, 06-RESEARCH.md
  // Pattern 6). A hung provider HTTP call with no per-call bound can
  // permanently wedge serializeDispatch's shared queue (T-06-05).
  const offenders8: string[] = [];
  for (const file of allFiles) {
    if (!file.startsWith("src/providers/")) continue;
    const content = readFileSync(file, "utf8");
    const specifiers = importSpecifiers(content);
    if (!specifiers.some((spec) => spec === GOOGLE_GENAI_SPECIFIER)) continue;
    if (!specifiers.some((spec) => spec.includes(PROVIDER_TIMEOUTS_SPECIFIER_FRAGMENT))) {
      offenders8.push(`${file} -- imports @google/genai but not src/core/config/provider-timeouts.ts`);
      continue;
    }
    const stripped = stripWholeLineComments(content);
    if (!stripped.includes(TIMEOUT_OPTION_KEY)) {
      offenders8.push(`${file} -- imports @google/genai and provider-timeouts.ts but sets no "timeout:" config key`);
    }
  }
  if (offenders8.length > 0) {
    failed = true;
    console.log(
      "BOUNDARY CHECK FAILED (invariant 8 -- every provider file importing the Google GenAI SDK must import provider-timeouts.ts and set a timeout config key):",
    );
    for (const offender of offenders8) {
      console.log(`  ${offender}`);
    }
  } else {
    console.log(
      "OK: every provider file importing the Google GenAI SDK imports provider-timeouts.ts and sets a timeout config key",
    );
  }

  // Invariant 9 -- generate-video.ts's awaited incrementVideoAttempt call
  // must appear exactly once and must textually precede the awaited
  // generateVideo dispatch call, on comment-stripped source (Phase 6, plan
  // 06-02; D-02). Structurally protects the retry-cap increment from ever
  // becoming conditional on the cause of a failure: a future edit adding
  // failure-type branching around the dispatch fails this gate instead of
  // silently skipping the increment on one branch and not another.
  const INCREMENT_VIDEO_ATTEMPT_CALL = "await incrementVideoAttempt(";
  const GENERATE_VIDEO_DISPATCH_CALL = "await generateVideo(";
  const offenders9: string[] = [];
  {
    const content = readFileSync(ALLOWED_VIDEO_DISPATCH_PATH, "utf8");
    const stripped = stripWholeLineComments(content);
    const incrementMatches = stripped.split(INCREMENT_VIDEO_ATTEMPT_CALL).length - 1;
    const incrementIndex = stripped.indexOf(INCREMENT_VIDEO_ATTEMPT_CALL);
    const dispatchIndex = stripped.indexOf(GENERATE_VIDEO_DISPATCH_CALL);
    if (incrementMatches !== 1) {
      offenders9.push(
        `${ALLOWED_VIDEO_DISPATCH_PATH} -- expected exactly one awaited incrementVideoAttempt call, found ${incrementMatches}`,
      );
    } else if (dispatchIndex === -1) {
      offenders9.push(`${ALLOWED_VIDEO_DISPATCH_PATH} -- no awaited generateVideo dispatch call found`);
    } else if (incrementIndex >= dispatchIndex) {
      offenders9.push(
        `${ALLOWED_VIDEO_DISPATCH_PATH} -- incrementVideoAttempt does not textually precede the generateVideo dispatch call`,
      );
    }
  }
  if (offenders9.length > 0) {
    failed = true;
    console.log(
      "BOUNDARY CHECK FAILED (invariant 9 -- the video retry-cap increment must be unconditional on failure cause, D-02):",
    );
    for (const offender of offenders9) {
      console.log(`  ${offender}`);
    }
  } else {
    console.log("OK: generate-video.ts's retry-cap increment is unconditional and precedes the video dispatch call");
  }

  // Invariant 10 -- generate-video.ts's validateMp4Buffer call AND its
  // READY status write must each appear exactly once, and that one READY
  // write must appear at a higher character index than the validate call,
  // on comment-stripped source (Phase 6, plan 06-03; OUTPUT-02; hardened
  // per the Phase 6 security audit's T-06-09/ESC-4 finding -- see the
  // header comment above for why an exact count, not just the last
  // occurrence's position, is required).
  const VALIDATE_MP4_CALL = "validateMp4Buffer(";
  const READY_STATUS_CONSTANT = "SceneAssetStatus.READY";
  const offenders10: string[] = [];
  {
    const content = readFileSync(ALLOWED_VIDEO_DISPATCH_PATH, "utf8");
    const stripped = stripWholeLineComments(content);
    const validateMatches = stripped.split(VALIDATE_MP4_CALL).length - 1;
    const validateIndex = stripped.indexOf(VALIDATE_MP4_CALL);
    const readyMatches = stripped.split(READY_STATUS_CONSTANT).length - 1;
    const readyIndex = stripped.indexOf(READY_STATUS_CONSTANT);
    if (validateMatches !== 1) {
      offenders10.push(
        `${ALLOWED_VIDEO_DISPATCH_PATH} -- expected exactly one validateMp4Buffer call, found ${validateMatches}`,
      );
    } else if (readyMatches !== 1) {
      offenders10.push(
        `${ALLOWED_VIDEO_DISPATCH_PATH} -- expected exactly one SceneAssetStatus.READY write, found ${readyMatches}`,
      );
    } else if (readyIndex <= validateIndex) {
      offenders10.push(
        `${ALLOWED_VIDEO_DISPATCH_PATH} -- the READY status write does not follow the validateMp4Buffer call`,
      );
    }
  }
  if (offenders10.length > 0) {
    failed = true;
    console.log(
      "BOUNDARY CHECK FAILED (invariant 10 -- the success-path READY write is unreachable before MP4 validation, OUTPUT-02):",
    );
    for (const offender of offenders10) {
      console.log(`  ${offender}`);
    }
  } else {
    console.log(
      "OK: generate-video.ts's success-path READY write is unreachable before its validateMp4Buffer call",
    );
  }

  if (failed) {
    process.exitCode = 1;
  }
}

main();

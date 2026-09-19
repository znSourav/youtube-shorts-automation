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
        spec.includes("core/budget")
      ) {
        offenders1.push(`${file} -> "${spec}"`);
      }
    }
  }
  if (offenders1.length > 0) {
    failed = true;
    console.log(
      "BOUNDARY CHECK FAILED (invariant 1 -- client bundle must never import a provider, the spend ledger, the real budget module, or the database layer):",
    );
    for (const offender of offenders1) {
      console.log(`  ${offender}`);
    }
  } else {
    console.log(
      "OK: no \"use client\" file imports a provider, the spend ledger, the real budget module, or the database layer",
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

  if (failed) {
    process.exitCode = 1;
  }
}

main();

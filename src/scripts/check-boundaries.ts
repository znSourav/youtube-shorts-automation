// Dependency-free structural check (node:fs/node:path only, no shell grep)
// so it runs identically on Windows and POSIX shells. Asserts invariants
// that a one-time code review cannot re-verify on every commit:
//
// 1. No "use client" file (wherever it lives in src/, not just under
//    src/components/) imports a provider module, the spend ledger, the
//    Prisma client package, the generated Prisma output, the database
//    module, or the persistence layer directly -- this is what keeps
//    GEMINI_API_KEY and SQLite access out of the client bundle (T-02-01,
//    T-03-02). Each of these checks the file's own DIRECT import
//    specifiers only, not transitive imports one hop away -- see the
//    "core/persistence" entry below for why that specific substring is
//    listed explicitly rather than relied upon transitively.
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

function importSpecifiers(content: string): string[] {
  const specifiers: string[] = [];
  const importRegex = /import\s+(?:[^'";]*?from\s+)?["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    specifiers.push(match[1]);
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
        spec.includes("core/persistence")
      ) {
        offenders1.push(`${file} -> "${spec}"`);
      }
    }
  }
  if (offenders1.length > 0) {
    failed = true;
    console.log(
      "BOUNDARY CHECK FAILED (invariant 1 -- client bundle must never import a provider, the spend ledger, or the database layer):",
    );
    for (const offender of offenders1) {
      console.log(`  ${offender}`);
    }
  } else {
    console.log("OK: no \"use client\" file imports a provider, the spend ledger, or the database layer");
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

  if (failed) {
    process.exitCode = 1;
  }
}

main();

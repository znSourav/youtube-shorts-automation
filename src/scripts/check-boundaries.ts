// Dependency-free structural check (node:fs/node:path only, no shell grep)
// so it runs identically on Windows and POSIX shells. Asserts two
// invariants that a one-time code review cannot re-verify on every commit:
//
// 1. No file under src/components/ imports a provider module or the spend
//    ledger -- this is what keeps GEMINI_API_KEY out of the client bundle
//    (T-02-01).
// 2. Every file under src/app/actions/ reaches a provider only by importing
//    from src/core/, never directly -- keeps runStoryDirector's ceiling
//    gate as the single dispatch point (T-02-04).
//
// Run with: node src/scripts/check-boundaries.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_ROOT = "src";

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
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

  // Invariant 1
  const componentFiles = allFiles.filter((f) => f.includes("src/components/"));
  const offenders1: string[] = [];
  for (const file of componentFiles) {
    const specifiers = importSpecifiers(readFileSync(file, "utf8"));
    for (const spec of specifiers) {
      if (spec.includes("/providers/") || spec.includes("spend-ledger")) {
        offenders1.push(`${file} -> "${spec}"`);
      }
    }
  }
  if (offenders1.length > 0) {
    failed = true;
    console.log("BOUNDARY CHECK FAILED (invariant 1 -- client bundle must never import a provider or the spend ledger):");
    for (const offender of offenders1) {
      console.log(`  ${offender}`);
    }
  } else {
    console.log("OK: no src/components/ file imports a provider or the spend ledger");
  }

  // Invariant 2
  const actionFiles = allFiles.filter((f) => f.includes("src/app/actions/"));
  const offenders2: string[] = [];
  for (const file of actionFiles) {
    const specifiers = importSpecifiers(readFileSync(file, "utf8"));
    for (const spec of specifiers) {
      if (spec.includes("/providers/")) {
        offenders2.push(`${file} -> "${spec}"`);
      }
    }
  }
  if (offenders2.length > 0) {
    failed = true;
    console.log("BOUNDARY CHECK FAILED (invariant 2 -- src/app/actions/ must reach providers only through src/core/):");
    for (const offender of offenders2) {
      console.log(`  ${offender}`);
    }
  } else {
    console.log("OK: src/app/actions/ files reach providers only through src/core/");
  }

  if (failed) {
    process.exitCode = 1;
  }
}

main();

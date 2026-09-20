// Standalone structural audit for SECURITY-01's configuration half (06-01,
// Task 3), in the same shape as check-boundaries.ts: named checks, one
// `OK:` line per passing check, a loud failure line plus a non-zero exit on
// any failure, and a final summary line. Dependency-free (node:child_process
// for the git calls, node:fs for the file reads) so it runs identically on
// Windows and POSIX shells.
//
// This script proves, on every `npm run test:lib` invocation, what a
// one-time code review confirmed by hand at planning time (06-RESEARCH.md
// Architecture Patterns 3): .env.local is gitignored and never tracked,
// .env.local.example is tracked and carries only the placeholder value for
// every real API key it declares, and no file under src/ inlines a client-
// bundle-exposed environment variable.
//
// Run with: node src/scripts/secrets-audit.ts
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_ROOT = "src";

// This script's own path -- excluded from check 5's scan so the literal
// "NEXT_PUBLIC_" search term held here does not report itself as an
// offender. <!-- planner-discipline-allow: NEXT_PUBLIC_ -->
const SELF_PATH = "src/scripts/secrets-audit.ts";

const REAL_SECRETS_FILE = ".env.local";
const PLACEHOLDER_TEMPLATE_FILE = ".env.local.example";
const PLACEHOLDER_VALUE = "your-api-key-here";

// The Next.js public-variable prefix: any name starting with this is
// deliberately inlined into the client bundle by Next's own build step. A
// real secret must never carry this prefix.
const CLIENT_INLINE_PREFIX = "NEXT_PUBLIC_";

function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "generated") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function runGit(args: string[]): { status: number; stdout: string } {
  try {
    const stdout = execFileSync("git", args, { encoding: "utf8" });
    return { status: 0, stdout };
  } catch (err) {
    const execErr = err as { status?: number; stdout?: string };
    return { status: execErr.status ?? 1, stdout: execErr.stdout ?? "" };
  }
}

function main(): void {
  let failed = false;
  let okCount = 0;

  // Check 1: the real secrets file is gitignored.
  const checkIgnore = runGit(["check-ignore", "-v", REAL_SECRETS_FILE]);
  if (checkIgnore.status !== 0) {
    failed = true;
    console.log(`SECRETS AUDIT FAILED (check 1 -- ${REAL_SECRETS_FILE} must be gitignored):`);
    console.log(`  git check-ignore -v ${REAL_SECRETS_FILE} exited ${checkIgnore.status}`);
  } else {
    okCount += 1;
    console.log(`OK: ${REAL_SECRETS_FILE} is gitignored`);
  }

  // Check 2: the real secrets file is not tracked.
  const lsFilesReal = runGit(["ls-files", "--", REAL_SECRETS_FILE]);
  if (lsFilesReal.stdout.trim().length > 0) {
    failed = true;
    console.log(`SECRETS AUDIT FAILED (check 2 -- ${REAL_SECRETS_FILE} must not be tracked):`);
    console.log(`  git ls-files -- ${REAL_SECRETS_FILE} returned: ${lsFilesReal.stdout.trim()}`);
  } else {
    okCount += 1;
    console.log(`OK: ${REAL_SECRETS_FILE} is not tracked`);
  }

  // Check 3: the placeholder template IS tracked.
  const lsFilesTemplate = runGit(["ls-files", "--", PLACEHOLDER_TEMPLATE_FILE]);
  if (lsFilesTemplate.stdout.trim().length === 0) {
    failed = true;
    console.log(`SECRETS AUDIT FAILED (check 3 -- ${PLACEHOLDER_TEMPLATE_FILE} must be tracked):`);
    console.log(`  git ls-files -- ${PLACEHOLDER_TEMPLATE_FILE} returned nothing`);
  } else {
    okCount += 1;
    console.log(`OK: ${PLACEHOLDER_TEMPLATE_FILE} is tracked`);
  }

  // Check 4: every *_API_KEY assignment in the COMMITTED template equals the
  // literal placeholder. Reads via `git show HEAD:...`, not the working
  // copy, so the audit measures what is actually committed.
  const committedTemplate = runGit(["show", `HEAD:${PLACEHOLDER_TEMPLATE_FILE}`]);
  if (committedTemplate.status !== 0) {
    failed = true;
    console.log(`SECRETS AUDIT FAILED (check 4 -- could not read committed ${PLACEHOLDER_TEMPLATE_FILE}):`);
    console.log(`  git show HEAD:${PLACEHOLDER_TEMPLATE_FILE} exited ${committedTemplate.status}`);
  } else {
    const offenders4: string[] = [];
    const assignmentPattern = /^([A-Z0-9_]*_API_KEY)\s*=\s*"?([^"\r\n]*)"?\s*$/;
    for (const line of committedTemplate.stdout.split(/\r?\n/)) {
      const match = assignmentPattern.exec(line);
      if (!match) continue;
      const [, name, rawValue] = match;
      if (rawValue !== PLACEHOLDER_VALUE) {
        offenders4.push(`${name}=${rawValue}`);
      }
    }
    if (offenders4.length > 0) {
      failed = true;
      console.log(
        `SECRETS AUDIT FAILED (check 4 -- every *_API_KEY assignment in the committed ${PLACEHOLDER_TEMPLATE_FILE} must equal the placeholder "${PLACEHOLDER_VALUE}"):`,
      );
      for (const offender of offenders4) {
        console.log(`  ${offender}`);
      }
    } else {
      okCount += 1;
      console.log(`OK: every *_API_KEY assignment in the committed ${PLACEHOLDER_TEMPLATE_FILE} equals the placeholder`);
    }
  }

  // Check 5: no file under src/ contains a client-inlined environment
  // variable prefix. Scans file CONTENTS (not just import specifiers) for
  // the NEXT_PUBLIC_ prefix, skipping only this script's own path.
  const offenders5: string[] = [];
  for (const file of walk(SRC_ROOT).map(normalize)) {
    if (file === SELF_PATH) continue;
    const content = readFileSync(file, "utf8");
    if (content.includes(CLIENT_INLINE_PREFIX)) {
      offenders5.push(file);
    }
  }
  if (offenders5.length > 0) {
    failed = true;
    console.log(`SECRETS AUDIT FAILED (check 5 -- no file under ${SRC_ROOT}/ may declare a ${CLIENT_INLINE_PREFIX} variable):`);
    for (const offender of offenders5) {
      console.log(`  ${offender}`);
    }
  } else {
    okCount += 1;
    console.log(`OK: no file under ${SRC_ROOT}/ declares a ${CLIENT_INLINE_PREFIX} variable`);
  }

  if (failed) {
    console.log(`SECRETS AUDIT FAILED: ${okCount} of 5 checks passed.`);
    process.exitCode = 1;
  } else {
    console.log(`SECRETS AUDIT OK: all ${okCount} checks passed.`);
  }
}

main();

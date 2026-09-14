// Shared temp-database helper for tests. Exists because migration count is
// no longer one: both src/lib/db.test.ts and
// src/core/persistence/generation-repository.test.ts used to carry an
// identical private findMigrationSql() that applied only the FIRST
// migration directory (entries.find(isDirectory)) -- correct when exactly
// one migration existed. Phase 4 (plan 04-01) added a second migration
// directory, so any temp database built by those old helpers silently
// lacked imagesApprovedAt/imageAttempts/videoAttempts. Applying only the
// first migration is the specific bug this module prevents. It supersedes
// the duplicated private helpers 03-03-SUMMARY.md recorded as a known
// tradeoff.
//
// Kept dependency-light: node:fs, node:os, node:path, and better-sqlite3
// only -- it must NOT import src/generated/prisma or the Prisma client, so
// it stays usable from any test file regardless of what it's testing.
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database, { type DatabaseInstance } from "better-sqlite3";

/**
 * Applies every migration directory under prisma/migrations, in ascending
 * (lexicographic, i.e. timestamp) order, to the given database connection.
 * Throws a descriptive error if the migrations directory contains no
 * directory at all -- a silently-empty schema would otherwise fail far
 * later, at an unrelated query, with a confusing error.
 */
export function applyAllMigrations(db: DatabaseInstance): void {
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  const entries = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (entries.length === 0) {
    throw new Error(`No migration directory found under ${migrationsDir}`);
  }

  for (const name of entries) {
    const sqlPath = join(migrationsDir, name, "migration.sql");
    if (!existsSync(sqlPath)) {
      continue;
    }
    const sql = readFileSync(sqlPath, "utf8");
    db.exec(sql);
  }
}

/**
 * Creates a throwaway SQLite file inside node:os.tmpdir(), applies every
 * migration to it, and returns its `file:` connection URL -- never the real
 * prisma/dev.db, exactly as spend-ledger.test.ts never points at the real
 * ledger.
 */
export function tmpDatabaseUrl(): string {
  const dir = mkdtempSync(join(tmpdir(), "prisma-test-"));
  const dbPath = join(dir, "test.db");
  const db = new Database(dbPath);
  applyAllMigrations(db);
  db.close();
  return `file:${dbPath}`;
}

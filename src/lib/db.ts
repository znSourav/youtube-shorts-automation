// Server-only. This module must NEVER be imported by a "use client" file --
// check-boundaries.ts invariant 1 fails the structural gate if it is. It
// must also never be imported directly by a file under src/app/actions/ --
// invariant 3 requires every Server Action to reach the database only
// through src/core/persistence/story-repository.ts.
//
// PrismaClient singleton over the better-sqlite3 driver adapter
// (03-RESEARCH.md Pattern 1), shaped like spend-ledger.ts: exported
// constants first, then the factory, then the singleton. Cached on
// globalThis only outside production so Next.js's dev-server module
// re-evaluation does not open a fresh SQLite file handle on every hot
// reload.
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

export const DEFAULT_DATABASE_URL = "file:./prisma/dev.db";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: InstanceType<typeof PrismaClient> | undefined;
}

/**
 * Constructs a fresh PrismaClient against `url` (default: the resolved
 * DATABASE_URL, falling back to DEFAULT_DATABASE_URL). Injectable-default
 * parameter, matching spend-ledger.ts's `path: string = LEDGER_PATH`
 * convention -- this is what lets db.test.ts point a client at a temp
 * SQLite file instead of the real prisma/dev.db.
 */
export function createPrismaClient(
  url: string = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
): InstanceType<typeof PrismaClient> {
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

export const prisma: InstanceType<typeof PrismaClient> = globalThis.__prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

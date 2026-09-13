// Prisma 7 requires the connection URL and migrations path to live here, not
// in schema.prisma's datasource block -- 03-RESEARCH.md Pattern 2, verified
// locally this session: omitting `datasource.url` produces the exact error
// "Error: The datasource.url property is required in your Prisma config
// file when using prisma migrate dev." `DEFAULT_DATABASE_URL` mirrors the
// same string src/lib/db.ts exports, so both files agree on the fallback.
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: { path: path.join("prisma", "migrations") },
  datasource: { url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" },
});

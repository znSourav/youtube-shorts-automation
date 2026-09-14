// Minimal ambient declaration for better-sqlite3's default export -- covers
// only the surface src/lib/db.test.ts uses (constructing a connection,
// running a multi-statement migration script, closing the handle).
//
// Deliberately NOT the @types/better-sqlite3 DefinitelyTyped package: per
// this project's own deviation rules, a new package-manager install
// (including a @types/* package) is not auto-fixable mid-task and would
// require its own legitimacy checkpoint -- this ambient declaration avoids
// that entirely while fully typing the one call shape this project needs.
declare module "better-sqlite3" {
  // Exported (plan 04-01 Task 2) so src/lib/test-db.ts's applyAllMigrations
  // can name this type directly rather than re-deriving it via
  // InstanceType<typeof Database> at every call site.
  export interface DatabaseInstance {
    exec(sql: string): this;
    close(): this;
  }
  interface DatabaseConstructor {
    new (path: string): DatabaseInstance;
  }
  const Database: DatabaseConstructor;
  export default Database;
}

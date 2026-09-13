// Server-side story id generator, shared by createStoryAction and the CLI
// probes. The browser no longer invents this value (Phase 3) -- it is
// returned from the Server Action instead, so the id stored as the
// database's Story.id primary key and the id naming the
// storage/stories/<id>/ directory are provably the same value.
//
// Matches src/core/storage-paths.ts's STORY_ID_PATTERN (lowercase
// alphanumerics and hyphens only) -- Date.now() is all digits and
// Math.random().toString(36) is [0-9a-z], so no extra sanitizing is needed.
export function generateStoryId(): string {
  return `story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

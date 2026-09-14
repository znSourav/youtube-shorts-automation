// D-03: each scene carries its own fixed numeric cap on both image
// regeneration attempts and video retry attempts -- a click-loop guard
// independent of Phase 5's monthly budget gate. Mirrors
// src/core/uniqueness/check.ts's maxRegenerationAttempts() verbatim: only
// the env var name and default constant differ. 3 matches the uniqueness
// system's own default.
export const DEFAULT_MAX_SCENE_RETRY_ATTEMPTS = 3;

/**
 * Reads MAX_SCENE_RETRY_ATTEMPTS from the environment. Returns the parsed
 * value only when it is a finite integer of at least 1; an absent, zero,
 * negative, fractional, or non-numeric value degrades to the safe default
 * rather than to an unbounded or zero-attempt cap.
 */
export function maxSceneRetryAttempts(env: Record<string, string | undefined> = process.env): number {
  const raw = env.MAX_SCENE_RETRY_ATTEMPTS;
  if (raw === undefined) {
    return DEFAULT_MAX_SCENE_RETRY_ATTEMPTS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_MAX_SCENE_RETRY_ATTEMPTS;
  }
  return parsed;
}

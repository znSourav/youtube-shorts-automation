// STARTUP-02's pre-flight guard: a fast, synchronous, zero-I/O check for a
// configured provider API key, called at the top of every gated dispatch
// function -- BEFORE checkBudget (06-RESEARCH.md Pattern 1) -- so a missing
// key never falls through to Google's slow, generic Application Default
// Credentials lookup. Mirrors src/core/budget/ledger.ts's BudgetExceededError
// shape exactly (a class extending Error that sets `this.name` to its own
// class name, nothing else) so every Server Action's existing catch-and-map
// pattern extends with one more `instanceof` branch instead of a new
// control-flow shape.
export class MissingApiKeyError extends Error {
  constructor(message?: string) {
    // This message is for the server console only -- it is never returned to
    // a caller. MISSING_API_KEY_MESSAGE below is the one string that ever
    // crosses the Server Action -> browser boundary for this failure.
    super(message ?? "No provider API key is configured (checked GOOGLE_API_KEY, then GEMINI_API_KEY).");
    this.name = "MissingApiKeyError";
  }
}

// The single exported constant every Server Action returns for this failure,
// so all gated dispatch call sites share byte-identical copy and a test can
// assert on it directly. Names no environment variable, no file path, no
// provider, and no model, per D-03/D-04 and the plain-language-only
// convention Phases 2-5 established.
export const MISSING_API_KEY_MESSAGE =
  "This app isn't fully set up yet — its AI service key is missing. Ask whoever installed it to finish the setup steps, then try again.";

/**
 * Reads env.GOOGLE_API_KEY then falls back to env.GEMINI_API_KEY, trimming
 * each, and throws MissingApiKeyError when neither yields a non-empty value.
 * Order matters: 06-RESEARCH.md Pattern 1 verified against the installed
 * @google/genai SDK (node_modules/@google/genai/dist/node/index.cjs) that it
 * resolves GOOGLE_API_KEY first, so this guard can never be stricter than
 * what the SDK itself would actually accept.
 *
 * Synchronous and zero-I/O by design -- it must be cheaper than the database
 * round-trip checkBudget pays, so it always runs first.
 */
export function assertApiKeyConfigured(env: Record<string, string | undefined> = process.env): void {
  const key = env.GOOGLE_API_KEY?.trim() || env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new MissingApiKeyError();
  }
}

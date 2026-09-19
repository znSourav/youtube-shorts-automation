// Generalizes generate-video.ts's video-only `videoDispatchChain` mutex
// (added by Phase 4's own code review, CR-03 / 04-REVIEW.md second pass) into
// one shared, app-wide dispatch queue every paid-call site can use --
// 01-REVIEW-FIX.md's WR-02 note explicitly recommends "re-evaluating with a
// reserve-then-commit ledger design when Phase 5's real $15 budget system is
// built" rather than re-deriving a narrower, single-call-site patch for each
// new dispatch point.
//
// The unit this queue must serialize is NOT just "the budget check and the
// paid call" -- it is the budget check, the paid call, AND the spend record,
// together. Serializing only the first two still leaves the record outside
// the serialized window, so a second caller queued right behind the first
// can start its own check while the first caller's record write is still
// pending -- reopening the exact stale-total race this module exists to
// close, just narrowed from "the length of a Veo call" to "the length of one
// database write". Every caller MUST wrap check + call + record in a single
// `serializeDispatch` callback, never split across two.
//
// NON-REENTRANT WARNING: a function already running inside a
// `serializeDispatch` callback must NEVER call `serializeDispatch` again.
// The queue is a single module-scoped chain -- a nested call would enqueue
// itself behind the very callback it is running inside of, which cannot
// advance until the nested call resolves. That is a permanent hang, not a
// slow path.
//
// Residual risk, accepted (05-RESEARCH.md): this mutex only serializes
// dispatches within one Node process. A developer CLI script invoked
// alongside `npm run dev` (a second, independent process) is NOT covered --
// each process has its own module-scoped chain. Acceptable for a single
// local machine, and further contained by Decision A (05-01-SUMMARY.md,
// A1: a separate, explicitly-labelled developer ceiling for probe scripts)
// so a cross-process race stays confined to money set aside for testing,
// never her real monthly allowance.

let dispatchChain: Promise<unknown> = Promise.resolve();

/**
 * Runs `run` only after every previously-queued `serializeDispatch` call has
 * settled (resolved or rejected), and before any call queued after it. At
 * most one `run` is ever mid-flight app-wide. A rejecting `run` does not
 * wedge the queue -- the chain advances to the next call regardless of the
 * previous outcome. The returned promise resolves or rejects with exactly
 * `run`'s own outcome, never wrapped.
 */
export function serializeDispatch<T>(run: () => Promise<T>): Promise<T> {
  const started = dispatchChain.then(run, run);
  dispatchChain = started.then(
    () => undefined,
    () => undefined,
  );
  return started;
}

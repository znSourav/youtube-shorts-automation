// A scene sitting in "generating" longer than this is treated as possibly
// stuck (04-RESEARCH.md Pitfall 2 -- an after() callback can be dropped by a
// dev-server recompile). Set just beyond veo.ts's own 10-minute POLL_TIMEOUT_MS
// so a genuinely slow-but-live generation is never mislabelled.
//
// Lives in src/core/video/ rather than in VideoStatusScreen.tsx (where it
// previously lived) because the elapsed-time comparison this threshold
// gates is now made server-side, in get-story-status.ts -- a Server Action
// must not import from a client component module. This module has zero
// imports, so it is safe for either side (server or client) to read.
export const STUCK_AFTER_MS = 12 * 60 * 1000;

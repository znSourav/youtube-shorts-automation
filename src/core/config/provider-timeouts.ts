// 05-REVIEW.md WR-01: the shared `serializeDispatch` queue
// (src/core/budget/dispatch-chain.ts) has no timeout mechanism of its own --
// one provider HTTP call that never resolves permanently wedges every future
// paid dispatch until the process restarts. 06-RESEARCH.md Pattern 6/Common
// Pitfalls 3 verified (directly against the installed @google/genai SDK
// source) that `HttpOptions.timeout` is a real, per-attempt AbortController-
// based timeout, but it is OPT-IN -- none of the six Google GenAI call sites
// in this codebase passed it before this module existed, so every one of
// them could hang indefinitely with no bound at all.
//
// These three constants each bound exactly ONE individual HTTP attempt, not
// a whole operation -- video's own polling LOOP is a separate concern,
// already bounded by veo.ts's own POLL_TIMEOUT_MS (10 minutes). A per-call
// timeout and a per-loop timeout solve two different failure modes (a single
// hung request vs. an operation that legitimately never finishes) and
// neither substitutes for the other (06-RESEARCH.md Pitfall 3).
//
// This is a defense against an INFINITE hang, not a latency optimization --
// per 06-RESEARCH.md Assumption A3, every value here is set deliberately
// generously so a legitimately slow (but eventually successful) call is
// never aborted. These are tunable constants, not inlined literals, so a
// future adjustment is a one-line edit in this one file.

// A 7-scene structured-output Story Director call with maxOutputTokens:
// 16384 on the pro-preview model is legitimately slow; 3 minutes is far past
// any real observed call duration.
export const LLM_HTTP_TIMEOUT_MS = 180_000;

// One scene image generation call.
export const IMAGE_HTTP_TIMEOUT_MS = 120_000;

// Bounds only the individual `generateVideos` dispatch and each individual
// `getVideosOperation` poll request -- both of which return promptly by
// design (the long wait is the polling LOOP itself, which POLL_TIMEOUT_MS
// already bounds separately, per the header comment above).
export const VIDEO_HTTP_TIMEOUT_MS = 60_000;

// Phase 6 security audit (06-REVIEW.md follow-up, T-06-05): bounds the
// generated clip's `ai.files.download()` call in veo.ts. This is NOT an
// `httpOptions.timeout` value -- the installed SDK's own downloader
// (node_modules/@google/genai/dist/node/index.cjs's NodeDownloader.download)
// pipes the response body to a file write stream and awaits
// `stream.promises.finished(writer)` AFTER the initial request already
// resolved, so `httpOptions.timeout`'s AbortController only bounds getting
// that initial response, never the body transfer itself -- a connection that
// stalls mid-transfer hangs forever with no bound at all. veo.ts wraps the
// whole `ai.files.download()` call in a manual race against this constant
// instead. Generous relative to VIDEO_HTTP_TIMEOUT_MS because this bounds a
// real byte transfer (the committed test fixture is ~590KB for a 4-second
// clip; an 8-second 720p clip is still low single-digit megabytes) rather
// than an API round-trip, so the deliberately-generous-timeout philosophy
// above applies doubly here.
export const VIDEO_DOWNLOAD_TIMEOUT_MS = 120_000;

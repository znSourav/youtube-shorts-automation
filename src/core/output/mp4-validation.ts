// OUTPUT-02: proves a saved video file is a genuine, non-empty, playable MP4
// at approximately the requested duration and exactly 9:16 BEFORE
// generate-video.ts ever marks a scene READY. Grounded in 06-RESEARCH.md
// Pattern 4 (`mp4box`, verified in that research session against a real
// Veo-generated file already on disk in this repo) with two deliberate,
// reviewed corrections to that research's own reference snippet:
//
//   1. The verdict logic is split out as its own exported pure function,
//      `evaluateMp4Info`, taking already-extracted numbers and the
//      expectation and returning the same result type. `validateMp4Buffer`
//      does only the byte-level checks and the container parse, then
//      delegates every duration/aspect-ratio judgement to it -- mirroring
//      gates.ts's guard-clause-then-typed-decision shape (see
//      src/core/approval/gates.ts) and making the duration/aspect-ratio
//      rules directly testable with plain numbers, no second real fixture
//      needed per shape.
//
//   2. Missing video-track dimensions are an explicit INVALID verdict,
//      never a silent skip of the 9:16 check. Research's own snippet only
//      ran the aspect-ratio check `if (actualWidth && actualHeight)`,
//      which would let a video whose track could not be located pass with
//      no aspect-ratio proof at all -- OUTPUT-02 requires that proof to
//      actually happen, not be quietly skipped.
//
// Zero I/O by design, like gates.ts: this module takes an already-read
// Buffer and returns a plain object. It never touches the filesystem, the
// database, or a Server Action's return value directly -- the caller
// (generate-video.ts, Task 3) decides what to do with the verdict.
import { createFile, MP4BoxBuffer } from "mp4box";
import type { Movie, Track } from "mp4box";

export interface Mp4ValidationResult {
  valid: boolean;
  reason?: string;
  actualDurationSeconds?: number;
  actualWidth?: number;
  actualHeight?: number;
}

// A genuine multi-second 720p clip is always far larger than this --
// catches an empty or near-empty save (a truncated download, a JSON error
// body) before ever paying for a full container parse.
export const MIN_PLAUSIBLE_MP4_BYTES = 10_000;

// Tunable, not a hardcoded literal (06-RESEARCH.md Assumption A2 -- only one
// real sample has been measured this project; revisit after a few more real
// generations are observed).
export const DEFAULT_DURATION_TOLERANCE_SECONDS = 1;

// D-05/T-06-10: no byte counts, dimensions, container terminology, or paths
// -- those go only into the server console via console.error, never into
// this constant. Names the free retry because D-05 makes that true (a
// corrupted save does not consume one of the scene's limited attempts).
export const CORRUPT_VIDEO_MESSAGE =
  "This scene's video file didn't save properly, so it can't be used. Trying again won't use up one of this scene's attempts.";

interface Mp4ActualInfo {
  durationSeconds: number;
  width: number | undefined;
  height: number | undefined;
}

interface Mp4Expectation {
  durationSeconds: number;
  toleranceSeconds?: number;
}

/**
 * Pure verdict function -- takes already-extracted numbers and the
 * expectation, never a buffer or the mp4box parser. Directly unit-testable
 * with plain fixtures, mirroring gates.ts's shape (see this module's header
 * comment, correction 1).
 *
 * Branch order is load-bearing: duration is checked first (matching
 * 06-RESEARCH.md Pattern 4's own order), THEN missing dimensions are
 * rejected explicitly (correction 2 -- never a silent pass), THEN the
 * aspect ratio itself is checked via cross-multiplication to avoid
 * floating-point division error. 9:16 is the only aspect ratio this app
 * ever requests (veo.ts always passes aspectRatio: "9:16").
 */
export function evaluateMp4Info(actual: Mp4ActualInfo, expected: Mp4Expectation): Mp4ValidationResult {
  const { durationSeconds: actualDurationSeconds, width: actualWidth, height: actualHeight } = actual;

  const tolerance = expected.toleranceSeconds ?? DEFAULT_DURATION_TOLERANCE_SECONDS;
  if (Math.abs(actualDurationSeconds - expected.durationSeconds) > tolerance) {
    return {
      valid: false,
      reason: `duration ${actualDurationSeconds}s does not match expected ${expected.durationSeconds}s`,
      actualDurationSeconds,
      actualWidth,
      actualHeight,
    };
  }

  if (!actualWidth || !actualHeight) {
    return {
      valid: false,
      reason: "no video track with usable dimensions was found",
      actualDurationSeconds,
      actualWidth,
      actualHeight,
    };
  }

  if (actualWidth * 16 !== actualHeight * 9) {
    return {
      valid: false,
      reason: `dimensions ${actualWidth}x${actualHeight} are not 9:16`,
      actualDurationSeconds,
      actualWidth,
      actualHeight,
    };
  }

  return { valid: true, actualDurationSeconds, actualWidth, actualHeight };
}

/**
 * Selects the video track mp4box's parsed Movie info describes, in three
 * fallback steps (Task 1's deliberate correction 2): prefer the dedicated
 * `videoTracks` collection when it has a usable width, fall back to the
 * first track carrying a `video` descriptor, fall back to the first track
 * whose `track_width` is non-zero. Returns undefined width/height when no
 * such track can be found at all -- evaluateMp4Info then returns an
 * explicit invalid verdict rather than the 9:16 check silently no-op'ing.
 */
function selectVideoDimensions(info: Movie): { width: number | undefined; height: number | undefined } {
  const fromVideoTracks = info.videoTracks[0];
  if (fromVideoTracks?.track_width) {
    return { width: fromVideoTracks.track_width, height: fromVideoTracks.track_height };
  }

  const fromVideoDescriptor = info.tracks.find((t: Track) => t.video !== undefined);
  if (fromVideoDescriptor?.track_width) {
    return { width: fromVideoDescriptor.track_width, height: fromVideoDescriptor.track_height };
  }

  const fromNonZeroWidth = info.tracks.find((t: Track) => t.track_width);
  if (fromNonZeroWidth) {
    return { width: fromNonZeroWidth.track_width, height: fromNonZeroWidth.track_height };
  }

  return { width: undefined, height: undefined };
}

/**
 * Validates a saved video's already-in-memory bytes: a cheap magic-byte
 * pre-filter, then a full mp4box container parse, then delegates every
 * duration/aspect-ratio judgement to evaluateMp4Info above.
 *
 * Validity is decided by whether the ready callback fired, NOT by whether
 * the error callback fired -- verified empirically in 06-RESEARCH.md and
 * reconfirmed directly against this module's own fixture and three real
 * forgeries during this plan's own execution: an empty buffer and a
 * plain-text buffer fire NEITHER `onReady` NOR `onError`; only a
 * well-formed-but-wrong container (a real JPEG) fires `onError`. The only
 * trustworthy signal is `info === null` after a full appendBuffer + flush.
 */
export function validateMp4Buffer(bytes: Buffer, expected: Mp4Expectation): Mp4ValidationResult {
  if (bytes.length === 0) {
    return { valid: false, reason: "empty file" };
  }
  if (bytes.length < MIN_PLAUSIBLE_MP4_BYTES) {
    return { valid: false, reason: `implausibly small (${bytes.length} bytes)` };
  }
  // Bytes 4-8 spell "ftyp" in every valid MP4/ISOBMFF file -- catches a JSON
  // error body or a mislabeled image before paying for a full box parse.
  if (bytes.subarray(4, 8).toString("ascii") !== "ftyp") {
    return { valid: false, reason: "missing MP4 ftyp signature -- not a genuine MP4 container" };
  }

  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const mp4BoxBuffer = MP4BoxBuffer.fromArrayBuffer(arrayBuffer, 0);

  const mp4boxfile = createFile();
  let info: Movie | null = null;
  mp4boxfile.onReady = (i) => {
    info = i;
  };
  // onError does NOT reliably fire for garbage input -- see this function's
  // doc comment. This handler is a deliberate no-op; `info === null` below
  // is the only signal this function trusts.
  mp4boxfile.onError = () => {};

  try {
    mp4boxfile.appendBuffer(mp4BoxBuffer);
    mp4boxfile.flush();
  } catch {
    return { valid: false, reason: "malformed MP4 container" };
  }

  if (info === null) {
    return { valid: false, reason: "not a parseable MP4 (no moov box found)" };
  }

  const readyInfo: Movie = info;
  const { width, height } = selectVideoDimensions(readyInfo);
  const actualDurationSeconds = readyInfo.duration / readyInfo.timescale;

  return evaluateMp4Info({ durationSeconds: actualDurationSeconds, width, height }, expected);
}

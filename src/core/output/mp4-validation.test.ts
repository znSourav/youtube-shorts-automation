import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  validateMp4Buffer,
  evaluateMp4Info,
  MIN_PLAUSIBLE_MP4_BYTES,
  DEFAULT_DURATION_TOLERANCE_SECONDS,
  CORRUPT_VIDEO_MESSAGE,
} from "./mp4-validation.ts";

// Resolved relative to THIS test file, not the process working directory
// (the plan's own requirement) -- so `npm run test:lib`, `npm test`, and a
// future CI runner invoking this file from any cwd all find the same
// fixture. No test in this file reads any path under storage/.
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "fixtures", "veo-720x1280-4s.mp4");

// --- validateMp4Buffer: byte-level pre-filters ---

test("a zero-length buffer is invalid", () => {
  const result = validateMp4Buffer(Buffer.alloc(0), { durationSeconds: 4 });
  assert.equal(result.valid, false);
});

test("a buffer smaller than MIN_PLAUSIBLE_MP4_BYTES is invalid", () => {
  assert.ok(MIN_PLAUSIBLE_MP4_BYTES > 0);
  const smallBuffer = Buffer.alloc(MIN_PLAUSIBLE_MP4_BYTES - 1);
  const result = validateMp4Buffer(smallBuffer, { durationSeconds: 4 });
  assert.equal(result.valid, false);
});

test("a plain UTF-8 text buffer padded past the minimum size is invalid -- bytes 4-8 are not the container signature", () => {
  const textBuffer = Buffer.from("A".repeat(MIN_PLAUSIBLE_MP4_BYTES + 500), "utf8");
  const result = validateMp4Buffer(textBuffer, { durationSeconds: 4 });
  assert.equal(result.valid, false);
});

test("a buffer whose first four bytes are the JPEG signature, padded past the minimum size, is invalid", () => {
  // Synthetic, not a real committed JPEG (per this task's own action text):
  // the JPEG magic bytes (FF D8 FF E0) at offset 0, zero padding after --
  // this already fails the ftyp check at bytes 4-8 without needing a second
  // committed binary fixture.
  const jpegSignature = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const padding = Buffer.alloc(MIN_PLAUSIBLE_MP4_BYTES + 500 - jpegSignature.length);
  const jpegLikeBuffer = Buffer.concat([jpegSignature, padding]);
  const result = validateMp4Buffer(jpegLikeBuffer, { durationSeconds: 4 });
  assert.equal(result.valid, false);
});

// --- validateMp4Buffer: the real committed fixture ---

test("the committed fixture validated against an expected duration of 4 seconds is VALID, reporting exact duration/width/height", () => {
  const bytes = readFileSync(FIXTURE_PATH);
  const result = validateMp4Buffer(bytes, { durationSeconds: 4 });
  assert.equal(result.valid, true);
  // Exact equalities, not truthiness -- a failure to locate the video track
  // must fail this suite loudly rather than silently skipping the 9:16 rule.
  assert.equal(result.actualDurationSeconds, 4);
  assert.equal(result.actualWidth, 720);
  assert.equal(result.actualHeight, 1280);
});

test("the same fixture validated against an expected duration of 8 seconds is invalid -- the duration mismatch is caught", () => {
  const bytes = readFileSync(FIXTURE_PATH);
  const result = validateMp4Buffer(bytes, { durationSeconds: 8 });
  assert.equal(result.valid, false);
  assert.ok(result.reason?.includes("duration"));
});

test("the same fixture validated against an expected duration of 4 with a tolerance of 5 is valid -- tolerance is honoured", () => {
  const bytes = readFileSync(FIXTURE_PATH);
  const result = validateMp4Buffer(bytes, { durationSeconds: 4, toleranceSeconds: 5 });
  assert.equal(result.valid, true);
});

test("DEFAULT_DURATION_TOLERANCE_SECONDS is a finite positive number", () => {
  assert.equal(Number.isFinite(DEFAULT_DURATION_TOLERANCE_SECONDS), true);
  assert.ok(DEFAULT_DURATION_TOLERANCE_SECONDS > 0);
});

// --- evaluateMp4Info: the pure verdict function ---

test("evaluateMp4Info rejects a landscape clip even though its duration matches", () => {
  const result = evaluateMp4Info(
    { durationSeconds: 4, width: 1920, height: 1080 },
    { durationSeconds: 4 },
  );
  assert.equal(result.valid, false);
});

test("evaluateMp4Info accepts an exact 9:16 clip whose duration matches", () => {
  const result = evaluateMp4Info(
    { durationSeconds: 4, width: 720, height: 1280 },
    { durationSeconds: 4 },
  );
  assert.equal(result.valid, true);
});

test("evaluateMp4Info rejects missing dimensions as INVALID, never a silent pass", () => {
  const result = evaluateMp4Info(
    { durationSeconds: 4, width: undefined, height: undefined },
    { durationSeconds: 4 },
  );
  assert.equal(result.valid, false);
});

// --- CORRUPT_VIDEO_MESSAGE: no technical detail ---

test("CORRUPT_VIDEO_MESSAGE contains none of the forbidden technical substrings, case-insensitively", () => {
  const lowered = CORRUPT_VIDEO_MESSAGE.toLowerCase();
  for (const forbidden of ["mp4", "ftyp", "moov", "byte", "storage/", "720", "1280"]) {
    assert.equal(lowered.includes(forbidden), false, `CORRUPT_VIDEO_MESSAGE must not contain "${forbidden}"`);
  }
});

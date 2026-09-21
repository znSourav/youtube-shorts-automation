import { test } from "node:test";
import assert from "node:assert/strict";

import {
  plainLanguageVideoBlockMessage,
  VIDEO_CONTENT_BLOCK_MESSAGE,
  VIDEO_TECHNICAL_BLOCK_MESSAGE,
  withTimeout,
  type VideoBlockKind,
} from "./veo.ts";

// Fixture-object / node:test convention matches src/core/approval/gates.test.ts
// and src/core/uniqueness/check.test.ts. Deliberately does NOT call
// generateVideo itself -- it constructs a real SDK client; this file tests
// only the exported pure selector, constants, and type (plan Task 2's own
// scope note).

test('plainLanguageVideoBlockMessage("content") returns VIDEO_CONTENT_BLOCK_MESSAGE', () => {
  assert.equal(plainLanguageVideoBlockMessage("content"), VIDEO_CONTENT_BLOCK_MESSAGE);
});

test('plainLanguageVideoBlockMessage("technical") returns VIDEO_TECHNICAL_BLOCK_MESSAGE', () => {
  assert.equal(plainLanguageVideoBlockMessage("technical"), VIDEO_TECHNICAL_BLOCK_MESSAGE);
});

test("plainLanguageVideoBlockMessage(undefined) returns VIDEO_TECHNICAL_BLOCK_MESSAGE, never the rephrase framing", () => {
  assert.equal(plainLanguageVideoBlockMessage(undefined), VIDEO_TECHNICAL_BLOCK_MESSAGE);
});

test("neither block message constant leaks provider/operation/reason-code terminology", () => {
  const forbidden = ["rai", "operation", "veo", "storage/", "no_video"];
  for (const message of [VIDEO_CONTENT_BLOCK_MESSAGE, VIDEO_TECHNICAL_BLOCK_MESSAGE]) {
    const lowered = message.toLowerCase();
    for (const term of forbidden) {
      assert.ok(!lowered.includes(term), `"${message}" unexpectedly contains forbidden substring "${term}"`);
    }
  }
});

test("both block message constants are non-empty and differ from each other", () => {
  assert.ok(VIDEO_CONTENT_BLOCK_MESSAGE.length > 0);
  assert.ok(VIDEO_TECHNICAL_BLOCK_MESSAGE.length > 0);
  assert.notEqual(VIDEO_CONTENT_BLOCK_MESSAGE, VIDEO_TECHNICAL_BLOCK_MESSAGE);
});

test("VideoBlockKind accepts exactly the two documented member values", () => {
  const content: VideoBlockKind = "content";
  const technical: VideoBlockKind = "technical";
  assert.equal(plainLanguageVideoBlockMessage(content), VIDEO_CONTENT_BLOCK_MESSAGE);
  assert.equal(plainLanguageVideoBlockMessage(technical), VIDEO_TECHNICAL_BLOCK_MESSAGE);
});

// Security audit T-06-05: withTimeout is what bounds ai.files.download(),
// whose own httpOptions.timeout does not cover the SDK's post-response
// stream-to-disk phase (see provider-timeouts.ts's VIDEO_DOWNLOAD_TIMEOUT_MS
// comment). It is generic, SDK-free logic, so -- unlike generateVideo
// itself -- it is directly unit-testable without a real network call.

test("withTimeout resolves with the inner promise's value when it settles before the deadline", async () => {
  const result = await withTimeout(Promise.resolve("done"), 1000, "should not fire");
  assert.equal(result, "done");
});

test("withTimeout rejects with the inner promise's own rejection reason, not the timeout message, when the inner promise rejects first", async () => {
  const inner = Promise.reject(new Error("real download error"));
  await assert.rejects(() => withTimeout(inner, 1000, "should not fire"), /real download error/);
});

test("withTimeout rejects with the timeout message when the inner promise never settles before the deadline", async () => {
  const neverSettles = new Promise(() => {});
  await assert.rejects(
    () => withTimeout(neverSettles, 20, "video download timed out"),
    /video download timed out/,
  );
});

test("withTimeout's timer does not fire after an early resolution (no unhandled rejection)", async () => {
  const result = await withTimeout(Promise.resolve("fast"), 20, "should not fire");
  assert.equal(result, "fast");
  // If the timer were not cleared, it would fire ~20ms from now; wait past
  // that window inside the test so node:test's unhandled-rejection guard
  // would still attribute a stray rejection to this test.
  await new Promise((resolve) => setTimeout(resolve, 40));
});

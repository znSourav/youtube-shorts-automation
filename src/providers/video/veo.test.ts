import { test } from "node:test";
import assert from "node:assert/strict";

import {
  plainLanguageVideoBlockMessage,
  VIDEO_CONTENT_BLOCK_MESSAGE,
  VIDEO_TECHNICAL_BLOCK_MESSAGE,
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

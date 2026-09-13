import { test } from "node:test";
import assert from "node:assert/strict";

import { jaccardSimilarity, scoreFingerprints, preFilterVerdict, HIGH_THRESHOLD, BORDERLINE_THRESHOLD } from "./similarity.ts";
import type { StructuralFingerprint } from "./fingerprint.ts";

// 03-RESEARCH.md Assumption A1's two fixture pairs, also driven by
// uniqueness-probe.ts. Every field below deliberately stays in the
// abstracted, noun-free style FINGERPRINT_INSTRUCTION requires -- these are
// realistic fingerprint objects, not raw story prose.

// Pair 1: near-identical structural phrasing, one word swapped per field --
// simulates a genuine reskin. Every field must independently clear
// HIGH_THRESHOLD so the pair rejects (UNIQUE-01 sees through a reskin).
const RESKIN_PAST: StructuralFingerprint = {
  protagonistWant: "a character wants to reconnect with a distant relative they have not seen in years",
  centralObstacle: "the two are separated by distance and neither has the means to travel right now",
  endingShape: "the reunion brings quiet warmth and a sense of relief neither expected",
};
const RESKIN_CANDIDATE: StructuralFingerprint = {
  protagonistWant: "a character wants to reconnect with a distant stranger they have not seen in years",
  centralObstacle: "the two are separated by distance and neither has the courage to travel right now",
  endingShape: "the reunion brings quiet warmth and a sense of relief neither predicted",
};

// Pair 2: genuinely different structures that happen to share only generic
// surface words (girl, forest) -- must pass, proving UNIQUE-03's guard
// against false-rejecting stories that merely share surface elements.
const SHARED_SURFACE_PAST: StructuralFingerprint = {
  protagonistWant: "a girl wants to escape a haunted forest before dark",
  centralObstacle: "wild animals block every path out of the woods",
  endingShape: "relief and safety after finding the way home",
};
const SHARED_SURFACE_CANDIDATE: StructuralFingerprint = {
  protagonistWant: "a girl wants to protect a forest from being destroyed",
  centralObstacle: "a greedy developer wants to cut down every tree",
  endingShape: "pride and determination after saving the forest",
};

test("the near-identical reskin pair scores above HIGH_THRESHOLD on all three fields and rejects (UNIQUE-01)", () => {
  const scores = scoreFingerprints(RESKIN_CANDIDATE, RESKIN_PAST);
  assert.ok(scores.want >= HIGH_THRESHOLD, `want=${scores.want}`);
  assert.ok(scores.obstacle >= HIGH_THRESHOLD, `obstacle=${scores.obstacle}`);
  assert.ok(scores.ending >= HIGH_THRESHOLD, `ending=${scores.ending}`);
  assert.equal(preFilterVerdict(scores), "reject");
});

test("the shared-surface-words pair (girl/forest) scores low and passes despite the generic overlap (UNIQUE-03)", () => {
  const scores = scoreFingerprints(SHARED_SURFACE_CANDIDATE, SHARED_SURFACE_PAST);
  assert.ok(scores.want < BORDERLINE_THRESHOLD, `want=${scores.want}`);
  assert.ok(scores.obstacle < BORDERLINE_THRESHOLD, `obstacle=${scores.obstacle}`);
  assert.ok(scores.ending < BORDERLINE_THRESHOLD, `ending=${scores.ending}`);
  assert.equal(preFilterVerdict(scores), "pass");
});

test("a two-of-three alignment passes, never rejects (D-02)", () => {
  const verdict = preFilterVerdict({ want: 0.9, obstacle: 0.9, ending: 0.1 });
  assert.equal(verdict, "pass");
});

test("a three-of-three middle-band alignment escalates rather than rejects", () => {
  const verdict = preFilterVerdict({ want: 0.5, obstacle: 0.55, ending: 0.6 });
  assert.equal(verdict, "escalate");
});

test("jaccardSimilarity returns 0 when either token set is empty, not 1", () => {
  assert.equal(jaccardSimilarity("!!! ??? ---", "a normal sentence with real words"), 0);
  assert.equal(jaccardSimilarity("", ""), 0);
  assert.equal(jaccardSimilarity("", "some words here"), 0);
});

test("tokenize preserves non-Latin letters -- a Bangla-script field scores above 0 against a related Bangla-script field", () => {
  // "a girl wants to find her lost book" / "...lost pen" -- meant only to
  // exercise Unicode letter preservation, not verified for grammatical
  // correctness; the point is these are real Bangla Unicode codepoints, not
  // ASCII, and share several tokens.
  const banglaA = "একটি মেয়ে তার হারানো বই খুঁজে পেতে চায়";
  const banglaB = "একটি মেয়ে তার হারানো কলম খুঁজে পেতে চায়";
  const score = jaccardSimilarity(banglaA, banglaB);
  assert.ok(score > 0, `expected a positive score, got ${score} -- ASCII-only tokenising would collapse this to 0`);
});

test("identical strings score exactly 1", () => {
  assert.equal(jaccardSimilarity("hello world this is a real sentence", "hello world this is a real sentence"), 1);
});

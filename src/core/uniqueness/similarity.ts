// Deterministic, dependency-free structural pre-filter over D-01's three
// fingerprint fields (protagonistWant/centralObstacle/endingShape). This is
// UNIQUE-01's zero-cost common path: normalized-token Jaccard similarity
// per field, compared against two reasoned threshold bands (03-RESEARCH.md
// Pattern 5 / Assumption A1). No external standard covers this exact
// three-field structural comparison -- these numbers are a starting point,
// kept honest by the fixture pairs in similarity.test.ts, not an empirically
// tuned constant.
//
// Style mirrors src/core/storage-paths.ts: small private helpers feeding
// exported pure functions, no I/O, no classes.
import type { StructuralFingerprint } from "./fingerprint.ts";

// 03-RESEARCH.md Assumption A1's reasoned starting values: >= 0.75 per field
// reads as "obvious match, reject directly" (D-02's "all three align"
// wording taken literally -- near-identical independently-generated
// structural phrasing is already strong signal); 0.4-0.75 reads as
// "borderline, worth a single targeted LLM opinion" only when every one of
// the three fields lands there against the SAME past story. Below 0.4 on
// any field is a pass with zero LLM cost, which is the common case this
// whole pre-filter exists to answer for free.
export const HIGH_THRESHOLD = 0.75;
export const BORDERLINE_THRESHOLD = 0.4;

// A small English stopword set -- the three fingerprint fields are written
// in English by contract (fingerprint.ts's FINGERPRINT_INSTRUCTION carves
// out an explicit do-not-translate exception for exactly these three
// fields), so an English-only stopword list is the correct scope; it simply
// has no effect on a Bangla-script field a model produced despite that
// instruction, which is exactly the defensive case this module still has to
// tokenize correctly rather than collapse to nothing.
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "and",
  "or",
  "is",
  "their",
  "its",
]);

/**
 * Lowercases, strips everything that is not a Unicode letter, a Unicode
 * number, or whitespace, splits on whitespace, and drops empty tokens and
 * English stopwords.
 *
 * Uses Unicode property escapes (`\p{L}`, `\p{N}`) with the `u` flag --
 * NOT an ASCII-only character class (`[^a-z0-9\s]`). An ASCII-only class is
 * the single most dangerous implementation choice available in this
 * function: this product's stories are written in Bangla script and
 * Banglish, and although FINGERPRINT_INSTRUCTION requires these three
 * fields specifically to come back in English, a model that ignores that
 * instruction even once would produce fingerprint text an ASCII tokeniser
 * silently reduces to an empty token set -- which, left unguarded, could
 * manufacture either a false pass (missed real collision) or, combined with
 * a naive both-empty-means-identical convention, a false collision that
 * burns a real paid regeneration call. Unicode-aware tokenising is what
 * lets this module fail toward "these are different" instead.
 */
function tokenize(text: string): Set<string> {
  const cleaned = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
  const tokens = cleaned.split(/\s+/).filter((tok) => tok.length > 0 && !STOPWORDS.has(tok));
  return new Set(tokens);
}

/**
 * Intersection size over union size of the two strings' token sets.
 *
 * When either token set is empty, returns 0, NOT 1. This is deliberately
 * the opposite of the naive both-empty-means-identical convention: an
 * unanalysable comparison key (an empty or punctuation-only field) must
 * score as *different*, because the cost of a false "identical" is a
 * rejection that burns a real paid regeneration call out of this project's
 * remaining dev-ceiling headroom, and if every attempt repeats it, an
 * incorrect D-04 exhaustion warning shown to the wife. Fail toward "these
 * are different" -- the same direction UNIQUE-03 itself requires.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }
  let intersectionSize = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionSize += 1;
    }
  }
  const unionSize = new Set([...setA, ...setB]).size;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

export interface FingerprintScores {
  want: number;
  obstacle: number;
  ending: number;
}

/**
 * Scores each of D-01's three elements independently between two
 * fingerprints.
 */
export function scoreFingerprints(a: StructuralFingerprint, b: StructuralFingerprint): FingerprintScores {
  return {
    want: jaccardSimilarity(a.protagonistWant, b.protagonistWant),
    obstacle: jaccardSimilarity(a.centralObstacle, b.centralObstacle),
    ending: jaccardSimilarity(a.endingShape, b.endingShape),
  };
}

export type PreFilterVerdict = "reject" | "escalate" | "pass";

/**
 * Implements D-02 literally: a candidate is rejected as too-similar only
 * when ALL THREE of D-01's elements align with the same past story. A
 * two-of-three overlap is deliberately NOT a reject -- it falls through to
 * pass (or, in the middle band, to escalate) -- which is the concrete
 * mechanism that stops two genuinely different stories that merely share
 * generic surface elements from being falsely rejected (UNIQUE-03).
 */
export function preFilterVerdict(scores: FingerprintScores): PreFilterVerdict {
  const { want, obstacle, ending } = scores;
  if (want >= HIGH_THRESHOLD && obstacle >= HIGH_THRESHOLD && ending >= HIGH_THRESHOLD) {
    return "reject";
  }
  if (want >= BORDERLINE_THRESHOLD && obstacle >= BORDERLINE_THRESHOLD && ending >= BORDERLINE_THRESHOLD) {
    return "escalate";
  }
  return "pass";
}

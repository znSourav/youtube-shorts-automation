// Standalone CLI probe for the uniqueness pre-filter, in the same spirit as
// persistence-probe.ts. Makes NO provider call in any mode -- this is the
// cheap way to sanity-check similarity.ts's thresholds without spending
// anything.
//
// Modes:
//   (no args)      runs the two 03-RESEARCH.md Assumption A1 fixture pairs
//                  through scoreFingerprints/preFilterVerdict.
//   --against-db   additionally reads the REAL accepted history through
//                  listAcceptedFingerprints and scores the first fixture
//                  candidate against every row -- still zero cost.
//   --prove-collision  03-04 Task 2: dispatches nothing. Reads the most
//                  recently ACCEPTED story's real fingerprint through
//                  listAcceptedFingerprints and derives two candidates from
//                  it MECHANICALLY (no hand-written text), so the proof is
//                  deterministic and repeatable: Candidate A is a structural
//                  near-duplicate (same tokens, reordered, a small fraction
//                  dropped) that the pre-filter must catch (reject or
//                  escalate); Candidate B borrows 2-3 of the real story's own
//                  words but places them inside a fixed, structurally
//                  unrelated template, which must NOT be rejected
//                  (UNIQUE-03's false-rejection guard).
//
// Run with:
//   node src/scripts/uniqueness-probe.ts
//   node --env-file=.env.local src/scripts/uniqueness-probe.ts --against-db
//   node --env-file=.env.local src/scripts/uniqueness-probe.ts --prove-collision
import { scoreFingerprints, preFilterVerdict, type PreFilterVerdict } from "../core/uniqueness/similarity.ts";
import type { StructuralFingerprint } from "../core/uniqueness/fingerprint.ts";

// Mirrors similarity.test.ts's two Assumption A1 fixture pairs exactly, so a
// change to either file that breaks the other is immediately visible.
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

interface FixturePair {
  name: string;
  candidate: StructuralFingerprint;
  past: StructuralFingerprint;
  expected: PreFilterVerdict;
}

const FIXTURE_PAIRS: FixturePair[] = [
  { name: "reskin", candidate: RESKIN_CANDIDATE, past: RESKIN_PAST, expected: "reject" },
  { name: "shared-surface-nouns", candidate: SHARED_SURFACE_CANDIDATE, past: SHARED_SURFACE_PAST, expected: "pass" },
];

function runFixturePairs(): boolean {
  let allExpected = true;
  for (const pair of FIXTURE_PAIRS) {
    const scores = scoreFingerprints(pair.candidate, pair.past);
    const verdict = preFilterVerdict(scores);
    console.log(
      `UNIQUENESS PROBE: pair=${pair.name} want=${scores.want.toFixed(3)} obstacle=${scores.obstacle.toFixed(3)} ` +
        `ending=${scores.ending.toFixed(3)} verdict=${verdict}`,
    );
    if (verdict !== pair.expected) {
      allExpected = false;
    }
  }
  return allExpected;
}

/**
 * Candidate A (structural near-duplicate): keeps the SAME underlying token
 * content as the real fingerprint field but (a) drops roughly one word in
 * five, deterministically by index -- not randomly -- and (b) reverses the
 * remaining word order. jaccardSimilarity is a SET comparison, so the
 * reversal has no scoring effect on its own; the point of reversing is that
 * the resulting string is visibly not an identical copy-paste, while the
 * ~80% token overlap is exactly what a reskin looks like to a Jaccard
 * pre-filter. No random/LLM step -- fully deterministic and repeatable.
 */
function nearDuplicateField(text: string): string {
  const words = text.trim().split(/\s+/);
  const kept = words.filter((_, i) => i % 5 !== 4);
  return kept.slice().reverse().join(" ");
}

function buildCandidateA(real: StructuralFingerprint): StructuralFingerprint {
  return {
    protagonistWant: nearDuplicateField(real.protagonistWant),
    centralObstacle: nearDuplicateField(real.centralObstacle),
    endingShape: nearDuplicateField(real.endingShape),
  };
}

/**
 * Extracts one content word (length > 4, ASCII letters only) from a
 * fingerprint field for Candidate B, falling back to a generic placeholder
 * when the field yields nothing usable (e.g. it came back in Bangla script
 * rather than English -- itself a reportable finding, not something this
 * probe should crash on).
 */
function extractSurfaceWord(text: string, fallback: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4);
  return words[0] ?? fallback;
}

// Candidate B's template is FIXED and held as a constant here, deliberately
// describing a structurally unrelated story (winning a race) from whatever
// the real story's own want/obstacle/ending actually are. Only the borrowed
// surface words vary per real story -- the D-01 structural shape never does.
// This is UNIQUE-03's false-rejection proof: sharing a few surface words
// must never be enough to reject a genuinely different story.
function buildCandidateB(real: StructuralFingerprint): StructuralFingerprint {
  const word1 = extractSurfaceWord(real.protagonistWant, "object");
  const word2 = extractSurfaceWord(real.centralObstacle, "owner");
  const word3 = extractSurfaceWord(real.endingShape, "satisfaction");
  return {
    protagonistWant: `a competitor wants to win first place in a village race, thinking about the ${word1} the whole time`,
    centralObstacle: `a faster rival keeps beating them in every practice round despite the ${word2}`,
    endingShape: `pride and excitement after finally crossing the finish line first, near the ${word3}`,
  };
}

/**
 * Derives both proof candidates from the most recently ACCEPTED real story
 * in the database and scores them against it. Dispatches nothing -- reads
 * only. Returns true (prints "collision proof ok") when Candidate A does NOT
 * pass (reject or escalate both count as "the gate caught it") AND
 * Candidate B does NOT reject (pass or escalate both count as "the
 * false-rejection guard held").
 */
async function runProveCollision(): Promise<boolean> {
  const { listAcceptedFingerprints } = await import("../core/persistence/story-repository.ts");
  const past = await listAcceptedFingerprints();

  if (past.length === 0) {
    console.log(
      "UNIQUENESS PROBE: collision proof unexpected (no ACCEPTED story in the database to derive candidates " +
        "from -- run persistence-probe.ts --real first)",
    );
    return false;
  }

  // Exactly one row is expected here post-D-05-cleanup (the probe fixture
  // was deleted before the real dispatch); taking the last entry is a
  // defensive "most recent" convention if more than one is ever present.
  const mostRecent = past[past.length - 1];
  const real: StructuralFingerprint = {
    protagonistWant: mostRecent.protagonistWant,
    centralObstacle: mostRecent.centralObstacle,
    endingShape: mostRecent.endingShape,
  };

  const candidateA = buildCandidateA(real);
  const scoresA = scoreFingerprints(candidateA, real);
  const verdictA = preFilterVerdict(scoresA);
  console.log(
    `UNIQUENESS PROBE: collision candidate=A(near-duplicate) want=${scoresA.want.toFixed(3)} ` +
      `obstacle=${scoresA.obstacle.toFixed(3)} ending=${scoresA.ending.toFixed(3)} verdict=${verdictA}`,
  );

  const candidateB = buildCandidateB(real);
  const scoresB = scoreFingerprints(candidateB, real);
  const verdictB = preFilterVerdict(scoresB);
  console.log(
    `UNIQUENESS PROBE: collision candidate=B(shared-surface-words) want=${scoresB.want.toFixed(3)} ` +
      `obstacle=${scoresB.obstacle.toFixed(3)} ending=${scoresB.ending.toFixed(3)} verdict=${verdictB}`,
  );

  const ok = verdictA !== "pass" && verdictB !== "reject";
  if (ok) {
    console.log("UNIQUENESS PROBE: collision proof ok");
  } else {
    console.log("UNIQUENESS PROBE: collision proof unexpected");
  }
  return ok;
}

async function runAgainstDb(): Promise<void> {
  const { listAcceptedFingerprints } = await import("../core/persistence/story-repository.ts");
  const past = await listAcceptedFingerprints();
  let bestVerdict: PreFilterVerdict = "pass";
  const rank: Record<PreFilterVerdict, number> = { pass: 0, escalate: 1, reject: 2 };
  for (const entry of past) {
    const scores = scoreFingerprints(RESKIN_CANDIDATE, {
      protagonistWant: entry.protagonistWant,
      centralObstacle: entry.centralObstacle,
      endingShape: entry.endingShape,
    });
    const verdict = preFilterVerdict(scores);
    if (rank[verdict] > rank[bestVerdict]) {
      bestVerdict = verdict;
    }
  }
  console.log(`UNIQUENESS PROBE: against-db compared=${past.length} bestVerdict=${bestVerdict}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--prove-collision")) {
    const ok = await runProveCollision();
    if (!ok) {
      process.exitCode = 1;
    }
    return;
  }

  const allExpected = runFixturePairs();

  if (args.includes("--against-db")) {
    await runAgainstDb();
  }

  if (allExpected) {
    console.log("UNIQUENESS PROBE: ok");
  } else {
    console.log("UNIQUENESS PROBE: unexpected");
    process.exitCode = 1;
  }
}

main();

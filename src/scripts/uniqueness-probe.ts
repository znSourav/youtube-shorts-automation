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
//
// Run with:
//   node src/scripts/uniqueness-probe.ts
//   node --env-file=.env.local src/scripts/uniqueness-probe.ts --against-db
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

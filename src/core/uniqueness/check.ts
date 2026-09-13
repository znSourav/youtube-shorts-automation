// Orchestrates the structural-uniqueness gate: read past fingerprints,
// run the zero-cost deterministic pre-filter, escalate a borderline case to
// a single targeted LLM comparison (plan 03-02 Task 2), and drive a bounded
// regeneration loop when a candidate collides. Shaped like
// src/core/story/director.ts's runStoryDirector -- checkCeiling/recordSpend
// live inside the escalation hook itself (Task 2), not here, so this module
// stays a pure orchestrator with every collaborator injectable via a
// defaulted `deps` parameter (the same testability convention
// spend-ledger.ts uses for its `path` parameter).
import { CeilingExceededError } from "../../lib/spend-ledger.ts";
import {
  runStoryDirector,
  type StoryDirectorInput,
  type StoryDirectorResult,
} from "../story/director.ts";
import type { StoryDirectorOutput } from "../story/schema.ts";
import { listAcceptedFingerprints, type AcceptedFingerprint } from "../persistence/story-repository.ts";
import { fingerprintFromStoryOutput, type StructuralFingerprint } from "./fingerprint.ts";
import { preFilterVerdict, scoreFingerprints } from "./similarity.ts";

// UNIQUE-02: the regeneration cap must be changeable by setting an
// environment variable, not by editing code. 3 matches the content-safety-
// retry precedent CONTEXT.md's own discretion note points at (Phase 2).
export const DEFAULT_MAX_REGENERATION_ATTEMPTS = 3;

/**
 * Reads MAX_UNIQUENESS_REGENERATION_ATTEMPTS from the environment. Returns
 * the parsed value only when it is a finite integer of at least 1; an
 * absent, zero, negative, or non-numeric value degrades to the safe default
 * rather than to an unbounded or zero-attempt loop.
 */
export function maxRegenerationAttempts(env: Record<string, string | undefined> = process.env): number {
  const raw = env.MAX_UNIQUENESS_REGENERATION_ATTEMPTS;
  if (raw === undefined) {
    return DEFAULT_MAX_REGENERATION_ATTEMPTS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_MAX_REGENERATION_ATTEMPTS;
  }
  return parsed;
}

function toStructuralFingerprint(entry: AcceptedFingerprint): StructuralFingerprint {
  return {
    protagonistWant: entry.protagonistWant,
    centralObstacle: entry.centralObstacle,
    endingShape: entry.endingShape,
  };
}

// Mirrors StoryDirectorSuccess/StoryDirectorFailure's discriminated-union
// shape. A collision carries the colliding past story's id, that past
// story's fingerprint (needed downstream as the regeneration loop's
// avoidPattern), and whether the LLM decided it (false on the deterministic
// path, true once Task 2's tie-breaker confirms one) -- a pass carries
// nothing else.
export type UniquenessVerdict =
  | { collided: true; withStoryId: string; withFingerprint: StructuralFingerprint; viaLlm: boolean }
  | { collided: false };

export interface UniquenessDeps {
  director?: (input: StoryDirectorInput) => Promise<StoryDirectorResult>;
  historyReader?: () => Promise<AcceptedFingerprint[]>;
  // Task 2 owns the real ceiling-gated LLM tie-breaker; this task leaves the
  // hook as a named seam. checkUniqueness's own signature and every caller
  // are unaffected by which implementation eventually fills it.
  escalate?: (candidate: StructuralFingerprint, past: AcceptedFingerprint) => Promise<boolean>;
}

/**
 * Walks the past fingerprints, scoring each against the candidate with
 * scoreFingerprints. A reject verdict on any past story returns a collision
 * immediately with the LLM flag false -- zero comparison calls made. An
 * escalate verdict calls deps.escalate for that specific past story, if one
 * was supplied; if the hook confirms a collision, returns it flagged as
 * LLM-decided. With no escalate hook (this task) or a hook that returns
 * false, an escalate verdict falls through as a pass for that past story
 * and the loop continues to the next one. Only after every past story has
 * been checked does this return an overall pass.
 */
export async function checkUniqueness(
  candidate: StructuralFingerprint,
  past: AcceptedFingerprint[],
  deps: UniquenessDeps = {},
): Promise<UniquenessVerdict> {
  for (const pastEntry of past) {
    const scores = scoreFingerprints(candidate, toStructuralFingerprint(pastEntry));
    const verdict = preFilterVerdict(scores);

    if (verdict === "reject") {
      return {
        collided: true,
        withStoryId: pastEntry.id,
        withFingerprint: toStructuralFingerprint(pastEntry),
        viaLlm: false,
      };
    }

    if (verdict === "escalate" && deps.escalate) {
      const llmConfirmed = await deps.escalate(candidate, pastEntry);
      if (llmConfirmed) {
        return {
          collided: true,
          withStoryId: pastEntry.id,
          withFingerprint: toStructuralFingerprint(pastEntry),
          viaLlm: true,
        };
      }
    }
  }

  return { collided: false };
}

export interface UniqueStoryAccepted {
  ok: true;
  status: "accepted";
  data: StoryDirectorOutput;
  attempt: number;
}

export interface UniqueStoryExhausted {
  ok: true;
  status: "exhausted";
  data: StoryDirectorOutput;
  attempt: number;
}

export interface UniqueStoryFailure {
  ok: false;
  reason: "blocked" | "parse_failed" | "validation_failed";
  detail: string;
  blockReason?: string;
  issues?: string[];
  attempt: number;
}

export type UniqueStoryResult = UniqueStoryAccepted | UniqueStoryExhausted | UniqueStoryFailure;

/**
 * Bounded regeneration loop, shaped like generate-images.ts's sequential
 * loop-with-a-stop-condition (no job queue, single invocation): call the
 * director, fingerprint the candidate, check it against history, accept on
 * a pass, remember and retry (naming the collided pattern as something to
 * avoid) on a collision, up to maxRegenerationAttempts(). D-04: after the
 * final attempt, the LAST candidate is returned flagged as exhausted --
 * never a silent accept, never a silent block, never a forced refusal.
 *
 * Every collaborator defaults to its real implementation so production
 * callers need pass no deps at all, while check.test.ts can inject a fake
 * director/historyReader/escalate with zero network calls and zero ledger
 * writes -- the same defaulted-collaborator convention spend-ledger.ts uses
 * for its `path` parameter.
 */
export async function runUniqueStoryDirector(
  input: StoryDirectorInput,
  deps: UniquenessDeps = {},
): Promise<UniqueStoryResult> {
  const director = deps.director ?? runStoryDirector;
  const historyReader = deps.historyReader ?? listAcceptedFingerprints;
  // Task 2 fills this in as the ceiling-gated LLM tie-breaker's default
  // value -- checkUniqueness's signature and every caller here stay
  // unchanged by that later edit.
  const escalate = deps.escalate;

  const cap = maxRegenerationAttempts();
  let lastCandidate: StoryDirectorOutput | null = null;
  let avoidPattern: StructuralFingerprint | undefined;

  for (let attempt = 1; attempt <= cap; attempt++) {
    let directorResult: StoryDirectorResult;
    try {
      directorResult = await director({ ...input, avoidPattern });
    } catch (err) {
      if (err instanceof CeilingExceededError && lastCandidate) {
        // A previous attempt already produced a candidate -- the wife having
        // a slightly-similar story beats her having nothing. attempt - 1 is
        // the number of attempts that actually completed.
        return { ok: true, status: "exhausted", data: lastCandidate, attempt: attempt - 1 };
      }
      // Either not a budget refusal, or the very first attempt was refused
      // with no candidate yet produced -- rethrow so createStoryAction's
      // existing budget message reaches her unchanged.
      throw err;
    }

    if (!directorResult.ok) {
      if (lastCandidate) {
        return { ok: true, status: "exhausted", data: lastCandidate, attempt: attempt - 1 };
      }
      return {
        ok: false,
        reason: directorResult.reason,
        detail: directorResult.detail,
        blockReason: directorResult.blockReason,
        issues: directorResult.issues,
        attempt,
      };
    }

    lastCandidate = directorResult.data;
    const fingerprint = fingerprintFromStoryOutput(directorResult.data);
    const past = await historyReader();
    const verdict = await checkUniqueness(fingerprint, past, { escalate });

    if (!verdict.collided) {
      return { ok: true, status: "accepted", data: directorResult.data, attempt };
    }

    avoidPattern = verdict.withFingerprint;
  }

  // Cap reached with every attempt colliding -- lastCandidate is always set
  // here because the loop ran at least once (cap >= 1 per
  // maxRegenerationAttempts's own guard).
  return { ok: true, status: "exhausted", data: lastCandidate as StoryDirectorOutput, attempt: cap };
}

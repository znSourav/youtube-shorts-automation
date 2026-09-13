"use server";

import type { StoryDirectorInput } from "../../core/story/director.ts";
import { runUniqueStoryDirector } from "../../core/uniqueness/check.ts";
import { CeilingExceededError } from "../../lib/spend-ledger.ts";
import type { StoryDirectorOutput } from "../../core/story/schema.ts";
import { generateStoryId } from "../../core/story/story-id.ts";
import { saveStoryWithScenes, UniquenessStatus } from "../../core/persistence/story-repository.ts";
import { recordGenerations } from "../../core/persistence/generation-repository.ts";
import { MAX_CHARACTER_DESCRIPTION_LENGTH, MAX_IDEA_LENGTH } from "../../core/story/input-limits.ts";

// D-04's plain-language exhaustion warning. Deliberately: no story title, no
// id, no similarity score, no attempt count, no reason code -- her choice to
// use the story anyway or try a different idea, never a refusal.
const UNIQUENESS_EXHAUSTED_WARNING =
  "This story turned out to be similar to one you've made before. You can use it anyway, or go back and try a different idea.";

// D-03/D-04: the success shape carries exactly the story, its id, and this
// one warning string -- there is no field here capable of holding a
// collided story's id or a rejected candidate's text. Keep it this way: a
// future edit adding a "collision details" field here would leak exactly
// what D-03 requires stay server-side.
export interface CreateStorySuccess {
  ok: true;
  data: StoryDirectorOutput;
  storyId: string;
  uniquenessWarning: string | null;
}

export interface CreateStoryFailure {
  ok: false;
  error: string;
}

export type CreateStoryActionResult = CreateStorySuccess | CreateStoryFailure;

/**
 * Thin Server Action wrapper over runUniqueStoryDirector -- no provider
 * import, no prompt text, and no raw provider error string crosses into the
 * browser. The raw response stays in the server console via logRawResponse
 * (called inside gemini.ts). Every failure mode maps to one plain-language
 * sentence.
 */
export async function createStoryAction(input: StoryDirectorInput): Promise<CreateStoryActionResult> {
  // HTML's `required` attribute on the client only rejects a zero-length
  // value -- a whitespace-only submission passes it and would otherwise
  // reach runStoryDirector's paid, budget-gated call for guaranteed-useless
  // output. This check runs before checkCeiling/generateStory are ever
  // reached (T-02-04's single-dispatch-point guarantee is unaffected).
  if (!input.idea.trim() || !input.characterDescription.trim()) {
    return {
      ok: false,
      error: "Please describe your story idea and the main character before creating a story.",
    };
  }

  // WR-05: re-validated here, not just via the form's `maxLength` -- a
  // client-side cap alone is not a real enforcement boundary. checkCeiling's
  // per-call estimate is a flat amount regardless of prompt size, so an
  // unusually long pasted idea/character description could make a single
  // call's real (per-token) cost exceed what the ceiling gate reserved for
  // it. This runs before checkCeiling/generateStory are ever reached.
  if (input.idea.length > MAX_IDEA_LENGTH || input.characterDescription.length > MAX_CHARACTER_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      error: "Your story idea or character description is too long. Please shorten it and try again.",
    };
  }

  try {
    // The uniqueness gate (plan 03-02) sits inside runUniqueStoryDirector --
    // no path from here reaches saveStoryWithScenes/the review screen around
    // it (UNIQUE-01).
    const result = await runUniqueStoryDirector(input);

    if (!result.ok) {
      if (result.reason === "blocked" && result.blockReason === "MAX_TOKENS") {
        return {
          ok: false,
          error: "The response was cut short before it finished. Please try again with fewer scenes.",
        };
      }
      if (result.reason === "blocked") {
        return {
          ok: false,
          error: "The story could not be generated because the request was blocked by the model. Please try a different idea or wording.",
        };
      }
      if (result.reason === "parse_failed") {
        return {
          ok: false,
          error: "The response did not match the expected story format. Please try again.",
        };
      }
      // Covers "validation_failed" (scene-plan validator, plan 02-02 Task 2)
      // and any other future structured-failure reason.
      return {
        ok: false,
        error: "The generated story did not pass validation. Please try again.",
      };
    }

    // D-04: an exhausted outcome still persists the last candidate (with the
    // exhausted-shown status) and still returns it to her -- never a silent
    // block, never a forced refusal. An accepted outcome persists as
    // accepted with a null warning.
    const uniquenessStatus =
      result.status === "accepted" ? UniquenessStatus.ACCEPTED : UniquenessStatus.REJECTED_EXHAUSTED_SHOWN;
    const uniquenessWarning = result.status === "accepted" ? null : UNIQUENESS_EXHAUSTED_WARNING;

    const storyId = generateStoryId();
    try {
      await saveStoryWithScenes(storyId, result.data, uniquenessStatus, result.attempt);
    } catch (saveErr) {
      console.error("createStoryAction: persistence failure", saveErr);
      return {
        ok: false,
        error: "The story was written but could not be saved. Please try again.",
      };
    }

    // Best-effort durability flush of the story + uniqueness-comparison
    // spend accumulated during runUniqueStoryDirector (IMAGE-03's dual
    // write). Placed AFTER the save so the storyId foreign key resolves.
    // recordGenerations never throws -- a failure here can only cost the
    // durability record, never the already-persisted story (03-RESEARCH.md
    // Architectural Responsibility Map), so it never changes this action's
    // return value.
    await recordGenerations(storyId, result.spend);

    return { ok: true, data: result.data, storyId, uniquenessWarning };
  } catch (err) {
    if (err instanceof CeilingExceededError) {
      return {
        ok: false,
        error: "The monthly generation budget has been reached, so no new story can be created right now.",
      };
    }
    console.error("createStoryAction: unexpected error", err);
    return {
      ok: false,
      error: "A network or server problem prevented the story from being created. Please try again.",
    };
  }
}

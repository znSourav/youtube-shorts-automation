"use server";

import { runStoryDirector, type StoryDirectorInput } from "../../core/story/director.ts";
import { CeilingExceededError } from "../../lib/spend-ledger.ts";
import type { StoryDirectorOutput } from "../../core/story/schema.ts";

export interface CreateStorySuccess {
  ok: true;
  data: StoryDirectorOutput;
}

export interface CreateStoryFailure {
  ok: false;
  error: string;
}

export type CreateStoryActionResult = CreateStorySuccess | CreateStoryFailure;

/**
 * Thin Server Action wrapper over runStoryDirector -- no provider import, no
 * prompt text, and no raw provider error string crosses into the browser.
 * The raw response stays in the server console via logRawResponse (called
 * inside gemini.ts). Every failure mode maps to one plain-language sentence.
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

  try {
    const result = await runStoryDirector(input);

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

    return { ok: true, data: result.data };
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

"use server";

// LIBRARY-01: lists every past story for the "My Stories" screen. Takes no
// parameters at all -- there is nothing client-supplied to validate here,
// which is itself the mitigation (T-04-11): no id, no filter, no ordering
// hint crosses this boundary. The returned rows carry a title, a date, a
// computed status label, and a count -- deliberately no path and no scene
// detail; the detail view is loadStoryAction's job and already exists.
import { listStoriesWithSceneCounts } from "../../core/persistence/story-repository.ts";
import { toLibraryRow, type LibraryStoryRow, type LibraryStatusLabel } from "../../core/persistence/story-view.ts";
import { maxSceneRetryAttempts } from "../../core/retry/caps.ts";

// A type-only re-export is erased at emit -- this is what lets a "use
// client" component (MyStoriesList.tsx) name the row type without importing
// src/core/persistence/ directly and tripping check-boundaries.ts
// invariant 1.
export type { LibraryStoryRow, LibraryStatusLabel };

export interface ListStoriesResult {
  ok: boolean;
  stories: LibraryStoryRow[];
  message: string | null;
}

export async function listStoriesAction(): Promise<ListStoriesResult> {
  let rows;
  try {
    rows = await listStoriesWithSceneCounts();
  } catch (err) {
    console.error("listStoriesAction: failed to read stories", err);
    return { ok: false, stories: [], message: "Your stories could not be loaded right now. Please try again." };
  }

  const maxAttempts = maxSceneRetryAttempts();
  const stories = rows.map((row) => toLibraryRow(row, maxAttempts));

  return { ok: true, stories, message: null };
}

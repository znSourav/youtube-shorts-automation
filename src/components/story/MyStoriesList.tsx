"use client";

import type { LibraryStoryRow } from "@/app/actions/list-stories";

export interface MyStoriesListProps {
  stories: LibraryStoryRow[];
  loading: boolean;
  error: string | null;
  openingStoryId: string | null;
  onOpenStory: (storyId: string) => void;
  onCreateStory: () => void;
}

/**
 * Screen 5 (LIBRARY-01, soft, new) -- every past story, its title, date,
 * computed plain-language status, and scene count, with a way back into any
 * one of them. Imports its row type from src/app/actions/list-stories.ts
 * (a type-only re-export, erased at emit), never from
 * src/core/persistence/ directly -- keeps check-boundaries.ts invariant 1
 * green.
 */
export default function MyStoriesList({
  stories,
  loading,
  error,
  openingStoryId,
  onOpenStory,
  onCreateStory,
}: MyStoriesListProps) {
  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-2xl font-semibold text-black dark:text-zinc-50">My Stories</h2>

      {loading ? (
        <p className="text-zinc-600 dark:text-zinc-400">Loading your stories...</p>
      ) : error ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : stories.length === 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-medium text-black dark:text-zinc-50">No stories yet</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Create your first story to see it appear here.</p>
          <button
            type="button"
            onClick={onCreateStory}
            className="mt-2 self-start rounded-full bg-foreground px-5 py-3 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            Create Your First Story
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {stories.map((story) => {
              // Safe from a hydration mismatch: this list only ever renders
              // after listStoriesAction has resolved in the browser -- the
              // server never renders a date string here.
              const date = new Date(story.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              });
              const sceneCountLabel = story.sceneCount === 1 ? "1 scene" : `${story.sceneCount} scenes`;

              return (
                <button
                  key={story.storyId}
                  type="button"
                  disabled={openingStoryId !== null}
                  onClick={() => onOpenStory(story.storyId)}
                  className="flex flex-col gap-2 rounded border border-zinc-300 p-3 text-left transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  <span className="truncate font-medium text-black dark:text-zinc-50" title={story.title}>
                    {story.title}
                  </span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {date} &middot; {story.status} &middot; {sceneCountLabel}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onCreateStory}
            className="self-start text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
          >
            Create New Story
          </button>
        </>
      )}
    </div>
  );
}

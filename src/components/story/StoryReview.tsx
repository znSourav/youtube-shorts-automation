"use client";

import type { StoryDirectorOutput } from "@/core/story/schema";

export interface StoryReviewProps {
  story: StoryDirectorOutput;
  loading: boolean;
  error: string | null;
  onGenerateImages: () => void;
}

/**
 * Screen 2 (docs/original-brief.md §18, D-01). Renders the story text, both
 * bibles, and each scene's number/purpose/duration -- and nothing else.
 * Deliberately never renders image_prompt, motion_prompt, a model id, or a
 * file path (STORY-03). The only action here is moving forward to scene
 * image generation.
 */
export default function StoryReview({ story, loading, error, onGenerateImages }: StoryReviewProps) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-semibold text-black dark:text-zinc-50">{story.story.title}</h2>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">{story.story.premise}</p>
        <p className="mt-3 whitespace-pre-wrap text-black dark:text-zinc-50">{story.story.story}</p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-zinc-700 dark:text-zinc-300">
          <dt className="font-medium text-black dark:text-zinc-50">Theme</dt>
          <dd>{story.story.theme}</dd>
          <dt className="font-medium text-black dark:text-zinc-50">Emotional arc</dt>
          <dd>{story.story.emotional_arc}</dd>
          <dt className="font-medium text-black dark:text-zinc-50">Ending</dt>
          <dd>{story.story.ending}</dd>
        </dl>
      </div>

      <div>
        <h3 className="text-lg font-medium text-black dark:text-zinc-50">Character Bible</h3>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-zinc-700 dark:text-zinc-300">
          <dt className="font-medium text-black dark:text-zinc-50">Name</dt>
          <dd>{story.character_bible.name}</dd>
          <dt className="font-medium text-black dark:text-zinc-50">Appearance</dt>
          <dd>{story.character_bible.appearance}</dd>
          <dt className="font-medium text-black dark:text-zinc-50">Hair</dt>
          <dd>{story.character_bible.hair}</dd>
          <dt className="font-medium text-black dark:text-zinc-50">Clothing</dt>
          <dd>{story.character_bible.clothing}</dd>
          <dt className="font-medium text-black dark:text-zinc-50">Distinguishing features</dt>
          <dd>{story.character_bible.distinguishing_features}</dd>
        </dl>
      </div>

      <div>
        <h3 className="text-lg font-medium text-black dark:text-zinc-50">Style Bible</h3>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-zinc-700 dark:text-zinc-300">
          <dt className="font-medium text-black dark:text-zinc-50">Medium</dt>
          <dd>{story.style_bible.medium}</dd>
          <dt className="font-medium text-black dark:text-zinc-50">Color palette</dt>
          <dd>{story.style_bible.color_palette}</dd>
          <dt className="font-medium text-black dark:text-zinc-50">Character rendering</dt>
          <dd>{story.style_bible.character_rendering}</dd>
        </dl>
      </div>

      <div>
        <h3 className="text-lg font-medium text-black dark:text-zinc-50">Scenes</h3>
        <ol className="mt-2 flex flex-col gap-2">
          {story.scenes.map((scene) => (
            <li key={scene.scene_number} className="text-zinc-700 dark:text-zinc-300">
              <span className="font-medium text-black dark:text-zinc-50">Scene {scene.scene_number}</span>
              {typeof scene.duration === "number" && (
                <span className="text-zinc-500 dark:text-zinc-500"> ({scene.duration}s)</span>
              )}
              <span> — {scene.story_purpose}</span>
            </li>
          ))}
        </ol>
      </div>

      {error && (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onGenerateImages}
        disabled={loading}
        className="rounded-full bg-foreground px-5 py-3 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {loading ? "Generating scene images..." : "Generate Scene Images"}
      </button>
    </div>
  );
}

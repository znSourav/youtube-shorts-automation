"use client";

import { useState, type FormEvent } from "react";
import { STYLE_PRESETS, MOOD_OPTIONS } from "@/core/story/styles";
import type { StoryDirectorOutput } from "@/core/story/schema";
import { createStoryAction } from "./actions/create-story.ts";

// docs/original-brief.md §9: "Number of scenes" dropdown, 5-7 scenes.
const SCENE_COUNT_OPTIONS = [5, 6, 7] as const;

export default function Home() {
  const [idea, setIdea] = useState("");
  const [characterDescription, setCharacterDescription] = useState("");
  const [stylePresetId, setStylePresetId] = useState(Object.keys(STYLE_PRESETS)[0]);
  const [mood, setMood] = useState<string>(MOOD_OPTIONS[0]);
  const [sceneCount, setSceneCount] = useState<number>(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [story, setStory] = useState<StoryDirectorOutput | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setStory(null);

    const result = await createStoryAction({
      idea,
      characterDescription,
      stylePresetId,
      mood,
      sceneCount,
    });

    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStory(result.data);
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col gap-8 px-6 py-16">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Create New Story</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-black dark:text-zinc-50">Story idea</span>
            <textarea
              className="rounded border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              rows={3}
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-black dark:text-zinc-50">Character description</span>
            <textarea
              className="rounded border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              value={characterDescription}
              onChange={(event) => setCharacterDescription(event.target.value)}
              rows={2}
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-black dark:text-zinc-50">Animation style</span>
            <select
              className="rounded border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              value={stylePresetId}
              onChange={(event) => setStylePresetId(event.target.value)}
            >
              {Object.values(STYLE_PRESETS).map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-black dark:text-zinc-50">Mood</span>
            <select
              className="rounded border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              value={mood}
              onChange={(event) => setMood(event.target.value)}
            >
              {MOOD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-black dark:text-zinc-50">Number of scenes</span>
            <select
              className="rounded border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              value={sceneCount}
              onChange={(event) => setSceneCount(Number(event.target.value))}
            >
              {SCENE_COUNT_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-foreground px-5 py-3 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {loading ? "Creating..." : "CREATE STORY"}
          </button>
        </form>

        {error && (
          <p className="rounded border border-red-300 bg-red-50 p-3 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}

        {story && (
          <section className="flex flex-col gap-6">
            <div>
              <h2 className="text-xl font-semibold text-black dark:text-zinc-50">{story.story.title}</h2>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">{story.story.premise}</p>
              <p className="mt-3 whitespace-pre-wrap text-black dark:text-zinc-50">{story.story.story}</p>
            </div>

            <div>
              <h3 className="text-lg font-medium text-black dark:text-zinc-50">Character Bible</h3>
              <p className="text-zinc-700 dark:text-zinc-300">
                {story.character_bible.name} — {story.character_bible.appearance}
              </p>
            </div>

            <div>
              <h3 className="text-lg font-medium text-black dark:text-zinc-50">Style Bible</h3>
              <p className="text-zinc-700 dark:text-zinc-300">{story.style_bible.medium}</p>
            </div>

            <div>
              <h3 className="text-lg font-medium text-black dark:text-zinc-50">Scenes</h3>
              <ol className="flex flex-col gap-2">
                {story.scenes.map((scene) => (
                  <li key={scene.scene_number} className="text-zinc-700 dark:text-zinc-300">
                    <span className="font-medium text-black dark:text-zinc-50">Scene {scene.scene_number}:</span>{" "}
                    {scene.story_purpose}
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

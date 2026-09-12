"use client";

import { useState, type FormEvent } from "react";
import type { StylePreset } from "@/core/story/styles";

// docs/original-brief.md §9: "Number of scenes" dropdown, 5-7 scenes.
const SCENE_COUNT_OPTIONS = [5, 6, 7] as const;

export interface CreateStoryFormValues {
  idea: string;
  characterDescription: string;
  stylePresetId: string;
  mood: string;
  sceneCount: number;
}

export interface CreateStoryFormProps {
  stylePresets: Record<string, StylePreset>;
  moodOptions: readonly string[];
  loading: boolean;
  error: string | null;
  onSubmit: (values: CreateStoryFormValues) => void;
}

/**
 * Screen 1 (D-01/D-03). Behaviour unchanged from the inline form plan 02-02
 * put in src/app/page.tsx -- this is purely the extraction into its own
 * client component so the page becomes a small state machine over three
 * screens rather than a form with a growing tail.
 */
export default function CreateStoryForm({ stylePresets, moodOptions, loading, error, onSubmit }: CreateStoryFormProps) {
  const [idea, setIdea] = useState("");
  const [characterDescription, setCharacterDescription] = useState("");
  const [stylePresetId, setStylePresetId] = useState(Object.keys(stylePresets)[0]);
  const [mood, setMood] = useState<string>(moodOptions[0]);
  const [sceneCount, setSceneCount] = useState<number>(6);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ idea, characterDescription, stylePresetId, mood, sceneCount });
  }

  return (
    <div className="flex flex-col gap-8">
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
            {Object.values(stylePresets).map((preset) => (
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
            {moodOptions.map((option) => (
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
    </div>
  );
}

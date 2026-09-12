"use client";

import { useState } from "react";
import { STYLE_PRESETS, MOOD_OPTIONS } from "@/core/story/styles";
import type { StoryDirectorOutput } from "@/core/story/schema";
import CreateStoryForm, { type CreateStoryFormValues } from "@/components/story/CreateStoryForm";
import StoryReview from "@/components/story/StoryReview";
import SceneCard, { type SceneCardState } from "@/components/scenes/SceneCard";
import type { SceneVideoState } from "@/components/scenes/SceneVideo";
import { createStoryAction } from "./actions/create-story.ts";
import { generateSceneImagesAction, type SceneImageStatus } from "./actions/generate-images.ts";
import { generateSceneVideoAction, type GenerateSceneVideoResult } from "./actions/generate-video.ts";

type Screen = "create" | "review-story" | "review-images";

// D-03: no /stories/[id] route -- a story id is only ever used server-side
// (as the storage/stories/<id>/ directory name) and in this page's own
// local state, never shown to the wife.
function generateStoryId(): string {
  return `story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("create");

  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [story, setStory] = useState<StoryDirectorOutput | null>(null);
  const [storyId, setStoryId] = useState<string | null>(null);

  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesError, setImagesError] = useState<string | null>(null);
  const [sceneStatuses, setSceneStatuses] = useState<SceneImageStatus[]>([]);

  // VIDEO-01: this phase animates exactly ONE scene (the first scene of the
  // story), not every scene -- generating every scene is VIDEO-02 (Phase 4).
  // A single result slot is enough because only one scene is ever in flight.
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoResult, setVideoResult] = useState<GenerateSceneVideoResult | null>(null);

  async function handleCreateStory(values: CreateStoryFormValues) {
    setCreateLoading(true);
    setCreateError(null);

    const result = await createStoryAction(values);

    setCreateLoading(false);
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    setStory(result.data);
    setStoryId(generateStoryId());
    setSceneStatuses([]);
    setImagesError(null);
    setScreen("review-story");
  }

  async function handleGenerateImages() {
    if (!story || !storyId) return;
    setImagesLoading(true);
    setImagesError(null);

    try {
      const statuses = await generateSceneImagesAction(
        storyId,
        story.scenes,
        story.character_bible,
        story.style_bible,
      );
      setSceneStatuses(statuses);
      setScreen("review-images");
    } catch {
      setImagesError("Something went wrong while generating the scene images. Please try again.");
    } finally {
      setImagesLoading(false);
    }
  }

  async function handleGenerateVideo() {
    if (!story || !storyId) return;
    const targetScene = story.scenes[0];
    const targetStatus = sceneStatuses.find((status) => status.sceneNumber === targetScene.scene_number);
    if (!targetStatus?.imagePath) return;

    setVideoLoading(true);
    setVideoResult(null);

    try {
      const result = await generateSceneVideoAction(storyId, targetScene, targetStatus.imagePath);
      setVideoResult(result);
    } catch {
      setVideoResult({
        ok: false,
        videoPath: null,
        videoDataUrl: null,
        message: "Something went wrong while generating the video. Please try again.",
        durationSeconds: 0,
      });
    } finally {
      setVideoLoading(false);
    }
  }

  const allImagesReady =
    story !== null &&
    sceneStatuses.length === story.scenes.length &&
    sceneStatuses.every((status) => status.ok && Boolean(status.imagePath));
  const readyCount = sceneStatuses.filter((status) => status.ok && Boolean(status.imagePath)).length;
  const videoSceneNumber = story?.scenes[0]?.scene_number ?? null;

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col gap-8 px-6 py-16">
        {screen === "create" && (
          <CreateStoryForm
            stylePresets={STYLE_PRESETS}
            moodOptions={MOOD_OPTIONS}
            loading={createLoading}
            error={createError}
            onSubmit={handleCreateStory}
          />
        )}

        {screen === "review-story" && story && (
          <StoryReview
            story={story}
            loading={imagesLoading}
            error={imagesError}
            onGenerateImages={handleGenerateImages}
          />
        )}

        {screen === "review-images" && story && (
          <div className="flex flex-col gap-6">
            <h2 className="text-2xl font-semibold text-black dark:text-zinc-50">{story.story.title}</h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {story.scenes.map((scene) => {
                const status = sceneStatuses.find((s) => s.sceneNumber === scene.scene_number);
                const state: SceneCardState = !status ? "waiting" : status.ok && status.imagePath ? "ready" : "failed";

                const isVideoTarget = scene.scene_number === videoSceneNumber;
                let videoState: SceneVideoState = "waiting";
                if (isVideoTarget) {
                  if (videoLoading) videoState = "generating";
                  else if (videoResult?.ok) videoState = "ready";
                  else if (videoResult && !videoResult.ok) videoState = "failed";
                }

                return (
                  <SceneCard
                    key={scene.scene_number}
                    sceneNumber={scene.scene_number}
                    storyPurpose={scene.story_purpose}
                    state={state}
                    imageSrc={status?.imageDataUrl ?? null}
                    message={status?.message ?? null}
                    videoState={videoState}
                    videoSrc={isVideoTarget ? videoResult?.videoDataUrl ?? null : null}
                    videoMessage={isVideoTarget ? videoResult?.message ?? null : null}
                    onRetryVideo={isVideoTarget ? handleGenerateVideo : undefined}
                    videoDisabled={videoLoading}
                    videoWaitingHint={
                      isVideoTarget
                        ? "This is the scene the Generate Video button below will animate."
                        : undefined
                    }
                  />
                );
              })}
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={!allImagesReady || videoLoading}
                onClick={handleGenerateVideo}
                className="rounded-full bg-foreground px-5 py-3 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
              >
                {videoLoading
                  ? "Generating video..."
                  : `Generate Video for Scene ${videoSceneNumber ?? 1} (one scene only, for now)`}
              </button>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {allImagesReady
                  ? "This version animates one scene at a time so you can confirm the result before generating a full episode. Generating every scene is coming in a future update."
                  : `Generate Video will unlock once every scene image is ready (${readyCount} of ${story.scenes.length} ready now).`}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

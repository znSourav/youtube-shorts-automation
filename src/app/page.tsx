"use client";

import { useEffect, useState } from "react";
import { STYLE_PRESETS, MOOD_OPTIONS } from "@/core/story/styles";
import type { StoryDirectorOutput } from "@/core/story/schema";
import CreateStoryForm, { type CreateStoryFormValues } from "@/components/story/CreateStoryForm";
import StoryReview from "@/components/story/StoryReview";
import SceneCard, { type SceneCardState } from "@/components/scenes/SceneCard";
import type { SceneVideoState } from "@/components/scenes/SceneVideo";
import { createStoryAction } from "./actions/create-story.ts";
import { generateSceneImagesAction, type SceneImageStatus } from "./actions/generate-images.ts";
import { generateSceneVideoAction, type GenerateSceneVideoResult } from "./actions/generate-video.ts";
import { loadStoryAction } from "./actions/load-story.ts";

type Screen = "create" | "review-story" | "review-images";

// D-03: no /stories/[id] route -- a story id is only ever used server-side
// (as the storage/stories/<id>/ directory name and the database's Story.id
// primary key) and in this page's own local state, never shown to the
// wife. The id itself is generated server-side (Phase 3) and returned from
// createStoryAction -- the browser no longer invents one.

// VIDEO-03 (soft, browser-resume half): the ONLY client-side pointer back to
// a story -- a bare id, never a path, never story content. Cleared at the
// start of every new creation attempt so a stale id can never outlive its
// story (a failed creation, or a fresh one, must not resurrect a PREVIOUS
// story's restore on the next mount).
const LAST_STORY_ID_KEY = "yt-shorts-studio:last-story-id";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("create");

  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [story, setStory] = useState<StoryDirectorOutput | null>(null);
  const [storyId, setStoryId] = useState<string | null>(null);
  // D-04 (plan 03-02): the plain-language exhaustion warning, or null on a
  // clean accept. Cleared on every new story creation so a stale warning
  // from a previous story can never survive onto a fresh one.
  const [uniquenessWarning, setUniquenessWarning] = useState<string | null>(null);

  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesError, setImagesError] = useState<string | null>(null);
  const [sceneStatuses, setSceneStatuses] = useState<SceneImageStatus[]>([]);

  // VIDEO-01: this phase animates exactly ONE scene (the first scene of the
  // story), not every scene -- generating every scene is VIDEO-02 (Phase 4).
  // A single result slot is enough because only one scene is ever in flight.
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoResult, setVideoResult] = useState<GenerateSceneVideoResult | null>(null);

  // VIDEO-03 (soft): true only while the mount-time restore attempt is in
  // flight. The create screen renders nothing while this is true, so a
  // returning wife never sees a flash of the create form before her last
  // story reappears.
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    const storedId = window.localStorage.getItem(LAST_STORY_ID_KEY);
    if (!storedId) {
      setRestoring(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const result = await loadStoryAction(storedId);
      if (cancelled) return;

      if (!result.ok) {
        // A stale id pointing at a deleted/renamed story -- fall back
        // silently to the ordinary create screen, never an error.
        window.localStorage.removeItem(LAST_STORY_ID_KEY);
        setRestoring(false);
        return;
      }

      setStory(result.data);
      setStoryId(result.storyId);
      setUniquenessWarning(null);
      setSceneStatuses(
        result.scenes.map((scene) => ({
          sceneNumber: scene.sceneNumber,
          // Deliberately null -- loadStoryAction never returns a filesystem
          // path (T-03-15). A scene restored this way can be viewed but its
          // video cannot be regenerated until a fresh full generation runs.
          imagePath: null,
          imageDataUrl: scene.imageDataUrl,
          ok: scene.imageStatus === "READY",
          message: scene.imageStatus === "READY" ? "Image generated." : "This scene's image isn't available.",
        })),
      );
      const restoredVideoScene = result.scenes.find((scene) => scene.videoStatus !== "WAITING");
      if (restoredVideoScene) {
        setVideoResult({
          ok: restoredVideoScene.videoStatus === "READY",
          videoPath: null,
          videoDataUrl: restoredVideoScene.videoDataUrl,
          message:
            restoredVideoScene.videoStatus === "READY" ? "Video generated." : "This scene's video isn't available.",
          durationSeconds: 0,
        });
      }
      setScreen("review-images");
      setRestoring(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateStory(values: CreateStoryFormValues) {
    setCreateLoading(true);
    setCreateError(null);
    setUniquenessWarning(null);
    // A fresh creation attempt starts with no stale pointer -- if this
    // attempt fails, a restore on the next mount must not resurrect a
    // PREVIOUS story's id.
    window.localStorage.removeItem(LAST_STORY_ID_KEY);

    const result = await createStoryAction(values);

    setCreateLoading(false);
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    setStory(result.data);
    setStoryId(result.storyId);
    setUniquenessWarning(result.uniquenessWarning);
    setSceneStatuses([]);
    setImagesError(null);
    setScreen("review-story");
    window.localStorage.setItem(LAST_STORY_ID_KEY, result.storyId);
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

  // Checked against imageDataUrl (what actually renders) rather than
  // imagePath (internal bookkeeping only -- generate-images.ts's own
  // convention) so a restored story's readiness reads correctly: restored
  // scenes carry a dataUrl but deliberately no path (T-03-15).
  const allImagesReady =
    story !== null &&
    sceneStatuses.length === story.scenes.length &&
    sceneStatuses.every((status) => status.ok && Boolean(status.imageDataUrl));
  const readyCount = sceneStatuses.filter((status) => status.ok && Boolean(status.imageDataUrl)).length;
  const videoSceneNumber = story?.scenes[0]?.scene_number ?? null;
  const videoTargetStatus = sceneStatuses.find((status) => status.sceneNumber === videoSceneNumber);
  // A restored scene's imagePath is deliberately null (T-03-15) -- video
  // generation for it can only run again once a fresh, live generation in
  // this session produces a real path. allImagesReady alone would otherwise
  // enable a button that silently does nothing after a restore.
  const canGenerateVideo = allImagesReady && Boolean(videoTargetStatus?.imagePath);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col gap-8 px-6 py-16">
        {!restoring && screen === "create" && (
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
            warning={uniquenessWarning}
          />
        )}

        {screen === "review-images" && story && (
          <div className="flex flex-col gap-6">
            <h2 className="text-2xl font-semibold text-black dark:text-zinc-50">{story.story.title}</h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {story.scenes.map((scene) => {
                const status = sceneStatuses.find((s) => s.sceneNumber === scene.scene_number);
                const state: SceneCardState =
                  !status ? "waiting" : status.ok && status.imageDataUrl ? "ready" : "failed";

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
                    onRetryVideo={isVideoTarget && Boolean(status?.imagePath) ? handleGenerateVideo : undefined}
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
                disabled={!canGenerateVideo || videoLoading}
                onClick={handleGenerateVideo}
                className="rounded-full bg-foreground px-5 py-3 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
              >
                {videoLoading
                  ? "Generating video..."
                  : `Generate Video for Scene ${videoSceneNumber ?? 1} (one scene only, for now)`}
              </button>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {allImagesReady && !canGenerateVideo
                  ? "This story was restored from an earlier session, so video generation for it isn't available here -- start a new story to try video generation again."
                  : allImagesReady
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

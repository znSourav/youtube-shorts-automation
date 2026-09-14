"use client";

import { useEffect, useState } from "react";
import { STYLE_PRESETS, MOOD_OPTIONS } from "@/core/story/styles";
import type { StoryDirectorOutput } from "@/core/story/schema";
import CreateStoryForm, { type CreateStoryFormValues } from "@/components/story/CreateStoryForm";
import StoryReview from "@/components/story/StoryReview";
import SceneCard, { type SceneCardState } from "@/components/scenes/SceneCard";
import { createStoryAction } from "./actions/create-story.ts";
import { generateSceneImagesAction, type SceneImageStatus } from "./actions/generate-images.ts";
import { approveStoryImagesAction } from "./actions/approve-images.ts";
import { regenerateSceneImageAction } from "./actions/regenerate-scene-image.ts";
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

  // D-01/D-02: one deliberate approval action covers the whole story's set
  // of scene images -- never an automatic unlock the moment every scene has
  // an image. `approved` mirrors Story.imagesApprovedAt !== null.
  const [approved, setApproved] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // IMAGE-02/D-03: which scene (if any) is currently regenerating -- only
  // one at a time, guarded in the handler below. `imageCapMessages` holds
  // the calm amber exhausted-cap note per scene number, once reached.
  // `postApprovalNotice` is the one-time heads-up shown when a regeneration
  // happens after the story was already approved (D-02).
  const [regeneratingScene, setRegeneratingScene] = useState<number | null>(null);
  const [imageCapMessages, setImageCapMessages] = useState<Record<number, string>>({});
  const [postApprovalNotice, setPostApprovalNotice] = useState<string | null>(null);

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
      // A returning wife who already approved this story's images must not
      // be asked to approve it again -- re-derived from the persisted flag,
      // never assumed false.
      setApproved(result.imagesApproved);
      setApproveError(null);
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
    // A fresh story never inherits a previous story's approval state.
    setApproved(false);
    setApproveError(null);
    setApproveLoading(false);
    setRegeneratingScene(null);
    setImageCapMessages({});
    setPostApprovalNotice(null);
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

  async function handleApproveImages() {
    if (!storyId) return;
    setApproveLoading(true);
    setApproveError(null);

    try {
      const result = await approveStoryImagesAction(storyId);
      if (result.ok) {
        setApproved(true);
      } else {
        setApproveError(result.message);
      }
    } catch {
      setApproveError("Something went wrong while approving these images. Please try again.");
    } finally {
      setApproveLoading(false);
    }
  }

  async function handleRegenerateImage(sceneNumber: number) {
    if (!storyId || regeneratingScene !== null) return;
    setRegeneratingScene(sceneNumber);

    try {
      const result = await regenerateSceneImageAction(storyId, sceneNumber);

      if (result.capMessage) {
        setImageCapMessages((prev) => ({ ...prev, [sceneNumber]: result.capMessage as string }));
      }

      if (result.ok) {
        // Replace only the matching scene's entry -- every other element
        // stays referentially and structurally untouched.
        setSceneStatuses((prev) =>
          prev.map((status) =>
            status.sceneNumber === sceneNumber
              ? {
                  sceneNumber,
                  imagePath: null,
                  imageDataUrl: result.imageDataUrl,
                  ok: true,
                  message: result.message,
                }
              : status,
          ),
        );
      }

      if (result.approvalNotice) {
        setPostApprovalNotice(result.approvalNotice);
      }
    } finally {
      setRegeneratingScene(null);
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

            {postApprovalNotice && (
              <p className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {postApprovalNotice}
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {story.scenes.map((scene) => {
                const status = sceneStatuses.find((s) => s.sceneNumber === scene.scene_number);
                const state: SceneCardState =
                  !status ? "waiting" : status.ok && status.imageDataUrl ? "ready" : "failed";

                return (
                  <SceneCard
                    key={scene.scene_number}
                    sceneNumber={scene.scene_number}
                    storyPurpose={scene.story_purpose}
                    state={state}
                    imageSrc={status?.imageDataUrl ?? null}
                    message={status?.message ?? null}
                    onRegenerateImage={() => handleRegenerateImage(scene.scene_number)}
                    regenerateDisabled={regeneratingScene !== null}
                    regenerateLabel={regeneratingScene === scene.scene_number ? "Regenerating..." : undefined}
                    imageCapMessage={imageCapMessages[scene.scene_number] ?? null}
                  />
                );
              })}
            </div>

            <div className="flex flex-col gap-2">
              {approveError && (
                <p className="rounded border border-red-300 bg-red-50 p-3 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                  {approveError}
                </p>
              )}

              {!approved ? (
                <>
                  <button
                    type="button"
                    disabled={!allImagesReady || approveLoading}
                    onClick={handleApproveImages}
                    className="rounded-full bg-foreground px-5 py-3 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
                  >
                    {approveLoading ? "Approving..." : "Approve These Images"}
                  </button>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {allImagesReady
                      ? "Look through every scene above. When you're happy with them, approve the whole set."
                      : `Approving will unlock once every scene image is ready (${readyCount} of ${story.scenes.length} ready now).`}
                  </p>
                </>
              ) : (
                <p className="text-sm text-black dark:text-zinc-50">
                  Images approved. You can now generate videos for every scene.
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

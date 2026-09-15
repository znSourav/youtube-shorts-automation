"use client";

import { useEffect, useRef, useState } from "react";
import { STYLE_PRESETS, MOOD_OPTIONS } from "@/core/story/styles";
import type { StoryDirectorOutput } from "@/core/story/schema";
import CreateStoryForm, { type CreateStoryFormValues } from "@/components/story/CreateStoryForm";
import StoryReview from "@/components/story/StoryReview";
import SceneCard, { type SceneCardState } from "@/components/scenes/SceneCard";
import type { SceneVideoState } from "@/components/scenes/SceneVideo";
import VideoStatusScreen, {
  POLL_INTERVAL_MS,
  STUCK_AFTER_MS,
  type VideoStatusSceneRow,
} from "@/components/story/VideoStatusScreen";
import { createStoryAction } from "./actions/create-story.ts";
import { generateSceneImagesAction, type SceneImageStatus } from "./actions/generate-images.ts";
import { approveStoryImagesAction } from "./actions/approve-images.ts";
import { regenerateSceneImageAction } from "./actions/regenerate-scene-image.ts";
import { loadStoryAction } from "./actions/load-story.ts";
import { generateAllVideosAction } from "./actions/generate-all-videos.ts";
import { getStoryStatusAction } from "./actions/get-story-status.ts";
import { retrySceneVideoAction } from "./actions/retry-scene-video.ts";

type Screen = "create" | "review-story" | "review-images" | "video-status";

// D-04/D-05: per-scene video status the browser holds while on Screen 4,
// keyed by scene number. Populated entirely from getStoryStatusAction's
// polled reads (plus one loadStoryAction call per newly-ready scene to fetch
// its playable data: URL) -- never from any client-supplied filesystem path.
interface VideoSceneEntry {
  videoState: SceneVideoState;
  videoSrc: string | null;
  videoMessage: string | null;
  stuck?: boolean;
}

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

  // D-04/D-05: Screen 4's batch dispatch + per-scene polled status.
  const [videoScenes, setVideoScenes] = useState<Record<number, VideoSceneEntry>>({});
  const [batchDispatched, setBatchDispatched] = useState(false);
  const [batchStarting, setBatchStarting] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  // Read inside the polling effect's async callback, which is only
  // recreated when `screen`/`storyId` change -- without a ref it would
  // otherwise close over a stale `videoScenes` snapshot from effect setup.
  const videoScenesRef = useRef<Record<number, VideoSceneEntry>>({});
  useEffect(() => {
    videoScenesRef.current = videoScenes;
  }, [videoScenes]);

  // VIDEO-04: which scene (if any) is currently being retried -- only one at
  // a time, guarded in the handler below, matching handleRegenerateImage's
  // convention. `generatingStartedAtRef` records the timestamp each scene
  // first entered "generating" (04-RESEARCH.md Pitfall 2's stuck detector),
  // keyed by scene number, cleared whenever a scene leaves "generating".
  const [retryingScene, setRetryingScene] = useState<number | null>(null);
  const generatingStartedAtRef = useRef<Record<number, number>>({});

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

      if (result.imagesApproved) {
        // D-05: a returning wife whose story is already approved must be
        // able to reach Screen 4 again with the same per-scene states, not
        // just land back on Screen 3 one click away from it. loadStoryAction
        // already carries each scene's own videoStatus/videoDataUrl, so this
        // seeds videoScenes directly -- no flash of "waiting" before the
        // polling effect's own immediate poll() call corrects it further
        // (e.g. to "capped", which needs getStoryStatusAction's videoAttempts
        // that loadStoryAction deliberately does not carry).
        //
        // `batchDispatched` is deliberately left false here rather than
        // inferred from whether any scene is already past "waiting": D-04's
        // batch dispatch is idempotent (it skips already-READY/at-cap
        // scenes), so re-showing "Generate All Videos" is always safe --
        // and it is the ONLY way to nudge forward a scene left at WAITING by
        // an after() callback an earlier session's dev-server restart
        // dropped mid-batch (04-RESEARCH.md Pitfall 2). Inferring
        // `batchDispatched: true` from partial progress would hide that
        // button and strand such a scene with no way forward, since
        // VideoStatusScreen has no per-scene "start" action -- only retry.
        const initialVideoScenes: Record<number, VideoSceneEntry> = {};
        for (const scene of result.scenes) {
          const videoState: SceneVideoState =
            scene.videoStatus === "READY"
              ? "ready"
              : scene.videoStatus === "FAILED"
                ? "failed"
                : scene.videoStatus === "GENERATING"
                  ? "generating"
                  : "waiting";
          initialVideoScenes[scene.sceneNumber] = {
            videoState,
            videoSrc: videoState === "ready" ? scene.videoDataUrl : null,
            videoMessage: videoState === "failed" ? "This scene's video could not be created." : null,
          };
        }
        setVideoScenes(initialVideoScenes);
        setBatchDispatched(false);
        setBatchStarting(false);
        setBatchError(null);
        setScreen("video-status");
      } else {
        setScreen("review-images");
      }

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
    setVideoScenes({});
    setBatchDispatched(false);
    setBatchStarting(false);
    setBatchError(null);
    setRetryingScene(null);
    generatingStartedAtRef.current = {};
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

  async function handleGenerateAllVideos() {
    if (!storyId) return;
    setBatchStarting(true);
    setBatchError(null);

    try {
      const result = await generateAllVideosAction(storyId);
      if (result.ok) {
        setBatchDispatched(true);
      } else {
        setBatchError(result.message);
      }
    } catch {
      setBatchError("Something went wrong while starting video generation. Please try again.");
    } finally {
      setBatchStarting(false);
    }
  }

  // VIDEO-04: retries exactly one scene through retrySceneVideoAction --
  // the same gated dispatch the batch uses -- without touching any other
  // scene. `retryingScene` guards against two retries in flight at once.
  // The optimistic "generating" write here is superseded by the next poll
  // tick, which reads the real DB-backed status.
  async function handleRetryScene(sceneNumber: number) {
    if (!storyId || retryingScene !== null) return;
    setRetryingScene(sceneNumber);
    generatingStartedAtRef.current[sceneNumber] = Date.now();
    setVideoScenes((prev) => ({
      ...prev,
      [sceneNumber]: { videoState: "generating", videoSrc: null, videoMessage: null },
    }));

    try {
      await retrySceneVideoAction(storyId, sceneNumber);
    } finally {
      setRetryingScene(null);
    }
  }

  // D-05: polls getStoryStatusAction while Screen 4 is showing, mapping each
  // scene's DB-backed videoStatus onto its own row -- the database, not any
  // in-memory job registry, is the single source of truth this reads.
  useEffect(() => {
    if (screen !== "video-status" || !storyId) return;

    let cancelled = false;

    async function poll() {
      const currentStoryId = storyId as string;
      const status = await getStoryStatusAction(currentStoryId);
      if (cancelled || !status.ok) return;

      const needsMedia = status.scenes.some((row) => {
        if (row.videoStatus !== "READY") return false;
        const existing = videoScenesRef.current[row.sceneNumber];
        return !existing || !existing.videoSrc;
      });

      let mediaByScene: Record<number, string | null> = {};
      if (needsMedia) {
        const loaded = await loadStoryAction(currentStoryId);
        if (!cancelled && loaded.ok) {
          mediaByScene = Object.fromEntries(
            loaded.scenes.map((scene) => [scene.sceneNumber, scene.videoDataUrl]),
          );
        }
      }

      if (cancelled) return;

      setVideoScenes((prev) => {
        const next: Record<number, VideoSceneEntry> = { ...prev };
        for (const row of status.scenes) {
          let videoState: SceneVideoState =
            row.videoStatus === "READY"
              ? "ready"
              : row.videoStatus === "FAILED"
                ? "failed"
                : row.videoStatus === "GENERATING"
                  ? "generating"
                  : "waiting";

          // 04-RESEARCH.md Pitfall 2: a scene first observed "generating" is
          // timestamped; a scene no longer "generating" has its timestamp
          // cleared, so a fresh retry never inherits a stale stuck clock.
          let stuck = false;
          if (videoState === "generating") {
            const startedAt = generatingStartedAtRef.current[row.sceneNumber] ?? Date.now();
            generatingStartedAtRef.current[row.sceneNumber] = startedAt;
            stuck = Date.now() - startedAt > STUCK_AFTER_MS;
          } else {
            delete generatingStartedAtRef.current[row.sceneNumber];
          }

          let videoMessage: string | null =
            videoState === "failed" ? "This scene's video could not be created." : null;

          // D-03: the cap is checked LAST so it takes priority over "failed"
          // -- an exhausted scene shows the calm amber explanation, never
          // the red failure message, even though its underlying videoStatus
          // is also FAILED.
          if (row.capReached && videoState !== "ready") {
            videoState = "capped";
            videoMessage =
              `This scene's video has reached its limit of ${status.maxAttempts} attempts. The other scenes ` +
              "aren't affected — you can continue with what's ready, or start a new story to try again.";
          }

          const existingSrc = prev[row.sceneNumber]?.videoSrc ?? null;
          const videoSrc = videoState === "ready" ? (existingSrc ?? mediaByScene[row.sceneNumber] ?? null) : null;
          next[row.sceneNumber] = { videoState, videoSrc, videoMessage, stuck };
        }
        return next;
      });

      const allTerminal =
        status.scenes.length > 0 &&
        status.scenes.every((row) => row.videoStatus === "READY" || row.videoStatus === "FAILED");
      if (allTerminal) {
        clearInterval(intervalId);
      }
    }

    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    poll();

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [screen, storyId]);

  // Checked against imageDataUrl (what actually renders) rather than
  // imagePath (internal bookkeeping only -- generate-images.ts's own
  // convention) so a restored story's readiness reads correctly: restored
  // scenes carry a dataUrl but deliberately no path (T-03-15).
  const allImagesReady =
    story !== null &&
    sceneStatuses.length === story.scenes.length &&
    sceneStatuses.every((status) => status.ok && Boolean(status.imageDataUrl));
  const readyCount = sceneStatuses.filter((status) => status.ok && Boolean(status.imageDataUrl)).length;

  const videoStatusScenes: VideoStatusSceneRow[] = story
    ? story.scenes.map((scene) => {
        const entry = videoScenes[scene.scene_number];
        return {
          sceneNumber: scene.scene_number,
          storyPurpose: scene.story_purpose,
          videoState: entry?.videoState ?? "waiting",
          videoSrc: entry?.videoSrc ?? null,
          videoMessage: entry?.videoMessage ?? null,
          stuck: entry?.stuck ?? false,
        };
      })
    : [];
  const allVideosReady =
    story !== null &&
    story.scenes.length > 0 &&
    story.scenes.every((scene) => videoScenes[scene.scene_number]?.videoState === "ready");

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
                <>
                  <p className="text-sm text-black dark:text-zinc-50">
                    Images approved. You can now generate videos for every scene.
                  </p>
                  <button
                    type="button"
                    onClick={() => setScreen("video-status")}
                    className="rounded-full bg-foreground px-5 py-3 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
                  >
                    Continue to Video Generation
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {screen === "video-status" && story && (
          <VideoStatusScreen
            storyTitle={story.story.title}
            scenes={videoStatusScenes}
            dispatched={batchDispatched}
            starting={batchStarting}
            error={batchError}
            allReady={allVideosReady}
            onGenerateAll={handleGenerateAllVideos}
            onRetryScene={handleRetryScene}
          />
        )}
      </main>
    </div>
  );
}

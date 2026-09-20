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
  type VideoStatusSceneRow,
} from "@/components/story/VideoStatusScreen";
import { createStoryAction } from "./actions/create-story.ts";
import { generateSceneImagesAction, type SceneImageStatus } from "./actions/generate-images.ts";
import { approveStoryImagesAction } from "./actions/approve-images.ts";
import { regenerateSceneImageAction } from "./actions/regenerate-scene-image.ts";
import { loadStoryAction, type LoadStorySuccess } from "./actions/load-story.ts";
import { generateAllVideosAction } from "./actions/generate-all-videos.ts";
import { getStoryStatusAction } from "./actions/get-story-status.ts";
import { retrySceneVideoAction } from "./actions/retry-scene-video.ts";
import { openStoryFolderAction, finalizeEpisodeAction } from "./actions/open-story-folder.ts";
import { listStoriesAction, type LibraryStoryRow } from "./actions/list-stories.ts";
import MyStoriesList from "@/components/story/MyStoriesList";
import { getBudgetStatusAction } from "./actions/get-budget-status.ts";
import BudgetIndicator from "@/components/story/BudgetIndicator";

type Screen = "create" | "review-story" | "review-images" | "video-status" | "library";

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

// D-03: the shape getBudgetStatusAction resolves to, derived rather than
// imported from src/core/budget/status.ts directly -- a "use client" file
// may never import the real budget module (check-boundaries.ts invariant 1,
// T-05-02), only a Server Action.
type BudgetStatus = Awaited<ReturnType<typeof getBudgetStatusAction>>;

// The zeroed, ok-false shape BudgetIndicator renders as "nothing" (T-05-19)
// until the mount-time fetch below resolves for the first time.
//
// Hand-maintained copy of src/core/budget/status.ts's emptyBudgetStatus() --
// this file can never import that module (invariant 1/7), so if that
// function's shape changes, especially the breakdown array's order/content,
// update this copy too (WR-05, 05-REVIEW.md).
const EMPTY_BUDGET_STATUS: BudgetStatus = {
  ok: false,
  monthKey: "",
  cumulativeAllocatedUsd: 0,
  cumulativeSpentUsd: 0,
  remainingUsd: 0,
  monthlyAllocationUsd: 0,
  monthToDateSpentUsd: 0,
  breakdown: [
    { type: "VIDEO", spentUsd: 0 },
    { type: "IMAGE", spentUsd: 0 },
    { type: "LLM", spentUsd: 0 },
  ],
};

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
  // convention. The stuck-generation signal itself (04-RESEARCH.md Pitfall
  // 2's stuck detector) is now computed server-side, from a persisted
  // timestamp (Phase 6, 06-05) -- see getStoryStatusAction's `stuck` field,
  // consumed directly below rather than derived from any client clock.
  const [retryingScene, setRetryingScene] = useState<number | null>(null);

  // OUTPUT-01 (plan 04-04): "Open Output Folder" control state.
  const [openingFolder, setOpeningFolder] = useState(false);
  const [outputMessage, setOutputMessage] = useState<string | null>(null);
  // The id of the story whose episode has already been auto-finalized this
  // session -- guards against calling finalizeEpisodeAction more than once
  // for the same completed story as the poll effect keeps firing.
  const [finalizedStoryId, setFinalizedStoryId] = useState<string | null>(null);
  // OUTPUT-01: mirrors videoScenesRef's staleness fix -- read inside the
  // polling effect's async callback, which only closes over a fresh
  // `finalizedStoryId` when the effect itself re-runs (screen/storyId
  // change), not on every setFinalizedStoryId call.
  const finalizedStoryIdRef = useRef<string | null>(null);
  useEffect(() => {
    finalizedStoryIdRef.current = finalizedStoryId;
  }, [finalizedStoryId]);

  // LIBRARY-01 (soft, plan 04-04): "My Stories" list state.
  const [libraryStories, setLibraryStories] = useState<LibraryStoryRow[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [openingStoryId, setOpeningStoryId] = useState<string | null>(null);

  // VIDEO-03 (soft): true only while the mount-time restore attempt is in
  // flight. The create screen renders nothing while this is true, so a
  // returning wife never sees a flash of the create form before her last
  // story reappears.
  const [restoring, setRestoring] = useState(true);

  // D-03: the always-visible spend indicator's current figures. Fetched
  // once on mount below, then refreshed (via refreshBudgetStatus) after
  // every handler that can have spent money resolves, and on every
  // video-status poll tick. Best-effort throughout -- a failed fetch leaves
  // whatever figures are already here rather than surfacing an error or
  // blocking a generation (T-05-19).
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus>(EMPTY_BUDGET_STATUS);

  // The one restore mapping shared by the mount-time restore effect and the
  // Library's "open this story" path (handleOpenLibraryStory below) -- so
  // the two restores cannot drift apart from each other over time.
  function applyLoadedStory(result: LoadStorySuccess) {
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
      // batch dispatch is idempotent (it skips already-READY/at-cap/
      // already-GENERATING scenes -- CR-01, so a scene mid-flight when the
      // story was reopened is never re-dispatched by a re-run batch), so
      // re-showing "Generate All Videos" is always safe even mid-batch --
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
  }

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

      applyLoadedStory(result);
      setRestoring(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // D-03: fetches the spend indicator's figures once on mount, independent
  // of the story-restore effect above -- the indicator must be visible on
  // the create screen even when there is no story to restore at all.
  useEffect(() => {
    let cancelled = false;
    getBudgetStatusAction()
      .then((result) => {
        if (!cancelled) setBudgetStatus(result);
      })
      .catch(() => {
        // best-effort -- the indicator simply stays at whatever it already
        // showed (here, the initial empty/hidden shape).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // D-03: re-fetches the spend indicator after any handler that can have
  // spent money resolves. Never throws -- getBudgetStatusAction() itself
  // already has its own try/catch, but the call across the Server Action
  // boundary can still reject, so this stays defensive. Callers fire this
  // without awaiting it (`void refreshBudgetStatus()`), so a slow or failed
  // refresh can never delay or block the handler it follows.
  async function refreshBudgetStatus() {
    try {
      setBudgetStatus(await getBudgetStatusAction());
    } catch {
      // best-effort -- keep whatever figures are already on screen.
    }
  }

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
    // Every story-creation attempt dispatches at least one paid LLM call --
    // even a refusal or a blocked/exhausted attempt can have spent money --
    // so this refreshes regardless of result.ok.
    void refreshBudgetStatus();
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
    setOpeningFolder(false);
    setOutputMessage(null);
    setFinalizedStoryId(null);
    setLibraryError(null);
    setOpeningStoryId(null);
    setScreen("review-story");
    window.localStorage.setItem(LAST_STORY_ID_KEY, result.storyId);
  }

  // LIBRARY-01: clears the current story and returns to the create screen,
  // without submitting anything -- the "Create New Story" control on both
  // the Library screen and the create screen's own nav link route here.
  function handleReturnToCreate() {
    window.localStorage.removeItem(LAST_STORY_ID_KEY);
    setStory(null);
    setStoryId(null);
    setUniquenessWarning(null);
    setSceneStatuses([]);
    setImagesError(null);
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
    setOpeningFolder(false);
    setOutputMessage(null);
    setFinalizedStoryId(null);
    setLibraryError(null);
    setOpeningStoryId(null);
    setScreen("create");
  }

  // LIBRARY-01: opens the Library, replacing (never appending to)
  // libraryStories on every call -- the second half of the no-duplicates
  // clause (the first half is listStoriesWithSceneCounts' own query shape).
  async function handleOpenLibrary() {
    setScreen("library");
    setLibraryError(null);
    setLibraryLoading(true);

    try {
      const result = await listStoriesAction();
      setLibraryStories(result.stories);
      if (!result.ok) {
        setLibraryError(result.message);
      }
    } finally {
      setLibraryLoading(false);
    }
  }

  // LIBRARY-01: opens a Library row through the same restore mapping the
  // mount effect uses (applyLoadedStory), so a story opened from the
  // Library and a story restored on page load land in exactly the same
  // place with exactly the same state.
  async function handleOpenLibraryStory(storyId: string) {
    if (openingStoryId !== null) return;
    setOpeningStoryId(storyId);

    try {
      const result = await loadStoryAction(storyId);
      if (result.ok) {
        applyLoadedStory(result);
        window.localStorage.setItem(LAST_STORY_ID_KEY, result.storyId);
      } else {
        setLibraryError("That story could not be opened. Please try another one.");
      }
    } finally {
      setOpeningStoryId(null);
    }
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
      void refreshBudgetStatus();
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

      // CR-01 (04-REVIEW.md, second pass): reflect every outcome, not just
      // the cap-refusal and success cases -- a genuine mid-flight failure
      // (result.ok === false, result.capMessage === null) previously left
      // sceneStatuses untouched, so the UI kept showing the old "ready"
      // state and image while the DB had already recorded imageStatus =
      // FAILED, silently stranding the wife with no error and no signal.
      setSceneStatuses((prev) =>
        prev.map((status) =>
          status.sceneNumber === sceneNumber
            ? {
                sceneNumber,
                imagePath: null,
                imageDataUrl: result.ok ? result.imageDataUrl : null,
                ok: result.ok,
                message: result.message,
              }
            : status,
        ),
      );

      if (result.approvalNotice) {
        setPostApprovalNotice(result.approvalNotice);
      }
    } finally {
      setRegeneratingScene(null);
      void refreshBudgetStatus();
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
      void refreshBudgetStatus();
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
    setVideoScenes((prev) => ({
      ...prev,
      [sceneNumber]: { videoState: "generating", videoSrc: null, videoMessage: null },
    }));

    try {
      await retrySceneVideoAction(storyId, sceneNumber);
    } finally {
      setRetryingScene(null);
      void refreshBudgetStatus();
    }
  }

  // OUTPUT-01: exports the episode's files then opens its folder, via the
  // one action that spawns an operating-system process in this codebase.
  async function handleOpenOutputFolder() {
    if (!storyId) return;
    setOpeningFolder(true);
    setOutputMessage(null);

    try {
      const result = await openStoryFolderAction(storyId);
      setOutputMessage(result.message);
    } catch {
      setOutputMessage("Your episode's folder couldn't be opened just now. Please try again.");
    } finally {
      setOpeningFolder(false);
    }
  }

  // D-05: polls getStoryStatusAction while Screen 4 is showing, mapping each
  // scene's DB-backed videoStatus onto its own row -- the database, not any
  // in-memory job registry, is the single source of truth this reads.
  useEffect(() => {
    if (screen !== "video-status" || !storyId) return;

    let cancelled = false;
    // WR-03: guards against overlapping poll() cycles -- without it, a slow
    // cycle's loadStoryAction (reading/base64-encoding every ready scene's
    // media) can still be in flight when the next 3s tick fires, and its
    // eventually-stale status snapshot can then overwrite a faster, newer
    // cycle's already-applied state (a scene visibly flips back from
    // "ready" to "generating" for one tick).
    let pollInFlight = false;

    async function poll() {
      if (pollInFlight) return;
      pollInFlight = true;
      try {
        await pollOnce();
      } finally {
        pollInFlight = false;
      }
    }

    async function pollOnce() {
      const currentStoryId = storyId as string;
      // D-03: piggybacks the spend-indicator refresh on this same 3s poll
      // tick while Screen 4 is showing, rather than adding a second timer --
      // fired unconditionally, before the early-return below, so it keeps
      // refreshing even on a tick whose story-status read comes back !ok.
      void refreshBudgetStatus();
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

          // 04-RESEARCH.md Pitfall 2 / Phase 6 06-05: the stuck signal comes
          // straight from the status row -- getStoryStatusAction computes it
          // server-side from Scene.videoGeneratingSince, a persisted
          // timestamp that survives a page reload. No timestamp is recorded,
          // compared, or reset anywhere in this client.
          const stuck = row.stuck;

          let videoMessage: string | null =
            videoState === "failed" ? "This scene's video could not be created." : null;

          // Phase 6 06-05, D-05: overrides the generic failure message with
          // the plain-language save-failure explanation, byte-identical to
          // the sentence generate-video.ts's own validation failure returns
          // (src/core/output/mp4-validation.ts's CORRUPT_VIDEO_MESSAGE).
          // Deliberately duplicated here rather than imported -- following
          // the same convention the cap sentence below already uses in this
          // file -- since a client file must never import a server-only
          // module, and mp4-validation.ts in particular pulls in the mp4box
          // container parser, which has no business in the browser bundle.
          // Placed AFTER the generic failure message and BEFORE the capped
          // check below, so a save-corrupted scene is never shown as capped
          // -- Task 1 already narrows the row's own capReached signal for an
          // exempt scene, so this branch only needs to supply the message.
          if (row.saveCorrupted && videoState === "failed") {
            videoMessage =
              "This scene's video file didn't save properly, so it can't be used. Trying again won't use up one of this scene's attempts.";
          }

          // D-03: the cap is checked LAST so it takes priority over "failed"
          // -- an exhausted scene shows the calm amber explanation, never
          // the red failure message, even though its underlying videoStatus
          // is also FAILED.
          if (row.capReached && videoState === "failed") {
            videoState = "capped";
            videoMessage =
              `This scene's video has reached its limit of ${status.maxAttempts} attempts. The other scenes ` +
              "aren't affected — you can continue with what's ready, or start a new story to try again.";
          }

          // WR-02: a budget-ceiling refusal is a permanent dead end, not a
          // transient failure -- reuses the "capped" rendering (message-only,
          // no retry button) rather than the generic failed message + an
          // always-available "Try again" that would only refuse again.
          if (row.budgetExceeded && videoState === "failed") {
            videoState = "capped";
            videoMessage = "The generation budget has been reached for this project.";
          }

          const existingSrc = prev[row.sceneNumber]?.videoSrc ?? null;
          const videoSrc = videoState === "ready" ? (existingSrc ?? mediaByScene[row.sceneNumber] ?? null) : null;
          next[row.sceneNumber] = { videoState, videoSrc, videoMessage, stuck };
        }
        return next;
      });

      // CR-01: stop polling only once there is truly nothing left she could
      // ever retry -- every scene READY, or FAILED *and* at its retry cap.
      // A scene that is still GENERATING, or FAILED-but-not-capped (and thus
      // eligible for the VIDEO-04 "Try again" action), keeps this false so
      // the poll stays alive to observe the outcome of a later single-scene
      // retry dispatched after the rest of the batch has already settled.
      const nothingLeftToRetry =
        status.scenes.length > 0 &&
        status.scenes.every(
          (row) => row.videoStatus === "READY" || (row.videoStatus === "FAILED" && row.capReached),
        );
      if (nothingLeftToRetry) {
        clearInterval(intervalId);

        // OUTPUT-01: this is what makes plan 04-03's locked sentence "Every
        // scene is ready. Your episode's clips are saved and numbered for
        // CapCut." true at the instant it appears, not only after she
        // presses "Open Output Folder". Fires at most once per story per
        // session, guarded by finalizedStoryIdRef.
        const anyReady = status.scenes.some((row) => row.videoStatus === "READY");
        if (anyReady && currentStoryId && finalizedStoryIdRef.current !== currentStoryId) {
          finalizedStoryIdRef.current = currentStoryId;
          setFinalizedStoryId(currentStoryId);
          finalizeEpisodeAction(currentStoryId).catch((err) => {
            console.error(`finalizeEpisodeAction failed for story ${currentStoryId}`, err);
          });
        }
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
        {/* D-03: rendered once, above the screen switch, so it is visible on
            every screen -- what "always visible" means and what avoids
            deciding which screens deserve it. */}
        <BudgetIndicator status={budgetStatus} />

        {!restoring && screen === "create" && (
          <div className="flex flex-col gap-6">
            <button
              type="button"
              onClick={handleOpenLibrary}
              className="self-end text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
            >
              My Stories
            </button>
            <CreateStoryForm
              stylePresets={STYLE_PRESETS}
              moodOptions={MOOD_OPTIONS}
              loading={createLoading}
              error={createError}
              onSubmit={handleCreateStory}
            />
          </div>
        )}

        {screen === "library" && (
          <MyStoriesList
            stories={libraryStories}
            loading={libraryLoading}
            error={libraryError}
            openingStoryId={openingStoryId}
            onOpenStory={handleOpenLibraryStory}
            onCreateStory={handleReturnToCreate}
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
            retryDisabled={retryingScene !== null}
            onOpenOutputFolder={handleOpenOutputFolder}
            openingFolder={openingFolder}
            outputMessage={outputMessage}
          />
        )}
      </main>
    </div>
  );
}

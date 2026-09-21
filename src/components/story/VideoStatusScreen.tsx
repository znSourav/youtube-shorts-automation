"use client";

import SceneVideo, { type SceneVideoState } from "../scenes/SceneVideo";

// D-05: Screen 4 polls getStoryStatusAction on this interval. Exported so
// page.tsx's polling effect uses the same single source of truth.
export const POLL_INTERVAL_MS = 3000;

export interface VideoStatusSceneRow {
  sceneNumber: number;
  storyPurpose: string;
  videoState: SceneVideoState;
  videoSrc: string | null;
  videoMessage: string | null;
  // True when this scene has been "generating" longer than STUCK_AFTER_MS --
  // renders a "Try again" affordance alongside the generating message.
  stuck?: boolean;
}

export interface VideoStatusScreenProps {
  storyTitle: string;
  scenes: VideoStatusSceneRow[];
  dispatched: boolean;
  starting: boolean;
  error: string | null;
  allReady: boolean;
  onGenerateAll: () => void;
  // VIDEO-04: retries exactly one scene through the same gated dispatch the
  // batch uses. Wired to a "failed" row's "Try again" button and, when
  // `stuck` is true, to a "generating" row's own "Try again" affordance.
  onRetryScene: (sceneNumber: number) => void;
  // WR-04 (04-REVIEW.md, second pass): true while any single-scene retry is
  // in flight (page.tsx's retryingScene !== null). Passed straight through
  // to every scene's SceneVideo `disabled` prop so a fast double click
  // cannot read a stale pre-re-render guard and dispatch a second paid call
  // for the same (or a different) scene while one retry is already running.
  retryDisabled?: boolean;
  // OUTPUT-01 (plan 04-04): exports the episode's files then opens the
  // folder. All three optional so this component doesn't require every
  // caller (e.g. an earlier test) to supply them.
  onOpenOutputFolder?: () => void;
  openingFolder?: boolean;
  outputMessage?: string | null;
}

/**
 * Screen 4 (D-05, new) -- watches every approved scene's video job,
 * independently. Reuses Screen 3's existing grid (`grid grid-cols-1 gap-4
 * sm:grid-cols-2`) and mounts the already-built SceneVideo component
 * directly per scene -- passing state="ready" through SceneCard's own image
 * well would be wrong here (there is no image slot on this screen), so this
 * is a light bespoke row rather than a reused SceneCard. Adds no icon
 * library, no new spacing increment, no sixth type size (04-UI-SPEC.md).
 */
export default function VideoStatusScreen({
  storyTitle,
  scenes,
  dispatched,
  starting,
  error,
  allReady,
  onGenerateAll,
  onRetryScene,
  retryDisabled,
  onOpenOutputFolder,
  openingFolder,
  outputMessage,
}: VideoStatusScreenProps) {
  // 06-REVIEW.md WR-02: `allReady` (from page.tsx's allVideosSettled) now
  // also turns true once every scene is permanently capped/budget-exhausted,
  // not just when every scene is literally "ready" -- otherwise a single
  // stuck scene made the Open Output Folder button permanently unreachable
  // even though finalizeEpisodeAction already exports whatever did finish.
  // These two narrower checks are computed here, from the scenes this
  // component already receives, purely to keep the completion copy honest:
  // it must never claim "every scene is ready" when some are only capped,
  // and must never claim "the rest are ready" when none actually are (every
  // scene capped/budget-exhausted with zero survivors -- an unlucky but
  // reachable edge given the shared $15 budget).
  const everySceneReady = scenes.length > 0 && scenes.every((scene) => scene.videoState === "ready");
  const anySceneReady = scenes.some((scene) => scene.videoState === "ready");

  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-2xl font-semibold text-black dark:text-zinc-50">{storyTitle}</h2>

      {error && (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {scenes.map((scene) => (
          <div
            key={scene.sceneNumber}
            className="flex flex-col gap-2 rounded border border-zinc-300 p-3 dark:border-zinc-700"
          >
            <span className="font-medium text-black dark:text-zinc-50">Scene {scene.sceneNumber}</span>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{scene.storyPurpose}</p>
            <SceneVideo
              state={scene.videoState}
              videoSrc={scene.videoSrc}
              message={scene.videoMessage}
              stuck={scene.stuck}
              disabled={retryDisabled}
              onRetry={
                scene.videoState === "failed" || (scene.videoState === "generating" && scene.stuck)
                  ? () => onRetryScene(scene.sceneNumber)
                  : undefined
              }
            />
          </div>
        ))}
      </div>

      {!dispatched && !allReady && (
        <button
          type="button"
          disabled={starting}
          onClick={onGenerateAll}
          className="rounded-full bg-foreground px-5 py-3 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {starting ? "Starting..." : "Generate All Videos"}
        </button>
      )}

      {allReady && (
        <>
          <p className="text-sm text-black dark:text-zinc-50">
            {everySceneReady
              ? "Every scene is ready. Your episode's clips are saved and numbered for CapCut."
              : anySceneReady
                ? "Some scenes couldn't be finished, but the rest are ready. Your episode's available clips are saved and numbered for CapCut."
                : "None of this episode's scenes could be finished. You can open the folder to see what's there, or start a new story to try again."}
          </p>
          {onOpenOutputFolder && (
            <button
              type="button"
              disabled={openingFolder}
              onClick={onOpenOutputFolder}
              className="rounded-full bg-foreground px-5 py-3 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              {openingFolder ? "Opening..." : "Open Output Folder"}
            </button>
          )}
          {outputMessage && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{outputMessage}</p>
          )}
        </>
      )}
    </div>
  );
}

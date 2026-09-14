"use client";

import SceneVideo, { type SceneVideoState } from "../scenes/SceneVideo";

// D-05: Screen 4 polls getStoryStatusAction on this interval. Exported so
// page.tsx's polling effect uses the same single source of truth.
export const POLL_INTERVAL_MS = 3000;

// A scene sitting in "generating" longer than this is treated as possibly
// stuck (04-RESEARCH.md Pitfall 2 -- an after() callback can be dropped by a
// dev-server recompile). Set just beyond veo.ts's own 10-minute POLL_TIMEOUT_MS
// so a genuinely slow-but-live generation is never mislabelled.
export const STUCK_AFTER_MS = 12 * 60 * 1000;

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
}: VideoStatusScreenProps) {
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
              onRetry={
                scene.videoState === "failed" || (scene.videoState === "generating" && scene.stuck)
                  ? () => onRetryScene(scene.sceneNumber)
                  : undefined
              }
            />
          </div>
        ))}
      </div>

      {!dispatched && (
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
        <p className="text-sm text-black dark:text-zinc-50">
          Every scene is ready. Your episode&apos;s clips are saved and numbered for CapCut.
        </p>
      )}
    </div>
  );
}

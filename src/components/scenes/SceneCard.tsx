"use client";

import SceneVideo, { type SceneVideoState } from "./SceneVideo";

export type SceneCardState = "waiting" | "generating" | "ready" | "failed";

export interface SceneCardProps {
  sceneNumber: number;
  storyPurpose: string;
  state: SceneCardState;
  // A data: URL, never a filesystem path -- the wife-facing UI must not
  // display a path (T-02-06). generate-images.ts is the only producer of
  // this value.
  imageSrc?: string | null;
  // Already plain-language (generate-images.ts's job, not this component's) --
  // rendered verbatim on failure, nothing else.
  message?: string | null;

  // Plan 02-04: video slot. `onGenerateVideo` is only passed for the one
  // scene this phase can animate (VIDEO-01's single-scene scope) -- every
  // other scene renders SceneVideo in its plain "waiting" state with no
  // action available (VIDEO-02 is Phase 4).
  videoState?: SceneVideoState;
  videoSrc?: string | null;
  videoMessage?: string | null;
  onGenerateVideo?: () => void;
  onRetryVideo?: () => void;
  videoDisabled?: boolean;
  videoWaitingHint?: string;
}

/**
 * Screen 3 (docs/original-brief.md §18, D-01) -- one tile per scene.
 */
export default function SceneCard({
  sceneNumber,
  storyPurpose,
  state,
  imageSrc,
  message,
  videoState = "waiting",
  videoSrc,
  videoMessage,
  onGenerateVideo,
  onRetryVideo,
  videoDisabled,
  videoWaitingHint,
}: SceneCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded border border-zinc-300 p-3 dark:border-zinc-700">
      <div className="flex items-center justify-between">
        <span className="font-medium text-black dark:text-zinc-50">Scene {sceneNumber}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {state === "waiting" && "Waiting"}
          {state === "generating" && "Generating..."}
          {state === "ready" && "Image ready"}
          {state === "failed" && "Failed"}
        </span>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">{storyPurpose}</p>

      <div className="flex aspect-[9/16] w-full items-center justify-center overflow-hidden rounded bg-zinc-100 dark:bg-zinc-900">
        {state === "ready" && imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- imageSrc is
          // a data: URL (see comment above); next/image does not optimize
          // data: URLs, so a plain <img> is the correct tool here.
          <img src={imageSrc} alt={`Scene ${sceneNumber}`} className="h-full w-full object-cover" />
        ) : state === "failed" ? (
          <p className="p-2 text-center text-xs text-red-700 dark:text-red-300">
            {message ?? "This scene's image could not be created."}
          </p>
        ) : (
          <p className="text-xs text-zinc-400">{state === "generating" ? "Generating image..." : "Waiting..."}</p>
        )}
      </div>

      <SceneVideo
        state={videoState}
        videoSrc={videoSrc}
        message={videoMessage}
        onGenerate={onGenerateVideo}
        onRetry={onRetryVideo}
        disabled={videoDisabled}
        waitingHint={videoWaitingHint}
      />
    </div>
  );
}

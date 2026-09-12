"use client";

export type SceneVideoState = "waiting" | "generating" | "ready" | "failed";

export interface SceneVideoProps {
  state: SceneVideoState;
  // A data: URL, never a filesystem path -- the wife-facing UI must not
  // display a path (T-02-06). generate-video.ts is the only producer of
  // this value.
  videoSrc?: string | null;
  // Already plain-language (generate-video.ts's job, not this component's) --
  // rendered verbatim on failure, nothing else.
  message?: string | null;
  // Present only on the one scene this phase can animate (VIDEO-01 scope) --
  // omitted entirely for every other scene, which stays "waiting" with no
  // action available yet (VIDEO-02 is Phase 4).
  onGenerate?: () => void;
  onRetry?: () => void;
  disabled?: boolean;
  // Plain-language hint shown in the "waiting" state when no onGenerate
  // handler is supplied -- lets the one scene this phase animates (VIDEO-01)
  // read differently from every other scene, which has no action at all.
  waitingHint?: string;
}

/**
 * Fills the video slot plan 02-03 left open in SceneCard. Four distinct
 * states, no provider vocabulary (no prompt text, no model id, no filesystem
 * path) in any of them -- only a plain-language message on failure.
 */
export default function SceneVideo({
  state,
  videoSrc,
  message,
  onGenerate,
  onRetry,
  disabled,
  waitingHint,
}: SceneVideoProps) {
  if (state === "ready" && videoSrc) {
    return (
      <div className="flex flex-col gap-1">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a locally
            generated silent/ambient clip with no dialogue to caption */}
        <video src={videoSrc} controls className="w-full rounded" />
      </div>
    );
  }

  if (state === "generating") {
    return (
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Generating video... this can take a few minutes.
      </p>
    );
  }

  if (state === "failed") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-red-700 dark:text-red-300">
          {message ?? "This scene's video could not be created."}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="self-start rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  // waiting
  if (onGenerate) {
    return (
      <button
        type="button"
        onClick={onGenerate}
        disabled={disabled}
        className="self-start rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
      >
        Generate video for this scene
      </button>
    );
  }

  return (
    <p className="text-xs text-zinc-400 dark:text-zinc-500">
      {waitingHint ?? "Video generation for this scene isn't available yet."}
    </p>
  );
}

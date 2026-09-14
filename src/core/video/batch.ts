// Pure orchestration over an injected dispatcher -- performs no I/O of its
// own and imports nothing from the providers, the ledger, or the database.
// That purity is what makes it testable at zero cost (a fake dispatcher
// proves the whole batch's sequencing/tolerance behaviour with zero real
// spend), and it is also what D-04's "one scene's failure never blocks or
// affects another's" (VIDEO-02) is built on: this module has no early
// return and no rethrow anywhere in its loop, so it is structurally
// impossible for one scene's failure -- or a thrown error -- to end the
// others. Mirrors src/core/uniqueness/check.ts's bounded sequential loop
// (runUniqueStoryDirector) and its injected-collaborator convention.
export interface BatchDispatchDeps {
  dispatch: (sceneNumber: number) => Promise<{ ok: boolean }>;
  onSceneSettled?: (sceneNumber: number, ok: boolean) => void;
}

export interface BatchDispatchOutcome {
  attempted: number;
  succeeded: number[];
  failed: number[];
}

/**
 * Dispatches every supplied scene number, one at a time, awaiting each call
 * before starting the next -- sequential, never parallel, keeping exactly
 * one paid call in flight at once (mirrors generateSceneImagesAction's
 * existing sequential loop). Each iteration is wrapped in its own try/catch:
 * a thrown dispatch is recorded in `failed` and logged once, and the loop
 * continues to the next scene regardless of the outcome above it.
 */
export async function runBatchVideoDispatch(
  sceneNumbers: number[],
  deps: BatchDispatchDeps,
): Promise<BatchDispatchOutcome> {
  const succeeded: number[] = [];
  const failed: number[] = [];

  for (const sceneNumber of sceneNumbers) {
    let ok = false;
    try {
      const result = await deps.dispatch(sceneNumber);
      ok = result.ok;
    } catch (err) {
      console.error(`runBatchVideoDispatch: scene ${sceneNumber} threw`, err);
      ok = false;
    }

    if (ok) {
      succeeded.push(sceneNumber);
    } else {
      failed.push(sceneNumber);
    }

    deps.onSceneSettled?.(sceneNumber, ok);
  }

  return { attempted: sceneNumbers.length, succeeded, failed };
}

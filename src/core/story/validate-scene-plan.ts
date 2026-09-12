// Schema minItems/maxItems (director.ts buildStorySchema) constrains COUNT
// only; this checks the cross-item numbering invariant the schema cannot
// express (RESEARCH.md Pitfall 3) -- a response numbered 1, 2, 2, 4 would
// otherwise satisfy the schema and silently make two scenes write to the
// same folder later. Follows spend-ledger.ts's fail-closed philosophy:
// never let a malformed shape through as if it were fine.
export interface SceneValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateScenePlan(
  scenes: { scene_number: number }[],
  expectedCount: number,
): SceneValidationResult {
  const errors: string[] = [];
  if (scenes.length !== expectedCount) {
    errors.push(`Expected ${expectedCount} scenes, got ${scenes.length}`);
  }
  const numbers = scenes.map((s) => s.scene_number).sort((a, b) => a - b);
  for (let i = 0; i < numbers.length; i++) {
    if (numbers[i] !== i + 1) {
      errors.push(`Scene numbering gap or duplicate: expected ${i + 1}, found ${numbers[i]}`);
      break;
    }
  }
  return { valid: errors.length === 0, errors };
}

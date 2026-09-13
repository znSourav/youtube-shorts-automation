// WR-01/03-REVIEW.md WR-05: checkCeiling gates every paid Story Director
// call on a fixed, conservative FLAT per-call estimate
// (Math.max(...Object.values(LLM_PRICE_PER_CALL))) regardless of prompt
// size, but Gemini bills per token -- an unusually long pasted idea or
// character description could make a single call's real cost exceed what
// the ceiling gate reserved for it. These caps bound the wife's free text
// before it ever reaches buildStoryPrompt/checkCeiling, keeping the "every
// paid provider call must pass a pre-flight check ... no exceptions"
// guarantee true for prompt size too, not just call count.
//
// Shared by CreateStoryForm.tsx (client-side `maxLength` on both
// `<textarea>`s, for immediate feedback) and createStoryAction
// (server-side re-validation, since a client-side cap alone is not a real
// enforcement boundary). Kept in one module, not duplicated, so the two
// enforcement points cannot silently drift apart.
export const MAX_IDEA_LENGTH = 4000;
export const MAX_CHARACTER_DESCRIPTION_LENGTH = 4000;

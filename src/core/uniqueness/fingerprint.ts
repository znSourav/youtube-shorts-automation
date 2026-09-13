// CONTEXT.md D-01: structural similarity is judged on exactly three
// elements -- what the protagonist wants/lacks, the central obstacle or
// mechanism, and how it ends emotionally. Surface details (species,
// setting, specific object, character names) never factor into the
// comparison, which is why FINGERPRINT_INSTRUCTION requires abstracted,
// noun-free phrasing for these three fields specifically.
//
// English-only rule: these three fields are internal comparison keys the
// wife never sees, and they feed a whitespace/letter tokeniser
// (src/core/uniqueness/similarity.ts, plan 03-02). If the same structural
// idea typed in Bangla script and in Banglish produced fingerprint text in
// two different scripts, the tokeniser would treat them as unrelated,
// silently breaking STORY-02's "both scripts get identical results"
// guarantee for the uniqueness system specifically. Language is a surface
// detail, which D-01 excludes from the comparison by name -- so this is a
// deliberate, narrow carve-out from buildStoryPrompt's existing
// do-not-translate instruction, not a contradiction of it.
import type { StoryDirectorOutput } from "../story/schema.ts";

export interface StructuralFingerprint {
  protagonistWant: string;
  centralObstacle: string;
  endingShape: string;
}

export const FINGERPRINT_INSTRUCTION = [
  "In addition to the story fields above, also fill in three short structural fields --",
  "protagonist_want, central_obstacle, and ending_shape -- written in ABSTRACTED language that",
  "names no character name, no species, no specific object, and no setting. Describe the",
  "underlying story shape only, the way a one-line story-structure summary would. For example:",
  'protagonist_want: "a character seeks to return a found object to its rightful owner" (not',
  '"the boy wants to give back the kite"); central_obstacle: "the owner\'s identity is unknown',
  'and must be discovered" (not "he doesn\'t know whose kite it is"); ending_shape: "quiet',
  'personal satisfaction from an act of honesty" (not "the boy feels happy after returning the',
  'kite"). IMPORTANT EXCEPTION: unlike every other field in this response, which must stay in',
  "the same language/script as the idea below, these three fields -- protagonist_want,",
  "central_obstacle, and ending_shape -- must ALWAYS be written in English, even when the idea",
  "is in Bangla script or Banglish. This is a narrow, deliberate exception to the instruction",
  "above not to translate: these three fields are internal comparison keys, never shown to",
  "anyone, and keeping them in one consistent language lets the same story idea typed in either",
  "script be recognized as structurally identical.",
].join(" ");

/**
 * Maps the Story Director's three snake_case response fields onto the
 * camelCase StructuralFingerprint shape the persistence layer and the
 * uniqueness pre-filter (plan 03-02) both consume.
 */
export function fingerprintFromStoryOutput(output: StoryDirectorOutput): StructuralFingerprint {
  return {
    protagonistWant: output.story.protagonist_want,
    centralObstacle: output.story.central_obstacle,
    endingShape: output.story.ending_shape,
  };
}

import { z } from "zod";

// zod schemas mirroring docs/original-brief.md §10's Story Director output
// shape (field names/nesting exactly). Required-ness intentionally follows
// buildStorySchema's own `required` arrays (director.ts) rather than
// requiring every single field: those are the fields Gemini's own
// `responseSchema` contractually guarantees are present, so a
// `.safeParse()` failure here signals a genuine shape violation rather than
// a merely-optional creative-writing field the model reasonably left out.
export const SceneSchema = z.object({
  scene_number: z.number().int(),
  duration: z.number().int().optional(),
  story_purpose: z.string(),
  location: z.string().optional(),
  characters: z.string().optional(),
  action: z.string().optional(),
  emotion: z.string().optional(),
  camera: z.string().optional(),
  lighting: z.string().optional(),
  environment: z.string().optional(),
  image_prompt: z.string(),
  motion_prompt: z.string(),
  continuity_requirements: z.string().optional(),
});
export type Scene = z.infer<typeof SceneSchema>;

export const StoryDirectorOutputSchema = z.object({
  story: z.object({
    title: z.string(),
    premise: z.string(),
    story: z.string(),
    theme: z.string(),
    emotional_arc: z.string(),
    ending: z.string(),
  }),
  character_bible: z.object({
    name: z.string(),
    age: z.string().optional(),
    appearance: z.string(),
    hair: z.string(),
    clothing: z.string(),
    body_proportions: z.string().optional(),
    personality: z.string().optional(),
    distinguishing_features: z.string(),
  }),
  style_bible: z.object({
    medium: z.string(),
    line_style: z.string().optional(),
    color_palette: z.string(),
    lighting: z.string().optional(),
    texture: z.string().optional(),
    character_rendering: z.string(),
    background_rendering: z.string().optional(),
    animation_characteristics: z.string().optional(),
    camera_language: z.string().optional(),
  }),
  scenes: z.array(SceneSchema),
});
export type StoryDirectorOutput = z.infer<typeof StoryDirectorOutputSchema>;

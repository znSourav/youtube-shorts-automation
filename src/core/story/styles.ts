// Config-driven Style Bible presets (STORY-04, docs/original-brief.md §9 & §26).
// "Do not hard-code dozens of prompts inside React components" -- this module
// is the single source of truth for the 6 named animation styles, consumed by
// the Story Director prompt builder (src/core/story/director.ts, plan 02-02).
//
// Every field below is written as an ORIGINAL visual direction -- describing
// materials, technique, and light -- never as a reference to a specific living
// artist's, studio's, or franchise's signature look (docs/original-brief.md §9).
//
// This module must stay dependency-free (no React/Next/provider imports) so
// `node --test` can exercise it directly with no bundler.

export interface StyleBibleSeed {
  medium: string;
  line_style: string;
  color_palette: string;
  lighting: string;
  texture: string;
  character_rendering: string;
  background_rendering: string;
  animation_characteristics: string;
  camera_language: string;
}

export interface StylePreset {
  id: string;
  label: string;
  styleBibleSeed: StyleBibleSeed;
}

export const STYLE_PRESETS: Record<string, StylePreset> = {
  "soft-hand-painted-2d": {
    id: "soft-hand-painted-2d",
    label: "Soft hand-painted 2D",
    styleBibleSeed: {
      medium: "digital gouache-style painting built up in soft layered strokes",
      line_style: "minimal, softened outlines that dissolve into the paint rather than hard vector edges",
      color_palette: "warm, muted pastel tones with gentle contrast between foreground and background",
      lighting: "diffuse, storybook-soft illumination with no harsh shadows",
      texture: "visible brush texture and faint paper grain across every surface",
      character_rendering: "rounded, gently simplified proportions with soft-edged shading and no sharp cel lines",
      background_rendering: "loosely painted environments with blurred, atmospheric depth behind the characters",
      animation_characteristics: "slow, cushioned easing on movement; nothing snaps or moves rigidly",
      camera_language: "gentle drifting pans and slow push-ins, framed like a picture-book spread",
    },
  },
  "watercolor-storybook": {
    id: "watercolor-storybook",
    label: "Watercolor storybook",
    styleBibleSeed: {
      medium: "traditional watercolor on textured paper, digitally composited",
      line_style: "loose ink-wash outlines that bleed slightly at the edges",
      color_palette: "translucent, layered washes of color with visible pooling and bloom",
      lighting: "soft natural light suggested through color temperature shifts rather than hard highlights",
      texture: "visible paper fiber, pigment granulation, and soft bleeding edges between color fields",
      character_rendering: "simplified, fluid silhouettes built from layered color washes rather than flat fills",
      background_rendering: "impressionistic environments rendered as overlapping washes with soft, undefined edges",
      animation_characteristics: "gentle, flowing motion that echoes the medium's own bleed and drift",
      camera_language: "static or slow-drifting compositions that read like turning pages of an illustrated book",
    },
  },
  "early-90s-hand-drawn": {
    id: "early-90s-hand-drawn",
    label: "Early '90s hand-drawn animation",
    styleBibleSeed: {
      medium: "traditional cel-style hand-drawn animation with a warm analog film grain",
      line_style: "consistent, confident ink outlines of even weight around every shape",
      color_palette: "saturated, flat fills using a limited palette typical of hand-painted animation cels",
      lighting: "flat, even lighting with simple painted shadow shapes rather than gradients",
      texture: "slight film grain and faint color fringing consistent with analog cel photography",
      character_rendering: "clean, evenly outlined characters with flat color fills and simple painted shading blocks",
      background_rendering: "painted matte backgrounds with visible brushwork, slightly softer than the crisp character line art",
      animation_characteristics: "on-twos style timing with slightly stepped, deliberate movement rather than perfectly smooth motion",
      camera_language: "modest, deliberate pans and cuts, favoring clear wide and medium shots over dynamic camera moves",
    },
  },
  "cinematic-2d": {
    id: "cinematic-2d",
    label: "Cinematic 2D",
    styleBibleSeed: {
      medium: "digitally painted 2D animation with film-grade lighting and compositing",
      line_style: "subtle or near-absent outlines, with form defined primarily through light and shadow",
      color_palette: "a controlled, moody palette with strong color grading and deliberate contrast",
      lighting: "directional, dramatic lighting with pronounced highlights, rim light, and deep shadow",
      texture: "smooth digital painting with subtle grain and soft lens-like depth-of-field blur",
      character_rendering: "volumetric shading with soft gradients that model form the way live-action lighting would",
      background_rendering: "richly detailed environments with atmospheric haze and layered depth",
      animation_characteristics: "smooth, weighted motion with naturalistic timing and subtle secondary motion",
      camera_language: "cinematic framing with shallow depth of field, slow dolly moves, and purposeful composition",
    },
  },
  "cute-childrens-animation": {
    id: "cute-childrens-animation",
    label: "Cute children's animation",
    styleBibleSeed: {
      medium: "clean digital 2D animation designed for young audiences",
      line_style: "smooth, rounded, uniformly weighted outlines with no sharp corners",
      color_palette: "bright, cheerful, high-saturation primary and secondary colors",
      lighting: "even, bright, shadow-light illumination that keeps every character clearly readable",
      texture: "crisp, flat, clean digital surfaces with minimal grain or noise",
      character_rendering: "oversized heads, large expressive eyes, and soft rounded body shapes with bold flat color fills",
      background_rendering: "simplified, friendly environments with large clean shapes and few small details",
      animation_characteristics: "bouncy, exaggerated squash-and-stretch motion with a playful, energetic rhythm",
      camera_language: "simple, stable framing at a child's eye level with gentle, easy-to-follow camera moves",
    },
  },
  "dreamy-fantasy": {
    id: "dreamy-fantasy",
    label: "Dreamy fantasy animation",
    styleBibleSeed: {
      medium: "soft-focus digital painting layered with glowing particle and light effects",
      line_style: "barely-there outlines that dissolve into soft glowing edges rather than hard lines",
      color_palette: "luminous, jewel-toned colors with glowing highlights against deep twilight backdrops",
      lighting: "magical, glowing light sources -- soft bloom, drifting sparkles, and gentle backlight halos",
      texture: "soft-focus, slightly hazy rendering with a faint glow bleeding from bright areas",
      character_rendering: "elegant, slightly elongated proportions with soft luminous rim light outlining each figure",
      background_rendering: "layered, atmospheric environments with floating particles, mist, and soft depth fog",
      animation_characteristics: "slow, floating, weightless motion with drifting particles and gentle pulsing glows",
      camera_language: "slow, sweeping drifts and gentle arcs that emphasize scale and wonder",
    },
  },
};

// Moods are prompt input for the Story Director, not a Style Bible -- they
// carry no seed object (docs/original-brief.md §9's Mood dropdown).
export const MOOD_OPTIONS: readonly string[] = [
  "Emotional",
  "Joyful",
  "Calm",
  "Adventurous",
  "Bittersweet",
];

// Asset manifest for tools/gen-art.mjs — the Nano Banana (OpenRouter) art
// pipeline for OceanSkips' HD-water upgrade (see implementation-20.md, Phase A/B).
//
// mode: 'texture'  — opaque, tiles/fills a rect; resized with fit 'cover', no
//                     chroma-key.
//       'sprite'   — subject on a solid green background; chroma-keyed to
//                     transparency, trimmed to content, and fit inside the
//                     target box on a transparent canvas.
//
// Only a subset of these are generated so far (see tools/art-cache/*.webp —
// whatever's missing there hasn't been run yet). Run more with:
//   cd tools && node gen-art.mjs --only=id1,id2
// or omit --only to (re)generate everything not already cached.

const SPRITE_SUFFIX =
  ' Render the subject on a SOLID, FLAT, PURE GREEN (#00ff00) background — ' +
  'no gradients, shadows, or texture on the background, just flat chroma-key ' +
  'green. Center the subject with generous margin on all sides. No text, no ' +
  'watermark, no logo.';

export const ASSETS = [
  {
    id: 'caustics',
    mode: 'texture',
    w: 384, h: 384,
    prompt: 'A seamless, tileable, top-down texture of soft underwater light ' +
      'caustics: pale cyan-white refracted light patterns on a dark teal-blue ' +
      'background, like sunlight rippling through shallow water. Even, ' +
      'repeating, abstract pattern with no focal subject, no watermark, no text.',
  },
  {
    id: 'foamStamp1',
    mode: 'sprite',
    w: 96, h: 48,
    prompt: 'A small hand-painted cartoon sea-foam splash brush stamp: white ' +
      'and pale-blue foam bubbles and froth, playful beach-fiesta illustration ' +
      'style, irregular organic blob shape, elongated horizontally.' + SPRITE_SUFFIX,
  },
  {
    id: 'foamStamp2',
    mode: 'sprite',
    w: 80, h: 40,
    prompt: 'A small hand-painted cartoon sea-foam splash brush stamp, a ' +
      'different irregular organic froth shape than a wave crest, white and ' +
      'pale-blue, playful beach-fiesta illustration style, elongated horizontally.' +
      SPRITE_SUFFIX,
  },
  {
    id: 'bubbleSmall',
    mode: 'sprite',
    w: 24, h: 24,
    prompt: 'A single small round underwater air bubble, glossy cartoon style ' +
      'with a bright specular highlight and pale cyan rim shading, simple and ' +
      'clean, centered.' + SPRITE_SUFFIX,
  },
  {
    id: 'bubbleLarge',
    mode: 'sprite',
    w: 48, h: 48,
    prompt: 'A single round underwater air bubble, glossy cartoon style with a ' +
      'bright specular highlight near the top-left and pale cyan rim shading, ' +
      'simple and clean, centered, larger and slightly wobbly/oval.' + SPRITE_SUFFIX,
  },
  {
    id: 'kelpFrond1',
    mode: 'sprite',
    w: 64, h: 220,
    prompt: 'A single tall strand of cartoon seagrass/kelp, vivid green with ' +
      'darker green shading, gently curved like it is swaying underwater, ' +
      'flat illustration style matching a cheerful beach-fiesta game, ' +
      'anchored at the bottom, tapering to a soft tip at the top.' + SPRITE_SUFFIX,
  },
  {
    id: 'kelpFrond2',
    mode: 'sprite',
    w: 56, h: 180,
    prompt: 'A single tall strand of cartoon seagrass/kelp, a different S-curve ' +
      'silhouette than a simple bend, teal-green with darker shading, flat ' +
      'illustration style matching a cheerful beach-fiesta game, anchored at ' +
      'the bottom, tapering to a soft tip at the top.' + SPRITE_SUFFIX,
  },
  {
    id: 'rayBrush',
    mode: 'sprite',
    w: 120, h: 480,
    prompt: 'A single soft vertical beam of light, a long tapered streak that ' +
      'is bright and wide at the top and fades to nothing at the bottom, warm ' +
      'pale-yellow-white, soft-edged and diffuse like a sunbeam shining down ' +
      'through water, no other elements.' + SPRITE_SUFFIX,
  },
  {
    id: 'portraitChispa',
    mode: 'sprite',
    w: 160, h: 90,
    prompt: 'A cute cartoon sardine fish mascot character named Chispa: vivid ' +
      'cyan-blue body (#43c6e0), pale cream belly, hot-pink fin (#f0567e), big ' +
      'friendly sparkling eye, energetic mid-swim pose facing right, playful ' +
      'beach-fiesta sticker illustration style, bold clean outlines, flat vivid ' +
      'colors, wide horizontal framing.' + SPRITE_SUFFIX,
  },
  {
    id: 'portraitVolador',
    mode: 'sprite',
    w: 160, h: 90,
    prompt: 'A cute cartoon flying fish mascot character named Volador: ' +
      'periwinkle-blue body (#7f9bd8), pale lavender belly, large golden-yellow ' +
      'wing-like fin (#ffd93b) spread out mid-glide, big friendly eye, dynamic ' +
      'soaring pose facing right, playful beach-fiesta sticker illustration ' +
      'style, bold clean outlines, flat vivid colors, wide horizontal framing.' +
      SPRITE_SUFFIX,
  },
  {
    id: 'portraitGlobo',
    mode: 'sprite',
    w: 160, h: 90,
    prompt: 'A cute round cartoon pufferfish mascot character named Globo: ' +
      'golden-orange round puffed-up body (#f2b04e), pale cream belly, small ' +
      'burnt-orange fin (#e0642f), tiny spikes, big friendly eye, comically ' +
      'round inflated pose facing right, playful beach-fiesta sticker ' +
      'illustration style, bold clean outlines, flat vivid colors, wide ' +
      'horizontal framing.' + SPRITE_SUFFIX,
  },
  {
    id: 'portraitRayo',
    mode: 'sprite',
    w: 160, h: 90,
    prompt: 'A cute cartoon mackerel fish mascot character named Rayo: sleek ' +
      'teal-green streamlined body (#59c9a5), pale mint belly, purple fin ' +
      '(#8e44ad), big friendly eye, fast rocket-like dart pose facing right ' +
      'with speed lines, playful beach-fiesta sticker illustration style, bold ' +
      'clean outlines, flat vivid colors, wide horizontal framing.' + SPRITE_SUFFIX,
  },
  {
    id: 'portraitDonatun',
    mode: 'sprite',
    w: 160, h: 90,
    prompt: 'A cute cartoon tuna fish mascot character named Don Atun: sturdy ' +
      'heavyset blue-grey body (#5b6ea8), pale blue belly, teal-green fin ' +
      '(#2c8c74), big friendly confident eye, calm sturdy pose facing right, ' +
      'playful beach-fiesta sticker illustration style, bold clean outlines, ' +
      'flat vivid colors, wide horizontal framing.' + SPRITE_SUFFIX,
  },
  {
    id: 'portraitVelero',
    mode: 'sprite',
    w: 160, h: 90,
    prompt: 'A cute cartoon sailfish mascot character named Velero: deep blue ' +
      'streamlined body (#3d5a99), pale blue belly, a huge dramatic bright cyan ' +
      'sail-like dorsal fin (#00c2d6) spread tall and proud, big friendly eye, ' +
      'confident pose facing right catching the wind, playful beach-fiesta ' +
      'sticker illustration style, bold clean outlines, flat vivid colors, wide ' +
      'horizontal framing.' + SPRITE_SUFFIX,
  },
];

export const ART_CACHE_DIR = new URL('./art-cache/', import.meta.url).pathname;

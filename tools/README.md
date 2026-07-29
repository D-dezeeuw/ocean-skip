# Art pipeline (Nano Banana / OpenRouter)

Dev-only tools for generating art with OpenRouter's `google/gemini-2.5-flash-image`
("Nano Banana"). Not shipped — the game itself stays a dependency-free single
`index.html`; this directory has its own `package.json`/`node_modules`.

## Setup

```
cd tools
npm install
export OPENROUTER_API_KEY=...
```

## Generate assets

```
node gen-art.mjs                    # generate everything in art-manifest.mjs not already cached
node gen-art.mjs --only=caustics    # just one (or a comma list)
node gen-art.mjs --force            # re-call the model even if cached
node gen-art.mjs --reprocess        # re-run chroma-key/trim/resize from the cached
                                     # -src.png with NO new API call — use this to
                                     # tune the pipeline without spending generations
```

Output goes to `art-cache/<id>.webp` (post-processed, small) and
`art-cache/<id>-src.png` (raw model output, kept so `--reprocess` never needs
a fresh API call), plus `generated-assets.json` — an `{id: {dataUri, bytes,
w, h, mode}}` map covering everything ever generated.

## Inline into the game

`generated-assets.json` is a superset of what's actually wired into the
renderer — only inline the ids a rendering feature uses, so unused bytes
never ship in `index.html`:

```
node inline-assets.mjs caustics foamStamp1 foamStamp2 kelpFrond1 kelpFrond2 rayBrush
```

This replaces the `const GENERATED_ASSETS = {...}` block in `index.html`
between its marker comments. Keep the inlined total well under the ~300KB
budget noted in `implementation-20.md`.

## Asset modes

- `texture` — opaque, fills/tiles a rect (e.g. the caustics tile). Just
  resized with `fit: 'cover'`, no chroma-key.
- `sprite` — subject on a background color, chroma-keyed to transparency,
  trimmed to content, and fit inside the target box on a transparent canvas.
  The chroma-key samples the actual background color from the image
  corners rather than assuming pure `#00ff00` — Nano Banana routinely drifts
  toward a pastel/muted green depending on the prompt, and a fixed-color key
  misses those.

## Known limitation

Very small sprites (the bubble assets, ≤48px) show visible edge fringing
after chroma-keying at that size — the renderer currently draws bubbles
procedurally instead (crisper at small sizes, no fringing risk). The cached
bubble assets are kept for a future attempt at a larger base render size.

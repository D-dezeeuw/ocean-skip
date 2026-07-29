# OceanSkips — Next-Level Upgrade Plan (20 features)

Target: keep the game a **single-file, offline, no-build** `index.html`, but push the
presentation and flight model to the next level: AI-generated art via **OpenRouter Nano
Banana**, a high-definition living ocean (gradients, caustics, bubbles, light rays,
swaying plants), and a real **wind simulation** where high arcs catch wind and
wave-skimming flight stays sheltered.

## Progress

- ✅ **M1 — Pipeline** (features 1, 2): `tools/gen-art.mjs` + `tools/art-manifest.mjs`
  call OpenRouter's `google/gemini-2.5-flash-image`, chroma-key/trim/resize with
  `sharp`, cache to `tools/art-cache/`, and `tools/inline-assets.mjs` writes the
  selected subset into `index.html`'s `GENERATED_ASSETS` block. See `tools/README.md`.
- ✅ **M2 — Water core** (5, 6, 7, 9, 10, 11): multi-stop depth gradient, two-layer
  scrolling caustics, god rays, sine-swayed kelp beds, foam-stamp crests + persistent
  post-skip foam patches (`drawFoamPatches`), and a hash-twinkle sun-glint band are all
  in `drawSea`/`drawFish`.
- ✅ **M3 — Water life** (8, 12; 3/4 done as fish portraits): bubbles are **procedural**,
  not the generated sprites — the two AI bubble sprites showed visible chroma-key edge
  fringing at their small in-game size (≤48px, see `tools/README.md`), so `spawnBubble()`
  draws a translucent ring + highlight instead. Three bubble sources: ambient seep
  columns (`stepBubbleColumns`), skip-contact bursts, and the sink-state trail. Sink-cam
  polish: depth-fog vignette (`drawSinkOverlay`) and multiply-blended caustic dapples on
  the sinking fish. Fish portrait card art (feature 4) is done — 5 generated portraits
  replace the procedural menu-card thumbnails, with `drawFishShape` as the automatic
  fallback until each image decodes.
- Feature 3's sky/horizon backdrops (per-zone parallax strips) are descoped — the
  procedural sky already reads well and the payoff didn't justify 3 more generations
  under the asset budget.
- ✅ **M4 — Wind core** (13, 14, 16): `windAt(x, y, t)` implements the shear profile
  exactly as specced — `shelterTopAt(x)` (a `roughAt`-scaled wave-amplitude estimate)
  plus a `smoothstep` ramp over `WIND_RAMP` (220px) of altitude, times a 3-component
  `gustAt` modulation, times a small open-ocean `distBoost`. `rollWind()` picks
  `{base, dir, gustAmp}` per run in `startRun()` (mostly tailwind, occasional headwind
  day). `stepPhysics`'s fly-state drag and glide lift now act on **air-relative**
  velocity (`rvx = run.vx - windAt(...) * st.sail`), so tailwinds push instead of only
  ever slowing the fish down. Every `FISH[]` entry got a `sail` stat (Volador highest,
  Don Atún lowest) feeding `stats().sail`. Visualization: altitude-layered wind-streak
  particles (`stepWindStreaks`/`drawWindStreaks`), cloud drift / bunting flap / umbrella
  flutter all keyed to `wind.base`, an HUD wind chip, and a start-of-run hint on windy
  days. `tests/wind.mjs` is a pure numeric regression test (no browser) verifying the
  shelter/gust math and that low skims stay within ~10% of calm distance while high arcs
  show a clear tailwind > calm > headwind ordering — confirms the "rebalance so calm-day
  distances stay comparable" goal is met by the shelter mechanic itself, with no
  `LAUNCH_BASE` changes needed.
- ✅ **M5 — Wind content** (15, 17, 18): Velero the Sailfish is FISH[]'s 6th entry
  (`sail: 1.6`, the highest; `minSkim: 320`, the highest — clumsy without wind, a rocket
  with it), with a new `shape: 'sail'` dorsal-fin variant in `drawFishShape` and a
  generated portrait. Gust fronts and thermal columns (`spawnGustsAhead`/
  `spawnThermalsAhead`) spawn distance-seeded exactly like food; a gust wall gives a
  temporary `gustBoostT`-driven wind spike (folded into `windAt` as `gustFrontBoost`)
  with a shimmer visual and whoosh cue; thermals apply `thermalLiftAt` (a bell curve in
  x and altitude, strongest around mid-height) with a wavy warm-tinted visual. Kite Fins
  is `UPGRADES`' 6th row: `stats().sail` gets +10%/level as before, and a new
  `headwindSoften` term (up to −25% headwind bite at max level) specifically softens bad
  wind days — the two halves of the plan's "raises tailwind pull, softens headwind
  penalty" description. Continuous wind-whoosh audio (`updateWindAudio`): a looped noise
  buffer through a bandpass filter, gain/frequency tracking air-relative speed × altitude
  in real time, silenced on `beginSink()`.
- Everything in Phase D (19-20) is still as originally planned below, untouched.

---

## Where the code stands today (anchors for everything below)

| Area | Anchor |
|---|---|
| Physics (fixed 240 Hz) | `stepPhysics(dt)` — fly-state drag/gravity/lift, water contact & skip bounce |
| Water surface | `surfaceAt(x, t)` → `{ y, slope, vy, rough }`, components in `rollWaves()` |
| Rendering | `render()` → `drawSky` → `drawSea(pal)` → `drawBeach` → `drawLuchador` → `drawFish` → `drawFoods` → `drawParticles` |
| Colour zones | `ZONES` + `paletteAt(x)` (beach → open water → dark ocean), `OPEN_OCEAN = 22000` |
| Fish stats | `FISH[]` (`power, bounce, drag, lift, minSkim, seaLegs, waveGrip, size`), merged with shop levels in `stats()` |
| Shop / save | `UPGRADES`, `upCost()`, `save` in localStorage (`oceanskips-save-v2`), `persist()` |
| Particles | flat `particles[]` `{x,y,vx,vy,life,maxLife,size,color,grav}` + `puff/splash/sparkle` helpers |

The sea today is a 2-stop linear gradient with a foam line and whitecap flecks
(`drawSea`). Flight drag acts on **absolute** velocity — there is no air movement at all.
That's the seam the wind system plugs into.

---

## Phase A — Nano Banana asset pipeline (features 1–4)

Nano Banana is Google's image model served on OpenRouter as
`google/gemini-2.5-flash-image` (higher-quality option: `google/gemini-3-pro-image-preview`,
"Nano Banana Pro"). Generation happens **at dev time only** — the shipped game stays
offline.

### 1. Art generation script `tools/gen-art.mjs`
Node script that reads a prompt manifest and calls OpenRouter's chat-completions API with
image output, saving each result as PNG:

```js
const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
             'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-2.5-flash-image',
    modalities: ['image', 'text'],
    messages: [{ role: 'user', content: PROMPT }],
  }),
});
const dataUrl = (await res.json()).choices[0].message.images[0].image_url.url; // base64 PNG
```

Manifest entries: id, prompt, target size, post-process steps. Re-runnable per-asset so a
single texture can be iterated without regenerating the whole set.

### 2. Post-processing & single-file inlining
Nano Banana doesn't emit alpha channels reliably, so every sprite prompt requests a solid
`#00ff00` background; the script chroma-keys it to transparency, trims, downsizes, encodes
to WebP, and writes a generated `assets.js` block — a `const ASSETS = { caustics: 'data:image/webp;base64,…', … }`
section pasted into `index.html`. Budget: **≤ 300 KB total** inlined, so load time stays
instant. Runtime decodes each entry once into an `Image`/offscreen canvas at boot.

### 3. Generated texture set for the ocean
The water overhaul (Phase B) consumes these:
- **tileable caustics tile** (seamless, monochrome, ~256×256) — two copies scroll for the caustic layer
- **foam brush stamps** (3–4 variants) for crests and skip trails
- **bubble sprites** (small highlight-shaded spheres, 3 sizes)
- **kelp / seagrass frond strips** (tall, chroma-keyed) for the plant beds
- **soft light-ray brush** (long vertical gradient streak) for god rays
- **sky/horizon backdrops** per zone (beach fiesta, open water, dark ocean sunset) used as
  wide parallax strips behind the existing procedural sky

### 4. Fish portrait card art
Replace the tiny canvas thumbnails on the menu cards (`drawFishShape` into each card's
canvas) with Nano Banana portraits — one per fish, consistent "beach fiesta sticker"
style prompt, chroma-keyed. Keep `drawFishShape` as the automatic fallback if an asset is
missing, and keep it for the in-game fish (gameplay readability beats detail at 40 px).

---

## Phase B — High-definition living water (features 5–12)

### 5. Deep multi-stop water gradient
`drawSea` upgrades from 2 stops to a 5-stop gradient per zone (`surface glow → shallow
teal → mid → deep → abyss`), with the stop table added to each `ZONES` entry and blended
by `paletteAt(x)`. Add a faint horizontal banding overlay (2–3 translucent bands that
follow the swell with reduced amplitude) so the water reads as volume, not a flat fill.

### 6. Animated caustics
Below the surface line, composite the caustics tile twice (`globalCompositeOperation:
'lighter'`, low alpha) scrolling at different speeds/scales, masked to the sea polygon
already built in `drawSea`, with slight x-parallax vs `cam.x`. Fade caustics out with
depth and with distance (dark ocean zone gets almost none). Procedural fallback: two
warped sine-grids if the asset fails to decode.

### 7. God rays (crepuscular shafts)
4–6 translucent wedges from the sun position (already implied by `drawSky`'s palette)
angled into the water, drawn with the light-ray brush, masked below the surface, alpha
pulsing slowly out of phase. Strongest in the clear beach/open-water zones; they narrow
and dim toward `OPEN_OCEAN`.

### 8. Bubble systems
Extend the particle system with a `kind: 'bubble'` (rises, wobbles via per-particle phase,
pops at `surfaceAt` into a micro-foam fleck):
- **ambient seep columns** — 2–3 lazy bubble columns per screen, denser near plants
- **skip bursts** — each skip's `splash()` also emits underwater bubbles at the contact point
- **sink trail** — replace the plain sink particles at `stepPhysics` sink-state with proper
  wobbling bubbles rising past the camera

### 9. Swaying water plants
Kelp/seagrass beds anchored to a pseudo-seabed band (fixed depth below calm water,
visible in shallow zones). Each plant is a chain of 4–6 segments; segment sway =
`sin(time·f + phase + x·k)` weighted toward the tip, with amplitude driven by local
`surfaceAt(x,t).vy` so the swell visibly drags the plants. Drawn from the frond assets
(procedural bezier fallback), behind the fish, in front of the gradient. Density per zone:
lush near the beach, occasional deep-kelp silhouettes far out.

### 10. Surface foam upgrade
Replace the plain white crest arcs/flecks in `drawSea` with foam-brush stamps on cusped
crests (the existing second-difference cusp detector picks the spots), and add
**persistent foam patches**: each skip leaves a foam blob record `{x, born}` that rides
`surfaceAt`, spreads, and fades over ~2 s — a readable trail of your skip chain.

### 11. Sun-glint sparkle band
A band of small specular glints on wave faces oriented toward the sun (reuse
`s.slope` sign), twinkling by hashing `(x, t)` — cheap, no assets, huge "HD water" payoff.

### 12. Underwater sink-cam polish
The camera already follows the fish down in the sink state. Add: depth-fog vertical
gradient overlay, caustic dapples projected onto the fish sprite (multiply the caustics
tile at low alpha over `drawFish`), rays continuing underwater, and plants/bubbles
visible drifting past — make the run's ending a moment instead of a fade.

---

## Phase C — Simulated wind (features 13–18)

Design intent (as requested): **fish catch more wind on higher arcs and in higher air,
and less when shallow above the waves** — a boundary-layer shear profile.

### 13. Wind model core — `windAt(x, y, t)`
Per-run wind state rolled in `startRun()`: `{ base, gustAmp, dir }` (dir = tail/head,
mostly tailwind with occasional headwind days). Horizontal wind at a point:

```
shelter(y) = smoothstep(shelterTop(x), shelterTop(x) + RAMP, y)   // 0 near waves → 1 aloft
shelterTop(x) ≈ waveAmp(x) · 1.5           // rougher sea = deeper sheltered layer (roughAt)
gust(x, t)  = 1 + gustAmp · Σ sin(t·sᵢ + x·kᵢ + pᵢ)               // summed sines, like rollWaves()
windX(x,y,t) = base · dir · shelter(y) · gust(x, t)
```

No libraries; same trick as the wave stack. Wind also strengthens slightly with distance
(the open ocean blows harder) via a `roughAt`-style ramp.

### 14. Wind-coupled flight physics
In `stepPhysics` fly state, drag switches from absolute to **air-relative** velocity:

```js
const wx = windAt(run.x, run.y, time) * st.sail;
const rvx = run.vx - wx, rvy = run.vy;
const rsp = Math.hypot(rvx, rvy);
const dragF = st.drag * rsp * 0.0016 * dt;
run.vx -= rvx * dragF;  run.vy -= rvy * dragF;
```

A tailwind now *pushes* the fish toward wind speed instead of only ever slowing it — so a
high, floaty arc in strong wind genuinely carries farther, while a low skim inside the
sheltered layer flies on raw launch power. Glide lift (`st.lift`) also switches to
relative airspeed, which makes the flying fish love tailwinds. Rebalance pass on
`LAUNCH_BASE`/drag afterward so old distances stay comparable on calm days.

### 15. New fish — Velero the Sailfish
Sixth `FISH[]` entry built around the new stat: huge `sail` (catches everything), long
`minSkim`, modest `bounce` — the "ride the sky" pick on windy days, clumsy on calm ones.
Every existing fish gets a tuned `sail` (Volador high, Don Atún low, default 1.0).
Card, blurb, and Nano Banana portrait included.

### 16. Wind visualization
- **wind-streak particles** layered by altitude: fast horizontal streaks up high, calm near
  the surface — the shear profile made visible so players learn it without reading anything
- ambient tie-ins: cloud drift speed (`initClouds` movement), bunting flap rate in
  `drawPicado`, umbrella flutter in `drawBeach` all keyed to `base` wind
- **HUD wind chip** next to the speed chip: `💨 ← 18` with arrow for direction, plus a
  one-line hint on windy runs ("Strong tailwind — fly HIGH!")

### 17. Gust events & thermals
Occasional telegraphed events during flight: a **gust front** (visible shimmer wall +
rising whoosh, temporary `base` spike) and **thermal columns** over marked warm patches
(shimmering updraft that adds a gentle `+vy` while inside, strongest at mid-altitude).
Both spawn from the same distance-seeded generator as food so runs stay fair.

### 18. Shop upgrade "Kite Fins" + wind audio
New `UPGRADES` row (5 levels, standard `upCost` curve): each level raises effective
`sail` on tailwinds and softens headwind penalty — the meta hook that makes wind a
progression axis. Audio: filtered-noise whoosh (WebAudio buffer + biquad, same `sfx`
pattern) whose gain tracks air-relative speed × altitude, so high wind-riding *sounds*
fast.

---

## Phase D — Meta & performance (features 19–20)

### 19. Big Air scoring + daily wind
- **Big Air**: track apex height per hop; hops clearing thresholds pop "Big Air! +🟡"
  bonuses (food payout), rewarding the risky high arcs that wind makes attractive —
  risk/reward vs the belly-flop penalty already in the bounce code.
- **Daily wind**: seed `{base, dir}` from the date (deterministic hash) and show it on the
  menu — "Today: fresh tailwind 💨💨" — so every day plays differently and best-distance
  chasing has texture. Calm-day baseline keeps records honest.

### 20. Performance & quality tiering
The new layers must hold 60 fps on mid phones:
- render caustics/rays/gradient bands to cached offscreen canvases, composite per frame
- global particle cap with priority eviction (bubbles die before gameplay splashes)
- auto quality scaler: if smoothed frame time > 20 ms, drop caustics second layer → rays →
  ambient bubbles, in that order; restore when headroom returns
- `prefers-reduced-motion`: skip streaks/gust shimmer, keep gameplay-critical feedback
- keep the existing DPR cap of 2; measure with the fixed-step guard already in `frame()`

---

## Suggested build order

| Milestone | Features | Why this order |
|---|---|---|
| M1 — Pipeline | 1, 2 | Everything visual depends on assets landing in-file |
| M2 — Water core | 5, 6, 11, 10 | Biggest visible jump, no gameplay risk |
| M3 — Water life | 8, 9, 7, 12, 3 | Layers on M2's masks and caches |
| M4 — Wind core | 13, 14, 16 | Physics + the visualization that teaches it, tuned together |
| M5 — Wind content | 15, 17, 18, 4 | Fish, events, shop, card art |
| M6 — Meta & perf | 19, 20 | Scoring/balance last, perf gate before ship |

Each milestone ends with a device pass: iPhone landscape (the PR #1 no-zoom fixes make
this testable), a low-end Android, and desktop.

## Risks & mitigations

- **Asset weight vs single-file goal** — WebP + strict 300 KB budget; every asset has a
  procedural fallback, so the game never breaks if art is trimmed.
- **Nano Banana transparency/tileability** — chroma-key workflow for alpha; for the
  caustics tile, generate oversized and mirror-wrap the edges in post to guarantee seams.
- **Wind rebalance breaking saved bests** — keep calm-day physics within ~5 % of current
  distances; bests live in `save.best` and stay meaningful.
- **Frame budget** — feature 20 is the gate: no visual layer merges without its cache +
  eviction path.

# OceanSkips — Flying Fish & Deeper Gameplay (15 points)

Target: raise the fish and luchador to the same procedural-vector fidelity as
the water around them, and give the "quite flat" gameplay real depth — a
scoring spine (skip combos), risk/reward (hazards, near-misses, sweet
landings), a second input verb (backflips), a second currency (pearls) that
fixes the dead upgrade economy via fish unlocks, session structure
(missions), and a results screen worth reading (breakdown + medals). All 15
points are complete.

## Progress

- ✅ **Point 1 — Fish silhouettes** (`drawFishShape`, `index.html`): six
  distinct bezier-profile bodies replacing the old shared ellipse — forked
  tail for slim/wing, torpedo snout for dart, a deep tuna body with yellow
  finlets for tank (previously had **no** branch at all and fell through to
  the generic shape), a bill + tall ribbed sail for sail, a round puff with
  animated spike length. 5-stop shading gradient, gill-cover arc, hash01-
  placed scale glints. Added `opts.silhouette` (flat dark fill) — kept the
  exact `drawFishShape(c, f, t, opts)` signature specifically so point 11's
  locked-fish cards could reuse it.
- ✅ **Point 2 — Secondary animation**: squash & stretch (`run.squashT`, set
  on swing contact and every bounce), speed-scaled body stretch, per-fish
  blink cadence (`isBlinking`), pupils that glance toward nearby food
  (`nearestFoodDy`), wide nervous eyes when slow and low over the water, an
  open-mouth tell while boosting.
- ✅ **Point 3 — Motion trail, speed lines, boost flame**: `run.trail`
  (fixed-cadence sampled, not every physics tick) drawn as a tapered
  polyline; `SPEED_LINES_MIN`-gated streaks; a drawn two-layer chili-flame
  cone (`drawBoostFlame`) replacing the old random-dot boost particles — all
  strokes, not particles, so `PARTICLE_CAP` is untouched (confirmed by
  point 15's live test).
- ✅ **Point 4 — Luchador rebuild** (`drawLuchador`): a proper multi-limb
  figure — bent-knee stance with a crouch that deepens into the coil, two
  tapered arms both gripping the bat (`drawLimb`), a rounded serape with a
  wind-driven hem, a mask with trim and pupils that track the falling fish,
  a sombrero with swaying tassels. `luchadorPose()` centralizes the
  arm/bat/crouch/lean angles across the whole swing timeline.
- ✅ **Point 5 — Swing staging**: anticipation while waiting, a coil that
  deepens just before release, a fast strike with a two-ghost motion smear,
  an elastic follow-through overshoot. Contact adds hitstop (`hitstopT`,
  freezes `stepPhysics` for a beat while camera shake/dust keep animating),
  a decaying `camShake` baked into `w2sx`/`w2sy` so every layer shakes
  together, an expanding hit ring (`hitRing`), and sand kicked up at the
  feet. Both skip under `prefers-reduced-motion`.
- ✅ **Point 6 — Skip-combo multiplier**: `run.combo`/`comboBest`; `mult()`
  steps up by one every `COMBO_TIER` (4) clean skips, capping at ×5. Applies
  to food pickups and the Big Air bonus. Belly-flops and (later) hazard
  hits break it via a shared `breakCombo()`. `tests/combo.mjs`.
- ✅ **Point 7 — Sweet landings**: a grazing contact on a genuine downslope
  in the direction of travel (`s.slope < 0` — verified the sign convention
  empirically against `surfaceAt(x±ε)` before wiring this up) keeps speed
  and doubles combo credit, telegraphed with a faint shimmer over qualifying
  wave faces while descending.
- ✅ **Point 8 — Tap-to-flip**: splits the one flight input verb in two — a
  quick tap (`TAP_MS`) starts a backflip (`run.flip`, one queueable), a hold
  still boosts (now gated behind `TAP_MS` so a tap can't also nibble
  energy). Landing 15-85% through a flip is forced into belly-flop
  treatment. `tests/tricks.mjs` (airtime-vs-`FLIP_DUR` numeric sanity check
  + live tap/hold discrimination).
- ✅ **Point 9 — Hazards + near-misses**: buoys (bob on the wave) and
  seagulls (cruise a fixed altitude band, drift against travel direction)
  via `spawnHazardsAhead()`, cloning the distance-seeded spawner pattern
  used by food/gusts/thermals — the first things in the game that can
  actually go wrong outside of losing speed. A hit breaks combo + shakes
  the camera; flying within `NEAR_MISS_R` of an unhit hazard pays out once.
  `tests/hazards.mjs`.
- ✅ **Point 10 — Pearls + chili pepper**: `save.pearls`, a sparse second
  currency placed in risky spots (high near a thermal, just past a hazard,
  on a crest tip) — direct-contact pickup only, no magnet. The chili pepper
  is a rare full-refill + free-boost pickup (`run.freeBoostT`).
- ✅ **Point 11 — Fish unlock progression + save v3**: only Chispa starts
  unlocked; Volador/Rayo unlock automatically (best distance / skips in one
  run, `checkUnlocks()`), Globo/Don Atún/Velero cost 8/18/30 pearls from the
  menu. Save key bumps `v2` → `v3` for the `unlocked` map; migration
  grandfathers in whichever fish was already selected (v2 had them all
  free), keeps every other field, and persists immediately — the v2 key is
  left untouched on disk for rollback. Locked cards render as a silhouette
  via point 1's `opts.silhouette`. `tests/save-migration.mjs`.
- ✅ **Point 12 — Missions**: a 12-entry pool, 3 slots active at once
  (`save.missions`), evaluated continuously during flight so a completed
  mission pays out immediately and is swapped for the next pool entry via a
  deterministic cursor (`save.missionCursor`) — not a random reroll, so
  tests can predict what's next. Compact menu panel + results recap.
- ✅ **Point 13 — Results screen rework**: a staggered-in breakdown table
  (skips w/ best combo, tricks, sweet skips, near-misses, Big Air, food,
  pearls), each row tagging a fresh personal best against `save.records`. A
  run score maps to a drawn bronze/silver/gold medal (`drawMedal`,
  ribbon+star on a small canvas) and `pickTitle()` is medal-aware.
- ✅ **Point 14 — Mariachi loop + pause**: `scheduleMusic()` is a lookahead
  scheduler (100ms tick, 220ms lookahead in real audio-clock time) on top of
  the existing `tone()`/`noiseBurst()` delay param — bass + offbeat clap
  always play, melody joins at combo ×3, a bright lead at ×5. `paused` is a
  flag, not a new state string: `frame()` skips time/physics/spawners but
  keeps rendering + a dimmed "PAUSA" overlay. ⏸/🎵 corner buttons, Escape
  toggles pause during flight, any press resumes.
- ✅ **Point 15 — Balance + ship**: `upCost`'s base bumped 20 → 65 — the
  combo multiplier (points 6-10) roughly tripled average per-run food
  income (combo-scaled pickups, Big Air, near-misses, tricks all stacking
  against an economy tuned for a flat "+1 per orb"), which had cut a maxed
  upgrade track from ~24 runs down to ~8-10; this retargets ~25-35 runs per
  track under the new rate. `tests/perf.mjs` gained a live check that
  `particles.length` never exceeds `PARTICLE_CAP` under a dense field of
  hazards/pearls/chilis while boosting (trail/speed-lines/flame are drawn
  as strokes specifically so they can't touch that budget).

## Debug API additions

`window.OceanSkips` grew alongside every point above: `combo`/`mult`/
`comboBest`/`sweetSkips` and `tricks`/`flip`/`flipQueue`/`nearMisses`/
`pearls`/`freeBoostT`/`bigAir`/`missionsCompleted` on `snapshot`; `hazards`
+ `spawnHazard()`; `pearls`/`chilis`/`savePearls` + `spawnPearl()`/
`spawnChili()`; `save`/`fishList`/`grantPearls()`; `MISSIONS`/
`checkMissions`/`missions`/`setActiveMissions()`; `runScore`/`medalFor`/
`MEDALS`/`records`; `paused`/`togglePause`/`musicNextBeatTime`/`setCombo()`.

## Verification

All 11 test files pass (`tests/*.mjs`): the pre-existing 7
(`waves`/`wind`/`boost` pure numeric, `layout`/`wave-render`/`perf`/`audio`
headless via playwright-core) plus 4 new (`combo`, `tricks`, `hazards`,
`save-migration`), with `audio.mjs` and `perf.mjs` extended in place. Manual
screenshot passes confirmed: the six-fish silhouette lineup (locked and
unlocked), luchador pose across the full swing timeline, hazard/pearl/chili
art, the paused overlay, and the reworked results screen with a drawn medal.

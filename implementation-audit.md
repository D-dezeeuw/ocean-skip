# OceanSkips — Audit Fixes & Reveal Pass

An audit of the shipped build (empirical run measurements + a code-level
sweep) found that the game's problem was not missing content but that most
of the content and simulation detail that already existed was either
unreachable, invisible, or quietly broken. This pass fixes the defects and
surfaces the dormant detail. It deliberately does **not** rescale distance or
change core physics balance — see "Deferred" below.

## What the audit measured

- A typical run is **~103m / ~9 seconds**. One wave level spans 250m and the
  intro ramp alone spans 1000m, so an average run covers **~4% of one wave
  cycle**. Five of the ten hand-designed sea states are effectively
  unreachable.
- Runs end from geometric speed decay in **dead-calm water** (roughness 0.52
  at the point of death, against a curve that climbs to 2.8). The difficulty
  ramp is never experienced.
- The `sweetSkips` mechanic fired **0 times across six runs**.
- All three optional quality layers were **off after 4 seconds of flight**.

## Fixed

| Defect | Detail |
|---|---|
| **Save merge trap** | `save.records` / `save.missions` were taken wholesale from disk instead of deep-merged. Adding a record key would load as `undefined` for existing players, and `n > undefined` is false — the record could never fire. Stale mission ids were never dropped, permanently starving a slot. |
| **Quality scaler degraded permanently** | Judged frame health on absolute thresholds (drop >20ms, restore <14ms). A perfect 60Hz frame is 16.7ms — inside that dead band — so one hitch stripped a layer for the rest of the session, and a 30Hz device stripped all three immediately. Now measures the display's own refresh interval during a warmup and judges relative to it. |
| **Sweet skips unreachable** | Required a face steeper than 0.05; no wave in the opening ~600m exceeds 0.043. Threshold is now a 0.012 deadzone that only excludes flat/rising water, leaving the grazing-contact check as the skill gate. Measured after: **24% of skips are sweet**. |
| **Wind readout was static** | The HUD chip read `wind.base`, the day's constant, so it never moved during a run regardless of altitude or gust fronts. Now samples `windAt()` at the fish's position and highlights when the fish is catching most of it. |
| **Capped-upgrade trap** | Globo's bounce hits the 0.92 clamp at Rubber Belly 3, so levels 4-5 cost 2,035 food for no effect while pips filled normally. The shop now compares real `stats()` output across a hypothetical purchase and marks such levels CAPPED — general, not a Globo special case. |
| **Big Air scored nothing** | `runScore` ignored `run.bigAir` despite the results screen showing it, tracking a record for it, and having a mission for it. It now scores; the breakdown separates scored skill rows (with point values) from earned currency. |

## Revealed

- **Sea-state names.** `WAVE_LEVELS` carried hand-written names nothing ever
  read. The sea is now named by *roughness* rather than level index, which is
  what makes the names reachable — the discrete level table doesn't start
  until 1000m, but `roughAt()` climbs smoothly through the intro ramp.
  Announced forward-only so the cycle sawtooth doesn't produce "calmer now"
  banners.
- **The power lane.** Full wind (`shelterTopAt`+`WIND_RAMP`), peak thermal
  lift (`MID_ALT` 260), Big Air (`BIG_AIR_Y` 260) and the pearl spawn band
  all key off the same altitude — a designed high-risk/high-reward lane that
  was drawn nowhere, in a game with no altitude readout at all.
  `drawPowerLane()` marks its lower edge and lights up while the fish is in it.
- **Records screen.** `save.records` was tracked from the day it was added and
  displayed nowhere; it only decided whether to stamp NEW RECORD on a results
  row.

## Tests

13 suites, 250 checks, all passing. Two new files (`economy.mjs`,
`reveal.mjs`) cover the upgrade curve, cap detection, run scoring, medal
thresholds, sea-state naming, the power lane and the records screen — the
economy and scoring surfaces previously had **zero** coverage. Regressions
were added for each fixed defect, including the 60Hz dead band, the 30Hz
false-strip, and sweet-skip reachability.

## Follow-up: skip-chain feel

Reported after the pass above: *"the fish bounces degrades too fast, it goes
from one bounce to skipping along the water until fatigue."* Measured hop
apexes confirmed it exactly — **327 → 107 → 33 → 10 → 2px**, then ~2px for the
remaining fifteen skips. The fish was sliding on the surface for roughly 80%
of every run.

Cause: restitution scales the *normal* velocity component by `e` (0.58) on
every bounce, so hop height decays as `e² ≈ 0.34×` per skip and nothing ever
replenishes it. The "keep shallow grazes lively" floor worked out to ~75 px/s,
which is a 1.9px hop.

Fix: a real planing contact is thrown back up by the water it displaces, so
the rebound is now set by how fast the fish is travelling *now* rather than by
whatever vertical velocity survived the previous impact (`SKIM_LIFT`). The
falloff exponent is deliberately sub-linear (0.65) — a linear falloff still
left the tail of each run as 2px slides, because lift faded exactly as fast as
the speed driving it.

Measured after: **322 → 97 → 32 → 28 → 26 → 22 → 19 → 16 → 13 → 11 → 8px** —
a gradual fade with no cliff. Average distance rose 103m → 174m (+69%) while
food per run went slightly *down* (150 → 132), so the economy did not inflate.

`SWEET_SKIP_STEEP` had to be retuned 0.28 → 0.38 as a consequence: real arcs
mean steeper contact angles, and the old threshold sat below the entire new
distribution (median 0.41), which would have made sweet skips unreachable a
second time. Sweet skips now fire on ~6% of skips *when the boost-dive is
used*, and none when coasting — the dive is the agency.

`tests/skip-feel.mjs` guards the shape of the decay rather than any single
value, which is the only kind of test that would have caught the original bug.

## Deferred (deliberately)

- **Distance rescale.** Partly relieved by the skip-feel fix above, which
  lifted typical runs from ~103m to ~174m without touching any threshold. The highest-value remaining change: compressing the
  distance scale so a run genuinely crosses several named sea states. Not
  done here because it redefines every stored number — best distances,
  unlock thresholds (250m), mission targets (200m/400m) and medal cutoffs.
  Until it lands, a typical run is named by one or two sea states rather than
  a full journey.
- **Speed economy.** Making sweet skips *restore* speed rather than nudge it,
  turning the decay curve into a sustainable flow state.
- **Daily Ocean / seeded runs.** Needs a seeded PRNG at ~10 spawner sites
  *and* `effectiveWavelen` decoupled from viewport width — the wave field's
  shape currently depends on the player's screen size, so two players on
  different devices do not share an ocean.

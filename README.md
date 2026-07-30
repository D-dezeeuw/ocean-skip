# OceanSkips 🐟🎉

A festive beach-fiesta take on stone skipping: a luchador bats a fish across
the ocean, and you skip it as far as the open sea will let you.

The whole game is one `index.html` — no build step, no dependencies, no
network. Open the file in a browser or serve it with GitHub Pages. Works
offline; designed for landscape mobile.

**Play it:** https://d-dezeeuw.github.io/ocean-skip/

## How it plays

1. Pick a fish — Chispa the sardine starts unlocked; the other 5 unlock by
   playing (best distance, skips in one run) or by spending pearls 🦪.
2. Tap once — the luchador tosses the fish up.
3. Tap again to swing the bat. Contact height sets the launch angle
   (early = steep, late = flat); closeness to the sweet-spot ring sets power.
4. In flight: hold anywhere to boost 🌶️ while the energy meter lasts (dive
   to aim your landing spot), or a quick tap instead throws a backflip 🌀.
   Golden fish-food spheres refill energy and bank as shop currency.
5. Wave slope tilts every bounce; a grazing landing on a downslope is a
   "sweet skip" that keeps your speed and combo. Drop below the fish's
   minimum skim speed and it sinks — the sea gets darker and rougher the
   farther you fly.
6. Watch for buoys and seagulls — a hit breaks your combo, but flying close
   without touching one pays out as a near-miss.
7. Skips build a combo multiplier (up to ×5) on food, Big Air, and
   near-miss rewards. Pearls turn up in risky spots — high air, past a
   hazard, on a crest tip — and are the currency locked fish cost.
8. Three missions are always active (menu) for extra food/pearls; complete
   runs earn a bronze/silver/gold medal on the results screen.
9. Watch the **power lane** — the dashed gold line marks the altitude where
   full wind, peak thermal lift, Big Air scoring and pearls all pay out.
10. The sea is named as it roughens ("Easy swell" … "Maelstrom"), and the
   Records screen tracks your bests across every skill stat.
11. Spend food in the shop on permanent upgrades (localStorage save).
   ⏸ pauses mid-flight; 🎵 toggles the combo-reactive mariachi loop.

## Code layout (single file, sectioned)

`index.html` is organised top-to-bottom: CSS/UI → fish + missions + upgrade
data → save/audio (incl. the mariachi scheduler) → wave model (`surfaceAt`)
→ zone palettes → physics (`stepPhysics`: toss, swing, boost, flip, bounce,
hazards, pickups, sink) → rendering (fish/luchador art, hazards, pearls) →
input → main loop (with pause/hitstop). All tuning constants sit in one
block near the top of the script.

See `implementation-audit.md` for the most recent pass (audit fixes plus
surfacing dormant simulation detail), `implementation-15.md` for the feature pass (higher-fidelity
fish/luchador art, combo/tricks/hazards/pearls/missions, medals, pause, and
the mariachi loop) and `implementation-20.md` for the wave/wind/audio pass
before it.

# OceanSkips 🐟🎉

A festive beach-fiesta take on stone skipping: a luchador bats a fish across
the ocean, and you skip it as far as the open sea will let you.

The whole game is one `index.html` — no build step, no dependencies, no
network. Open the file in a browser or serve it with GitHub Pages. Works
offline; designed for landscape mobile.

**Play it:** https://d-dezeeuw.github.io/ocean-skip/

## How it plays

1. Pick one of 5 fish (different power / bounce / drag / lift / sea-legs).
2. Tap once — the luchador tosses the fish up.
3. Tap again to swing the bat. Contact height sets the launch angle
   (early = steep, late = flat); closeness to the sweet-spot ring sets power.
4. In flight, hold anywhere to boost 🌶️ while the energy meter lasts.
   Golden fish-food spheres refill energy and bank as shop currency.
5. Wave slope tilts every bounce; drop below the fish's minimum skim speed
   and it sinks. The sea gets darker and rougher the farther you fly.
6. Spend food in the shop on permanent upgrades (localStorage save).

## Code layout (single file, sectioned)

`index.html` is organised top-to-bottom: CSS/UI → fish + upgrade data →
save/audio → wave model (`surfaceAt`) → zone palettes → physics
(`stepPhysics`: toss, swing, boost, bounce/sink) → rendering → input →
main loop. All tuning constants sit in one block near the top of the script.

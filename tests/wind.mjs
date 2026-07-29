#!/usr/bin/env node
// Pure numeric unit test of the wind model + air-relative flight drag
// (implementation-20.md Phase C, features 13-14). Mirrors index.html's
// windAt/shelterTopAt/roughAt formulas exactly — no browser, no rendering.
//
// Run: node tests/wind.mjs
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const G = 1500, ROUGH_DIST = 6500, ROUGH_MAX = 3.4, CALM_START = 0.6, CALM_DIST = 2200;
const WIND_WAVE_AMP = 22, WIND_RAMP = 220;

function roughAt(x) {
  const u = Math.max(0, x) / ROUGH_DIST;
  const base = 1 + (ROUGH_MAX - 1) * (u / (u + 2));
  const t = clamp(x / CALM_DIST, 0, 1);
  const ease = CALM_START + (1 - CALM_START) * t * t * (3 - 2 * t);
  return base * ease;
}
function smoothstep(e0, e1, y) { const t = clamp((y - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
function shelterTopAt(x) { return roughAt(x) * WIND_WAVE_AMP; }
function gustAt(x, t, wind, comps) {
  let s = 0;
  for (const c of comps) s += c.w * Math.sin(t * c.s + x * c.k + c.p);
  return 1 + wind.gustAmp * s;
}
function windAt(x, y, t, wind, comps) {
  const top = shelterTopAt(x);
  const shelter = smoothstep(top, top + WIND_RAMP, y);
  const distBoost = lerp(1, 1.3, clamp((roughAt(x) - 1) / (ROUGH_MAX - 1), 0, 1));
  return wind.base * distBoost * wind.dir * shelter * gustAt(x, t, wind, comps);
}

// Simulate a launch: fixed 240Hz integrator matching stepPhysics' fly-state
// math (drag + gravity only — no water contact; this isolates the
// wind/drag coupling itself, not the bounce/skip system).
function simulate({ launchSpeed, angleDeg, drag, sail, wind, comps, maxT = 6 }) {
  const FIXED = 1 / 240;
  let x = 150, y = 112, t = 0;
  const a = angleDeg * Math.PI / 180;
  let vx = Math.cos(a) * launchSpeed, vy = Math.sin(a) * launchSpeed;
  let apex = y;
  while (t < maxT) {
    const wx = windAt(x, y, t, wind, comps) * sail;
    const rvx = vx - wx, rvy = vy;
    const rsp = Math.hypot(rvx, rvy);
    const dragF = drag * rsp * 0.0016 * FIXED;
    vx -= rvx * dragF;
    vy -= rvy * dragF;
    vy -= G * FIXED;
    x += vx * FIXED;
    y += vy * FIXED;
    apex = Math.max(apex, y);
    t += FIXED;
    if (y <= 0 && vy < 0) break; // hit calm water level — end of this simplified flight
  }
  return { dist: x - 150, apex };
}

const calmWind = { base: 0, dir: 1, gustAmp: 0 };
const noGustComps = [{ w: 0, s: 1, k: 0.001, p: 0 }];

let failures = 0;
function check(label, cond, detail) {
  if (!cond) { failures++; console.error(`FAIL: ${label} — ${detail}`); }
  else console.log(`ok: ${label}`);
}

// 1) With wind.base = 0, dir/gustAmp must not matter — output must be identical.
const base0a = simulate({ launchSpeed: 900, angleDeg: 30, drag: 0.10, sail: 1.0, wind: { ...calmWind, dir: 1 }, comps: noGustComps });
const base0b = simulate({ launchSpeed: 900, angleDeg: 30, drag: 0.10, sail: 1.0, wind: { ...calmWind, dir: -1, gustAmp: 0.9 }, comps: noGustComps });
check('wind.base=0 is dir/gust-invariant', Math.abs(base0a.dist - base0b.dist) < 1e-6,
  `dist ${base0a.dist} vs ${base0b.dist}`);

// 2) A LOW, flat skim (small angle, low apex) should barely be affected by wind,
// since shelter(y) ~ 0 near the waves regardless of how strong the wind is.
const lowNoWind = simulate({ launchSpeed: 900, angleDeg: 14, drag: 0.10, sail: 1.0, wind: calmWind, comps: noGustComps });
const lowWind = simulate({ launchSpeed: 900, angleDeg: 14, drag: 0.10, sail: 1.0,
  wind: { base: 230, dir: 1, gustAmp: 0 }, comps: noGustComps });
const lowDelta = Math.abs(lowWind.dist - lowNoWind.dist) / lowNoWind.dist;
check('low skim stays within ~10% of calm distance even with max tailwind', lowDelta < 0.10,
  `calm=${lowNoWind.dist.toFixed(0)} wind=${lowWind.dist.toFixed(0)} apex=${lowNoWind.apex.toFixed(0)} delta=${(lowDelta * 100).toFixed(1)}%`);

// 3) A HIGH arc should travel meaningfully farther with a strong tailwind than
// the same arc with a strong headwind — this is the entire point of the feature.
const highTail = simulate({ launchSpeed: 900, angleDeg: 55, drag: 0.10, sail: 1.0,
  wind: { base: 230, dir: 1, gustAmp: 0 }, comps: noGustComps });
const highHead = simulate({ launchSpeed: 900, angleDeg: 55, drag: 0.10, sail: 1.0,
  wind: { base: 230, dir: -1, gustAmp: 0 }, comps: noGustComps });
const highCalm = simulate({ launchSpeed: 900, angleDeg: 55, drag: 0.10, sail: 1.0, wind: calmWind, comps: noGustComps });
check('high arc: tailwind travels farther than headwind', highTail.dist > highHead.dist,
  `tail=${highTail.dist.toFixed(0)} head=${highHead.dist.toFixed(0)} calm=${highCalm.dist.toFixed(0)} apex=${highCalm.apex.toFixed(0)}`);
check('high arc: tailwind beats calm', highTail.dist > highCalm.dist * 1.02,
  `tail=${highTail.dist.toFixed(0)} calm=${highCalm.dist.toFixed(0)}`);
check('high arc: headwind loses to calm', highHead.dist < highCalm.dist * 0.98,
  `head=${highHead.dist.toFixed(0)} calm=${highCalm.dist.toFixed(0)}`);

// 4) sail stat should scale the effect: holding every other stat fixed
// (drag included — this isolates sail specifically, not fish-to-fish
// differences), a high-sail value should show a bigger tailwind/headwind
// spread than a low-sail value.
const sailHigh = simulate({ launchSpeed: 900, angleDeg: 55, drag: 0.10, sail: 1.35,
  wind: { base: 230, dir: 1, gustAmp: 0 }, comps: noGustComps });
const sailHighCalm = simulate({ launchSpeed: 900, angleDeg: 55, drag: 0.10, sail: 1.35, wind: calmWind, comps: noGustComps });
const sailLow = simulate({ launchSpeed: 900, angleDeg: 55, drag: 0.10, sail: 0.55,
  wind: { base: 230, dir: 1, gustAmp: 0 }, comps: noGustComps });
const sailLowCalm = simulate({ launchSpeed: 900, angleDeg: 55, drag: 0.10, sail: 0.55, wind: calmWind, comps: noGustComps });
const highSpread = (sailHigh.dist - sailHighCalm.dist) / sailHighCalm.dist;
const lowSpread = (sailLow.dist - sailLowCalm.dist) / sailLowCalm.dist;
check('higher sail stat gets a bigger tailwind boost than lower sail', highSpread > lowSpread,
  `highSail spread=${(highSpread * 100).toFixed(1)}% lowSail spread=${(lowSpread * 100).toFixed(1)}%`);

// 5) sanity bound: even the strongest wind shouldn't multiply distance by
// some absurd factor (catches a sign error or unit-scale bug outright)
check('wind effect stays within a plausible range (not >2.5x, not negative)',
  highTail.dist > 0 && highTail.dist < highCalm.dist * 2.5,
  `tail=${highTail.dist.toFixed(0)} calm=${highCalm.dist.toFixed(0)} ratio=${(highTail.dist / highCalm.dist).toFixed(2)}`);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

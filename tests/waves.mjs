#!/usr/bin/env node
// Pure numeric unit test of the 10-level wave progression system. Mirrors
// index.html's WAVE_LEVELS/levelInfoAt/levelBlendAt/roughAt/surfaceAt
// exactly — no browser, no rendering.
//
// Run: node tests/waves.mjs
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const PX_PER_M = 40;

const METERS_PER_LEVEL = 250;
const PX_PER_LEVEL = METERS_PER_LEVEL * PX_PER_M;
const LEVELS_PER_CYCLE = 10;
const PX_PER_CYCLE = PX_PER_LEVEL * LEVELS_PER_CYCLE;
const CYCLE_GROWTH = 0.10;
const LEVEL_BLEND_PX = 1400;

const WAVE_LEVELS = [
  { name: 'Easy swell',      rough: 0.65, comps: [{ a: 6,  l: 420, s: 26 }] },
  { name: 'Big swell',       rough: 0.95, comps: [{ a: 15, l: 380, s: 34 }] },
  { name: 'Gentle chop',     rough: 1.05, comps: [{ a: 9,  l: 260, s: 42, q: 0.6 }] },
  { name: 'Sharp chop',      rough: 1.35, comps: [{ a: 18, l: 230, s: 48, q: 0.5 }] },
  { name: 'Chop over swell', rough: 1.55, comps: [{ a: 11, l: 520, s: 22 }, { a: 13, l: 220, s: 50, q: 0.55 }] },
  { name: 'Fast ripple',     rough: 1.70, comps: [{ a: 9,  l: 150, s: 66 }, { a: 12, l: 900, s: 24, q: 0.5 }] },
  { name: 'Ripple + chop',   rough: 1.90, comps: [{ a: 10, l: 150, s: 70 }, { a: 14, l: 420, s: 34, q: 0.5 }] },
  { name: 'Rough mix',       rough: 2.15, comps: [{ a: 12, l: 130, s: 78 }, { a: 17, l: 260, s: 52, q: 0.45 }] },
  { name: 'Heavy chaos',     rough: 2.45, comps: [{ a: 10, l: 110, s: 86 }, { a: 16, l: 210, s: 60, q: 0.45 }, { a: 9, l: 480, s: 30 }] },
  { name: 'Maelstrom',       rough: 2.80, comps: [{ a: 12, l: 95,  s: 95 }, { a: 20, l: 190, s: 66, q: 0.4 }, { a: 11, l: 430, s: 32 }] },
];
const REF_MAX_ROUGH = WAVE_LEVELS[WAVE_LEVELS.length - 1].rough;

function peakProfile(th, q) {
  const s = Math.sin(th / 2);
  const u = Math.abs(s);
  const ue = Math.max(u, 0.02);
  return { y: 1 - 2 * Math.pow(u, q), d: -q * Math.pow(ue, q - 1) * Math.sign(s) * Math.cos(th / 2) };
}
const peakOffsetCache = new Map();
function peakOffset(q) {
  let off = peakOffsetCache.get(q);
  if (off === undefined) {
    let m = 0;
    for (let i = 0; i < 64; i++) m += peakProfile((i / 64) * TAU, q).y;
    off = m / 64;
    peakOffsetCache.set(q, off);
  }
  return off;
}
function hash01(n) { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); }
let levelPhaseSeed = 42; // fixed for deterministic tests
function levelCompPhase(levelIdx, compIdx) {
  return hash01(levelIdx * 17.3 + compIdx * 5.7 + levelPhaseSeed) * TAU;
}
function levelInfoAt(x) {
  const px = Math.max(0, x);
  const cycle = Math.floor(px / PX_PER_CYCLE);
  const withinCycle = px - cycle * PX_PER_CYCLE;
  const levelIdx = Math.min(LEVELS_PER_CYCLE - 1, Math.floor(withinCycle / PX_PER_LEVEL));
  const posInLevel = withinCycle - levelIdx * PX_PER_LEVEL;
  return { cycle, levelIdx, posInLevel, mult: 1 + CYCLE_GROWTH * cycle };
}
function levelBlendAt(x) {
  const info = levelInfoAt(x);
  const distToBoundary = PX_PER_LEVEL - info.posInLevel;
  let w = 0, nextIdx = info.levelIdx, nextMult = info.mult;
  if (distToBoundary < LEVEL_BLEND_PX) {
    const t2 = 1 - distToBoundary / LEVEL_BLEND_PX;
    w = t2 * t2 * (3 - 2 * t2);
    nextIdx = info.levelIdx + 1;
    let nextCycle = info.cycle;
    if (nextIdx >= LEVELS_PER_CYCLE) { nextIdx = 0; nextCycle += 1; }
    nextMult = 1 + CYCLE_GROWTH * nextCycle;
  }
  return { levelIdx: info.levelIdx, mult: info.mult, nextIdx, nextMult, w };
}
function roughAt(x) {
  const b = levelBlendAt(x);
  const cur = WAVE_LEVELS[b.levelIdx].rough * b.mult;
  if (b.w <= 0) return cur;
  return lerp(cur, WAVE_LEVELS[b.nextIdx].rough * b.nextMult, b.w);
}
function evalLevel(levelIdx, mult, x, t) {
  const level = WAVE_LEVELS[levelIdx];
  let y = 0, slope = 0, vy = 0;
  for (let i = 0; i < level.comps.length; i++) {
    const c = level.comps[i];
    const k = TAU / c.l;
    const ph = k * x + c.s * k * t + levelCompPhase(levelIdx, i);
    const A = c.a * mult;
    if (c.q) {
      const pk = peakProfile(ph, c.q);
      y += A * (pk.y - peakOffset(c.q));
      slope += A * pk.d * k;
      vy += A * pk.d * (c.s * k);
    } else {
      y += A * Math.sin(ph);
      slope += A * k * Math.cos(ph);
      vy += A * (c.s * k) * Math.cos(ph);
    }
  }
  return { y, slope, vy };
}
function surfaceAt(x, t) {
  const b = levelBlendAt(x);
  const cur = evalLevel(b.levelIdx, b.mult, x, t);
  const curRough = WAVE_LEVELS[b.levelIdx].rough * b.mult;
  if (b.w <= 0) return { ...cur, rough: curRough };
  const nxt = evalLevel(b.nextIdx, b.nextMult, x, t);
  const nxtRough = WAVE_LEVELS[b.nextIdx].rough * b.nextMult;
  return { y: lerp(cur.y, nxt.y, b.w), slope: lerp(cur.slope, nxt.slope, b.w),
           vy: lerp(cur.vy, nxt.vy, b.w), rough: lerp(curRough, nxtRough, b.w) };
}

let failures = 0;
function check(label, cond, detail) {
  if (!cond) { failures++; console.error(`FAIL: ${label} — ${detail}`); }
  else console.log(`ok: ${label}`);
}

// 1) Level layout: each level is exactly 250m (10,000px), 10 per cycle,
// cycle is 100,000px, matching the brief exactly.
check('250m per level in px', PX_PER_LEVEL === 10000, `${PX_PER_LEVEL}`);
check('10 levels per cycle', LEVELS_PER_CYCLE === 10, `${LEVELS_PER_CYCLE}`);
check('cycle = 2500m', PX_PER_CYCLE === 100000, `${PX_PER_CYCLE}`);

// 2) Level index tracks x correctly, well clear of blend zones.
const mid = (i) => i * PX_PER_LEVEL + PX_PER_LEVEL / 2; // safely mid-level
for (let i = 0; i < 10; i++) {
  const info = levelInfoAt(mid(i));
  check(`x mid-level ${i} resolves to levelIdx ${i}`, info.levelIdx === i, `got ${info.levelIdx}`);
}
check('x just past 10 levels wraps to level 0 of cycle 1',
  levelInfoAt(PX_PER_CYCLE + 100).levelIdx === 0 && levelInfoAt(PX_PER_CYCLE + 100).cycle === 1,
  JSON.stringify(levelInfoAt(PX_PER_CYCLE + 100)));

// 3) Difficulty climbs across the 10 levels within a cycle (rough is
// non-decreasing level to level — the whole point of the redesign).
for (let i = 1; i < 10; i++) {
  check(`level ${i} rough >= level ${i - 1} rough`, WAVE_LEVELS[i].rough >= WAVE_LEVELS[i - 1].rough,
    `${WAVE_LEVELS[i].rough} vs ${WAVE_LEVELS[i - 1].rough}`);
}

// 4) Cycle scaling: level 0 in cycle 1 is exactly 10% stronger than cycle 0;
// cycle 2 is 20% stronger — "every cycle adding 10%".
const r0c0 = roughAt(mid(0));
const r0c1 = roughAt(PX_PER_CYCLE + mid(0));
const r0c2 = roughAt(2 * PX_PER_CYCLE + mid(0));
check('cycle 1 rough is +10% over cycle 0', Math.abs(r0c1 / r0c0 - 1.10) < 1e-9, `ratio=${(r0c1 / r0c0).toFixed(4)}`);
check('cycle 2 rough is +20% over cycle 0', Math.abs(r0c2 / r0c0 - 1.20) < 1e-9, `ratio=${(r0c2 / r0c0).toFixed(4)}`);

// 5) Amplitude scales the same way as rough: level 0's wave amplitude in
// cycle 1 should be ~10% bigger than in cycle 0 (sampled as peak-to-peak
// height over one wavelength, away from any blend zone).
function amplitudeAt(levelStartX) {
  let mn = Infinity, mx = -Infinity;
  for (let dx = 0; dx < 400; dx += 4) {
    const y = surfaceAt(levelStartX + dx, 0).y;
    mn = Math.min(mn, y); mx = Math.max(mx, y);
  }
  return mx - mn;
}
const ampC0 = amplitudeAt(mid(0)), ampC1 = amplitudeAt(PX_PER_CYCLE + mid(0));
check('level-0 wave amplitude is ~10% bigger one cycle later',
  Math.abs(ampC1 / ampC0 - 1.10) < 0.01, `ratio=${(ampC1 / ampC0).toFixed(4)}`);

// 6) Smooth blending: surfaceAt must not jump discontinuously across a level
// boundary — step across it in small increments and check no single step's
// height change is wildly larger than its neighbors (which would mean a
// hard pop rather than a crossfade).
{
  const boundaryX = PX_PER_LEVEL; // level 0 -> level 1
  const step = 20;
  let maxStepDelta = 0, prevY = null;
  for (let x = boundaryX - LEVEL_BLEND_PX - 200; x <= boundaryX + 200; x += step) {
    const y = surfaceAt(x, 0).y;
    if (prevY !== null) maxStepDelta = Math.max(maxStepDelta, Math.abs(y - prevY));
    prevY = y;
  }
  // component amplitudes here are ~6-18px; a single 20px step should never
  // swing height by anywhere near a full amplitude if the blend is smooth
  check('no hard pop crossing a level boundary', maxStepDelta < 12, `maxStepDelta=${maxStepDelta.toFixed(2)}`);
}

// 7) Concave levels actually produce sharper crests than sine-only levels —
// measured as kurtosis-like peakedness: max(y) should sit much closer to
// the top of the range for a cusped wave than for a plain sine (a sine's
// max is a smooth 1/4-wavelength-wide hill; a cusp's max is a narrow spike).
function peakSharpness(comps, q) {
  // fraction of samples within 5% of the peak height, over one period —
  // small fraction = sharp spike, large fraction = broad smooth hill
  const k = TAU / 300;
  let mx = -Infinity;
  const N = 400;
  const ys = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * TAU;
    const y = q ? (peakProfile(th, q).y - peakOffset(q)) : Math.sin(th);
    ys.push(y);
    mx = Math.max(mx, y);
  }
  const near = ys.filter((y) => y > mx * 0.95).length;
  return near / N;
}
const sineSharpness = peakSharpness(null, null);
const concaveSharpness = peakSharpness(null, 0.5);
check('concave (q) crests are measurably sharper than plain sine crests',
  concaveSharpness < sineSharpness * 0.6, `sine=${sineSharpness.toFixed(3)} concave=${concaveSharpness.toFixed(3)}`);

// 8) Sanity: rough never goes negative or absurd within a few cycles' reach.
for (let c = 0; c < 5; c++) {
  const r = roughAt(c * PX_PER_CYCLE + mid(9));
  check(`cycle ${c} hardest-level rough is positive and sane`, r > 0 && r < 20, `${r.toFixed(2)}`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

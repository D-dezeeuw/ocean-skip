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

// never let more than this many full wave periods fit across the current
// viewport (W, world px) — mirrors index.html's effectiveWavelen. W is a
// plain mutable test variable here (no real DOM), set per-check below.
const MIN_WAVES_PER_SCREEN = 5;
let W = 0;
function effectiveWavelen(l) {
  const minL = W > 0 ? W / MIN_WAVES_PER_SCREEN : 0;
  return Math.max(l, minL);
}

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

// slowly-varying, smoothly-interpolated value noise used to break up the
// wave field's perfect periodicity — mirrors index.html's valueNoise1D/
// roughnessMod/irregAmtFor exactly.
function valueNoise1D(x, seed) {
  const i = Math.floor(x), f = x - i;
  const a = hash01(i + seed), b = hash01(i + 1 + seed);
  const t = f * f * (3 - 2 * f);
  return { v: lerp(a, b, t), d: (b - a) * (6 * f - 6 * f * f) };
}
const WAVE_IRREGULARITY = 0.5;
function roughnessMod(x, seed, amt) {
  if (amt <= 0) return { m: 1, dm: 0 };
  const n1 = valueNoise1D(x / 820, seed);
  const n2 = valueNoise1D(x / 260, seed + 51.3);
  const v = (n1.v - 0.5) * 0.7 + (n2.v - 0.5) * 0.3;
  const dv = n1.d * (0.7 / 820) + n2.d * (0.3 / 260);
  return { m: 1 + amt * v * 2, dm: amt * dv * 2 };
}
function irregAmtFor(effRough) {
  return clamp((effRough - 1) / (REF_MAX_ROUGH - 1), 0, 1) * WAVE_IRREGULARITY;
}
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

// intro ramp: the first 1000m is one continuous, slowly-evolving swell
// (long/flat sine -> level 3's "Sharp chop") instead of 4 discrete blocks —
// only ever reached once, at the true start of a run.
const INTRO_PX = 1000 * PX_PER_M;
const INTRO_START = { a: 5, l: 1900, s: 16 };
const INTRO_TARGET = WAVE_LEVELS[3].comps[0];
const INTRO_START_ROUGH = 0.5;
const INTRO_TARGET_ROUGH = WAVE_LEVELS[3].rough;
const INTRO_CONCAVE_START = 0.4;
function smoothstep(e0, e1, y) { const t = clamp((y - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
function introParamsAt(x) {
  const w = smoothstep(0, INTRO_PX, x);
  return {
    w,
    a: lerp(INTRO_START.a, INTRO_TARGET.a, w),
    l: lerp(INTRO_START.l, INTRO_TARGET.l, w),
    s: lerp(INTRO_START.s, INTRO_TARGET.s, w),
    rough: lerp(INTRO_START_ROUGH, INTRO_TARGET_ROUGH, w),
    concaveMix: clamp((w - INTRO_CONCAVE_START) / (1 - INTRO_CONCAVE_START), 0, 1),
  };
}
function introRamp(x, t) {
  const p = introParamsAt(x);
  const k = TAU / effectiveWavelen(p.l);
  const ph = k * x + p.s * k * t + levelCompPhase(-1, 0);
  const sy = p.a * Math.sin(ph), sslope = p.a * k * Math.cos(ph), svy = p.a * (p.s * k) * Math.cos(ph);
  let y = sy, slope = sslope, vy = svy;
  if (p.concaveMix > 0) {
    const q = INTRO_TARGET.q;
    const pk = peakProfile(ph, q);
    const cy = p.a * (pk.y - peakOffset(q)), cslope = p.a * pk.d * k, cvy = p.a * pk.d * (p.s * k);
    y = lerp(sy, cy, p.concaveMix);
    slope = lerp(sslope, cslope, p.concaveMix);
    vy = lerp(svy, cvy, p.concaveMix);
  }
  const { m, dm } = roughnessMod(x, -1 * 13.7 + levelPhaseSeed * 0.021, irregAmtFor(p.rough));
  return { y: y * m, slope: slope * m + y * dm, vy: vy * m, rough: p.rough };
}

function roughAt(x) {
  if (x < INTRO_PX) {
    const introRough = introParamsAt(x).rough;
    if (x < INTRO_PX - LEVEL_BLEND_PX) return introRough;
    const w2 = smoothstep(INTRO_PX - LEVEL_BLEND_PX, INTRO_PX, x);
    return lerp(introRough, WAVE_LEVELS[4].rough, w2);
  }
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
    const k = TAU / effectiveWavelen(c.l);
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
  const { m, dm } = roughnessMod(x, levelIdx * 13.7 + levelPhaseSeed * 0.021, irregAmtFor(level.rough * mult));
  return { y: y * m, slope: slope * m + y * dm, vy: vy * m };
}
function surfaceAt(x, t) {
  if (x < INTRO_PX) {
    const intro = introRamp(x, t);
    if (x < INTRO_PX - LEVEL_BLEND_PX) return intro;
    const w2 = smoothstep(INTRO_PX - LEVEL_BLEND_PX, INTRO_PX, x);
    const nxt = evalLevel(4, 1, x, t);
    return {
      y: lerp(intro.y, nxt.y, w2), slope: lerp(intro.slope, nxt.slope, w2),
      vy: lerp(intro.vy, nxt.vy, w2), rough: lerp(intro.rough, WAVE_LEVELS[4].rough, w2),
    };
  }
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

// 4) Cycle scaling: growth is linear off the cycle-0 baseline, +10% per
// cycle — cycle 1 is baseline*1.10, cycle 2 is baseline*1.20, cycle 3 is
// baseline*1.30. (Checked directly against the level-0 rough constant
// rather than cycle 0's roughAt(), since cycle 0's "level 0" territory is
// now the intro ramp — see section 9 below for that.)
const r0c1 = roughAt(PX_PER_CYCLE + mid(0));
const r0c2 = roughAt(2 * PX_PER_CYCLE + mid(0));
const r0c3 = roughAt(3 * PX_PER_CYCLE + mid(0));
check('cycle 1 rough is baseline +10%', Math.abs(r0c1 - WAVE_LEVELS[0].rough * 1.10) < 1e-9, `${r0c1}`);
check('cycle 2 rough is baseline +20%', Math.abs(r0c2 - WAVE_LEVELS[0].rough * 1.20) < 1e-9, `${r0c2}`);
check('cycle 3 rough is baseline +30%', Math.abs(r0c3 - WAVE_LEVELS[0].rough * 1.30) < 1e-9, `${r0c3}`);

// 5) Amplitude scales the same way as rough: level 0's wave amplitude tracks
// the linear per-cycle multiplier exactly (sampled as peak-to-peak height
// over one wavelength, away from any blend zone) — cycle 2 vs cycle 1 is
// mult(2)/mult(1) = 1.20/1.10, not a flat 10% (that flat ratio only holds
// between cycle 0 and cycle 1, since growth is linear off cycle 0's baseline).
function amplitudeAt(levelStartX) {
  let mn = Infinity, mx = -Infinity;
  for (let dx = 0; dx < 400; dx += 4) {
    const y = surfaceAt(levelStartX + dx, 0).y;
    mn = Math.min(mn, y); mx = Math.max(mx, y);
  }
  return mx - mn;
}
const ampC1 = amplitudeAt(PX_PER_CYCLE + mid(0)), ampC2 = amplitudeAt(2 * PX_PER_CYCLE + mid(0));
const expectedAmpRatio = (1 + CYCLE_GROWTH * 2) / (1 + CYCLE_GROWTH * 1);
check('level-0 wave amplitude matches the linear cycle-growth multiplier',
  Math.abs(ampC2 / ampC1 - expectedAmpRatio) < 0.001,
  `ratio=${(ampC2 / ampC1).toFixed(4)} expected=${expectedAmpRatio.toFixed(4)}`);

// 6) Smooth blending: surfaceAt must not jump discontinuously across a level
// boundary — step across it in small increments and compare the worst-case
// step there against a same-width control window sampled well clear of any
// boundary (i.e. the level's own inherent wave steepness). A hard pop would
// stand out far above that baseline; a crossfade stays in the same ballpark
// (levels vary in wavelength/amplitude, so a fixed magnitude threshold isn't
// portable across boundaries — this is boundary-agnostic).
function maxStepDeltaOver(x0, x1, step = 20) {
  let maxDelta = 0, prevY = null;
  for (let x = x0; x <= x1; x += step) {
    const y = surfaceAt(x, 0).y;
    if (prevY !== null) maxDelta = Math.max(maxDelta, Math.abs(y - prevY));
    prevY = y;
  }
  return maxDelta;
}
{
  const boundaryX = 6 * PX_PER_LEVEL; // level 5 -> level 6
  const windowHalf = LEVEL_BLEND_PX / 2 + 200;
  const boundaryDelta = maxStepDeltaOver(boundaryX - windowHalf, boundaryX + windowHalf);
  const controlDelta = maxStepDeltaOver(boundaryX - PX_PER_LEVEL / 2 - windowHalf, boundaryX - PX_PER_LEVEL / 2 + windowHalf);
  check('no hard pop crossing a level boundary', boundaryDelta < controlDelta * 3,
    `boundary=${boundaryDelta.toFixed(2)} control=${controlDelta.toFixed(2)}`);
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

// 9) Intro ramp: the very start of a run should read as a long, barely-
// curved sine that only gradually shortens/steepens/gains a concave crest
// over the first 1000m — one continuous transformation, not 4 discrete
// 250m blocks — and hand off cleanly into the ordinary level system.
check('intro starts as a long "two screens" wavelength', introParamsAt(0).l > 1800, `${introParamsAt(0).l}`);
check('intro starts with tiny amplitude', introParamsAt(0).a < 6, `${introParamsAt(0).a}`);
check('intro starts calmer than level 0', introParamsAt(0).rough < WAVE_LEVELS[0].rough, `${introParamsAt(0).rough}`);
check('intro starts as a pure sine (no concave mix yet)', introParamsAt(0).concaveMix === 0, `${introParamsAt(0).concaveMix}`);
check('intro settles onto level 3\'s wavelength by the end',
  Math.abs(introParamsAt(INTRO_PX).l - WAVE_LEVELS[3].comps[0].l) < 1e-6, `${introParamsAt(INTRO_PX).l}`);
check('intro settles onto level 3\'s rough by the end',
  Math.abs(introParamsAt(INTRO_PX).rough - WAVE_LEVELS[3].rough) < 1e-6, `${introParamsAt(INTRO_PX).rough}`);
check('intro is fully concave by the end', introParamsAt(INTRO_PX).concaveMix === 1, `${introParamsAt(INTRO_PX).concaveMix}`);

// concave crest stays off through the first ~40% of the ramp, then fades in
check('concave mix is still zero a fifth of the way in', introParamsAt(INTRO_PX * 0.2).concaveMix === 0,
  `${introParamsAt(INTRO_PX * 0.2).concaveMix}`);
check('concave mix has faded in by 80% of the way in', introParamsAt(INTRO_PX * 0.8).concaveMix > 0,
  `${introParamsAt(INTRO_PX * 0.8).concaveMix}`);

// wavelength/amplitude/rough all move smoothly across the ramp — no discrete
// per-250m jumps like the old 4-level-block layout would have produced.
{
  const N = 20;
  const samples = [];
  for (let i = 0; i <= N; i++) samples.push(introParamsAt((i / N) * INTRO_PX));
  let maxWavelenStep = 0, maxAmpStep = 0;
  for (let i = 1; i < samples.length; i++) {
    maxWavelenStep = Math.max(maxWavelenStep, Math.abs(samples[i].l - samples[i - 1].l));
    maxAmpStep = Math.max(maxAmpStep, Math.abs(samples[i].a - samples[i - 1].a));
    check(`intro wavelength is non-increasing at sample ${i}`, samples[i].l <= samples[i - 1].l + 1e-9,
      `${samples[i - 1].l} -> ${samples[i].l}`);
    check(`intro amplitude is non-decreasing at sample ${i}`, samples[i].a >= samples[i - 1].a - 1e-9,
      `${samples[i - 1].a} -> ${samples[i].a}`);
  }
  // total wavelength/amplitude swing spread evenly over 20 steps — no single
  // step should account for anywhere near the whole swing (that'd mean a
  // block jump survived instead of a continuous ease)
  const totalWavelenSwing = samples[0].l - samples[samples.length - 1].l;
  const totalAmpSwing = samples[samples.length - 1].a - samples[0].a;
  check('no single step dominates the wavelength ramp', maxWavelenStep < totalWavelenSwing * 0.25,
    `maxStep=${maxWavelenStep.toFixed(1)} totalSwing=${totalWavelenSwing.toFixed(1)}`);
  check('no single step dominates the amplitude ramp', maxAmpStep < totalAmpSwing * 0.25,
    `maxStep=${maxAmpStep.toFixed(1)} totalSwing=${totalAmpSwing.toFixed(1)}`);
}

// no hard pop at the intro -> discrete-level-system handoff (x = INTRO_PX),
// judged the same boundary-agnostic way as section 6: compare against a
// control window sampled from level 4's own inherent step size just after
// the handoff, not a fixed magnitude.
{
  const windowHalf = LEVEL_BLEND_PX / 2 + 200;
  const handoffDelta = maxStepDeltaOver(INTRO_PX - windowHalf, INTRO_PX + windowHalf);
  const controlDelta = maxStepDeltaOver(INTRO_PX + PX_PER_LEVEL / 2 - windowHalf, INTRO_PX + PX_PER_LEVEL / 2 + windowHalf);
  check('no hard pop at the intro-ramp handoff into the discrete levels', handoffDelta < controlDelta * 3,
    `handoff=${handoffDelta.toFixed(2)} control=${controlDelta.toFixed(2)}`);
}

// a repeat cycle's "level 0" territory (well past x=INTRO_PX) is unaffected
// by the intro ramp and uses the plain discrete level 0 directly
check('cycle 1 level 0 uses the plain discrete level (not the intro ramp)',
  Math.abs(roughAt(PX_PER_CYCLE + mid(0)) - WAVE_LEVELS[0].rough * 1.10) < 1e-9,
  `${roughAt(PX_PER_CYCLE + mid(0))} vs ${WAVE_LEVELS[0].rough * 1.10}`);

// 8) Sanity: rough never goes negative or absurd within a few cycles' reach.
for (let c = 0; c < 5; c++) {
  const r = roughAt(c * PX_PER_CYCLE + mid(9));
  check(`cycle ${c} hardest-level rough is positive and sane`, r > 0 && r < 20, `${r.toFixed(2)}`);
}

// 10) Minimum wavelength: never more than MIN_WAVES_PER_SCREEN full periods
// fit across the current viewport. Several levels' shortest hand-tuned
// wavelength (Maelstrom's 95px, Heavy chaos' 110px, etc.) are well under
// what a normal desktop viewport divided by 5 works out to, so those need
// the floor; level 0's 420px swell is already generous enough not to.
{
  const shortestL = Math.min(...WAVE_LEVELS.flatMap((lv) => lv.comps.map((c) => c.l)));
  check('the shortest configured wavelength really is short enough to need flooring',
    shortestL < 900 / MIN_WAVES_PER_SCREEN, `shortestL=${shortestL}`);
  W = 900; // a typical desktop viewport
  check('a too-short wavelength is floored up to W/5 on a normal desktop viewport',
    Math.abs(effectiveWavelen(95) - 900 / 5) < 1e-9, `${effectiveWavelen(95)}`);
  check('an already-long wavelength is left untouched',
    effectiveWavelen(420) === 420, `${effectiveWavelen(420)}`);
  W = 380; // a small phone viewport — the floor should relax accordingly
  check('the floor relaxes on a narrower viewport', effectiveWavelen(95) === 95, `${effectiveWavelen(95)}`);
  W = 0; // back to "unknown/unset" — must not floor to 0 (no NaN/Infinity from dividing by zero)
  check('an unset viewport (W<=0) leaves wavelength untouched (no false floor)',
    effectiveWavelen(95) === 95, `${effectiveWavelen(95)}`);
}

// 11) Height irregularity: rough is the only thing gating it — calm levels
// (effRough <= 1) stay perfectly uniform, harder levels (effRough > 1) get
// a genuinely varying crest height, growing towards WAVE_IRREGULARITY at
// the hardest effective rough, so later/repeat-cycle stages read as
// unpredictable chop rather than a perfectly repeating sum of sines.
check('irregularity is exactly zero at calm rough (<=1)', irregAmtFor(0.65) === 0, `${irregAmtFor(0.65)}`);
check('irregularity is exactly zero right at the rough=1 threshold', irregAmtFor(1) === 0, `${irregAmtFor(1)}`);
check('irregularity is positive once rough exceeds 1', irregAmtFor(1.5) > 0, `${irregAmtFor(1.5)}`);
check('irregularity grows with rough', irregAmtFor(2.5) > irregAmtFor(1.5), `${irregAmtFor(1.5)} vs ${irregAmtFor(2.5)}`);
check('irregularity caps at WAVE_IRREGULARITY for the hardest effective rough',
  Math.abs(irregAmtFor(REF_MAX_ROUGH * 2) - WAVE_IRREGULARITY) < 1e-9, `${irregAmtFor(REF_MAX_ROUGH * 2)}`);

function crestHeights(startX, span, step) {
  const ys = [];
  for (let x = startX; x < startX + span; x += step) ys.push(surfaceAt(x, 0).y);
  const peaks = [];
  for (let i = 1; i < ys.length - 1; i++) if (ys[i] > ys[i - 1] && ys[i] >= ys[i + 1]) peaks.push(ys[i]);
  return peaks;
}
function coeffOfVariation(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance) / Math.abs(mean || 1);
}
{
  // level 0 in a repeat cycle (real discrete level, not the intro ramp)
  const easyPeaks = crestHeights(PX_PER_CYCLE + 500, PX_PER_LEVEL - LEVEL_BLEND_PX - 1000, 4);
  // level 9 "Maelstrom", cycle 0 — hardest base-cycle content
  const hardPeaks = crestHeights(9 * PX_PER_LEVEL + 500, PX_PER_LEVEL - LEVEL_BLEND_PX - 1000, 2);
  check('calm level-0 wave crests are all the same height (uniform, no irregularity)',
    coeffOfVariation(easyPeaks) < 1e-6, `cv=${coeffOfVariation(easyPeaks)}`);
  check('hard level-9 wave crests vary noticeably in height (genuine irregularity)',
    coeffOfVariation(hardPeaks) > 0.05, `cv=${coeffOfVariation(hardPeaks)}`);
  check('level-9 irregularity is much more pronounced than level-0\'s',
    coeffOfVariation(hardPeaks) > coeffOfVariation(easyPeaks) * 10,
    `easy=${coeffOfVariation(easyPeaks)} hard=${coeffOfVariation(hardPeaks)}`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

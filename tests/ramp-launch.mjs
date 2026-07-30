#!/usr/bin/env node
// Covers the two halves of the "aim your dive, hit a good face, get launched"
// mechanic, plus full keyboard control for desktop players.
//
// The design constraint this exists for: ocean waves here are shallow — the
// opening swell peaks around 1 degree of slope and open water around 6 — so
// the true surface normal redirects almost nothing on impact. The ramp
// amplifies the face angle into a launch, and judges "is this a good face"
// RELATIVE to the steepest face locally available. A fixed angle is what left
// the sweet-skip threshold dormant for the entire early game twice over.
//
// Run: node tests/ramp-launch.mjs
// Needs playwright-core resolvable and a Chromium binary — set
// CHROMIUM_PATH, default /opt/pw-browsers/chromium.
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const GAME = 'file://' + join(dirname(dirname(fileURLToPath(import.meta.url))), 'index.html');
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

let failures = 0;
function check(label, cond, detail) {
  if (!cond) { failures++; console.error('FAIL:', label, '—', detail ?? ''); }
  else console.log('ok:', label);
}

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(GAME);
await page.waitForTimeout(300);

// --- ramp quality is judged locally, not against a fixed angle ---
{
  const r = await page.evaluate(() => {
    const S = window.OceanSkips;
    // Scan a stretch of the length a player actually crosses, judging every
    // candidate landing point exactly the way the physics does — against its
    // OWN local window. A single fixed x is not a fair probe: levelPhaseSeed
    // is rerolled per run, so any one spot may sit on flat water by chance.
    // Counts distinct good FACES, not raw samples: adjacent samples sit on
    // the same wave face, so a percentage-of-points figure says little about
    // how many launch opportunities a player actually meets.
    const band = (x0, x1) => {
      let best = 0, faces = 0, peakSlope = 0, wasGood = false;
      for (let x = x0; x <= x1; x += 20) {
        const slope = S.surfaceAt(x, 0).slope;
        const q = S.rampQuality(slope, S.localMaxSlope(x, 0, 310));
        peakSlope = Math.max(peakSlope, slope);
        best = Math.max(best, q);
        const good = q > S.RAMP_CHEER_Q;
        if (good && !wasGood) faces++;      // rising edge = a new face
        wasGood = good;
      }
      return { bestQ: +best.toFixed(3), faces, spanPx: x1 - x0, peakSlope: +peakSlope.toFixed(4) };
    };
    return { calm: band(0, 6000), mid: band(14000, 20000), rough: band(100000, 106000),
             cheerQ: S.RAMP_CHEER_Q, countQ: S.RAMP_COUNT_Q };
  });
  check('calm opening water offers far shallower faces than open ocean',
    r.calm.peakSlope < r.rough.peakSlope, JSON.stringify(r));
  // THE regression: judged against a fixed angle, early faces could never
  // score well, so the mechanic sat dormant exactly where the game is played.
  for (const name of ['calm', 'mid', 'rough']) {
    const v = r[name];
    // Every sea state must be able to produce a celebrated ramp. Asserted
    // against the shipped threshold rather than a hardcoded number, so
    // retuning the mechanic can't silently make a band dormant again.
    check(`a perfect face in ${name} water clears the celebration threshold`,
      v.bestQ > r.cheerQ, `bestQ=${v.bestQ} cheerQ=${r.cheerQ} peakSlope=${v.peakSlope}`);
    // A typical run covers roughly 7000px, so a player should meet several
    // launch-worthy faces in any sea state rather than one lucky one.
    check(`${name} water offers several launch-worthy faces across a run's length`,
      v.faces >= 3, `${v.faces} distinct faces over ${v.spanPx}px`);
  }
  check('rougher water produces better ramps than calm water',
    r.rough.bestQ > r.calm.bestQ, `calm=${r.calm.bestQ} rough=${r.rough.bestQ}`);
}

// --- quality ordering and bounds ---
{
  const r = await page.evaluate(() => {
    const S = window.OceanSkips;
    const lm = 0.05;
    return {
      flat: S.rampQuality(0, lm),
      falling: S.rampQuality(-0.03, lm),
      half: S.rampQuality(0.025, lm),
      best: S.rampQuality(0.05, lm),
      beyond: S.rampQuality(0.20, lm),
    };
  });
  check('a flat face gives no ramp', r.flat === 0, `${r.flat}`);
  check('a descending face gives no ramp', r.falling === 0, `${r.falling}`);
  check('ramp quality rises with face steepness', r.half > 0 && r.best > r.half, JSON.stringify(r));
  check('ramp quality is bounded at 1 even past the local maximum', r.beyond <= 1, `${r.beyond}`);
}

// --- a ramp trades forward speed for height ---
{
  const r = await page.evaluate(() => {
    const S = window.OceanSkips;
    // RAMP_COST is what stops height being free
    return { gain: S.RAMP_GAIN, cost: S.RAMP_COST, maxSteep: S.RAMP_MAX_STEEP };
  });
  check('a ramp converts a meaningful share of speed into lift', r.gain > 0.3 && r.gain <= 1.2, `${r.gain}`);
  check('lift is paid for out of forward speed, so ramping is a real choice',
    r.cost > 0, `cost=${r.cost}`);
  check('a plunging arrival is excluded from ramping', r.maxSteep < 1, `${r.maxSteep}`);
}

// --- ramps actually fire in a real run ---
async function playRun({ useKeyboard = false, swingDelay = 232, boost = true } = {}) {
  await page.goto(GAME);
  await page.waitForTimeout(280);
  const tap = async () => {
    if (useKeyboard) await page.keyboard.press('Space');
    else { await page.mouse.down(); await page.mouse.up(); }
  };
  const holdFor = async (ms) => {
    if (useKeyboard) { await page.keyboard.down('Space'); await page.waitForTimeout(ms); await page.keyboard.up('Space'); }
    else { await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); }
  };
  if (useKeyboard) { await tap(); await page.waitForTimeout(140); }
  else { await page.click('#playBtn'); await page.waitForTimeout(130); }
  await tap(); await page.waitForTimeout(swingDelay);   // toss
  await tap();                                          // swing -> fly
  let maxAlt = 0;
  for (let i = 0; i < 34; i++) {
    const s = await page.evaluate(() => window.OceanSkips.snapshot);
    if (s.state === 'done') break;
    maxAlt = Math.max(maxAlt, s.y);
    if (boost && i % 3 === 1) await holdFor(300);
    else await page.waitForTimeout(280);
  }
  const s = await page.evaluate(() => window.OceanSkips.snapshot);
  return { ...s, maxAlt };
}
{
  let ramps = 0, skips = 0;
  for (const d of [225, 234, 243]) {
    const s = await playRun({ swingDelay: d });
    ramps += s.ramps; skips += s.skips;
  }
  check('ramp launches fire during normal play', ramps > 0, `${ramps} ramps over ${skips} skips`);
  check('ramp launches stay special rather than firing on every landing',
    ramps / Math.max(1, skips) < 0.5, `${(ramps / Math.max(1, skips) * 100).toFixed(0)}% of skips`);
}

// --- full keyboard control (desktop) ---
{
  const s = await playRun({ useKeyboard: true });
  check('a run can be played start to finish on the keyboard alone',
    s.skips > 0 && s.dist > 0, `skips=${s.skips} dist=${Math.round(s.dist / 40)}m`);
}
{
  await page.goto(GAME);
  await page.waitForTimeout(280);
  await page.keyboard.press('Space'); await page.waitForTimeout(140);
  await page.keyboard.press('Space'); await page.waitForTimeout(232);
  await page.keyboard.press('Space'); await page.waitForTimeout(60);
  check('space reaches the flight state', await page.evaluate(() => window.OceanSkips.state) === 'fly');

  const before = await page.evaluate(() => window.OceanSkips.snapshot.energy);
  await page.keyboard.down('Space');
  await page.waitForTimeout(500);
  const during = await page.evaluate(() => window.OceanSkips.snapshot);
  await page.keyboard.up('Space');
  check('holding space dives and drains boost energy', during.energy < before,
    `${before} -> ${during.energy}`);
  check('holding space does not start a flip', during.flip === null, JSON.stringify(during.flip));

  await page.waitForTimeout(120);
  await page.keyboard.press('Space');
  await page.waitForTimeout(50);
  check('a quick space tap flips instead of boosting',
    await page.evaluate(() => window.OceanSkips.snapshot.flip !== null));
}

check('no console/page errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

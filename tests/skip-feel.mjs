#!/usr/bin/env node
// Guards the feel of the skip chain — the thing a unit test on any single
// function would never have caught.
//
// The bug this exists for: restitution multiplies the *normal* velocity
// component by `e` (0.58) on every bounce, so hop height decays as e² (~0.34x
// per skip) and nothing replenishes it. Measured apexes ran
// 327 -> 107 -> 33 -> 10 -> 2px: from the fourth skip on, the fish was
// sliding along the surface rather than skipping, for ~80% of the run.
// SKIM_LIFT replaces the pure reflection with a speed-proportional
// water-reaction lift, so the arc fades gradually instead of falling off a
// cliff. These checks assert the *shape* of that decay.
//
// Run: node tests/skip-feel.mjs
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

// --- the lift curve itself, as a pure numeric mirror of index.html ---
{
  const G = 1500, LAUNCH_BASE = 1180, SKIM_LIFT = 530, FALLOFF = 0.65;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const liftAt = (sp) => SKIM_LIFT * Math.pow(clamp(sp / LAUNCH_BASE, 0, 1), FALLOFF);
  const apexAt = (sp) => liftAt(sp) ** 2 / (2 * G);

  check('a full-speed skip produces a clearly visible arc (>60px)', apexAt(LAUNCH_BASE) > 60,
    `${apexAt(LAUNCH_BASE).toFixed(0)}px`);
  check('a half-speed skip still arcs meaningfully (>20px)', apexAt(LAUNCH_BASE * 0.5) > 20,
    `${apexAt(LAUNCH_BASE * 0.5).toFixed(0)}px`);
  check('a nearly-spent skip still arcs rather than sliding (>6px)', apexAt(300) > 6,
    `${apexAt(300).toFixed(0)}px`);
  check('lift decreases monotonically as the fish tires',
    [1180, 900, 700, 500, 300].every((sp, i, a) => i === 0 || liftAt(sp) < liftAt(a[i - 1])));

  // The core regression: the falloff must be SUB-linear in speed. A linear
  // falloff (exponent 1.0) is what left the tail of every run as ~2px slides,
  // because lift faded exactly as fast as the speed driving it.
  check('the lift falloff is sub-linear in speed', FALLOFF < 1, `exponent=${FALLOFF}`);
  // Apex goes as lift², so with a sub-linear lift the arc still shrinks faster
  // than speed does (apex ∝ speed^1.3). What the sub-linear exponent buys is
  // a materially bigger arc at low speed than a linear falloff would give —
  // that difference is exactly the tail of the run that used to be a slide.
  const linearApexAtLowSpeed = (SKIM_LIFT * (300 / LAUNCH_BASE)) ** 2 / (2 * G);
  check('at low speed the sub-linear falloff gives far more arc than a linear one would',
    apexAt(300) > linearApexAtLowSpeed * 1.5,
    `sub-linear=${apexAt(300).toFixed(1)}px linear=${linearApexAtLowSpeed.toFixed(1)}px`);
}

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// --- the real bounce profile in a live run ---
async function sampleRun(swingDelay = 230) {
  await page.goto(GAME);
  await page.waitForTimeout(300);
  await page.click('#playBtn');
  await page.waitForTimeout(140);
  await page.mouse.down(); await page.mouse.up();          // toss
  await page.waitForTimeout(swingDelay);
  await page.mouse.down(); await page.mouse.up();          // swing -> fly
  const samples = await page.evaluate(() => new Promise((res) => {
    const out = []; const t0 = performance.now();
    const id = setInterval(() => {
      const s = window.OceanSkips.snapshot;
      if (s.state !== 'fly') { clearInterval(id); res(out); return; }
      out.push({ h: s.y - window.OceanSkips.surfaceAt(s.x, 0).y, skips: s.skips, sweet: s.sweetSkips });
      if (performance.now() - t0 > 16000) { clearInterval(id); res(out); }
    }, 8);
  }));
  const hops = {};
  for (const s of samples) if (!hops[s.skips] || s.h > hops[s.skips]) hops[s.skips] = s.h;
  return {
    apexes: Object.keys(hops).map(Number).sort((a, b) => a - b).map((k) => hops[k]),
    lastSweet: samples.length ? samples[samples.length - 1].sweet : 0,
    lastSkips: samples.length ? samples[samples.length - 1].skips : 0,
  };
}

const run = await sampleRun();
// hop 0 is the launch arc off the bat, which is huge by design; the skip
// chain proper starts at hop 1
const chain = run.apexes.slice(1);
check('a run produces a real skip chain', chain.length >= 6, `${chain.length} hops`);

// REGRESSION: the collapse. Previously hop 4 was already ~3px and everything
// after it was a ~2px slide. One flat bounce in the early chain is legitimate
// — a big ramp launch drops the fish back in steeply, and a steep arrival is
// deliberately penalised — so this allows a single dud while still failing on
// the systematic collapse the mechanic exists to prevent.
const earlyChain = chain.slice(0, 8);
const slides = earlyChain.filter((h) => h <= 5).length;
check('the early skip chain is real arcs, not a surface slide',
  slides <= 1, `${slides} slides in ${earlyChain.map((h) => h.toFixed(1)).join(', ')}`);

// REGRESSION: no cliff. Compare the settled part of the chain against its
// start. Individual hops vary a lot with landing angle and wave phase, so
// this averages rather than testing a single worst-case ratio. Measured
// before the fix: hops 5-8 averaged ~2px against ~70px early, about 3%.
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const earlyMean = mean(chain.slice(0, 2));
const lateMean = mean(chain.slice(4, 8));
check('the chain fades gradually instead of collapsing after a few skips',
  lateMean / earlyMean > 0.10,
  `late/early=${(lateMean / earlyMean * 100).toFixed(0)}% chain=${earlyChain.map((h) => h.toFixed(0)).join('/')}`);

check('the chain still decays overall (the fish does tire)',
  chain[chain.length - 1] < chain[0], `first=${chain[0].toFixed(0)} last=${chain[chain.length - 1].toFixed(0)}`);

// --- sweet skips remain reachable at the retuned contact angle ---
// A sweet skip needs a flatter-than-usual approach onto a descending face,
// and the boost-dive is what buys that — so this drives boost the way an
// engaged player would. Coasting passively yields none, which is the intent:
// the dive is the agency. What must not happen is the mechanic becoming
// unreachable even when played for, which is exactly how it shipped broken.
async function boostedRun(swingDelay) {
  await page.goto(GAME);
  await page.waitForTimeout(280);
  await page.click('#playBtn');
  await page.waitForTimeout(130);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(swingDelay);
  await page.mouse.down(); await page.mouse.up();
  for (let i = 0; i < 30; i++) {
    if (await page.evaluate(() => window.OceanSkips.state) === 'done') break;
    if (i % 3 === 1) { await page.mouse.down(); await page.waitForTimeout(300); await page.mouse.up(); }
    else await page.waitForTimeout(280);
  }
  return page.evaluate(() => window.OceanSkips.snapshot);
}
{
  let sweet = 0, skips = 0;
  for (const d of [225, 234, 243]) {
    const s = await boostedRun(d);
    sweet += s.sweetSkips; skips += s.skips;
  }
  const rate = sweet / Math.max(1, skips);
  check('sweet skips fire when the boost-dive is actually used', sweet > 0, `${sweet}/${skips}`);
  check('sweet skips stay a reward rather than every landing', rate < 0.4,
    `${(rate * 100).toFixed(0)}%`);
}

check('no console/page errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

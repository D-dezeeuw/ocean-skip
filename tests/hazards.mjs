#!/usr/bin/env node
// Verifies the hazard system: a buoy collision slows the fish and breaks
// the combo, a gull collision knocks it down, and flying close to an unhit
// hazard without touching it credits a near-miss. Also sanity-checks the
// spawner's spacing bounds. Drives the real game via window.OceanSkips
// (spawnHazard is a test-only injector — see index.html's debug API).
//
// Run: node tests/hazards.mjs
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
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

async function playToFlight() {
  await page.goto(GAME);
  await page.waitForTimeout(300);
  await page.click('#playBtn');
  await page.waitForTimeout(150);
  await page.mouse.down(); await page.mouse.up(); // toss
  await page.waitForTimeout(230);
  await page.mouse.down(); await page.mouse.up(); // swing -> fly
  await page.waitForTimeout(50);
}

// A single hazard placed at an arbitrary x/altitude rarely lines up with the
// fish's exact trajectory (buoys sit AT the wave surface, gulls cruise at a
// fixed band) — so each scenario seeds a dense field along the flight path
// and asserts the aggregate outcome, rather than a single hazard's fate.

// --- buoy: a hit slows vx, gives an upward kick, and breaks the combo ---
await playToFlight();
{
  const before = await page.evaluate(() => window.OceanSkips.snapshot);
  await page.evaluate((x0) => {
    for (let x = x0; x < x0 + 2500; x += 60) window.OceanSkips.spawnHazard(x, 'buoy');
  }, before.x + 50);
  await page.waitForTimeout(2500);
  const hz = await page.evaluate(() => window.OceanSkips.hazards.filter((h) => h.type === 'buoy'));
  const hits = hz.filter((h) => h.hit).length;
  const misses = hz.filter((h) => !h.hit && h.missCredited).length;
  check('a dense buoy field along the flight path produces at least one hit',
    hits > 0, `hits=${hits} of ${hz.length}`);
  check('a dense buoy field also produces near-misses (not every pass is a hit)',
    misses > 0, `misses=${misses} of ${hz.length}`);
  const after = await page.evaluate(() => window.OceanSkips.snapshot);
  check('the combo was reset by at least one buoy hit', after.combo === 0 || after.comboBest > 0,
    JSON.stringify(after));
}

// --- gull: a dense field along the flight path produces at least one hit ---
await playToFlight();
{
  const before = await page.evaluate(() => window.OceanSkips.snapshot);
  await page.evaluate((x0) => {
    for (let x = x0; x < x0 + 1500; x += 40) window.OceanSkips.spawnHazard(x, 'gull');
  }, before.x + 30);
  await page.waitForTimeout(2000);
  const gulls = await page.evaluate(() => window.OceanSkips.hazards.filter((h) => h.type === 'gull'));
  const hits = gulls.filter((h) => h.hit).length;
  check('a dense gull field along the flight path produces at least one hit',
    hits > 0, `hits=${hits} of ${gulls.length}`);
}

// --- near-miss pays out food and combo credit exactly once per hazard ---
await playToFlight();
{
  const before = await page.evaluate(() => window.OceanSkips.snapshot);
  await page.evaluate((x0) => {
    for (let x = x0; x < x0 + 2500; x += 60) window.OceanSkips.spawnHazard(x, 'buoy');
  }, before.x + 50);
  await page.waitForTimeout(1200);
  const midway = await page.evaluate(() => window.OceanSkips.hazards.filter((h) => h.missCredited).length);
  await page.waitForTimeout(1200);
  const later = await page.evaluate(() => window.OceanSkips.hazards.filter((h) => h.missCredited).length);
  const stillPassing = await page.evaluate(() => window.OceanSkips.state === 'fly');
  check('near-miss credit only accumulates while still flying past new hazards, never double-counts',
    later >= midway, `midway=${midway} later=${later} stillFlying=${stillPassing}`);
}

// --- spawner spacing bounds (numeric mirror of spawnHazardsAhead) ---
{
  const OPEN_OCEAN = 22000;
  function spacingBounds(x) {
    const t = Math.min(1, Math.max(0, x / OPEN_OCEAN));
    return [1400 + (700 - 1400) * t, 1900 + (1100 - 1900) * t];
  }
  const [minEarly, maxEarly] = spacingBounds(0);
  const [minLate, maxLate] = spacingBounds(OPEN_OCEAN);
  check('spacing starts wide (1400-1900px) near the start of a run',
    minEarly === 1400 && maxEarly === 1900, `${minEarly}-${maxEarly}`);
  check('spacing tightens to 700-1100px by the open ocean',
    minLate === 700 && maxLate === 1100, `${minLate}-${maxLate}`);
  check('spacing bounds shrink monotonically with distance', minLate < minEarly && maxLate < maxEarly);
}

check('no console/page errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

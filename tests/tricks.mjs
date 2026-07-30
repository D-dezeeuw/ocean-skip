#!/usr/bin/env node
// Verifies the tap-vs-hold input split: a quick tap while airborne starts a
// backflip (run.flip), while a sustained hold boosts (drains energy) and
// never starts one. Also a quick numeric sanity check that a typical launch
// stays airborne comfortably longer than FLIP_DUR, so a tapped flip has
// room to land before the fish is back at the water.
//
// Run: node tests/tricks.mjs
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

// --- numeric: a no-drag, no-wind estimate of a sweet-spot launch's airtime
// (mirrors index.html's LAUNCH_BASE/G and the swing()'s angle/power formula
// at a near-perfect contact) comfortably clears FLIP_DUR, so the trick has
// somewhere to fit before landing under ordinary play ---
{
  const G = 1500, LAUNCH_BASE = 1180, FLIP_DUR = 0.55;
  const q = 0.95; // a good, not perfect, sweet-spot contact
  const angleDeg = 30; // dead-center sweet spot maps to 30°
  const p = LAUNCH_BASE * (0.5 + 0.55 * q);
  const vy0 = p * Math.sin(angleDeg * Math.PI / 180);
  const airtimeToApexAndBack = (2 * vy0) / G; // symmetric no-drag estimate
  check('a typical sweet-spot launch stays airborne well past FLIP_DUR',
    airtimeToApexAndBack > FLIP_DUR * 1.3,
    `airtime≈${airtimeToApexAndBack.toFixed(2)}s vs FLIP_DUR=${FLIP_DUR}s`);
}

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// each scenario reloads fresh — the menu screen (and #playBtn) is only
// there for a moment after boot, since starting a run hides it
async function playToFlight() {
  await page.goto(GAME);
  await page.waitForTimeout(300);
  await page.click('#playBtn');
  await page.waitForTimeout(150);
  await page.mouse.down(); await page.mouse.up(); // toss
  await page.waitForTimeout(230); // let the fish fall toward the sweet spot
  await page.mouse.down(); await page.mouse.up(); // swing -> fly
  await page.waitForTimeout(60);
}

// --- a quick tap while airborne starts a flip ---
await playToFlight();
await page.mouse.down();
await page.waitForTimeout(40); // well under TAP_MS (180ms)
await page.mouse.up();
await page.waitForTimeout(30);
const afterTap = await page.evaluate(() => window.OceanSkips.snapshot);
check('a quick tap in flight starts a flip', afterTap.flip !== null, JSON.stringify(afterTap.flip));
check('the flip is mid-rotation, not instantly complete',
  afterTap.flip && afterTap.flip.t > 0 && afterTap.flip.t < afterTap.flip.dur, JSON.stringify(afterTap.flip));

// --- a sustained hold boosts instead, and never starts a flip ---
await playToFlight();
const energyBefore = (await page.evaluate(() => window.OceanSkips.snapshot)).energy;
await page.mouse.down();
await page.waitForTimeout(400); // well over TAP_MS — a real hold
const midHold = await page.evaluate(() => window.OceanSkips.snapshot);
await page.mouse.up();
check('a sustained hold does not start a flip', midHold.flip === null, JSON.stringify(midHold.flip));
check('a sustained hold drains boost energy', midHold.energy < energyBefore,
  `before=${energyBefore} after=${midHold.energy}`);

check('no console/page errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

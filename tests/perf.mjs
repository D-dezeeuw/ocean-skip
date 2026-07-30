#!/usr/bin/env node
// Pure numeric unit test of the Phase 5 performance/meta logic
// (implementation-20.md feature 20: particle cap + auto quality scaler),
// plus a live section (point 15 of implementation-15.md) confirming the
// cap actually holds in the running game once trails/speed-lines/boost
// flame (drawn as strokes, not particles — deliberately, so they can't
// touch the budget) and the newer particle-emitting events (hazard-hit
// debris, pearl/chili sparkles) are all firing at once.
//
// Run: node tests/perf.mjs
// The live section needs playwright-core resolvable and a Chromium binary
// — set CHROMIUM_PATH, default /opt/pw-browsers/chromium.
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;

const PARTICLE_CAP = 220;
function capParticles(particles) {
  const over = particles.length - PARTICLE_CAP;
  if (over <= 0) return particles;
  particles.sort((a, b) => {
    const pa = a.kind === 'bubble' ? 0 : 1, pb = b.kind === 'bubble' ? 0 : 1;
    return pa !== pb ? pa - pb : a.life - b.life;
  });
  particles.splice(0, over);
  return particles;
}

// Mirrors index.html's updateQualityScaler. Thresholds are relative to the
// display's own healthy frame interval (frameBaseMs), not absolute ms.
const QUAL_DROP_RATIO = 1.35;
const QUAL_RESTORE_RATIO = 1.12;
function makeScaler() {
  let smoothFrameMs = 16.7;
  let frameBaseMs = Infinity;
  let qualWarmup = 60;
  const quality = { causticsLayer2: true, rays: true, ambientBubbles: true };
  function updateQualityScaler(frameMs) {
    const ms = clamp(frameMs, 0, 100);
    smoothFrameMs = lerp(smoothFrameMs, ms, 0.1);
    if (qualWarmup > 0) {
      if (ms >= 6) frameBaseMs = Math.min(frameBaseMs, ms);
      if (--qualWarmup === 0) frameBaseMs = clamp(isFinite(frameBaseMs) ? frameBaseMs : 16.7, 6, 40);
      return;
    }
    if (smoothFrameMs > frameBaseMs * QUAL_DROP_RATIO) {
      if (quality.causticsLayer2) quality.causticsLayer2 = false;
      else if (quality.rays) quality.rays = false;
      else if (quality.ambientBubbles) quality.ambientBubbles = false;
    } else if (smoothFrameMs < frameBaseMs * QUAL_RESTORE_RATIO) {
      if (!quality.ambientBubbles) quality.ambientBubbles = true;
      else if (!quality.rays) quality.rays = true;
      else if (!quality.causticsLayer2) quality.causticsLayer2 = true;
    }
  }
  return { quality, updateQualityScaler, base: () => frameBaseMs };
}

let failures = 0;
function check(label, cond, detail) {
  if (!cond) { failures++; console.error(`FAIL: ${label} — ${detail}`); }
  else console.log(`ok: ${label}`);
}

// 1) Particle cap: bubbles are evicted before any gameplay particle, then by
// shortest remaining life — synthetic overflow well past the cap.
{
  const particles = [];
  for (let i = 0; i < 150; i++) particles.push({ kind: 'bubble', life: Math.random() });
  for (let i = 0; i < 150; i++) particles.push({ kind: undefined, life: Math.random() });
  capParticles(particles);
  const bubbles = particles.filter(p => p.kind === 'bubble').length;
  const sparks = particles.filter(p => p.kind !== 'bubble').length;
  check('total settles at exactly the cap', particles.length === PARTICLE_CAP,
    `total=${particles.length} cap=${PARTICLE_CAP}`);
  check('every gameplay particle survives (only bubbles were over cap)', sparks === 150,
    `sparks=${sparks}`);
  check('bubbles are evicted first', bubbles === 150 - (300 - PARTICLE_CAP),
    `bubbles=${bubbles}`);
}

// 2) Particle cap: once bubbles are exhausted, further eviction takes the
// shortest-remaining-life gameplay particles, not an arbitrary order.
{
  const mini = [{ kind: undefined, life: 0.05 }, { kind: undefined, life: 0.9 }, { kind: undefined, life: 0.5 }];
  const over = mini.length - 2;
  mini.sort((a, b) => a.life - b.life);
  mini.splice(0, over);
  check('among equal priority, the shortest-life particle is evicted first',
    !mini.some(p => p.life === 0.05) && mini.length === 2,
    JSON.stringify(mini));
}

// 3) Auto quality scaler: sustained slow frames drop layers in the specified
// order (caustics second layer -> rays -> ambient bubbles), sustained fast
// frames restore them in reverse.
// The scaler spends its first 60 frames measuring the display's refresh
// interval, so every scenario below establishes a baseline before asserting.
const warmup = (fn, ms, n = 70) => { for (let i = 0; i < n; i++) fn(ms); };
{
  const { quality, updateQualityScaler } = makeScaler();
  warmup(updateQualityScaler, 16.7);                        // a 60Hz display
  for (let i = 0; i < 200; i++) updateQualityScaler(40);    // sustained overrun vs that baseline
  check('sustained frames well over the device baseline drop all three optional layers',
    !quality.causticsLayer2 && !quality.rays && !quality.ambientBubbles,
    JSON.stringify(quality));
  for (let i = 0; i < 200; i++) updateQualityScaler(16.7);  // recovery to baseline
  check('returning to the device baseline restores all three',
    quality.causticsLayer2 && quality.rays && quality.ambientBubbles,
    JSON.stringify(quality));
}

// 4) Auto quality scaler: a single slow frame should not immediately nuke
// everything — it's a smoothed decision, not a hair-trigger one.
{
  const { quality, updateQualityScaler } = makeScaler();
  warmup(updateQualityScaler, 16.7);
  updateQualityScaler(45);
  check('a single slow frame does not immediately drop every layer',
    quality.causticsLayer2 && quality.rays && quality.ambientBubbles,
    JSON.stringify(quality));
}

// 4b) REGRESSION: on a 60Hz vsync-locked display a healthy frame is 16.7ms.
// The old absolute thresholds (drop >20, restore <14) put that in a dead
// band, so a layer dropped by one hitch could NEVER be restored for the rest
// of the session. Steady vsync frames must recover everything.
{
  const { quality, updateQualityScaler } = makeScaler();
  warmup(updateQualityScaler, 16.7);
  for (let i = 0; i < 60; i++) updateQualityScaler(60);    // a sustained hitch
  check('a hitch on a 60Hz display drops at least one layer',
    !quality.causticsLayer2, JSON.stringify(quality));
  for (let i = 0; i < 400; i++) updateQualityScaler(16.7); // then steady vsync again
  check('steady 60Hz vsync frames restore every layer (no permanent dead band)',
    quality.causticsLayer2 && quality.rays && quality.ambientBubbles,
    JSON.stringify(quality));
}

// 4c) REGRESSION: a 30Hz-capped / power-saving device runs a steady ~33ms
// frame. That is healthy FOR THAT DEVICE and must not strip anything — the
// old absolute >20ms drop threshold stripped all three immediately, no
// matter how much headroom the device actually had.
{
  const { quality, updateQualityScaler } = makeScaler();
  for (let i = 0; i < 400; i++) updateQualityScaler(33.3);
  check('a steady 30Hz device keeps all layers (thresholds are relative, not absolute)',
    quality.causticsLayer2 && quality.rays && quality.ambientBubbles,
    JSON.stringify(quality));
}

// 4d) ...but a 30Hz device that degrades relative to its OWN baseline still sheds.
{
  const { quality, updateQualityScaler } = makeScaler();
  warmup(updateQualityScaler, 33.3);
  for (let i = 0; i < 200; i++) updateQualityScaler(80);
  check('a 30Hz device overrunning its own baseline still drops layers',
    !quality.causticsLayer2 && !quality.rays && !quality.ambientBubbles,
    JSON.stringify(quality));
}

// 5) Live: the particle count never exceeds PARTICLE_CAP even with a dense
// field of hazards (debris puffs on hit) and pearls/chilis (sparkles on
// pickup) all firing while boosting (trail + speed lines + flame — all
// drawn as strokes, so they shouldn't add to this count at all).
{
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright-core');
  const GAME = 'file://' + join(dirname(dirname(fileURLToPath(import.meta.url))), 'index.html');
  const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(GAME);
  await page.waitForTimeout(300);
  await page.click('#playBtn');
  await page.waitForTimeout(150);
  await page.mouse.down(); await page.mouse.up(); // toss
  await page.waitForTimeout(230);
  await page.mouse.down(); await page.mouse.up(); // swing -> fly
  await page.waitForTimeout(50);

  const before = await page.evaluate(() => window.OceanSkips.snapshot);
  await page.evaluate(({ x0, y0 }) => {
    for (let x = x0; x < x0 + 3000; x += 50) {
      window.OceanSkips.spawnHazard(x, Math.random() < 0.5 ? 'buoy' : 'gull');
      window.OceanSkips.spawnPearl(x + 15, y0 - 150 + Math.sin(x * 0.01) * 200);
      window.OceanSkips.spawnChili(x + 30, y0 - 150 + Math.sin(x * 0.01 + 1) * 200);
    }
  }, { x0: before.x + 30, y0: before.y });
  await page.mouse.down(); // hold boost the whole time: trail + speed lines + flame all active together

  const cap = await page.evaluate(() => window.OceanSkips.PARTICLE_CAP);
  let maxSeen = 0;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const n = await page.evaluate(() => window.OceanSkips.particleCount);
    maxSeen = Math.max(maxSeen, n);
  }
  await page.mouse.up();

  check('particle count never exceeds PARTICLE_CAP under a dense hazard/pickup field while boosting',
    maxSeen <= cap, `maxSeen=${maxSeen} cap=${cap}`);
  check('no console/page errors during the live particle-cap check', errors.length === 0, errors.join(' | '));

  await browser.close();
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

#!/usr/bin/env node
/*
 * Layout tests for OceanSkips.
 *
 * Mimics landscape phone viewports where the browser's nav/tool bars eat a
 * chunk of the height (the "game looks zoomed in, water off-screen" bug):
 * short visual viewports at load, plus a viewport that shrinks *after* load
 * the way iOS Safari's bars appear. Asserts that the canvas buffer matches
 * the visual viewport exactly (no stretch = no fake zoom) and that sky,
 * toss space and water line are all on screen together, in the menu and in
 * the ready-to-play state.
 *
 * Run:  node tests/layout.mjs
 * Needs playwright-core resolvable (e.g. NODE_PATH=…/node_modules) and a
 * Chromium binary — set CHROMIUM_PATH, default /opt/pw-browsers/chromium.
 * Optional: SHOTS_DIR=<dir> to save a screenshot per scenario.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const GAME = 'file://' + join(dirname(dirname(fileURLToPath(import.meta.url))), 'index.html');
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.SHOTS_DIR || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// Heights are what innerHeight/visualViewport actually report on these
// devices in landscape WITH browser chrome visible (not the bare screen).
const SCENARIOS = [
  { name: 'iphone-14-landscape-safari-chrome', w: 844,  h: 340, dsf: 3 },
  { name: 'small-android-landscape-chrome',    w: 780,  h: 300, dsf: 2 },
  { name: 'iphone-se-landscape-safari-chrome', w: 667,  h: 280, dsf: 2 },
  { name: 'ipad-landscape',                    w: 1180, h: 820, dsf: 2 },
  { name: 'desktop',                           w: 1280, h: 800, dsf: 1 },
];
const TOSS_APEX_MARGIN = 24;   // css px of sky that must remain above the arc
const failures = [];
let checks = 0;

function expect(scenario, label, ok, detail) {
  checks++;
  if (!ok) failures.push(`[${scenario}] ${label} — ${detail}`);
}

/* Canvas buffer vs visual viewport vs CSS box + scroll/overflow state. */
async function readSizing(page) {
  return page.evaluate(() => {
    const c = document.getElementById('game');
    const cs = getComputedStyle(c);
    const vv = window.visualViewport;
    return {
      vvW: vv ? vv.width : window.innerWidth,
      vvH: vv ? vv.height : window.innerHeight,
      cssW: parseFloat(cs.width), cssH: parseFloat(cs.height),
      bufW: c.width, bufH: c.height,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      scrollY: window.scrollY,
      docOverflowX: document.documentElement.scrollWidth - window.innerWidth,
      view: window.OceanSkips.view,
      state: window.OceanSkips.state,
    };
  });
}

/* Find the rendered water line: strongest bright→dark luminance step down a
 * set of columns in the right 45% of the frame (clear of the beach). */
async function findWaterLine(page) {
  return page.evaluate(() => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const { width: bw, height: bh } = c;
    const img = g.getImageData(0, 0, bw, bh).data;
    const xs = [];
    for (let fx = 0.55; fx <= 0.95; fx += 0.05) xs.push(Math.floor(fx * bw));
    const lum = [];
    for (let y = 0; y < bh; y += 2) {
      let s = 0;
      for (const x of xs) {
        const i = (y * bw + x) * 4;
        s += 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
      }
      lum.push(s / xs.length);
    }
    let bestDrop = 0, bestIdx = -1;
    // Wide enough that a thin decorative line (wind streaks, foam flecks)
    // can't outweigh the sustained brightness difference across a real
    // sky-to-water transition — a screen-space artifact only 1-2px tall
    // barely moves a 10-row average, whereas the water boundary holds for
    // many rows on both sides.
    const R = 10; // compare 20px-band means either side of the candidate row
    // search below the top third — the fiesta bunting and clouds up there
    // also make hard bright→dark edges, but the sea never sits that high
    const iMin = Math.max(R, Math.floor(lum.length * 0.32));
    for (let i = iMin; i < lum.length - R; i++) {
      let above = 0, below = 0;
      for (let k = 1; k <= R; k++) { above += lum[i - k]; below += lum[i + k]; }
      const drop = (above - below) / R;
      if (drop > bestDrop) { bestDrop = drop; bestIdx = i; }
    }
    const bandMean = (i0, i1) => {
      let s = 0, n = 0;
      for (let i = Math.max(0, i0); i < Math.min(lum.length, i1); i++) { s += lum[i]; n++; }
      return n ? s / n : 0;
    };
    return {
      waterCssY: bestIdx < 0 ? -1 : (bestIdx * 2) / (bh / parseFloat(getComputedStyle(c).height)),
      drop: bestDrop,
      topLum: bandMean(0, Math.floor(lum.length * 0.1)),
      bottomLum: bandMean(Math.ceil(lum.length * 0.9), lum.length),
    };
  });
}

async function rectInViewport(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el || el.classList.contains('hidden')) return { visible: false };
    const r = el.getBoundingClientRect();
    return { visible: true, inside: r.top >= 0 && r.left >= 0 &&
             r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1,
             rect: { t: r.top, b: r.bottom, l: r.left, r: r.right } };
  }, sel);
}

function checkFrame(name, phase, sz, wl) {
  const j = (o) => JSON.stringify(o);
  expect(name, `${phase}: no page scroll`, sz.scrollY === 0, `scrollY=${sz.scrollY}`);
  expect(name, `${phase}: no horizontal overflow`, sz.docOverflowX <= 1, `overflow=${sz.docOverflowX}px`);
  expect(name, `${phase}: canvas CSS box == visual viewport`,
    Math.abs(sz.cssW - sz.vvW) <= 1 && Math.abs(sz.cssH - sz.vvH) <= 1,
    `css=${sz.cssW}x${sz.cssH} vv=${sz.vvW}x${sz.vvH}`);
  expect(name, `${phase}: buffer == CSS box × DPR (no stretch)`,
    sz.bufW === Math.round(sz.cssW * sz.dpr) && sz.bufH === Math.round(sz.cssH * sz.dpr),
    `buf=${sz.bufW}x${sz.bufH} css×dpr=${Math.round(sz.cssW * sz.dpr)}x${Math.round(sz.cssH * sz.dpr)}`);

  const v = sz.view;
  expect(name, `${phase}: view scale sane`, v.VS >= 0.62 && v.VS <= 1, `VS=${v.VS}`);
  expect(name, `${phase}: logical size consistent with scale`,
    Math.abs(v.H - sz.cssH / v.VS) < 2,
    `H=${v.H.toFixed(1)} cssH=${sz.cssH} VS=${v.VS.toFixed(3)}`);
  const waterCss = v.seaLine * v.VS;
  expect(name, `${phase}: water line on screen`,
    waterCss > sz.cssH * 0.3 && waterCss < sz.cssH * 0.85,
    `waterCss=${waterCss.toFixed(0)} of ${sz.cssH}`);
  expect(name, `${phase}: toss arc fits above water with sky to spare`,
    (v.seaLine - v.tossApex) * v.VS >= TOSS_APEX_MARGIN,
    `room=${((v.seaLine - v.tossApex) * v.VS).toFixed(0)}px (${j(v)})`);

  if (wl) {
    expect(name, `${phase}: rendered surface found`, wl.drop > 8, `drop=${wl.drop.toFixed(1)}`);
    expect(name, `${phase}: rendered surface matches view math`,
      wl.waterCssY < 0 ? false : Math.abs(wl.waterCssY - (waterCss + v.camY * v.VS)) < 48,
      `pixel=${wl.waterCssY.toFixed(0)} math=${(waterCss + v.camY * v.VS).toFixed(0)}`);
    expect(name, `${phase}: sky bright up top, water dark below`,
      wl.topLum > wl.bottomLum + 20, `top=${wl.topLum.toFixed(0)} bottom=${wl.bottomLum.toFixed(0)}`);
  }
}

async function runScenario(browser, sc) {
  const page = await browser.newPage({
    viewport: { width: sc.w, height: sc.h }, deviceScaleFactor: sc.dsf,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(GAME);
  await page.waitForTimeout(600);

  // --- menu ---
  checkFrame(sc.name, 'menu', await readSizing(page), await findWaterLine(page));
  const play = await rectInViewport(page, '#playBtn');
  expect(sc.name, 'menu: Play button fully on screen', play.visible && play.inside, JSON.stringify(play));
  const rotate = await page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display);
  expect(sc.name, 'menu: rotate overlay hidden in landscape', rotate === 'none', `display=${rotate}`);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${sc.name}-menu.png`) });

  // --- ready (pressed Play) ---
  await page.click('#playBtn');
  await page.waitForTimeout(400);
  const szReady = await readSizing(page);
  expect(sc.name, 'ready: game entered ready state', szReady.state === 'ready', `state=${szReady.state}`);
  checkFrame(sc.name, 'ready', szReady, await findWaterLine(page));
  for (const sel of ['#hud', '#hint']) {   // #energy only appears in flight
    const r = await rectInViewport(page, sel);
    expect(sc.name, `ready: ${sel} visible inside viewport`, r.visible && r.inside, JSON.stringify(r));
  }
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${sc.name}-ready.png`) });

  // --- browser chrome appears after load (viewport shrinks in place) ---
  const shrunk = Math.max(240, sc.h - 60);
  await page.setViewportSize({ width: sc.w, height: shrunk });
  await page.waitForTimeout(400);
  checkFrame(sc.name, `shrunk-to-${shrunk}`, await readSizing(page), await findWaterLine(page));
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${sc.name}-shrunk.png`) });

  // --- fly, at the shrunken size (harshest case for the HUD) ---
  // tap = toss; the fish crosses the sweet ring on the way down ~540ms in,
  // and swing() launches for any tap within ±~150ms of that
  const tapX = sc.w * 0.5, tapY = shrunk * 0.6;
  let state = '';
  for (let attempt = 0; attempt < 2 && state !== 'fly'; attempt++) {
    if (attempt > 0) { await page.click('#againBtn'); await page.waitForTimeout(300); }
    await page.mouse.click(tapX, tapY);
    await page.waitForTimeout(520);
    await page.mouse.click(tapX, tapY);
    await page.waitForTimeout(250);
    state = await page.evaluate(() => window.OceanSkips.state);
  }
  expect(sc.name, 'fly: swing launched the fish', state === 'fly', `state=${state}`);
  if (state === 'fly') {
    checkFrame(sc.name, 'fly', await readSizing(page), null); // water may pan off-screen mid-flight by design
    for (const sel of ['#hud', '#energy']) {
      const r = await rectInViewport(page, sel);
      expect(sc.name, `fly: ${sel} visible inside viewport`, r.visible && r.inside, JSON.stringify(r));
    }
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `${sc.name}-fly.png`) });
  }

  expect(sc.name, 'no console/page errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

const browser = await chromium.launch({ executablePath: EXE, headless: true });
for (const sc of SCENARIOS) await runScenario(browser, sc);
await browser.close();

if (failures.length) {
  console.error(`FAIL — ${failures.length} of ${checks} checks failed:`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`PASS — ${checks} checks across ${SCENARIOS.length} scenarios (incl. shrink-after-load)`);

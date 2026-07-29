#!/usr/bin/env node
// Headless browser verification that the wavelength floor and height
// irregularity actually hold in the real running game (not just in the
// tests/waves.mjs numeric mirror) — drives the real surfaceAt/roughAt via
// window.OceanSkips at a real viewport size, so a real W (viewport world
// width) is in play, same as tests/audio.mjs's approach for WebAudio.
//
// Run: node tests/wave-render.mjs
// Needs playwright-core resolvable (e.g. NODE_PATH=…/node_modules) and a
// Chromium binary — set CHROMIUM_PATH, default /opt/pw-browsers/chromium.
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
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(GAME);
await page.waitForTimeout(400);
await page.click('#playBtn');
await page.waitForTimeout(200);

const result = await page.evaluate(() => {
  const O = window.OceanSkips;

  function crestHeights(startX, span, step) {
    const ys = [];
    for (let x = startX; x < startX + span; x += step) ys.push(O.surfaceAt(x, 0).y);
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

  const W = O.W;
  const floored95 = O.effectiveWavelen(95);
  const untouched420 = O.effectiveWavelen(420);

  const easyPeaks = crestHeights(O.PX_PER_CYCLE + 500, O.PX_PER_LEVEL - O.LEVEL_BLEND_PX - 1000, 4);
  const hardPeaks = crestHeights(9 * O.PX_PER_LEVEL + 500, O.PX_PER_LEVEL - O.LEVEL_BLEND_PX - 1000, 2);

  // count actual on-screen crests for a lone short-wavelength component,
  // evaluated the same way evalLevel would (post-flooring), across exactly
  // one real screen width
  const k = Math.PI * 2 / O.effectiveWavelen(95);
  const onScreen = [];
  for (let x = 0; x < W; x += 2) onScreen.push(Math.sin(k * x));
  let crestCount = 0;
  for (let i = 1; i < onScreen.length - 1; i++) if (onScreen[i] > onScreen[i - 1] && onScreen[i] >= onScreen[i + 1]) crestCount++;

  return {
    W, floored95, untouched420,
    easyCV: coeffOfVariation(easyPeaks), hardCV: coeffOfVariation(hardPeaks),
    easyPeakCount: easyPeaks.length, hardPeakCount: hardPeaks.length,
    crestCount, minWavesPerScreen: O.MIN_WAVES_PER_SCREEN,
  };
});

check('viewport width is what we launched with', result.W === 900, `W=${result.W}`);
check('a too-short wavelength (95px) is floored to W/5 at this real viewport',
  Math.abs(result.floored95 - result.W / 5) < 1e-9, `${result.floored95} vs ${result.W / 5}`);
check('an already-long wavelength (420px) is left untouched', result.untouched420 === 420, `${result.untouched420}`);
check('a lone floored short-wavelength component never shows more than 5 crests on one real screen',
  result.crestCount <= result.minWavesPerScreen, `crestCount=${result.crestCount}`);
check('calm level-0 crests are uniform in the real game (no irregularity)', result.easyCV < 1e-6, `cv=${result.easyCV}`);
check('hard level-9 crests vary noticeably in the real game (genuine irregularity)', result.hardCV > 0.05, `cv=${result.hardCV}`);
check('hard-level irregularity is far more pronounced than calm-level in the real game',
  result.hardCV > result.easyCV * 10, `easy=${result.easyCV} hard=${result.hardCV}`);

check('no console/page errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

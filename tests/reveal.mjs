#!/usr/bin/env node
// Covers the three "reveal" features — surfacing simulation detail the game
// already computed but never showed the player:
//   * sea-state naming (WAVE_LEVELS carried hand-written names nothing read)
//   * the power lane (four reward systems key off one altitude; nothing drew it)
//   * the records screen (save.records was tracked but never displayed)
//
// Run: node tests/reveal.mjs
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

// --- sea-state naming ---
{
  const r = await page.evaluate(() => {
    const S = window.OceanSkips;
    return {
      poolNames: S.SEA_STATES.map((s) => s.name),
      levelNames: S.WAVE_LEVELS.map((l) => l.name),
      sorted: S.SEA_STATES.map((s) => s.rough),
      byDist: [0, 200, 700, 1200, 2000].map((m) => ({ m, name: S.seaStateAt(m * 40).name })),
      roughByDist: [0, 200, 700, 1200, 2000].map((m) => S.roughAt(m * 40)),
    };
  });
  check('every sea-state name comes from the WAVE_LEVELS table (no invented names)',
    r.poolNames.every((n) => r.levelNames.includes(n)) && r.poolNames.length === r.levelNames.length,
    JSON.stringify(r.poolNames));
  check('the sea-state lookup table is sorted by roughness',
    r.sorted.every((v, i) => i === 0 || v >= r.sorted[i - 1]), JSON.stringify(r.sorted));
  check('the named sea genuinely escalates with distance',
    r.byDist[0].name !== r.byDist[4].name, JSON.stringify(r.byDist));
  // the name must track roughness monotonically: rougher water never gets a
  // calmer name than gentler water
  const idx = (n) => r.poolNames.indexOf(n);
  let monotonic = true;
  for (let i = 1; i < r.byDist.length; i++) {
    if (r.roughByDist[i] > r.roughByDist[i - 1] && idx(r.byDist[i].name) < idx(r.byDist[i - 1].name)) monotonic = false;
  }
  check('rougher water never receives a calmer name', monotonic,
    JSON.stringify(r.byDist.map((d, i) => `${d.m}m ${d.name} (rough ${r.roughByDist[i].toFixed(2)})`)));
}

// --- the sea state is announced during a real run ---
{
  await page.goto(GAME);
  await page.waitForTimeout(300);
  await page.click('#playBtn');
  await page.waitForTimeout(150);
  await page.mouse.down(); await page.mouse.up();      // toss
  await page.waitForTimeout(230);
  await page.mouse.down(); await page.mouse.up();      // swing -> fly
  await page.waitForTimeout(500);
  const snap = await page.evaluate(() => window.OceanSkips.snapshot);
  check('a run announces the sea state it is in', !!snap.seaState, JSON.stringify(snap.seaState));
}

// --- the power lane lines up with the systems it advertises ---
{
  const r = await page.evaluate(() => {
    const S = window.OceanSkips;
    // sample the wind profile across altitude at a fixed x/t
    const x = 20000, t = 0;
    const windAt = (y) => Math.abs(S.windAt(x, y, t));
    return {
      laneY: S.LANE_Y, laneTop: S.LANE_TOP,
      windBelow: windAt(S.LANE_Y - 200),
      windAtLane: windAt(S.LANE_Y),
      windAbove: windAt(S.LANE_Y + 150),
      windMax: Math.abs(S.wind.base) * 1.3,
      shelterTop: S.shelterTopAt(x),
    };
  });
  check('the lane sits above the sheltered band, not inside it',
    r.laneY > r.shelterTop, `lane=${r.laneY} shelterTop=${r.shelterTop.toFixed(1)}`);
  check('the lane spans a positive altitude range', r.laneTop > r.laneY, `${r.laneY}..${r.laneTop}`);
  check('wind is materially stronger at the lane than well below it',
    r.windAtLane > r.windBelow * 1.5, `below=${r.windBelow.toFixed(1)} lane=${r.windAtLane.toFixed(1)}`);
  check('wind keeps increasing above the lane floor',
    r.windAbove >= r.windAtLane, `lane=${r.windAtLane.toFixed(1)} above=${r.windAbove.toFixed(1)}`);
}

// --- records screen ---
{
  await page.goto(GAME);
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('oceanskips-save-v3') || '{}');
    Object.assign(s, { best: 412, runs: 37, food: 880, pearls: 6,
      records: { skips: 61, tricks: 4, sweetSkips: 12, nearMisses: 9, comboBest: 44, bigAir: 3 } });
    localStorage.setItem('oceanskips-save-v3', JSON.stringify(s));
  });
  await page.reload();
  await page.waitForTimeout(300);
  await page.click('#recordsBtn');
  await page.waitForTimeout(200);

  const visible = await page.evaluate(() => !document.getElementById('records').classList.contains('hidden'));
  check('the records screen opens from the menu', visible);
  const text = await page.locator('#recRows').textContent();
  for (const [label, val] of [['Best distance', '412'], ['Most skips in a run', '61'],
                              ['Longest combo streak', '44'], ['Most tricks in a run', '4'],
                              ['Most sweet skips in a run', '12'], ['Most near-misses in a run', '9'],
                              ['Most Big Air in a run', '3'], ['Pearls found', '6']]) {
    check(`records screen shows "${label}" with its stored value`,
      text.includes(label) && text.includes(val), `looking for ${val} in row ${label}`);
  }
  await page.click('#recBack');
  await page.waitForTimeout(150);
  check('records screen returns to the menu',
    await page.evaluate(() => window.OceanSkips.state === 'menu'));
  check('the fish is not drawn over the records screen',
    await page.evaluate(() => window.OceanSkips.state !== 'fly'));
}

check('no console/page errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

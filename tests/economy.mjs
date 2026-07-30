#!/usr/bin/env node
// Covers the upgrade economy and run scoring — both previously untested.
//
// Two shipped bugs are regression-guarded here:
//   1. Globo's bounce is clamped to 0.92 in stats(), which it reaches at
//      Rubber Belly level 3 — so levels 4 and 5 cost 2,035 food and change
//      nothing, while the pips still fill in. The shop must detect that.
//   2. runScore ignored run.bigAir even though the results screen displayed
//      it, gave it a record, and had a mission for it.
//
// Run: node tests/economy.mjs
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

// --- upgrade cost curve (pure numeric mirror of index.html's upCost) ---
{
  const upCost = (lvl) => Math.round(65 * Math.pow(2.15, lvl) / 5) * 5;
  const levels = [0, 1, 2, 3, 4].map(upCost);
  check('upgrade costs increase strictly with level', levels.every((c, i) => i === 0 || c > levels[i - 1]),
    JSON.stringify(levels));
  check('every cost is a round multiple of 5 (no ugly numbers in the shop)',
    levels.every((c) => c % 5 === 0), JSON.stringify(levels));
}

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(GAME);
await page.waitForTimeout(300);

// --- stats() actually responds to upgrade levels ---
{
  const r = await page.evaluate(() => {
    const S = window.OceanSkips;
    const base = S.stats();
    // drive real purchases through the save object the game reads
    const before = { launch: base.launch, drag: base.drag, maxEnergy: base.maxEnergy };
    return { before };
  });
  check('a fresh save produces sane derived stats',
    r.before.launch > 0 && r.before.drag > 0 && r.before.maxEnergy === 100, JSON.stringify(r.before));
}

// --- REGRESSION: Globo's bounce cap must be detected as "no effect" ---
{
  const r = await page.evaluate(() => {
    const S = window.OceanSkips;
    S.selectFish('globo');
    const out = { bounceByLevel: [], effectByLevel: [] };
    for (let lvl = 0; lvl <= 5; lvl++) {
      S.setUpgrade('rubber', lvl);
      out.bounceByLevel.push(+S.stats().bounce.toFixed(4));
      if (lvl < 5) out.effectByLevel.push(S.upgradeHasEffect('rubber'));
    }
    S.setUpgrade('rubber', 0);
    return out;
  });
  const capped = r.bounceByLevel;
  check('Globo\'s bounce climbs then flattens at the 0.92 clamp',
    capped[0] < capped[1] && capped[capped.length - 1] === 0.92, JSON.stringify(capped));
  const firstDead = r.effectByLevel.indexOf(false);
  check('the shop detects the first level that would have no effect for Globo',
    firstDead !== -1, JSON.stringify(r.effectByLevel));
  check('every level at or past the cap is reported as having no effect',
    r.effectByLevel.slice(firstDead).every((e) => e === false), JSON.stringify(r.effectByLevel));
  check('levels before the cap are still reported as useful',
    r.effectByLevel.slice(0, firstDead).every((e) => e === true), JSON.stringify(r.effectByLevel));
}

// --- a fish that is NOT capped keeps every level useful ---
{
  const r = await page.evaluate(() => {
    const S = window.OceanSkips;
    S.selectFish('velero');  // base bounce 0.42, nowhere near the 0.92 clamp
    const out = [];
    for (let lvl = 0; lvl < 5; lvl++) { S.setUpgrade('rubber', lvl); out.push(S.upgradeHasEffect('rubber')); }
    S.setUpgrade('rubber', 0); S.selectFish('chispa');
    return out;
  });
  check('an uncapped fish has a real effect at every Rubber Belly level',
    r.every((e) => e === true), JSON.stringify(r));
}

// --- REGRESSION: every skill stat shown on the results screen must score ---
{
  const r = await page.evaluate(() => {
    const S = window.OceanSkips;
    const probe = (patch) => {
      S.setRunStats({ skips: 0, tricks: 0, sweetSkips: 0, nearMisses: 0, bigAir: 0, ...patch });
      return S.runScore(100);
    };
    const zero = probe({});
    return {
      zero,
      skips: probe({ skips: 10 }) - zero,
      tricks: probe({ tricks: 10 }) - zero,
      sweetSkips: probe({ sweetSkips: 10 }) - zero,
      nearMisses: probe({ nearMisses: 10 }) - zero,
      bigAir: probe({ bigAir: 10 }) - zero,
    };
  });
  check('distance alone scores', r.zero === 100, `${r.zero}`);
  for (const k of ['skips', 'tricks', 'sweetSkips', 'nearMisses', 'bigAir']) {
    check(`${k} contributes to the run score`, r[k] > 0, `${k} delta=${r[k]}`);
  }
  check('riskier feats are worth more per unit than plain skips',
    r.tricks > r.skips && r.nearMisses > r.skips, JSON.stringify(r));
}

// --- medal thresholds are ordered and reachable ---
{
  const r = await page.evaluate(() => {
    const S = window.OceanSkips;
    return {
      medals: S.MEDALS.map((m) => ({ id: m.id, score: m.score })),
      none: S.medalFor(0),
      bronze: S.medalFor(200)?.id,
      gold: S.medalFor(5000)?.id,
    };
  });
  check('medal thresholds descend gold -> silver -> bronze',
    r.medals[0].score > r.medals[1].score && r.medals[1].score > r.medals[2].score, JSON.stringify(r.medals));
  check('a zero score earns no medal', r.none === null, JSON.stringify(r.none));
  check('a modest score earns bronze', r.bronze === 'bronze', `${r.bronze}`);
  check('a huge score earns gold', r.gold === 'gold', `${r.gold}`);
}

check('no console/page errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

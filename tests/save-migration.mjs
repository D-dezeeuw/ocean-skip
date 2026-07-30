#!/usr/bin/env node
// Verifies the oceanskips-save-v2 -> v3 migration: an existing v2 save
// (every fish free) is read once, gets an `unlocked` map that grandfathers
// in whichever fish was selected, keeps every other field intact, and is
// written back under the v3 key — while the v2 key itself is left alone on
// disk for rollback. Also checks a locked fish stays locked pre-migration
// and that a pearl-cost fish can be bought once affordable.
//
// Run: node tests/save-migration.mjs
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

// --- fresh install: no v2, no v3 — only chispa unlocked, everything else locked ---
await page.goto(GAME);
await page.waitForTimeout(300);
{
  const save = await page.evaluate(() => window.OceanSkips.save);
  const fishList = await page.evaluate(() => window.OceanSkips.fishList);
  check('a fresh save starts with only chispa unlocked',
    save.unlocked.chispa === true && Object.keys(save.unlocked).length === 1, JSON.stringify(save.unlocked));
  check('every other fish is defined with a non-free unlock condition',
    fishList.filter((f) => f.id !== 'chispa').every((f) => f.unlock.type !== 'free'), JSON.stringify(fishList));
}

// --- seed a v2-shaped save, then load fresh: migrates to v3, grandfathers the selected fish ---
const V2_SAVE = {
  food: 340, best: 612, runs: 14, fish: 'velero', muted: false,
  up: { power: 3, slick: 2, rubber: 1, magnet: 0, chili: 2, sail: 1 },
};
await page.evaluate((v2) => {
  localStorage.removeItem('oceanskips-save-v3');
  localStorage.setItem('oceanskips-save-v2', JSON.stringify(v2));
}, V2_SAVE);
await page.reload();
await page.waitForTimeout(300);
{
  const save = await page.evaluate(() => window.OceanSkips.save);
  check('migrated save keeps the v2 food/best/runs untouched',
    save.food === V2_SAVE.food && save.best === V2_SAVE.best && save.runs === V2_SAVE.runs, JSON.stringify(save));
  check('migrated save keeps upgrade levels untouched',
    JSON.stringify(save.up) === JSON.stringify(V2_SAVE.up), JSON.stringify(save.up));
  check('migrated save grandfathers in the previously-selected fish (velero)',
    save.unlocked.velero === true, JSON.stringify(save.unlocked));
  check('migrated save still has chispa unlocked',
    save.unlocked.chispa === true, JSON.stringify(save.unlocked));
  check('migrated save does NOT grandfather fish that were never selected',
    !save.unlocked.donatun, JSON.stringify(save.unlocked));
  check('migration starts pearls at 0 (v2 never had pearls)', save.pearls === 0, `${save.pearls}`);

  const v2Still = await page.evaluate(() => localStorage.getItem('oceanskips-save-v2'));
  check('the original v2 key is left untouched on disk for rollback',
    JSON.parse(v2Still).fish === 'velero' && JSON.parse(v2Still).food === 340, v2Still);

  const v3Written = await page.evaluate(() => localStorage.getItem('oceanskips-save-v3'));
  check('the migrated save was persisted under the v3 key', !!v3Written && JSON.parse(v3Written).food === 340,
    v3Written);
}

// --- reloading again reads v3 directly (no re-migration, no data loss) ---
await page.evaluate(() => { window.OceanSkips.grantPearls(5); });
await page.reload();
await page.waitForTimeout(300);
{
  const save = await page.evaluate(() => window.OceanSkips.save);
  check('a second load reads the v3 save directly (pearls granted before reload persisted)',
    save.pearls === 5, `${save.pearls}`);
}

// --- buying a pearl-cost fish (globo, 8 pearls) via the real menu UI
// unlocks it and spends exactly the listed cost ---
await page.evaluate(() => { window.OceanSkips.grantPearls(3); }); // now 8 total
await page.reload();
await page.waitForTimeout(300);
{
  const before = await page.evaluate(() => window.OceanSkips.save);
  check('8 pearls is exactly enough to afford globo (unlock.pearls=8)', before.pearls === 8, `${before.pearls}`);
  check('globo starts locked', !before.unlocked.globo, JSON.stringify(before.unlocked));

  const buyBtn = page.locator('.card:has-text("Globo") .lockbuy');
  await buyBtn.click();
  await page.waitForTimeout(50);
  const after = await page.evaluate(() => window.OceanSkips.save);
  check('buying globo unlocks it', after.unlocked.globo === true, JSON.stringify(after.unlocked));
  check('buying globo spends exactly 8 pearls', after.pearls === before.pearls - 8,
    `before=${before.pearls} after=${after.pearls}`);
}

check('no console/page errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

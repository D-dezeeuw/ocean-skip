#!/usr/bin/env node
// Headless verification of the procedural audio design: wind whoosh tied to
// velocity/altitude, skip sounds differentiated by impact angle
// (vertical "splosh" vs horizontal "splish"), and the low-speed sink "blub".
//
// WebAudio output can't be "heard" here, so index.html logs every
// tone()/noiseBurst() call's computed parameters to window.OceanSkips.audioLog
// (see the logAudio() calls in index.html) — this drives real game code and
// checks the resulting parameters satisfy the intended relationships.
//
// Run: node tests/audio.mjs
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
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(GAME);
await page.waitForTimeout(400);
// unlock the AudioContext the same way playBtn's click handler does
await page.click('#playBtn');
await page.waitForTimeout(200);

async function logFor(fn) {
  await page.evaluate(() => window.OceanSkips.clearAudioLog());
  await page.evaluate(fn);
  return page.evaluate(() => window.OceanSkips.audioLog);
}

// --- skip: steep (vertical) vs shallow (horizontal) impact ---
const steepLog = await logFor(() => window.OceanSkips.sfx.skip(900, 0.95)); // near-vertical plunge
const shallowLog = await logFor(() => window.OceanSkips.sfx.skip(900, 0.05)); // near-horizontal graze
const steepTone = steepLog.find((e) => e.fn === 'tone'), shallowTone = shallowLog.find((e) => e.fn === 'tone');
const steepNoise = steepLog.find((e) => e.fn === 'noiseBurst'), shallowNoise = shallowLog.find((e) => e.fn === 'noiseBurst');

check('vertical impact ("splosh") is lower-pitched than horizontal ("splish")',
  steepTone.freq < shallowTone.freq, `steep=${steepTone.freq} shallow=${shallowTone.freq}`);
check('vertical impact has a longer decay (rounder splosh)', steepTone.dur > shallowTone.dur,
  `steep=${steepTone.dur} shallow=${shallowTone.dur}`);
check('vertical impact is louder', steepTone.vol > shallowTone.vol, `steep=${steepTone.vol} shallow=${shallowTone.vol}`);
check('noise burst also drops in frequency for the vertical splosh',
  steepNoise.freq < shallowNoise.freq, `steep=${steepNoise.freq} shallow=${shallowNoise.freq}`);

// --- skip: speed still adds brightness/volume at a fixed angle ---
const slowLog = await logFor(() => window.OceanSkips.sfx.skip(200, 0.5));
const fastLog = await logFor(() => window.OceanSkips.sfx.skip(2000, 0.5));
const slowTone = slowLog.find((e) => e.fn === 'tone'), fastTone = fastLog.find((e) => e.fn === 'tone');
check('faster impact (same angle) is brighter and louder',
  fastTone.freq > slowTone.freq && fastTone.vol > slowTone.vol,
  `slow=${JSON.stringify(slowTone)} fast=${JSON.stringify(fastTone)}`);

// --- blub: descending double-blip ---
const blubLog = await logFor(() => window.OceanSkips.sfx.blub());
const blubTones = blubLog.filter((e) => e.fn === 'tone');
check('blub has two tones', blubTones.length === 2, `count=${blubTones.length}`);
check('blub descends in pitch', blubTones.length === 2 && blubTones[1].freq < blubTones[0].freq, JSON.stringify(blubTones));
check('blub second tone is delayed (glug-glug, not simultaneous)',
  blubTones.length === 2 && blubTones[1].delay > blubTones[0].delay, JSON.stringify(blubTones));

// --- wind: velocity -> volume + pitch ---
await page.evaluate(() => window.OceanSkips.clearAudioLog());
await page.evaluate(() => window.OceanSkips.updateWindAudio(50, 300));   // low speed
await page.evaluate(() => window.OceanSkips.updateWindAudio(1300, 300)); // high speed
const windSpeedLog = await page.evaluate(() => window.OceanSkips.audioLog.filter((e) => e.fn === 'wind'));
check('higher velocity is louder wind', windSpeedLog[1].gain > windSpeedLog[0].gain, JSON.stringify(windSpeedLog));
check('higher velocity is higher-pitched wind', windSpeedLog[1].freq > windSpeedLog[0].freq, JSON.stringify(windSpeedLog));
check('low velocity wind is quiet (near silent)', windSpeedLog[0].gain < 0.02, `gain=${windSpeedLog[0].gain}`);

// --- wind: altitude (shelter) still matters at a fixed speed ---
await page.evaluate(() => window.OceanSkips.clearAudioLog());
await page.evaluate(() => window.OceanSkips.updateWindAudio(900, 10));   // low altitude, sheltered
await page.evaluate(() => window.OceanSkips.updateWindAudio(900, 400));  // high altitude
const windAltLog = await page.evaluate(() => window.OceanSkips.audioLog.filter((e) => e.fn === 'wind'));
check('higher altitude is louder wind at the same speed', windAltLog[1].gain > windAltLog[0].gain, JSON.stringify(windAltLog));

// --- dynamic mariachi loop: a higher skip-combo tier schedules more music
// events (melody joins at x3, lead at x5) — the music itself should read
// as "getting busier" as the combo builds. Get into flight (the scheduler
// only arms the melody/lead layers while state === 'fly') then pause so
// no gameplay-triggered sfx (skips, wind, etc) pollute the sample —
// scheduleMusic runs on its own setInterval, independent of the paused
// render loop, so it keeps producing notes while paused.
// #playBtn only exists on the menu screen — reload fresh since the run
// started at the top of this file already left it behind.
await page.goto(GAME);
await page.waitForTimeout(300);
await page.click('#playBtn');
await page.waitForTimeout(150);
await page.mouse.down(); await page.mouse.up(); // toss
await page.waitForTimeout(230);
await page.mouse.down(); await page.mouse.up(); // swing -> fly
await page.waitForTimeout(60);
await page.evaluate(() => window.OceanSkips.togglePause());
await page.waitForTimeout(50);

await page.evaluate(() => { window.OceanSkips.clearAudioLog(); window.OceanSkips.setCombo(0); });
await page.waitForTimeout(3000);
const lowTierCount = (await page.evaluate(() => window.OceanSkips.audioLog)).length;

await page.evaluate(() => { window.OceanSkips.clearAudioLog(); window.OceanSkips.setCombo(16); }); // tier 4, x5
await page.waitForTimeout(3000);
const highTierCount = (await page.evaluate(() => window.OceanSkips.audioLog)).length;

check('a higher combo tier schedules more music events than an empty combo',
  highTierCount > lowTierCount, `tier0=${lowTierCount} tier4=${highTierCount}`);

check('no console/page errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

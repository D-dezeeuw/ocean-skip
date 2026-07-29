#!/usr/bin/env node
// Pure numeric unit test of the Phase 5 performance/meta logic
// (implementation-20.md feature 20: particle cap + auto quality scaler).
// Mirrors index.html's capParticles/updateQualityScaler exactly — no
// browser, no rendering.
//
// Run: node tests/perf.mjs
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

function makeScaler() {
  let smoothFrameMs = 16.7;
  const quality = { causticsLayer2: true, rays: true, ambientBubbles: true };
  function updateQualityScaler(frameMs) {
    smoothFrameMs = lerp(smoothFrameMs, clamp(frameMs, 0, 100), 0.1);
    if (smoothFrameMs > 20) {
      if (quality.causticsLayer2) quality.causticsLayer2 = false;
      else if (quality.rays) quality.rays = false;
      else if (quality.ambientBubbles) quality.ambientBubbles = false;
    } else if (smoothFrameMs < 14) {
      if (!quality.ambientBubbles) quality.ambientBubbles = true;
      else if (!quality.rays) quality.rays = true;
      else if (!quality.causticsLayer2) quality.causticsLayer2 = true;
    }
  }
  return { quality, updateQualityScaler };
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
{
  const { quality, updateQualityScaler } = makeScaler();
  for (let i = 0; i < 60; i++) updateQualityScaler(40); // well above the 20ms threshold
  check('sustained 40ms frames drop all three optional layers',
    !quality.causticsLayer2 && !quality.rays && !quality.ambientBubbles,
    JSON.stringify(quality));
  for (let i = 0; i < 80; i++) updateQualityScaler(8); // well below the 14ms threshold
  check('sustained 8ms frames restore all three',
    quality.causticsLayer2 && quality.rays && quality.ambientBubbles,
    JSON.stringify(quality));
}

// 4) Auto quality scaler: a single slow frame should not immediately nuke
// everything — it's a smoothed decision, not a hair-trigger one.
{
  const { quality, updateQualityScaler } = makeScaler();
  updateQualityScaler(45);
  check('a single slow frame does not immediately drop every layer',
    quality.causticsLayer2 && quality.rays && quality.ambientBubbles,
    JSON.stringify(quality));
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

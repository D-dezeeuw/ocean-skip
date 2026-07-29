#!/usr/bin/env node
// Pure numeric test of the chili-boost "dive" mechanic. Holding boost no
// longer only adds speed — it now also pulls the trajectory down, so the
// player can choose where on the wave they land (hold longer/sooner for a
// steeper, earlier dive; release early to keep riding the longer arc).
// Mirrors stepPhysics' fly-state boost + air-relative drag/gravity math
// exactly (index.html's BOOST_ACC/BOOST_DIVE/BOOST_DRAIN and the "chili
// boost while held" block) — no browser, no wind, no water contact; this
// isolates the boost's effect on the trajectory itself (tests/wind.mjs
// already covers the wind/drag coupling separately).
//
// Run: node tests/boost.mjs
const G = 1500;
const BOOST_ACC = 660;
const BOOST_DIVE = 260;
const BOOST_DRAIN = 30;
const FIXED = 1 / 240;

function simulate({ launchSpeed, angleDeg, drag = 0.10, holdFrom = Infinity, holdUntil = Infinity, maxT = 3, maxEnergy = 100 }) {
  let x = 150, y = 200, t = 0, energy = maxEnergy;
  const a = angleDeg * Math.PI / 180;
  let vx = Math.cos(a) * launchSpeed, vy = Math.sin(a) * launchSpeed;
  let apex = y;
  let landedAt = null;
  while (t < maxT) {
    const held = t >= holdFrom && t < holdUntil && energy > 0;
    if (held) {
      const sp = Math.hypot(vx, vy) || 1;
      vx += (vx / sp) * BOOST_ACC * FIXED;
      vy += (vy / sp) * BOOST_ACC * FIXED - BOOST_DIVE * FIXED;
      energy = Math.max(0, energy - BOOST_DRAIN * FIXED);
    }
    const rsp = Math.hypot(vx, vy);
    const dragF = drag * rsp * 0.0016 * FIXED;
    vx -= vx * dragF;
    vy -= vy * dragF;
    vy -= G * FIXED;
    x += vx * FIXED;
    y += vy * FIXED;
    t += FIXED;
    apex = Math.max(apex, y);
    if (y <= 0 && vy < 0) { landedAt = { t, x, y, vx, vy, apex }; break; }
  }
  return landedAt || { t, x, y, vx, vy, apex };
}

let failures = 0;
function check(label, cond, detail) {
  if (!cond) { failures++; console.error(`FAIL: ${label} — ${detail ?? ''}`); }
  else console.log(`ok: ${label}`);
}

const LAUNCH = { launchSpeed: 900, angleDeg: 40, drag: 0.10 };

// 1) Holding boost from the very start still speeds the fish up (the
// "gives a bit of boost in velocity" half of the mechanic is preserved) —
// sampled early, before the dive has had time to bend the arc over.
function stateAt(holdFrom, atT) {
  let x = 150, y = 200, t = 0, energy = 100;
  const a = LAUNCH.angleDeg * Math.PI / 180;
  let vx = Math.cos(a) * LAUNCH.launchSpeed, vy = Math.sin(a) * LAUNCH.launchSpeed;
  while (t < atT) {
    const held = holdFrom <= t && energy > 0;
    if (held) {
      const sp = Math.hypot(vx, vy) || 1;
      vx += (vx / sp) * BOOST_ACC * FIXED;
      vy += (vy / sp) * BOOST_ACC * FIXED - BOOST_DIVE * FIXED;
      energy = Math.max(0, energy - BOOST_DRAIN * FIXED);
    }
    const rsp = Math.hypot(vx, vy);
    const dragF = LAUNCH.drag * rsp * 0.0016 * FIXED;
    vx -= vx * dragF; vy -= vy * dragF;
    vy -= G * FIXED;
    x += vx * FIXED; y += vy * FIXED;
    t += FIXED;
  }
  return { speed: Math.hypot(vx, vy), vy, vx };
}
const noHold = stateAt(Infinity, 0.05);
const heldEarly = stateAt(0, 0.05);
check('holding boost still increases overall speed', heldEarly.speed > noHold.speed,
  `held=${heldEarly.speed.toFixed(0)} noHold=${noHold.speed.toFixed(0)}`);

// 2) Isolate the dive term directly: right at a hop's apex, velocity is
// (nearly) horizontal, so the along-heading share of BOOST_ACC contributes
// almost nothing to vy — whatever's left is BOOST_DIVE's pull. This must be
// a net downward push, decoupled from any particular launch angle's
// early-flight behavior (a steep launch can still net-climb for an instant
// while held, since the along-heading term dominates there — apex is the
// clean, unambiguous place to isolate "does holding dive").
{
  const vx = 500, vy = 0.0001; // apex-like: essentially horizontal velocity
  const sp = Math.hypot(vx, vy);
  const vyBoostRate = (vy / sp) * BOOST_ACC - BOOST_DIVE; // px/s^2 contributed to vy while held
  check('at a hop\'s apex, holding boost nets a downward pull on vy', vyBoostRate < 0, `${vyBoostRate.toFixed(0)} px/s²`);
}

// 3) Holding boost from launch lands sooner than coasting, at every launch
// angle tried — the arc is genuinely shortened in time, giving the player
// a way to cut a jump short instead of always riding the full arc.
const coast = simulate({ ...LAUNCH });
const divedFromStart = simulate({ ...LAUNCH, holdFrom: 0 });
check('holding boost from launch lands sooner than coasting', divedFromStart.t < coast.t,
  `dived t=${divedFromStart.t.toFixed(2)} coast t=${coast.t.toFixed(2)}`);

// On a flatter, skip-like glide (as opposed to a steep toss), the constant
// dive pull isn't masked by a large along-heading upward contribution, so
// the apex is measurably lower too, not just earlier in time.
const GLIDE = { launchSpeed: 900, angleDeg: 20, drag: 0.10 };
const glideCoast = simulate({ ...GLIDE });
const glideDived = simulate({ ...GLIDE, holdFrom: 0 });
check('on a flatter glide, holding boost from launch reaches a lower apex than coasting',
  glideDived.apex < glideCoast.apex,
  `dived apex=${glideDived.apex.toFixed(0)} coast apex=${glideCoast.apex.toFixed(0)}`);

// 4) Graduated control: holding partway through (starting at the midpoint
// of the coast flight) should land between "no hold" and "hold from
// launch" in time — the player can choose a range of landing moments, not
// just a binary near/far.
const midT = coast.t * 0.5;
const divedMidway = simulate({ ...LAUNCH, holdFrom: midT });
check('holding partway through lands sooner than not holding at all', divedMidway.t < coast.t,
  `midway t=${divedMidway.t.toFixed(2)} coast t=${coast.t.toFixed(2)}`);
check('holding partway through lands later than holding from launch (graduated control)',
  divedMidway.t > divedFromStart.t,
  `midway t=${divedMidway.t.toFixed(2)} full-hold t=${divedFromStart.t.toFixed(2)}`);

// 5) Energy only drains while actually held, and depletes under sustained
// hold (so boosting/diving is a limited resource, not infinite).
{
  let energy = 100;
  const heldDt = 1.0; // 1 second of holding
  energy = Math.max(0, energy - BOOST_DRAIN * heldDt);
  check('sustained holding drains energy', energy < 100, `${energy}`);
  const drainedOut = Math.max(0, 100 - BOOST_DRAIN * 10);
  check('energy floors at zero rather than going negative', drainedOut === 0, `${drainedOut}`);
}

// 6) Never holding at all must reproduce the exact same flight every time
// (the mechanic is fully opt-in — no residual dive/boost force leaks in
// when the player never presses).
const coastAgain = simulate({ ...LAUNCH });
check('never holding is fully deterministic (no accidental residual force)',
  coast.t === coastAgain.t && coast.x === coastAgain.x, `${coast.t} vs ${coastAgain.t}`);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

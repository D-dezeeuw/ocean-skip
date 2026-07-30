#!/usr/bin/env node
// Pure numeric test of the skip-combo multiplier tier math. Mirrors
// index.html's COMBO_TIER/MULT_MAX/mult() exactly (mult() reads run.combo;
// here it's parameterized so this needs no browser) — a clean skip should
// step the multiplier up by exactly one every COMBO_TIER skips, capping at
// 1 + MULT_MAX.
//
// Run: node tests/combo.mjs
const COMBO_TIER = 4;
const MULT_MAX = 4;
function mult(combo) { return 1 + Math.min(MULT_MAX, Math.floor(combo / COMBO_TIER)); }

let failures = 0;
function check(label, cond, detail) {
  if (!cond) { failures++; console.error(`FAIL: ${label} — ${detail ?? ''}`); }
  else console.log(`ok: ${label}`);
}

check('an empty combo pays out at x1 (no bonus)', mult(0) === 1, `${mult(0)}`);
check('just under the first tier boundary still pays x1', mult(COMBO_TIER - 1) === 1, `${mult(COMBO_TIER - 1)}`);
check('hitting the first tier boundary steps up to x2', mult(COMBO_TIER) === 2, `${mult(COMBO_TIER)}`);
check('the multiplier holds flat across a full tier', mult(COMBO_TIER) === mult(COMBO_TIER * 2 - 1),
  `${mult(COMBO_TIER)} vs ${mult(COMBO_TIER * 2 - 1)}`);
check('four tiers in gives x5 (1 + MULT_MAX)', mult(COMBO_TIER * MULT_MAX) === 1 + MULT_MAX,
  `${mult(COMBO_TIER * MULT_MAX)}`);
check('the multiplier never exceeds 1 + MULT_MAX, however long the streak',
  mult(COMBO_TIER * (MULT_MAX + 10)) === 1 + MULT_MAX, `${mult(COMBO_TIER * (MULT_MAX + 10))}`);

// monotonic: a longer streak never pays out less than a shorter one
let monotonic = true, prev = mult(0);
for (let c = 1; c <= COMBO_TIER * (MULT_MAX + 3); c++) {
  const m = mult(c);
  if (m < prev) monotonic = false;
  prev = m;
}
check('multiplier is monotonically non-decreasing as the combo grows', monotonic);

// tier-up boundaries occur exactly on multiples of COMBO_TIER, nowhere else
let boundariesCorrect = true;
for (let c = 1; c < COMBO_TIER * MULT_MAX; c++) {
  const steppedUp = mult(c) > mult(c - 1);
  const onBoundary = c % COMBO_TIER === 0;
  if (steppedUp !== onBoundary) boundariesCorrect = false;
}
check('tier-ups land exactly on COMBO_TIER multiples, not in between', boundariesCorrect);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

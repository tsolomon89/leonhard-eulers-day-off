import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EASING_FUNCTIONS,
  EASING_KEYS,
  EASING_GROUPS,
  getEasing,
  easingDisplayName,
} from '../js/easing.js';

const EPS = 1e-9;

function approx(a, b, eps = EPS) {
  return Math.abs(a - b) <= eps;
}

// ── Inventory ────────────────────────────────────────────────

test('EASING_FUNCTIONS contains 32 entries', () => {
  assert.equal(EASING_KEYS.length, 32);
});

test('every key in EASING_FUNCTIONS is a function', () => {
  for (const key of EASING_KEYS) {
    assert.equal(typeof EASING_FUNCTIONS[key], 'function', `${key} is not a function`);
  }
});

test('EASING_GROUPS covers all keys', () => {
  const grouped = EASING_GROUPS.flatMap(g => g.keys);
  assert.equal(grouped.length, EASING_KEYS.length, 'group count mismatch');
  for (const key of EASING_KEYS) {
    assert.ok(grouped.includes(key), `${key} missing from EASING_GROUPS`);
  }
});

// ── Boundary conditions ──────────────────────────────────────

test('all easing functions return 0 at t=0', () => {
  for (const key of EASING_KEYS) {
    const v = EASING_FUNCTIONS[key](0);
    assert.ok(approx(v, 0, 1e-6), `${key}(0) = ${v}, expected 0`);
  }
});

test('all easing functions return 1 at t=1', () => {
  for (const key of EASING_KEYS) {
    const v = EASING_FUNCTIONS[key](1);
    assert.ok(approx(v, 1, 1e-6), `${key}(1) = ${v}, expected 1`);
  }
});

// ── Midpoint sanity ──────────────────────────────────────────

test('linear(0.5) = 0.5', () => {
  assert.ok(approx(EASING_FUNCTIONS.linear(0.5), 0.5));
});

test('smoothstep(0.5) = 0.5', () => {
  assert.ok(approx(EASING_FUNCTIONS.smoothstep(0.5), 0.5));
});

test('easeInOutQuad(0.5) = 0.5', () => {
  assert.ok(approx(EASING_FUNCTIONS.easeInOutQuad(0.5), 0.5));
});

test('easeInOutSine(0.5) = 0.5', () => {
  assert.ok(approx(EASING_FUNCTIONS.easeInOutSine(0.5), 0.5));
});

// ── Monotonicity for basic families ──────────────────────────
// (not tested for back/elastic/bounce which overshoot)

const MONOTONIC_KEYS = EASING_KEYS.filter(k =>
  !k.includes('Back') && !k.includes('Elastic') && !k.includes('Bounce')
);

test('monotonic easing functions are non-decreasing from 0 to 1', () => {
  for (const key of MONOTONIC_KEYS) {
    const fn = EASING_FUNCTIONS[key];
    let prev = fn(0);
    for (let i = 1; i <= 100; i++) {
      const t = i / 100;
      const v = fn(t);
      assert.ok(v >= prev - 1e-9, `${key} decreased at t=${t}: ${prev} → ${v}`);
      prev = v;
    }
  }
});

// ── easeIn vs easeOut asymmetry ──────────────────────────────

const FAMILIES = ['Quad', 'Cubic', 'Quart', 'Quint', 'Sine', 'Expo', 'Circ'];

test('easeIn is below 0.5 at t=0.5 for standard families', () => {
  for (const fam of FAMILIES) {
    const fn = EASING_FUNCTIONS[`easeIn${fam}`];
    assert.ok(fn(0.5) < 0.5, `easeIn${fam}(0.5) should be < 0.5, got ${fn(0.5)}`);
  }
});

test('easeOut is above 0.5 at t=0.5 for standard families', () => {
  for (const fam of FAMILIES) {
    const fn = EASING_FUNCTIONS[`easeOut${fam}`];
    assert.ok(fn(0.5) > 0.5, `easeOut${fam}(0.5) should be > 0.5, got ${fn(0.5)}`);
  }
});

// ── InOut symmetry ───────────────────────────────────────────

test('easeInOut(0.5) ≈ 0.5 for all InOut variants', () => {
  for (const fam of FAMILIES) {
    const fn = EASING_FUNCTIONS[`easeInOut${fam}`];
    assert.ok(approx(fn(0.5), 0.5, 0.001), `easeInOut${fam}(0.5) = ${fn(0.5)}, expected ≈0.5`);
  }
});

// ── Back overshoot ───────────────────────────────────────────

test('easeInBack goes negative near t=0', () => {
  const v = EASING_FUNCTIONS.easeInBack(0.1);
  assert.ok(v < 0, `easeInBack(0.1) should be negative, got ${v}`);
});

test('easeOutBack exceeds 1 near t=0.9', () => {
  const v = EASING_FUNCTIONS.easeOutBack(0.9);
  assert.ok(v > 1, `easeOutBack(0.9) should exceed 1, got ${v}`);
});

// ── Elastic overshoot ────────────────────────────────────────

test('easeOutElastic overshoots beyond 1 mid-range', () => {
  // Elastic oscillates — at least one sample should exceed 1
  let hasOvershoot = false;
  for (let i = 1; i < 100; i++) {
    if (EASING_FUNCTIONS.easeOutElastic(i / 100) > 1) {
      hasOvershoot = true;
      break;
    }
  }
  assert.ok(hasOvershoot, 'easeOutElastic should overshoot beyond 1');
});

// ── Bounce contacts ──────────────────────────────────────────

test('easeOutBounce returns values in [0,1]', () => {
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const v = EASING_FUNCTIONS.easeOutBounce(t);
    assert.ok(v >= -EPS && v <= 1 + EPS, `easeOutBounce(${t}) = ${v} out of [0,1]`);
  }
});

// ── Helper: getEasing ────────────────────────────────────────

test('getEasing returns matching function or linear fallback', () => {
  assert.equal(getEasing('easeInQuad'), EASING_FUNCTIONS.easeInQuad);
  assert.equal(getEasing('nonexistent'), EASING_FUNCTIONS.linear);
  assert.equal(getEasing(null), EASING_FUNCTIONS.linear);
});

// ── Helper: easingDisplayName ────────────────────────────────

test('easingDisplayName formats keys correctly', () => {
  assert.equal(easingDisplayName('linear'), 'Linear');
  assert.equal(easingDisplayName('smoothstep'), 'Smoothstep');
  assert.ok(easingDisplayName('easeInOutQuad').includes('In-Out'));
  assert.ok(easingDisplayName('easeInCubic').includes('In'));
  assert.ok(easingDisplayName('easeOutExpo').includes('Out'));
});

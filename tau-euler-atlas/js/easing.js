// ═══════════════════════════════════════════════════════════════
//  easing.js — Exhaustive easing function library
//  τ-Euler Atlas · Scene Timeline
//
//  31 easing functions. Each maps t ∈ [0,1] → output.
//  Most output ∈ [0,1]; back/elastic/bounce may overshoot.
// ═══════════════════════════════════════════════════════════════

const PI = Math.PI;
const HALF_PI = PI / 2;
const TAU = 2 * PI;

// ── Bounce helper (used by easeInBounce / easeInOutBounce) ───

function _bounceOut(t) {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) { const u = t - 1.5 / 2.75; return 7.5625 * u * u + 0.75; }
  if (t < 2.5 / 2.75) { const u = t - 2.25 / 2.75; return 7.5625 * u * u + 0.9375; }
  const u = t - 2.625 / 2.75;
  return 7.5625 * u * u + 0.984375;
}

// ── Back constant ────────────────────────────────────────────

const C1 = 1.70158;
const C2 = C1 * 1.525;
const C3 = C1 + 1;

// ── Elastic constants ────────────────────────────────────────

const E1 = TAU / 3;
const E2 = TAU / 4.5;

// ── Function map ─────────────────────────────────────────────

export const EASING_FUNCTIONS = Object.freeze({

  // ── Linear ──────────────────────────────────────────────────
  linear: (t) => t,

  // ── Smoothstep ──────────────────────────────────────────────
  smoothstep: (t) => t * t * (3 - 2 * t),

  // ── Quadratic ───────────────────────────────────────────────
  easeInQuad:    (t) => t * t,
  easeOutQuad:   (t) => t * (2 - t),
  easeInOutQuad: (t) => t < 0.5
    ? 2 * t * t
    : -1 + (4 - 2 * t) * t,

  // ── Cubic ───────────────────────────────────────────────────
  easeInCubic:    (t) => t * t * t,
  easeOutCubic:   (t) => { const u = t - 1; return u * u * u + 1; },
  easeInOutCubic: (t) => t < 0.5
    ? 4 * t * t * t
    : 1 + (t - 1) * (2 * t - 2) * (2 * t - 2),

  // ── Quartic ─────────────────────────────────────────────────
  easeInQuart:    (t) => t * t * t * t,
  easeOutQuart:   (t) => { const u = t - 1; return 1 - u * u * u * u; },
  easeInOutQuart: (t) => t < 0.5
    ? 8 * t * t * t * t
    : 1 - 8 * (t - 1) * (t - 1) * (t - 1) * (t - 1),

  // ── Quintic ─────────────────────────────────────────────────
  easeInQuint:    (t) => t * t * t * t * t,
  easeOutQuint:   (t) => { const u = t - 1; return 1 + u * u * u * u * u; },
  easeInOutQuint: (t) => t < 0.5
    ? 16 * t * t * t * t * t
    : 1 + 16 * (t - 1) * (t - 1) * (t - 1) * (t - 1) * (t - 1),

  // ── Sinusoidal ──────────────────────────────────────────────
  easeInSine:    (t) => 1 - Math.cos(t * HALF_PI),
  easeOutSine:   (t) => Math.sin(t * HALF_PI),
  easeInOutSine: (t) => -(Math.cos(PI * t) - 1) / 2,

  // ── Exponential ─────────────────────────────────────────────
  easeInExpo:    (t) => t === 0 ? 0 : Math.pow(2, 10 * (t - 1)),
  easeOutExpo:   (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInOutExpo: (t) => {
    if (t === 0 || t === 1) return t;
    return t < 0.5
      ? Math.pow(2, 20 * t - 10) / 2
      : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },

  // ── Circular ────────────────────────────────────────────────
  easeInCirc:    (t) => 1 - Math.sqrt(1 - t * t),
  easeOutCirc:   (t) => Math.sqrt(1 - (t - 1) * (t - 1)),
  easeInOutCirc: (t) => t < 0.5
    ? (1 - Math.sqrt(1 - 4 * t * t)) / 2
    : (Math.sqrt(1 - (-2 * t + 2) * (-2 * t + 2)) + 1) / 2,

  // ── Back (overshoot) ────────────────────────────────────────
  easeInBack:    (t) => C3 * t * t * t - C1 * t * t,
  easeOutBack:   (t) => { const u = t - 1; return 1 + C3 * u * u * u + C1 * u * u; },
  easeInOutBack: (t) => t < 0.5
    ? ((2 * t) * (2 * t) * ((C2 + 1) * 2 * t - C2)) / 2
    : ((2 * t - 2) * (2 * t - 2) * ((C2 + 1) * (2 * t - 2) + C2) + 2) / 2,

  // ── Elastic ─────────────────────────────────────────────────
  easeInElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * E1);
  },
  easeOutElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * E1) + 1;
  },
  easeInOutElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return t < 0.5
      ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * E2)) / 2
      : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * E2)) / 2 + 1;
  },

  // ── Bounce ──────────────────────────────────────────────────
  easeInBounce:    (t) => 1 - _bounceOut(1 - t),
  easeOutBounce:   (t) => _bounceOut(t),
  easeInOutBounce: (t) => t < 0.5
    ? (1 - _bounceOut(1 - 2 * t)) / 2
    : (1 + _bounceOut(2 * t - 1)) / 2,
});

// ── Grouped for UI dropdown ──────────────────────────────────

export const EASING_GROUPS = Object.freeze([
  { label: 'Basic',       keys: ['linear', 'smoothstep'] },
  { label: 'Quadratic',   keys: ['easeInQuad', 'easeOutQuad', 'easeInOutQuad'] },
  { label: 'Cubic',       keys: ['easeInCubic', 'easeOutCubic', 'easeInOutCubic'] },
  { label: 'Quartic',     keys: ['easeInQuart', 'easeOutQuart', 'easeInOutQuart'] },
  { label: 'Quintic',     keys: ['easeInQuint', 'easeOutQuint', 'easeInOutQuint'] },
  { label: 'Sinusoidal',  keys: ['easeInSine', 'easeOutSine', 'easeInOutSine'] },
  { label: 'Exponential', keys: ['easeInExpo', 'easeOutExpo', 'easeInOutExpo'] },
  { label: 'Circular',    keys: ['easeInCirc', 'easeOutCirc', 'easeInOutCirc'] },
  { label: 'Back',        keys: ['easeInBack', 'easeOutBack', 'easeInOutBack'] },
  { label: 'Elastic',     keys: ['easeInElastic', 'easeOutElastic', 'easeInOutElastic'] },
  { label: 'Bounce',      keys: ['easeInBounce', 'easeOutBounce', 'easeInOutBounce'] },
]);

// ── Helpers ──────────────────────────────────────────────────

/** Get an easing function by key, falling back to linear. */
export function getEasing(key) {
  return EASING_FUNCTIONS[key] || EASING_FUNCTIONS.linear;
}

/** All valid easing keys. */
export const EASING_KEYS = Object.freeze(Object.keys(EASING_FUNCTIONS));

/**
 * Display name for an easing key.
 * 'easeInOutQuad' → 'Ease In-Out Quad'
 */
export function easingDisplayName(key) {
  if (key === 'linear') return 'Linear';
  if (key === 'smoothstep') return 'Smoothstep';
  return key
    .replace(/^ease/, 'Ease ')
    .replace(/InOut/, 'In-Out ')
    .replace(/In(?!-)/, 'In ')
    .replace(/Out(?!$)/, 'Out ')
    .replace(/Quad$/, 'Quad')
    .replace(/Cubic$/, 'Cubic')
    .replace(/Quart$/, 'Quart')
    .replace(/Quint$/, 'Quint')
    .replace(/Sine$/, 'Sine')
    .replace(/Expo$/, 'Expo')
    .replace(/Circ$/, 'Circ')
    .replace(/Back$/, 'Back')
    .replace(/Elastic$/, 'Elastic')
    .replace(/Bounce$/, 'Bounce')
    .trim();
}

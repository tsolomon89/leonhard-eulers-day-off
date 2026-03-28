// ═══════════════════════════════════════════════════════════════
//  complex.js — Complex arithmetic as [re, im] pairs
//  τ-Euler Atlas · Three.js Edition
// ═══════════════════════════════════════════════════════════════

export const TAU = 2 * Math.PI;

// ── Complex constructors & arithmetic ──────────────────────────
export const C    = (r, i) => [r, i];
export const cAdd = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const cSub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const cMul = (a, b) => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0]
];
export const cDiv = (a, b) => {
  const d = b[0] * b[0] + b[1] * b[1];
  return d < 1e-30
    ? [NaN, NaN]
    : [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

export const cAbs = z => Math.hypot(z[0], z[1]);
export const cArg = z => Math.atan2(z[1], z[0]);

export const cExp = z => {
  const r = Math.exp(z[0]);
  return [r * Math.cos(z[1]), r * Math.sin(z[1])];
};

export const cLog = z => [Math.log(cAbs(z)), cArg(z)];

export const cPow = (base, exp) => cExp(cMul(exp, cLog(base)));

export const cSin = z => {
  const a = cExp([-z[1], z[0]]);
  const b = cExp([z[1], -z[0]]);
  return [(a[1] - b[1]) / 2, -(a[0] - b[0]) / 2];
};

export const cCos = z => {
  const a = cExp([-z[1], z[0]]);
  const b = cExp([z[1], -z[0]]);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
};

export const cTan = z => cDiv(cSin(z), cCos(z));

export const cNeg = z => [-z[0], -z[1]];
export const cInv = z => cDiv([1, 0], z);
export const cScl = (z, s) => [z[0] * s, z[1] * s];

export const ok = z =>
  isFinite(z[0]) && isFinite(z[1]) && !isNaN(z[0]) && !isNaN(z[1]);

// ── Zeta zeros (first 13 imaginary parts on critical line) ────
export const ZETA_ZEROS = [
  14.134725141734694, 21.022039638771555, 25.010857580145689,
  30.424876125859513, 32.935061587739190, 40.918719012147495,
  43.327073280915000, 48.005150881167160, 49.773832477672302,
  52.970321477714461, 56.446247697063395, 59.347044002602353,
  60.831778524609810
];

// ── Primes up to 997 ─────────────────────────────────────────
export const PRIMES = [
  2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,
  101,103,107,109,113,127,131,137,139,149,151,157,163,167,173,179,181,191,
  193,197,199,211,223,227,229,233,239,241,251,257,263,269,271,277,281,283,
  293,307,311,313,317,331,337,347,349,353,359,367,373,379,383,389,397,401,
  409,419,421,431,433,439,443,449,457,461,463,467,479,487,491,499,503,509,
  521,523,541,547,557,563,569,571,577,587,593,599,601,607,613,617,619,631,
  641,643,647,653,659,661,673,677,683,691,701,709,719,727,733,739,743,751,
  757,761,769,773,787,797,809,811,821,823,827,829,839,853,857,859,863,877,
  881,883,887,907,911,919,929,937,941,947,953,967,971,977,983,991,997
];

// ── 4 Color Quadrants (sign × i-sign) ────────────────────────
//    RED:    (−1, −1)  →  −e^{−iτ^k}  paired with  e^{+iτ^{−k}}
//    GREEN:  (−1, +1)  →  −e^{+iτ^k}  paired with  e^{−iτ^{−k}}
//    BLUE:   (+1, −1)  →  +e^{−iτ^k}  paired with −e^{+iτ^{−k}}
//    PURPLE: (+1, +1)  →  +e^{+iτ^k}  paired with −e^{−iτ^{−k}}
export const QUADS = [
  { name: 'RED',    s: -1, iS: -1, color: [1.0, 0.231, 0.188],  hex: '#ff3b30' },
  { name: 'GREEN',  s: -1, iS: +1, color: [0.204, 0.780, 0.349], hex: '#34c759' },
  { name: 'BLUE',   s: +1, iS: -1, color: [0.0, 0.478, 1.0],    hex: '#007aff' },
  { name: 'PURPLE', s: +1, iS: +1, color: [0.686, 0.322, 0.871], hex: '#af52de' },
];

// ── Trig pipeline ────────────────────────────────────────────
export const TRIG = [
  { label: 'id',  fn: z => z },
  { label: 'sin', fn: cSin },
  { label: 'cos', fn: cCos },
  { label: 'tan', fn: cTan },
];

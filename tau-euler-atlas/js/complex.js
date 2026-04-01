// ═══════════════════════════════════════════════════════════════
//  complex.js — Complex arithmetic as [re, im] pairs
//  τ-Euler Atlas · Three.js Edition
//
//  THE AXIOM:  τ is the unique constant where one unit of counting
//  equals one full rotation.  The τ-native form:
//
//      τ^{i · nτ / ln(τ)}  ≡  e^{iτn}
//
//  is algebraically identical to Euler's formula, but reveals
//  that τ is the substrate — e is infrastructure, not substrate.
//  (See: the-axiom.md, §11.4 and Appendix)
// ═══════════════════════════════════════════════════════════════

export const TAU = 2 * Math.PI;
export const LN_TAU = Math.log(TAU);  // ln(τ) — the bridge between base-e and base-τ

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
export const cLogBase = (z, base) => {
  const lnBase = Math.log(base);
  if (!isFinite(lnBase) || Math.abs(lnBase) < 1e-30) return [NaN, NaN];
  const lnZ = cLog(z);
  return [lnZ[0] / lnBase, lnZ[1] / lnBase];
};

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

// ── τ-native exponentiation ──────────────────────────────────
//    τ^z = e^{z · ln(τ)}
//    The whole point:  τ^{i·θ/ln(τ)} = e^{iθ}
//    τ is the base, e is just the converter.
export const cTauPow = (exp) => cExp(cScl(exp, LN_TAU));

// ── α-base exponentiation (for comparison proof) ─────────────
//    α^z = e^{z · ln(α)}
//    When α ≠ τ, one step ≠ one full turn.
//    This is how we PROVE τ is forced.
export const cAlphaPow = (alpha, exp) => {
  const lnAlpha = Math.log(alpha);
  return cExp(cScl(exp, lnAlpha));
};

export const ok = z =>
  isFinite(z[0]) && isFinite(z[1]) && !isNaN(z[0]) && !isNaN(z[1]);

// ── 4 Color Quadrants (sign × i-sign) ────────────────────────
//    In τ-native notation:
//    RED:    −τ^{i·τ^k/ln(τ)}    paired with  τ^{−i·τ^{−k}/ln(τ)}
//    GREEN:  −τ^{−i·τ^k/ln(τ)}   paired with  τ^{i·τ^{−k}/ln(τ)}
//    BLUE:   +τ^{i·τ^k/ln(τ)}    paired with −τ^{−i·τ^{−k}/ln(τ)}
//    PURPLE: +τ^{−i·τ^k/ln(τ)}   paired with −τ^{i·τ^{−k}/ln(τ)}
export const QUADS = [
  { name: 'RED',    s: -1, iS: -1, color: [1.0, 0.231, 0.188],  hex: '#ff3b30' },
  { name: 'GREEN',  s: -1, iS: +1, color: [0.204, 0.780, 0.349], hex: '#34c759' },
  { name: 'BLUE',   s: +1, iS: -1, color: [0.0, 0.478, 1.0],    hex: '#007aff' },
  { name: 'PURPLE', s: +1, iS: +1, color: [0.686, 0.322, 0.871], hex: '#af52de' },
];

// ── Trig pipeline ────────────────────────────────────────────
export const TRIG = [
  { label: 'base', fn: z => z },
  { label: 'sin', fn: cSin },
  { label: 'cos', fn: cCos },
  { label: 'tan', fn: cTan },
];

import { TAU } from './complex.js';

const EPS = 1e-12;

export function computeKFromT(T) {
  const safeT = Math.max(EPS, Number.isFinite(T) ? T : 1);
  return Math.log(safeT * TAU / 2) / Math.log(TAU);
}

export function computeTFromK(k) {
  const safeK = Number.isFinite(k) ? k : 1;
  return 2 * Math.pow(TAU, safeK - 1);
}

export function computeQ(q1, q2) {
  const safeQ1 = Number.isFinite(q1) ? q1 : 1;
  const safeQ2 = Number.isFinite(q2) ? q2 : 0;
  return safeQ1 * Math.pow(TAU, safeQ2);
}

export function computeD(T) {
  const safeT = Number.isFinite(T) ? T : 0;
  return Math.abs(2 * Math.cos((TAU / 2) * safeT));
}

export function computeCorr(qCorrection, d) {
  if (Number(qCorrection) <= 0) return 2;
  return Math.abs(d) < EPS ? 1 : d;
}

export function computeStepDelta(derived, dtSeconds) {
  const s = Number.isFinite(derived.s) ? derived.s : 0;
  const stepRate = Number.isFinite(derived.stepRate) ? derived.stepRate : 1;
  return s * stepRate * dtSeconds;
}

export function buildDerivedState(input) {
  const base = { ...input };

  // One-release alias compatibility: canonical Z, mirrored to legacy n.
  const zFromState = Number.isFinite(base.Z) ? base.Z : null;
  const zFromLegacy = Number.isFinite(base.n) ? base.n : null;
  let Z = zFromState ?? zFromLegacy ?? 710;
  Z = Math.max(1, Math.floor(Z));
  base.Z = Z;
  base.n = Z;

  const kMode = base.kMode === 'manual' ? 'manual' : 'derived';
  let T = Number.isFinite(base.T) ? base.T : 1.9999;
  let k = Number.isFinite(base.k) ? base.k : 1;

  if (kMode === 'manual') {
    T = computeTFromK(k);
  } else {
    k = computeKFromT(T);
  }

  const q1 = Number.isFinite(base.q1) ? base.q1 : 26.3;
  const q2 = Number.isFinite(base.q2) ? base.q2 : 0;
  const q = computeQ(q1, q2);
  const d = computeD(T);

  const q_a = Number(base.q_a) > 0 ? 1 : 0;
  const q_correction = Number(base.q_correction) > 0 ? 1 : 0;
  const corr = computeCorr(q_correction, d);

  const manual_k1 = !!base.manual_k1;
  const k1_manual = Number.isFinite(base.k1_manual)
    ? base.k1_manual
    : (Number.isFinite(base.k1) ? base.k1 : 1);

  let k1;
  if (manual_k1) {
    k1 = k1_manual;
  } else if (q_a === 0) {
    k1 = q1;
  } else {
    const denom = (q / 2) * corr;
    k1 = Math.abs(denom) > EPS ? TAU / denom : 1;
  }

  const qMode = manual_k1 ? 'manual' : (q_a === 0 ? 'direct' : 'derived');

  let l_base = Number.isFinite(base.l_base) ? base.l_base : 10;
  if (l_base <= 0 || Math.abs(l_base - 1) < EPS) l_base = 10;

  let b = Number.isFinite(base.b) ? base.b : 1000;
  if (Math.abs(b) < EPS) b = 1;
  const s = 1 / b;

  const stepRate = Number.isFinite(base.stepRate) ? base.stepRate : 1;
  const timeMode = base.timeMode === 'step' ? 'step' : 'animation';

  return {
    ...base,
    Z,
    n: Z,
    T,
    k,
    kMode,
    q1,
    q2,
    q,
    q_a,
    q_correction,
    corr,
    d,
    k1,
    k1_manual,
    manual_k1,
    qMode,
    l_base,
    b,
    s,
    stepRate,
    timeMode,
  };
}

export function applyDerivedState(state) {
  Object.assign(state, buildDerivedState(state));
  return state;
}

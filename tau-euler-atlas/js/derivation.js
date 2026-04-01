import { TAU } from './complex.js';

const EPS = 1e-12;
const PI = Math.PI;

export const PRIMES = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29,
  31, 37, 41, 43, 47, 53, 59, 61, 67, 71,
  73, 79, 83, 89, 97,
];

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

export function shouldAdvanceStep(derived, isPlaying) {
  return (
    !!isPlaying &&
    derived.timeMode === 'step' &&
    derived.kMode === 'derived'
  );
}

export function computeAlignedK(kValue) {
  const raw = Number.isFinite(kValue) ? kValue : 1;
  const alignedInput = Math.max(EPS, raw * PI);
  return Math.log(alignedInput) / Math.log(TAU);
}

export function buildNList(Z, nIsPrimeOnly, U_unit) {
  const safeZ = Math.max(1, Math.floor(Number.isFinite(Z) ? Z : 710));
  const unit = Number.isFinite(U_unit) ? U_unit : 1;
  const usePrimes = Number(nIsPrimeOnly) > 0;

  const source = usePrimes
    ? PRIMES.filter((p) => p < safeZ)
    : Array.from({ length: safeZ }, (_, i) => i);

  return source.map((v) => v * unit);
}

export function resolveLogBase(base, sourceMode, X) {
  const mode = sourceMode === 'X' ? 'X' : 'l_base';
  const candidate = mode === 'X' ? X : base;
  const fallback = Number.isFinite(base) ? base : 10;
  const validCandidate = Number.isFinite(candidate) && candidate > 0 && Math.abs(candidate - 1) > EPS;
  if (validCandidate) return candidate;
  if (Number.isFinite(fallback) && fallback > 0 && Math.abs(fallback - 1) > EPS) return fallback;
  return 10;
}

function normalizeVisGroup(group, expectedLength) {
  if (!group || !Array.isArray(group.vals)) return group;
  const vals = [...group.vals];
  const sizes = Array.isArray(group.sizes) ? [...group.sizes] : [];
  while (vals.length < expectedLength) vals.push(1);
  while (sizes.length < expectedLength) sizes.push(1);
  return {
    ...group,
    vals: vals.slice(0, expectedLength),
    sizes: sizes.slice(0, expectedLength),
  };
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
  const kStepsInAlignments = Number(base.kStepsInAlignments) > 0 ? 1 : 0;
  let k_value = Number.isFinite(base.k_value)
    ? base.k_value
    : (Number.isFinite(base.k) ? base.k : 1);
  let k = Number.isFinite(base.k) ? base.k : k_value;

  if (kStepsInAlignments > 0) {
    k = computeAlignedK(k_value);
    if (kMode === 'manual') {
      T = computeTFromK(k);
    }
  } else if (kMode === 'manual') {
    k = Number.isFinite(base.k) ? base.k : (Number.isFinite(k_value) ? k_value : k);
    k_value = k;
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

  const logXIsIndependentVar = Number(base.logXIsIndependentVar) > 0 ? 1 : 0;
  const X_n = Number.isFinite(base.X_n) ? base.X_n : k;
  const X = logXIsIndependentVar > 0 ? X_n : k;
  const logBaseSource = base.logBaseSource === 'X' ? 'X' : 'l_base';
  const logBase = resolveLogBase(l_base, logBaseSource, X);

  let b = Number.isFinite(base.b) ? base.b : 1000;
  if (Math.abs(b) < EPS) b = 1;
  const s = 1 / b;

  const stepRate = Number.isFinite(base.stepRate) ? base.stepRate : 1;
  const timeMode = base.timeMode === 'step' ? 'step' : 'animation';
  const syncTStepToS = base.syncTStepToS !== false;
  const tRegion = typeof base.tRegion === 'string' ? base.tRegion : 'full';

  const primaryTrigIndex = Math.max(0, Math.min(3, Math.floor(Number.isFinite(base.primaryTrigIndex) ? base.primaryTrigIndex : 1)));
  const k3 = Number.isFinite(base.k3) ? Math.max(EPS, base.k3) : 1;

  const nIsPrimeOnly = Number(base.nIsPrimeOnly) > 0 ? 1 : 0;
  const U_unit = Number.isFinite(base.U_unit) ? base.U_unit : 1;
  const nList = buildNList(Z, nIsPrimeOnly, U_unit);

  const P = Number.isFinite(base.P) ? base.P : 1;
  const P1 = P * (1 + TAU / Z);
  const eProof = Number.isFinite(base.eProof) ? base.eProof : NaN;

  const vis = base.vis;
  if (vis && vis.H) {
    const normalizedH = normalizeVisGroup(vis.H, 10);
    vis.H.vals = normalizedH.vals;
    vis.H.sizes = normalizedH.sizes;
  }

  return {
    ...base,
    Z,
    n: Z,
    T,
    k,
    k_value,
    kStepsInAlignments,
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
    logBaseSource,
    logBase,
    logXIsIndependentVar,
    X_n,
    X,
    b,
    s,
    stepRate,
    timeMode,
    syncTStepToS,
    tRegion,
    primaryTrigIndex,
    k3,
    nIsPrimeOnly,
    U_unit,
    nList,
    P,
    P1,
    eProof,
    vis,
  };
}

export function applyDerivedState(state) {
  Object.assign(state, buildDerivedState(state));
  return state;
}

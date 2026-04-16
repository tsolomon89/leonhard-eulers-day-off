import { TAU, clamp } from './complex.js';

const EPS = 1e-12;
export const COLOR_BLOCK_SIZE = 710;

function sanitizeLogBase(v, fallback) {
  const b = Number.isFinite(v) ? v : fallback;
  if (!Number.isFinite(b) || b <= 0 || Math.abs(b - 1) < EPS) return fallback;
  return b;
}

export function computeKAligned(T, lBase = 10) {
  const safeBase = sanitizeLogBase(lBase, 10);
  const safeT = Math.max(EPS, Number.isFinite(T) ? T : 1);
  const num = Math.log(safeT * TAU / 2) / Math.log(safeBase);
  const den = Math.log(TAU) / Math.log(safeBase);
  if (!Number.isFinite(num) || !Number.isFinite(den) || Math.abs(den) < EPS) return NaN;
  return num / den;
}

export function computeKFromT(T, lBase = 10) {
  return computeKAligned(T, lBase);
}

export function computeTFromK(k) {
  // In JSON-literal mode k can equal T (alignment bool off), so manual mapping keeps identity.
  return Number.isFinite(k) ? k : 2;
}

export function computeQ(qScale, qTauScale) {
  const safeScale = Number.isFinite(qScale) ? qScale : 1;
  const safeTauScale = Number.isFinite(qTauScale) ? qTauScale : 0;
  return safeScale * Math.pow(TAU, safeTauScale);
}

export function computeD(T) {
  const safeT = Number.isFinite(T) ? T : 0;
  return Math.abs(2 * Math.cos((TAU / 2) * safeT));
}

export function computeCorr(qCorrectionFloat, dCorrectionFunction) {
  const qCorr = clamp(Number.isFinite(qCorrectionFloat) ? qCorrectionFloat : 0, 0, 1);
  const baseCorr = 2;
  const targetCorr = (!Number.isFinite(dCorrectionFunction) || Math.abs(dCorrectionFunction) < EPS) ? 1 : dCorrectionFunction;
  return baseCorr + (targetCorr - baseCorr) * qCorr;
}

export function computeK1({
  qBool,
  qBoolFloat,
  qScale,
  q,
  qCorrection,
  qCorrectionFloat,
  dCorrectionFunction,
}) {
  // Support canonical keys (qBool/qCorrection) and legacy aliases (qBoolFloat/qCorrectionFloat).
  const qBlend = clamp(
    Number.isFinite(qBool) ? qBool : (Number.isFinite(qBoolFloat) ? qBoolFloat : 0),
    0,
    1,
  );
  const qCorr = Number.isFinite(qCorrection) ? qCorrection : qCorrectionFloat;
  const corr = computeCorr(qCorr, dCorrectionFunction);
  const denom = (q / 2) * corr;
  const targetK1 = (!Number.isFinite(denom) || Math.abs(denom) < EPS) ? 1 : TAU / denom;
  return qScale + (targetK1 - qScale) * qBlend;
}

export function buildNListFromDepths(nNegDepth, nPosDepth) {
  const negDepth = clamp(
    Math.floor(Number.isFinite(nNegDepth) ? nNegDepth : 0),
    0,
    50000,
  );
  const posDepth = clamp(
    Math.floor(Number.isFinite(nPosDepth) ? nPosDepth : 0),
    0,
    50000,
  );
  const nList = [];
  for (let i = negDepth; i >= 1; i--) nList.push(-i);
  nList.push(0);
  for (let i = 1; i <= posDepth; i++) nList.push(i);
  return nList;
}


export function buildDerivedState(input) {
  const base = { ...input };

  const nNegInput = Number.isFinite(base.n_negDepth) ? Math.floor(base.n_negDepth) : 355;
  const nPosInput = Number.isFinite(base.n_posDepth) ? Math.floor(base.n_posDepth) : 355;
  const n_negDepth = clamp(nNegInput, 0, 50000);
  const n_posDepth = clamp(nPosInput, 0, 50000);
  const nList = buildNListFromDepths(n_negDepth, n_posDepth);
  const n = nList.length;

  let T_lowerBound = Number.isFinite(base.T_lowerBound) ? base.T_lowerBound : 1.99999;
  let T_upperBound = Number.isFinite(base.T_upperBound) ? base.T_upperBound : 2;
  if (T_lowerBound > T_upperBound) {
    const temp = T_lowerBound;
    T_lowerBound = T_upperBound;
    T_upperBound = temp;
  }

  let T = Number.isFinite(base.T) ? base.T : 2;
  T = clamp(T, T_lowerBound, T_upperBound);

  const l_base = sanitizeLogBase(base.l_base, 10);
  const l_func = sanitizeLogBase(base.l_func, 10);

  const kStepsInAlignmentsFloat = clamp(Number.isFinite(base.kStepsInAlignmentsBool) ? base.kStepsInAlignmentsBool : 0, 0, 1);
  const kAligned = computeKAligned(T, l_base);
  const kTarget = Number.isFinite(kAligned) ? kAligned : T;
  const k = T + (kTarget - T) * kStepsInAlignmentsFloat;

  const q_scale = Number.isFinite(base.q_scale) ? base.q_scale : 1;
  const q_tauScale = Number.isFinite(base.q_tauScale) ? base.q_tauScale : 0;
  const q_bool_float = Number.isFinite(base.q_bool) ? base.q_bool : 0;
  const q_correction_float = Number.isFinite(base.q_correction) ? base.q_correction : 0;
  const q = computeQ(q_scale, q_tauScale);

  const d_CorrectionFunction = computeD(T);
  const corr = computeCorr(q_correction_float, d_CorrectionFunction);
  const k1 = computeK1({
    qBool: q_bool_float,
    qScale: q_scale,
    q,
    qCorrection: q_correction_float,
    dCorrectionFunction: d_CorrectionFunction,
  });

  const k2 = Number.isFinite(base.k2) ? base.k2 : 1;
  const k3 = Number.isFinite(base.k3) ? Math.max(EPS, base.k3) : 1;
  const pathBudgetRaw = Number.isFinite(base.pathBudget) ? base.pathBudget : 500;
  const pathBudget = Math.max(10, Math.min(50000, Math.floor(pathBudgetRaw)));

  let b = Number.isFinite(base.b) ? base.b : 36000000;
  if (Math.abs(b) < EPS) b = 1;
  const s = 1 / b;

  let q_scale_b = Number.isFinite(base.q_scale_b) ? base.q_scale_b : 1000;
  if (q_scale_b < 1) q_scale_b = 1;
  const q_scale_s = 1 / q_scale_b;

  // Read-compat for legacy traversal fields: accept on load, omit from normalized state.
  delete base.stepRate;
  delete base.timeMode;
  delete base.stepLoopMode;
  delete base.syncTStepToS;
  delete base.tRegion;
  delete base.precomputeBufferUnit;
  delete base.precomputeBufferValue;
  delete base.precomputeBufferFrames;
  delete base.bufferEnabled;
  delete base.bufferPhase;
  delete base.bufferProgress;
  delete base.bufferTargetFrames;
  delete base.bufferNotice;
  // Hard break for legacy n-domain fields.
  delete base.Z;
  delete base.Z_min;
  delete base.Z_max;

  const P = Number.isFinite(base.P) ? base.P : 1;
  const P1 = P * (1 + TAU / Math.max(1, n));
  const eProof = Number.isFinite(base.eProof) ? base.eProof : NaN;
  const formulaMode = base.formulaMode === 'euler' ? 'euler' : 'tau';
  const proofPanelOpen = base.proofPanelOpen === true;
  const proofResults = (base.proofResults && typeof base.proofResults === 'object')
    ? base.proofResults
    : null;

  return {
    ...base,
    n_negDepth,
    n_posDepth,
    n,
    nList,
    T,
    T_lowerBound,
    T_upperBound,
    l_base,
    l_func,
    kStepsInAlignmentsBool: kStepsInAlignmentsFloat,
    kAligned,
    k,
    q_scale,
    q_scale_b,
    q_scale_s,
    q_tauScale,
    q_bool: q_bool_float,
    q_correction: q_correction_float,
    q,
    corr,
    d_CorrectionFunction,
    k1,
    k2,
    k3,
    pathBudget,
    b,
    s,
    P,
    P1,
    eProof,
    formulaMode,
    proofPanelOpen,
    proofResults,

    // Back-compat mirrors retained for utility code/tests now.
    q1: q_scale,
    q2: q_tauScale,
    q_a: q_bool_float,
    d: d_CorrectionFunction,
    lBase: l_base,
  };
}

export function applyDerivedState(state) {
  delete state.Z;
  delete state.Z_min;
  delete state.Z_max;
  Object.assign(state, buildDerivedState(state));
  return state;
}

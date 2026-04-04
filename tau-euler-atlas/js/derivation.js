import { TAU } from './complex.js';
import {
  resolvePrecomputeBufferFrames,
  sanitizeBufferPhase,
} from './playback-buffer.js';

const EPS = 1e-12;
export const COLOR_BLOCK_SIZE = 710;
export const STEP_LOOP_MODES = ['clamp', 'bounce'];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function sanitizeStepLoopMode(mode) {
  return STEP_LOOP_MODES.includes(mode) ? mode : 'clamp';
}

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

export function computeCorr(qCorrection, dCorrectionFunction) {
  if (Number(qCorrection) <= 0) return 2;
  if (!Number.isFinite(dCorrectionFunction)) return 1;
  return Math.abs(dCorrectionFunction) < EPS ? 1 : dCorrectionFunction;
}

export function computeK1({
  qBool,
  qScale,
  q,
  qCorrection,
  dCorrectionFunction,
}) {
  if (Number(qBool) <= 0) return qScale;
  const corr = computeCorr(qCorrection, dCorrectionFunction);
  const denom = (q / 2) * corr;
  if (!Number.isFinite(denom) || Math.abs(denom) < EPS) return 1;
  return TAU / denom;
}

export function buildNListFromRange(ZMin, ZMaxExclusive) {
  const lo = Math.floor(Number.isFinite(ZMin) ? ZMin : 0);
  const hi = Math.floor(Number.isFinite(ZMaxExclusive) ? ZMaxExclusive : lo + 1);
  if (hi <= lo) return [];
  return Array.from({ length: hi - lo }, (_, i) => lo + i);
}

export function computeStepDelta(derived, dtSeconds) {
  const s = Number.isFinite(derived.s) ? derived.s : 0;
  return s * dtSeconds;
}

export function computeWindowProgress(value, start, stop) {
  const a = Number.isFinite(start) ? start : 0;
  const b = Number.isFinite(stop) ? stop : a + 1;
  const v = Number.isFinite(value) ? value : a;
  const span = b - a;
  if (!Number.isFinite(span) || Math.abs(span) < EPS) return 0;
  return clamp((v - a) / span, 0, 1);
}

export function advanceStepTraversal({
  T,
  T_start,
  T_stop,
  dtSeconds,
  s,
  stepLoopMode = 'clamp',
  bounceDir = 1,
}) {
  const a = Number.isFinite(T_start) ? T_start : 0;
  const b = Number.isFinite(T_stop) ? T_stop : a + 1;
  const minT = Math.min(a, b);
  const maxT = Math.max(a, b);
  const span = maxT - minT;
  const current = clamp(Number.isFinite(T) ? T : minT, minT, maxT);
  const safeS = Number.isFinite(s) ? s : 0;
  const magnitude = Math.abs(safeS) * Math.max(0, Number.isFinite(dtSeconds) ? dtSeconds : 0);
  if (magnitude <= 0 || span < EPS) {
    return { T: current, bounceDir, moved: false };
  }

  const baseSign = Math.sign(safeS) || 1;
  const currentBounce = Math.sign(Number.isFinite(bounceDir) ? bounceDir : 0) || 1;
  const effectiveSign = baseSign * currentBounce;
  const mode = sanitizeStepLoopMode(stepLoopMode);
  const rawNext = current + (magnitude * effectiveSign);

  if (mode === 'clamp') {
    return { T: clamp(rawNext, minT, maxT), bounceDir: currentBounce, moved: true };
  }

  const period = 2 * span;
  const linearPos = (current - minT) + (magnitude * effectiveSign);
  let wrapped = linearPos % period;
  if (wrapped < 0) wrapped += period;

  let localPos = wrapped;
  let segmentSign = 1;
  if (wrapped > span) {
    localPos = period - wrapped;
    segmentSign = -1;
  }
  const nextT = minT + localPos;
  const nextEffectiveSign = effectiveSign * segmentSign;
  const nextBounceDir = nextEffectiveSign * baseSign;
  return { T: clamp(nextT, minT, maxT), bounceDir: nextBounceDir, moved: true };
}

export function shouldAdvanceStep(derived, isPlaying) {
  return !!isPlaying;
}

export function buildDerivedState(input) {
  const base = { ...input };

  let Z = Math.max(1, Math.floor(Number.isFinite(base.Z) ? base.Z : 710));
  const ZMaxInput = Number.isFinite(base.Z_max) ? Math.floor(base.Z_max) : Z;
  const ZMinInput = Number.isFinite(base.Z_min) ? Math.floor(base.Z_min) : 0;
  let Z_max = clamp(ZMaxInput, 0, Z);
  let Z_min = clamp(ZMinInput, -Z, 0);

  if (ZMaxInput > Z) {
    Z = ZMaxInput;
    Z_max = ZMaxInput;
    Z_min = clamp(ZMinInput, -Z, 0);
  }

  // JSON-literal domain: n = [Z_min + 1 ... Z_max - 1]
  // Keep deterministic validity by ensuring at least one sample (Z_max - Z_min >= 2).
  if ((Z_max - Z_min) < 2) {
    if (ZMaxInput <= ZMinInput) {
      Z_min = clamp(Z_max - 2, -Z, 0);
    } else {
      Z_max = clamp(Z_min + 2, 0, Z);
      if ((Z_max - Z_min) < 2) Z_min = clamp(Z_max - 2, -Z, 0);
    }
  }

  const nList = buildNListFromRange(Z_min + 1, Z_max);
  const n = nList.length;

  let T_start = Number.isFinite(base.T_start) ? base.T_start : 1.99999;
  let T_stop = Number.isFinite(base.T_stop) ? base.T_stop : 2;
  if (T_start > T_stop) {
    const temp = T_start;
    T_start = T_stop;
    T_stop = temp;
  }

  let T = Number.isFinite(base.T) ? base.T : 2;
  T = clamp(T, T_start, T_stop);

  const l_base = sanitizeLogBase(base.l_base, 10);
  const l_func = sanitizeLogBase(base.l_func, 10);

  const kStepsInAlignmentsBool = Number(base.kStepsInAlignmentsBool) > 0 ? 1 : 0;
  const kAligned = computeKAligned(T, l_base);
  const k = kStepsInAlignmentsBool === 0 ? T : (Number.isFinite(kAligned) ? kAligned : T);

  const q_scale = Number.isFinite(base.q_scale) ? base.q_scale : 1;
  const q_tauScale = Number.isFinite(base.q_tauScale) ? base.q_tauScale : 0;
  const q_bool = Number(base.q_bool) > 0 ? 1 : 0;
  const q_correction = Number(base.q_correction) > 0 ? 1 : 0;
  const q = computeQ(q_scale, q_tauScale);

  const d_CorrectionFunction = computeD(T);
  const corr = computeCorr(q_correction, d_CorrectionFunction);
  const k1 = computeK1({
    qBool: q_bool,
    qScale: q_scale,
    q,
    qCorrection: q_correction,
    dCorrectionFunction: d_CorrectionFunction,
  });

  const k2 = Number.isFinite(base.k2) ? base.k2 : 1;
  const k3 = Number.isFinite(base.k3) ? Math.max(EPS, base.k3) : 1;

  let b = Number.isFinite(base.b) ? base.b : 36000000;
  if (Math.abs(b) < EPS) b = 1;
  const s = 1 / b;

  const legacyStepRate = Number.isFinite(base.stepRate) ? base.stepRate : 1;
  delete base.stepRate;
  const legacyTimeMode = base.timeMode === 'off'
    ? 'off'
    : (base.timeMode === 'animation' ? 'animation' : 'step');
  const timeMode = 'step';
  const stepLoopMode = sanitizeStepLoopMode(base.stepLoopMode);
  const syncTStepToS = base.syncTStepToS !== false;
  const tRegion = typeof base.tRegion === 'string' ? base.tRegion : 'full';
  const precomputeBufferUnit = base.precomputeBufferUnit === 'seconds' ? 'seconds' : 'frames';
  const rawBufferValue = Number.isFinite(base.precomputeBufferValue) ? base.precomputeBufferValue : 24;
  const precomputeBufferValue = precomputeBufferUnit === 'seconds'
    ? clamp(rawBufferValue, 0.1, 10)
    : clamp(Math.floor(rawBufferValue), 1, 600);
  const precomputeBufferFrames = resolvePrecomputeBufferFrames(precomputeBufferUnit, precomputeBufferValue);
  const bufferEnabled = base.bufferEnabled === true;
  const bufferPhase = sanitizeBufferPhase(base.bufferPhase);
  const rawBufferProgress = Number.isFinite(base.bufferProgress) ? base.bufferProgress : 0;
  const bufferProgress = clamp(rawBufferProgress, 0, 1);
  const bufferTargetFrames = Math.max(1, Math.floor(
    Number.isFinite(base.bufferTargetFrames) ? base.bufferTargetFrames : precomputeBufferFrames,
  ));

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
    Z,
    Z_min,
    Z_max,
    n,
    nList,
    T,
    T_start,
    T_stop,
    l_base,
    l_func,
    kStepsInAlignmentsBool,
    kAligned,
    k,
    q_scale,
    q_tauScale,
    q_bool,
    q_correction,
    q,
    corr,
    d_CorrectionFunction,
    k1,
    k2,
    k3,
    b,
    s,
    legacyStepRate,
    timeMode,
    legacyTimeMode,
    stepLoopMode,
    syncTStepToS,
    tRegion,
    precomputeBufferUnit,
    precomputeBufferValue,
    precomputeBufferFrames,
    bufferEnabled,
    bufferPhase,
    bufferProgress,
    bufferTargetFrames,
    P,
    P1,
    eProof,
    formulaMode,
    proofPanelOpen,
    proofResults,

    // Back-compat mirrors retained for utility code/tests now.
    q1: q_scale,
    q2: q_tauScale,
    q_a: q_bool,
    d: d_CorrectionFunction,
    lBase: l_base,
  };
}

export function applyDerivedState(state) {
  Object.assign(state, buildDerivedState(state));
  return state;
}

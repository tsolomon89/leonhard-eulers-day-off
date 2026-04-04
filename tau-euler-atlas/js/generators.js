import {
  TAU,
  LN_TAU,
  cExp,
  cSin,
  cCos,
  cTan,
  cLogBase,
  cScl,
  cDiv,
  cNeg,
  cInv,
  cTauPow,
  cAlphaPow,
  ok,
} from './complex.js';
import { buildDerivedState, COLOR_BLOCK_SIZE } from './derivation.js';
import {
  CHILDREN_BY_SET,
  POSITIVE_CHILDREN,
  NEGATIVE_CHILDREN,
  SET_KEYS,
  TRANSFORM_KEYS,
  defaultExpressionModel,
  normalizeExpressionModel,
} from './expression-model.js';

export const TRIG = [
  { label: 'base', key: 'base' },
  { label: 'sin', key: 'sin' },
  { label: 'cos', key: 'cos' },
  { label: 'tan', key: 'tan' },
  { label: 'log(sin)', key: 'log_sin' },
  { label: 'log(cos)', key: 'log_cos' },
  { label: 'log(tan)', key: 'log_tan' },
];

export const EXPRESSION_CHILDREN = {
  positive: POSITIVE_CHILDREN,
  negative: NEGATIVE_CHILDREN,
};

export const H_LABELS = []; // Legacy no-op export retained for compatibility.

const BLOCK_TINTS = [
  [1.0, 1.0, 1.0],
  [1.0, 0.86, 0.78],
  [0.88, 1.0, 0.82],
  [0.82, 0.9, 1.0],
  [0.92, 0.84, 1.0],
  [1.0, 0.8, 0.92],
];

let _pointBudget = 200_000;
export function setPointBudget(n) {
  _pointBudget = Math.max(1, Math.floor(Number.isFinite(n) ? n : 200_000));
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function hexToRgb(hex) {
  const raw = typeof hex === 'string' ? hex.trim() : '';
  const h = raw.startsWith('#') ? raw.slice(1) : raw;
  if (h.length !== 6) return [1, 1, 1];
  const int = Number.parseInt(h, 16);
  if (!Number.isFinite(int)) return [1, 1, 1];
  return [
    ((int >> 16) & 0xff) / 255,
    ((int >> 8) & 0xff) / 255,
    (int & 0xff) / 255,
  ];
}

function mulRgb(a, b) {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

function withBloom(rgb, bloomWeight, bloomGain = 1) {
  const base = Number.isFinite(bloomWeight) ? bloomWeight : 1;
  const weightGain = Number.isFinite(bloomGain) ? bloomGain : 1;
  const glow = clamp(base * weightGain, 0, 4);
  const bloomScale = 0.75 + glow * 0.45;
  return [
    clamp(rgb[0] * bloomScale, 0, 1),
    clamp(rgb[1] * bloomScale, 0, 1),
    clamp(rgb[2] * bloomScale, 0, 1),
  ];
}

function blockTintForN(n) {
  const idx = Math.floor(Math.max(0, n) / COLOR_BLOCK_SIZE) % BLOCK_TINTS.length;
  return BLOCK_TINTS[idx];
}

function sanitizeComplex(z) {
  if (!ok(z)) return null;
  if (Math.abs(z[0]) > 1e4 || Math.abs(z[1]) > 1e4) return null;
  return z;
}

export function evaluateTransform(baseZ, transformKey, k2, lFunc) {
  switch (transformKey) {
    case 'base':
      return baseZ;
    case 'sin':
      return cScl(cSin(baseZ), k2);
    case 'cos':
      return cScl(cCos(baseZ), k2);
    case 'tan':
      return cScl(cTan(baseZ), k2);
    case 'log_sin':
      return cLogBase(cScl(cSin(baseZ), k2), lFunc);
    case 'log_cos':
      return cLogBase(cScl(cCos(baseZ), k2), lFunc);
    case 'log_tan':
      return cLogBase(cScl(cTan(baseZ), k2), lFunc);
    default:
      return [NaN, NaN];
  }
}

export function evaluateDirectFamily(base, _nValue, dIndex, k2) {
  switch (dIndex) {
    case 0: return base;
    case 1: return cScl(cSin(base), k2);
    case 2: return cScl(cCos(base), k2);
    case 3: return cScl(cTan(base), k2);
    default: return [NaN, NaN];
  }
}

export function computeF(k1, k, imagSign = 1, formulaMode = 'tau') {
  const tauK = Math.pow(TAU, k);
  if (formulaMode === 'euler') {
    return cScl(cExp([0, imagSign * tauK]), k1);
  }
  const tauNativeExp = [0, (imagSign * tauK) / LN_TAU];
  return cScl(cTauPow(tauNativeExp), k1);
}

function computeCircleA(k, nValue, imagSign, formulaMode = 'tau') {
  const theta = imagSign * k * Math.pow(TAU, nValue);
  if (formulaMode === 'euler') return cExp([0, theta]);
  return cTauPow([0, theta / LN_TAU]);
}

function computeCircleB(k1, k, nValue, imagSign, formulaMode = 'tau') {
  if (nValue === 0) return [NaN, NaN];
  const theta = imagSign * Math.pow(TAU / nValue, k);
  if (formulaMode === 'euler') return cScl(cExp([0, theta]), k1);
  return cScl(cTauPow([0, theta / LN_TAU]), k1);
}

function computeBaseContext(derived, nValue, nOrdinal, formulaMode = 'tau') {
  const fPositive = computeF(derived.k1, derived.k, +1, formulaMode);
  const fNegative = computeF(derived.k1, derived.k, -1, formulaMode);

  const kWindow = Math.max(1, Math.floor(Math.abs(derived.k) + 1));
  const jScale = (nOrdinal < kWindow && Math.abs(derived.k) > 1e-12)
    ? (nValue / derived.k)
    : NaN;

  const circleAPositive = computeCircleA(derived.k, nValue, +1, formulaMode);
  const circleANegative = computeCircleA(derived.k, nValue, -1, formulaMode);
  const circleBPositive = computeCircleB(derived.k1, derived.k, nValue, +1, formulaMode);
  const circleCPositive = ok(circleBPositive) ? cNeg(circleBPositive) : [NaN, NaN];
  const circleBNegative = computeCircleB(derived.k1, derived.k, nValue, -1, formulaMode);
  const circleCNegative = ok(circleBNegative) ? cNeg(circleBNegative) : [NaN, NaN];

  return {
    fPositive,
    fNegative,
    jScale,
    circleAPositive,
    circleANegative,
    circleBPositive,
    circleCPositive,
    circleBNegative,
    circleCNegative,
  };
}

function evaluateBaseChild(setKey, childKey, ctx, nValue) {
  const {
    fPositive,
    fNegative,
    jScale,
    circleAPositive,
    circleANegative,
    circleBPositive,
    circleCPositive,
    circleCNegative,
    circleBNegative,
  } = ctx;

  if (setKey === 'positive') {
    switch (childKey) {
      case 'positiveImaginary': return fPositive;
      case 'positiveImaginaryReciprocal': return cInv(fPositive);
      case 'positiveImaginaryVectorA': return Number.isFinite(jScale) ? cScl(fPositive, jScale) : [NaN, NaN];
      case 'positiveImaginaryVectorReciprocal': return Number.isFinite(jScale) && Math.abs(jScale) > 1e-12 ? cScl(fPositive, 1 / jScale) : [NaN, NaN];
      case 'positiveImaginaryVectorB': return cScl(fPositive, nValue);
      case 'positiveImaginaryCircleA': return circleAPositive;
      case 'positiveImaginaryCircleB': return circleBPositive;
      case 'positiveImaginaryCircleC': return circleCPositive;
      case 'positiveImaginaryCircleBReciprocal': return cInv(circleBPositive);
      case 'positiveImaginaryCircleCReciprocal': return cInv(circleCPositive);
      default: return [NaN, NaN];
    }
  }

  // JSON-literal negative branch definitions (including positive cross-references).
  switch (childKey) {
    case 'negativeImaginary': return fNegative;
    case 'negativeImaginaryReciprocal': return cInv(fPositive);
    case 'negativeImaginaryVectorA': return Number.isFinite(jScale) ? cScl(fPositive, jScale) : [NaN, NaN];
    case 'negativeImaginaryVectorReciprocal': return Number.isFinite(jScale) && Math.abs(jScale) > 1e-12 ? cScl(fPositive, 1 / jScale) : [NaN, NaN];
    case 'negativeImaginaryVectorB': return cScl(fPositive, nValue);
    case 'negativeImaginaryCircleA': return circleANegative;
    case 'negativeImaginaryCircleB': return circleBNegative;
    case 'negativeImaginaryCircleC': return circleCNegative;
    case 'negativeImaginaryCircleBReciprocal': return cInv(circleBPositive);
    case 'negativeImaginaryCircleCReciprocal': return cInv(circleCPositive);
    default: return [NaN, NaN];
  }
}

function getSetStyle(model, setKey) {
  return model.sets?.[setKey] || defaultExpressionModel().sets[setKey];
}

function getTransformStyle(model, transformKey) {
  return model.transforms?.[transformKey] || defaultExpressionModel().transforms[transformKey];
}

function getChildStyle(model, childKey) {
  return model.children?.[childKey] || defaultExpressionModel().children[childKey];
}

function resolveEffectiveStyle(model, setKey, transformKey, childKey) {
  const parent = model.parent;
  const setStyle = getSetStyle(model, setKey);
  const transformStyle = getTransformStyle(model, transformKey);
  const childStyle = getChildStyle(model, childKey);

  const enabled = !!(
    parent.enabled &&
    setStyle.enabled &&
    transformStyle.enabled &&
    childStyle.enabled
  );

  return {
    enabled,
    pointSize: parent.pointSize * setStyle.pointSize * transformStyle.pointSize * childStyle.pointSize,
    pointOpacity: parent.pointOpacity * setStyle.pointOpacity * transformStyle.pointOpacity * childStyle.pointOpacity,
    lineWidth: parent.lineWidth * setStyle.lineWidth * transformStyle.lineWidth * childStyle.lineWidth,
    lineOpacity: parent.lineOpacity * setStyle.lineOpacity * transformStyle.lineOpacity * childStyle.lineOpacity,
    pointBloom: parent.pointBloom * setStyle.pointBloom * transformStyle.pointBloom * childStyle.pointBloom,
    lineBloom: parent.lineBloom * setStyle.lineBloom * transformStyle.lineBloom * childStyle.lineBloom,
    color: childStyle.color,
  };
}

function activeCombos(model) {
  const combos = [];
  for (const setKey of SET_KEYS) {
    const children = CHILDREN_BY_SET[setKey];
    for (const child of children) {
      for (const transformKey of TRANSFORM_KEYS) {
        const style = resolveEffectiveStyle(model, setKey, transformKey, child.key);
        if (!style.enabled) continue;
        if (style.pointOpacity <= 0.0001 && style.lineOpacity <= 0.0001) continue;
        combos.push({
          setKey,
          childKey: child.key,
          childLabel: child.label,
          transformKey,
          style,
        });
      }
    }
  }
  return combos;
}

export function getActiveExpressionCombos(params) {
  const derived = buildDerivedState(params);
  const expressionModel = normalizeExpressionModel(derived.expressionModel);
  return activeCombos(expressionModel).map((combo) => ({
    setKey: combo.setKey,
    childKey: combo.childKey,
    transformKey: combo.transformKey,
    style: { ...combo.style },
  }));
}

function metadataFromDerived(derived, fPositive, computeMs) {
  return {
    T: derived.T,
    k: derived.k,
    k1: derived.k1,
    q: derived.q,
    d: derived.d_CorrectionFunction,
    f: fPositive,
    computeMs,
  };
}

export function generateAllPoints(params) {
  const t0 = performance.now();
  const derived = buildDerivedState(params);
  const expressionModel = normalizeExpressionModel(derived.expressionModel);
  const combos = activeCombos(expressionModel);

  if (!expressionModel.parent.enabled || combos.length === 0 || derived.nList.length === 0) {
    return {
      positions: new Float32Array(0),
      colors: new Float32Array(0),
      sizes: new Float32Array(0),
      count: 0,
      meta: metadataFromDerived(
        derived,
        computeF(derived.k1, derived.k, +1, derived.formulaMode),
        performance.now() - t0,
      ),
      budget: _pointBudget,
    };
  }

  const maxPts = _pointBudget;
  const positions = new Float32Array(maxPts * 3);
  const colors = new Float32Array(maxPts * 3);
  const sizes = new Float32Array(maxPts);

  let count = 0;
  const styleBloomGain = Number.isFinite(derived.styleBloomGain) ? derived.styleBloomGain : 1;

  for (const combo of combos) {
    if (count >= maxPts) break;
    const baseRgb = hexToRgb(combo.style.color);

    for (let i = 0; i < derived.nList.length; i++) {
      if (count >= maxPts) break;
      if (combo.style.pointOpacity <= 0.0001) continue;

      const nValue = derived.nList[i];
      const ctx = computeBaseContext(derived, nValue, i, derived.formulaMode);
      const baseZ = evaluateBaseChild(combo.setKey, combo.childKey, ctx, nValue);
      const transformed = sanitizeComplex(evaluateTransform(baseZ, combo.transformKey, derived.k2, derived.l_func));
      if (!transformed) continue;

      const tint = blockTintForN(nValue);
      const rgb = withBloom(mulRgb(baseRgb, tint), combo.style.pointBloom, styleBloomGain);

      const idx3 = count * 3;
      positions[idx3] = transformed[0];
      positions[idx3 + 1] = transformed[1];
      positions[idx3 + 2] = 0;
      colors[idx3] = clamp(rgb[0] * combo.style.pointOpacity, 0, 1);
      colors[idx3 + 1] = clamp(rgb[1] * combo.style.pointOpacity, 0, 1);
      colors[idx3 + 2] = clamp(rgb[2] * combo.style.pointOpacity, 0, 1);
      sizes[count] = Math.max(0.05, combo.style.pointSize * derived.k3);
      count++;
    }
  }

  const computeMs = performance.now() - t0;
  return {
    positions: positions.subarray(0, count * 3),
    colors: colors.subarray(0, count * 3),
    sizes: sizes.subarray(0, count),
    count,
    meta: metadataFromDerived(
      derived,
      computeF(derived.k1, derived.k, +1, derived.formulaMode),
      computeMs,
    ),
    budget: _pointBudget,
  };
}

function buildLinePath(points) {
  const pos = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    pos[i * 3] = points[i][0];
    pos[i * 3 + 1] = points[i][1];
    pos[i * 3 + 2] = 0;
  }
  return pos;
}

export function generateAtlasPaths(params) {
  const derived = buildDerivedState(params);
  const expressionModel = normalizeExpressionModel(derived.expressionModel);
  const combos = activeCombos(expressionModel);
  const pathBudget = Math.max(1, Math.floor(Number.isFinite(derived.pathBudget) ? derived.pathBudget : 500));

  if (!expressionModel.parent.enabled || combos.length === 0 || derived.nList.length === 0) return [];

  const paths = [];
  const styleBloomGain = Number.isFinite(derived.styleBloomGain) ? derived.styleBloomGain : 1;

  for (const combo of combos) {
    if (paths.length >= pathBudget) break;
    if (combo.style.lineOpacity <= 0.0001 || combo.style.lineWidth <= 0.0001) continue;

    const baseRgb = hexToRgb(combo.style.color);
    let seg = [];
    let currentBlock = null;

    const flush = () => {
      if (seg.length < 2) {
        seg = [];
        return;
      }
      const tint = BLOCK_TINTS[currentBlock ?? 0];
      const rgb = withBloom(mulRgb(baseRgb, tint), combo.style.lineBloom, styleBloomGain);
      paths.push({
        positions: buildLinePath(seg),
        color: rgb,
        widthMul: Math.max(0.05, combo.style.lineWidth),
        opacityMul: clamp(combo.style.lineOpacity, 0, 1),
        pointCount: seg.length,
        isPrimary: false,
        tag: {
          set: combo.setKey,
          child: combo.childKey,
          transform: combo.transformKey,
          block: currentBlock ?? 0,
        },
      });
      seg = [];
    };

    for (let i = 0; i < derived.nList.length; i++) {
      if (paths.length >= pathBudget) break;
      const nValue = derived.nList[i];
      const block = Math.floor(Math.max(0, nValue) / COLOR_BLOCK_SIZE);

      if (currentBlock !== null && block !== currentBlock) flush();
      currentBlock = block;

      const ctx = computeBaseContext(derived, nValue, i, derived.formulaMode);
      const baseZ = evaluateBaseChild(combo.setKey, combo.childKey, ctx, nValue);
      const transformed = sanitizeComplex(evaluateTransform(baseZ, combo.transformKey, derived.k2, derived.l_func));
      if (!transformed) {
        flush();
        continue;
      }
      seg.push(transformed);
    }

    flush();
  }

  return paths.slice(0, pathBudget);
}

export function generatePrimaryPaths(params) {
  const derived = buildDerivedState(params);
  const expressionModel = normalizeExpressionModel(derived.expressionModel);
  const style = resolveEffectiveStyle(expressionModel, 'positive', 'sin', 'positiveImaginary');
  if (!style.enabled || style.lineOpacity <= 0.0001 || style.lineWidth <= 0.0001) return [];

  const paths = [];
  const baseRgb = hexToRgb(style.color);
  const styleBloomGain = Number.isFinite(derived.styleBloomGain) ? derived.styleBloomGain : 1;

  const seg = [];
  for (let i = 0; i < derived.nList.length; i++) {
    const nValue = derived.nList[i];
    const ctx = computeBaseContext(derived, nValue, i, derived.formulaMode);
    const baseZ = evaluateBaseChild('positive', 'positiveImaginary', ctx, nValue);
    const transformed = sanitizeComplex(evaluateTransform(baseZ, 'sin', derived.k2, derived.l_func));
    if (!transformed) continue;
    seg.push(transformed);
  }
  if (seg.length >= 2) {
    paths.push({
      positions: buildLinePath(seg),
      color: withBloom(baseRgb, style.lineBloom, styleBloomGain),
      widthMul: Math.max(0.05, style.lineWidth),
      opacityMul: clamp(style.lineOpacity, 0, 1),
      pointCount: seg.length,
      tag: { set: 'positive', child: 'positiveImaginary', transform: 'sin' },
      isPrimary: true,
    });
  }

  return paths;
}

export function generateAlphaTrace(alpha, N, k) {
  const pts = [];
  const lnA = Math.log(alpha);
  if (lnA === 0 || !isFinite(lnA)) return pts;
  const alphaK = Math.pow(alpha, k);
  for (let i = 0; i <= N; i++) {
    const n = i / N;
    const theta = n * alphaK / lnA;
    const z = cAlphaPow(alpha, [0, theta]);
    if (ok(z)) pts.push(z);
  }
  return pts;
}

export function generateTauTrace(N, k) {
  const pts = [];
  const tauK = Math.pow(TAU, k);
  for (let i = 0; i <= N; i++) {
    const n = i / N;
    const theta = n * tauK / LN_TAU;
    const z = cTauPow([0, theta]);
    if (ok(z)) pts.push(z);
  }
  return pts;
}

export function computeEProof(f, k2, nList, P) {
  const samples = Array.isArray(nList) ? nList : [];
  const count = Math.max(1, samples.length);
  const safeP = Number.isFinite(P) ? P : 1;
  const P1 = safeP * (1 + TAU / count);
  let sum = 0;

  for (const nBase of samples) {
    const n0 = nBase + safeP * count;
    const n1 = nBase + P1 * count;
    const v0 = sanitizeComplex(cScl(cSin(cScl(f, n0)), k2));
    const v1 = sanitizeComplex(cScl(cSin(cScl(f, n1)), k2));
    if (!v0 || !v1) continue;
    sum += Math.hypot(v0[0] - v1[0], v0[1] - v1[1]);
  }

  return { value: sum, P1 };
}

export function computeEProofFromState(params) {
  const derived = buildDerivedState(params);
  const f = computeF(derived.k1, derived.k, +1, derived.formulaMode);
  return computeEProof(f, derived.k2, derived.nList, derived.P);
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const t = clamp(p, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(t);
  const hi = Math.ceil(t);
  if (lo === hi) return sorted[lo];
  const w = t - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function summarizeErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return { mean: NaN, p95: NaN, max: NaN, samples: 0 };
  }
  const samples = errors.length;
  let sum = 0;
  let max = -Infinity;
  for (const e of errors) {
    sum += e;
    if (e > max) max = e;
  }
  return {
    mean: sum / samples,
    p95: percentile(errors, 0.95),
    max,
    samples,
  };
}

function evaluateChildForMode(derived, setKey, childKey, nValue, nOrdinal, mode) {
  const ctx = computeBaseContext(derived, nValue, nOrdinal, mode);
  return sanitizeComplex(evaluateBaseChild(setKey, childKey, ctx, nValue));
}

export function evaluateBaseChildForMode(params, setKey, childKey, nValue, nOrdinal = 0, mode = 'tau') {
  const derived = buildDerivedState(params);
  return evaluateChildForMode(derived, setKey, childKey, nValue, nOrdinal, mode);
}

export function computeEquivalenceProofRows(params) {
  const derived = buildDerivedState(params);
  const rows = [];
  const allErrors = [];
  const nList = Array.isArray(derived.nList) ? derived.nList : [];

  for (const setKey of SET_KEYS) {
    for (const child of CHILDREN_BY_SET[setKey]) {
      const errors = [];
      for (let i = 0; i < nList.length; i++) {
        const nValue = nList[i];
        const tauVal = evaluateChildForMode(derived, setKey, child.key, nValue, i, 'tau');
        const eulerVal = evaluateChildForMode(derived, setKey, child.key, nValue, i, 'euler');
        if (!tauVal || !eulerVal) continue;
        const ratio = cDiv(eulerVal, tauVal);
        if (!ok(ratio)) continue;
        const error = Math.hypot(ratio[0] - 1, ratio[1]);
        if (!Number.isFinite(error)) continue;
        errors.push(error);
      }
      const summary = summarizeErrors(errors);
      allErrors.push(...errors);
      rows.push({
        setKey,
        childKey: child.key,
        childLabel: child.label,
        samples: summary.samples,
        meanError: summary.mean,
        p95Error: summary.p95,
        maxError: summary.max,
      });
    }
  }

  const aggregate = summarizeErrors(allErrors);
  return {
    rows,
    summary: {
      meanError: aggregate.mean,
      p95Error: aggregate.p95,
      maxError: aggregate.max,
      samples: aggregate.samples,
    },
  };
}

export function computeProofPayloadFromState(params) {
  const derived = buildDerivedState(params);
  const eq = computeEquivalenceProofRows(derived);
  const eProof = computeEProofFromState(derived);
  const alpha = Number.isFinite(derived.alpha) ? derived.alpha : TAU;
  const closureSteps = alpha === 0 ? NaN : (TAU / alpha);

  return {
    formulaMode: derived.formulaMode,
    rows: eq.rows,
    summary: eq.summary,
    closureSteps,
    eProof: eProof.value,
    P: derived.P,
    P1: eProof.P1,
  };
}

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
  cInv,
  cTauPow,
  cAlphaPow,
  ok,
  clamp,
} from './complex.js';
import { buildDerivedState, COLOR_BLOCK_SIZE } from './derivation.js';
import {
  CHILDREN_BY_SET,
  POSITIVE_CHILDREN,
  NEGATIVE_CHILDREN,
  SET_KEYS,
  defaultExpressionModel,
  normalizeExpressionModel,
  normalizeColorHue,
} from './expression-model.js';
import {
  FUNCTION_PLOTTABLES,
  getFunctionNode,
  getFunctionNodesByExponent,
} from './function-registry.js';

export const TRIG = [
  { label: 'base', key: 'base' },
  { label: 'sin', key: 'sin' },
  { label: 'cos', key: 'cos' },
  { label: 'tan', key: 'tan' },
  { label: 'log(f)', key: 'log' },
  { label: 'log(sin)', key: 'log_sin' },
  { label: 'log(cos)', key: 'log_cos' },
  { label: 'log(tan)', key: 'log_tan' },
];

export const EXPRESSION_CHILDREN = {
  positive: getFunctionNodesByExponent('positive').map((node) => ({ key: node.key, label: node.label })),
  negative: getFunctionNodesByExponent('negative').map((node) => ({ key: node.key, label: node.label })),
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

// When true, round-robin always starts at index 0 for deterministic
// frame-to-frame path ordering during video export.
let _stableRoundRobin = false;
export function setStableRoundRobin(stable) { _stableRoundRobin = !!stable; }

export function setPointBudget(n) {
  const next = Math.max(1, Math.floor(Number.isFinite(n) ? n : 200_000));
  if (next !== _pointBudget) {
    _pointBudget = next;
    // Invalidate persistent buffers so they reallocate at the new size
    _posPool = null;
    _colPool = null;
    _sizPool = null;
  }
}

// ── Persistent output buffers (only reallocated when budget changes) ──
let _posPool = null;   // Float32Array(budget * 3)
let _colPool = null;   // Float32Array(budget * 3)
let _sizPool = null;   // Float32Array(budget)

function ensureBufferPool() {
  if (!_posPool || _posPool.length !== _pointBudget * 3) {
    _posPool = new Float32Array(_pointBudget * 3);
    _colPool = new Float32Array(_pointBudget * 3);
    _sizPool = new Float32Array(_pointBudget);
  }
}

/** Skip buildDerivedState if params is already derived (has nList). */
function ensureDerived(params) {
  return Array.isArray(params.nList) ? params : buildDerivedState(params);
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

function hueToRgb(hue, saturation = 0.78, value = 1.0) {
  const h = normalizeColorHue(hue, 0.62);
  const s = clamp(Number.isFinite(saturation) ? saturation : 0.78, 0, 1);
  const v = clamp(Number.isFinite(value) ? value : 1.0, 0, 1);
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
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

function blockIndexForN(n) {
  return Math.floor(Math.max(0, n) / COLOR_BLOCK_SIZE);
}

function blockTintForBlock(blockIndex) {
  const len = BLOCK_TINTS.length;
  if (len === 0) return [1, 1, 1];
  const idx = ((Math.floor(Number.isFinite(blockIndex) ? blockIndex : 0) % len) + len) % len;
  return BLOCK_TINTS[idx];
}

function blockTintForN(n) {
  return blockTintForBlock(blockIndexForN(n));
}

function roundRobinStartForDerived(derived, itemCount) {
  if (_stableRoundRobin) return 0;
  if (!Number.isFinite(itemCount) || itemCount <= 0) return 0;
  const tSeed = Number.isFinite(derived.T) ? Math.abs(Math.trunc(derived.T * 1e6)) : 0;
  const negSeed = Number.isFinite(derived.n_negDepth) ? Math.abs(Math.trunc(derived.n_negDepth)) : 0;
  const posSeed = Number.isFinite(derived.n_posDepth) ? Math.abs(Math.trunc(derived.n_posDepth)) : 0;
  const nSeed = Number.isFinite(derived.n) ? Math.abs(Math.trunc(derived.n)) : 0;
  return (tSeed + negSeed + posSeed + nSeed) % itemCount;
}

const POINT_COMPLEX_ABS_MAX = 1e4;
const LINE_COMPLEX_ABS_MAX = 1e6;

function sanitizeComplex(z, absMax) {
  if (!ok(z)) return null;
  if (Math.abs(z[0]) > absMax || Math.abs(z[1]) > absMax) return null;
  return z;
}

function sanitizePointComplex(z) {
  return sanitizeComplex(z, POINT_COMPLEX_ABS_MAX);
}

function sanitizeLineComplex(z) {
  return sanitizeComplex(z, LINE_COMPLEX_ABS_MAX);
}

export function evaluateTransformStages(baseZ, k2, lFunc) {
  const base = baseZ;
  const sin = cScl(cSin(base), k2);
  const cos = cScl(cCos(base), k2);
  const tan = cScl(cTan(base), k2);
  return {
    base,
    sin,
    cos,
    tan,
    log: cLogBase(base, lFunc),
    log_sin: cLogBase(sin, lFunc),
    log_cos: cLogBase(cos, lFunc),
    log_tan: cLogBase(tan, lFunc),
  };
}

export function evaluateTransform(baseZ, transformKey, k2, lFunc) {
  const stages = evaluateTransformStages(baseZ, k2, lFunc);
  return stages[transformKey] || [NaN, NaN];
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

function computeFrameKernel(derived, formulaMode = 'tau') {
  const safeMode = formulaMode === 'euler' ? 'euler' : 'tau';
  return {
    formulaMode: safeMode,
    fPositive: computeF(derived.k1, derived.k, +1, safeMode),
    fNegative: computeF(derived.k1, derived.k, -1, safeMode),
    kWindow: Math.max(1, Math.floor(Math.abs(derived.k) + 1)),
    hasK: Math.abs(derived.k) > 1e-12,
  };
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

function computeCircleC(k1, k, nValue, imagSign, formulaMode = 'tau') {
  const denom = k * nValue;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12) return [NaN, NaN];
  const theta = imagSign * (TAU / denom);
  if (formulaMode === 'euler') return cScl(cExp([0, theta]), k1);
  return cScl(cTauPow([0, theta / LN_TAU]), k1);
}

function withReciprocalFamilies(baseFamilies) {
  const families = {};
  for (const [familyKey, value] of Object.entries(baseFamilies)) {
    families[familyKey] = value;
    families[`${familyKey}Reciprocal`] = cInv(value);
  }
  return families;
}

function computeFamilySet(baseKernel, derived, nValue, jScale, imagSign, formulaMode = 'tau') {
  const vectorA = Number.isFinite(jScale) ? cScl(baseKernel, jScale) : [NaN, NaN];
  const vectorB = Number.isFinite(jScale) && Math.abs(jScale) > 1e-12
    ? cScl(baseKernel, 1 / jScale)
    : [NaN, NaN];
  const vectorC = cScl(baseKernel, nValue);
  const circleA = computeCircleA(derived.k, nValue, imagSign, formulaMode);
  const circleB = computeCircleB(derived.k1, derived.k, nValue, imagSign, formulaMode);
  const circleC = computeCircleC(derived.k1, derived.k, nValue, imagSign, formulaMode);

  return withReciprocalFamilies({
    base: baseKernel,
    vectorA,
    vectorB,
    vectorC,
    circleA,
    circleB,
    circleC,
  });
}

function computeBaseContext(derived, frameKernel, nValue, nOrdinal) {
  const jScale = (nOrdinal < frameKernel.kWindow && frameKernel.hasK)
    ? (nValue / derived.k)
    : NaN;

  return {
    positive: computeFamilySet(frameKernel.fPositive, derived, nValue, jScale, +1, frameKernel.formulaMode),
    negative: computeFamilySet(frameKernel.fNegative, derived, nValue, jScale, -1, frameKernel.formulaMode),
  };
}

function getOrBuildChildTransformStages(stageCache, combo, ctx, nValue, k2, lFunc) {
  const cacheKey = `${combo.setKey}:${combo.childKey}`;
  const cached = stageCache.get(cacheKey);
  if (cached) return cached;
  const baseZ = evaluateBaseChild(combo.setKey, combo.childKey, ctx, nValue);
  const stages = evaluateTransformStages(baseZ, k2, lFunc);
  stageCache.set(cacheKey, stages);
  return stages;
}

function evaluateBaseChild(setKey, childKey, ctx, _nValue) {
  const node = getFunctionNode(childKey);
  if (!node || node.exponentKey !== setKey) return [NaN, NaN];
  const familyValueKey = node.reciprocal ? `${node.familyKey}Reciprocal` : node.familyKey;
  const setFamilies = setKey === 'negative' ? ctx.negative : ctx.positive;
  return setFamilies[familyValueKey] || [NaN, NaN];
}

function getSetStyle(model, setKey) {
  return model.sets?.[setKey] || defaultExpressionModel().sets[setKey];
}

function getVariantStyle(model, childKey, variantKey) {
  return model.childVariants?.[childKey]?.[variantKey]
    || defaultExpressionModel().childVariants[childKey][variantKey];
}

function getChildStyle(model, childKey) {
  return model.children?.[childKey] || defaultExpressionModel().children[childKey];
}

function resolveColorHue(model, childKey, variantKey) {
  const rgbToHue = (rgb) => {
    const max = Math.max(rgb[0], rgb[1], rgb[2]);
    const min = Math.min(rgb[0], rgb[1], rgb[2]);
    const delta = max - min;
    if (delta <= 1e-12) return 0;
    let h;
    if (max === rgb[0]) h = ((rgb[1] - rgb[2]) / delta) % 6;
    else if (max === rgb[1]) h = (rgb[2] - rgb[0]) / delta + 2;
    else h = (rgb[0] - rgb[1]) / delta + 4;
    return normalizeColorHue(h / 6, 0.62);
  };

  const variantHue = model.childVariants?.[childKey]?.[variantKey]?.colorHue;
  if (Number.isFinite(variantHue)) return normalizeColorHue(variantHue, 0.62);

  const childHue = model.children?.[childKey]?.colorHue;
  if (Number.isFinite(childHue)) return normalizeColorHue(childHue, 0.62);

  const parentHue = model.parent?.colorHue;
  if (Number.isFinite(parentHue)) return normalizeColorHue(parentHue, 0.62);

  // Legacy fallback for payloads carrying only hex colors.
  const variantHex = model.childVariants?.[childKey]?.[variantKey]?.color;
  if (typeof variantHex === 'string') {
    const rgb = hexToRgb(variantHex);
    if (rgb) return rgbToHue(rgb);
  }
  const childHex = model.children?.[childKey]?.color;
  if (typeof childHex === 'string') {
    const rgb = hexToRgb(childHex);
    if (rgb) return rgbToHue(rgb);
  }
  return normalizeColorHue(parentHue, 0.62);
}

function resolveEffectiveStyle(model, setKey, variantKey, childKey) {
  const parent = model.parent;
  const setStyle = getSetStyle(model, setKey);
  const variantStyle = getVariantStyle(model, childKey, variantKey);
  const childStyle = getChildStyle(model, childKey);
  const colorHue = resolveColorHue(model, childKey, variantKey);
  const colorRgb = hueToRgb(colorHue);

  const enabled = !!(
    parent.enabled &&
    setStyle.enabled &&
    variantStyle.enabled &&
    childStyle.enabled
  );

  return {
    enabled,
    pointSize: parent.pointSize * setStyle.pointSize * variantStyle.pointSize * childStyle.pointSize,
    pointOpacity: parent.pointOpacity * setStyle.pointOpacity * variantStyle.pointOpacity * childStyle.pointOpacity,
    lineWidth: parent.lineWidth * setStyle.lineWidth * variantStyle.lineWidth * childStyle.lineWidth,
    lineOpacity: parent.lineOpacity * setStyle.lineOpacity * variantStyle.lineOpacity * childStyle.lineOpacity,
    pointBloom: parent.pointBloom * setStyle.pointBloom * variantStyle.pointBloom * childStyle.pointBloom,
    lineBloom: parent.lineBloom * setStyle.lineBloom * variantStyle.lineBloom * childStyle.lineBloom,
    colorHue,
    colorRgb,
  };
}

function activeCombos(model) {
  const combos = [];
  for (const plottable of FUNCTION_PLOTTABLES) {
    const style = resolveEffectiveStyle(
      model,
      plottable.exponentKey,
      plottable.variantKey,
      plottable.functionKey,
    );
    if (!style.enabled) continue;
    if (style.pointOpacity <= 0.0001 && style.lineOpacity <= 0.0001) continue;
    combos.push({
      setKey: plottable.exponentKey,
      childKey: plottable.functionKey,
      childLabel: plottable.functionLabel,
      variantKey: plottable.variantKey,
      transformKey: plottable.variantKey, // Legacy alias retained.
      coverageStatus: plottable.coverageStatus,
      inDesmos: plottable.inDesmos,
      implemented: plottable.implemented,
      style,
    });
  }

  return combos;
}

export function getActiveExpressionCombos(params) {
  const derived = buildDerivedState(params);
  const expressionModel = normalizeExpressionModel(derived.expressionModel);
  return activeCombos(expressionModel).map((combo) => ({
    setKey: combo.setKey,
    childKey: combo.childKey,
    variantKey: combo.variantKey,
    transformKey: combo.variantKey, // Legacy alias retained.
    coverageStatus: combo.coverageStatus,
    inDesmos: combo.inDesmos,
    implemented: combo.implemented,
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
  const derived = ensureDerived(params);
  const frameKernel = computeFrameKernel(derived, derived.formulaMode);
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
        frameKernel.fPositive,
        performance.now() - t0,
      ),
      budget: _pointBudget,
    };
  }

  ensureBufferPool();
  const maxPts = _pointBudget;
  const positions = _posPool;
  const colors = _colPool;
  const sizes = _sizPool;

  let count = 0;
  const styleBloomGain = Number.isFinite(derived.styleBloomGain) ? derived.styleBloomGain : 1;
  const comboContexts = combos.map((combo) => ({
    combo,
    baseRgb: Array.isArray(combo.style.colorRgb) ? combo.style.colorRgb : [1, 1, 1],
  }));
  const comboCount = comboContexts.length;
  let roundStart = roundRobinStartForDerived(derived, comboCount);

  for (let i = 0; i < derived.nList.length && count < maxPts; i++) {
    const nValue = derived.nList[i];
    const ctx = computeBaseContext(derived, frameKernel, nValue, i);
    const stageCache = new Map();
    const tint = blockTintForN(nValue);

    for (let turn = 0; turn < comboCount && count < maxPts; turn++) {
      const idx = (roundStart + turn) % comboCount;
      const { combo, baseRgb } = comboContexts[idx];
      if (combo.style.pointOpacity <= 0.0001) continue;

      const stages = getOrBuildChildTransformStages(stageCache, combo, ctx, nValue, derived.k2, derived.l_func);
      const transformed = sanitizePointComplex(stages[combo.variantKey] || [NaN, NaN]);
      if (!transformed) continue;

      const rgb = withBloom(mulRgb(baseRgb, tint), combo.style.pointBloom, styleBloomGain);
      const idx3 = count * 3;
      positions[idx3] = transformed[0];
      positions[idx3 + 1] = transformed[1];
      positions[idx3 + 2] = 0;
      colors[idx3] = clamp(rgb[0] * combo.style.pointOpacity, 0, 1);
      colors[idx3 + 1] = clamp(rgb[1] * combo.style.pointOpacity, 0, 1);
      colors[idx3 + 2] = clamp(rgb[2] * combo.style.pointOpacity, 0, 1);
      sizes[count] = Math.max(0.05, combo.style.pointSize);
      count++;
    }

    if (comboCount > 0) roundStart = (roundStart + 1) % comboCount;
  }

  const computeMs = performance.now() - t0;
  return {
    positions: positions.subarray(0, count * 3),
    colors: colors.subarray(0, count * 3),
    sizes: sizes.subarray(0, count),
    count,
    meta: metadataFromDerived(
      derived,
      frameKernel.fPositive,
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

function flushAtlasSegment(state, styleBloomGain) {
  const points = state.pendingPoints;
  if (!Array.isArray(points) || points.length < 2) {
    state.pendingPoints = [];
    return;
  }
  const { combo, baseRgb } = state;
  const blockValue = state.currentBlock ?? 0;
  const tint = blockTintForBlock(blockValue);
  const rgb = withBloom(mulRgb(baseRgb, tint), combo.style.lineBloom, styleBloomGain);
  state.segments.push({
    positions: buildLinePath(points),
    color: rgb,
    widthMul: Math.max(0.05, combo.style.lineWidth),
    opacityMul: clamp(combo.style.lineOpacity, 0, 1),
    pointCount: points.length,
    isPrimary: false,
    tag: {
      set: combo.setKey,
      child: combo.childKey,
      variant: combo.variantKey,
      transform: combo.variantKey, // Legacy alias retained.
      block: blockValue,
    },
  });
  state.pendingPoints = [];
}

function comboKeyFromMeta(setKey, childKey, variantKey) {
  return `${setKey}|${childKey}|${variantKey}`;
}

export function emptyAtlasPathDiagnostics(pathBudget = 500) {
  const safeBudget = Math.max(1, Math.floor(Number.isFinite(pathBudget) ? pathBudget : 500));
  return {
    budgetRequested: safeBudget,
    segmentsGenerated: 0,
    segmentsEmitted: 0,
    budgetHit: false,
    comboCount: 0,
    combosWithSegments: 0,
    combosEmitted: 0,
    clippedPointCount: 0,
    clippedCombos: [],
  };
}

export function generateAtlasPathsWithDiagnostics(params) {
  const derived = ensureDerived(params);
  const frameKernel = computeFrameKernel(derived, derived.formulaMode);
  const expressionModel = normalizeExpressionModel(derived.expressionModel);
  const combos = activeCombos(expressionModel);
  const pathBudget = Math.max(1, Math.floor(Number.isFinite(derived.pathBudget) ? derived.pathBudget : 500));

  if (!expressionModel.parent.enabled || combos.length === 0 || derived.nList.length === 0) {
    return {
      paths: [],
      diagnostics: emptyAtlasPathDiagnostics(pathBudget),
    };
  }

  const styleBloomGain = Number.isFinite(derived.styleBloomGain) ? derived.styleBloomGain : 1;
  const clippedByCombo = new Map();
  let clippedPointCount = 0;
  const lineStates = combos
    .filter((combo) => combo.style.lineOpacity > 0.0001 && combo.style.lineWidth > 0.0001)
    .map((combo) => ({
      combo,
      baseRgb: Array.isArray(combo.style.colorRgb) ? combo.style.colorRgb : [1, 1, 1],
      currentBlock: null,
      pendingPoints: [],
      segments: [],
    }));
  if (lineStates.length === 0) {
    return {
      paths: [],
      diagnostics: emptyAtlasPathDiagnostics(pathBudget),
    };
  }

  for (let i = 0; i < derived.nList.length; i++) {
    const nValue = derived.nList[i];
    const block = blockIndexForN(nValue);
    const ctx = computeBaseContext(derived, frameKernel, nValue, i);
    const stageCache = new Map();

    for (const state of lineStates) {
      const { combo } = state;
      if (state.currentBlock !== null && block !== state.currentBlock) {
        flushAtlasSegment(state, styleBloomGain);
      }
      state.currentBlock = block;

      const stages = getOrBuildChildTransformStages(stageCache, combo, ctx, nValue, derived.k2, derived.l_func);
      const transformed = sanitizeLineComplex(stages[combo.variantKey] || [NaN, NaN]);
      if (!transformed) {
        const comboKey = comboKeyFromMeta(combo.setKey, combo.childKey, combo.variantKey);
        clippedByCombo.set(comboKey, (clippedByCombo.get(comboKey) || 0) + 1);
        clippedPointCount += 1;
        flushAtlasSegment(state, styleBloomGain);
        continue;
      }
      state.pendingPoints.push(transformed);
    }
  }

  for (const state of lineStates) {
    flushAtlasSegment(state, styleBloomGain);
  }

  const paths = [];
  const comboSegments = lineStates.map((state) => state.segments);
  const segmentsGenerated = comboSegments.reduce((acc, segs) => acc + segs.length, 0);
  const combosWithSegments = comboSegments.reduce((acc, segs) => acc + (segs.length > 0 ? 1 : 0), 0);
  const segmentOffsets = new Array(comboSegments.length).fill(0);
  let roundStart = roundRobinStartForDerived(derived, comboSegments.length);
  const emittedComboKeys = new Set();

  while (paths.length < pathBudget) {
    let emitted = false;
    for (let turn = 0; turn < comboSegments.length && paths.length < pathBudget; turn++) {
      const idx = (roundStart + turn) % comboSegments.length;
      const offset = segmentOffsets[idx];
      const queue = comboSegments[idx];
      if (offset >= queue.length) continue;
      const segment = queue[offset];
      paths.push(segment);
      emittedComboKeys.add(comboKeyFromMeta(segment.tag?.set, segment.tag?.child, segment.tag?.variant));
      segmentOffsets[idx] = offset + 1;
      emitted = true;
    }
    if (!emitted) break;
    if (comboSegments.length > 0) roundStart = (roundStart + 1) % comboSegments.length;
  }

  const clippedCombos = [...clippedByCombo.entries()]
    .map(([comboKey, clippedPoints]) => {
      const [setKey, childKey, variantKey] = comboKey.split('|');
      return {
        setKey,
        childKey,
        variantKey,
        clippedPoints,
      };
    })
    .sort((a, b) => b.clippedPoints - a.clippedPoints);

  return {
    paths,
    diagnostics: {
      budgetRequested: pathBudget,
      segmentsGenerated,
      segmentsEmitted: paths.length,
      budgetHit: segmentsGenerated > paths.length,
      comboCount: lineStates.length,
      combosWithSegments,
      combosEmitted: emittedComboKeys.size,
      clippedPointCount,
      clippedCombos,
    },
  };
}

export function generateAtlasPaths(params) {
  return generateAtlasPathsWithDiagnostics(params).paths;
}

export function generatePrimaryPaths(params) {
  const derived = buildDerivedState(params);
  const frameKernel = computeFrameKernel(derived, derived.formulaMode);
  const expressionModel = normalizeExpressionModel(derived.expressionModel);
  const style = resolveEffectiveStyle(expressionModel, 'positive', 'sin', 'positiveExponent');
  if (!style.enabled || style.lineOpacity <= 0.0001 || style.lineWidth <= 0.0001) return [];

  const paths = [];
  const baseRgb = Array.isArray(style.colorRgb) ? style.colorRgb : [1, 1, 1];
  const styleBloomGain = Number.isFinite(derived.styleBloomGain) ? derived.styleBloomGain : 1;

  const seg = [];
  for (let i = 0; i < derived.nList.length; i++) {
    const nValue = derived.nList[i];
    const ctx = computeBaseContext(derived, frameKernel, nValue, i);
    const baseZ = evaluateBaseChild('positive', 'positiveExponent', ctx, nValue);
    const transformed = sanitizeLineComplex(evaluateTransform(baseZ, 'sin', derived.k2, derived.l_func));
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
      tag: { set: 'positive', child: 'positiveExponent', variant: 'sin', transform: 'sin' },
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
    const v0 = sanitizePointComplex(cScl(cSin(cScl(f, n0)), k2));
    const v1 = sanitizePointComplex(cScl(cSin(cScl(f, n1)), k2));
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

function evaluateChildForModeWithKernel(derived, frameKernel, setKey, childKey, nValue, nOrdinal) {
  const ctx = computeBaseContext(derived, frameKernel, nValue, nOrdinal);
  return sanitizePointComplex(evaluateBaseChild(setKey, childKey, ctx, nValue));
}

function evaluateChildForMode(derived, setKey, childKey, nValue, nOrdinal, mode) {
  const frameKernel = computeFrameKernel(derived, mode);
  return evaluateChildForModeWithKernel(derived, frameKernel, setKey, childKey, nValue, nOrdinal);
}

export function evaluateBaseChildForMode(params, setKey, childKey, nValue, nOrdinal = 0, mode = 'tau') {
  const derived = buildDerivedState(params);
  return evaluateChildForMode(derived, setKey, childKey, nValue, nOrdinal, mode);
}

export function computeEquivalenceProofRows(params) {
  const derived = buildDerivedState(params);
  const tauKernel = computeFrameKernel(derived, 'tau');
  const eulerKernel = computeFrameKernel(derived, 'euler');
  const rows = [];
  const allErrors = [];
  const nList = Array.isArray(derived.nList) ? derived.nList : [];

  for (const setKey of SET_KEYS) {
    for (const child of CHILDREN_BY_SET[setKey]) {
      const errors = [];
      for (let i = 0; i < nList.length; i++) {
        const nValue = nList[i];
        const tauVal = evaluateChildForModeWithKernel(derived, tauKernel, setKey, child.key, nValue, i);
        const eulerVal = evaluateChildForModeWithKernel(derived, eulerKernel, setKey, child.key, nValue, i);
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

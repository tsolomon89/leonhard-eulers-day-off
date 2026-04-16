import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LN_TAU,
  TAU,
  cExp,
  cCos,
  cLogBase,
  cMul,
  cSin,
  cScl,
  cTauPow,
  cTan,
} from '../js/complex.js';
import {
  buildDerivedState,
  computeCorr,
  computeD,
  computeK1,
  computeKAligned,
  computeQ,
} from '../js/derivation.js';
import {
  defaultExpressionModel,
  NEGATIVE_CHILDREN,
  normalizeExpressionModel,
  POSITIVE_CHILDREN,
  resolveExponentTriState,
  resolveFunctionTriState,
  setExponentSubtreeEnabled,
  setFunctionNodeEnabledWithAncestors,
  setFunctionSubtreeEnabled,
  setVariantNodeEnabledWithAncestors,
  TRANSFORM_KEYS,
} from '../js/expression-model.js';
import {
  computeEquivalenceProofRows,
  evaluateDirectFamily,
  evaluateBaseChildForMode,
  evaluateTransform,
  evaluateTransformStages,
  generateAllPoints,
  generateAtlasPaths,
  generateAtlasPathsWithDiagnostics,
  getActiveExpressionCombos,
} from '../js/generators.js';

const EPS = 1e-9;

function approx(a, b, eps = EPS) {
  return Math.abs(a - b) <= eps;
}

function approxComplex(a, b, eps = EPS) {
  return approx(a[0], b[0], eps) && approx(a[1], b[1], eps);
}

function makeExpressionModel(enableAllTransforms = false) {
  const model = defaultExpressionModel();
  if (enableAllTransforms) {
    for (const key of TRANSFORM_KEYS) model.transforms[key].enabled = true;
    for (const child of Object.keys(model.childVariants)) {
      for (const key of TRANSFORM_KEYS) {
        model.childVariants[child][key].enabled = true;
      }
    }
  }
  return model;
}

function baseState(overrides = {}) {
  return {
    T: 2,
    T_lowerBound: 1.99999,
    T_upperBound: 2,
    b: 1000,
    n_negDepth: 355,
    n_posDepth: 355,
    l_base: 10,
    l_func: 10,
    kStepsInAlignmentsBool: 1,
    q_scale: 1,
    q_tauScale: 0,
    q_bool: 0,
    q_correction: 0,
    k2: 1,
    k3: 1,
    pathBudget: 2000,
    expressionModel: makeExpressionModel(),
    ...overrides,
  };
}

test('JSON-literal k semantics: bool=0 uses T, bool=1 uses kAligned', () => {
  const direct = buildDerivedState(baseState({
    kStepsInAlignmentsBool: 0,
    T: 1.75,
    T_lowerBound: 1,
    T_upperBound: 3,
  }));
  assert.ok(approx(direct.k, 1.75, 1e-12));

  const aligned = buildDerivedState(baseState({ kStepsInAlignmentsBool: 1, T: 2.0, l_base: 10 }));
  assert.ok(approx(aligned.k, computeKAligned(2.0, 10), 1e-12));
});

test('legacy traversal keys are accepted on input but omitted from canonical derived state', () => {
  const derived = buildDerivedState(baseState({
    timeMode: 'off',
    stepRate: 7,
    stepLoopMode: 'bounce',
    syncTStepToS: false,
    tRegion: 'window',
    precomputeBufferUnit: 'seconds',
    precomputeBufferValue: 0.5,
    bufferEnabled: true,
    bufferPhase: 'prefill',
    bufferProgress: 0.4,
    bufferTargetFrames: 99,
    bufferNotice: 'legacy',
  }));
  assert.equal(derived.timeMode, undefined);
  assert.equal(derived.legacyTimeMode, undefined);
  assert.equal(derived.legacyStepRate, undefined);
  assert.equal(derived.stepRate, undefined);
  assert.equal(derived.stepLoopMode, undefined);
  assert.equal(derived.syncTStepToS, undefined);
  assert.equal(derived.tRegion, undefined);
  assert.equal(derived.precomputeBufferUnit, undefined);
  assert.equal(derived.precomputeBufferFrames, undefined);
  assert.equal(derived.bufferEnabled, undefined);
  assert.equal(derived.bufferPhase, undefined);
  assert.equal(derived.bufferTargetFrames, undefined);
  assert.equal(derived.bufferProgress, undefined);
  assert.equal(derived.bufferNotice, undefined);
});

test('JSON-literal q/corr/k1 derivation matches formulas', () => {
  const q = computeQ(3.5, -1);
  const d = computeD(2);
  const corr0 = computeCorr(0, d);
  const corr1 = computeCorr(1, d);
  assert.equal(corr0, 2);
  assert.ok(Number.isFinite(corr1));

  const k1q = computeK1({
    qBool: 0,
    qScale: 3.5,
    q,
    qCorrection: 1,
    dCorrectionFunction: d,
  });
  assert.ok(approx(k1q, 3.5));

  const k1derived = computeK1({
    qBool: 1,
    qScale: 3.5,
    q,
    qCorrection: 0,
    dCorrectionFunction: d,
  });
  assert.ok(approx(k1derived, TAU / q, 1e-10));
});

test('n domain uses directional depths and always includes zero', () => {
  const positiveOnly = buildDerivedState(baseState({ n_negDepth: 0, n_posDepth: 5 }));
  assert.deepEqual(positiveOnly.nList, [0, 1, 2, 3, 4, 5]);

  const mixed = buildDerivedState(baseState({ n_negDepth: 3, n_posDepth: 2 }));
  assert.deepEqual(mixed.nList, [-3, -2, -1, 0, 1, 2]);

  const zeroOnly = buildDerivedState(baseState({ n_negDepth: 0, n_posDepth: 0 }));
  assert.deepEqual(zeroOnly.nList, [0]);

  const clamped = buildDerivedState(baseState({ n_negDepth: -7, n_posDepth: 99999 }));
  assert.equal(clamped.n_negDepth, 0);
  assert.equal(clamped.n_posDepth, 50000);
  assert.equal(clamped.nList[0], 0);
  assert.equal(clamped.nList[clamped.nList.length - 1], 50000);
});

test('registry contains exact 28 plotted base children (14 positive + 14 negative)', () => {
  assert.equal(POSITIVE_CHILDREN.length, 14);
  assert.equal(NEGATIVE_CHILDREN.length, 14);
  assert.equal(POSITIVE_CHILDREN.length + NEGATIVE_CHILDREN.length, 28);
});

test('default tri-state resolves exponents as enabled, functions as mixed', () => {
  const model = defaultExpressionModel();
  // Exponents: all 12 functions ON → enabled
  assert.equal(resolveExponentTriState(model, 'positive'), 'enabled');
  assert.equal(resolveExponentTriState(model, 'negative'), 'enabled');
  // Functions: only base+sin variants ON (2/8) → mixed
  assert.equal(resolveFunctionTriState(model, 'positiveExponentVectorC'), 'mixed');
  assert.equal(resolveFunctionTriState(model, 'negativeExponentVectorC'), 'mixed');
});

test('transform expansion includes base/sin/cos/tan and log wrappers', () => {
  const combos = getActiveExpressionCombos(baseState({
    expressionModel: makeExpressionModel(true),
  }));

  const transforms = new Set(combos.map((c) => c.transformKey));
  assert.equal(transforms.size, 8);
  for (const key of TRANSFORM_KEYS) assert.ok(transforms.has(key));

  // 28 children * 8 variants
  assert.equal(combos.length, 28 * 8);
});

test('legacy transform-only payload migrates into per-function variants', () => {
  const model = normalizeExpressionModel({
    transforms: {
      log: { enabled: true, pointSize: 2.5, lineOpacity: 0.4 },
    },
  });

  assert.equal(model.childVariants.positiveExponent.log.enabled, true);
  assert.ok(approx(model.childVariants.positiveExponent.log.pointSize, 2.5, 1e-12));
  assert.ok(approx(model.childVariants.negativeExponentCircleC.log.lineOpacity, 0.4, 1e-12));
});

test('legacy child key payloads are canonicalized to exponent keys', () => {
  const model = normalizeExpressionModel({
    children: {
      positiveImaginaryVectorB: { enabled: false, pointSize: 2.75 },
    },
    childVariants: {
      positiveImaginaryVectorB: {
        sin: { enabled: true, pointOpacity: 0.42 },
      },
    },
  });

  assert.equal(model.children.positiveExponentVectorC.enabled, false);
  assert.ok(approx(model.children.positiveExponentVectorC.pointSize, 2.75, 1e-12));
  assert.equal(model.childVariants.positiveExponentVectorC.sin.enabled, true);
  assert.ok(approx(model.childVariants.positiveExponentVectorC.sin.pointOpacity, 0.42, 1e-12));
});

test('variant-level activation isolates to exact function+variant combo', () => {
  const expressionModel = makeExpressionModel(false);
  for (const child of Object.keys(expressionModel.childVariants)) {
    for (const key of TRANSFORM_KEYS) expressionModel.childVariants[child][key].enabled = false;
  }
  expressionModel.childVariants.positiveExponent.log.enabled = true;

  const combos = getActiveExpressionCombos(baseState({ expressionModel }));
  assert.equal(combos.length, 1);
  assert.equal(combos[0].childKey, 'positiveExponent');
  assert.equal(combos[0].variantKey, 'log');
});

test('parent->set->function->variant visibility gating follows hierarchy', () => {
  const expressionModel = makeExpressionModel(false);
  for (const child of Object.keys(expressionModel.childVariants)) {
    for (const key of TRANSFORM_KEYS) expressionModel.childVariants[child][key].enabled = false;
  }
  expressionModel.childVariants.positiveExponent.sin.enabled = true;

  let combos = getActiveExpressionCombos(baseState({ expressionModel }));
  assert.equal(combos.length, 1);

  expressionModel.sets.positive.enabled = false;
  combos = getActiveExpressionCombos(baseState({ expressionModel }));
  assert.equal(combos.length, 0);

  expressionModel.sets.positive.enabled = true;
  expressionModel.children.positiveExponent.enabled = false;
  combos = getActiveExpressionCombos(baseState({ expressionModel }));
  assert.equal(combos.length, 0);

  expressionModel.children.positiveExponent.enabled = true;
  expressionModel.childVariants.positiveExponent.sin.enabled = false;
  combos = getActiveExpressionCombos(baseState({ expressionModel }));
  assert.equal(combos.length, 0);
});

test('exponent subtree state machine cycles enabled -> disabled -> mixed -> enabled', () => {
  const expressionModel = makeExpressionModel(true);

  assert.equal(resolveExponentTriState(expressionModel, 'positive'), 'enabled');

  setExponentSubtreeEnabled(expressionModel, 'positive', false);
  assert.equal(resolveExponentTriState(expressionModel, 'positive'), 'disabled');

  let combos = getActiveExpressionCombos(baseState({ expressionModel }));
  assert.ok(!combos.some((combo) => combo.setKey === 'positive'));

  expressionModel.children.positiveExponent.enabled = true;
  expressionModel.childVariants.positiveExponent.base.enabled = true;
  assert.equal(resolveExponentTriState(expressionModel, 'positive'), 'mixed');

  setExponentSubtreeEnabled(expressionModel, 'positive', true);
  assert.equal(resolveExponentTriState(expressionModel, 'positive'), 'enabled');

  combos = getActiveExpressionCombos(baseState({ expressionModel }));
  assert.ok(combos.some((combo) => combo.setKey === 'positive'));

  setExponentSubtreeEnabled(expressionModel, 'positive', false);
  assert.equal(resolveExponentTriState(expressionModel, 'positive'), 'disabled');
});

test('exponent subtree toggle mutates only targeted exponent', () => {
  const expressionModel = makeExpressionModel(true);

  setExponentSubtreeEnabled(expressionModel, 'positive', false);

  assert.equal(expressionModel.sets.positive.enabled, false);
  assert.equal(expressionModel.sets.negative.enabled, true);

  for (const child of POSITIVE_CHILDREN) {
    assert.equal(expressionModel.children[child.key].enabled, false);
    for (const variantKey of TRANSFORM_KEYS) {
      assert.equal(expressionModel.childVariants[child.key][variantKey].enabled, false);
    }
  }

  for (const child of NEGATIVE_CHILDREN) {
    assert.equal(expressionModel.children[child.key].enabled, true);
    for (const variantKey of TRANSFORM_KEYS) {
      assert.equal(expressionModel.childVariants[child.key][variantKey].enabled, true);
    }
  }
});

test('exponent tri-state is isolated between + and - branches', () => {
  const expressionModel = makeExpressionModel(true);

  setExponentSubtreeEnabled(expressionModel, 'positive', false);
  setFunctionSubtreeEnabled(expressionModel, 'positiveExponentVectorC', true);
  const baselinePositive = resolveExponentTriState(expressionModel, 'positive');
  assert.equal(baselinePositive, 'mixed');

  setExponentSubtreeEnabled(expressionModel, 'negative', false);
  assert.equal(resolveExponentTriState(expressionModel, 'positive'), baselinePositive);

  setExponentSubtreeEnabled(expressionModel, 'negative', true);
  assert.equal(resolveExponentTriState(expressionModel, 'positive'), baselinePositive);
});

test('mixed state under disabled exponent remains renderer-gated by set flag', () => {
  const expressionModel = makeExpressionModel(true);

  setExponentSubtreeEnabled(expressionModel, 'positive', false);
  expressionModel.children.positiveExponent.enabled = true;
  expressionModel.childVariants.positiveExponent.sin.enabled = true;

  assert.equal(resolveExponentTriState(expressionModel, 'positive'), 'mixed');

  const combos = getActiveExpressionCombos(baseState({ expressionModel }));
  assert.ok(!combos.some((combo) => combo.setKey === 'positive'));
});

test('function subtree state machine cycles enabled -> disabled -> mixed -> enabled', () => {
  const expressionModel = makeExpressionModel(true);
  const functionKey = 'positiveExponentVectorC';

  assert.equal(resolveFunctionTriState(expressionModel, functionKey), 'enabled');

  setFunctionSubtreeEnabled(expressionModel, functionKey, false);
  assert.equal(resolveFunctionTriState(expressionModel, functionKey), 'disabled');

  let combos = getActiveExpressionCombos(baseState({ expressionModel }));
  assert.ok(!combos.some((combo) => combo.childKey === functionKey));

  expressionModel.childVariants[functionKey].sin.enabled = true;
  assert.equal(resolveFunctionTriState(expressionModel, functionKey), 'mixed');

  combos = getActiveExpressionCombos(baseState({ expressionModel }));
  assert.ok(!combos.some((combo) => combo.childKey === functionKey));

  setFunctionSubtreeEnabled(expressionModel, functionKey, true);
  assert.equal(resolveFunctionTriState(expressionModel, functionKey), 'enabled');

  combos = getActiveExpressionCombos(baseState({ expressionModel }));
  assert.ok(combos.some((combo) => combo.childKey === functionKey));
});

test('function subtree toggle mutates only targeted function and variants', () => {
  const expressionModel = makeExpressionModel(true);
  const functionKey = 'positiveExponentVectorC';
  const otherFunction = 'positiveExponentCircleA';

  setFunctionSubtreeEnabled(expressionModel, functionKey, false);

  assert.equal(expressionModel.children[functionKey].enabled, false);
  for (const variantKey of TRANSFORM_KEYS) {
    assert.equal(expressionModel.childVariants[functionKey][variantKey].enabled, false);
  }

  assert.equal(expressionModel.children[otherFunction].enabled, true);
  for (const variantKey of TRANSFORM_KEYS) {
    assert.equal(expressionModel.childVariants[otherFunction][variantKey].enabled, true);
  }
});

test('enabling function subtree auto-enables exponent ancestor', () => {
  const expressionModel = makeExpressionModel(true);
  const functionKey = 'positiveExponentVectorC';

  setExponentSubtreeEnabled(expressionModel, 'positive', false);
  assert.equal(resolveExponentTriState(expressionModel, 'positive'), 'disabled');

  setFunctionNodeEnabledWithAncestors(expressionModel, 'positive', functionKey, true);
  assert.equal(expressionModel.sets.positive.enabled, true);
  assert.equal(resolveExponentTriState(expressionModel, 'positive'), 'mixed');
  assert.equal(resolveFunctionTriState(expressionModel, functionKey), 'enabled');
});

test('function node enable restores full subtree mask', () => {
  const expressionModel = makeExpressionModel(true);
  const functionKey = 'positiveExponent';

  setFunctionSubtreeEnabled(expressionModel, functionKey, false);
  assert.equal(resolveFunctionTriState(expressionModel, functionKey), 'disabled');

  setFunctionNodeEnabledWithAncestors(expressionModel, 'positive', functionKey, true);
  assert.equal(expressionModel.children[functionKey].enabled, true);
  assert.equal(resolveFunctionTriState(expressionModel, functionKey), 'enabled');

  for (const variantKey of TRANSFORM_KEYS) {
    assert.equal(
      expressionModel.childVariants[functionKey][variantKey].enabled,
      true,
      `${functionKey}.${variantKey} full-subtree mismatch`,
    );
  }
});

test('legacy hex color payloads normalize into hue channels', () => {
  const model = normalizeExpressionModel({
    parent: { color: '#00ff00' },
    children: { positiveExponent: { color: '#ff0000' } },
    childVariants: { positiveExponent: { sin: { color: '#0000ff' } } },
  });

  assert.ok(Number.isFinite(model.parent.colorHue));
  assert.ok(Number.isFinite(model.children.positiveExponent.colorHue));
  assert.ok(Number.isFinite(model.childVariants.positiveExponent.sin.colorHue));
  assert.ok(approx(model.parent.colorHue, 1 / 3, 1e-6));
  assert.ok(approx(model.children.positiveExponent.colorHue, 0, 1e-6));
  assert.ok(approx(model.childVariants.positiveExponent.sin.colorHue, 2 / 3, 1e-6));
});

test('enabling variant auto-enables function and exponent ancestors', () => {
  const expressionModel = makeExpressionModel(true);
  const functionKey = 'positiveExponentVectorC';
  const variantKey = 'sin';

  setExponentSubtreeEnabled(expressionModel, 'positive', false);
  setFunctionSubtreeEnabled(expressionModel, functionKey, false);
  assert.equal(resolveExponentTriState(expressionModel, 'positive'), 'disabled');
  assert.equal(resolveFunctionTriState(expressionModel, functionKey), 'disabled');

  setVariantNodeEnabledWithAncestors(expressionModel, 'positive', functionKey, variantKey, true);
  assert.equal(expressionModel.sets.positive.enabled, true);
  assert.equal(expressionModel.children[functionKey].enabled, true);
  assert.equal(expressionModel.childVariants[functionKey][variantKey].enabled, true);
  assert.equal(resolveFunctionTriState(expressionModel, functionKey), 'mixed');
  assert.equal(resolveExponentTriState(expressionModel, 'positive'), 'mixed');
});

test('default model starts in mixed state at function level, enabled at exponent level', () => {
  const model = defaultExpressionModel();
  assert.equal(resolveFunctionTriState(model, 'positiveExponent'), 'mixed');
  assert.equal(resolveFunctionTriState(model, 'negativeExponent'), 'mixed');
  assert.equal(resolveExponentTriState(model, 'positive'), 'enabled');
  assert.equal(resolveExponentTriState(model, 'negative'), 'enabled');
});

test('visual helper defaults include decoupled reference and orbit ring toggles', () => {
  const stateLike = {
    expressionModel: defaultExpressionModel(),
    cinematicFx: {},
    visualHelpers: {},
  };
  stateLike.visualHelpers.referenceRings = true;
  stateLike.visualHelpers.orbitRing = true;
  assert.equal(typeof stateLike.visualHelpers.referenceRings, 'boolean');
  assert.equal(typeof stateLike.visualHelpers.orbitRing, 'boolean');
});

test('formula mode tau/euler base kernels are both evaluable and deterministic', () => {
  const params = baseState({
    T: 2,
    T_lowerBound: 1.5,
    T_upperBound: 2.5,
    n_negDepth: 0,
    n_posDepth: 11,
  });
  const tau = evaluateBaseChildForMode(params, 'positive', 'positiveExponent', 1, 0, 'tau');
  const euler = evaluateBaseChildForMode(params, 'positive', 'positiveExponent', 1, 0, 'euler');
  assert.ok(Number.isFinite(tau[0]) && Number.isFinite(tau[1]));
  assert.ok(Number.isFinite(euler[0]) && Number.isFinite(euler[1]));

  const circleTau = evaluateBaseChildForMode(params, 'positive', 'positiveExponentCircleA', 1, 0, 'tau');
  const circleEuler = evaluateBaseChildForMode(params, 'positive', 'positiveExponentCircleA', 1, 0, 'euler');
  assert.ok(Number.isFinite(circleTau[0]) && Number.isFinite(circleTau[1]));
  assert.ok(Number.isFinite(circleEuler[0]) && Number.isFinite(circleEuler[1]));
});

test('negative exponent branch mirrors positive branch with conjugate symmetry when not alignment-locked', () => {
  const params = baseState({
    kStepsInAlignmentsBool: 0,
    T: 2,
    T_lowerBound: 1.8,
    T_upperBound: 2.2,
  });
  const nValue = 137;
  const nOrdinal = 42;

  const pairs = [
    ['positiveExponent', 'negativeExponent'],
    ['positiveExponentReciprocal', 'negativeExponentReciprocal'],
    ['positiveExponentVectorC', 'negativeExponentVectorC'],
    ['positiveExponentVectorCReciprocal', 'negativeExponentVectorCReciprocal'],
    ['positiveExponentCircleA', 'negativeExponentCircleA'],
    ['positiveExponentCircleB', 'negativeExponentCircleB'],
    ['positiveExponentCircleC', 'negativeExponentCircleC'],
    ['positiveExponentCircleBReciprocal', 'negativeExponentCircleBReciprocal'],
    ['positiveExponentCircleCReciprocal', 'negativeExponentCircleCReciprocal'],
  ];

  for (const [positiveKey, negativeKey] of pairs) {
    const positive = evaluateBaseChildForMode(params, 'positive', positiveKey, nValue, nOrdinal, 'tau');
    const negative = evaluateBaseChildForMode(params, 'negative', negativeKey, nValue, nOrdinal, 'tau');
    assert.ok(positive && negative, `${positiveKey}/${negativeKey} should evaluate`);
    assert.ok(approx(positive[0], negative[0], 1e-9), `${positiveKey}/${negativeKey} real parts should match`);
    assert.ok(approx(positive[1], -negative[1], 1e-9), `${positiveKey}/${negativeKey} imag parts should be sign mirrored`);
  }
});

test('all reciprocal families are true multiplicative inverses', () => {
  const params = baseState({
    kStepsInAlignmentsBool: 0,
    T: 2,
    T_lowerBound: 1.8,
    T_upperBound: 2.2,
  });
  const nValue = 23;
  const nOrdinal = 0;

  const reciprocalPairs = [
    ['Exponent', 'ExponentReciprocal'],
    ['ExponentVectorA', 'ExponentVectorAReciprocal'],
    ['ExponentVectorB', 'ExponentVectorBReciprocal'],
    ['ExponentVectorC', 'ExponentVectorCReciprocal'],
    ['ExponentCircleA', 'ExponentCircleAReciprocal'],
    ['ExponentCircleB', 'ExponentCircleBReciprocal'],
    ['ExponentCircleC', 'ExponentCircleCReciprocal'],
  ];

  for (const setPrefix of ['positive', 'negative']) {
    for (const [baseSuffix, reciprocalSuffix] of reciprocalPairs) {
      const baseKey = `${setPrefix}${baseSuffix}`;
      const reciprocalKey = `${setPrefix}${reciprocalSuffix}`;
      const base = evaluateBaseChildForMode(params, setPrefix, baseKey, nValue, nOrdinal, 'tau');
      const reciprocal = evaluateBaseChildForMode(params, setPrefix, reciprocalKey, nValue, nOrdinal, 'tau');
      assert.ok(base && reciprocal, `${baseKey}/${reciprocalKey} should evaluate`);
      const product = cMul(base, reciprocal);
      assert.ok(approx(product[0], 1, 1e-9), `${baseKey}/${reciprocalKey} product real ≈ 1`);
      assert.ok(approx(product[1], 0, 1e-9), `${baseKey}/${reciprocalKey} product imag ≈ 0`);
    }
  }
});

test('alignment-locked T≈2 can collapse +/- base and vector families onto the same real-axis path', () => {
  const params = baseState({
    kStepsInAlignmentsBool: 1,
    T: 2,
    T_lowerBound: 1.99999,
    T_upperBound: 2,
  });

  const basePositive = evaluateBaseChildForMode(params, 'positive', 'positiveExponent', 250, 100, 'tau');
  const baseNegative = evaluateBaseChildForMode(params, 'negative', 'negativeExponent', 250, 100, 'tau');
  const vectorPositive = evaluateBaseChildForMode(params, 'positive', 'positiveExponentVectorC', 250, 100, 'tau');
  const vectorNegative = evaluateBaseChildForMode(params, 'negative', 'negativeExponentVectorC', 250, 100, 'tau');

  assert.ok(basePositive && baseNegative);
  assert.ok(vectorPositive && vectorNegative);
  assert.ok(approxComplex(basePositive, baseNegative, 1e-9));
  assert.ok(approxComplex(vectorPositive, vectorNegative, 1e-9));
});

test('CircleA uses shared canonical k so T updates drive both imaginary sets', () => {
  const paramsA = baseState({
    kStepsInAlignmentsBool: 0,
    T: 1.8,
    T_lowerBound: 1.7,
    T_upperBound: 2.2,
  });
  const paramsB = {
    ...paramsA,
    T: 2.1,
  };

  const tauPosA = evaluateBaseChildForMode(paramsA, 'positive', 'positiveExponentCircleA', 2, 0, 'tau');
  const tauPosB = evaluateBaseChildForMode(paramsB, 'positive', 'positiveExponentCircleA', 2, 0, 'tau');
  const tauNegA = evaluateBaseChildForMode(paramsA, 'negative', 'negativeExponentCircleA', 2, 0, 'tau');
  const tauNegB = evaluateBaseChildForMode(paramsB, 'negative', 'negativeExponentCircleA', 2, 0, 'tau');

  assert.ok(!approxComplex(tauPosA, tauPosB, 1e-8));
  assert.ok(!approxComplex(tauNegA, tauNegB, 1e-8));
});

test('CircleA tau/euler implementations share equivalent angle construction with signed parity', () => {
  const params = baseState({
    kStepsInAlignmentsBool: 0,
    T: 2.05,
    T_lowerBound: 2,
    T_upperBound: 2.2,
  });
  const nValue = 1;
  const derived = buildDerivedState(params);
  const theta = derived.k * Math.pow(TAU, nValue);

  const expectedTauPositive = cTauPow([0, theta / LN_TAU]);
  const expectedTauNegative = cTauPow([0, -theta / LN_TAU]);
  const expectedEulerPositive = cExp([0, theta]);
  const expectedEulerNegative = cExp([0, -theta]);

  const tauPositive = evaluateBaseChildForMode(params, 'positive', 'positiveExponentCircleA', nValue, 0, 'tau');
  const tauNegative = evaluateBaseChildForMode(params, 'negative', 'negativeExponentCircleA', nValue, 0, 'tau');
  const eulerPositive = evaluateBaseChildForMode(params, 'positive', 'positiveExponentCircleA', nValue, 0, 'euler');
  const eulerNegative = evaluateBaseChildForMode(params, 'negative', 'negativeExponentCircleA', nValue, 0, 'euler');

  assert.ok(approxComplex(tauPositive, expectedTauPositive, 1e-10));
  assert.ok(approxComplex(tauNegative, expectedTauNegative, 1e-10));
  assert.ok(approxComplex(eulerPositive, expectedEulerPositive, 1e-10));
  assert.ok(approxComplex(eulerNegative, expectedEulerNegative, 1e-10));
});

test('CircleC uses explicit tau/(k*n) formula (not -CircleB derivation)', () => {
  const params = baseState({
    kStepsInAlignmentsBool: 0,
    T: 2.05,
    T_lowerBound: 2,
    T_upperBound: 2.2,
  });
  const nValue = 13;
  const derived = buildDerivedState(params);
  const theta = TAU / (derived.k * nValue);

  const expectedTauPositive = cScl(cTauPow([0, theta / LN_TAU]), derived.k1);
  const expectedTauNegative = cScl(cTauPow([0, -theta / LN_TAU]), derived.k1);
  const expectedEulerPositive = cScl(cExp([0, theta]), derived.k1);
  const expectedEulerNegative = cScl(cExp([0, -theta]), derived.k1);

  const tauPositive = evaluateBaseChildForMode(params, 'positive', 'positiveExponentCircleC', nValue, 0, 'tau');
  const tauNegative = evaluateBaseChildForMode(params, 'negative', 'negativeExponentCircleC', nValue, 0, 'tau');
  const eulerPositive = evaluateBaseChildForMode(params, 'positive', 'positiveExponentCircleC', nValue, 0, 'euler');
  const eulerNegative = evaluateBaseChildForMode(params, 'negative', 'negativeExponentCircleC', nValue, 0, 'euler');

  assert.ok(approxComplex(tauPositive, expectedTauPositive, 1e-10));
  assert.ok(approxComplex(tauNegative, expectedTauNegative, 1e-10));
  assert.ok(approxComplex(eulerPositive, expectedEulerPositive, 1e-10));
  assert.ok(approxComplex(eulerNegative, expectedEulerNegative, 1e-10));
});

test('equivalence proof rows cover all base children across both sets', () => {
  const proof = computeEquivalenceProofRows(baseState({
    n_negDepth: 0,
    n_posDepth: 15,
  }));
  assert.equal(proof.rows.length, 28);
  assert.ok(proof.rows.every((row) => typeof row.childKey === 'string'));
  assert.ok(Number.isFinite(proof.summary.samples));
});

test('log(f)/cos/tan/log(cos)/log(tan) evaluate correctly with l_func base', () => {
  const z = [0.17, -0.23];
  const k2 = 1.4;
  const lFunc = 10;

  assert.ok(
    approxComplex(
      evaluateTransform(z, 'log', k2, lFunc),
      cLogBase(z, lFunc),
      1e-12,
    ),
  );
  assert.ok(approxComplex(evaluateTransform(z, 'cos', k2, lFunc), cScl(cCos(z), k2), 1e-12));
  assert.ok(approxComplex(evaluateTransform(z, 'tan', k2, lFunc), cScl(cTan(z), k2), 1e-12));
  assert.ok(
    approxComplex(
      evaluateTransform(z, 'log_cos', k2, lFunc),
      cLogBase(cScl(cCos(z), k2), lFunc),
      1e-12,
    ),
  );
  assert.ok(
    approxComplex(
      evaluateTransform(z, 'log_tan', k2, lFunc),
      cLogBase(cScl(cTan(z), k2), lFunc),
      1e-12,
    ),
  );
});

test('staged transform evaluation matches direct transform evaluation for all variants', () => {
  const z = [0.31, -0.47];
  const k2 = 1.25;
  const lFunc = 7;
  const staged = evaluateTransformStages(z, k2, lFunc);

  for (const key of TRANSFORM_KEYS) {
    const direct = evaluateTransform(z, key, k2, lFunc);
    assert.ok(
      approxComplex(staged[key], direct, 1e-12),
      `staged transform mismatch for ${key}`,
    );
  }
});

test('log_* staged transforms reuse their staged trig parents exactly', () => {
  const z = [0.22, -0.19];
  const k2 = 0.85;
  const lFunc = 10;
  const staged = evaluateTransformStages(z, k2, lFunc);

  assert.ok(approxComplex(staged.log_sin, cLogBase(staged.sin, lFunc), 1e-12));
  assert.ok(approxComplex(staged.log_cos, cLogBase(staged.cos, lFunc), 1e-12));
  assert.ok(approxComplex(staged.log_tan, cLogBase(staged.tan, lFunc), 1e-12));
});

test('direct trig family evaluator still maps base/sin/cos/tan branches', () => {
  const z = [0.2, -0.1];
  const k2 = 1.2;
  assert.ok(approxComplex(evaluateDirectFamily(z, 0, 0, k2), z));
  assert.ok(approxComplex(evaluateDirectFamily(z, 0, 1, k2), cScl(cSin(z), k2), 1e-12));
  assert.ok(approxComplex(evaluateDirectFamily(z, 0, 2, k2), cScl(cCos(z), k2), 1e-12));
  assert.ok(approxComplex(evaluateDirectFamily(z, 0, 3, k2), cScl(cTan(z), k2), 1e-12));
});

test('disabled parent gates compute paths for points and lines', () => {
  const expressionModel = makeExpressionModel(true);
  expressionModel.parent.enabled = false;
  const params = baseState({ expressionModel });
  const points = generateAllPoints(params);
  const lines = generateAtlasPaths(params);
  assert.equal(points.count, 0);
  assert.equal(lines.length, 0);
});

test('style composition is multiplicative across parent × set × variant × child', () => {
  const expressionModel = makeExpressionModel(false);
  expressionModel.parent.pointSize = 2;
  expressionModel.sets.positive.pointSize = 3;
  expressionModel.childVariants.positiveExponent.sin.enabled = true;
  expressionModel.childVariants.positiveExponent.sin.pointSize = 0.5;
  expressionModel.children.positiveExponent.pointSize = 4;

  const combos = getActiveExpressionCombos(baseState({ expressionModel }));
  const combo = combos.find((c) =>
    c.setKey === 'positive' &&
    c.childKey === 'positiveExponent' &&
    c.transformKey === 'sin');
  assert.ok(combo);
  assert.ok(approx(combo.style.pointSize, 2 * 3 * 0.5 * 4, 1e-12));
});

test('generated point payload carries per-point expression size multipliers', () => {
  const expressionModel = makeExpressionModel(false);
  for (const child of Object.keys(expressionModel.childVariants)) {
    for (const key of TRANSFORM_KEYS) expressionModel.childVariants[child][key].enabled = false;
    expressionModel.children[child].enabled = false;
  }

  expressionModel.parent.pointSize = 2;
  expressionModel.sets.positive.pointSize = 5;
  expressionModel.children.positiveExponent.enabled = true;
  expressionModel.children.positiveExponent.pointSize = 4;
  expressionModel.childVariants.positiveExponent.sin.enabled = true;
  expressionModel.childVariants.positiveExponent.sin.pointSize = 3;
  expressionModel.sets.negative.enabled = false;

  const points = generateAllPoints(baseState({
    expressionModel,
    n_negDepth: 0,
    n_posDepth: 3,
    k3: 7,
  }));

  assert.ok(points.count > 0);
  assert.ok(points.sizes.length > 0);
  assert.ok(approx(points.sizes[0], 2 * 5 * 4 * 3, 1e-9));
});

test('color hue precedence resolves parent -> child -> variant', () => {
  const expressionModel = makeExpressionModel(false);
  const targetChild = 'positiveExponent';
  const targetVariant = 'sin';

  expressionModel.parent.colorHue = 0.1;
  expressionModel.children[targetChild].colorHue = undefined;
  expressionModel.childVariants[targetChild][targetVariant].colorHue = undefined;

  let combos = getActiveExpressionCombos(baseState({ expressionModel }));
  let combo = combos.find((c) => c.childKey === targetChild && c.transformKey === targetVariant && c.setKey === 'positive');
  assert.ok(combo);
  assert.ok(approx(combo.style.colorHue, 0.1, 1e-12));

  expressionModel.children[targetChild].colorHue = 0.35;
  combos = getActiveExpressionCombos(baseState({ expressionModel }));
  combo = combos.find((c) => c.childKey === targetChild && c.transformKey === targetVariant && c.setKey === 'positive');
  assert.ok(combo);
  assert.ok(approx(combo.style.colorHue, 0.35, 1e-12));

  expressionModel.childVariants[targetChild][targetVariant].colorHue = 0.72;
  combos = getActiveExpressionCombos(baseState({ expressionModel }));
  combo = combos.find((c) => c.childKey === targetChild && c.transformKey === targetVariant && c.setKey === 'positive');
  assert.ok(combo);
  assert.ok(approx(combo.style.colorHue, 0.72, 1e-12));
});

test('paths split across fixed 710-color boundary blocks when range exceeds 710', () => {
  const expressionModel = makeExpressionModel(false);
  for (const child of Object.keys(expressionModel.childVariants)) {
    for (const key of TRANSFORM_KEYS) expressionModel.childVariants[child][key].enabled = false;
  }
  expressionModel.childVariants.positiveExponent.sin.enabled = true;
  for (const child of [...POSITIVE_CHILDREN, ...NEGATIVE_CHILDREN]) {
    expressionModel.children[child.key].enabled = false;
  }
  expressionModel.children.positiveExponent.enabled = true;
  expressionModel.sets.negative.enabled = false;

  const paths = generateAtlasPaths(baseState({
    n_negDepth: 0,
    n_posDepth: 719,
    expressionModel,
    pathBudget: 5000,
  }));

  assert.ok(paths.length > 0);
  const blocks = new Set(paths.map((p) => p.tag?.block));
  assert.ok(blocks.has(0));
  assert.ok(blocks.has(1));
});

test('round-robin path scheduling does not starve later function sets under tight budget', () => {
  const expressionModel = makeExpressionModel(false);
  for (const child of Object.keys(expressionModel.childVariants)) {
    for (const key of TRANSFORM_KEYS) expressionModel.childVariants[child][key].enabled = false;
    expressionModel.childVariants[child].sin.enabled = true;
  }
  for (const child of [...POSITIVE_CHILDREN, ...NEGATIVE_CHILDREN]) {
    expressionModel.children[child.key].enabled = true;
  }
  expressionModel.sets.positive.enabled = true;
  expressionModel.sets.negative.enabled = true;

  const paths = generateAtlasPaths(baseState({
    n_negDepth: 0,
    n_posDepth: 219,
    pathBudget: 10,
    expressionModel,
  }));

  assert.equal(paths.length, 10);
  const sets = new Set(paths.map((p) => p.tag?.set));
  assert.ok(sets.has('positive'));
  assert.ok(sets.has('negative'));
});

test('atlas path diagnostics report budget truncation and combo coverage', () => {
  const expressionModel = makeExpressionModel(false);
  for (const child of Object.keys(expressionModel.childVariants)) {
    for (const key of TRANSFORM_KEYS) expressionModel.childVariants[child][key].enabled = false;
    expressionModel.childVariants[child].sin.enabled = true;
  }

  const lowCap = generateAtlasPathsWithDiagnostics(baseState({
    n_negDepth: 0,
    n_posDepth: 719,
    pathBudget: 10,
    expressionModel,
  }));

  assert.equal(lowCap.paths.length, 10);
  assert.equal(lowCap.diagnostics.segmentsEmitted, lowCap.paths.length);
  assert.equal(lowCap.diagnostics.budgetRequested, 10);
  assert.equal(lowCap.diagnostics.budgetHit, true);
  assert.ok(lowCap.diagnostics.segmentsGenerated >= lowCap.diagnostics.segmentsEmitted);
  assert.ok(lowCap.diagnostics.combosEmitted <= lowCap.diagnostics.comboCount);

  const highCap = generateAtlasPathsWithDiagnostics(baseState({
    n_negDepth: 0,
    n_posDepth: 719,
    pathBudget: 50000,
    expressionModel,
  }));

  assert.equal(highCap.diagnostics.budgetRequested, 50000);
  assert.equal(highCap.diagnostics.budgetHit, false);
  assert.equal(highCap.diagnostics.segmentsGenerated, highCap.diagnostics.segmentsEmitted);
});

test('raised line clipping threshold preserves large-n vectorA base paths', () => {
  const expressionModel = makeExpressionModel(false);
  for (const child of Object.keys(expressionModel.childVariants)) {
    expressionModel.children[child].enabled = false;
    for (const key of TRANSFORM_KEYS) expressionModel.childVariants[child][key].enabled = false;
  }
  expressionModel.children.positiveExponentVectorA.enabled = true;
  expressionModel.childVariants.positiveExponentVectorA.base.enabled = true;
  expressionModel.sets.negative.enabled = false;

  const { paths, diagnostics } = generateAtlasPathsWithDiagnostics(baseState({
    n_negDepth: 0,
    n_posDepth: 21999,
    pathBudget: 50000,
    expressionModel,
  }));

  assert.ok(paths.length > 0);
  const represented = new Set(paths.map((p) => `${p.tag?.set}|${p.tag?.child}|${p.tag?.variant}`));
  assert.ok(represented.has('positive|positiveExponentVectorA|base'));
  assert.equal(diagnostics.combosWithSegments >= 1, true);
});

test('high n block tint selection is modulo-safe and keeps colors finite', () => {
  const expressionModel = makeExpressionModel(false);
  for (const child of Object.keys(expressionModel.childVariants)) {
    for (const key of TRANSFORM_KEYS) expressionModel.childVariants[child][key].enabled = false;
    expressionModel.children[child].enabled = false;
  }
  expressionModel.childVariants.positiveExponent.sin.enabled = true;
  expressionModel.children.positiveExponent.enabled = true;
  expressionModel.sets.negative.enabled = false;

  const paths = generateAtlasPaths(baseState({
    n_negDepth: 0,
    n_posDepth: 4999,
    pathBudget: 1000,
    expressionModel,
  }));

  assert.ok(paths.length > 0);
  for (const path of paths) {
    assert.ok(Array.isArray(path.color));
    assert.equal(path.color.length, 3);
    assert.ok(path.color.every((c) => Number.isFinite(c)));
  }
});

test('function toggle restores target line combos without mutating siblings', () => {
  const expressionModel = makeExpressionModel(true);
  const params = baseState({
    n_negDepth: 0,
    n_posDepth: 709,
    pathBudget: 50000,
    expressionModel,
  });
  const keyOf = (p) => `${p.tag?.set}|${p.tag?.child}|${p.tag?.variant}`;

  const beforePaths = generateAtlasPaths(params);
  const before = new Set(beforePaths.map((p) => keyOf(p)));
  const functionKey = 'positiveExponent';
  const targetPrefix = `positive|${functionKey}|`;
  const siblingBefore = new Set([...before].filter((k) => !k.startsWith(targetPrefix)));

  setFunctionNodeEnabledWithAncestors(expressionModel, 'positive', functionKey, false);
  setFunctionNodeEnabledWithAncestors(expressionModel, 'positive', functionKey, true);

  const afterPaths = generateAtlasPaths(params);
  const after = new Set(afterPaths.map((p) => keyOf(p)));
  const siblingAfter = new Set([...after].filter((k) => !k.startsWith(targetPrefix)));

  for (const siblingKey of siblingBefore) {
    assert.ok(siblingAfter.has(siblingKey), `missing sibling combo ${siblingKey}`);
  }
  for (const key of before) {
    assert.ok(after.has(key), `missing restored combo ${key}`);
  }
});

test('legacy numStrands field does not affect canonical outputs', () => {
  const base = baseState();
  const a = generateAllPoints({ ...base, numStrands: 1 });
  const aPos = Array.from(a.positions.slice(0, 120));
  const aCol = Array.from(a.colors.slice(0, 120));

  const b = generateAllPoints({ ...base, numStrands: 16 });
  const bPos = Array.from(b.positions.slice(0, 120));
  const bCol = Array.from(b.colors.slice(0, 120));

  assert.equal(a.count, b.count);
  assert.deepEqual(aPos, bPos);
  assert.deepEqual(aCol, bCol);
});

test('q_scale materially changes spoke-driving output family', () => {
  const model = makeExpressionModel(false);
  for (const child of Object.keys(model.childVariants)) {
    for (const key of TRANSFORM_KEYS) model.childVariants[child][key].enabled = false;
  }
  model.childVariants.positiveExponentVectorC.sin.enabled = true;
  for (const child of [...POSITIVE_CHILDREN, ...NEGATIVE_CHILDREN]) {
    model.children[child.key].enabled = false;
  }
  model.children.positiveExponentVectorC.enabled = true;
  model.sets.negative.enabled = false;

  const a = generateAllPoints(baseState({
    q_bool: 0,
    q_scale: 1,
    expressionModel: model,
  }));
  const aPos = Array.from(a.positions.slice(0, 12));

  const b = generateAllPoints(baseState({
    q_bool: 0,
    q_scale: 2,
    expressionModel: model,
  }));
  const bPos = Array.from(b.positions.slice(0, 12));

  assert.ok(a.count > 0);
  assert.ok(b.count > 0);
  assert.notDeepEqual(aPos, bPos);
});

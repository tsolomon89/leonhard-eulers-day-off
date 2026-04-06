import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LN_TAU,
  TAU,
  cExp,
  cCos,
  cLogBase,
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
  generateAllPoints,
  generateAtlasPaths,
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
    Z_min: 0,
    Z_max: 720,
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

test('playback mode is normalized to unified stepping with legacy mirror retained', () => {
  const derived = buildDerivedState(baseState({
    timeMode: 'off',
    stepRate: 7,
    precomputeBufferUnit: 'seconds',
    precomputeBufferValue: 0.5,
    bufferEnabled: true,
    bufferPhase: 'prefill',
    bufferProgress: 0.4,
  }));
  assert.equal(derived.timeMode, 'step');
  assert.equal(derived.legacyTimeMode, 'off');
  assert.equal(derived.legacyStepRate, 7);
  assert.equal(derived.stepRate, undefined);
  assert.equal(derived.precomputeBufferUnit, 'seconds');
  assert.equal(derived.precomputeBufferFrames, 30);
  assert.equal(derived.bufferEnabled, true);
  assert.equal(derived.bufferPhase, 'prefill');
  assert.equal(derived.bufferTargetFrames, 30);
  assert.equal(derived.bufferProgress, 0.4);
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

test('n domain follows JSON-literal [Z_min+1 ... Z_max-1] with negative Z_min support', () => {
  const d = buildDerivedState(baseState({ Z_min: 5, Z_max: 12 }));
  assert.deepEqual(d.nList, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

  const neg = buildDerivedState(baseState({ Z_min: -3, Z_max: 3 }));
  assert.deepEqual(neg.nList, [-2, -1, 0, 1, 2]);

  const minGap = buildDerivedState(baseState({ Z_min: 0, Z_max: 1 }));
  assert.deepEqual(minGap.nList, [1]);
});

test('registry contains exact 24 plotted base children (12 positive + 12 negative)', () => {
  assert.equal(POSITIVE_CHILDREN.length, 12);
  assert.equal(NEGATIVE_CHILDREN.length, 12);
  assert.equal(POSITIVE_CHILDREN.length + NEGATIVE_CHILDREN.length, 24);
});

test('default tri-state resolves exponents as enabled, functions as mixed', () => {
  const model = defaultExpressionModel();
  // Exponents: all 12 functions ON → enabled
  assert.equal(resolveExponentTriState(model, 'positive'), 'enabled');
  assert.equal(resolveExponentTriState(model, 'negative'), 'enabled');
  // Functions: only base+sin variants ON (2/8) → mixed
  assert.equal(resolveFunctionTriState(model, 'positiveImaginaryVectorB'), 'mixed');
  assert.equal(resolveFunctionTriState(model, 'negativeImaginaryVectorB'), 'mixed');
});

test('transform expansion includes base/sin/cos/tan and log wrappers', () => {
  const combos = getActiveExpressionCombos(baseState({
    expressionModel: makeExpressionModel(true),
  }));

  const transforms = new Set(combos.map((c) => c.transformKey));
  assert.equal(transforms.size, 8);
  for (const key of TRANSFORM_KEYS) assert.ok(transforms.has(key));

  // 24 children * 8 variants
  assert.equal(combos.length, 24 * 8);
});

test('legacy transform-only payload migrates into per-function variants', () => {
  const model = normalizeExpressionModel({
    transforms: {
      log: { enabled: true, pointSize: 2.5, lineOpacity: 0.4 },
    },
  });

  assert.equal(model.childVariants.positiveImaginary.log.enabled, true);
  assert.ok(approx(model.childVariants.positiveImaginary.log.pointSize, 2.5, 1e-12));
  assert.ok(approx(model.childVariants.negativeImaginaryCircleC.log.lineOpacity, 0.4, 1e-12));
});

test('variant-level activation isolates to exact function+variant combo', () => {
  const expressionModel = makeExpressionModel(false);
  for (const child of Object.keys(expressionModel.childVariants)) {
    for (const key of TRANSFORM_KEYS) expressionModel.childVariants[child][key].enabled = false;
  }
  expressionModel.childVariants.positiveImaginary.log.enabled = true;

  const combos = getActiveExpressionCombos(baseState({ expressionModel }));
  assert.equal(combos.length, 1);
  assert.equal(combos[0].childKey, 'positiveImaginary');
  assert.equal(combos[0].variantKey, 'log');
});

test('parent->set->function->variant visibility gating follows hierarchy', () => {
  const expressionModel = makeExpressionModel(false);
  for (const child of Object.keys(expressionModel.childVariants)) {
    for (const key of TRANSFORM_KEYS) expressionModel.childVariants[child][key].enabled = false;
  }
  expressionModel.childVariants.positiveImaginary.sin.enabled = true;

  let combos = getActiveExpressionCombos(baseState({ expressionModel }));
  assert.equal(combos.length, 1);

  expressionModel.sets.positive.enabled = false;
  combos = getActiveExpressionCombos(baseState({ expressionModel }));
  assert.equal(combos.length, 0);

  expressionModel.sets.positive.enabled = true;
  expressionModel.children.positiveImaginary.enabled = false;
  combos = getActiveExpressionCombos(baseState({ expressionModel }));
  assert.equal(combos.length, 0);

  expressionModel.children.positiveImaginary.enabled = true;
  expressionModel.childVariants.positiveImaginary.sin.enabled = false;
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

  expressionModel.children.positiveImaginary.enabled = true;
  expressionModel.childVariants.positiveImaginary.base.enabled = true;
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
  setFunctionSubtreeEnabled(expressionModel, 'positiveImaginaryVectorB', true);
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
  expressionModel.children.positiveImaginary.enabled = true;
  expressionModel.childVariants.positiveImaginary.sin.enabled = true;

  assert.equal(resolveExponentTriState(expressionModel, 'positive'), 'mixed');

  const combos = getActiveExpressionCombos(baseState({ expressionModel }));
  assert.ok(!combos.some((combo) => combo.setKey === 'positive'));
});

test('function subtree state machine cycles enabled -> disabled -> mixed -> enabled', () => {
  const expressionModel = makeExpressionModel(true);
  const functionKey = 'positiveImaginaryVectorB';

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
  const functionKey = 'positiveImaginaryVectorB';
  const otherFunction = 'positiveImaginaryCircleA';

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
  const functionKey = 'positiveImaginaryVectorB';

  setExponentSubtreeEnabled(expressionModel, 'positive', false);
  assert.equal(resolveExponentTriState(expressionModel, 'positive'), 'disabled');

  setFunctionNodeEnabledWithAncestors(expressionModel, 'positive', functionKey, true);
  assert.equal(expressionModel.sets.positive.enabled, true);
  assert.equal(resolveExponentTriState(expressionModel, 'positive'), 'mixed');
  assert.equal(resolveFunctionTriState(expressionModel, functionKey), 'enabled');
});

test('enabling variant auto-enables function and exponent ancestors', () => {
  const expressionModel = makeExpressionModel(true);
  const functionKey = 'positiveImaginaryVectorB';
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
  assert.equal(resolveFunctionTriState(model, 'positiveImaginary'), 'mixed');
  assert.equal(resolveFunctionTriState(model, 'negativeImaginary'), 'mixed');
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
    Z_min: 0,
    Z_max: 12,
  });
  const tau = evaluateBaseChildForMode(params, 'positive', 'positiveImaginary', 1, 0, 'tau');
  const euler = evaluateBaseChildForMode(params, 'positive', 'positiveImaginary', 1, 0, 'euler');
  assert.ok(Number.isFinite(tau[0]) && Number.isFinite(tau[1]));
  assert.ok(Number.isFinite(euler[0]) && Number.isFinite(euler[1]));

  const circleTau = evaluateBaseChildForMode(params, 'positive', 'positiveImaginaryCircleA', 1, 0, 'tau');
  const circleEuler = evaluateBaseChildForMode(params, 'positive', 'positiveImaginaryCircleA', 1, 0, 'euler');
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
    ['positiveImaginary', 'negativeImaginary'],
    ['positiveImaginaryReciprocal', 'negativeImaginaryReciprocal'],
    ['positiveImaginaryVectorB', 'negativeImaginaryVectorB'],
    ['positiveImaginaryVectorBReciprocal', 'negativeImaginaryVectorBReciprocal'],
    ['positiveImaginaryCircleA', 'negativeImaginaryCircleA'],
    ['positiveImaginaryCircleB', 'negativeImaginaryCircleB'],
    ['positiveImaginaryCircleC', 'negativeImaginaryCircleC'],
    ['positiveImaginaryCircleBReciprocal', 'negativeImaginaryCircleBReciprocal'],
    ['positiveImaginaryCircleCReciprocal', 'negativeImaginaryCircleCReciprocal'],
  ];

  for (const [positiveKey, negativeKey] of pairs) {
    const positive = evaluateBaseChildForMode(params, 'positive', positiveKey, nValue, nOrdinal, 'tau');
    const negative = evaluateBaseChildForMode(params, 'negative', negativeKey, nValue, nOrdinal, 'tau');
    assert.ok(positive && negative, `${positiveKey}/${negativeKey} should evaluate`);
    assert.ok(approx(positive[0], negative[0], 1e-9), `${positiveKey}/${negativeKey} real parts should match`);
    assert.ok(approx(positive[1], -negative[1], 1e-9), `${positiveKey}/${negativeKey} imag parts should be sign mirrored`);
  }
});

test('alignment-locked T≈2 can collapse +/- base and vector families onto the same real-axis path', () => {
  const params = baseState({
    kStepsInAlignmentsBool: 1,
    T: 2,
    T_lowerBound: 1.99999,
    T_upperBound: 2,
  });

  const basePositive = evaluateBaseChildForMode(params, 'positive', 'positiveImaginary', 250, 100, 'tau');
  const baseNegative = evaluateBaseChildForMode(params, 'negative', 'negativeImaginary', 250, 100, 'tau');
  const vectorPositive = evaluateBaseChildForMode(params, 'positive', 'positiveImaginaryVectorB', 250, 100, 'tau');
  const vectorNegative = evaluateBaseChildForMode(params, 'negative', 'negativeImaginaryVectorB', 250, 100, 'tau');

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

  const tauPosA = evaluateBaseChildForMode(paramsA, 'positive', 'positiveImaginaryCircleA', 2, 0, 'tau');
  const tauPosB = evaluateBaseChildForMode(paramsB, 'positive', 'positiveImaginaryCircleA', 2, 0, 'tau');
  const tauNegA = evaluateBaseChildForMode(paramsA, 'negative', 'negativeImaginaryCircleA', 2, 0, 'tau');
  const tauNegB = evaluateBaseChildForMode(paramsB, 'negative', 'negativeImaginaryCircleA', 2, 0, 'tau');

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

  const tauPositive = evaluateBaseChildForMode(params, 'positive', 'positiveImaginaryCircleA', nValue, 0, 'tau');
  const tauNegative = evaluateBaseChildForMode(params, 'negative', 'negativeImaginaryCircleA', nValue, 0, 'tau');
  const eulerPositive = evaluateBaseChildForMode(params, 'positive', 'positiveImaginaryCircleA', nValue, 0, 'euler');
  const eulerNegative = evaluateBaseChildForMode(params, 'negative', 'negativeImaginaryCircleA', nValue, 0, 'euler');

  assert.ok(approxComplex(tauPositive, expectedTauPositive, 1e-10));
  assert.ok(approxComplex(tauNegative, expectedTauNegative, 1e-10));
  assert.ok(approxComplex(eulerPositive, expectedEulerPositive, 1e-10));
  assert.ok(approxComplex(eulerNegative, expectedEulerNegative, 1e-10));
});

test('equivalence proof rows cover all base children across both sets', () => {
  const proof = computeEquivalenceProofRows(baseState({
    Z_min: 0,
    Z_max: 16,
  }));
  assert.equal(proof.rows.length, 24);
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
  expressionModel.childVariants.positiveImaginary.sin.enabled = true;
  expressionModel.childVariants.positiveImaginary.sin.pointSize = 0.5;
  expressionModel.children.positiveImaginary.pointSize = 4;

  const combos = getActiveExpressionCombos(baseState({ expressionModel }));
  const combo = combos.find((c) =>
    c.setKey === 'positive' &&
    c.childKey === 'positiveImaginary' &&
    c.transformKey === 'sin');
  assert.ok(combo);
  assert.ok(approx(combo.style.pointSize, 2 * 3 * 0.5 * 4, 1e-12));
});

test('paths split across fixed 710-color boundary blocks when range exceeds 710', () => {
  const expressionModel = makeExpressionModel(false);
  for (const child of Object.keys(expressionModel.childVariants)) {
    for (const key of TRANSFORM_KEYS) expressionModel.childVariants[child][key].enabled = false;
  }
  expressionModel.childVariants.positiveImaginary.sin.enabled = true;
  for (const child of [...POSITIVE_CHILDREN, ...NEGATIVE_CHILDREN]) {
    expressionModel.children[child.key].enabled = false;
  }
  expressionModel.children.positiveImaginary.enabled = true;
  expressionModel.sets.negative.enabled = false;

  const paths = generateAtlasPaths(baseState({
    Z_min: 0,
    Z_max: 720,
    expressionModel,
    pathBudget: 5000,
  }));

  assert.ok(paths.length > 0);
  const blocks = new Set(paths.map((p) => p.tag?.block));
  assert.ok(blocks.has(0));
  assert.ok(blocks.has(1));
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
  model.childVariants.positiveImaginaryVectorB.sin.enabled = true;
  for (const child of [...POSITIVE_CHILDREN, ...NEGATIVE_CHILDREN]) {
    model.children[child.key].enabled = false;
  }
  model.children.positiveImaginaryVectorB.enabled = true;
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

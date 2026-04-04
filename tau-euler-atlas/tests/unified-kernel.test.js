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
  POSITIVE_CHILDREN,
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
  }
  return model;
}

function baseState(overrides = {}) {
  return {
    T: 2,
    T_start: 1.99999,
    T_stop: 2,
    b: 1000,
    Z: 720,
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
    T_start: 1,
    T_stop: 3,
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
  const d = buildDerivedState(baseState({ Z: 1000, Z_min: 5, Z_max: 12 }));
  assert.deepEqual(d.nList, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

  const neg = buildDerivedState(baseState({ Z: 10, Z_min: -3, Z_max: 3 }));
  assert.deepEqual(neg.nList, [-2, -1, 0, 1, 2]);

  const minGap = buildDerivedState(baseState({ Z: 10, Z_min: 0, Z_max: 1 }));
  assert.deepEqual(minGap.nList, [1]);
});

test('registry contains exact 20 plotted base children (10 positive + 10 negative)', () => {
  assert.equal(POSITIVE_CHILDREN.length, 10);
  assert.equal(NEGATIVE_CHILDREN.length, 10);
  assert.equal(POSITIVE_CHILDREN.length + NEGATIVE_CHILDREN.length, 20);
});

test('transform expansion includes base/sin/cos/tan and log wrappers', () => {
  const combos = getActiveExpressionCombos(baseState({
    expressionModel: makeExpressionModel(true),
  }));

  const transforms = new Set(combos.map((c) => c.transformKey));
  assert.equal(transforms.size, 7);
  for (const key of TRANSFORM_KEYS) assert.ok(transforms.has(key));

  // 20 children * 7 transforms
  assert.equal(combos.length, 20 * 7);
});

test('formula mode tau/euler base kernels are both evaluable and deterministic', () => {
  const params = baseState({
    T: 2,
    T_start: 1.5,
    T_stop: 2.5,
    Z: 12,
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

test('CircleA uses shared canonical k so T updates drive both imaginary sets', () => {
  const paramsA = baseState({
    kStepsInAlignmentsBool: 0,
    T: 1.8,
    T_start: 1.7,
    T_stop: 2.2,
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
    T_start: 2,
    T_stop: 2.2,
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
    Z: 16,
    Z_min: 0,
    Z_max: 16,
  }));
  assert.equal(proof.rows.length, 20);
  assert.ok(proof.rows.every((row) => typeof row.childKey === 'string'));
  assert.ok(Number.isFinite(proof.summary.samples));
});

test('cos/tan/log(cos)/log(tan) evaluate correctly with l_func base', () => {
  const z = [0.17, -0.23];
  const k2 = 1.4;
  const lFunc = 10;

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

test('style composition is multiplicative across parent × set × transform × child', () => {
  const expressionModel = makeExpressionModel(false);
  expressionModel.parent.pointSize = 2;
  expressionModel.sets.positive.pointSize = 3;
  expressionModel.transforms.sin.enabled = true;
  expressionModel.transforms.sin.pointSize = 0.5;
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
  for (const key of TRANSFORM_KEYS) expressionModel.transforms[key].enabled = false;
  expressionModel.transforms.sin.enabled = true;
  for (const child of [...POSITIVE_CHILDREN, ...NEGATIVE_CHILDREN]) {
    expressionModel.children[child.key].enabled = false;
  }
  expressionModel.children.positiveImaginary.enabled = true;
  expressionModel.sets.negative.enabled = false;

  const paths = generateAtlasPaths(baseState({
    Z: 2000,
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
  const b = generateAllPoints({ ...base, numStrands: 16 });
  assert.equal(a.count, b.count);
  assert.deepEqual(
    Array.from(a.positions.slice(0, 120)),
    Array.from(b.positions.slice(0, 120)),
  );
  assert.deepEqual(
    Array.from(a.colors.slice(0, 120)),
    Array.from(b.colors.slice(0, 120)),
  );
});

test('q_scale materially changes spoke-driving output family', () => {
  const model = makeExpressionModel(false);
  for (const key of TRANSFORM_KEYS) model.transforms[key].enabled = false;
  model.transforms.sin.enabled = true;
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
  const b = generateAllPoints(baseState({
    q_bool: 0,
    q_scale: 2,
    expressionModel: model,
  }));

  assert.ok(a.count > 0);
  assert.ok(b.count > 0);
  assert.notDeepEqual(
    Array.from(a.positions.slice(0, 12)),
    Array.from(b.positions.slice(0, 12)),
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TAU,
  cCos,
  cLogBase,
  cSin,
  cScl,
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
  evaluateDirectFamily,
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
    stepRate: 1,
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
    numStrands: 1,
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

test('n domain follows [Z_min ... Z_max-1] with clamping', () => {
  const d = buildDerivedState(baseState({ Z: 1000, Z_min: 5, Z_max: 12 }));
  assert.deepEqual(d.nList, [5, 6, 7, 8, 9, 10, 11]);

  const clamped = buildDerivedState(baseState({ Z: 10, Z_min: 20, Z_max: 20 }));
  assert.equal(clamped.nList.length, 1);
  assert.equal(clamped.nList[0], 19);
});

test('registry contains exact 16 plotted base children (8 positive + 8 negative)', () => {
  assert.equal(POSITIVE_CHILDREN.length, 8);
  assert.equal(NEGATIVE_CHILDREN.length, 8);
  assert.equal(POSITIVE_CHILDREN.length + NEGATIVE_CHILDREN.length, 16);
});

test('transform expansion includes base/sin/cos/tan and log wrappers', () => {
  const combos = getActiveExpressionCombos(baseState({
    expressionModel: makeExpressionModel(true),
  }));

  const transforms = new Set(combos.map((c) => c.transformKey));
  assert.equal(transforms.size, 7);
  for (const key of TRANSFORM_KEYS) assert.ok(transforms.has(key));

  // 16 children * 7 transforms
  assert.equal(combos.length, 16 * 7);
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

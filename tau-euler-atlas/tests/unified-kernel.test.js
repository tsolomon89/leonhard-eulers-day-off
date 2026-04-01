import test from 'node:test';
import assert from 'node:assert/strict';

import { TAU, cCos, cLog, cLogBase, cSin, cScl, cTan } from '../js/complex.js';
import {
  buildDerivedState,
  buildNList,
  computeAlignedK,
  computeKFromT,
  shouldAdvanceStep,
} from '../js/derivation.js';
import {
  computeEProofFromState,
  computeF,
  evaluateDirectFamily,
  generateAllPoints,
  generateAtlasPaths,
  generatePrimaryPaths,
  H_LABELS,
} from '../js/generators.js';

const EPS = 1e-9;

function approxEqual(a, b, eps = EPS) {
  return Math.abs(a - b) <= eps;
}

function approxComplex(a, b, eps = EPS) {
  return approxEqual(a[0], b[0], eps) && approxEqual(a[1], b[1], eps);
}

function makeVisGroup(vals) {
  return {
    vals: [...vals],
    sizes: vals.map(() => 1),
    ptScale: 1,
    lineW: 1,
    lineOp: 1,
  };
}

function makeVis(overrides = {}) {
  const defaults = {
    A: [1, 1],
    B: [1, 0],
    C: [1, 0],
    D: [1, 0, 0, 0],
    E: [1, 0, 0],
    F: [1, 1],
    G: [0, 0, 0, 0],
    H: Array(H_LABELS.length).fill(1),
  };
  const merged = { ...defaults, ...overrides };
  return {
    A: makeVisGroup(merged.A),
    B: makeVisGroup(merged.B),
    C: makeVisGroup(merged.C),
    D: makeVisGroup(merged.D),
    E: makeVisGroup(merged.E),
    F: makeVisGroup(merged.F),
    G: makeVisGroup(merged.G),
    H: makeVisGroup(merged.H),
  };
}

function baseParams(overrides = {}) {
  return {
    T: 2,
    kMode: 'derived',
    q1: 1,
    q2: 0,
    q_a: 0,
    q_correction: 1,
    manual_k1: false,
    k2: 1,
    Z: 20,
    n: 20,
    numStrands: 1,
    ptSize: 1,
    vis: makeVis(),
    ...overrides,
  };
}

test('k(T=2) equals 1 within tolerance', () => {
  assert.ok(approxEqual(computeKFromT(2), 1, 1e-12));
});

test('q/k1 parity rules follow canonical derivation', () => {
  const base = { q1: 5, q2: 0, manual_k1: false };

  const qaOff = buildDerivedState({ ...base, T: 2, q_a: 0, q_correction: 1 });
  assert.ok(approxEqual(qaOff.k1, qaOff.q1));

  const corrOff = buildDerivedState({ ...base, T: 2, q_a: 1, q_correction: 0 });
  assert.ok(approxEqual(corrOff.k1, TAU / corrOff.q));

  const dZero = buildDerivedState({ ...base, T: 0.5, q_a: 1, q_correction: 1 });
  const expectedFallback = TAU / (dZero.q / 2);
  assert.ok(Math.abs(dZero.d) < 1e-10);
  assert.ok(approxEqual(dZero.k1, expectedFallback, 1e-10));
});

test('cLogBase(z, 10) matches cLog(z)/ln(10)', () => {
  const z = [3, -4];
  const lhs = cLogBase(z, 10);
  const rhs = cScl(cLog(z), 1 / Math.log(10));
  assert.ok(approxComplex(lhs, rhs, 1e-12));
});

test('direct trig family evaluator matches complex sin/cos/tan and D1=n·base', () => {
  const base = [0.2, -0.1];
  const n = 7;
  const k2 = 1.3;
  const nBase = cScl(base, n);

  assert.ok(approxComplex(evaluateDirectFamily(base, n, 0, k2), nBase));
  assert.ok(approxComplex(evaluateDirectFamily(base, n, 1, k2), cScl(cSin(nBase), k2), 1e-12));
  assert.ok(approxComplex(evaluateDirectFamily(base, n, 2, k2), cScl(cCos(nBase), k2), 1e-12));
  assert.ok(approxComplex(evaluateDirectFamily(base, n, 3, k2), cScl(cTan(nBase), k2), 1e-12));

  const nested = cSin(cScl(cSin(nBase), k2));
  const direct = evaluateDirectFamily(base, n, 1, k2);
  assert.ok(Math.abs(nested[0] - direct[0]) > 1e-6 || Math.abs(nested[1] - direct[1]) > 1e-6);
});

test('nList derivation supports dense, prime-only, and U_unit scaling', () => {
  assert.deepEqual(buildNList(6, 0, 1), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(buildNList(20, 1, 1), [2, 3, 5, 7, 11, 13, 17, 19]);
  assert.deepEqual(buildNList(10, 1, 0.5), [1, 1.5, 2.5, 3.5]);
});

test('alignment branch and X/log-base derivation are wired', () => {
  const aligned = buildDerivedState({
    T: 2,
    kMode: 'derived',
    kStepsInAlignments: 1,
    k_value: 2,
    logXIsIndependentVar: 1,
    X_n: 5,
    l_base: 10,
    logBaseSource: 'X',
  });

  assert.ok(approxEqual(aligned.k, computeAlignedK(2), 1e-12));
  assert.equal(aligned.X, 5);
  assert.equal(aligned.logBase, 5);

  const fallback = buildDerivedState({
    ...aligned,
    logBaseSource: 'X',
    X_n: 1,
    l_base: 7,
  });
  assert.equal(fallback.logBase, 7);
});

test('step gating depends on play state in step/derived mode only', () => {
  const stepDerived = buildDerivedState({ timeMode: 'step', kMode: 'derived' });
  assert.equal(shouldAdvanceStep(stepDerived, false), false);
  assert.equal(shouldAdvanceStep(stepDerived, true), true);

  const stepManual = buildDerivedState({ timeMode: 'step', kMode: 'manual', k: 1 });
  assert.equal(shouldAdvanceStep(stepManual, true), false);

  const animationMode = buildDerivedState({ timeMode: 'animation', kMode: 'derived' });
  assert.equal(shouldAdvanceStep(animationMode, true), false);
});

test('primary trig selector maps to base/sin/cos/tan evaluator', () => {
  const trigIdx = 2;
  const params = baseParams({ Z: 8, n: 8, primaryTrigIndex: trigIdx });
  const paths = generatePrimaryPaths(params);
  assert.equal(paths.length, 1);
  assert.ok(paths[0].pointCount >= 1);

  const derived = buildDerivedState(params);
  const f = computeF(derived.k1, derived.k);
  const n0 = derived.nList[0];
  const expected = evaluateDirectFamily(f, n0, trigIdx, derived.k2);

  assert.ok(approxEqual(paths[0].positions[0], expected[0], 1e-9));
  assert.ok(approxEqual(paths[0].positions[1], expected[1], 1e-9));
});

test('path-curve H variants (H8/H9) generate selectable atlas paths', () => {
  const onlyPath = Array(H_LABELS.length).fill(0);
  onlyPath[8] = 1;
  const onlyPathInv = Array(H_LABELS.length).fill(0);
  onlyPathInv[9] = 1;

  const common = {
    T: 2,
    kMode: 'derived',
    Z: 4,
    n: 4,
    numStrands: 1,
    vis: makeVis({
      B: [1, 0],
      C: [1, 0],
      D: [1, 0, 0, 0],
      E: [0, 0, 1],
      F: [1, 0],
      G: [1, 0, 0, 0],
    }),
  };

  const pathOnly = generateAtlasPaths({
    ...common,
    vis: { ...common.vis, H: makeVisGroup(onlyPath) },
  });
  assert.ok(pathOnly.length > 0);
  assert.ok(pathOnly.every((p) => p.tag && p.tag.hIdx === 8));

  const pathInvOnly = generateAtlasPaths({
    ...common,
    vis: { ...common.vis, H: makeVisGroup(onlyPathInv) },
  });
  assert.ok(pathInvOnly.length > 0);
  assert.ok(pathInvOnly.every((p) => p.tag && p.tag.hIdx === 9));
});

test('E_proof is finite and responds to P changes', () => {
  const base = baseParams({ P: 1, Z: 30, n: 30 });
  const p1 = computeEProofFromState(base);
  const p3 = computeEProofFromState({ ...base, P: 3 });

  assert.ok(Number.isFinite(p1.value));
  assert.ok(Number.isFinite(p3.value));
  assert.ok(Number.isFinite(p1.P1));
  assert.ok(Number.isFinite(p3.P1));
  assert.notEqual(p1.value, p3.value);
});

test('point and primary-path generators stay aligned for same canonical input', () => {
  const params = baseParams({
    vis: makeVis({
      G: [0, 0, 0, 0], // disable atlas overlay to isolate primary points
    }),
  });

  const points = generateAllPoints(params);
  const paths = generatePrimaryPaths(params);

  assert.equal(paths.length, 1);
  assert.equal(paths[0].pointCount, points.count);

  for (let i = 0; i < points.count; i++) {
    const pIdx = i * 3;
    assert.ok(approxEqual(points.positions[pIdx], paths[0].positions[pIdx], 1e-9));
    assert.ok(approxEqual(points.positions[pIdx + 1], paths[0].positions[pIdx + 1], 1e-9));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { TAU, cCos, cLog, cLogBase, cSin, cScl, cTan } from '../js/complex.js';
import { buildDerivedState, computeKFromT } from '../js/derivation.js';
import { evaluateDirectFamily, generateAllPoints, generatePrimaryPaths } from '../js/generators.js';

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

test('direct trig family evaluator matches complex sin/cos/tan definitions', () => {
  const base = [0.2, -0.1];
  const n = 7;
  const k2 = 1.3;
  const nBase = cScl(base, n);

  assert.ok(approxComplex(evaluateDirectFamily(base, n, 0, k2), base));
  assert.ok(approxComplex(evaluateDirectFamily(base, n, 1, k2), cScl(cSin(nBase), k2), 1e-12));
  assert.ok(approxComplex(evaluateDirectFamily(base, n, 2, k2), cScl(cCos(nBase), k2), 1e-12));
  assert.ok(approxComplex(evaluateDirectFamily(base, n, 3, k2), cScl(cTan(nBase), k2), 1e-12));

  // Guard against old nested-trig behavior (e.g., sin(sin(n*base)*k2)).
  const nested = cSin(cScl(cSin(nBase), k2));
  const direct = evaluateDirectFamily(base, n, 1, k2);
  assert.ok(Math.abs(nested[0] - direct[0]) > 1e-6 || Math.abs(nested[1] - direct[1]) > 1e-6);
});

test('point and primary-path generators stay aligned for same canonical input', () => {
  const params = {
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
    vis: {
      A: makeVisGroup([1, 1]),
      B: makeVisGroup([1, 0]),
      C: makeVisGroup([1, 0]),
      D: makeVisGroup([1, 0, 0, 0]),
      E: makeVisGroup([1, 0, 0]),
      F: makeVisGroup([1, 1]),
      G: makeVisGroup([0, 0, 0, 0]), // disable atlas overlay to isolate primary points
      H: makeVisGroup([1, 1, 1, 1, 1, 1, 1, 1]),
    },
  };

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

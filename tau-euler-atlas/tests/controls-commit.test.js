import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyBoundedTripletCommit,
  applyNDepthCommit,
  applyTraversalCommit,
  computeTraversalTBounds,
  parseNumericInput,
  resolveCommittedValue,
} from '../js/controls-commit.js';

const EPS = 1e-9;

function approx(a, b, eps = EPS) {
  return Math.abs(a - b) <= eps;
}

test('typed T commits clamp into [T_lowerBound, T_upperBound]', () => {
  const s = { T: 2, T_lowerBound: 1.99999, T_upperBound: 2 };
  const out = applyTraversalCommit(s, 'T', -100.123456789);

  assert.ok(approx(s.T, 1.99999));
  assert.ok(approx(s.T_lowerBound, 1.99999));
  assert.ok(approx(s.T_upperBound, 2));
  assert.equal(out.status, 'normalized');
});

test('typed T_lowerBound/T_upperBound preserve order and keep T inside window', () => {
  const s = { T: 2, T_lowerBound: -1, T_upperBound: 1 };

  const outStart = applyTraversalCommit(s, 'T_lowerBound', 5);
  assert.equal(outStart.status, 'normalized');
  assert.equal(s.T_lowerBound, 1);
  assert.equal(s.T_upperBound, 5);
  assert.equal(s.T, 2);

  const outStop = applyTraversalCommit(s, 'T_upperBound', -2);
  assert.equal(outStop.status, 'normalized');
  assert.equal(s.T_lowerBound, -2);
  assert.equal(s.T_upperBound, 1);
  assert.equal(s.T, 1);
});

test('n_negDepth/n_posDepth edits clamp independently without cross-coupling', () => {
  const s = { n_negDepth: 10, n_posDepth: 20 };

  const negOut = applyNDepthCommit(s, 'n_negDepth', -5);
  assert.equal(negOut.status, 'normalized');
  assert.equal(s.n_negDepth, 0);
  assert.equal(s.n_posDepth, 20);

  const posOut = applyNDepthCommit(s, 'n_posDepth', 99999);
  assert.equal(posOut.status, 'normalized');
  assert.equal(s.n_negDepth, 0);
  assert.equal(s.n_posDepth, 50000);

  const negApplied = applyNDepthCommit(s, 'n_negDepth', 1234);
  assert.equal(negApplied.status, 'applied');
  assert.equal(s.n_negDepth, 1234);
  assert.equal(s.n_posDepth, 50000);
});

test('generic bounded triplet helper is reusable across grouped ranges', () => {
  const s = { value: 3, min: 0, max: 5 };
  const out = applyBoundedTripletCommit(
    s,
    {
      keys: ['value', 'min', 'max'],
      coerce: (raw) => Number(raw),
      normalize: (next) => {
        let min = Number.isFinite(next.min) ? next.min : 0;
        let max = Number.isFinite(next.max) ? next.max : min + 1;
        if (min > max) [min, max] = [max, min];
        const value = Math.max(min, Math.min(max, next.value));
        return { value, min, max };
      },
    },
    'min',
    4,
  );

  assert.equal(out.status, 'normalized');
  assert.equal(s.min, 4);
  assert.equal(s.max, 5);
  assert.equal(s.value, 4);
});

test('typed values keep precision in exact mode while drag snap quantizes', () => {
  const bounds = { min: 0, max: 10, step: 0.01 };
  const exact = resolveCommittedValue(1.23456789, bounds, 'exact');
  assert.equal(exact.ok, true);
  assert.ok(approx(exact.value, 1.23456789));
  assert.equal(exact.status, 'applied');

  const exactClamped = resolveCommittedValue(11.2, bounds, 'exact');
  assert.equal(exactClamped.ok, true);
  assert.ok(approx(exactClamped.value, 10));
  assert.equal(exactClamped.status, 'normalized');

  const snapped = resolveCommittedValue(1.23456789, bounds, 'snap');
  assert.equal(snapped.ok, true);
  assert.ok(approx(snapped.value, 1.23));
  assert.equal(snapped.status, 'normalized');
});

test('dynamic bounds helpers track traversal updates', () => {
  const traversal = computeTraversalTBounds({ T_lowerBound: -100, T_upperBound: 100 }, 0.0001);
  assert.equal(traversal.min, -100);
  assert.equal(traversal.max, 100);
  assert.equal(traversal.step, 0.0001);
});

test('parseNumericInput accepts comma and dot decimals', () => {
  assert.ok(approx(parseNumericInput('1,999999'), 1.999999));
  assert.ok(approx(parseNumericInput('2.5'), 2.5));
  assert.ok(approx(parseNumericInput('1,234.5'), 1234.5));
});

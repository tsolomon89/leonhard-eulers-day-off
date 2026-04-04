import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyBoundedTripletCommit,
  applyTraversalCommit,
  applyZRangeCommit,
  computeTraversalTBounds,
  computeZRangeBounds,
  parseNumericInput,
  resolveCommittedValue,
} from '../js/controls-commit.js';

const EPS = 1e-9;

function approx(a, b, eps = EPS) {
  return Math.abs(a - b) <= eps;
}

test('typed T commits clamp into [T_start, T_stop]', () => {
  const s = { T: 2, T_start: 1.99999, T_stop: 2 };
  const out = applyTraversalCommit(s, 'T', -100.123456789);

  assert.ok(approx(s.T, 1.99999));
  assert.ok(approx(s.T_start, 1.99999));
  assert.ok(approx(s.T_stop, 2));
  assert.equal(out.status, 'normalized');
});

test('typed T_start/T_stop preserve order and keep T inside window', () => {
  const s = { T: 2, T_start: -1, T_stop: 1 };

  const outStart = applyTraversalCommit(s, 'T_start', 5);
  assert.equal(outStart.status, 'normalized');
  assert.equal(s.T_start, 1);
  assert.equal(s.T_stop, 5);
  assert.equal(s.T, 2);

  const outStop = applyTraversalCommit(s, 'T_stop', -2);
  assert.equal(outStop.status, 'normalized');
  assert.equal(s.T_start, -2);
  assert.equal(s.T_stop, 1);
  assert.equal(s.T, 1);
});

test('Z/Z_min/Z_max edits preserve invariant 1<=Z, -Z<=Z_min<=0, 0<=Z_max<=Z, and Z_max-Z_min>=2', () => {
  const s = { Z: 10, Z_min: 0, Z_max: 10 };

  const minOut = applyZRangeCommit(s, 'Z_min', 12);
  assert.equal(minOut.status, 'normalized');
  assert.equal(s.Z, 10);
  assert.equal(s.Z_min, 0);
  assert.equal(s.Z_max, 10);

  const minNegOut = applyZRangeCommit(s, 'Z_min', -12);
  assert.equal(minNegOut.status, 'normalized');
  assert.equal(s.Z_min, -10);
  assert.equal(s.Z_max, 10);

  const maxOut = applyZRangeCommit(s, 'Z_max', 0);
  assert.equal(maxOut.status, 'applied');
  assert.equal(s.Z, 10);
  assert.equal(s.Z_min, -10);
  assert.equal(s.Z_max, 0);

  const zOut = applyZRangeCommit(s, 'Z', 0);
  assert.equal(zOut.status, 'normalized');
  assert.equal(s.Z, 1);
  assert.equal(s.Z_min, -1);
  assert.equal(s.Z_max, 1);
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

test('dynamic bounds helpers track traversal and Z-range updates', () => {
  const traversal = computeTraversalTBounds({ T_start: -100, T_stop: 100 }, 0.0001);
  assert.equal(traversal.min, -100);
  assert.equal(traversal.max, 100);
  assert.equal(traversal.step, 0.0001);

  const z = computeZRangeBounds({ Z: 710 });
  assert.deepEqual(z.zMin, { min: -710, max: 0, step: 1 });
  assert.deepEqual(z.zMax, { min: 0, max: 710, step: 1 });
});

test('parseNumericInput accepts comma and dot decimals', () => {
  assert.ok(approx(parseNumericInput('1,999999'), 1.999999));
  assert.ok(approx(parseNumericInput('2.5'), 2.5));
  assert.ok(approx(parseNumericInput('1,234.5'), 1234.5));
});

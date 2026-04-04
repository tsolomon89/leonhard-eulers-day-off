import test from 'node:test';
import assert from 'node:assert/strict';

import {
  animation,
  computeWindowProgress,
  resolveLoopProgress,
} from '../js/animation.js';
import { advanceStepTraversal, shouldAdvanceStep } from '../js/derivation.js';

const EPS = 1e-6;

function approx(a, b, eps = EPS) {
  return Math.abs(a - b) <= eps;
}

function resetAnimation() {
  animation.stop();
  animation.progress = 0;
  animation.duration = 30;
  animation.loop = 'wrap';
}

test('computeWindowProgress maps authored windows and clamps to [0,1]', () => {
  assert.ok(approx(computeWindowProgress(5, 0, 10), 0.5));
  assert.ok(approx(computeWindowProgress(-5, 0, 10), 0));
  assert.ok(approx(computeWindowProgress(15, 0, 10), 1));
  assert.ok(approx(computeWindowProgress(1.9999995, 1.999999, 2), 0.5, 1e-4));
});

test('resolveLoopProgress supports wrap, bounce, and clamp modes', () => {
  assert.ok(approx(resolveLoopProgress(1.25, 'wrap'), 0.25));
  assert.ok(approx(resolveLoopProgress(-0.25, 'wrap'), 0.75));

  assert.ok(approx(resolveLoopProgress(0.25, 'bounce'), 0.25));
  assert.ok(approx(resolveLoopProgress(1.25, 'bounce'), 0.75));
  assert.ok(approx(resolveLoopProgress(2.25, 'bounce'), 0.25));

  assert.ok(approx(resolveLoopProgress(-0.25, 'none'), 0));
  assert.ok(approx(resolveLoopProgress(1.25, 'none'), 1));
});

test('animation.update is inert when paused', () => {
  resetAnimation();
  animation.progress = 0.4;
  const changed = animation.update();
  assert.equal(changed, false);
  assert.ok(approx(animation.progress, 0.4));
});

test('animation.update advances progress and loop=none clamps and stops at end', () => {
  resetAnimation();
  animation.loop = 'none';
  animation.duration = 1;
  animation.progress = 0.95;
  animation.playing = true;
  animation._lastFrameTime = performance.now() - 200;

  const changed = animation.update();
  assert.equal(changed, true);
  assert.ok(approx(animation.progress, 1));
  assert.equal(animation.playing, false);
});

test('step traversal honors clamp and bounce policies', () => {
  const clampStep = advanceStepTraversal({
    T: 1.99,
    T_start: 1.99,
    T_stop: 2,
    dtSeconds: 1,
    s: 0.02,
    stepLoopMode: 'clamp',
    bounceDir: 1,
  });
  assert.ok(clampStep.T <= 2);
  assert.equal(clampStep.bounceDir, 1);

  const bounceA = advanceStepTraversal({
    T: 1.99,
    T_start: 1.99,
    T_stop: 2,
    dtSeconds: 1,
    s: 0.02,
    stepLoopMode: 'bounce',
    bounceDir: 1,
  });
  assert.ok(bounceA.T >= 1.99 && bounceA.T <= 2);
  assert.equal(bounceA.bounceDir, -1);

  const bounceB = advanceStepTraversal({
    T: bounceA.T,
    T_start: 1.99,
    T_stop: 2,
    dtSeconds: 1,
    s: 0.02,
    stepLoopMode: 'bounce',
    bounceDir: bounceA.bounceDir,
  });
  assert.ok(bounceB.T >= 1.99 && bounceB.T <= 2);
});

test('step traversal ignores legacy stepRate payloads when supplied', () => {
  const withLegacy = advanceStepTraversal({
    T: 1.5,
    T_start: 1,
    T_stop: 2,
    dtSeconds: 1,
    s: 0.02,
    stepRate: 99,
    stepLoopMode: 'clamp',
    bounceDir: 1,
  });
  const canonical = advanceStepTraversal({
    T: 1.5,
    T_start: 1,
    T_stop: 2,
    dtSeconds: 1,
    s: 0.02,
    stepLoopMode: 'clamp',
    bounceDir: 1,
  });
  assert.ok(approx(withLegacy.T, canonical.T, 1e-12));
  assert.equal(withLegacy.bounceDir, canonical.bounceDir);
});

test('playback stepping is binary and ignores legacy time mode values', () => {
  assert.equal(shouldAdvanceStep({ timeMode: 'off' }, false), false);
  assert.equal(shouldAdvanceStep({ timeMode: 'off' }, true), true);
  assert.equal(shouldAdvanceStep({ timeMode: 'animation' }, true), true);
});

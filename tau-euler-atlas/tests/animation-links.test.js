import test from 'node:test';
import assert from 'node:assert/strict';

import {
  animation,
  computeWindowProgress,
  resolveLoopProgress,
} from '../js/animation.js';

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

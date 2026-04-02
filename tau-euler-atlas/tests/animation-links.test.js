import test from 'node:test';
import assert from 'node:assert/strict';

import {
  animation,
  computeWindowProgress,
  swapLinkEndpoints,
} from '../js/animation.js';
import { advanceStepTraversal } from '../js/derivation.js';

const EPS = 1e-9;

function approx(a, b, eps = EPS) {
  return Math.abs(a - b) <= eps;
}

function resetAnimation() {
  animation.stop();
  animation.clearLinks();
  animation.progress = 0;
  animation.duration = 30;
  animation.loop = 'wrap';
}

test('link source cycles off -> anim -> step -> off and seeds endpoint', () => {
  resetAnimation();
  const state = { v: 1 };
  const link = animation.registerLink(state, 'v', null, { min: 0, max: 11, step: 0.5 });

  assert.equal(link.source, 'off');
  assert.equal(link.endValue, null);

  animation.cycleLinkSource(link, { min: 0, max: 11, step: 0.5 });
  assert.equal(link.source, 'anim');
  assert.ok(Number.isFinite(link.endValue));
  assert.equal(link.endValue, 3);

  animation.cycleLinkSource(link, { min: 0, max: 11, step: 0.5 });
  assert.equal(link.source, 'step');
  assert.equal(link.endValue, 3);

  animation.cycleLinkSource(link, { min: 0, max: 11, step: 0.5 });
  assert.equal(link.source, 'off');
});

test('direction reversal changes interpolation result', () => {
  resetAnimation();
  const state = { v: 0 };
  const link = animation.registerLink(state, 'v', null, { min: 0, max: 10, step: 0.01 });
  link.baseValue = 0;
  link.endValue = 10;
  animation.setLinkSource(link, 'anim', { min: 0, max: 10, step: 0.01 });

  link.direction = 1;
  animation.seek(0.25);
  assert.ok(approx(state.v, 2.5));

  link.direction = -1;
  animation.seek(0.25);
  assert.ok(approx(state.v, 7.5));
});

test('step-source interpolation follows authored playback window for wide and narrow ranges', () => {
  resetAnimation();
  const state = { v: 0 };
  const link = animation.registerLink(state, 'v', null, { min: 0, max: 100, step: 0.001 });
  link.baseValue = 0;
  link.endValue = 100;
  animation.setLinkSource(link, 'step', { min: 0, max: 100, step: 0.001 });

  animation.applyStepFromWindow(0, -100, 100);
  assert.ok(approx(state.v, 50));

  animation.applyStepFromWindow(1.9999995, 1.999999, 2);
  assert.ok(approx(state.v, 50, 1e-6));

  assert.ok(approx(computeWindowProgress(2, 1.999999, 2), 1));
});

test('swap helper exchanges base/end endpoints', () => {
  resetAnimation();
  const state = { v: 5 };
  const link = animation.registerLink(state, 'v', null, { min: 0, max: 10, step: 1 });
  link.baseValue = 2;
  link.endValue = 8;

  assert.equal(swapLinkEndpoints(link), true);
  assert.equal(link.baseValue, 8);
  assert.equal(link.endValue, 2);
});

test('bounce step loop reverses direction at boundaries', () => {
  const first = advanceStepTraversal({
    T: 1.99,
    T_start: 1.99,
    T_stop: 2,
    dtSeconds: 1,
    s: 0.015,
    stepRate: 1,
    stepLoopMode: 'bounce',
    bounceDir: 1,
  });

  assert.ok(first.T > 1.99 && first.T < 2);
  assert.equal(first.bounceDir, -1);

  const second = advanceStepTraversal({
    T: first.T,
    T_start: 1.99,
    T_stop: 2,
    dtSeconds: 1,
    s: 0.015,
    stepRate: 1,
    stepLoopMode: 'bounce',
    bounceDir: first.bounceDir,
  });

  assert.ok(second.T >= 1.99 && second.T <= 2);
});

test('legacy isLinked compatibility mirrors source', () => {
  resetAnimation();
  const state = { v: 0 };
  const link = animation.registerLink(state, 'v', null, { min: 0, max: 1, step: 0.01 });

  assert.equal(link.isLinked, false);
  link.isLinked = true;
  assert.equal(link.source, 'anim');
  assert.equal(link.isLinked, true);

  link.isLinked = false;
  assert.equal(link.source, 'off');
  assert.equal(link.isLinked, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { createLinkEngine } from '../js/link-engine.js';

const EPS = 1e-9;

function approx(a, b, eps = EPS) {
  return Math.abs(a - b) <= eps;
}

function createAdapter(liveRef, bounds = { min: 0, max: 100, step: 0.01 }) {
  return {
    getLive: () => liveRef.value,
    setLive: (v) => { liveRef.value = v; },
    getBounds: () => bounds,
  };
}

test('linkOn latches live base and seeds endpoint', () => {
  const engine = createLinkEngine();
  const live = { value: 5 };
  engine.register('camera.position.x', createAdapter(live, { min: 0, max: 10, step: 1 }), {
    baseValue: 1,
  });

  engine.linkOn('camera.position.x');
  const rec = engine.get('camera.position.x');
  assert.ok(rec);
  assert.equal(rec.isLinked, true);
  assert.ok(approx(rec.baseValue, 5));
  assert.equal(rec.endValue, 7);
});

test('linkOff clears endpoint and restores base live value', () => {
  const engine = createLinkEngine();
  const live = { value: 3 };
  engine.register('camera.target.y', createAdapter(live, { min: -10, max: 10, step: 0.1 }));
  engine.linkOn('camera.target.y');
  engine.setEnd('camera.target.y', 9, { autoLink: true });
  engine.applyPath('camera.target.y', 0.5);
  assert.ok(approx(live.value, 6));

  engine.linkOff('camera.target.y');
  const rec = engine.get('camera.target.y');
  assert.ok(rec);
  assert.equal(rec.isLinked, false);
  assert.equal(rec.endValue, null);
  assert.ok(approx(live.value, rec.baseValue));
  assert.ok(approx(live.value, 3));
});

test('resolveAndApply respects forward/reverse direction and skips unlinked records', () => {
  const engine = createLinkEngine();
  const a = { value: 2 };
  const b = { value: 2 };
  const c = { value: 9 };
  const bounds = { min: 0, max: 10, step: 0.1 };

  engine.register('a', createAdapter(a, bounds));
  engine.register('b', createAdapter(b, bounds));
  engine.register('c', createAdapter(c, bounds));

  engine.setBase('a', 2);
  engine.setEnd('a', 6, { autoLink: true });

  engine.setBase('b', 2);
  engine.setEnd('b', 6, { autoLink: true });
  engine.toggleDirection('b');

  engine.resolveAndApply(0.25);

  assert.ok(approx(a.value, 3));
  assert.ok(approx(b.value, 5));
  assert.ok(approx(c.value, 9));
});

test('prune removes stale registrations deterministically', () => {
  const engine = createLinkEngine();
  const one = { value: 1 };
  const two = { value: 2 };
  engine.register('keep', createAdapter(one));
  engine.register('drop', createAdapter(two));

  engine.prune((path) => path === 'keep');

  assert.ok(engine.get('keep'));
  assert.equal(engine.get('drop'), null);
});

test('re-link after external camera movement uses fresh live base', () => {
  const engine = createLinkEngine();
  const live = { value: 10 };
  engine.register('camera.position.z', createAdapter(live, { min: 0, max: 100, step: 0.1 }));

  engine.linkOn('camera.position.z');
  engine.setEnd('camera.position.z', 20, { autoLink: true });
  engine.resolveAndApply(0.5);
  assert.ok(approx(live.value, 15));

  engine.linkOff('camera.position.z');
  assert.ok(approx(live.value, 10));

  live.value = 12;
  engine.updateBaseFromLive('camera.position.z');
  engine.linkOn('camera.position.z');

  const rec = engine.get('camera.position.z');
  assert.ok(rec);
  assert.ok(approx(rec.baseValue, 12));
});

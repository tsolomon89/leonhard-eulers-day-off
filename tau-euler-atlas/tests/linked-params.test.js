import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureLinkedParam,
  isBooleanLinkPath,
  isLinkEligiblePath,
  resolveLinkedValue,
  sanitizeDirection,
  seedEndpoint,
} from '../js/linked-params.js';

const EPS = 1e-9;

function approx(a, b, eps = EPS) {
  return Math.abs(a - b) <= eps;
}

test('resolveLinkedValue handles off/forward/reverse and missing endpoint', () => {
  const linked = { value: 10, endValue: null, isLinked: false, direction: 1 };
  assert.ok(approx(resolveLinkedValue(linked, 0.5), 10));

  linked.endValue = 20;
  linked.isLinked = true;
  linked.direction = 1;
  assert.ok(approx(resolveLinkedValue(linked, 0), 10));
  assert.ok(approx(resolveLinkedValue(linked, 0.5), 15));
  assert.ok(approx(resolveLinkedValue(linked, 1), 20));

  linked.direction = -1;
  assert.ok(approx(resolveLinkedValue(linked, 0), 20));
  assert.ok(approx(resolveLinkedValue(linked, 0.5), 15));
  assert.ok(approx(resolveLinkedValue(linked, 1), 10));
});

test('ensureLinkedParam creates stable records and normalizes direction', () => {
  const registry = {};
  const a = ensureLinkedParam(registry, 'T', 2);
  assert.ok(a);
  assert.equal(a.value, 2);
  assert.equal(a.isLinked, false);
  assert.equal(a.direction, 1);

  a.direction = -7;
  const b = ensureLinkedParam(registry, 'T', 3);
  assert.equal(a, b);
  assert.equal(b.direction, 1);
});

test('seedEndpoint picks bounded +20% offset and snaps to step', () => {
  const v = seedEndpoint(10, 0, 20, 1);
  assert.equal(v, 14);
  const bounded = seedEndpoint(19.8, 0, 20, 0.1);
  assert.ok(bounded <= 20);
});

test('link coverage includes style/core and excludes bounded triplets', () => {
  assert.equal(isLinkEligiblePath('T'), true);
  assert.equal(isLinkEligiblePath('n_negDepth'), true);
  assert.equal(isLinkEligiblePath('n_posDepth'), true);
  assert.equal(isLinkEligiblePath('k2'), true);
  assert.equal(isLinkEligiblePath('camera.position.x'), true);
  assert.equal(isLinkEligiblePath('expression.parent.pointSize'), true);
  assert.equal(isLinkEligiblePath('cinematic.bloom.strength'), true);

  assert.equal(isLinkEligiblePath('T_start'), false);
  assert.equal(isLinkEligiblePath('T_stop'), false);
  assert.equal(isLinkEligiblePath('pathBudget'), false);
});

test('sanitizeDirection returns only forward/backward values', () => {
  assert.equal(sanitizeDirection(1), 1);
  assert.equal(sanitizeDirection(-1), -1);
  assert.equal(sanitizeDirection(0), 1);
  assert.equal(sanitizeDirection(99), 1);
});

test('expression visibility paths are treated as boolean tracks', () => {
  assert.equal(isBooleanLinkPath('expression.parent.enabled'), true);
  assert.equal(isBooleanLinkPath('expression.sets.positive.enabled'), true);
  assert.equal(isBooleanLinkPath('expression.children.positiveExponent.enabled'), true);
  assert.equal(isBooleanLinkPath('expression.childVariants.positiveExponent.sin.enabled'), true);
  assert.equal(isBooleanLinkPath('cinematic.atlasLines.enabled'), true);
  assert.equal(isBooleanLinkPath('cinematic.bloom.enabled'), true);
  assert.equal(isBooleanLinkPath('expression.children.positiveExponent.pointSize'), false);
  assert.equal(isBooleanLinkPath('cinematic.atlasLines.opacity'), false);
});

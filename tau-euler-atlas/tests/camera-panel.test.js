import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCameraSnapshot,
  applyCameraFieldToSnapshot,
} from '../js/camera-panel.js';

const EPS = 1e-6;

function approx(a, b, eps = EPS) {
  return Math.abs(a - b) <= eps;
}

test('normalizeCameraSnapshot enforces bounds and ordering', () => {
  const snap = normalizeCameraSnapshot({
    viewMode: '3d',
    position: { x: 0, y: 0, z: 5 },
    target: { x: 0, y: 0, z: 0 },
    orbit: {
      dampingFactor: 2,
      minDistance: 10,
      maxDistance: 2,
    },
    lens: {
      fov: 300,
      near: 10,
      far: 1,
    },
  });

  assert.ok(approx(snap.orbit.dampingFactor, 1));
  assert.ok(snap.orbit.maxDistance >= snap.orbit.minDistance);
  assert.ok(approx(snap.lens.fov, 120));
  assert.ok(snap.lens.far > snap.lens.near);
});

test('applyCameraFieldToSnapshot updates min/max distance deterministically', () => {
  let snap = normalizeCameraSnapshot({
    viewMode: '3d',
    position: { x: 0, y: 0, z: 5 },
    target: { x: 0, y: 0, z: 0 },
    orbit: { minDistance: 0.5, maxDistance: 20 },
    lens: { fov: 70, near: 0.01, far: 2000 },
  });

  snap = applyCameraFieldToSnapshot(snap, 'orbit.minDistance', 30);
  assert.ok(snap.orbit.maxDistance >= snap.orbit.minDistance);

  snap = applyCameraFieldToSnapshot(snap, 'orbit.maxDistance', 2);
  assert.ok(snap.orbit.maxDistance >= snap.orbit.minDistance);
});

test('applyCameraFieldToSnapshot keeps near/far valid', () => {
  let snap = normalizeCameraSnapshot({
    viewMode: '3d',
    position: { x: 0, y: 0, z: 5 },
    target: { x: 0, y: 0, z: 0 },
    orbit: { minDistance: 0.5, maxDistance: 50 },
    lens: { fov: 70, near: 0.01, far: 2000 },
  });

  snap = applyCameraFieldToSnapshot(snap, 'lens.far', 0.001);
  assert.ok(snap.lens.far > snap.lens.near);

  snap = applyCameraFieldToSnapshot(snap, 'lens.near', 1000);
  assert.ok(snap.lens.far > snap.lens.near);
});

test('distance edit moves camera while respecting distance bounds', () => {
  let snap = normalizeCameraSnapshot({
    viewMode: '3d',
    position: { x: 0, y: 0, z: 5 },
    target: { x: 0, y: 0, z: 0 },
    orbit: { minDistance: 1, maxDistance: 10 },
    lens: { fov: 70, near: 0.01, far: 2000 },
  });

  snap = applyCameraFieldToSnapshot(snap, 'distance', 20);
  assert.ok(approx(snap.distance, 10));
  assert.ok(approx(snap.position.z, 10));

  snap = applyCameraFieldToSnapshot(snap, 'distance', 2);
  assert.ok(approx(snap.distance, 2));
  assert.ok(approx(snap.position.z, 2));
});

test('2D snapshots accept zoom and ignore fov edits', () => {
  let snap = normalizeCameraSnapshot({
    viewMode: '2d',
    position: { x: 0, y: 0, z: 10 },
    target: { x: 0, y: 0, z: 0 },
    orbit: { minDistance: 0.5, maxDistance: 350 },
    lens: { zoom: 1, near: 0.01, far: 2000 },
  });

  snap = applyCameraFieldToSnapshot(snap, 'lens.zoom', 3.5);
  assert.ok(approx(snap.lens.zoom, 3.5));

  const before = snap.lens.zoom;
  snap = applyCameraFieldToSnapshot(snap, 'lens.fov', 22);
  assert.ok(approx(snap.lens.zoom, before));
});

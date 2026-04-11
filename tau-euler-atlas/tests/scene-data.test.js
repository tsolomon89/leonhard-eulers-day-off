import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createScene,
  createSceneLink,
  createTimeline,
  addScene,
  deleteScene,
  reorderScene,
  getScene,
  getActiveScene,
  addTrack,
  removeTrack,
  getTrack,
  totalDuration,
  sceneStartTimes,
  resolveTimePosition,
  readPath,
  writePath,
  buildSceneSnapshots,
  computeTerminalState,
  captureCurrentState,
  serializeTimeline,
  deserializeTimeline,
  MIN_DURATION,
  MAX_DURATION,
  DEFAULT_DURATION,
  DEFAULT_EASING,
} from '../js/scene-data.js';

const EPS = 1e-9;
function approx(a, b, eps = EPS) { return Math.abs(a - b) <= eps; }

// ═════════════════════════════════════════════════════════════
// Scene creation
// ═════════════════════════════════════════════════════════════

test('createScene produces valid defaults', () => {
  const s = createScene();
  assert.equal(s.name, 'Scene');
  assert.equal(s.duration, DEFAULT_DURATION);
  assert.equal(s.easing, DEFAULT_EASING);
  assert.ok(Array.isArray(s.links));
  assert.equal(s.links.length, 0);
  assert.ok(typeof s.id === 'string' && s.id.length > 0);
  assert.equal(s.snapshot, null);
});

test('createScene respects options', () => {
  const s = createScene({ name: 'Approach', duration: 20, easing: 'easeInQuad' });
  assert.equal(s.name, 'Approach');
  assert.equal(s.duration, 20);
  assert.equal(s.easing, 'easeInQuad');
});

test('createScene clamps duration', () => {
  assert.equal(createScene({ duration: -5 }).duration, MIN_DURATION);
  assert.equal(createScene({ duration: 9999 }).duration, MAX_DURATION);
});

test('createScene falls back to linear for invalid easing', () => {
  assert.equal(createScene({ easing: 'bogus' }).easing, 'linear');
});

// ═════════════════════════════════════════════════════════════
// SceneLink creation
// ═════════════════════════════════════════════════════════════

test('createSceneLink stores values', () => {
  const l = createSceneLink('T', 0, 2, { transitionFactor: 0.5, type: 'numeric' });
  assert.equal(l.path, 'T');
  assert.equal(l.baseValue, 0);
  assert.equal(l.endValue, 2);
  assert.equal(l.transitionFactor, 0.5);
  assert.equal(l.type, 'numeric');
});

test('createSceneLink defaults missing opts', () => {
  const l = createSceneLink('T', 0, 1);
  assert.equal(l.transitionFactor, 0);
  assert.equal(l.type, 'numeric');
});

// ═════════════════════════════════════════════════════════════
// Timeline creation
// ═════════════════════════════════════════════════════════════

test('createTimeline has one scene', () => {
  const tl = createTimeline();
  assert.equal(tl.scenes.length, 1);
  assert.equal(tl.activeSceneIndex, 0);
  assert.equal(tl.loop, false);
});

// ═════════════════════════════════════════════════════════════
// Scene CRUD
// ═════════════════════════════════════════════════════════════

test('addScene appends a scene', () => {
  const tl = createTimeline();
  const s = addScene(tl, { duration: 5 });
  assert.equal(tl.scenes.length, 2);
  assert.equal(s.duration, 5);
  assert.equal(s.name, 'Scene 2');
});

test('addScene inserts after given index', () => {
  const tl = createTimeline();
  addScene(tl);  // Scene 2 at index 1
  addScene(tl, { name: 'Middle' }, 0);  // Insert after index 0
  assert.equal(tl.scenes.length, 3);
  assert.equal(tl.scenes[1].name, 'Middle');
});

test('deleteScene removes a scene', () => {
  const tl = createTimeline();
  const s2 = addScene(tl);
  assert.ok(deleteScene(tl, s2.id));
  assert.equal(tl.scenes.length, 1);
});

test('deleteScene refuses to delete last scene', () => {
  const tl = createTimeline();
  assert.ok(!deleteScene(tl, tl.scenes[0].id));
  assert.equal(tl.scenes.length, 1);
});

test('deleteScene adjusts activeSceneIndex', () => {
  const tl = createTimeline();
  addScene(tl);
  addScene(tl);
  tl.activeSceneIndex = 2;
  deleteScene(tl, tl.scenes[2].id);
  assert.equal(tl.activeSceneIndex, 1);
});

test('reorderScene moves scenes correctly', () => {
  const tl = createTimeline();
  addScene(tl, { name: 'B' });
  addScene(tl, { name: 'C' });
  // [Scene 1, B, C] → move 0 to 2 → [B, C, Scene 1]
  assert.ok(reorderScene(tl, 0, 2));
  assert.equal(tl.scenes[0].name, 'B');
  assert.equal(tl.scenes[2].name, 'Scene 1');
});

test('reorderScene returns false for same index', () => {
  const tl = createTimeline();
  addScene(tl);
  assert.ok(!reorderScene(tl, 0, 0));
});

test('getScene finds by id', () => {
  const tl = createTimeline();
  const s = addScene(tl, { name: 'Target' });
  assert.equal(getScene(tl, s.id).name, 'Target');
  assert.equal(getScene(tl, 'nonexistent'), null);
});

test('getActiveScene returns the selected scene', () => {
  const tl = createTimeline();
  addScene(tl, { name: 'Two' });
  tl.activeSceneIndex = 1;
  assert.equal(getActiveScene(tl).name, 'Two');
});

// ═════════════════════════════════════════════════════════════
// Track CRUD
// ═════════════════════════════════════════════════════════════

test('addTrack creates a new link', () => {
  const s = createScene();
  const l = addTrack(s, 'T', 0, 2);
  assert.equal(s.links.length, 1);
  assert.equal(l.path, 'T');
  assert.equal(l.endValue, 2);
});

test('addTrack updates existing link for same path', () => {
  const s = createScene();
  addTrack(s, 'T', 0, 2);
  addTrack(s, 'T', 0, 5);
  assert.equal(s.links.length, 1);
  assert.equal(s.links[0].endValue, 5);
});

test('removeTrack removes by path', () => {
  const s = createScene();
  addTrack(s, 'T', 0, 2);
  addTrack(s, 'b', 1, 100);
  assert.ok(removeTrack(s, 'T'));
  assert.equal(s.links.length, 1);
  assert.equal(s.links[0].path, 'b');
});

test('removeTrack returns false for missing path', () => {
  const s = createScene();
  assert.ok(!removeTrack(s, 'nonexistent'));
});

test('getTrack finds by path', () => {
  const s = createScene();
  addTrack(s, 'T', 0, 1);
  assert.equal(getTrack(s, 'T').endValue, 1);
  assert.equal(getTrack(s, 'missing'), null);
});

// ═════════════════════════════════════════════════════════════
// Timeline time computation
// ═════════════════════════════════════════════════════════════

test('totalDuration sums all scene durations', () => {
  const tl = createTimeline();
  tl.scenes[0].duration = 10;
  addScene(tl, { duration: 20 });
  addScene(tl, { duration: 5 });
  assert.equal(totalDuration(tl), 35);
});

test('sceneStartTimes returns cumulative offsets', () => {
  const tl = createTimeline();
  tl.scenes[0].duration = 10;
  addScene(tl, { duration: 20 });
  addScene(tl, { duration: 5 });
  const starts = sceneStartTimes(tl);
  assert.deepEqual(starts, [0, 10, 30]);
});

test('resolveTimePosition finds correct scene at time 0', () => {
  const tl = createTimeline();
  tl.scenes[0].duration = 10;
  addScene(tl, { duration: 20 });
  const pos = resolveTimePosition(tl, 0);
  assert.equal(pos.sceneIndex, 0);
  assert.ok(approx(pos.localProgress, 0));
});

test('resolveTimePosition finds correct scene mid-way', () => {
  const tl = createTimeline();
  tl.scenes[0].duration = 10;
  addScene(tl, { duration: 20 });
  const pos = resolveTimePosition(tl, 15);
  assert.equal(pos.sceneIndex, 1);
  assert.ok(approx(pos.localProgress, 0.25));   // 5s into 20s scene
  assert.ok(approx(pos.sceneTime, 5));
});

test('resolveTimePosition clamps past end', () => {
  const tl = createTimeline();
  tl.scenes[0].duration = 10;
  const pos = resolveTimePosition(tl, 999);
  assert.equal(pos.sceneIndex, 0);
  assert.ok(approx(pos.localProgress, 1));
});

test('resolveTimePosition handles exact scene boundary', () => {
  const tl = createTimeline();
  tl.scenes[0].duration = 10;
  addScene(tl, { duration: 20 });
  const pos = resolveTimePosition(tl, 10);
  assert.equal(pos.sceneIndex, 1);
  assert.ok(approx(pos.localProgress, 0));
});

// ═════════════════════════════════════════════════════════════
// Path read/write
// ═════════════════════════════════════════════════════════════

test('readPath reads flat keys', () => {
  assert.equal(readPath({ T: 2, b: 100 }, 'T'), 2);
});

test('readPath reads nested dot-paths', () => {
  const state = { camera: { position: { z: -1.5 } } };
  assert.equal(readPath(state, 'camera.position.z'), -1.5);
});

test('readPath returns undefined for missing paths', () => {
  assert.equal(readPath({ T: 2 }, 'missing'), undefined);
  assert.equal(readPath({ a: { b: 1 } }, 'a.c.d'), undefined);
});

test('writePath writes flat keys', () => {
  const state = { T: 0 };
  writePath(state, 'T', 5);
  assert.equal(state.T, 5);
});

test('writePath writes nested dot-paths, creating intermediates', () => {
  const state = {};
  writePath(state, 'camera.position.z', -1.5);
  assert.equal(state.camera.position.z, -1.5);
});

// ═════════════════════════════════════════════════════════════
// Snapshot building (scene inheritance)
// ═════════════════════════════════════════════════════════════

test('buildSceneSnapshots chains scene states correctly', () => {
  const tl = createTimeline();
  tl.scenes[0].duration = 10;
  addTrack(tl.scenes[0], 'T', 0, 1);
  addTrack(tl.scenes[0], 'camera.position.z', -1, 0);

  const s2 = addScene(tl, { duration: 20 });
  addTrack(s2, 'T', 999, 2);  // baseValue (999) should be overridden to 1

  const initialState = { T: 0, b: 100, camera: { position: { z: -1 } } };
  buildSceneSnapshots(tl, initialState);

  // Scene 0 snapshot = initial state
  assert.equal(readPath(tl.scenes[0].snapshot, 'T'), 0);
  assert.equal(readPath(tl.scenes[0].snapshot, 'b'), 100);
  assert.equal(readPath(tl.scenes[0].snapshot, 'camera.position.z'), -1);

  // Scene 0 link bases forced from initial state
  assert.equal(getTrack(tl.scenes[0], 'T').baseValue, 0);
  assert.equal(getTrack(tl.scenes[0], 'camera.position.z').baseValue, -1);

  // Scene 1 snapshot = Scene 0 terminal
  assert.equal(readPath(tl.scenes[1].snapshot, 'T'), 1);         // from Scene 0 T endValue
  assert.equal(readPath(tl.scenes[1].snapshot, 'camera.position.z'), 0);  // from Scene 0 cam.z endValue
  assert.equal(readPath(tl.scenes[1].snapshot, 'b'), 100);       // inherited, not linked

  // Scene 1 T link base forced from inherited value
  assert.equal(getTrack(tl.scenes[1], 'T').baseValue, 1);  // forced, not 999
});

test('unlinked param inherits through scenes', () => {
  const tl = createTimeline();
  addTrack(tl.scenes[0], 'T', 0, 5);  // Only T is linked

  const s2 = addScene(tl);
  addTrack(s2, 'T', 0, 10);

  buildSceneSnapshots(tl, { T: 0, b: 42 });

  // b is never linked → should be 42 in both snapshots
  assert.equal(readPath(tl.scenes[0].snapshot, 'b'), 42);
  assert.equal(readPath(tl.scenes[1].snapshot, 'b'), 42);
});

test('param linked in Scene 2 but not Scene 1 starts from Scene 1 set value', () => {
  const tl = createTimeline();
  // Scene 1: no link on 'b'
  addTrack(tl.scenes[0], 'T', 0, 1);

  // Scene 2: link on 'b'
  const s2 = addScene(tl);
  addTrack(s2, 'b', 999, 200);

  buildSceneSnapshots(tl, { T: 0, b: 42 });

  // Scene 2's 'b' link should have baseValue forced from Scene 1's terminal 'b' = 42
  assert.equal(getTrack(tl.scenes[1], 'b').baseValue, 42);
});

test('computeTerminalState returns final state after all scenes', () => {
  const tl = createTimeline();
  addTrack(tl.scenes[0], 'T', 0, 5);
  const s2 = addScene(tl);
  addTrack(s2, 'T', 0, 10);

  buildSceneSnapshots(tl, { T: 0, b: 42 });

  const terminal = computeTerminalState(tl);
  assert.equal(readPath(terminal, 'T'), 10);
  assert.equal(readPath(terminal, 'b'), 42);
});

// ═════════════════════════════════════════════════════════════
// Capture current state
// ═════════════════════════════════════════════════════════════

test('captureCurrentState creates tracks from live state', () => {
  const scene = createScene();
  const liveState = { T: 1.5, b: 100 };
  captureCurrentState(scene, liveState, ['T', 'b']);
  assert.equal(scene.links.length, 2);
  assert.equal(getTrack(scene, 'T').endValue, 1.5);
  assert.equal(getTrack(scene, 'b').endValue, 100);
});

test('captureCurrentState updates existing tracks', () => {
  const scene = createScene();
  addTrack(scene, 'T', 0, 2);
  captureCurrentState(scene, { T: 3.14 }, ['T']);
  assert.equal(scene.links.length, 1);
  assert.equal(getTrack(scene, 'T').endValue, 3.14);
});

// ═════════════════════════════════════════════════════════════
// Serialization
// ═════════════════════════════════════════════════════════════

test('serializeTimeline + deserializeTimeline roundtrip', () => {
  const tl = createTimeline();
  tl.scenes[0].duration = 15;
  tl.scenes[0].easing = 'easeInCubic';
  addTrack(tl.scenes[0], 'T', 0, 2);
  addScene(tl, { name: 'Act 2', duration: 30 });
  addTrack(tl.scenes[1], 'camera.position.z', -1, 0);
  tl.loop = true;
  tl.activeSceneIndex = 1;

  const initial = { T: 0, b: 100 };
  const json = serializeTimeline(tl, initial);

  // Simulate JSON transport
  const parsed = JSON.parse(JSON.stringify(json));
  const { timeline: restored, initialState } = deserializeTimeline(parsed);

  assert.equal(restored.scenes.length, 2);
  assert.equal(restored.scenes[0].duration, 15);
  assert.equal(restored.scenes[0].easing, 'easeInCubic');
  assert.equal(restored.scenes[1].name, 'Act 2');
  assert.equal(restored.loop, true);
  assert.equal(restored.activeSceneIndex, 1);
  assert.equal(getTrack(restored.scenes[0], 'T').endValue, 2);
  assert.equal(getTrack(restored.scenes[1], 'camera.position.z').endValue, 0);
  assert.equal(initialState.T, 0);
  assert.equal(initialState.b, 100);
});

test('deserializeTimeline handles empty/bad data gracefully', () => {
  const { timeline: t1 } = deserializeTimeline(null);
  assert.equal(t1.scenes.length, 1);

  const { timeline: t2 } = deserializeTimeline({});
  assert.equal(t2.scenes.length, 1);

  const { timeline: t3 } = deserializeTimeline({ scenes: [] });
  assert.equal(t3.scenes.length, 1);
});

test('serializeTimeline preserves scene IDs', () => {
  const tl = createTimeline();
  const originalId = tl.scenes[0].id;
  const json = serializeTimeline(tl);
  const { timeline: restored } = deserializeTimeline(JSON.parse(JSON.stringify(json)));
  assert.equal(restored.scenes[0].id, originalId);
});

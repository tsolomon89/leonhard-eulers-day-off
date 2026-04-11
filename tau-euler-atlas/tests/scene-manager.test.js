import test from 'node:test';
import assert from 'node:assert/strict';

import { createSceneManager } from '../js/scene-manager.js';
import { createLinkEngine } from '../js/link-engine.js';
import {
  createTimeline,
  addScene,
  addTrack,
  totalDuration,
} from '../js/scene-data.js';

const EPS = 1e-6;
function approx(a, b, eps = EPS) { return Math.abs(a - b) <= eps; }

// ── Mock helpers ─────────────────────────────────────────────

/** Create a simple adapter for the link engine backed by a mutable store. */
function makeAdapter(store, key, bounds = { min: -1000, max: 1000, step: 0.001 }) {
  return {
    getLive: () => store[key],
    setLive: (v) => { store[key] = v; },
    getBounds: () => bounds,
  };
}

/** Create a minimal animation engine mock. */
function makeAnimationMock() {
  return {
    playing: false,
    progress: 0,
    duration: 30,
    _timelineDuration: null,
    getEffectiveDuration() {
      return (Number.isFinite(this._timelineDuration) && this._timelineDuration > 0)
        ? this._timelineDuration
        : this.duration;
    },
    setTimelineDuration(s) {
      this._timelineDuration = (Number.isFinite(s) && s > 0) ? s : null;
    },
    getAbsoluteTime() {
      return this.progress * this.getEffectiveDuration();
    },
    seek(p) { this.progress = Math.max(0, Math.min(1, p)); },
    seekToTime(s) { this.seek(s / this.getEffectiveDuration()); },
  };
}

// ═════════════════════════════════════════════════════════════
// Basic lifecycle
// ═════════════════════════════════════════════════════════════

test('scene manager initializes without a timeline', () => {
  const engine = createLinkEngine();
  const anim = makeAnimationMock();
  const sm = createSceneManager({ linkEngine: engine, animation: anim, getState: () => ({}) });

  assert.equal(sm.getTimeline(), null);
  assert.equal(sm.isPlaying(), false);
});

test('setTimeline sets the active timeline', () => {
  const engine = createLinkEngine();
  const anim = makeAnimationMock();
  const sm = createSceneManager({ linkEngine: engine, animation: anim, getState: () => ({}) });

  const tl = createTimeline();
  sm.setTimeline(tl);
  assert.equal(sm.getTimeline(), tl);
});

// ═════════════════════════════════════════════════════════════
// Authoring: load/save scene
// ═════════════════════════════════════════════════════════════



// ═════════════════════════════════════════════════════════════
// Playback: start/stop
// ═════════════════════════════════════════════════════════════

test('startPlayback sets timeline duration and flags playing', () => {
  const store = { T: 0, b: 50 };
  const engine = createLinkEngine();
  engine.register('T', makeAdapter(store, 'T'));

  const anim = makeAnimationMock();
  const sm = createSceneManager({ linkEngine: engine, animation: anim, getState: () => store });

  const tl = createTimeline();
  tl.scenes[0].duration = 10;
  addScene(tl, { duration: 20 });
  sm.setTimeline(tl);

  sm.startPlayback();

  assert.equal(sm.isPlaying(), true);
  assert.equal(anim.getEffectiveDuration(), 30);  // 10 + 20
});

test('stopPlayback clears timeline duration', () => {
  const store = { T: 0 };
  const engine = createLinkEngine();
  engine.register('T', makeAdapter(store, 'T'));

  const anim = makeAnimationMock();
  const sm = createSceneManager({ linkEngine: engine, animation: anim, getState: () => store });

  const tl = createTimeline();
  sm.setTimeline(tl);
  sm.startPlayback();
  sm.stopPlayback();

  assert.equal(sm.isPlaying(), false);
  assert.equal(anim.getEffectiveDuration(), 30);  // reverts to default
});

// ═════════════════════════════════════════════════════════════
// Playback: resolve
// ═════════════════════════════════════════════════════════════

test('resolve interpolates within Scene 1 at local eased progress', () => {
  const store = { T: 0 };
  const engine = createLinkEngine();
  engine.register('T', makeAdapter(store, 'T'));

  const anim = makeAnimationMock();
  const sm = createSceneManager({ linkEngine: engine, animation: anim, getState: () => store });

  const tl = createTimeline();
  tl.scenes[0].duration = 10;
  tl.scenes[0].easing = 'linear';
  addTrack(tl.scenes[0], 'T', 0, 10);
  sm.setTimeline(tl);

  sm.startPlayback();

  // Seek to midpoint (5s of 10s = progress 0.5 of total 10s)
  anim.progress = 0.5;

  const result = sm.resolve();
  assert.equal(result.sceneIndex, 0);
  assert.ok(approx(result.easedProgress, 0.5));
  assert.ok(approx(store.T, 5));  // lerp(0, 10, 0.5)
});

test('resolve transitions between scenes with correct inheritance', () => {
  const store = { T: 0, b: 50 };
  const engine = createLinkEngine();
  engine.register('T', makeAdapter(store, 'T'));
  engine.register('b', makeAdapter(store, 'b'));

  const anim = makeAnimationMock();
  const sm = createSceneManager({ linkEngine: engine, animation: anim, getState: () => store });

  const tl = createTimeline();

  // Scene 1: T goes 0 → 5, duration 10s
  tl.scenes[0].duration = 10;
  tl.scenes[0].easing = 'linear';
  addTrack(tl.scenes[0], 'T', 0, 5);

  // Scene 2: T goes ? → 10, duration 10s
  const s2 = addScene(tl, { duration: 10, easing: 'linear' });
  addTrack(s2, 'T', 999, 10);  // base should be forced to 5

  sm.setTimeline(tl);
  sm.startPlayback();

  // Total duration = 20s
  // Seek to 15s = 5s into Scene 2 = progress 15/20 = 0.75
  anim.progress = 0.75;

  const result = sm.resolve();
  assert.equal(result.sceneIndex, 1);
  assert.ok(approx(result.localProgress, 0.5));
  // T should be lerp(5, 10, 0.5) = 7.5
  assert.ok(approx(store.T, 7.5), `Expected T ≈ 7.5, got ${store.T}`);
});

test('resolve fires onSceneChange callback', () => {
  const store = { T: 0 };
  const engine = createLinkEngine();
  engine.register('T', makeAdapter(store, 'T'));

  const anim = makeAnimationMock();
  const changes = [];
  const sm = createSceneManager({
    linkEngine: engine,
    animation: anim,
    getState: () => store,
    onSceneChange: (idx, scene) => changes.push({ idx, name: scene.name }),
  });

  const tl = createTimeline();
  tl.scenes[0].duration = 10;
  addScene(tl, { name: 'Act 2', duration: 10 });
  sm.setTimeline(tl);
  sm.startPlayback();

  // Scene 1
  anim.progress = 0.25;
  sm.resolve();
  assert.equal(changes.length, 1);  // first scene load

  // Same scene — no callback
  anim.progress = 0.4;
  sm.resolve();
  assert.equal(changes.length, 1);

  // Scene 2
  anim.progress = 0.75;
  sm.resolve();
  assert.equal(changes.length, 2);
  assert.equal(changes[1].name, 'Act 2');
});

test('resolve with easing applies easing to local progress', () => {
  const store = { T: 0 };
  const engine = createLinkEngine();
  engine.register('T', makeAdapter(store, 'T'));

  const anim = makeAnimationMock();
  const sm = createSceneManager({ linkEngine: engine, animation: anim, getState: () => store });

  const tl = createTimeline();
  tl.scenes[0].duration = 10;
  tl.scenes[0].easing = 'easeInQuad';  // t² at t=0.5 → 0.25
  addTrack(tl.scenes[0], 'T', 0, 10);
  sm.setTimeline(tl);

  sm.startPlayback();
  anim.progress = 0.5;  // 5s of 10s

  const result = sm.resolve();
  // easeInQuad(0.5) = 0.25
  assert.ok(approx(result.easedProgress, 0.25));
  // T = lerp(0, 10, 0.25) = 2.5
  assert.ok(approx(store.T, 2.5), `Expected T ≈ 2.5, got ${store.T}`);
});

// ═════════════════════════════════════════════════════════════
// Playback info
// ═════════════════════════════════════════════════════════════

test('getPlaybackInfo returns correct info during playback', () => {
  const store = { T: 0 };
  const engine = createLinkEngine();
  engine.register('T', makeAdapter(store, 'T'));

  const anim = makeAnimationMock();
  const sm = createSceneManager({ linkEngine: engine, animation: anim, getState: () => store });

  const tl = createTimeline();
  tl.scenes[0].name = 'Opening';
  tl.scenes[0].duration = 10;
  sm.setTimeline(tl);

  sm.startPlayback();
  anim.progress = 0.5;

  const info = sm.getPlaybackInfo();
  assert.equal(info.isPlaying, true);
  assert.equal(info.sceneName, 'Opening');
  assert.ok(approx(info.currentTime, 5));
  assert.ok(approx(info.totalDuration, 10));
});

test('getPlaybackInfo returns empty when not playing', () => {
  const engine = createLinkEngine();
  const anim = makeAnimationMock();
  const sm = createSceneManager({ linkEngine: engine, animation: anim, getState: () => ({}) });

  const info = sm.getPlaybackInfo();
  assert.equal(info.isPlaying, false);
});

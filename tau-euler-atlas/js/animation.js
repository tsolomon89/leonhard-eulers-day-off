// ============================================================================
// animation.js - Transport Progress Engine
// tau-Euler Atlas
// ============================================================================

import { clamp } from './complex.js';

const EPS = 1e-12;

export function computeWindowProgress(value, start, stop) {
  const a = Number.isFinite(start) ? start : 0;
  const b = Number.isFinite(stop) ? stop : a + 1;
  const v = Number.isFinite(value) ? value : a;
  const span = b - a;
  if (!Number.isFinite(span) || Math.abs(span) < EPS) return 0;
  return clamp((v - a) / span, 0, 1);
}

export function resolveLoopProgress(progress, loop = 'wrap') {
  let t = Number.isFinite(progress) ? progress : 0;
  if (loop === 'wrap') {
    t = t % 1;
    if (t < 0) t += 1;
    return t;
  }
  if (loop === 'bounce') {
    const cycle = Math.floor(t);
    t = t % 1;
    if (t < 0) t += 1;
    if (cycle % 2 !== 0) t = 1 - t;
    return t;
  }
  return clamp(t, 0, 1);
}

class ProgressEngine {
  constructor() {
    this.playing = false;
    this.progress = 0;
    this.duration = 30;
    this.loop = 'wrap'; // none | wrap | bounce

    this._lastFrameTime = 0;
    this._stateChangeCbs = [];
  }

  play() {
    this.playing = true;
    this._lastFrameTime = performance.now();
    this._notify();
  }

  pause() {
    this.playing = false;
    this._notify();
  }

  stop() {
    this.playing = false;
    this.progress = 0;
    this._notify();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(p) {
    this.progress = clamp(p, 0, 1);
    this._notify();
  }

  onStateChange(cb) {
    this._stateChangeCbs.push(cb);
  }

  _notify() {
    for (const cb of this._stateChangeCbs) cb();
  }

  update() {
    if (!this.playing) return false;

    const now = performance.now();
    const dt = (now - this._lastFrameTime) / 1000;
    this._lastFrameTime = now;

    const prev = this.progress;
    this.progress += dt / this.duration;

    if (this.loop === 'none' && this.progress >= 1) {
      this.progress = 1;
      this.playing = false;
      this._notify();
    }

    return this.progress !== prev;
  }
}

export const animation = new ProgressEngine();

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

    // Scene timeline override: when non-null, this duration is used instead of this.duration
    this._timelineDuration = null;

    // Loop iteration tracking
    this._loopCount = 0;        // 0 = infinite, N > 0 = stop after N loops
    this._completedLoops = 0;   // how many full cycles have completed

    this._lastFrameTime = 0;
    this._stateChangeCbs = [];
  }

  /** Get the duration used for playback (timeline duration if set, else default). */
  getEffectiveDuration() {
    return (Number.isFinite(this._timelineDuration) && this._timelineDuration > 0)
      ? this._timelineDuration
      : this.duration;
  }

  /** Set the timeline duration override. Pass null to clear. */
  setTimelineDuration(seconds) {
    this._timelineDuration = (Number.isFinite(seconds) && seconds > 0) ? seconds : null;
  }

  /** Set the maximum number of loops. 0 = infinite. */
  setLoopCount(count) {
    this._loopCount = (Number.isFinite(count) && count >= 0) ? Math.floor(count) : 0;
  }

  /** Reset loop iteration state (call when starting fresh playback). */
  resetLoopState() {
    this._completedLoops = 0;
  }

  /** Get the resolved progress (0 to 1) according to the current loop mode. */
  getResolvedProgress() {
    return resolveLoopProgress(this.progress, this.loop);
  }

  /** Get the absolute time in seconds based on current resolved progress. */
  getAbsoluteTime() {
    return this.getResolvedProgress() * this.getEffectiveDuration();
  }

  /** Seek to an absolute time in seconds. */
  seekToTime(seconds) {
    const dur = this.getEffectiveDuration();
    this.seek(dur > 0 ? seconds / dur : 0);
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
    this._completedLoops = 0;
    this._notify();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(p) {
    this.progress = Math.max(0, p);
    this._completedLoops = Math.floor(this.progress);
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
    this.progress += dt / this.getEffectiveDuration();

    if (this.loop === 'none' && this.progress >= 1) {
      this.progress = 1;
      this.playing = false;
      this._notify();
    } else if (this.loop === 'wrap' && this.progress >= 1) {
      // Crossed a full cycle boundary
      this._completedLoops++;
      if (this._loopCount > 0 && this._completedLoops >= this._loopCount) {
        // Reached the loop limit — clamp and stop
        this.progress = 1;
        this.playing = false;
        this._notify();
      }
      // Otherwise resolveLoopProgress will handle the wrap
    } else if (this.loop === 'bounce') {
      // A bounce cycle = 2 passes (forward + reverse), so a full cycle = progress crossing each integer
      const prevCycle = Math.floor(prev);
      const curCycle = Math.floor(this.progress);
      if (curCycle > prevCycle) {
        // Each integer crossing = one half-cycle; two half-cycles = one full loop
        // For loop count purposes, count every 2 crossings as 1 loop
        this._completedLoops = Math.floor(curCycle / 2);
        if (this._loopCount > 0 && this._completedLoops >= this._loopCount) {
          this.progress = 0; // Return to start after completing all bounces
          this.playing = false;
          this._notify();
        }
      }
    }

    return this.progress !== prev;
  }
}

export const animation = new ProgressEngine();

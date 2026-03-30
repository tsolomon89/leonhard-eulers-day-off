// ═══════════════════════════════════════════════════════════════
//  animation.js — Portable Progress Engine
//  τ-Euler Atlas · Leonhard Euler's Day Off
//
//  Architecture (Portable Scroll-Animation Principles):
//    Layer B: ProgressEngine drives a single 0..1 progress value.
//    Layer C: NumberParam links resolve baseValue → endValue via easing.
//    Layer D: consumers (sliders, scene) read resolved values each frame.
//
//  Users link any slider by clicking ⚯.  Playback sweeps all linked
//  params from their baseValue → endValue over `duration` seconds.
//  Supported loop modes: none | wrap | bounce.
// ═══════════════════════════════════════════════════════════════

export const EASINGS = {
  linear:        t => t,
  'ease-in':     t => t * t,
  'ease-out':    t => t * (2 - t),
  'ease-in-out': t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  sine:          t => 0.5 - 0.5 * Math.cos(t * Math.PI),
};

// ── NumberParam Link ─────────────────────────────────────────
// One link per registered slider.  Represents the authoring contract:
//   baseValue  = current "rest" position (set by normal drag)
//   endValue   = animation target (set by Shift+drag or link auto-offset)
//   isLinked   = whether this param participates in playback sweep

function makeLink(obj, key, index) {
  const raw = index !== null ? obj[key][index] : obj[key];
  return { obj, key, index, baseValue: parseFloat(raw), endValue: null, isLinked: false, easing: 'linear' };
}

// ── Progress Engine ──────────────────────────────────────────

class ProgressEngine {
  constructor() {
    this.links     = [];       // Array of NumberParam links
    this.playing   = false;
    this.progress  = 0;        // Normalized 0..1 master cursor
    this.duration  = 30;       // Sweep duration in seconds
    this.loop      = 'wrap';   // 'none' | 'wrap' | 'bounce'

    this._lastFrameTime = 0;
    this._stateChangeCbs = [];
  }

  // ── Param Registration ──────────────────────────────────

  registerLink(obj, key, index = null) {
    const link = makeLink(obj, key, index);
    this.links.push(link);
    return link;
  }

  clearLinks() {
    this.links = [];
    this._stateChangeCbs = []; // Reset listeners; buildControls() re-registers after each build
  }

  // ── Transport ────────────────────────────────────────────

  play() {
    if (!this.links.some(l => l.isLinked)) return;
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
    this._applyProgress();
    this._notify();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(p) {
    this.progress = Math.max(0, Math.min(1, p));
    this._applyProgress();
    this._notify();
  }

  onStateChange(cb) {
    this._stateChangeCbs.push(cb);
  }

  _notify() {
    for (const cb of this._stateChangeCbs) cb();
  }

  // ── Frame update (called from render loop) ───────────────

  update() {
    if (!this.playing) return false;

    const now = performance.now();
    const dt  = (now - this._lastFrameTime) / 1000;
    this._lastFrameTime = now;

    this.progress += dt / this.duration;

    if (this.loop === 'none' && this.progress >= 1) {
      this.progress = 1;
      this.playing  = false;
    }

    const changed = this._applyProgress();
    this._notify();
    return changed;
  }

  // ── Parameter Resolver (Layer C) ─────────────────────────

  _applyProgress() {
    // Normalise raw progress into a looped/bounced 0..1
    let t = this.progress;
    if (this.loop === 'wrap') {
      t = t % 1;
    } else if (this.loop === 'bounce') {
      const cycle = Math.floor(t);
      t = t % 1;
      if (cycle % 2 === 1) t = 1 - t;
    } else {
      t = Math.min(1, Math.max(0, t));
    }

    let changed = false;
    for (const link of this.links) {
      if (!link.isLinked || link.endValue === null) continue;

      const eased  = (EASINGS[link.easing] || EASINGS.linear)(t);
      const next   = link.baseValue + (link.endValue - link.baseValue) * eased;

      // Write resolved value back to the bound state object
      if (link.index !== null) {
        if (link.obj[link.key][link.index] !== next) {
          link.obj[link.key][link.index] = next;
          changed = true;
        }
      } else {
        if (link.obj[link.key] !== next) {
          link.obj[link.key] = next;
          changed = true;
        }
      }
    }

    return changed;
  }

  // ── Current linked-param count (for transport display) ───

  get linkedCount() {
    return this.links.filter(l => l.isLinked).length;
  }
}

export const animation = new ProgressEngine();

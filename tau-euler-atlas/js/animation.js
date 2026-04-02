// ============================================================================
// animation.js - Portable Progress Engine
// tau-Euler Atlas
// ============================================================================

export const EASINGS = {
  linear: (t) => t,
  'ease-in': (t) => t * t,
  'ease-out': (t) => t * (2 - t),
  'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  sine: (t) => 0.5 - 0.5 * Math.cos(t * Math.PI),
};

export const LINK_SOURCES = ['off', 'anim', 'step'];
const EPS = 1e-12;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function quantize(v, min, max, step) {
  const safeMin = Number.isFinite(min) ? min : -Infinity;
  const safeMax = Number.isFinite(max) ? max : Infinity;
  const clamped = clamp(v, safeMin, safeMax);
  if (!Number.isFinite(step) || step <= 0) return clamped;
  const snapped = Math.round((clamped - safeMin) / step) * step + safeMin;
  return clamp(snapped, safeMin, safeMax);
}

function sanitizeSource(source) {
  return LINK_SOURCES.includes(source) ? source : 'off';
}

export function swapLinkEndpoints(link) {
  if (!link || !Number.isFinite(link.endValue)) return false;
  const oldBase = link.baseValue;
  link.baseValue = link.endValue;
  link.endValue = oldBase;
  return true;
}

export function computeWindowProgress(value, start, stop) {
  const a = Number.isFinite(start) ? start : 0;
  const b = Number.isFinite(stop) ? stop : a + 1;
  const v = Number.isFinite(value) ? value : a;
  const span = b - a;
  if (!Number.isFinite(span) || Math.abs(span) < EPS) return 0;
  return clamp((v - a) / span, 0, 1);
}

function makeLink(obj, key, index, options = {}) {
  const raw = index !== null ? obj[key][index] : obj[key];
  const link = {
    obj,
    key,
    index,
    min: options.min,
    max: options.max,
    step: options.step,
    baseValue: parseFloat(raw),
    endValue: null,
    source: 'off',
    direction: 1,
    easing: 'linear',
  };

  // Back-compat mirror for one release.
  Object.defineProperty(link, 'isLinked', {
    enumerable: true,
    configurable: true,
    get() {
      return this.source !== 'off';
    },
    set(next) {
      if (next) {
        if (this.source === 'off') this.source = 'anim';
      } else {
        this.source = 'off';
      }
    },
  });

  return link;
}

class ProgressEngine {
  constructor() {
    this.links = [];
    this.playing = false;
    this.progress = 0;
    this.duration = 30;
    this.loop = 'wrap'; // none | wrap | bounce

    this._lastFrameTime = 0;
    this._stateChangeCbs = [];
  }

  registerLink(obj, key, index = null, options = {}) {
    const link = makeLink(obj, key, index, options);
    this.links.push(link);
    return link;
  }

  setLinkSource(link, source, bounds = {}) {
    link.source = sanitizeSource(source);

    if (link.source !== 'off' && link.endValue === null) {
      const min = Number.isFinite(bounds.min) ? bounds.min : link.min;
      const max = Number.isFinite(bounds.max) ? bounds.max : link.max;
      const step = Number.isFinite(bounds.step) ? bounds.step : link.step;
      const safeMin = Number.isFinite(min) ? min : -1;
      const safeMax = Number.isFinite(max) ? max : 1;
      const span = safeMax - safeMin;
      const seed = Number.isFinite(span) && span !== 0
        ? link.baseValue + (span * 0.2)
        : link.baseValue + 1;
      link.endValue = quantize(seed, safeMin, safeMax, step);
    }

    this._notify();
  }

  cycleLinkSource(link, bounds = {}) {
    const idx = LINK_SOURCES.indexOf(sanitizeSource(link.source));
    const next = LINK_SOURCES[(idx + 1) % LINK_SOURCES.length];
    this.setLinkSource(link, next, bounds);
    return link.source;
  }

  clearLinks() {
    this.links = [];
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
    this._applyAnimProgress();
    this._notify();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(p) {
    this.progress = clamp(p, 0, 1);
    this._applyAnimProgress();
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

    this.progress += dt / this.duration;

    if (this.loop === 'none' && this.progress >= 1) {
      this.progress = 1;
      this.playing = false;
    }

    const changed = this._applyAnimProgress();
    this._notify();
    return changed;
  }

  applyStepProgress(t) {
    const clamped = clamp(Number.isFinite(t) ? t : 0, 0, 1);
    const changed = this._applyLinksForSource('step', clamped, false);
    if (changed) this._notify();
    return changed;
  }

  applyStepFromWindow(value, start, stop) {
    return this.applyStepProgress(computeWindowProgress(value, start, stop));
  }

  _applyAnimProgress() {
    let t = this.progress;
    if (this.loop === 'wrap') {
      t = t % 1;
    } else if (this.loop === 'bounce') {
      const cycle = Math.floor(t);
      t = t % 1;
      if (cycle % 2 === 1) t = 1 - t;
    } else {
      t = clamp(t, 0, 1);
    }
    return this._applyLinksForSource('anim', t, true);
  }

  _applyLinksForSource(source, t, useEasing) {
    let changed = false;

    for (const link of this.links) {
      if (sanitizeSource(link.source) !== source || link.endValue === null) continue;

      const direction = link.direction < 0 ? -1 : 1;
      let localT = direction < 0 ? 1 - t : t;
      if (useEasing) localT = (EASINGS[link.easing] || EASINGS.linear)(localT);

      const next = link.baseValue + (link.endValue - link.baseValue) * localT;

      if (link.index !== null) {
        if (link.obj[link.key][link.index] !== next) {
          link.obj[link.key][link.index] = next;
          changed = true;
        }
      } else if (link.obj[link.key] !== next) {
        link.obj[link.key] = next;
        changed = true;
      }
    }

    return changed;
  }

  get linkedCount() {
    return this.links.filter((l) => sanitizeSource(l.source) !== 'off').length;
  }
}

export const animation = new ProgressEngine();

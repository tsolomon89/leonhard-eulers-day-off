const DEFAULT_BUFFER_FPS = 60;
export const MAX_PRECOMPUTE_BUFFER_FRAMES = 600;
export const DEFAULT_BUFFER_MAX_BYTES = 96 * 1024 * 1024;
export const BUFFER_PHASES = Object.freeze(['idle', 'prefill', 'background']);

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function resolvePrecomputeBufferFrames(unit, value, fps = DEFAULT_BUFFER_FPS) {
  const safeUnit = unit === 'seconds' ? 'seconds' : 'frames';
  const safeValue = Number.isFinite(value) ? value : 24;
  const safeFps = Math.max(1, Number.isFinite(fps) ? fps : DEFAULT_BUFFER_FPS);

  let frames = safeUnit === 'seconds'
    ? safeValue * safeFps
    : safeValue;
  frames = Math.floor(frames);
  return clamp(frames, 1, MAX_PRECOMPUTE_BUFFER_FRAMES);
}

export function sanitizeBufferPhase(phase) {
  return BUFFER_PHASES.includes(phase) ? phase : 'idle';
}

export function computePrefillMinDepth(targetFrames) {
  const target = Math.max(1, Math.floor(Number.isFinite(targetFrames) ? targetFrames : 1));
  return clamp(Math.ceil(target * 0.55), 1, target);
}

export function computeBufferProgress(depth, minDepth) {
  const d = Math.max(0, Math.floor(Number.isFinite(depth) ? depth : 0));
  const min = Math.max(1, Math.floor(Number.isFinite(minDepth) ? minDepth : 1));
  return clamp(d / min, 0, 1);
}

export function estimatePayloadBytes(payload) {
  if (!payload || typeof payload !== 'object') return 0;

  let bytes = 0;
  const points = payload.points || {};
  const pushTypedArrayBytes = (arr) => {
    if (arr && typeof arr === 'object' && Number.isFinite(arr.byteLength)) {
      bytes += Math.max(0, arr.byteLength);
    }
  };
  pushTypedArrayBytes(points.positions);
  pushTypedArrayBytes(points.colors);
  pushTypedArrayBytes(points.sizes);

  if (Array.isArray(payload.atlasPaths)) {
    for (const path of payload.atlasPaths) {
      if (!path || !Array.isArray(path.points)) continue;
      // JS numbers are 64-bit floats; 3 values per point.
      bytes += path.points.length * 3 * 8;
    }
  }

  return Math.max(0, Math.floor(bytes));
}

export function clampBufferTargetByMemory(targetFrames, bytesPerFrame, maxBytes = DEFAULT_BUFFER_MAX_BYTES) {
  const target = Math.max(1, Math.floor(Number.isFinite(targetFrames) ? targetFrames : 1));
  const frameBytes = Math.max(0, Math.floor(Number.isFinite(bytesPerFrame) ? bytesPerFrame : 0));
  const budgetBytes = Math.max(1, Math.floor(Number.isFinite(maxBytes) ? maxBytes : DEFAULT_BUFFER_MAX_BYTES));

  if (frameBytes <= 0) {
    return { targetFrames: target, reduced: false, capFrames: target };
  }
  const capFrames = Math.max(1, Math.floor(budgetBytes / frameBytes));
  const clampedTarget = Math.min(target, capFrames);
  return {
    targetFrames: clampedTarget,
    reduced: clampedTarget < target,
    capFrames,
  };
}

export function computeAdaptiveBuildBudget({
  phase = 'background',
  fps = 60,
  depth = 0,
  target = 1,
}) {
  const safeFps = Number.isFinite(fps) ? fps : 60;
  const safeDepth = Math.max(0, Number.isFinite(depth) ? depth : 0);
  const safeTarget = Math.max(1, Number.isFinite(target) ? target : 1);
  const isLowFps = safeFps < 45;
  const isVeryLowFps = safeFps < 30;

  if (phase === 'prefill') {
    if (isVeryLowFps) return 1;
    if (isLowFps) return 2;
    if (safeFps < 58) return 4;
    return 6;
  }

  if (safeDepth < Math.ceil(safeTarget * 0.25)) {
    if (isVeryLowFps) return 1;
    if (isLowFps) return 2;
    return 3;
  }
  if (isVeryLowFps) return 1;
  return isLowFps ? 1 : 2;
}

export class PlaybackPrecomputeBuffer {
  constructor() {
    this.queue = [];
    this.signature = '';
    this.targetFrames = 24;
    this.cursorT = NaN;
    this.cursorBounceDir = 1;
    this.hits = 0;
    this.misses = 0;
    this.generation = 0;
    this.lastFillCancelled = false;
    this.lastPayloadBytes = 0;
  }

  get depth() {
    return this.queue.length;
  }

  setTargetFrames(frames) {
    this.targetFrames = Math.max(1, Math.floor(Number.isFinite(frames) ? frames : 24));
    if (this.queue.length > this.targetFrames) {
      this.queue.length = this.targetFrames;
    }
  }

  invalidate(signature = this.signature, resetStats = false) {
    this.queue.length = 0;
    this.cursorT = NaN;
    this.cursorBounceDir = 1;
    this.signature = signature;
    this.generation += 1;
    this.lastFillCancelled = false;
    if (resetStats) {
      this.hits = 0;
      this.misses = 0;
    }
  }

  reseed({ T, bounceDir = 1, signature = this.signature, resetStats = false }) {
    this.queue.length = 0;
    this.cursorT = Number.isFinite(T) ? T : 0;
    this.cursorBounceDir = Number(bounceDir) < 0 ? -1 : 1;
    this.signature = signature;
    this.generation += 1;
    this.lastFillCancelled = false;
    if (resetStats) {
      this.hits = 0;
      this.misses = 0;
    }
  }

  consume() {
    if (this.queue.length > 0) {
      this.hits += 1;
      return this.queue.shift();
    }
    this.misses += 1;
    return null;
  }

  fill({
    signature = this.signature,
    generation = this.generation,
    maxBuild = 2,
    buildNext,
    onPayloadBuilt,
  }) {
    this.lastFillCancelled = false;
    if (signature !== this.signature) {
      this.invalidate(signature, true);
    }
    if (generation !== this.generation) {
      this.lastFillCancelled = true;
      return 0;
    }
    if (typeof buildNext !== 'function') return 0;
    if (!Number.isFinite(this.cursorT)) return 0;

    let built = 0;
    const limit = Math.max(0, Math.floor(Number.isFinite(maxBuild) ? maxBuild : 0));
    while (this.queue.length < this.targetFrames && built < limit) {
      if (generation !== this.generation) {
        this.lastFillCancelled = true;
        break;
      }
      const next = buildNext({
        T: this.cursorT,
        bounceDir: this.cursorBounceDir,
      });
      if (!next || !next.payload) break;
      this.queue.push(next.payload);
      this.lastPayloadBytes = estimatePayloadBytes(next.payload);
      if (typeof onPayloadBuilt === 'function') onPayloadBuilt(next.payload, this.lastPayloadBytes);
      this.cursorT = Number.isFinite(next.nextT) ? next.nextT : this.cursorT;
      this.cursorBounceDir = Number(next.nextBounceDir) < 0 ? -1 : 1;
      built += 1;
    }
    return built;
  }
}

export const PRECOMPUTE_FPS = DEFAULT_BUFFER_FPS;

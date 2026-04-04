import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PlaybackPrecomputeBuffer,
  PRECOMPUTE_FPS,
  clampBufferTargetByMemory,
  computeAdaptiveBuildBudget,
  computeBufferProgress,
  computePrefillMinDepth,
  resolvePrecomputeBufferFrames,
  sanitizeBufferPhase,
} from '../js/playback-buffer.js';

test('buffer unit conversion resolves to bounded frame depth', () => {
  assert.equal(resolvePrecomputeBufferFrames('frames', 24, PRECOMPUTE_FPS), 24);
  assert.equal(resolvePrecomputeBufferFrames('seconds', 0.5, PRECOMPUTE_FPS), 30);
  assert.equal(resolvePrecomputeBufferFrames('seconds', 999, PRECOMPUTE_FPS), 600);
  assert.equal(resolvePrecomputeBufferFrames('frames', 0, PRECOMPUTE_FPS), 1);
});

test('queue fill and consume preserve order and target depth', () => {
  const buffer = new PlaybackPrecomputeBuffer();
  buffer.reseed({ T: 0, signature: 'sig' });
  buffer.setTargetFrames(3);

  let cursor = 0;
  buffer.fill({
    signature: 'sig',
    maxBuild: 5,
    buildNext: () => {
      cursor += 1;
      return {
        payload: { id: cursor },
        nextT: cursor,
        nextBounceDir: 1,
      };
    },
  });

  assert.equal(buffer.depth, 3);
  assert.equal(buffer.consume().id, 1);
  assert.equal(buffer.consume().id, 2);
  assert.equal(buffer.consume().id, 3);
  assert.equal(buffer.hits, 3);
  assert.equal(buffer.depth, 0);
});

test('signature change invalidates cache while preserving deterministic reseed', () => {
  const buffer = new PlaybackPrecomputeBuffer();
  buffer.reseed({ T: 5, signature: 'a' });
  buffer.setTargetFrames(2);
  buffer.fill({
    signature: 'a',
    maxBuild: 2,
    buildNext: ({ T }) => ({
      payload: { T },
      nextT: T + 1,
      nextBounceDir: 1,
    }),
  });
  assert.equal(buffer.depth, 2);

  buffer.fill({
    signature: 'b',
    maxBuild: 1,
    buildNext: ({ T }) => ({
      payload: { T },
      nextT: T + 1,
      nextBounceDir: 1,
    }),
  });
  assert.equal(buffer.signature, 'b');
  assert.equal(buffer.depth, 0);
  assert.equal(buffer.hits, 0);
  assert.equal(buffer.misses, 0);
});

test('cache miss increments miss counter and returns null', () => {
  const buffer = new PlaybackPrecomputeBuffer();
  buffer.reseed({ T: 0, signature: 'sig' });
  const frame = buffer.consume();
  assert.equal(frame, null);
  assert.equal(buffer.misses, 1);
});

test('prefill helpers normalize phase and progress', () => {
  assert.equal(sanitizeBufferPhase('prefill'), 'prefill');
  assert.equal(sanitizeBufferPhase('bogus'), 'idle');

  const minDepth = computePrefillMinDepth(24);
  assert.equal(minDepth, 14);
  assert.equal(computeBufferProgress(7, minDepth), 0.5);
  assert.equal(computeBufferProgress(999, minDepth), 1);
});

test('memory guard clamps target frames when payload estimate is too large', () => {
  const guarded = clampBufferTargetByMemory(120, 2 * 1024 * 1024, 64 * 1024 * 1024);
  assert.equal(guarded.targetFrames, 32);
  assert.equal(guarded.reduced, true);
  assert.equal(guarded.capFrames, 32);
});

test('adaptive build budget scales by phase/fps/headroom', () => {
  const fastPrefill = computeAdaptiveBuildBudget({ phase: 'prefill', fps: 60, depth: 0, target: 40 });
  const slowPrefill = computeAdaptiveBuildBudget({ phase: 'prefill', fps: 25, depth: 0, target: 40 });
  const background = computeAdaptiveBuildBudget({ phase: 'background', fps: 60, depth: 30, target: 40 });
  assert.ok(fastPrefill > slowPrefill);
  assert.ok(background >= 1);
});

test('generation token cancels stale fill jobs immediately', () => {
  const buffer = new PlaybackPrecomputeBuffer();
  buffer.reseed({ T: 0, signature: 'sig' });
  const staleGeneration = buffer.generation;
  buffer.reseed({ T: 1, signature: 'sig' });

  const built = buffer.fill({
    signature: 'sig',
    generation: staleGeneration,
    maxBuild: 3,
    buildNext: () => ({
      payload: { id: 'x' },
      nextT: 2,
      nextBounceDir: 1,
    }),
  });

  assert.equal(built, 0);
  assert.equal(buffer.lastFillCancelled, true);
  assert.equal(buffer.depth, 0);
});

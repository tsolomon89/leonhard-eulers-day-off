// ═══════════════════════════════════════════════════════════════
//  video-export.js — Deterministic offline video export (v2.1)
//  τ-Euler Atlas · Scene Director
//
//  TRUE frame-accurate export using WebCodecs VideoEncoder +
//  mp4-muxer / webm-muxer. Each frame is rendered to completion
//  with no real-time pressure, then encoded with explicit
//  timestamps. Zero frame drops regardless of scene complexity.
//
//  Codec priority: H.264 (.mp4) → VP9 (.webm) → VP8 (.webm)
// ═══════════════════════════════════════════════════════════════

import { animation } from './animation.js';
import { totalDuration } from './scene-data.js';
import {
  getSceneRenderer,
  renderFrame,
  setRendererSize,
  clearRendererSizeOverride,
  suspendRenderLoop,
  resumeRenderLoop,
} from './scene.js';
import {
  deriveState,
  getSceneManager,
  buildRenderPayload,
  applyRenderPayload,
  getEffectiveFx,
  computePointBudget,
  computeMathSignature,
} from './controls.js';
import { setStableRoundRobin } from './generators.js';
import { normalizeStateCinematicFx } from './cinematic-fx.js';
import * as audioPlayer from './audio-player.js';

// ── CDN imports for muxers ───────────────────────────────────

const MP4_MUXER_CDN = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5/build/mp4-muxer.mjs';
const WEBM_MUXER_CDN = 'https://cdn.jsdelivr.net/npm/webm-muxer@5/build/webm-muxer.mjs';

let _mp4MuxerMod = null;
let _webmMuxerMod = null;

async function loadMp4Muxer() {
  if (_mp4MuxerMod) return _mp4MuxerMod;
  try {
    _mp4MuxerMod = await import(MP4_MUXER_CDN);
    console.log('[video-export] mp4-muxer loaded');
    return _mp4MuxerMod;
  } catch (err) {
    console.warn('[video-export] mp4-muxer failed to load:', err);
    return null;
  }
}

async function loadWebmMuxer() {
  if (_webmMuxerMod) return _webmMuxerMod;
  try {
    _webmMuxerMod = await import(WEBM_MUXER_CDN);
    console.log('[video-export] webm-muxer loaded');
    return _webmMuxerMod;
  } catch (err) {
    console.warn('[video-export] webm-muxer failed to load:', err);
    return null;
  }
}

// ── Capability Detection ─────────────────────────────────────

/** Check whether the current browser supports frame-accurate video export. */
export function isExportSupported() {
  return typeof VideoEncoder === 'function'
      && typeof VideoFrame === 'function';
}

/**
 * Detect the best codec + container combination.
 * Returns { codec, container, muxerCodec, ext } or null.
 *
 * Priority: H.264 (.mp4) → VP9 (.webm) → VP8 (.webm)
 */
async function detectBestCodec(width, height) {
  // ── H.264 candidates (for MP4) ──
  const h264Profiles = [
    'avc1.640028', // High profile, level 4.0
    'avc1.4D0028', // Main profile, level 4.0
    'avc1.42E028', // Baseline, level 4.0
    'avc1.42001E', // Constrained baseline, level 3.0
    'avc1.420034', // Baseline, level 5.2
  ];

  for (const codec of h264Profiles) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: 8_000_000,
        hardwareAcceleration: 'prefer-hardware',
      });
      if (support.supported) {
        return { codec, container: 'mp4', muxerCodec: 'avc', ext: '.mp4' };
      }
    } catch {}

    // Retry with software fallback
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: 8_000_000,
        hardwareAcceleration: 'prefer-software',
      });
      if (support.supported) {
        return { codec, container: 'mp4', muxerCodec: 'avc', ext: '.mp4' };
      }
    } catch {}
  }

  // ── VP9 (for WebM) ──
  const vp9Candidates = [
    'vp09.00.10.08',  // Profile 0
    'vp09.00.31.08',  // Profile 0, level 3.1
  ];
  for (const codec of vp9Candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: 8_000_000,
        hardwareAcceleration: 'prefer-software',
      });
      if (support.supported) {
        return { codec, container: 'webm', muxerCodec: 'V_VP9', ext: '.webm' };
      }
    } catch {}
  }

  // ── VP8 (for WebM, fallback) ──
  try {
    const support = await VideoEncoder.isConfigSupported({
      codec: 'vp8',
      width,
      height,
      bitrate: 8_000_000,
      hardwareAcceleration: 'prefer-software',
    });
    if (support.supported) {
      return { codec: 'vp8', container: 'webm', muxerCodec: 'V_VP8', ext: '.webm' };
    }
  } catch {}

  return null;
}

// ── Quality / Bitrate Presets ────────────────────────────────

const BITRATE_PRESETS = {
  low:    2_000_000,   // 2 Mbps
  medium: 8_000_000,   // 8 Mbps
  high:  16_000_000,   // 16 Mbps
};

// ── Export Pipeline ──────────────────────────────────────────

/**
 * Create a video exporter instance.
 *
 * Usage:
 *   const exporter = createVideoExporter();
 *   exporter.onProgress(({ frame, totalFrames, percent }) => ...);
 *   exporter.onComplete((blob, filename) => ...);
 *   exporter.onError((err) => ...);
 *   await exporter.start({ fps: 30, width: 1920, height: 1080, quality: 'medium', includeAudio: true });
 *   // later: exporter.cancel();
 */
export function createVideoExporter() {
  let _progressCb = null;
  let _completeCb = null;
  let _errorCb = null;

  let _running = false;
  let _cancelled = false;
  let _encoder = null;
  let _muxer = null;
  let _audioEncoder = null;

  // Saved state for restoration
  let _savedRendererWidth = 0;
  let _savedRendererHeight = 0;
  let _savedAnimProgress = 0;
  let _savedAnimPlaying = false;
  let _savedAnimLoop = 'wrap';
  let _savedTimelineDuration = null;
  let _savedPathBudget = null;

  function onProgress(cb) { _progressCb = cb; }
  function onComplete(cb) { _completeCb = cb; }
  function onError(cb) { _errorCb = cb; }

  function _emitProgress(frame, totalFrames) {
    if (_progressCb) {
      _progressCb({
        frame,
        totalFrames,
        percent: totalFrames > 0 ? Math.round((frame / totalFrames) * 100) : 0,
      });
    }
  }

  function _emitError(err) {
    if (_errorCb) _errorCb(err);
    else console.error('[video-export]', err);
  }

  // ── State snapshot / restore ────────────────────────────

  function _snapshotState() {
    _savedAnimProgress = animation.progress;
    _savedAnimPlaying = animation.playing;
    _savedAnimLoop = animation.loop;
    _savedTimelineDuration = animation._timelineDuration;

    const renderer = getSceneRenderer();
    if (renderer) {
      _savedRendererWidth = renderer.domElement.width;
      _savedRendererHeight = renderer.domElement.height;
    }

    // Snapshot path budget from scene-manager state
    const sm = getSceneManager();
    _savedPathBudget = sm?.getState()?.pathBudget ?? null;
  }

  function _restoreState() {
    // Disable export-specific generator flags
    setStableRoundRobin(false);

    // Restore path budget
    const sm = getSceneManager();
    if (_savedPathBudget !== null && sm?.getState()) {
      sm.getState().pathBudget = _savedPathBudget;
    }

    // Restore renderer size and clear resolution override
    if (_savedRendererWidth > 0 && _savedRendererHeight > 0) {
      setRendererSize(_savedRendererWidth, _savedRendererHeight);
    }
    clearRendererSizeOverride();

    // Stop scene manager playback (restores tracked state paths)
    if (sm && sm.isPlaying()) {
      sm.stopPlayback();
    }

    // Restore animation engine
    animation.playing = _savedAnimPlaying;
    animation.progress = _savedAnimProgress;
    animation.loop = _savedAnimLoop;
    animation._timelineDuration = _savedTimelineDuration;

    // Resume live render loop
    resumeRenderLoop();

    // Restore UI
    document.body.classList.remove('export-active');
  }

  // ── Audio encoding ──────────────────────────────────────

  async function _encodeAudio(muxer, durationSeconds, container) {
    const audioState = audioPlayer.getState();
    if (!audioState.tracks || audioState.tracks.length === 0) return;

    const trackFile = audioState.tracks[0]?.file;
    if (!trackFile) return;

    try {
      const resp = await fetch('audio/' + encodeURIComponent(trackFile));
      if (!resp.ok) {
        console.warn('[video-export] Could not fetch audio track:', trackFile);
        return;
      }
      const arrayBuffer = await resp.arrayBuffer();

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      audioCtx.close();

      // Find a supported audio codec
      const audioCodecCandidates = container === 'mp4'
        ? ['mp4a.40.2', 'opus']  // AAC preferred for MP4
        : ['opus', 'mp4a.40.2']; // Opus preferred for WebM

      let selectedAudioCodec = null;
      for (const ac of audioCodecCandidates) {
        try {
          const support = await AudioEncoder.isConfigSupported({
            codec: ac,
            sampleRate: audioBuffer.sampleRate,
            numberOfChannels: audioBuffer.numberOfChannels,
          });
          if (support.supported) {
            selectedAudioCodec = ac;
            break;
          }
        } catch {}
      }

      if (!selectedAudioCodec) {
        console.warn('[video-export] No audio codec supported, exporting without audio');
        return;
      }

      await _encodeAudioWithCodec(muxer, audioBuffer, selectedAudioCodec, durationSeconds);
    } catch (err) {
      console.warn('[video-export] Audio encoding failed:', err);
    }
  }

  async function _encodeAudioWithCodec(muxer, audioBuffer, codec, maxDurationSeconds) {
    const sampleRate = audioBuffer.sampleRate;
    const numberOfChannels = audioBuffer.numberOfChannels;
    const totalSamples = Math.min(
      audioBuffer.length,
      Math.ceil(maxDurationSeconds * sampleRate)
    );

    return new Promise((resolve, reject) => {
      _audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          muxer.addAudioChunk(chunk, meta);
        },
        error: (err) => {
          console.warn('[video-export] AudioEncoder error:', err);
          reject(err);
        },
      });

      _audioEncoder.configure({
        codec,
        sampleRate,
        numberOfChannels,
      });

      const chunkSize = 4096;
      for (let offset = 0; offset < totalSamples; offset += chunkSize) {
        if (_cancelled) break;

        const remaining = Math.min(chunkSize, totalSamples - offset);
        const planarData = new Float32Array(remaining * numberOfChannels);
        for (let ch = 0; ch < numberOfChannels; ch++) {
          planarData.set(
            audioBuffer.getChannelData(ch).slice(offset, offset + remaining),
            ch * remaining,
          );
        }

        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate,
          numberOfFrames: remaining,
          numberOfChannels,
          timestamp: Math.round((offset / sampleRate) * 1_000_000),
          data: planarData,
        });

        _audioEncoder.encode(audioData);
        audioData.close();
      }

      _audioEncoder.flush().then(resolve).catch(reject);
    });
  }

  // ── Main export ─────────────────────────────────────────

  async function start(settings) {
    if (_running) return;

    const {
      fps = 30,
      width = 1920,
      height = 1080,
      quality = 'medium',
      includeAudio = true,
    } = settings;

    // Check browser support
    if (!isExportSupported()) {
      _emitError(new Error(
        'Video export requires WebCodecs API (Chrome 94+ or Edge 94+).'
      ));
      return;
    }

    // Check timeline
    const sm = getSceneManager();
    const timeline = sm?.getTimeline();
    if (!timeline || timeline.scenes.length === 0) {
      _emitError(new Error('No timeline scenes to export.'));
      return;
    }

    const duration = totalDuration(timeline);
    const totalFrames = Math.ceil(duration * fps);
    if (totalFrames <= 0) {
      _emitError(new Error('Timeline duration is zero.'));
      return;
    }

    // Detect best codec (H.264 → VP9 → VP8)
    const codecInfo = await detectBestCodec(width, height);
    if (!codecInfo) {
      _emitError(new Error(
        'No supported video codec found. Try Chrome or Edge with a smaller resolution.'
      ));
      return;
    }

    // Load appropriate muxer
    let muxerLib;
    if (codecInfo.container === 'mp4') {
      muxerLib = await loadMp4Muxer();
    } else {
      muxerLib = await loadWebmMuxer();
    }
    if (!muxerLib) {
      // Fallback: try the other muxer
      muxerLib = codecInfo.container === 'mp4'
        ? await loadWebmMuxer()
        : await loadMp4Muxer();
      if (!muxerLib) {
        _emitError(new Error('Failed to load video muxer library. Check your internet connection.'));
        return;
      }
    }

    _running = true;
    _cancelled = false;

    const bitrate = BITRATE_PRESETS[quality] || BITRATE_PRESETS.medium;
    const frameDurationMicros = Math.round(1_000_000 / fps);

    console.log(
      `[video-export] Starting: ${width}×${height} @ ${fps}fps, ` +
      `${totalFrames} frames, codec=${codecInfo.codec}, ` +
      `container=${codecInfo.container}, bitrate=${bitrate}`
    );

    // 1. Snapshot state
    _snapshotState();

    // 2. Hide UI chrome
    document.body.classList.add('export-active');

    // 3. Suspend live render loop
    suspendRenderLoop();

    // 4. Resize renderer to export resolution
    setRendererSize(width, height);

    // 5. Start scene-manager playback (builds snapshots, enables resolve)
    sm.startPlayback();
    animation.pause();

    try {
      // 6. Set up muxer
      const muxerConfig = {
        target: new muxerLib.ArrayBufferTarget(),
        video: {
          codec: codecInfo.muxerCodec,
          width,
          height,
        },
        fastStart: codecInfo.container === 'mp4' ? 'in-memory' : undefined,
      };

      // Add audio config if requested
      if (includeAudio) {
        muxerConfig.audio = {
          codec: codecInfo.container === 'mp4' ? 'aac' : 'opus',
          sampleRate: 48000,
          numberOfChannels: 2,
        };
      }

      _muxer = new muxerLib.Muxer(muxerConfig);

      // 7. Set up VideoEncoder
      let _encoderError = null;
      _encoder = new VideoEncoder({
        output: (chunk, meta) => {
          _muxer.addVideoChunk(chunk, meta);
        },
        error: (err) => {
          _encoderError = err;
        },
      });

      _encoder.configure({
        codec: codecInfo.codec,
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: 'prefer-hardware',
        latencyMode: 'quality',
      });

      // 8. Render and encode each frame
      const canvas = getSceneRenderer()?.domElement;
      if (!canvas) throw new Error('Canvas element not found.');

      // ── Export-specific generator config ──
      // Stabilize round-robin so the same combo ordering is used every
      // frame, preventing path subset flickering.
      setStableRoundRobin(true);
      // Boost pathBudget so all generated segments are emitted (no budget
      // clipping during export).
      const appState = sm.getState();
      if (appState) appState.pathBudget = 50000;

      // Backpressure threshold — don't let the encoder queue grow too large.
      // At high resolutions, the encoder can't keep up with frame submission
      // and the browser will reclaim the codec resources ("codec reclaimed
      // due to inactivity" error).
      const MAX_QUEUE_SIZE = 5;

      for (let i = 0; i < totalFrames; i++) {
        if (_cancelled) break;

        // Check for encoder errors from previous frames
        if (_encoderError) {
          throw new Error(`VideoEncoder error: ${_encoderError.message}`);
        }

        // ── Backpressure: wait for encoder queue to drain ──
        // This prevents overwhelming the encoder at high resolution/fps,
        // which causes the browser to reclaim codec resources.
        while (_encoder.encodeQueueSize >= MAX_QUEUE_SIZE) {
          await new Promise(resolve => {
            _encoder.addEventListener('dequeue', resolve, { once: true });
          });
          // Check again for encoder errors after waiting
          if (_encoderError) {
            throw new Error(`VideoEncoder error: ${_encoderError.message}`);
          }
        }

        // Seek to exact frame position
        const progress = totalFrames > 1 ? i / (totalFrames - 1) : 0;
        animation.seek(progress);

        // Run the full rendering pipeline
        const derived = deriveState();
        // Normalize cinematic FX after scene-manager resolve writes raw
        // interpolated values — ensures visibility gates evaluate correctly
        // at scene boundaries (prevents momentary opacity=0 dropouts).
        normalizeStateCinematicFx(appState);
        const fx = getEffectiveFx();
        const budget = computePointBudget();
        const signature = computeMathSignature(derived, budget);
        const payload = buildRenderPayload(derived, budget, signature, fx);
        applyRenderPayload(payload, fx);
        renderFrame();

        // Create VideoFrame with explicit timestamp
        const frame = new VideoFrame(canvas, {
          timestamp: i * frameDurationMicros,
          duration: frameDurationMicros,
        });

        // Encode — keyframe every 2 seconds
        const keyFrame = (i % (fps * 2)) === 0;
        _encoder.encode(frame, { keyFrame });
        frame.close();

        // Report progress
        _emitProgress(i + 1, totalFrames);

        // Yield to event loop so progress UI can update
        if (i % 4 === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }

      if (_cancelled) {
        _cleanup();
        console.log('[video-export] Export cancelled.');
        return;
      }

      // 9. Flush video encoder FIRST (before audio) — don't leave it idle
      //    while audio encoding runs, or the browser may reclaim codec resources.
      await _encoder.flush();
      _encoder.close();
      _encoder = null;

      if (_encoderError) {
        throw new Error(`VideoEncoder error during flush: ${_encoderError.message}`);
      }

      // 10. Encode audio (if requested) — video encoder is already done/closed
      if (includeAudio) {
        try {
          await _encodeAudio(_muxer, duration, codecInfo.container);
        } catch (err) {
          console.warn('[video-export] Audio encoding failed, continuing without audio:', err);
        }
      }

      // 11. Finalize muxer
      _muxer.finalize();

      // 11. Create blob and download
      const buffer = _muxer.target.buffer;
      const mimeType = codecInfo.container === 'mp4' ? 'video/mp4' : 'video/webm';
      const blob = new Blob([buffer], { type: mimeType });
      const filename = `tau-euler-atlas-${Date.now()}${codecInfo.ext}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      console.log(`[video-export] Complete: ${filename} (${(blob.size / 1024 / 1024).toFixed(1)} MB)`);

      _cleanup();

      if (_completeCb) _completeCb(blob, filename);

    } catch (err) {
      _cleanup();
      _emitError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  function _cleanup() {
    _running = false;

    if (_encoder && _encoder.state !== 'closed') {
      try { _encoder.close(); } catch {}
    }
    _encoder = null;

    if (_audioEncoder && _audioEncoder.state !== 'closed') {
      try { _audioEncoder.close(); } catch {}
    }
    _audioEncoder = null;

    _muxer = null;

    _restoreState();
  }

  function cancel() {
    if (!_running) return;
    _cancelled = true;
  }

  function isRunning() {
    return _running;
  }

  return {
    start,
    cancel,
    isRunning,
    onProgress,
    onComplete,
    onError,
  };
}

// ── Utility ──────────────────────────────────────────────────

/** Estimate output file size in bytes. */
export function estimateFileSize(fps, durationSeconds, quality) {
  const bitrate = BITRATE_PRESETS[quality] || BITRATE_PRESETS.medium;
  return Math.round((bitrate * durationSeconds) / 8);
}

/** Compute total frames for a given fps and duration. */
export function computeTotalFrames(fps, durationSeconds) {
  return Math.ceil(fps * durationSeconds);
}

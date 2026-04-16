// ═══════════════════════════════════════════════════════════════
//  scene-manager.js — Scene timeline orchestrator
//  τ-Euler Atlas · Scene Timeline
//
//  Drives scene playback by interpolating directly from scene
//  model data → writePath(). Completely decoupled from the
//  link engine—sliders are normal value setters, scene tracks
//  are edited in the timeline panel.
// ═══════════════════════════════════════════════════════════════

import { getEasing } from './easing.js';
import {
  totalDuration,
  resolveTimePosition,
  buildSceneSnapshots,
  writePath,
  readPath,
  getActiveScene,
  getInheritedBases,
} from './scene-data.js';
import { isBooleanLinkPath } from './linked-params.js';

// ── Scene Manager ────────────────────────────────────────────

/**
 * Create a scene manager that bridges the timeline data model
 * with the animation engine for playback.
 *
 * The link engine is NOT used during scene playback—values are
 * interpolated directly from scene track data and written to
 * state via writePath().
 *
 * @param {Object} options
 * @param {Object} options.animation      - animation/progress engine instance
 * @param {Function} options.getState     - returns the mutable app state object
 * @param {Function} [options.onSceneChange] - called when active scene changes during playback
 * @returns {SceneManager}
 */
export function createSceneManager(options) {
  const { animation: anim, getState, onSceneChange } = options;

  let _timeline = null;       // Current Timeline object
  let _isPlaying = false;     // True during timeline playback
  let _initialSnapshot = null; // Snapshot of state at playback start
  let _lastSceneIndex = -1;    // Track scene transitions during playback
  let _savedLoop = null;       // Saved animation loop mode (restored on stop)

  // ── Authoring ────────────────────────────────────────────

  /**
   * Set the active timeline.
   * @param {Timeline} timeline
   */
  function setTimeline(timeline) {
    _timeline = timeline;
    _isPlaying = false;
    _lastSceneIndex = -1;
  }

  /** Get the current timeline. */
  function getTimeline() {
    return _timeline;
  }

  /** Check if timeline playback is active. */
  function isPlaying() {
    return _isPlaying;
  }

  /**
   * Switch the active scene in the UI for authoring.
   * Does NOT mutate the link engine or any slider state.
   *
   * @param {number} sceneIndex
   */
  function loadSceneForAuthoring(sceneIndex) {
    if (!_timeline || sceneIndex < 0 || sceneIndex >= _timeline.scenes.length) return;
    _timeline.activeSceneIndex = sceneIndex;
  }

  // ── Bounds widening during playback ──────────────────────

  /**
   * Widen derivation-level bounds in state so that buildDerivedState()
   * won't clamp scene-tracked values back to the accordion slider range.
   *
   * Currently only T has derivation-level bounds (T_lowerBound / T_upperBound).
   * If other params gain similar bounds in the future, add them here.
   */
  function _widenBoundsForPlayback(state, timeline) {
    if (!timeline || !timeline.scenes.length) return;

    let needsTBounds = false;
    let tMin = Number.isFinite(state.T_lowerBound) ? state.T_lowerBound : 0;
    let tMax = Number.isFinite(state.T_upperBound) ? state.T_upperBound : 2;

    for (const scene of timeline.scenes) {
      for (const link of scene.links) {
        if (link.path === 'T') {
          needsTBounds = true;
          if (Number.isFinite(link.baseValue)) {
            tMin = Math.min(tMin, link.baseValue);
            tMax = Math.max(tMax, link.baseValue);
          }
          if (Number.isFinite(link.endValue)) {
            tMin = Math.min(tMin, link.endValue);
            tMax = Math.max(tMax, link.endValue);
          }
        }
      }
    }

    if (needsTBounds) {
      state.T_lowerBound = tMin;
      state.T_upperBound = tMax;
    }
  }

  // ── Playback ─────────────────────────────────────────────

  /**
   * Start timeline playback.
   * Snapshots the current state, builds scene inheritance chain,
   * and configures the animation engine.
   */
  function startPlayback() {
    if (!_timeline || _timeline.scenes.length === 0) return;

    // Snapshot current state for playback
    const state = getState();
    _initialSnapshot = JSON.parse(JSON.stringify(state));

    // Build scene snapshots (forces baseValues via inheritance chain)
    buildSceneSnapshots(_timeline, _initialSnapshot);

    // Configure animation engine
    const total = totalDuration(_timeline);
    anim.setTimelineDuration(total);

    // Set animation loop mode (string: 'none' | 'wrap' | 'bounce')
    _savedLoop = anim.loop;
    anim.loop = _timeline.loop || 'none';
    anim.setLoopCount(_timeline.loopCount || 0);
    anim.resetLoopState();

    _isPlaying = true;
    _lastSceneIndex = -1;
  }

  /**
   * Stop timeline playback.
   * Clears timeline duration override from animation engine.
   */
  function stopPlayback() {
    _isPlaying = false;
    _lastSceneIndex = -1;
    anim.setTimelineDuration(null);
    // Restore original animation loop mode
    if (_savedLoop !== null) {
      anim.loop = _savedLoop;
      _savedLoop = null;
    }

    // Revert the application state to exactly how it was before playback began
    if (_initialSnapshot && _timeline) {
      const state = getState();
      const modifiedPaths = new Set();
      
      // Determine what the timeline might have touched
      _timeline.scenes.forEach(scene => {
        scene.links.forEach(link => modifiedPaths.add(link.path));
      });
      
      // Revert each touched path back to the pre-playback value
      modifiedPaths.forEach(path => {
        const originalValue = readPath(_initialSnapshot, path);
        if (originalValue !== undefined) {
          writePath(state, path, originalValue);
          if (options.onTrackUpdate) {
            options.onTrackUpdate(path, originalValue);
          }
        }
      });
      
      _initialSnapshot = null;
    }
  }

  /**
   * Update the global animation engine's target duration to reflect
   * live edits made to the timeline scenes during playback.
   */
  function updateTimelineDuration() {
    if (_isPlaying && _timeline) {
      anim.setTimelineDuration(totalDuration(_timeline));
    }
  }

  /**
   * Resolve the current timeline state for the given animation time.
   * Called from the animation frame loop.
   *
   * Interpolates each track's base→end directly and writes to app
   * state via writePath(). No link engine involved.
   *
   * @returns {{ sceneIndex: number, localProgress: number, easedProgress: number, changed: boolean }}
   */
  function resolve() {
    if (!_isPlaying || !_timeline) {
      return { sceneIndex: 0, localProgress: 0, easedProgress: 0, changed: false };
    }

    const absoluteTime = anim.getAbsoluteTime();
    const { sceneIndex, localProgress } = resolveTimePosition(_timeline, absoluteTime);
    const scene = _timeline.scenes[sceneIndex];

    // Apply easing
    const easingFn = getEasing(scene.easing);
    const t = easingFn(Math.max(0, Math.min(1, localProgress)));

    // Write interpolated values directly to state
    const state = getState();
    for (const link of scene.links) {
      if (isBooleanLinkPath(link.path)) {
        // Core structural flags always snap instantly to their scene configuration
        writePath(state, link.path, link.endValue);
      } else {
        const value = link.baseValue + (link.endValue - link.baseValue) * t;
        writePath(state, link.path, value);
      }

      if (options.onTrackUpdate) {
        options.onTrackUpdate(link.path, readPath(state, link.path));
      }
    }

    // Widen derivation-level bounds so that scene-tracked values are not
    // clamped back by buildDerivedState().  Bounds revert on stopPlayback
    // via the _initialSnapshot restore.
    _widenBoundsForPlayback(state, _timeline);

    // Track scene transitions
    const sceneChanged = sceneIndex !== _lastSceneIndex;
    _lastSceneIndex = sceneIndex;

    if (sceneChanged && onSceneChange) {
      onSceneChange(sceneIndex, scene);
    }

    return {
      sceneIndex,
      localProgress,
      easedProgress: t,
      changed: sceneChanged,
    };
  }

  /**
   * Get playback info for UI display.
   */
  function getPlaybackInfo() {
    if (!_isPlaying || !_timeline) {
      return {
        isPlaying: false,
        sceneIndex: 0,
        sceneName: '',
        currentTime: 0,
        totalDuration: 0,
        localProgress: 0,
      };
    }

    const absoluteTime = anim.getAbsoluteTime();
    const total = totalDuration(_timeline);
    const { sceneIndex, localProgress } = resolveTimePosition(_timeline, absoluteTime);
    const scene = _timeline.scenes[sceneIndex];

    return {
      isPlaying: true,
      sceneIndex,
      sceneName: scene.name,
      currentTime: absoluteTime,
      totalDuration: total,
      localProgress,
    };
  }

  // ── Public API ───────────────────────────────────────────

  return {
    setTimeline,
    getTimeline,
    isPlaying,
    loadSceneForAuthoring,
    startPlayback,
    updateTimelineDuration,
    stopPlayback,
    resolve,
    getPlaybackInfo,
    getInitialSnapshot: () => _initialSnapshot,
    getState,
  };
}

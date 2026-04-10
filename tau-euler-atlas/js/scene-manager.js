// ═══════════════════════════════════════════════════════════════
//  scene-manager.js — Scene timeline orchestrator
//  τ-Euler Atlas · Scene Timeline
//
//  Coordinates between the scene data model, the link engine,
//  and the animation progress engine to drive playback.
// ═══════════════════════════════════════════════════════════════

import { getEasing } from './easing.js';
import {
  totalDuration,
  resolveTimePosition,
  buildSceneSnapshots,
  readPath,
  writePath,
  getActiveScene,
} from './scene-data.js';

// ── Scene Manager ────────────────────────────────────────────

/**
 * Create a scene manager that bridges the timeline data model
 * with the link engine and animation engine.
 *
 * @param {Object} options
 * @param {Object} options.linkEngine     - link engine instance (from createLinkEngine)
 * @param {Object} options.animation      - animation/progress engine instance
 * @param {Function} options.getState     - returns the mutable app state object
 * @param {Function} [options.onSceneChange] - called when active scene changes during playback
 * @returns {SceneManager}
 */
export function createSceneManager(options) {
  const { linkEngine, animation: anim, getState, onSceneChange } = options;

  let _timeline = null;       // Current Timeline object
  let _isPlaying = false;     // True during timeline playback
  let _initialSnapshot = null; // Snapshot of state at playback start
  let _lastSceneIndex = -1;    // Track scene transitions during playback
  let _sceneSnapshots = {};    // Per-scene link engine snapshots (for fast scene switching)

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
   * Load a scene's link configuration into the link engine for authoring.
   * Call this when the user switches the active scene in the UI.
   *
   * @param {number} sceneIndex
   */
  function loadSceneForAuthoring(sceneIndex) {
    if (!_timeline || sceneIndex < 0 || sceneIndex >= _timeline.scenes.length) return;

    const scene = _timeline.scenes[sceneIndex];
    _timeline.activeSceneIndex = sceneIndex;

    // Build a link snapshot from the scene's link list
    const snap = {};
    for (const link of scene.links) {
      snap[link.path] = {
        baseValue: link.baseValue,
        endValue: link.endValue,
        isLinked: true,
        direction: link.direction,
      };
    }

    // Restore into link engine (unlinked paths revert)
    linkEngine.restore(snap);
  }

  /**
   * Save the current link engine state back into the active scene's links.
   * Call this after the user modifies links via the slider UI.
   */
  function saveCurrentToScene() {
    if (!_timeline) return;
    const scene = getActiveScene(_timeline);
    if (!scene) return;

    // Read current link records from the engine
    const paths = linkEngine.registeredPaths();
    const updatedLinks = [];

    for (const path of paths) {
      const record = linkEngine.get(path);
      if (!record || !record.isLinked) continue;
      updatedLinks.push({
        path,
        baseValue: record.baseValue,
        endValue: Number.isFinite(record.endValue) ? record.endValue : record.baseValue,
        direction: record.direction,
      });
    }

    scene.links = updatedLinks;
  }

  // ── Playback ─────────────────────────────────────────────

  /**
   * Start timeline playback.
   * Snapshots the current state, builds scene inheritance chain,
   * and configures the animation engine.
   */
  function startPlayback() {
    if (!_timeline || _timeline.scenes.length === 0) return;

    // Snapshot current state
    const state = getState();
    _initialSnapshot = JSON.parse(JSON.stringify(state));

    // Build scene snapshots (inheritance chain)
    buildSceneSnapshots(_timeline, _initialSnapshot);

    // Compute total duration and configure animation engine
    const total = totalDuration(_timeline);
    anim.setTimelineDuration(total);

    // Build per-scene link engine snapshots
    _sceneSnapshots = {};
    for (let i = 0; i < _timeline.scenes.length; i++) {
      const scene = _timeline.scenes[i];
      const snap = {};
      for (const link of scene.links) {
        snap[link.path] = {
          baseValue: link.baseValue,
          endValue: link.endValue,
          isLinked: true,
          direction: link.direction,
        };
      }
      _sceneSnapshots[i] = snap;
    }

    _isPlaying = true;
    _lastSceneIndex = -1; // Force first load
  }

  /**
   * Stop timeline playback.
   * Clears timeline duration override from animation engine.
   */
  function stopPlayback() {
    _isPlaying = false;
    _lastSceneIndex = -1;
    anim.setTimelineDuration(null);
  }

  /**
   * Resolve the current timeline state for the given animation progress.
   * Called from the animation frame loop.
   *
   * Writes resolved values into the app state object via the link engine.
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

    // Load this scene's links into the engine if scene changed
    const sceneChanged = sceneIndex !== _lastSceneIndex;
    if (sceneChanged) {
      // Apply the scene's base snapshot to state first
      if (scene.snapshot) {
        const state = getState();
        const registeredPaths = linkEngine.registeredPaths();
        for (const path of registeredPaths) {
          const snapshotValue = readPath(scene.snapshot, path);
          if (Number.isFinite(snapshotValue)) {
            const record = linkEngine.get(path);
            if (record && !_sceneSnapshots[sceneIndex]?.[path]) {
              // Path not linked in this scene → set to inherited value
              record.adapter.setLive(snapshotValue);
            }
          }
        }
      }

      // Restore this scene's link configuration
      linkEngine.restore(_sceneSnapshots[sceneIndex] || {});
      _lastSceneIndex = sceneIndex;

      if (onSceneChange) {
        onSceneChange(sceneIndex, scene);
      }
    }

    // Apply easing
    const easingFn = getEasing(scene.easing);
    const easedProgress = easingFn(Math.max(0, Math.min(1, localProgress)));

    // Resolve link engine at eased progress
    linkEngine.resolveAndApply(easedProgress);

    return {
      sceneIndex,
      localProgress,
      easedProgress,
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
    saveCurrentToScene,
    startPlayback,
    stopPlayback,
    resolve,
    getPlaybackInfo,
    getInitialSnapshot: () => _initialSnapshot,
  };
}

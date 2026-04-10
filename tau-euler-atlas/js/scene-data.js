// ═══════════════════════════════════════════════════════════════
//  scene-data.js — Scene & Timeline data model
//  τ-Euler Atlas · Scene Timeline
//
//  Each scene stores a sparse set of link configurations
//  (SceneLink). Parameters not linked inherit from the
//  terminal state of the previous scene.
// ═══════════════════════════════════════════════════════════════

import { EASING_FUNCTIONS, EASING_KEYS } from './easing.js';

// ── Defaults ─────────────────────────────────────────────────

const DEFAULT_DURATION = 10;   // seconds
const DEFAULT_EASING = 'linear';
const MIN_DURATION = 0.1;
const MAX_DURATION = 600;

let _idCounter = 0;

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `scene_${++_idCounter}_${Date.now()}`;
}

// ── SceneLink ────────────────────────────────────────────────

/**
 * Create a scene link (a parameter animation track within a scene).
 *
 * @param {string} path      - dot-path, e.g. 'T', 'camera.position.z'
 * @param {number} baseValue - start value (forced from prior scene on playback)
 * @param {number} endValue  - end value (user-authored)
 * @param {number} [direction=1] - 1 (forward) or -1 (reverse)
 * @returns {SceneLink}
 */
export function createSceneLink(path, baseValue, endValue, direction = 1) {
  return {
    path: String(path),
    baseValue: Number.isFinite(baseValue) ? baseValue : 0,
    endValue: Number.isFinite(endValue) ? endValue : 0,
    direction: direction === -1 ? -1 : 1,
  };
}

// ── Scene ────────────────────────────────────────────────────

/**
 * Create a new scene.
 *
 * @param {Object} [opts]
 * @param {string} [opts.name]
 * @param {number} [opts.duration]
 * @param {string} [opts.easing]
 * @param {SceneLink[]} [opts.links]
 * @returns {Scene}
 */
export function createScene(opts = {}) {
  const duration = Number.isFinite(opts.duration)
    ? Math.max(MIN_DURATION, Math.min(MAX_DURATION, opts.duration))
    : DEFAULT_DURATION;

  const easing = EASING_KEYS.includes(opts.easing) ? opts.easing : DEFAULT_EASING;

  return {
    id: generateId(),
    name: typeof opts.name === 'string' && opts.name.trim() ? opts.name.trim() : 'Scene',
    duration,
    easing,
    links: Array.isArray(opts.links) ? opts.links.map(l => ({ ...l })) : [],
    snapshot: null,  // cached full state at scene start, rebuilt on playback
  };
}

// ── Timeline ─────────────────────────────────────────────────

/**
 * Create a new timeline.
 *
 * @returns {Timeline}
 */
export function createTimeline() {
  return {
    scenes: [createScene({ name: 'Scene 1' })],
    loop: false,
    activeSceneIndex: 0,
  };
}

// ── Scene CRUD ───────────────────────────────────────────────

/**
 * Add a scene to the timeline after the given index (or at end).
 * Auto-names incrementally.
 *
 * @param {Timeline} timeline
 * @param {Object} [opts] - options passed to createScene
 * @param {number} [afterIndex] - insert after this index; default: end
 * @returns {Scene} the new scene
 */
export function addScene(timeline, opts = {}, afterIndex) {
  const idx = Number.isFinite(afterIndex)
    ? Math.max(0, Math.min(afterIndex + 1, timeline.scenes.length))
    : timeline.scenes.length;

  const name = opts.name || `Scene ${timeline.scenes.length + 1}`;
  const scene = createScene({ ...opts, name });
  timeline.scenes.splice(idx, 0, scene);
  return scene;
}

/**
 * Delete a scene by id. Cannot delete the last remaining scene.
 *
 * @param {Timeline} timeline
 * @param {string} sceneId
 * @returns {boolean} true if deleted
 */
export function deleteScene(timeline, sceneId) {
  if (timeline.scenes.length <= 1) return false;
  const idx = timeline.scenes.findIndex(s => s.id === sceneId);
  if (idx < 0) return false;
  timeline.scenes.splice(idx, 1);
  // Fix activeSceneIndex
  if (timeline.activeSceneIndex >= timeline.scenes.length) {
    timeline.activeSceneIndex = timeline.scenes.length - 1;
  }
  return true;
}

/**
 * Reorder a scene from one index to another.
 *
 * @param {Timeline} timeline
 * @param {number} fromIndex
 * @param {number} toIndex
 * @returns {boolean} true if moved
 */
export function reorderScene(timeline, fromIndex, toIndex) {
  const len = timeline.scenes.length;
  if (fromIndex < 0 || fromIndex >= len || toIndex < 0 || toIndex >= len) return false;
  if (fromIndex === toIndex) return false;
  const [scene] = timeline.scenes.splice(fromIndex, 1);
  timeline.scenes.splice(toIndex, 0, scene);
  // Track active scene
  if (timeline.activeSceneIndex === fromIndex) {
    timeline.activeSceneIndex = toIndex;
  } else if (fromIndex < timeline.activeSceneIndex && toIndex >= timeline.activeSceneIndex) {
    timeline.activeSceneIndex--;
  } else if (fromIndex > timeline.activeSceneIndex && toIndex <= timeline.activeSceneIndex) {
    timeline.activeSceneIndex++;
  }
  return true;
}

/**
 * Get a scene by id.
 *
 * @param {Timeline} timeline
 * @param {string} sceneId
 * @returns {Scene|null}
 */
export function getScene(timeline, sceneId) {
  return timeline.scenes.find(s => s.id === sceneId) || null;
}

/**
 * Get the currently active (selected) scene.
 *
 * @param {Timeline} timeline
 * @returns {Scene}
 */
export function getActiveScene(timeline) {
  return timeline.scenes[timeline.activeSceneIndex] || timeline.scenes[0];
}

// ── Track (SceneLink) CRUD within a scene ────────────────────

/**
 * Add a link to a scene. If the path already exists, updates it.
 *
 * @param {Scene} scene
 * @param {string} path
 * @param {number} baseValue
 * @param {number} endValue
 * @param {number} [direction=1]
 * @returns {SceneLink}
 */
export function addTrack(scene, path, baseValue, endValue, direction = 1) {
  const existing = scene.links.find(l => l.path === path);
  if (existing) {
    existing.baseValue = Number.isFinite(baseValue) ? baseValue : existing.baseValue;
    existing.endValue = Number.isFinite(endValue) ? endValue : existing.endValue;
    existing.direction = direction === -1 ? -1 : 1;
    return existing;
  }
  const link = createSceneLink(path, baseValue, endValue, direction);
  scene.links.push(link);
  return link;
}

/**
 * Remove a link from a scene by path.
 *
 * @param {Scene} scene
 * @param {string} path
 * @returns {boolean} true if removed
 */
export function removeTrack(scene, path) {
  const idx = scene.links.findIndex(l => l.path === path);
  if (idx < 0) return false;
  scene.links.splice(idx, 1);
  return true;
}

/**
 * Get a link from a scene by path.
 *
 * @param {Scene} scene
 * @param {string} path
 * @returns {SceneLink|null}
 */
export function getTrack(scene, path) {
  return scene.links.find(l => l.path === path) || null;
}

// ── Timeline time computation ────────────────────────────────

/**
 * Compute total timeline duration in seconds.
 *
 * @param {Timeline} timeline
 * @returns {number}
 */
export function totalDuration(timeline) {
  let total = 0;
  for (const scene of timeline.scenes) {
    total += Math.max(MIN_DURATION, scene.duration);
  }
  return total;
}

/**
 * Compute cumulative start times for each scene.
 *
 * @param {Timeline} timeline
 * @returns {number[]} start time for each scene index
 */
export function sceneStartTimes(timeline) {
  const starts = [];
  let t = 0;
  for (const scene of timeline.scenes) {
    starts.push(t);
    t += Math.max(MIN_DURATION, scene.duration);
  }
  return starts;
}

/**
 * Find the active scene index and local progress for a given absolute time.
 *
 * @param {Timeline} timeline
 * @param {number} absoluteTime - seconds from timeline start
 * @returns {{ sceneIndex: number, localProgress: number, sceneTime: number }}
 */
export function resolveTimePosition(timeline, absoluteTime) {
  const t = Math.max(0, Number.isFinite(absoluteTime) ? absoluteTime : 0);
  let cumulative = 0;

  for (let i = 0; i < timeline.scenes.length; i++) {
    const dur = Math.max(MIN_DURATION, timeline.scenes[i].duration);
    if (t < cumulative + dur) {
      const sceneTime = t - cumulative;
      return {
        sceneIndex: i,
        localProgress: Math.min(sceneTime / dur, 1),
        sceneTime,
      };
    }
    cumulative += dur;
  }

  // Past end → last scene at t=1
  return {
    sceneIndex: timeline.scenes.length - 1,
    localProgress: 1,
    sceneTime: Math.max(MIN_DURATION, timeline.scenes[timeline.scenes.length - 1].duration),
  };
}

// ── Snapshot building (scene inheritance) ─────────────────────

/**
 * Read a dot-path value from a flat or nested state object.
 *
 * @param {Object} state
 * @param {string} path - e.g. 'T', 'camera.position.z', 'cinematic.bloom.strength'
 * @returns {*}
 */
export function readPath(state, path) {
  const parts = path.split('.');
  let cursor = state;
  for (const part of parts) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

/**
 * Write a dot-path value into a flat or nested state object.
 * Creates intermediate objects if needed.
 *
 * @param {Object} state
 * @param {string} path
 * @param {*} value
 */
export function writePath(state, path, value) {
  const parts = path.split('.');
  let cursor = state;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cursor[parts[i]] == null || typeof cursor[parts[i]] !== 'object') {
      cursor[parts[i]] = {};
    }
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}

/**
 * Build scene snapshots for playback.
 * Each scene's snapshot = terminal state of the previous scene.
 * Scene[0]'s snapshot = the provided initial state.
 *
 * Also forces each scene's link baseValues from the snapshot.
 *
 * @param {Timeline} timeline
 * @param {Object} initialState - full state snapshot at timeline start
 */
export function buildSceneSnapshots(timeline, initialState) {
  // Deep clone initial state for Scene 0
  let currentSnapshot = JSON.parse(JSON.stringify(initialState));
  timeline.scenes[0].snapshot = currentSnapshot;

  // Force Scene 0's link bases from initial state
  for (const link of timeline.scenes[0].links) {
    const currentValue = readPath(currentSnapshot, link.path);
    if (Number.isFinite(currentValue)) {
      link.baseValue = currentValue;
    }
  }

  // Build subsequent scenes
  for (let i = 1; i < timeline.scenes.length; i++) {
    // Compute terminal state of previous scene:
    // start from prev snapshot, apply all prev links at t=1 (endValues)
    const prevTerminal = JSON.parse(JSON.stringify(timeline.scenes[i - 1].snapshot));
    for (const link of timeline.scenes[i - 1].links) {
      writePath(prevTerminal, link.path, link.endValue);
    }

    timeline.scenes[i].snapshot = prevTerminal;

    // Force this scene's link bases from the inherited snapshot
    for (const link of timeline.scenes[i].links) {
      const inherited = readPath(prevTerminal, link.path);
      if (Number.isFinite(inherited)) {
        link.baseValue = inherited;
      }
    }
  }
}

/**
 * Compute the terminal (end) state of the entire timeline.
 *
 * @param {Timeline} timeline
 * @returns {Object|null} terminal state, or null if no snapshots built
 */
export function computeTerminalState(timeline) {
  const last = timeline.scenes[timeline.scenes.length - 1];
  if (!last || !last.snapshot) return null;
  const terminal = JSON.parse(JSON.stringify(last.snapshot));
  for (const link of last.links) {
    writePath(terminal, link.path, link.endValue);
  }
  return terminal;
}

// ── Capture current state into a scene ───────────────────────

/**
 * Capture current live state as tracks for a scene.
 * For each given path, sets endValue to the current live value.
 * baseValue is left as-is (will be forced on playback).
 *
 * @param {Scene} scene
 * @param {Object} liveState - current state object
 * @param {string[]} paths - paths to capture
 */
export function captureCurrentState(scene, liveState, paths) {
  for (const path of paths) {
    const value = readPath(liveState, path);
    if (!Number.isFinite(value)) continue;
    const existing = scene.links.find(l => l.path === path);
    if (existing) {
      existing.endValue = value;
    } else {
      scene.links.push(createSceneLink(path, value, value));
    }
  }
}

// ── Serialization ────────────────────────────────────────────

/**
 * Serialize a timeline to a self-contained JSON-safe object.
 * Includes the initial state snapshot for deterministic restore.
 *
 * @param {Timeline} timeline
 * @param {Object} [initialState] - initial state to include
 * @returns {Object}
 */
export function serializeTimeline(timeline, initialState = null) {
  return {
    version: 1,
    initialState: initialState ? JSON.parse(JSON.stringify(initialState)) : null,
    loop: timeline.loop,
    activeSceneIndex: timeline.activeSceneIndex,
    scenes: timeline.scenes.map(scene => ({
      id: scene.id,
      name: scene.name,
      duration: scene.duration,
      easing: scene.easing,
      links: scene.links.map(l => ({
        path: l.path,
        baseValue: l.baseValue,
        endValue: l.endValue,
        direction: l.direction,
      })),
    })),
  };
}

/**
 * Deserialize a timeline from a JSON-safe object.
 *
 * @param {Object} data
 * @returns {{ timeline: Timeline, initialState: Object|null }}
 */
export function deserializeTimeline(data) {
  if (!data || !Array.isArray(data.scenes) || data.scenes.length === 0) {
    return { timeline: createTimeline(), initialState: null };
  }

  const timeline = {
    scenes: data.scenes.map(s => createScene({
      name: s.name,
      duration: s.duration,
      easing: s.easing,
      links: Array.isArray(s.links) ? s.links.map(l => createSceneLink(
        l.path, l.baseValue, l.endValue, l.direction
      )) : [],
    })),
    loop: data.loop === true,
    activeSceneIndex: 0,
  };

  // Restore scene IDs if present
  for (let i = 0; i < timeline.scenes.length; i++) {
    if (data.scenes[i].id) {
      timeline.scenes[i].id = data.scenes[i].id;
    }
  }

  // Restore active index
  if (Number.isFinite(data.activeSceneIndex) && data.activeSceneIndex >= 0 && data.activeSceneIndex < timeline.scenes.length) {
    timeline.activeSceneIndex = data.activeSceneIndex;
  }

  const initialState = data.initialState ? JSON.parse(JSON.stringify(data.initialState)) : null;

  return { timeline, initialState };
}

// ── LocalStorage persistence ─────────────────────────────────

const LS_KEY = 'tau-atlas-timeline';

/**
 * Save timeline to localStorage.
 *
 * @param {Timeline} timeline
 * @param {Object} [initialState]
 */
export function saveToLocalStorage(timeline, initialState = null) {
  try {
    const serialized = serializeTimeline(timeline, initialState);
    localStorage.setItem(LS_KEY, JSON.stringify(serialized));
  } catch (e) {
    console.warn('[scene-data] Failed to save timeline to localStorage:', e);
  }
}

/**
 * Load timeline from localStorage.
 *
 * @returns {{ timeline: Timeline, initialState: Object|null }|null}
 */
export function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return deserializeTimeline(data);
  } catch (e) {
    console.warn('[scene-data] Failed to load timeline from localStorage:', e);
    return null;
  }
}

// ── Constants ────────────────────────────────────────────────

export { MIN_DURATION, MAX_DURATION, DEFAULT_DURATION, DEFAULT_EASING };

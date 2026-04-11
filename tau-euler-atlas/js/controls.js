import { TAU, clamp } from './complex.js';
import {
  computeProofPayloadFromState,
  generateAllPoints,
  generateAlphaTrace,
  generateAtlasPaths,
  generateTauTrace,
  setPointBudget,
} from './generators.js';
import {
  buildDerivedState,
  applyDerivedState,
} from './derivation.js';
import {
  defaultExpressionModel,
  resolveFunctionTriState,
  normalizeExpressionModel,
  resolveExponentTriState,
  setFunctionNodeEnabledWithAncestors,
  setExponentSubtreeEnabled,
  setVariantNodeEnabledWithAncestors,
} from './expression-model.js';
import {
  EXPONENT_FAMILIES,
  VARIANT_DEFINITIONS,
  getFunctionNodesByExponent,
  registryCoverageSummary,
} from './function-registry.js';
import * as sceneApi from './scene.js';
import { animation } from './animation.js';
import {
  PlaybackPrecomputeBuffer,
  PRECOMPUTE_FPS,
  resolvePrecomputeBufferFrames,
  computePrefillMinDepth,
  computeBufferProgress,
  clampBufferTargetByMemory,
  computeAdaptiveBuildBudget,
  sanitizeBufferPhase,
  DEFAULT_BUFFER_MAX_BYTES,
} from './playback-buffer.js';
import {
  applyTraversalCommit,
  applyZRangeCommit,
  computeTraversalTBounds,
  normalizeInputText,
  parseNumericInput,
  resolveCommittedValue,
} from './controls-commit.js';
import {
  getTheme,
  getRenderMode,
  getViewMode,
  setTheme,
  setRenderMode,
  setViewMode,
  toggleCollapse,
  setCollapsed,
  isCollapsed,
  isPerformance,
} from './modes.js';
import {
  defaultCinematicFx,
  resolveEffectiveCinematicFx,
  resolveStyleBloomGain,
} from './cinematic-fx.js';
import {
  isLinkEligiblePath,
} from './linked-params.js';
import { createLinkEngine } from './link-engine.js';
import * as audioPlayer from './audio-player.js';
import { createSceneManager } from './scene-manager.js';
import {
  createTimeline,
  totalDuration as timelineTotalDuration,
  loadFromLocalStorage as loadTimelineFromLS,
  saveToLocalStorage as saveTimelineToLS,
  addTrackToAllScenes,
  removeTrackFromAllScenes,
} from './scene-data.js';
import { initTimelinePanel } from './timeline-panel.js';

const updatePointCloud = sceneApi.updatePointCloud;
const updateStrandPaths = sceneApi.updateStrandPaths;
const updateAtlasPaths = sceneApi.updateAtlasPaths;
const updateGhostTraces = sceneApi.updateGhostTraces;
const updateOrbitCircle = sceneApi.updateOrbitCircle;
const setReferenceCirclesVisible = typeof sceneApi.setReferenceCirclesVisible === 'function'
  ? sceneApi.setReferenceCirclesVisible
  : () => {};
const setReferenceOpacity = typeof sceneApi.setReferenceOpacity === 'function' ? sceneApi.setReferenceOpacity : () => {};
const setGridVisible = typeof sceneApi.setGridVisible === 'function'
  ? sceneApi.setGridVisible
  : () => {};
const setGridOpacity = typeof sceneApi.setGridOpacity === 'function' ? sceneApi.setGridOpacity : () => {};
const setOrbitOpacity = typeof sceneApi.setOrbitOpacity === 'function' ? sceneApi.setOrbitOpacity : () => {};
const setGhostOpacity = typeof sceneApi.setGhostOpacity === 'function' ? sceneApi.setGhostOpacity : () => {};
const setThemeBlend = typeof sceneApi.setThemeBlend === 'function' ? sceneApi.setThemeBlend : () => {};
const setBloomEnabled = sceneApi.setBloomEnabled;
const setBloomStrength = sceneApi.setBloomStrength;
const setBloomRadius = sceneApi.setBloomRadius;
const setBloomThreshold = sceneApi.setBloomThreshold;
const setToneEnabled = sceneApi.setToneEnabled;
const setToneExposure = sceneApi.setToneExposure;
const setFogEnabled = sceneApi.setFogEnabled;
const setFogDensity = sceneApi.setFogDensity;
const setStarVisibility = sceneApi.setStarVisibility;
const setStarOpacity = sceneApi.setStarOpacity;
const setStarMotion = sceneApi.setStarMotion;
const setHeavyEffectsSuspended = sceneApi.setHeavyEffectsSuspended;
const getCurrentFps = sceneApi.getCurrentFps;
const resetCamera = sceneApi.resetCamera;
const captureScreenshot = sceneApi.captureScreenshot;
const setExternalUpdate = sceneApi.setExternalUpdate;
const getCameraPanelSnapshot = typeof sceneApi.getCameraPanelSnapshot === 'function'
  ? sceneApi.getCameraPanelSnapshot
  : () => null;
const setCameraPanelField = typeof sceneApi.setCameraPanelField === 'function'
  ? sceneApi.setCameraPanelField
  : () => null;
const onCameraPanelChange = typeof sceneApi.onCameraPanelChange === 'function'
  ? sceneApi.onCameraPanelChange
  : () => () => {};

export const state = {
  T: 2,
  T_lowerBound: 1.99999,
  T_upperBound: 2,
  timeMode: 'step',
  stepLoopMode: 'clamp',
  b: 36000000,
  syncTStepToS: true,
  precomputeBufferUnit: 'frames',
  precomputeBufferValue: 24,
  precomputeBufferFrames: 24,
  bufferEnabled: false,
  bufferPhase: 'idle',
  bufferProgress: 0,
  bufferTargetFrames: 24,
  bufferNotice: '',

  Z_min: 0,
  Z_max: 710,
  pathBudget: 500,

  l_base: 10,
  l_func: 10,
  kStepsInAlignmentsBool: 1,
  formulaMode: 'tau',

  q_scale: 1,
  q_scale_b: 1000,
  q_tauScale: 0,
  q_bool: 0,
  q_correction: 0,
  k2: 1,
  k3: 1,

  P: 1,
  P1: 1,
  eProof: NaN,
  alpha: TAU,
  showAlpha: true,
  hudPanelOpen: false,
  autoHidePanels: false,
  cameraPanelOpen: false,
  cameraPanel: {
    viewMode: '3d',
    cameraType: 'perspective',
    rotateEnabled: true,
    position: { x: 0, y: 0, z: 5 },
    target: { x: 0, y: 0, z: 0 },
    orbit: {
      dampingFactor: 0.07,
      rotateSpeed: 0.5,
      zoomSpeed: 0.8,
      panSpeed: 1,
      minDistance: 0.5,
      maxDistance: 350,
    },
    lens: {
      fov: 70,
      zoom: 1,
      near: 0.01,
      far: 2000,
    },
    distance: 5,
  },
  proofPanelOpen: false,
  proofResults: null,

  expressionModel: defaultExpressionModel(),
  cinematicFx: defaultCinematicFx(),
  themeBlend: 0,
  visualHelpers: {
    referenceRings: false, referenceOpacity: 0.5,
    orbitRing: false, orbitOpacity: 0.4,
    grid: false, gridOpacity: 0.6,
  },
};

const functionControlUiState = {
  selectedExponent: EXPONENT_FAMILIES[0].key,
  selectedFunction: null,
  selectedVariant: null,
};

const ICON_EYE = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M1.5 12s3.8-7 10.5-7 10.5 7 10.5 7-3.8 7-10.5 7S1.5 12 1.5 12Z"></path>
    <circle cx="12" cy="12" r="3.2"></circle>
  </svg>
`;

const ICON_EYE_OFF = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M1.5 12s3.8-7 10.5-7c2 0 3.8.6 5.4 1.5"></path>
    <path d="M22.5 12s-3.8 7-10.5 7c-2 0-3.8-.6-5.4-1.5"></path>
    <path d="M3 3l18 18"></path>
  </svg>
`;

const ICON_EYE_MIXED = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M1.5 12s3.8-7 10.5-7 10.5 7 10.5 7-3.8 7-10.5 7S1.5 12 1.5 12Z" opacity="0.4"></path>
    <circle cx="12" cy="12" r="3.2" opacity="0.4"></circle>
    <path d="M2 2l20 20"></path>
  </svg>
`;

const ICON_LINK = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M10 14l4-4"></path>
    <path d="M7.5 16.5l-2 2a3 3 0 0 1-4.2-4.2l3-3a3 3 0 0 1 4.2 0"></path>
    <path d="M16.5 7.5l2-2a3 3 0 0 1 4.2 4.2l-3 3a3 3 0 0 1-4.2 0"></path>
  </svg>
`;

const ICON_UNLINK = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M10 14l4-4"></path>
    <path d="M3 3l18 18"></path>
  </svg>
`;

const ICON_DIR_FWD = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h12"></path>
    <path d="M13 8l4 4-4 4"></path>
  </svg>
`;

const ICON_DIR_REV = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M19 12H7"></path>
    <path d="M11 16l-4-4 4-4"></path>
  </svg>
`;

const ICON_BOUNDS = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 8l5-5 5 5"></path>
    <path d="M7 16l5 5 5-5"></path>
  </svg>
`;

let regenerateTimeout = null;
let controlsContainer = null;
let cameraContainer = null;
let proofsContainer = null;
let _lastFrameMs = performance.now();
let _stepBounceDir = 1;
let _bufferGenerationToken = 0;
const MAX_BUFFER_BYTES = DEFAULT_BUFFER_MAX_BYTES;
let _timelineHiddenByAutoHide = false;

function hideTimelineForAutoHide() {
  const pnl = document.getElementById('timeline-panel');
  if (pnl && pnl.dataset.visible === 'true') {
    pnl.dataset.visible = 'false';
    document.body.dataset.timelineState = 'hidden';
    document.body.classList.remove('tl-open');
    _timelineHiddenByAutoHide = true;
  } else {
    _timelineHiddenByAutoHide = false;
  }
}

function restoreTimelineForAutoHide() {
  if (_timelineHiddenByAutoHide) {
    const pnl = document.getElementById('timeline-panel');
    if (pnl) {
      pnl.dataset.visible = 'true';
      document.body.dataset.timelineState = 'expanded';
      document.body.classList.add('tl-open');
    }
    _timelineHiddenByAutoHide = false;
  }
}

const sliderUiSyncFns = [];
const sliderBoundsSyncFns = [];
const cameraSliderUiSyncFns = [];
const cameraSliderBoundsSyncFns = [];
const playbackBuffer = new PlaybackPrecomputeBuffer();
let lastMathSignature = '';
let lastProofSignature = '';
let _expressionModelGen = 0;  // bumped when expressionModel mutates
let pendingRenderPayload = null;
let cameraPanelUnsubscribe = null;
const activeLinkedPaths = new Set();
const activeCameraLinkedPaths = new Set();
const DEBUG_CAMERA_LINKS = false;
const linkEngine = createLinkEngine({
  debug: DEBUG_CAMERA_LINKS,
  debugFilter: (path) => String(path).startsWith('camera.'),
});

// ── Scene Timeline ─────────────────────────────────────────
const sceneManager = createSceneManager({
  animation,
  getState: () => state,
  onTrackUpdate: (path, value) => {
    // Push camera path updates to active camera automatically during playback
    if (String(path).startsWith('camera.')) {
      setCameraFieldFromUi(path.replace('camera.', ''), value);
    }
    // Apply theme blend in real-time during playback
    if (path === 'themeBlend') {
      setTheme(value);
      setThemeBlend(value);
    }
  },
  onSceneChange: (idx, scene) => {
    console.debug('[scene-timeline] scene', idx, scene.name);
  },
});

// Initialize with a default timeline (or restore from localStorage)
(function _initTimeline() {
  const saved = loadTimelineFromLS();
  if (saved && saved.timeline) {
    sceneManager.setTimeline(saved.timeline);
  } else {
    sceneManager.setTimeline(createTimeline());
  }
})();

/** Auto-save timeline to localStorage on changes. */
export function autoSaveTimeline() {
  const tl = sceneManager.getTimeline();
  if (tl) saveTimelineToLS(tl);
}



function decimalsForStep(step) {
  if (!Number.isFinite(step) || step >= 1) return 0;
  const s = String(step);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  const dot = s.indexOf('.');
  return dot >= 0 ? (s.length - dot - 1) : 0;
}

function refreshSliderBounds() {
  for (const sync of sliderBoundsSyncFns) sync();
}

function refreshCameraSliderBounds() {
  for (const sync of cameraSliderBoundsSyncFns) sync();
}

function syncCameraSliderUi() {
  for (const sync of cameraSliderUiSyncFns) sync();
}

function pushCommitStatus(row, status) {
  row.dataset.commitStatus = status;
  if (row._commitStatusTimer) clearTimeout(row._commitStatusTimer);
  row._commitStatusTimer = setTimeout(() => {
    if (row.dataset.commitStatus === status) row.dataset.commitStatus = '';
  }, 700);
}

export function deriveState() {
  if (sceneManager.isPlaying()) {
    // Timeline playback: scene manager writes directly to state, no link engine
    sceneManager.resolve();
  }
  return applyDerivedState(state);
}

/** Expose the scene manager for the timeline panel UI. */
export function getSceneManager() { return sceneManager; }
export { linkEngine };

function getTSliderStep() {
  if (!state.syncTStepToS) return 0.00001;
  const s = Math.abs(Number.isFinite(state.s) ? state.s : 0.00001);
  return clamp(s, 0.000001, 0.1);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function getCameraField(path) {
  const parts = String(path).split('.');
  let cursor = state.cameraPanel;
  for (const p of parts) {
    if (!cursor || typeof cursor !== 'object') return NaN;
    cursor = cursor[p];
  }
  return Number(cursor);
}

function applyCameraSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;
  const cam = state.cameraPanel;
  cam.viewMode = snapshot.viewMode === '2d' ? '2d' : '3d';
  cam.cameraType = String(snapshot.cameraType || (cam.viewMode === '2d' ? 'orthographic' : 'perspective'));
  cam.rotateEnabled = !!snapshot.rotateEnabled;

  cam.position.x = Number(snapshot.position?.x ?? cam.position.x);
  cam.position.y = Number(snapshot.position?.y ?? cam.position.y);
  cam.position.z = Number(snapshot.position?.z ?? cam.position.z);

  cam.target.x = Number(snapshot.target?.x ?? cam.target.x);
  cam.target.y = Number(snapshot.target?.y ?? cam.target.y);
  cam.target.z = Number(snapshot.target?.z ?? cam.target.z);

  cam.orbit.dampingFactor = Number(snapshot.orbit?.dampingFactor ?? cam.orbit.dampingFactor);
  cam.orbit.rotateSpeed = Number(snapshot.orbit?.rotateSpeed ?? cam.orbit.rotateSpeed);
  cam.orbit.zoomSpeed = Number(snapshot.orbit?.zoomSpeed ?? cam.orbit.zoomSpeed);
  cam.orbit.panSpeed = Number(snapshot.orbit?.panSpeed ?? cam.orbit.panSpeed);
  cam.orbit.minDistance = Number(snapshot.orbit?.minDistance ?? cam.orbit.minDistance);
  cam.orbit.maxDistance = Number(snapshot.orbit?.maxDistance ?? cam.orbit.maxDistance);

  if (Number.isFinite(snapshot.lens?.fov)) cam.lens.fov = Number(snapshot.lens.fov);
  if (Number.isFinite(snapshot.lens?.zoom)) cam.lens.zoom = Number(snapshot.lens.zoom);
  cam.lens.near = Number(snapshot.lens?.near ?? cam.lens.near);
  cam.lens.far = Number(snapshot.lens?.far ?? cam.lens.far);
  cam.distance = Number(snapshot.distance ?? cam.distance);
}

function updateCameraPanelReadouts() {
  setText('camera-view-display', state.cameraPanel.viewMode.toUpperCase());
  setText('camera-type-display', state.cameraPanel.cameraType);
  setText('camera-rotate-display', state.cameraPanel.rotateEnabled ? 'on' : 'off');
}

function setCameraFieldFromUi(path, value) {
  const snapshot = setCameraPanelField(path, value, { source: 'ui' });
  if (snapshot) applyCameraSnapshot(snapshot);
  updateCameraPanelReadouts();
}

function emptyPointCloudData() {
  return {
    positions: new Float32Array(0),
    colors: new Float32Array(0),
    sizes: new Float32Array(0),
    count: 0,
    meta: null,
    budget: 0,
  };
}

function normalizeVisualHelpers() {
  if (!state.visualHelpers || typeof state.visualHelpers !== 'object') {
    state.visualHelpers = { referenceRings: false, orbitRing: false, grid: false };
    return;
  }
  if (typeof state.visualHelpers.referenceRings !== 'boolean') {
    state.visualHelpers.referenceRings = false;
  }
  if (typeof state.visualHelpers.orbitRing !== 'boolean') {
    state.visualHelpers.orbitRing = false;
  }
  if (typeof state.visualHelpers.grid !== 'boolean') {
    state.visualHelpers.grid = false;
  }
}

function computePointBudget() {
  return isPerformance() ? 50_000 : 200_000;
}

function getEffectiveFx() {
  return resolveEffectiveCinematicFx(state.cinematicFx, {
    renderMode: getRenderMode(),
    theme: getTheme(),
  });
}

function applyVisualHelpers() {
  normalizeVisualHelpers();
  const masterOn = state.cinematicFx.master.enabled;
  sceneApi.setGridOpacity(state.visualHelpers.grid ? state.visualHelpers.gridOpacity : 0);
  sceneApi.setReferenceOpacity(masterOn && state.visualHelpers.referenceRings ? state.visualHelpers.referenceOpacity : 0);
  sceneApi.setOrbitOpacity(masterOn && state.visualHelpers.orbitRing ? state.visualHelpers.orbitOpacity : 0);
  updateOrbitCircle(masterOn && state.visualHelpers.orbitRing ? state.k : NaN);
}

function computeMathSignature(derived, budget) {
  const renderMode = getRenderMode();
  const theme = getTheme();
  const fx = getEffectiveFx();
  const styleBloomGain = resolveStyleBloomGain({ renderMode, theme });
  const ptsVis = !!(fx.points.enabled && fx.points.opacity > 0.001);
  const lnVis  = !!(fx.atlasLines.enabled && fx.atlasLines.opacity > 0.001);
  const ghVis  = !!fx.ghostTraces.enabled;
  // Fast delimited string — avoids JSON.stringify overhead per frame
  return [
    budget, renderMode, theme, styleBloomGain,
    derived.T_lowerBound, derived.T_upperBound,
    derived.Z, derived.Z_min, derived.Z_max,
    derived.formulaMode, derived.pathBudget,
    derived.l_base, derived.l_func,
    derived.kStepsInAlignmentsBool,
    derived.q_scale, derived.q_tauScale,
    derived.q_bool, derived.q_correction,
    derived.k2, derived.k3,
    derived.alpha, derived.P, derived.b,
    derived.stepLoopMode, derived.syncTStepToS,
    derived.precomputeBufferFrames,
    _expressionModelGen,
    ptsVis, lnVis, ghVis,
    !!state.visualHelpers?.referenceRings,
    !!state.visualHelpers?.orbitRing,
  ].join('|');
}

function buildRenderPayload(derived, budget, signature, fx) {
  const styleBloomGain = resolveStyleBloomGain({
    renderMode: getRenderMode(),
    theme: getTheme(),
  });
  const renderParams = { ...derived, styleBloomGain };
  const expressionEnabled = !!renderParams.expressionModel?.parent?.enabled;
  const pointsVisible = !!(fx.points.enabled && fx.points.opacity > 0.001);
  const linesVisible = !!(fx.atlasLines.enabled && fx.atlasLines.opacity > 0.001);
  const ghostsVisible = !!fx.ghostTraces.enabled;
  const shouldComputePoints = expressionEnabled && pointsVisible;
  const shouldComputeLines = expressionEnabled && linesVisible;
  const shouldComputeGhosts = expressionEnabled && ghostsVisible;
  setPointBudget(budget);
  const points = shouldComputePoints ? generateAllPoints(renderParams) : emptyPointCloudData();
  const atlasPaths = shouldComputeLines ? generateAtlasPaths(renderParams) : [];

  const alphaNotTau = Math.abs(derived.alpha - TAU) > 0.001;
  const tauTrace = shouldComputeGhosts ? generateTauTrace(256, derived.k) : null;
  const alphaTrace = shouldComputeGhosts && alphaNotTau
    ? generateAlphaTrace(derived.alpha, 256, derived.k)
    : null;

  return {
    signature,
    derived,
    points,
    atlasPaths,
    tauTrace,
    alphaTrace,
    showAlpha: shouldComputeGhosts && alphaNotTau,
    bounceDir: _stepBounceDir,
  };
}

function getRequestedBufferFrames(derived = state) {
  return Math.max(1, Math.floor(
    Number.isFinite(derived.precomputeBufferFrames)
      ? derived.precomputeBufferFrames
      : (Number.isFinite(derived.precomputeBufferValue) ? derived.precomputeBufferValue : 24),
  ));
}

function applyBufferTargetWithMemoryGuard(derived = state) {
  const requested = getRequestedBufferFrames(derived);
  const guarded = clampBufferTargetByMemory(requested, playbackBuffer.lastPayloadBytes, MAX_BUFFER_BYTES);
  state.bufferTargetFrames = guarded.targetFrames;
  playbackBuffer.setTargetFrames(guarded.targetFrames);
  state.bufferNotice = guarded.reduced
    ? `memory cap ${guarded.targetFrames}/${requested}`
    : '';
  return guarded.targetFrames;
}

function setBufferPhase(phase) {
  const next = sanitizeBufferPhase(phase);
  state.bufferPhase = next;
  if (next === 'idle') state.bufferProgress = 0;
  if (next === 'background') state.bufferProgress = 1;
  setHeavyEffectsSuspended(state.bufferEnabled && next === 'prefill');
}

function beginHardPrefill(derived, signature, reason = 'prefill', resetStats = false) {
  _bufferGenerationToken += 1;
  applyBufferTargetWithMemoryGuard(derived);
  playbackBuffer.reseed({
    T: derived.T,
    bounceDir: _stepBounceDir,
    signature,
    resetStats,
  });
  setBufferPhase('prefill');
  state.bufferProgress = 0;
  state.bufferNotice = reason ? `${reason}${state.bufferNotice ? ` | ${state.bufferNotice}` : ''}` : state.bufferNotice;
  updateBufferStatus();
  return _bufferGenerationToken;
}

function updateBufferStatus() {
  const target = Math.max(1, Math.floor(Number.isFinite(state.bufferTargetFrames) ? state.bufferTargetFrames : 1));
  const phase = sanitizeBufferPhase(state.bufferPhase);
  const depth = playbackBuffer.depth;
  const mode = state.bufferEnabled ? 'ON' : 'OFF';
  const pct = state.bufferEnabled
    ? Math.round(clamp(state.bufferProgress, 0, 1) * 100)
    : 0;
  const body = state.bufferEnabled
    ? `${mode} ${phase} ${depth}/${target} ${pct}% h:${playbackBuffer.hits} m:${playbackBuffer.misses}`
    : `${mode} live`;
  const text = state.bufferNotice ? `${body} | ${state.bufferNotice}` : body;
  setText('buffer-status-panel', text);
  setText('buffer-status-display', text);
  setText('buffer-mode-display', mode);
  setText('buffer-mode-display-hud', mode);

  const overlay = document.getElementById('buffer-overlay');
  if (overlay) {
    const active = state.bufferEnabled && phase === 'prefill';
    overlay.classList.toggle('active', active);
    overlay.setAttribute('aria-hidden', active ? 'false' : 'true');
    const hint = active ? ' Â· quality mode active' : '';
    setText('buffer-overlay-detail', `depth ${depth}/${target} Â· ${pct}%${hint}`);
  }
}

function applyRenderPayload(payload, fx) {
  Object.assign(state, payload.derived);
  normalizeVisualHelpers();

  const suspendHeavy = state.bufferEnabled && state.bufferPhase === 'prefill';
  setBloomEnabled(!suspendHeavy && fx.bloom.enabled);
  setBloomStrength(suspendHeavy ? 0 : fx.bloom.strength);
  setBloomRadius(suspendHeavy ? 0 : fx.bloom.radius);
  setBloomThreshold(fx.bloom.threshold);
  setToneEnabled(fx.tone.enabled);
  setToneExposure(fx.tone.exposure);
  setFogEnabled(!suspendHeavy && fx.fog.enabled);
  setFogDensity(suspendHeavy ? 0 : fx.fog.density);
  setStarVisibility(!suspendHeavy && fx.stars.enabled);
  setStarOpacity(suspendHeavy ? 0 : fx.stars.opacity);
  setStarMotion(
    suspendHeavy ? 0 : fx.stars.rotX,
    suspendHeavy ? 0 : fx.stars.rotY,
    suspendHeavy ? 0 : fx.stars.drift,
  );

  const pointsEnabled = fx.points.enabled && fx.points.opacity > 0.001 && state.expressionModel.parent.enabled;
  if (pointsEnabled) {
    updatePointCloud(payload.points, fx.points.size * fx.points.k3, fx.points.opacity);
    if (payload.points.meta) {
      const m = payload.points.meta;
      const tauK = Math.pow(TAU, state.k);
      setText('T-display', state.T.toFixed(6));
      setText('k-display', state.k.toFixed(6));
      setText('k1-display', state.k1.toFixed(6));
      setText('q-display', state.q.toFixed(6));
      setText('d-display', state.d_CorrectionFunction.toFixed(6));
      setText('lbase-display', `${state.l_base.toFixed(3)} / ${state.l_func.toFixed(3)}`);
      setText('s-display', state.s.toExponential(2));
      setText('tauk-display', tauK.toFixed(6));
      setText('f-display', `(${m.f[0].toFixed(3)}, ${m.f[1].toFixed(3)}i)`);
      setText('compute-display', `${m.computeMs.toFixed(0)}ms`);
      setText('budget-display', `${payload.points.count.toLocaleString()} / ${payload.points.budget.toLocaleString()}`);
    }
  } else {
    updatePointCloud(emptyPointCloudData(), 0, 0);
    setText('budget-display', '-');
  }

  updateStrandPaths(null, 0, 0, false);

  const lineEnabled = fx.atlasLines.enabled && fx.atlasLines.opacity > 0.001 && state.expressionModel.parent.enabled;
  if (lineEnabled) {
    updateAtlasPaths(payload.atlasPaths, fx.atlasLines.width, fx.atlasLines.opacity);
    setText('atlas-paths-display', `${payload.atlasPaths.length} / ${state.pathBudget}`);

    if (payload.atlasPaths.length > 0) {
      const labels = new Set();
      for (const p of payload.atlasPaths) {
        if (!p.tag) continue;
        labels.add(`${p.tag.set}.${p.tag.child}.${p.tag.transform}`);
      }
      setText('atlas-expr-display', [...labels].slice(0, 12).join('\n'));
    } else {
      setText('atlas-expr-display', '-');
    }
  } else {
    updateAtlasPaths(null, 0, 0);
    setText('atlas-paths-display', '-');
    setText('atlas-expr-display', '-');
  }

  const ghostEnabled = fx.ghostTraces.enabled && state.expressionModel.parent.enabled;
  if (ghostEnabled) {
    updateGhostTraces(payload.tauTrace, payload.alphaTrace, fx.ghostTraces.showAlpha && payload.showAlpha);
    sceneApi.setGhostOpacity(fx.ghostTraces.opacity);
  } else {
    updateGhostTraces(null, null, false);
    sceneApi.setGhostOpacity(0);
  }
  applyVisualHelpers();
  setText('formula-display', state.formulaMode === 'euler' ? 'Euler' : 'Tau');
}

function formatProofNumber(v, digits = 6) {
  return Number.isFinite(v) ? Number(v).toExponential(digits) : '-';
}

function computeProofSignature(derived) {
  return JSON.stringify({
    open: !!derived.proofPanelOpen,
    formulaMode: derived.formulaMode,
    T: derived.T,
    Z_min: derived.Z_min,
    Z_max: derived.Z_max,
    q_scale: derived.q_scale,
    q_tauScale: derived.q_tauScale,
    q_bool: derived.q_bool,
    q_correction: derived.q_correction,
    k: derived.k,
    k1: derived.k1,
    k2: derived.k2,
    P: derived.P,
    alpha: derived.alpha,
  });
}

function renderProofResults(results) {
  if (!results || typeof results !== 'object') return;
  const rows = Array.isArray(results.rows) ? results.rows : [];

  setText('proof-summary-mean', formatProofNumber(results.summary?.meanError, 4));
  setText('proof-summary-p95', formatProofNumber(results.summary?.p95Error, 4));
  setText('proof-summary-max', formatProofNumber(results.summary?.maxError, 4));
  setText('proof-summary-samples', Number.isFinite(results.summary?.samples) ? `${results.summary.samples}` : '-');
  setText('proof-closure', Number.isFinite(results.closureSteps) ? `${results.closureSteps.toFixed(6)} steps` : '-');
  setText('proof-p1', Number.isFinite(results.P1) ? results.P1.toFixed(6) : '-');
  setText('proof-eproof', formatProofNumber(results.eProof, 6));

  const body = document.getElementById('proof-rows-body');
  if (!body) return;

  body.innerHTML = '';
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.setKey}</td>
      <td>${row.childKey}</td>
      <td>${Number.isFinite(row.samples) ? row.samples : 0}</td>
      <td>${formatProofNumber(row.meanError, 3)}</td>
      <td>${formatProofNumber(row.p95Error, 3)}</td>
      <td>${formatProofNumber(row.maxError, 3)}</td>
    `;
    body.appendChild(tr);
  }
}

function updateProofPayload(force = false) {
  if (!state.proofPanelOpen) {
    lastProofSignature = '';
    return;
  }

  const derived = deriveState();
  const signature = computeProofSignature(derived);
  if (!force && signature === lastProofSignature) return;

  lastProofSignature = signature;
  const payload = computeProofPayloadFromState(derived);
  state.proofResults = payload;
  state.P1 = payload.P1;
  state.eProof = payload.eProof;
  renderProofResults(payload);
}

function reseedPlaybackBuffer(derived, signature, resetStats = false) {
  applyBufferTargetWithMemoryGuard(derived);
  playbackBuffer.reseed({
    T: derived.T,
    bounceDir: _stepBounceDir,
    signature,
    resetStats,
  });
}

function fillPlaybackBuffer(derived, signature, budget, maxBuild, fx, generationToken = _bufferGenerationToken) {
  applyBufferTargetWithMemoryGuard(derived);
  return playbackBuffer.fill({
    signature,
    generation: generationToken,
    maxBuild,
    onPayloadBuilt: (_, bytes) => {
      if (!Number.isFinite(bytes) || bytes <= 0) return;
      const guarded = clampBufferTargetByMemory(state.bufferTargetFrames, bytes, MAX_BUFFER_BYTES);
      if (guarded.reduced) {
        state.bufferTargetFrames = guarded.targetFrames;
        playbackBuffer.setTargetFrames(guarded.targetFrames);
        state.bufferNotice = `memory cap ${guarded.targetFrames}`;
      }
    },
    buildNext: ({ T, bounceDir }) => {
      // Automatic step traversal is disabled.
      return { payload: null, nextT: T, bounceDir };
    },
  });
}

function syncSignatureAndBufferState(derived, signature, reason = 'math') {
  if (signature === lastMathSignature) return;
  lastMathSignature = signature;
  if (state.bufferEnabled) {
    beginHardPrefill(derived, signature, `${reason} prefill`, true);
    return;
  }
  setBufferPhase('idle');
  state.bufferNotice = '';
  playbackBuffer.invalidate(signature, true);
  reseedPlaybackBuffer(derived, signature, true);
}

export function regenerate(isHeavy = false) {
  _expressionModelGen++;
  clearTimeout(regenerateTimeout);
  const delay = isHeavy ? 48 : 16;

  regenerateTimeout = setTimeout(() => {
    const derived = deriveState();
    refreshSliderBounds();
    normalizeVisualHelpers();
    const fx = getEffectiveFx();
    const budget = computePointBudget();
    const signature = computeMathSignature(derived, budget);
    syncSignatureAndBufferState(derived, signature, 'regenerate');
    if (!state.bufferEnabled) {
      setBufferPhase('idle');
      state.bufferTargetFrames = derived.precomputeBufferFrames;
      state.bufferNotice = '';
      playbackBuffer.setTargetFrames(derived.precomputeBufferFrames);
    } else {
      applyBufferTargetWithMemoryGuard(derived);
    }

    if (state.bufferEnabled && state.bufferPhase === 'prefill') {
      updateProofPayload();
      updateBufferStatus();
      return;
    }

    let payload = pendingRenderPayload;
    pendingRenderPayload = null;
    if (!payload || payload.signature !== signature || Math.abs(payload.derived.T - derived.T) > 1e-12) {
      payload = buildRenderPayload(derived, budget, signature, fx);
      payload.bounceDir = _stepBounceDir;
    }
    applyRenderPayload(payload, fx);
    updateProofPayload();
    updateBufferStatus();

    if (state.bufferEnabled && !animation.playing && state.bufferPhase !== 'prefill') {
      const bgBudget = computeAdaptiveBuildBudget({
        phase: 'background',
        fps: getCurrentFps(),
        depth: playbackBuffer.depth,
        target: state.bufferTargetFrames,
      });
      fillPlaybackBuffer(derived, signature, budget, bgBudget, fx);
      updateBufferStatus();
    }
  }, delay);
}
class UIBuilder {
  constructor(container) {
    this.container = container;
    this.currentBody = container;
    this.activeChildBody = null;
  }

  _parent() {
    return this.activeChildBody || this.currentBody;
  }

  _createVisibilityButton(visibility = null) {
    if (!visibility || typeof visibility !== 'object') return null;
    const {
      obj,
      key,
      onChange = null,
      heavy = false,
    } = visibility;
    if (!obj || typeof key !== 'string') return null;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'panel-visibility-btn ctrl-interactive';

    const sync = () => {
      const enabled = !!obj[key];
      btn.classList.toggle('disabled', !enabled);
      btn.setAttribute('aria-label', enabled ? 'Hide section' : 'Show section');
      btn.title = enabled ? 'Visible' : 'Hidden';
      btn.innerHTML = enabled ? ICON_EYE : ICON_EYE_OFF;
    };

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      obj[key] = !obj[key];
      sync();
      if (typeof onChange === 'function') onChange(obj[key]);
      regenerate(heavy);
    });

    sync();
    return btn;
  }

  _createHeaderMain(title, visibility = null, isChild = false) {
    const main = document.createElement('div');
    main.className = isChild ? 'accordion-child-header-main' : 'accordion-header-main';

    const label = document.createElement('span');
    label.className = isChild ? 'accordion-child-header-label' : 'accordion-header-label';
    label.textContent = title;
    main.appendChild(label);

    const visBtn = this._createVisibilityButton(visibility);
    if (visBtn) main.appendChild(visBtn);

    return main;
  }

  section(title, collapsed = false, options = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'accordion-panel';
    const head = document.createElement('div');
    head.className = `accordion-header${collapsed ? ' collapsed' : ''}`;
    head.appendChild(this._createHeaderMain(title, options.visibility, false));
    const body = document.createElement('div');
    body.className = `accordion-body${collapsed ? ' collapsed' : ''}`;
    head.addEventListener('click', () => {
      head.classList.toggle('collapsed');
      body.classList.toggle('collapsed');
      if (typeof options.onToggle === 'function') {
        options.onToggle(!head.classList.contains('collapsed'));
      }
    });
    wrap.appendChild(head);
    wrap.appendChild(body);
    this.container.appendChild(wrap);
    this.currentBody = body;
    this.activeChildBody = null;
    return this;
  }

  childSection(title, collapsed = true, options = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'accordion-child-panel';
    if (options.cssClass) wrap.classList.add(options.cssClass);
    const head = document.createElement('div');
    head.className = `accordion-child-header${collapsed ? ' collapsed' : ''}`;
    head.appendChild(this._createHeaderMain(title, options.visibility, true));
    const body = document.createElement('div');
    body.className = `accordion-child-body${collapsed ? ' collapsed' : ''}`;
    head.addEventListener('click', (e) => {
      e.stopPropagation();
      head.classList.toggle('collapsed');
      body.classList.toggle('collapsed');
    });
    wrap.appendChild(head);
    wrap.appendChild(body);
    this._parent().appendChild(wrap);
    this.activeChildBody = body;
    return this;
  }

  endChild() {
    this.activeChildBody = null;
    return this;
  }

  info(text) {
    const div = document.createElement('div');
    div.className = 'ctrl-info';
    div.innerHTML = text;
    this._parent().appendChild(div);
    return this;
  }

  html(markup) {
    const div = document.createElement('div');
    div.innerHTML = markup;
    this._parent().appendChild(div);
    return this;
  }

  toggle(label, obj, key, onChange = null, heavy = false) {
    const btn = document.createElement('button');
    btn.className = `toggle-pill ctrl-interactive${obj[key] ? ' active' : ''}`;
    btn.innerHTML = `<span class="pill-dot"></span>${label}`;
    btn.addEventListener('click', () => {
      obj[key] = !obj[key];
      btn.classList.toggle('active', obj[key]);
      if (onChange) onChange(obj[key]);
      regenerate(heavy);
    });
    this._parent().appendChild(btn);
    return this;
  }

  slider(label, obj, key, min, max, step, options = {}) {
    const {
      fmt,
      onChange,
      onCommit,
      heavy = false,
      id = null,
      index = null,
      commitMode = 'snap',
      dynamicBounds = null,
      normalizeInput = normalizeInputText,
      linkPath = null,
      linkGetter = null,
      linkSetter = null,
      syncGroup = 'default',
    } = options;
    const row = document.createElement('div');
    row.className = 'slider-row';
    const lbl = document.createElement('span');
    lbl.className = 'slider-label';
    lbl.textContent = label;

    const path = typeof linkPath === 'string' ? linkPath : null;
    const linkable = !!path && isLinkEligiblePath(path);

    let activeBounds = { min, max, step };
    const getCurrentBounds = () => {
      if (typeof dynamicBounds !== 'function') return { ...activeBounds };
      const next = dynamicBounds() || {};
      let nextMin = Number.isFinite(next.min) ? next.min : activeBounds.min;
      let nextMax = Number.isFinite(next.max) ? next.max : activeBounds.max;
      const nextStep = Number.isFinite(next.step) ? next.step : activeBounds.step;

      // During playback, widen bounds to cover the scene track's full range
      if (path && typeof sceneManager !== 'undefined' && sceneManager && sceneManager.isPlaying()) {
        const timeline = sceneManager.getTimeline();
        if (timeline) {
          for (const scene of timeline.scenes) {
            const link = scene.links.find(l => l.path === path);
            if (link) {
              nextMin = Math.min(nextMin, link.baseValue, link.endValue);
              nextMax = Math.max(nextMax, link.baseValue, link.endValue);
            }
          }
        }
      }

      const orderedMin = Math.min(nextMin, nextMax);
      const orderedMax = Math.max(nextMin, nextMax);
      return { min: orderedMin, max: orderedMax, step: nextStep };
    };

    activeBounds = getCurrentBounds();

    const getBoundValueRaw = () => {
      if (index !== null) return Number(obj[key][index]);
      return Number(obj[key]);
    };

    const setBoundValueRaw = (v) => {
      if (index !== null) obj[key][index] = v;
      else obj[key] = v;
    };

    if (!Number.isFinite(getBoundValueRaw())) setBoundValueRaw(activeBounds.min);
    const getLiveValue = () => {
      const raw = typeof linkGetter === 'function' ? Number(linkGetter()) : getBoundValueRaw();
      return Number.isFinite(raw) ? raw : getBoundValueRaw();
    };
    const setLiveValue = (v) => {
      if (typeof linkSetter === 'function') linkSetter(v);
      else setBoundValueRaw(v);
    };
    const linked = linkable
      ? linkEngine.register(path, {
        getLive: getLiveValue,
        setLive: setLiveValue,
        getBounds: () => getCurrentBounds(),
      })
      : null;
    if (linkable) {
      if (syncGroup === 'camera') activeCameraLinkedPaths.add(path);
      else activeLinkedPaths.add(path);
    }

    const getLinkedRecord = () => (linkable ? linkEngine.get(path) : null);

    const getBaseValue = () => {
      if (!linkable) return getBoundValueRaw();
      const rec = getLinkedRecord();
      return Number.isFinite(rec?.baseValue) ? Number(rec.baseValue) : getLiveValue();
    };

    const setBaseValue = (v) => {
      if (linked) linkEngine.setBase(path, v);
      else setBoundValueRaw(v);
    };

    const format = (v) => {
      if (fmt) return fmt(v);
      if (activeBounds.step >= 1) return `${Math.round(v)}`;
      return Number(v).toFixed(Math.min(8, Math.max(1, decimalsForStep(activeBounds.step))));
    };

    const trackWrap = document.createElement('div');
    trackWrap.className = 'slider-track-wrap';

    const inputBase = document.createElement('input');
    inputBase.type = 'range';
    inputBase.className = 'slider-input base-thumb';
    inputBase.min = String(activeBounds.min);
    inputBase.max = String(activeBounds.max);
    inputBase.step = String(activeBounds.step);
    inputBase.value = String(getBaseValue());
    if (id) inputBase.id = id;
    trackWrap.appendChild(inputBase);



    // -- Link button (🔗) --
    const linkBtn = document.createElement('button');
    linkBtn.type = 'button';
    linkBtn.className = 'slider-link-btn ctrl-interactive';

    // -- Bounds toggle button (⇕) --
    let boundsBtn = null;
    let boundsOpen = false;

    // -- Value stack (vertical: min / value / max) --
    const valueStack = document.createElement('div');
    valueStack.className = 'slider-value-stack';

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'slider-value-display';
    valueDisplay.textContent = format(getBaseValue());

    let boundsMinInput = null;
    let boundsMaxInput = null;
    if (linkable) {
      boundsBtn = document.createElement('button');
      boundsBtn.type = 'button';
      boundsBtn.className = 'slider-link-btn ctrl-interactive';
      boundsBtn.innerHTML = ICON_BOUNDS;
      boundsBtn.title = 'Toggle bounds';
      boundsBtn.setAttribute('aria-label', 'Toggle bounds');

      boundsMinInput = document.createElement('input');
      boundsMinInput.type = 'number';
      boundsMinInput.className = 'bounds-chip bounds-min hidden';
      boundsMinInput.value = String(activeBounds.min);
      boundsMinInput.title = 'Slider minimum';
      boundsMinInput.setAttribute('aria-label', 'Slider minimum');
      boundsMinInput.addEventListener('change', () => {
        const v = parseFloat(boundsMinInput.value);
        if (!Number.isFinite(v)) return;
        activeBounds.min = v;
        if (path === 'T') state.T_lowerBound = v;
        syncBounds();
        syncUI();
      });

      boundsMaxInput = document.createElement('input');
      boundsMaxInput.type = 'number';
      boundsMaxInput.className = 'bounds-chip bounds-max hidden';
      boundsMaxInput.value = String(activeBounds.max);
      boundsMaxInput.title = 'Slider maximum';
      boundsMaxInput.setAttribute('aria-label', 'Slider maximum');
      boundsMaxInput.addEventListener('change', () => {
        const v = parseFloat(boundsMaxInput.value);
        if (!Number.isFinite(v)) return;
        activeBounds.max = v;
        if (path === 'T') state.T_upperBound = v;
        syncBounds();
        syncUI();
      });

      boundsBtn.addEventListener('click', () => {
        boundsOpen = !boundsOpen;
        syncUI();
      });

      valueStack.appendChild(boundsMinInput);
    }
    valueStack.appendChild(valueDisplay);
    if (linkable) {
      valueStack.appendChild(boundsMaxInput);
    }

    const syncBounds = () => {
      const next = getCurrentBounds();
      activeBounds = next;
      inputBase.min = String(next.min);
      inputBase.max = String(next.max);
      inputBase.step = String(next.step);

      // Update inline bounds chips (skip if user is editing)
      if (boundsMinInput && document.activeElement !== boundsMinInput) {
        boundsMinInput.value = String(next.min);
      }
      if (boundsMaxInput && document.activeElement !== boundsMaxInput) {
        boundsMaxInput.value = String(next.max);
      }
    };
    if (syncGroup === 'camera') cameraSliderBoundsSyncFns.push(syncBounds);
    else sliderBoundsSyncFns.push(syncBounds);

    const applyResolvedToField = () => {
      const lo = Math.min(activeBounds.min, activeBounds.max);
      const hi = Math.max(activeBounds.min, activeBounds.max);
      if (linkable) {
        linkEngine.applyPath(path, animation.progress);
        return;
      }
      setBoundValueRaw(clamp(getBaseValue(), lo, hi));
    };

    const syncLinkUI = () => {
      // Check scene model tracking state (not link engine)
      const timeline = sceneManager.getTimeline();
      const isTracked = timeline && timeline.scenes.length > 0 &&
        timeline.scenes[0].links.some(l => l.path === path);
      linkBtn.classList.toggle('active', isTracked);
      linkBtn.setAttribute('aria-label', isTracked ? 'Remove from scenes' : 'Add to all scenes');
      linkBtn.title = isTracked ? 'Tracked in scenes' : 'Add to scenes';
      linkBtn.innerHTML = isTracked ? ICON_LINK : ICON_UNLINK;
      if (boundsBtn) boundsBtn.classList.toggle('active', boundsOpen);
    };

    const syncUI = () => {
      syncBounds();
      const lo = Math.min(activeBounds.min, activeBounds.max);
      const hi = Math.max(activeBounds.min, activeBounds.max);
      const rec = getLinkedRecord();
      if (rec && !rec.isLinked) {
        linkEngine.updateBaseFromLive(path);
      }
      const base = clamp(getBaseValue(), lo, hi);
      const strBase = String(base);
      if (inputBase.value !== strBase) inputBase.value = strBase;
      if (!valueDisplay.classList.contains('editing')) valueDisplay.textContent = format(base);

      // Bounds visibility
      if (boundsMinInput) boundsMinInput.classList.toggle('hidden', !boundsOpen);
      if (boundsMaxInput) boundsMaxInput.classList.toggle('hidden', !boundsOpen);
      valueDisplay.classList.toggle('bounds-active', boundsOpen);

      syncLinkUI();
    };

    if (syncGroup === 'camera') cameraSliderUiSyncFns.push(syncUI);
    else sliderUiSyncFns.push(syncUI);

    const commitBaseValue = (raw, opts = {}) => {
      const { triggerChange = true, mode = commitMode, source = 'unknown' } = opts;
      const resolved = resolveCommittedValue(raw, activeBounds, mode);
      if (!resolved.ok) return;

      let next = resolved.value;
      let status = resolved.status;
      if (typeof onCommit === 'function') {
        const commitResult = onCommit(next, { source, status });
        if (commitResult && typeof commitResult === 'object') {
          if (Number.isFinite(commitResult.value)) next = commitResult.value;
          if (typeof commitResult.status === 'string') status = commitResult.status;
        }
      }

      setBaseValue(next);
      const rec = getLinkedRecord();
      if (rec && Number.isFinite(rec.endValue)) {
        const clampedEnd = clamp(
          Number(rec.endValue),
          Math.min(activeBounds.min, activeBounds.max),
          Math.max(activeBounds.min, activeBounds.max),
        );
        linkEngine.setEnd(path, clampedEnd, { autoLink: rec.isLinked });
      }
      applyResolvedToField();

      if (triggerChange && onChange) onChange(next);
      refreshSliderBounds();
      refreshCameraSliderBounds();
      if (status === 'normalized') {
        for (const sync of sliderUiSyncFns) sync();
      } else {
        syncUI();
      }
      pushCommitStatus(row, status);
      regenerate(heavy);
    };



    const startInlineEdit = (chip, getter, setter) => {
      if (chip.classList.contains('editing')) return;
      const original = chip.textContent;
      chip.classList.add('editing');
      chip.textContent = '';
      const edit = document.createElement('input');
      edit.type = 'text';
      edit.className = 'value-edit-input';
      edit.value = String(getter());
      chip.appendChild(edit);
      edit.focus();
      edit.select();

      let done = false;
      const finalize = (commit) => {
        if (done) return;
        done = true;
        chip.classList.remove('editing');
        chip.removeChild(edit);
        if (!commit) {
          chip.textContent = original;
          return;
        }
        const parsed = parseNumericInput(edit.value, normalizeInput);
        if (Number.isFinite(parsed)) setter(parsed);
        else syncUI();
      };

      edit.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finalize(true);
        if (e.key === 'Escape') finalize(false);
      });
      edit.addEventListener('blur', () => finalize(true));
    };

    inputBase.addEventListener('input', () => {
      commitBaseValue(Number(inputBase.value), { mode: 'snap', source: 'drag' });
    });

    valueDisplay.addEventListener('click', () => {
      startInlineEdit(
        valueDisplay,
        () => getBaseValue(),
        (v) => commitBaseValue(v, { mode: commitMode, source: 'text' }),
      );
    });

    if (linkable) {
      linkBtn.addEventListener('click', () => {
        const timeline = sceneManager.getTimeline();
        if (!timeline || timeline.scenes.length === 0) return;

        // Toggle: add/remove this parameter from ALL scenes
        const isTracked = timeline.scenes[0].links.some(l => l.path === path);
        if (isTracked) {
          removeTrackFromAllScenes(timeline, path);
        } else {
          const currentValue = getBaseValue();
          addTrackToAllScenes(timeline, path, currentValue);
        }

        // Update icon state
        const nowTracked = timeline.scenes[0].links.some(l => l.path === path);
        linkBtn.classList.toggle('active', nowTracked);
        linkBtn.innerHTML = nowTracked ? ICON_LINK : ICON_UNLINK;

        autoSaveTimeline();
        if (typeof window.renderTimelinePanel === 'function') {
          window.renderTimelinePanel();
        }
      });

    }

    syncUI();

    row.appendChild(lbl);
    if (linkable) row.appendChild(linkBtn);
    row.appendChild(trackWrap);
    if (boundsBtn) row.appendChild(boundsBtn);
    row.appendChild(valueStack);
    this._parent().appendChild(row);
    return this;
  }

  color(label, obj, key, onChange = null, heavy = false) {
    const row = document.createElement('div');
    row.className = 'slider-row';
    const lbl = document.createElement('span');
    lbl.className = 'slider-label';
    lbl.textContent = label;

    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'ctrl-interactive';
    input.style.width = '100%';
    input.style.height = '24px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid var(--interact-border)';
    input.style.background = 'transparent';
    input.value = typeof obj[key] === 'string' ? obj[key] : '#ffffff';

    const val = document.createElement('span');
    val.className = 'slider-value';
    val.textContent = input.value;

    input.addEventListener('input', () => {
      obj[key] = input.value;
      val.textContent = input.value;
      if (onChange) onChange(obj[key]);
      regenerate(heavy);
    });

    row.appendChild(lbl);
    row.appendChild(input);
    row.appendChild(val);
    this._parent().appendChild(row);
    return this;
  }

  modeToggle(label, getter, setter, a, b, labelA, labelB, options = {}) {
    const row = document.createElement('div');
    row.className = 'mode-toggle-row';
    const lbl = document.createElement('span');
    lbl.className = 'mode-label';
    lbl.textContent = label;

    const path = options.linkPath;
    const linkable = !!path;
    let linkBtn = null;
    if (linkable) {
      linkBtn = document.createElement('button');
      linkBtn.className = 'slider-link-btn ctrl-interactive';
      linkBtn.innerHTML = ICON_UNLINK;
      linkBtn.title = 'Link parameter to all scenes';
    }

    const group = document.createElement('div');
    group.className = 'toggle-group-inline';

    const btnA = document.createElement('button');
    const btnB = document.createElement('button');
    const setActive = () => {
      btnA.className = `toggle-pill ctrl-interactive${getter() === a ? ' active' : ''}`;
      btnB.className = `toggle-pill ctrl-interactive${getter() === b ? ' active' : ''}`;
      btnA.innerHTML = `<span class="pill-dot"></span>${labelA}`;
      btnB.innerHTML = `<span class="pill-dot"></span>${labelB}`;
    };
    setActive();

    btnA.addEventListener('click', () => {
      setter(a);
      setActive();
      if (linkable && activeLinkedPaths.has(path)) {
        const rec = linkEngine.get(path);
        const resolvedVal = typeof options.linkValue === 'function' ? options.linkValue(a) : a;
        if (rec) linkEngine.setEnd(path, resolvedVal, { autoLink: rec.isLinked });
      }
      regenerate();
    });
    btnB.addEventListener('click', () => {
      setter(b);
      setActive();
      if (linkable && activeLinkedPaths.has(path)) {
        const rec = linkEngine.get(path);
        const resolvedVal = typeof options.linkValue === 'function' ? options.linkValue(b) : b;
        if (rec) linkEngine.setEnd(path, resolvedVal, { autoLink: rec.isLinked });
      }
      regenerate();
    });

    if (linkable) {
      linkBtn.addEventListener('click', () => {
        const timeline = sceneManager.getTimeline();
        if (!timeline || timeline.scenes.length === 0) return;
        const isTracked = timeline.scenes[0].links.some(l => l.path === path);
        if (isTracked) removeTrackFromAllScenes(timeline, path);
        else {
          const resolvedVal = typeof options.linkValue === 'function' ? options.linkValue(getter()) : getter();
          addTrackToAllScenes(timeline, path, resolvedVal);
        }

        const nowTracked = timeline.scenes[0].links.some(l => l.path === path);
        linkBtn.classList.toggle('active', nowTracked);
        linkBtn.innerHTML = nowTracked ? ICON_LINK : ICON_UNLINK;
        autoSaveTimeline();
        if (typeof window.renderTimelinePanel === 'function') window.renderTimelinePanel();
      });

      const syncUI = () => {
        const timeline = sceneManager.getTimeline();
        if (!timeline || timeline.scenes.length === 0) return;
        const nowTracked = timeline.scenes[0].links.some(l => l.path === path);
        linkBtn.classList.toggle('active', nowTracked);
        linkBtn.innerHTML = nowTracked ? ICON_LINK : ICON_UNLINK;
        if (nowTracked) activeLinkedPaths.add(path);
      };
      sliderUiSyncFns.push(syncUI);
      syncUI();
    }

    group.appendChild(btnA);
    group.appendChild(btnB);
    row.appendChild(lbl);
    if (linkable) row.appendChild(linkBtn);
    row.appendChild(group);
    this._parent().appendChild(row);
    return this;
  }

  toggleRow(label, toggles, options = {}) {
    const row = document.createElement('div');
    row.className = 'mode-btn-row';
    if (options.cssClass) row.classList.add(options.cssClass);

    const lbl = document.createElement('span');
    lbl.className = 'mode-btn-row-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    const group = document.createElement('div');
    group.className = 'mode-btn-row-buttons';

    for (const t of toggles) {
      const cell = document.createElement('div');
      cell.className = 'toggle-cell';
      
      const btn = document.createElement('button');
      btn.className = `mode-btn ctrl-interactive${t.obj[t.key] ? ' active-green' : ''}`;
      btn.textContent = t.label;

      const path = t.linkPath;
      const linkable = !!path;
      let linkBtn = null;
      if (linkable) {
        linkBtn = document.createElement('button');
        linkBtn.className = 'mini-link-btn ctrl-interactive';
        linkBtn.innerHTML = ICON_UNLINK;
        linkBtn.title = 'Link parameter to all scenes';
      }

      btn.addEventListener('click', () => {
        t.obj[t.key] = !t.obj[t.key];
        btn.classList.toggle('active-green', t.obj[t.key]);
        if (linkable && activeLinkedPaths.has(path)) {
          const rec = linkEngine.get(path);
          if (rec) linkEngine.setEnd(path, t.obj[t.key] ? 1 : 0, { autoLink: rec.isLinked });
        }
        if (t.onChange) t.onChange(t.obj[t.key]);
        regenerate(t.heavy || false);
      });

      if (linkable) {
        linkBtn.addEventListener('click', () => {
          const timeline = sceneManager.getTimeline();
          if (!timeline || timeline.scenes.length === 0) return;
          const isTracked = timeline.scenes[0].links.some(l => l.path === path);
          if (isTracked) removeTrackFromAllScenes(timeline, path);
          else addTrackToAllScenes(timeline, path, t.obj[t.key] ? 1 : 0);

          const nowTracked = timeline.scenes[0].links.some(l => l.path === path);
          linkBtn.classList.toggle('active', nowTracked);
          linkBtn.innerHTML = nowTracked ? ICON_LINK : ICON_UNLINK;
          autoSaveTimeline();
          if (typeof window.renderTimelinePanel === 'function') window.renderTimelinePanel();
        });

        const syncUI = () => {
          const timeline = sceneManager.getTimeline();
          if (!timeline || timeline.scenes.length === 0) return;
          const nowTracked = timeline.scenes[0].links.some(l => l.path === path);
          linkBtn.classList.toggle('active', nowTracked);
          linkBtn.innerHTML = nowTracked ? ICON_LINK : ICON_UNLINK;
          if (nowTracked) activeLinkedPaths.add(path);
        };
        sliderUiSyncFns.push(syncUI);
        syncUI();
      }

      cell.appendChild(btn);
      if (linkable) cell.appendChild(linkBtn);
      group.appendChild(cell);
    }

    row.appendChild(group);
    this._parent().appendChild(row);
    return this;
  }
}

function bindModeButtons(container, prefix, options, currentValue, onSet) {
  const setActive = () => {
    for (const opt of options) {
      const btn = container.querySelector(`#${prefix}-${opt.value}`);
      if (!btn) continue;
      btn.classList.toggle('active', currentValue() === opt.value);
    }
  };

  setActive();
  for (const opt of options) {
    const btn = container.querySelector(`#${prefix}-${opt.value}`);
    if (!btn) continue;
    btn.addEventListener('click', () => {
      onSet(opt.value);
      setActive();
      regenerate();
    });
  }
}

function ensureFunctionControlSelection() {
  const exponentKeys = EXPONENT_FAMILIES.map((family) => family.key);
  if (!exponentKeys.includes(functionControlUiState.selectedExponent)) {
    functionControlUiState.selectedExponent = exponentKeys[0];
  }

  const nodes = getFunctionNodesByExponent(functionControlUiState.selectedExponent);
  if (!nodes.some((node) => node.key === functionControlUiState.selectedFunction)) {
    functionControlUiState.selectedFunction = null;
  }

  if (!VARIANT_DEFINITIONS.some((variant) => variant.key === functionControlUiState.selectedVariant)) {
    functionControlUiState.selectedVariant = null;
  }

  if (!functionControlUiState.selectedFunction) {
    functionControlUiState.selectedVariant = null;
  }
}

function resolveNodeVisibilityState(localEnabled, ancestorEnabled) {
  if (!localEnabled) return 'disabled';
  if (!ancestorEnabled) return 'inherited';
  return 'enabled';
}

function resolveExponentVisibilityState(exponentKey) {
  return resolveExponentTriState(state.expressionModel, exponentKey);
}

function resolveFunctionVisibilityState(functionKey, ancestorEnabled) {
  const localState = resolveFunctionTriState(state.expressionModel, functionKey);
  if (!ancestorEnabled && localState === 'enabled') return 'inherited';
  return localState;
}

function visibilityStateLabel(stateKey) {
  if (stateKey === 'disabled') return 'directly disabled';
  if (stateKey === 'inherited') return 'hidden by parent';
  if (stateKey === 'mixed') return 'mixed visibility';
  return 'directly enabled';
}

function visibilityIconForState(stateKey) {
  if (stateKey === 'mixed') return ICON_EYE_MIXED;
  if (stateKey === 'enabled') return ICON_EYE;
  return ICON_EYE_OFF;
}

function buildUnifiedFunctionControlSection(b) {
  ensureFunctionControlSelection();

  b.section('Function Control', false)
    .info('One hierarchy: + exponent / - exponent -> function -> variant.')
    .html('<div id="function-control-root"></div>');

  const root = controlsContainer.querySelector('#function-control-root');
  if (!root) return;
  root.innerHTML = '';

  const createNode = ({
    label,
    isActive,
    visibilityState,
    onSelect,
    onToggle,
    isBlocked = false,
    blockedReason = '',
  }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `function-node-btn ctrl-interactive function-node-btn--${visibilityState}${isActive ? ' active' : ''}${isBlocked ? ' function-node-btn--blocked' : ''}`;
    button.title = isBlocked && blockedReason ? `${label} (${blockedReason})` : label;

    const text = document.createElement('span');
    text.className = 'function-node-label';
    text.textContent = label;

    const vis = document.createElement('span');
    vis.className = `function-node-visibility ${visibilityState}`;
    vis.setAttribute('data-role', 'visibility');
    vis.setAttribute('aria-label', `Toggle visibility (${visibilityStateLabel(visibilityState)})`);
    vis.title = visibilityStateLabel(visibilityState);
    vis.innerHTML = visibilityIconForState(visibilityState);

    button.appendChild(text);
    button.appendChild(vis);
    button.addEventListener('click', (e) => {
      if (isBlocked) return;
      const target = e.target instanceof Element ? e.target : null;
      const iconClicked = !!target?.closest('[data-role="visibility"]');
      if (iconClicked) {
        onToggle();
        return;
      }
      onSelect();
    });
    return button;
  };

  const parentEnabled = !!state.expressionModel.parent.enabled;
  const selectedExponent = functionControlUiState.selectedExponent;
  const selectedFunction = functionControlUiState.selectedFunction;
  const selectedVariant = functionControlUiState.selectedVariant;
  const selectedExponentLabel = EXPONENT_FAMILIES.find((family) => family.key === selectedExponent)?.label || selectedExponent;
  const selectedFunctionNode = selectedFunction
    ? getFunctionNodesByExponent(selectedExponent).find((node) => node.key === selectedFunction) || null
    : null;
  const selectedFunctionLabel = selectedFunctionNode?.label || 'no function selected';
  const selectedVariantLabel = VARIANT_DEFINITIONS.find((variant) => variant.key === selectedVariant)?.label || 'no variant selected';

  const appendGroupLabel = (title, context = '') => {
    const row = document.createElement('div');
    row.className = 'function-group-label';
    const main = document.createElement('span');
    main.className = 'function-group-label-main';
    main.textContent = title;
    row.appendChild(main);
    if (context) {
      const detail = document.createElement('span');
      detail.className = 'function-group-label-context';
      detail.textContent = context;
      row.appendChild(detail);
    }
    root.appendChild(row);
  };

  appendGroupLabel('1) exponent family', 'select level');
  const exponentRow = document.createElement('div');
  exponentRow.className = 'exponent-grid';
  for (const family of EXPONENT_FAMILIES) {
    const visState = resolveExponentVisibilityState(family.key);
    const node = createNode({
      label: family.label,
      isActive: selectedExponent === family.key,
      visibilityState: visState,
      onSelect: () => {
        functionControlUiState.selectedExponent = family.key;
        functionControlUiState.selectedFunction = null;
        functionControlUiState.selectedVariant = null;
        buildControls();
      },
      onToggle: () => {
        const current = resolveExponentVisibilityState(family.key);
        const nextEnabled = current === 'enabled' ? false : true; // mixed→on, disabled→on, enabled→off
        setExponentSubtreeEnabled(state.expressionModel, family.key, nextEnabled);
        regenerate();
        buildControls();
      },
    });
    exponentRow.appendChild(node);
  }
  root.appendChild(exponentRow);

  appendGroupLabel('2) function family', `children of ${selectedExponentLabel}`);
  const functionGrid = document.createElement('div');
  functionGrid.className = 'function-grid';
  const functionNodes = getFunctionNodesByExponent(selectedExponent);
  const selectedSetEnabled = !!state.expressionModel.sets[selectedExponent]?.enabled;
  const functionAncestorEnabled = parentEnabled && selectedSetEnabled;
  for (const fnNode of functionNodes) {
    const visState = resolveFunctionVisibilityState(fnNode.key, functionAncestorEnabled);
    const node = createNode({
      label: fnNode.label,
      isActive: selectedFunction === fnNode.key,
      visibilityState: visState,
      onSelect: () => {
        functionControlUiState.selectedFunction = fnNode.key;
        functionControlUiState.selectedVariant = null;
        buildControls();
      },
      onToggle: () => {
        const current = resolveFunctionTriState(state.expressionModel, fnNode.key);
        const nextEnabled = current === 'enabled' ? false : true; // mixed→on, disabled→on, enabled→off
        setFunctionNodeEnabledWithAncestors(
          state.expressionModel,
          selectedExponent,
          fnNode.key,
          nextEnabled,
        );
        regenerate();
        buildControls();
      },
    });
    functionGrid.appendChild(node);
  }
  root.appendChild(functionGrid);

  appendGroupLabel('3) variant', `children of ${selectedFunctionLabel}`);
  const variantGrid = document.createElement('div');
  variantGrid.className = 'variant-grid';
  const hasSelectedFunction = !!selectedFunction && !!state.expressionModel.childVariants[selectedFunction];
  const variantAncestorEnabled = functionAncestorEnabled && !!state.expressionModel.children[selectedFunction]?.enabled;
  for (const variant of VARIANT_DEFINITIONS) {
    const variantStyle = hasSelectedFunction
      ? state.expressionModel.childVariants[selectedFunction][variant.key]
      : null;
    const visState = hasSelectedFunction
      ? resolveNodeVisibilityState(!!variantStyle?.enabled, variantAncestorEnabled)
      : 'disabled';
    const node = createNode({
      label: variant.label,
      isActive: hasSelectedFunction && selectedVariant === variant.key,
      visibilityState: visState,
      isBlocked: !hasSelectedFunction,
      blockedReason: 'select a function first',
      onSelect: () => {
        if (!hasSelectedFunction) return;
        functionControlUiState.selectedVariant = variant.key;
        buildControls();
      },
      onToggle: () => {
        if (!hasSelectedFunction || !variantStyle) return;
        setVariantNodeEnabledWithAncestors(
          state.expressionModel,
          selectedExponent,
          selectedFunction,
          variant.key,
          !variantStyle.enabled,
        );
        regenerate();
        buildControls();
      },
    });
    variantGrid.appendChild(node);
  }
  root.appendChild(variantGrid);

  const pathRow = document.createElement('div');
  pathRow.className = 'function-path-row';
  pathRow.textContent = `path: ${selectedExponentLabel} -> ${selectedFunctionLabel} -> ${selectedVariantLabel}`;
  root.appendChild(pathRow);

  const stylePanel = document.createElement('div');
  stylePanel.className = 'function-style-panel';
  root.appendChild(stylePanel);
  const sb = new UIBuilder(stylePanel);

  const resolveScopeTarget = () => {
    if (selectedFunction && selectedVariant) {
      const variant = VARIANT_DEFINITIONS.find((node) => node.key === selectedVariant);
      const style = state.expressionModel.childVariants[selectedFunction][selectedVariant];
      return {
        label: `${variant?.label || selectedVariant}`,
        style,
        path: `expression.childVariants.${selectedFunction}.${selectedVariant}`,
        visibilityState: resolveNodeVisibilityState(!!style.enabled, variantAncestorEnabled),
        allowColor: false,
        maxScale: 4,
      };
    }

    if (selectedFunction) {
      const fnNode = functionNodes.find((node) => node.key === selectedFunction);
      const style = state.expressionModel.children[selectedFunction];
      return {
        label: fnNode?.label || selectedFunction,
        style,
        path: `expression.children.${selectedFunction}`,
        visibilityState: resolveFunctionVisibilityState(selectedFunction, functionAncestorEnabled),
        allowColor: true,
        maxScale: 4,
      };
    }

    const style = state.expressionModel.sets[selectedExponent];
    return {
      label: `${EXPONENT_FAMILIES.find((family) => family.key === selectedExponent)?.label || selectedExponent}`,
      style,
      path: `expression.sets.${selectedExponent}`,
      visibilityState: resolveExponentVisibilityState(selectedExponent),
      allowColor: false,
      maxScale: 4,
    };
  };

  const scopeTarget = resolveScopeTarget();
  sb.info(`<strong>${scopeTarget.label}</strong>`);
  sb.html(`<div class=\"ctrl-info\">visibility: ${visibilityStateLabel(scopeTarget.visibilityState)}</div>`);
  sb.toggle('visible', scopeTarget.style, 'enabled', () => buildControls())
    .slider('point size', scopeTarget.style, 'pointSize', 0, scopeTarget.maxScale, 0.05, { linkPath: `${scopeTarget.path}.pointSize` })
    .slider('point opacity', scopeTarget.style, 'pointOpacity', 0, 1, 0.01, { linkPath: `${scopeTarget.path}.pointOpacity` })
    .slider('line size', scopeTarget.style, 'lineWidth', 0, scopeTarget.maxScale, 0.05, { linkPath: `${scopeTarget.path}.lineWidth` })
    .slider('line opacity', scopeTarget.style, 'lineOpacity', 0, 1, 0.01, { linkPath: `${scopeTarget.path}.lineOpacity` })
    .slider('point bloom', scopeTarget.style, 'pointBloom', 0, 4, 0.05, { linkPath: `${scopeTarget.path}.pointBloom` })
    .slider('line bloom', scopeTarget.style, 'lineBloom', 0, 4, 0.05, { linkPath: `${scopeTarget.path}.lineBloom` });

  if (scopeTarget.allowColor) sb.color('color', scopeTarget.style, 'color');
}

function buildCameraPanel() {
  if (!cameraContainer) cameraContainer = document.getElementById('camera-panel');
  if (!cameraContainer) return;

  cameraSliderUiSyncFns.length = 0;
  cameraSliderBoundsSyncFns.length = 0;
  activeCameraLinkedPaths.clear();

  cameraContainer.innerHTML = '';

  const b = new UIBuilder(cameraContainer);
  b.section('Camera', state.cameraPanelOpen !== true, {
    onToggle: (open) => { state.cameraPanelOpen = open; },
  });
  b.html('<div class="preset-row"><button class="preset-btn ctrl-interactive" id="btn-reset-camera">&#x21bb; Reset Camera</button><button class="preset-btn ctrl-interactive" id="btn-screenshot">&#x1f4f7; Screenshot</button></div>');
  b.toggle('auto-hide on play', state, 'autoHidePanels');
  b.info('Active view camera + orbit controls. Mouse/orbit edits and panel edits stay synchronized.');
  b.html('<div class="hud-row" style="margin-top:6px"><span class="hud-key">view</span><span class="hud-val" id="camera-view-display">-</span></div>');
  b.html('<div class="hud-row"><span class="hud-key">camera</span><span class="hud-val" id="camera-type-display">-</span></div>');
  b.html('<div class="hud-row"><span class="hud-key">rotate</span><span class="hud-val" id="camera-rotate-display">-</span></div>');

  const sliderOptions = (path, extra = {}) => ({
    syncGroup: 'camera',
    linkPath: `camera.${path}`,
    linkGetter: () => getCameraField(path),
    linkSetter: (v) => setCameraFieldFromUi(path, v),
    ...extra,
  });

  b.slider('position.x', state.cameraPanel.position, 'x', -500, 500, 0.001, sliderOptions('position.x', { fmt: (v) => v.toFixed(3) }));
  b.slider('position.y', state.cameraPanel.position, 'y', -500, 500, 0.001, sliderOptions('position.y', { fmt: (v) => v.toFixed(3) }));
  b.slider('position.z', state.cameraPanel.position, 'z', -500, 500, 0.001, sliderOptions('position.z', { fmt: (v) => v.toFixed(3) }));

  b.slider('target.x', state.cameraPanel.target, 'x', -500, 500, 0.001, sliderOptions('target.x', { fmt: (v) => v.toFixed(3) }));
  b.slider('target.y', state.cameraPanel.target, 'y', -500, 500, 0.001, sliderOptions('target.y', { fmt: (v) => v.toFixed(3) }));
  b.slider('target.z', state.cameraPanel.target, 'z', -500, 500, 0.001, sliderOptions('target.z', { fmt: (v) => v.toFixed(3) }));

  b.slider('orbit damping', state.cameraPanel.orbit, 'dampingFactor', 0, 1, 0.001, sliderOptions('orbit.dampingFactor', { fmt: (v) => v.toFixed(3) }));
  b.slider('rotate speed', state.cameraPanel.orbit, 'rotateSpeed', 0, 10, 0.01, sliderOptions('orbit.rotateSpeed', { fmt: (v) => v.toFixed(2) }));
  b.slider('zoom speed', state.cameraPanel.orbit, 'zoomSpeed', 0, 10, 0.01, sliderOptions('orbit.zoomSpeed', { fmt: (v) => v.toFixed(2) }));
  b.slider('pan speed', state.cameraPanel.orbit, 'panSpeed', 0, 10, 0.01, sliderOptions('orbit.panSpeed', { fmt: (v) => v.toFixed(2) }));
  b.slider('min distance', state.cameraPanel.orbit, 'minDistance', 0.01, 500, 0.01, sliderOptions('orbit.minDistance', { fmt: (v) => v.toFixed(2) }));
  b.slider('max distance', state.cameraPanel.orbit, 'maxDistance', 0.01, 1000, 0.01, sliderOptions('orbit.maxDistance', { fmt: (v) => v.toFixed(2) }));

  if (state.cameraPanel.viewMode === '3d') {
    b.slider('fov', state.cameraPanel.lens, 'fov', 10, 120, 0.1, sliderOptions('lens.fov', { fmt: (v) => v.toFixed(1) }));
    b.slider('near', state.cameraPanel.lens, 'near', 0.0001, 100, 0.0001, sliderOptions('lens.near', { fmt: (v) => v.toFixed(4) }));
    b.slider('far', state.cameraPanel.lens, 'far', 0.001, 5000, 0.01, sliderOptions('lens.far', { fmt: (v) => v.toFixed(3) }));
    b.slider('distance', state.cameraPanel, 'distance', 0.01, 1000, 0.01, sliderOptions('distance', {
      fmt: (v) => v.toFixed(3),
      dynamicBounds: () => ({
        min: Math.max(0.01, state.cameraPanel.orbit.minDistance),
        max: Math.max(state.cameraPanel.orbit.maxDistance, state.cameraPanel.orbit.minDistance + 0.01),
        step: 0.01,
      }),
    }));
  } else {
    b.slider('zoom', state.cameraPanel.lens, 'zoom', 0.01, 200, 0.01, sliderOptions('lens.zoom', { fmt: (v) => v.toFixed(3) }));
    b.slider('near', state.cameraPanel.lens, 'near', 0.0001, 100, 0.0001, sliderOptions('lens.near', { fmt: (v) => v.toFixed(4) }));
    b.slider('far', state.cameraPanel.lens, 'far', 0.001, 5000, 0.01, sliderOptions('lens.far', { fmt: (v) => v.toFixed(3) }));
  }

  updateCameraPanelReadouts();
  linkEngine.prune((path) => !path.startsWith('camera.') || activeCameraLinkedPaths.has(path));
}

function initCameraPanelBridge() {
  if (cameraPanelUnsubscribe) return;
  cameraPanelUnsubscribe = onCameraPanelChange((payload) => {
    if (!payload || typeof payload !== 'object') return;
    const prevView = state.cameraPanel.viewMode;
    applyCameraSnapshot(payload.snapshot);
    updateCameraPanelReadouts();
    if (state.cameraPanel.viewMode !== prevView) {
      buildCameraPanel();
      return;
    }
    refreshCameraSliderBounds();
    syncCameraSliderUi();
  });
}

// ── Audio Panel ──────────────────────────────────────────────

let audioContainer = null;
let _audioUnsub = null;
let _audioPanelOpen = false;

function _fmtTime(s) {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

function _renderAudioUI(container) {
  const st = audioPlayer.getState();
  container.innerHTML = '';

  const b = new UIBuilder(container);
  b.section('Audio', !_audioPanelOpen, {
    onToggle: (open) => { _audioPanelOpen = open; },
  });

  const body = b.currentBody;

  if (st.loading) {
    const empty = document.createElement('div');
    empty.className = 'audio-empty';
    empty.textContent = 'Loading tracks…';
    body.appendChild(empty);
    return;
  }

  if (st.tracks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'audio-empty';
    empty.textContent = 'No audio files found in audio/';
    body.appendChild(empty);
    return;
  }

  // Now Playing
  const nowPlaying = document.createElement('div');
  nowPlaying.className = 'audio-now-playing';
  const title = document.createElement('div');
  title.className = 'audio-now-title';
  title.textContent = st.currentIndex >= 0 ? st.tracks[st.currentIndex].title : '—';
  const timeDisp = document.createElement('div');
  timeDisp.className = 'audio-now-time';
  timeDisp.id = 'audio-time-display';
  timeDisp.textContent = `${_fmtTime(st.currentTime)} / ${_fmtTime(st.duration)}`;
  nowPlaying.appendChild(title);
  nowPlaying.appendChild(timeDisp);
  body.appendChild(nowPlaying);

  // Progress bar
  const progressWrap = document.createElement('div');
  progressWrap.className = 'audio-progress-wrap';
  const progressBar = document.createElement('div');
  progressBar.className = 'audio-progress-bar';
  progressBar.id = 'audio-progress-bar';
  const pct = st.duration > 0 ? (st.currentTime / st.duration) * 100 : 0;
  progressBar.style.width = `${pct}%`;
  progressWrap.appendChild(progressBar);
  progressWrap.addEventListener('click', (e) => {
    const rect = progressWrap.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioPlayer.seekTime(ratio * (audioPlayer.getState().duration || 0));
  });
  body.appendChild(progressWrap);

  // Transport buttons
  const transport = document.createElement('div');
  transport.className = 'audio-transport';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'audio-transport-btn ctrl-interactive';
  prevBtn.innerHTML = '⏮';
  prevBtn.title = 'Previous';
  prevBtn.addEventListener('click', () => audioPlayer.prev());

  const playBtn = document.createElement('button');
  playBtn.className = `audio-transport-btn audio-play-btn ctrl-interactive${st.playing ? ' playing' : ''}`;
  playBtn.innerHTML = st.playing ? '❚❚' : '▶';
  playBtn.title = st.playing ? 'Pause' : 'Play';
  playBtn.id = 'audio-play-btn';
  playBtn.addEventListener('click', () => audioPlayer.toggle());

  const nextBtn = document.createElement('button');
  nextBtn.className = 'audio-transport-btn ctrl-interactive';
  nextBtn.innerHTML = '⏭';
  nextBtn.title = 'Next';
  nextBtn.addEventListener('click', () => audioPlayer.next());

  transport.appendChild(prevBtn);
  transport.appendChild(playBtn);
  transport.appendChild(nextBtn);
  body.appendChild(transport);

  // Volume row
  const volRow = document.createElement('div');
  volRow.className = 'audio-volume-row';
  const volIcon = document.createElement('span');
  volIcon.className = 'audio-volume-icon';
  volIcon.textContent = st.volume > 0.5 ? '🔊' : st.volume > 0 ? '🔉' : '🔈';
  const volSlider = document.createElement('input');
  volSlider.type = 'range';
  volSlider.className = 'audio-volume-slider';
  volSlider.min = '0';
  volSlider.max = '1';
  volSlider.step = '0.01';
  volSlider.value = String(st.volume);
  const volPct = document.createElement('span');
  volPct.className = 'audio-volume-pct';
  volPct.textContent = `${Math.round(st.volume * 100)}%`;
  volSlider.addEventListener('input', () => {
    const v = parseFloat(volSlider.value);
    audioPlayer.setVolume(v);
    volPct.textContent = `${Math.round(v * 100)}%`;
    volIcon.textContent = v > 0.5 ? '🔊' : v > 0 ? '🔉' : '🔈';
  });
  volRow.appendChild(volIcon);
  volRow.appendChild(volSlider);
  volRow.appendChild(volPct);
  body.appendChild(volRow);

  // Track list
  const list = document.createElement('div');
  list.className = 'audio-track-list';
  st.tracks.forEach((track, i) => {
    const item = document.createElement('div');
    item.className = `audio-track-item${i === st.currentIndex ? ' active' : ''}`;
    item.addEventListener('click', () => audioPlayer.seekTo(i));

    const idx = document.createElement('span');
    idx.className = 'audio-track-index';
    idx.textContent = `${i + 1}`;

    const name = document.createElement('span');
    name.className = 'audio-track-name';
    name.textContent = track.title;

    const dur = document.createElement('span');
    dur.className = 'audio-track-dur';
    dur.textContent = track.duration > 0 ? _fmtTime(track.duration) : '';

    item.appendChild(idx);
    item.appendChild(name);
    item.appendChild(dur);
    list.appendChild(item);
  });
  body.appendChild(list);
}

function _updateAudioLive() {
  const st = audioPlayer.getState();

  // Time display
  const timeEl = document.getElementById('audio-time-display');
  if (timeEl) timeEl.textContent = `${_fmtTime(st.currentTime)} / ${_fmtTime(st.duration)}`;

  // Progress bar
  const bar = document.getElementById('audio-progress-bar');
  if (bar) {
    const pct = st.duration > 0 ? (st.currentTime / st.duration) * 100 : 0;
    bar.style.width = `${pct}%`;
  }

  // Play button state
  const playBtn = document.getElementById('audio-play-btn');
  if (playBtn) {
    playBtn.innerHTML = st.playing ? '❚❚' : '▶';
    playBtn.title = st.playing ? 'Pause' : 'Play';
    playBtn.classList.toggle('playing', st.playing);
  }
}

let _lastAudioRenderKey = '';

function _onAudioChange(st) {
  // Build a lightweight key for changes that require a full re-render
  const renderKey = `${st.currentIndex}|${st.tracks.length}|${st.loading}`;
  if (renderKey !== _lastAudioRenderKey) {
    _lastAudioRenderKey = renderKey;
    if (audioContainer) _renderAudioUI(audioContainer);
    return;
  }
  // Otherwise just update the live elements
  _updateAudioLive();
}

function buildAudioPanel() {
  if (!audioContainer) audioContainer = document.getElementById('audio-panel');
  if (!audioContainer) return;
  _renderAudioUI(audioContainer);
  if (!_audioUnsub) {
    _audioUnsub = audioPlayer.onChange(_onAudioChange);
  }
}

function buildProofPanel() {
  if (!proofsContainer) proofsContainer = document.getElementById('proofs-panel');
  if (!proofsContainer) return;

  proofsContainer.innerHTML = '';

  const b = new UIBuilder(proofsContainer);
  b.section('Proofs', state.proofPanelOpen !== true, {
    onToggle: (open) => {
      state.proofPanelOpen = open;
      if (open) updateProofPayload(true);
    },
  });
  b.info('Global formula kernel for chart generation and proof comparison.')
    .modeToggle(
      'formula',
      () => state.formulaMode,
      (v) => { state.formulaMode = (v === 'euler' ? 'euler' : 'tau'); },
      'tau',
      'euler',
      'Tau',
      'Euler',
    );
  b.info('Proof diagnostics for Euler/Tau equivalence across all base children.');
  b.info('P = strand-offset index used by E_proof. alpha = comparison base used by closure trace (alpha=tau => 1 step = 1 turn).');
  b.html(`
    <div class="ctrl-info arch-info" style="margin-top:6px">
      <div><strong>The Axiom</strong></div>
      <div>f = k1 * exp(i*tau^k) with mirrored - exponent branch</div>
      <div>Variants: (f), sin(f), cos(f), tan(f), log(f), log(sin/cos/tan)</div>
      <div>n-domain: [Z_min+1 ... Z_max-1] with 710-block color boundaries</div>
    </div>
  `);
  b.slider('proof offset P', state, 'P', 1, 200, 1, { fmt: (v) => v.toFixed(0) });
  b.slider('closure base alpha', state, 'alpha', 1, 20, 0.001, {
    fmt: (v) => {
      if (Math.abs(v - TAU) < 0.01) return `tau ~= ${TAU.toFixed(3)}`;
      return v.toFixed(3);
    },
  });
  b.toggle('show alpha trace', state.cinematicFx.ghostTraces, 'showAlpha');
  b.html('<div class="hud-row" style="margin-top:6px"><span class="hud-key">mean |ratio-1|</span><span class="hud-val" id="proof-summary-mean">-</span></div>');
  b.html('<div class="hud-row"><span class="hud-key">p95 |ratio-1|</span><span class="hud-val" id="proof-summary-p95">-</span></div>');
  b.html('<div class="hud-row"><span class="hud-key">max |ratio-1|</span><span class="hud-val" id="proof-summary-max">-</span></div>');
  b.html('<div class="hud-row"><span class="hud-key">samples</span><span class="hud-val" id="proof-summary-samples">-</span></div>');
  b.html('<div class="hud-row"><span class="hud-key">Closure(alpha)</span><span class="hud-val" id="proof-closure">-</span></div>');
  b.html('<div class="hud-row"><span class="hud-key">P1</span><span class="hud-val" id="proof-p1">-</span></div>');
  b.html('<div class="hud-row"><span class="hud-key">E_proof</span><span class="hud-val" id="proof-eproof">-</span></div>');
  b.html(`
    <div class="proof-table-wrap">
      <table class="proof-table">
        <thead>
          <tr>
            <th>set</th>
            <th>child</th>
            <th>n</th>
            <th>mean</th>
            <th>p95</th>
            <th>max</th>
          </tr>
        </thead>
        <tbody id="proof-rows-body"></tbody>
      </table>
    </div>
  `);

  if (state.proofPanelOpen) updateProofPayload(true);
}

function initHudPanel() {
  const header = document.getElementById('hud-header');
  const body = document.getElementById('hud-body');
  if (!header || !body) return;

  const sync = () => {
    const collapsed = state.hudPanelOpen !== true;
    header.classList.toggle('collapsed', collapsed);
    body.classList.toggle('collapsed', collapsed);
  };

  if (header.dataset.boundCollapse !== '1') {
    header.dataset.boundCollapse = '1';
    header.addEventListener('click', () => {
      state.hudPanelOpen = !state.hudPanelOpen;
      sync();
    });
  }
  sync();

  // Expressions sub-accordion (collapsed by default)
  const exprHeader = document.getElementById('expr-accordion-header');
  const exprBody = document.getElementById('expr-accordion-body');
  if (exprHeader && exprBody && exprHeader.dataset.boundCollapse !== '1') {
    exprHeader.dataset.boundCollapse = '1';
    exprHeader.addEventListener('click', () => {
      const wasCollapsed = exprBody.classList.contains('collapsed');
      exprHeader.classList.toggle('collapsed', !wasCollapsed);
      exprBody.classList.toggle('collapsed', !wasCollapsed);
      exprHeader.querySelector('.accordion-header-label').textContent =
        wasCollapsed ? '\u25bc Expressions' : '\u25b6 Expressions';
    });
  }
}

function buildControls() {
  if (!controlsContainer) controlsContainer = document.getElementById('controls-panel');
  const cameraSnapshot = getCameraPanelSnapshot();
  if (cameraSnapshot) applyCameraSnapshot(cameraSnapshot);
  state.expressionModel = normalizeExpressionModel(state.expressionModel);
  normalizeVisualHelpers();
  ensureFunctionControlSelection();
  deriveState();
  sliderUiSyncFns.length = 0;
  sliderBoundsSyncFns.length = 0;
  cameraSliderUiSyncFns.length = 0;
  cameraSliderBoundsSyncFns.length = 0;
  activeLinkedPaths.clear();
  activeCameraLinkedPaths.clear();
  controlsContainer.innerHTML = '';

  const b = new UIBuilder(controlsContainer);

  b.section('Mode')
    .toggle('Master enabled', state.cinematicFx.master, 'enabled', () => { applyVisualHelpers(); regenerate(); })
    .slider('Master intensity', state.cinematicFx.master, 'intensity', 0, 2, 0.01, { fmt: (v) => v.toFixed(2), linkPath: 'cinematic.master.intensity' })
    .toggleRow('Graphs', [
      { label: 'Points', obj: state.cinematicFx.points, key: 'enabled', onChange: () => regenerate(), linkPath: 'cinematic.points.opacity' },
      { label: 'Lines', obj: state.cinematicFx.atlasLines, key: 'enabled', onChange: () => regenerate(), linkPath: 'cinematic.atlasLines.opacity' },
    ])
    .toggleRow('Guides', [
      { label: 'Grid', obj: state.visualHelpers, key: 'grid', onChange: () => applyVisualHelpers(), linkPath: 'visualHelpers.gridOpacity' },
      { label: 'Ghost', obj: state.cinematicFx.ghostTraces, key: 'enabled', onChange: () => regenerate(), linkPath: 'cinematic.ghostTraces.opacity' },
      { label: 'Reference', obj: state.visualHelpers, key: 'referenceRings', onChange: () => applyVisualHelpers(), linkPath: 'visualHelpers.referenceOpacity' },
      { label: 'Orbit', obj: state.visualHelpers, key: 'orbitRing', onChange: () => applyVisualHelpers(), linkPath: 'visualHelpers.orbitOpacity' },
    ])
    .slider('Theme', state, 'themeBlend', 0, 1, 0.01, {
      fmt: (v) => v > 0.5 ? 'Light' : 'Dark',
      linkPath: 'themeBlend',
      onChange: (v) => { setTheme(v); setThemeBlend(v); },
    })
    .modeToggle('View', getViewMode, setViewMode, '3d', '2d', '3D', '2D')
    .modeToggle('Render', getRenderMode, setRenderMode, 'cinematic', 'performance', 'Cinematic', 'Performance')
    .toggleRow('Effects', [
      { label: 'Stars', obj: state.cinematicFx.stars, key: 'enabled', onChange: () => regenerate(), linkPath: 'cinematic.stars.opacity' },
      { label: 'Bloom', obj: state.cinematicFx.bloom, key: 'enabled', onChange: () => regenerate(), linkPath: 'cinematic.bloom.strength' },
      { label: 'Fog', obj: state.cinematicFx.fog, key: 'enabled', onChange: () => regenerate(), linkPath: 'cinematic.fog.density' },
      { label: 'Tone', obj: state.cinematicFx.tone, key: 'enabled', onChange: () => regenerate(), linkPath: 'cinematic.tone.exposure' },
    ], { cssClass: 'cinematic-only' })
    .childSection('Advanced FX', true, { cssClass: 'cinematic-only' })
    .slider('star rot Y', state.cinematicFx.stars, 'rotY', 0, 0.002, 0.0001, { fmt: (v) => v.toFixed(4), linkPath: 'cinematic.stars.rotY' })
    .slider('star rot X', state.cinematicFx.stars, 'rotX', 0, 0.001, 0.00005, { fmt: (v) => v.toFixed(5), linkPath: 'cinematic.stars.rotX' })
    .slider('star drift', state.cinematicFx.stars, 'drift', 0, 1, 0.01, { linkPath: 'cinematic.stars.drift' })
    .slider('bloom radius', state.cinematicFx.bloom, 'radius', 0, 1, 0.05, { linkPath: 'cinematic.bloom.radius' })
    .slider('bloom threshold', state.cinematicFx.bloom, 'threshold', 0, 1, 0.01, { linkPath: 'cinematic.bloom.threshold' });
  b.endChild();


  b.section('Traversal', true)
    .info('JSON-literal k: k={bool=0:T, bool>0:kAligned}. Playback is binary (play/pause) and uses deterministic stepping.')
    .slider('T', state, 'T', state.T_lowerBound, state.T_upperBound, getTSliderStep(), {
      fmt: (v) => v.toFixed(5),
      dynamicBounds: () => computeTraversalTBounds(state, getTSliderStep()),
      linkPath: 'T',
    })
    .html(`<div class="mode-row">
      <span class="slider-label">step loop</span>
      <button class="mode-pill ctrl-interactive" id="steploop-clamp">clamp</button>
      <button class="mode-pill ctrl-interactive" id="steploop-bounce">bounce</button>
    </div>`)
    .slider('b', state, 'b', 1, 100000000, 1, { fmt: (v) => v.toFixed(0), linkPath: 'b' })
    .html(`<div class="mode-row">
      <span class="slider-label">buffer mode</span>
      <button class="mode-pill ctrl-interactive" id="buffermode-off">off</button>
      <button class="mode-pill ctrl-interactive" id="buffermode-on">on</button>
    </div>`)
    .slider('buffer', state, 'precomputeBufferValue', 1, 600, 1, {
      fmt: (v) => state.precomputeBufferUnit === 'seconds' ? `${v.toFixed(2)}s` : `${Math.floor(v)}f`,
      commitMode: 'exact',
      dynamicBounds: () => (
        state.precomputeBufferUnit === 'seconds'
          ? { min: 0.1, max: 10, step: 0.05 }
          : { min: 1, max: 600, step: 1 }
      ),
      onCommit: (v) => {
        const next = state.precomputeBufferUnit === 'seconds'
          ? clamp(v, 0.1, 10)
          : clamp(Math.floor(v), 1, 600);
        state.precomputeBufferValue = next;
        state.precomputeBufferFrames = resolvePrecomputeBufferFrames(state.precomputeBufferUnit, next);
        state.bufferTargetFrames = state.precomputeBufferFrames;
        const derived = deriveState();
        const signature = computeMathSignature(derived, computePointBudget());
        if (state.bufferEnabled) beginHardPrefill(derived, signature, 'buffer target', false);
        else playbackBuffer.invalidate(signature, true);
        return {
          value: next,
          status: Math.abs(next - v) > 1e-12 ? 'normalized' : 'applied',
        };
      },
    })
    .html(`<div class="mode-row">
      <span class="slider-label">buffer unit</span>
      <button class="mode-pill ctrl-interactive" id="bufferunit-frames">frames</button>
      <button class="mode-pill ctrl-interactive" id="bufferunit-seconds">seconds</button>
    </div>`)
    .html(`<div class="mode-row">
      <span class="slider-label">T step source</span>
      <button class="mode-pill ctrl-interactive" id="tstep-sync-on">sync s</button>
      <button class="mode-pill ctrl-interactive" id="tstep-sync-off">fixed</button>
    </div>`)
    .html('<div class="hud-row" style="margin-top:6px"><span class="hud-key">Buffer</span><span class="hud-val" id="buffer-mode-display">OFF</span></div>')
    .html('<div class="hud-row"><span class="hud-key">Buffer cache</span><span class="hud-val" id="buffer-status-panel">-</span></div>');
  bindModeButtons(
    controlsContainer,
    'steploop',
    [{ value: 'clamp' }, { value: 'bounce' }],
    () => state.stepLoopMode,
    (v) => {
      state.stepLoopMode = v;
      if (v === 'clamp') _stepBounceDir = 1;
    },
  );
  bindModeButtons(
    controlsContainer,
    'buffermode',
    [{ value: 'off' }, { value: 'on' }],
    () => (state.bufferEnabled ? 'on' : 'off'),
    (v) => {
      state.bufferEnabled = v === 'on';
      const derived = deriveState();
      const signature = computeMathSignature(derived, computePointBudget());
      if (state.bufferEnabled) {
        beginHardPrefill(derived, signature, 'toggle on', true);
      } else {
        setBufferPhase('idle');
        state.bufferProgress = 0;
        state.bufferNotice = '';
        playbackBuffer.invalidate(signature, true);
        reseedPlaybackBuffer(derived, signature, true);
      }
      updateBufferStatus();
    },
  );
  bindModeButtons(
    controlsContainer,
    'tstep-sync',
    [{ value: 'on' }, { value: 'off' }],
    () => (state.syncTStepToS ? 'on' : 'off'),
    (v) => { state.syncTStepToS = v === 'on'; },
  );
  bindModeButtons(
    controlsContainer,
    'bufferunit',
    [{ value: 'frames' }, { value: 'seconds' }],
    () => state.precomputeBufferUnit,
    (v) => {
      state.precomputeBufferUnit = v === 'seconds' ? 'seconds' : 'frames';
      if (state.precomputeBufferUnit === 'seconds') {
        state.precomputeBufferValue = clamp(state.precomputeBufferValue, 0.1, 10);
      } else {
        state.precomputeBufferValue = clamp(Math.floor(state.precomputeBufferValue), 1, 600);
      }
      state.precomputeBufferFrames = resolvePrecomputeBufferFrames(state.precomputeBufferUnit, state.precomputeBufferValue);
      state.bufferTargetFrames = state.precomputeBufferFrames;
      const derived = deriveState();
      const signature = computeMathSignature(derived, computePointBudget());
      if (state.bufferEnabled) beginHardPrefill(derived, signature, 'buffer unit', false);
      else playbackBuffer.invalidate(signature, true);
    },
  );

  b.section('n Domain', true)
    .info('Canonical n = [Z_min+1 ... Z_max-1], with fixed 710 boundary coloring.')
    .slider('Z_min', state, 'Z_min', -50000, 0, 1, {
      fmt: (v) => v.toFixed(0),
      heavy: true,
      onCommit: (v) => applyZRangeCommit(state, 'Z_min', v),
    })
    .slider('Z_max', state, 'Z_max', 0, 50000, 1, {
      fmt: (v) => v.toFixed(0),
      heavy: true,
      onCommit: (v) => applyZRangeCommit(state, 'Z_max', v),
    })
    .slider('path budget', state, 'pathBudget', 10, 2000, 10, { fmt: (v) => v.toFixed(0), heavy: true });

  b.section('Scaling', true)
    .slider('l_base', state, 'l_base', 0.01, 20, 0.01, { fmt: (v) => v.toFixed(3), linkPath: 'l_base' })
    .slider('l_func', state, 'l_func', 0.01, 20, 0.01, { fmt: (v) => v.toFixed(3), linkPath: 'l_func' })
    .modeToggle('k alignment bool', 
      () => Number(state.kStepsInAlignmentsBool), 
      (v) => { state.kStepsInAlignmentsBool = v; }, 
      0, 1, '0', '1', 
      { linkPath: 'kStepsInAlignmentsBool' }
    );

  // Q-parameters are only visible if kStepsInAlignmentsBool === 1
  if (state.kStepsInAlignmentsBool === 1) {
    b.childSection('q-Scaling', false)
      .slider('q_scale (strands)', state, 'q_scale', 0, 50, 0.001, {
        fmt: (v) => v.toFixed(6),
        linkPath: 'q_scale',
        dynamicBounds: () => ({ min: 0, max: 50, step: state.q_scale_s || 0.001 }),
      })
      .slider('q_scale_b', state, 'q_scale_b', 1, 100000000, 1, { fmt: (v) => v.toFixed(0) })
      .slider('q_tauScale', state, 'q_tauScale', -10, 10, 1, { fmt: (v) => v.toFixed(0), linkPath: 'q_tauScale' })
      .modeToggle('q_bool', 
        () => Number(state.q_bool), 
        (v) => { state.q_bool = v; }, 
        0, 1, '0', '1', 
        { linkPath: 'q_bool' }
      )
      .modeToggle('q_correction', 
        () => Number(state.q_correction), 
        (v) => { state.q_correction = v; }, 
        0, 1, '0', '1', 
        { linkPath: 'q_correction' }
      );
    b.endChild();
  }

  b.slider('k2', state, 'k2', 0, 10, 0.01, { fmt: (v) => v.toFixed(3), linkPath: 'k2' })
   .slider('k3', state, 'k3', 0.01, 10, 0.01, { fmt: (v) => v.toFixed(3), linkPath: 'k3' });

  buildUnifiedFunctionControlSection(b);



  buildCameraPanel();
  const resetBtn = document.getElementById('btn-reset-camera');
  const shotBtn = document.getElementById('btn-screenshot');
  if (resetBtn) resetBtn.addEventListener('click', () => resetCamera());
  if (shotBtn) shotBtn.addEventListener('click', () => captureScreenshot());
  buildAudioPanel();
  buildProofPanel();
  linkEngine.prune((path) => {
    if (path.startsWith('camera.')) return activeCameraLinkedPaths.has(path);
    return activeLinkedPaths.has(path);
  });
  setText('formula-display', state.formulaMode === 'euler' ? 'Euler' : 'Tau');

  animation.onStateChange(() => {
    updateTransportUI();
    refreshSliderBounds();
    for (const sync of sliderUiSyncFns) sync();
    refreshCameraSliderBounds();
    syncCameraSliderUi();
    syncSliderReadOnlyState();
  });
  refreshSliderBounds();
  for (const sync of sliderUiSyncFns) sync();
  refreshCameraSliderBounds();
  syncCameraSliderUi();
}

function buildTransportBar() {
  const bar = document.getElementById('transport-bar');
  if (!bar) return;
  bar.innerHTML = '';

  const playBtn = document.createElement('button');
  playBtn.className = 'transport-btn-mini ctrl-interactive';
  playBtn.dataset.role = 'playpause';
  playBtn.innerHTML = animation.playing ? '&#10074;&#10074;' : '&#9654;';
  playBtn.title = animation.playing ? 'Pause' : 'Play';
  playBtn.addEventListener('click', () => {
    const wasPlaying = animation.playing;
    if (!wasPlaying && state.autoHidePanels && !isCollapsed()) {
      setCollapsed(true);
      buildTransportBar();
      hideTimelineForAutoHide();
    }
    // Start/stop timeline playback alongside animation
    if (!wasPlaying) {
      sceneManager.startPlayback();
      audioPlayer.play();
    } else {
      // Pausing — pause audio but keep timeline data intact
      audioPlayer.pause();
    }
    animation.toggle();
    deriveState();
    const signature = computeMathSignature(state, computePointBudget());
    if (!state.bufferEnabled) {
      reseedPlaybackBuffer(state, signature);
    } else if (!wasPlaying && animation.playing) {
      beginHardPrefill(state, signature, 'play start', false);
    }
    updateBufferStatus();
    updateTransportUI();
    syncSliderReadOnlyState();
  });

  const stopBtn = document.createElement('button');
  stopBtn.className = 'transport-btn-mini ctrl-interactive';
  stopBtn.dataset.role = 'stop';
  stopBtn.innerHTML = '&#9632;';
  stopBtn.title = 'Stop';
  stopBtn.addEventListener('click', () => {
    animation.stop();
    sceneManager.stopPlayback();
    audioPlayer.pause();
    if (state.autoHidePanels && isCollapsed()) {
      setCollapsed(false);
      buildTransportBar();
      restoreTimelineForAutoHide();
    }
    _stepBounceDir = 1;
    deriveState();
    const signature = computeMathSignature(state, computePointBudget());
    setBufferPhase('idle');
    state.bufferProgress = 0;
    state.bufferNotice = '';
    reseedPlaybackBuffer(state, signature, true);
    updateBufferStatus();
    regenerate(true);
    updateTransportUI();
    syncSliderReadOnlyState();
    for (const sync of sliderUiSyncFns) sync();
    syncCameraSliderUi();
  });

  const scrub = document.createElement('input');
  scrub.type = 'range';
  scrub.className = 'slider-input transport-scrub';
  scrub.min = 0;
  scrub.max = 1000;
  scrub.step = 1;
  scrub.value = `${animation.progress * 1000}`;
  scrub.addEventListener('input', () => {
    const value = parseFloat(scrub.value);
    const p = Number.isNaN(value) ? 0 : clamp(value / 1000, 0, 1);
    animation.seek(p);
    deriveState();
    const signature = computeMathSignature(state, computePointBudget());
    if (state.bufferEnabled) {
      beginHardPrefill(state, signature, 'scrub seek', true);
    } else {
      reseedPlaybackBuffer(state, signature, true);
    }
    updateBufferStatus();
    regenerate();
  });

  const timelineBtn = document.createElement('button');
  timelineBtn.className = 'transport-btn-mini ctrl-interactive';
  timelineBtn.innerHTML = '🎬';
  timelineBtn.title = 'Timeline / Scenes';
  timelineBtn.addEventListener('click', () => {
    const pnl = document.getElementById('timeline-panel');
    if (pnl) {
      if (pnl.dataset.visible === 'true') {
        pnl.dataset.visible = 'false';
        document.body.dataset.timelineState = 'hidden';
        document.body.classList.remove('tl-open');
      } else {
        pnl.dataset.visible = 'true';
        document.body.dataset.timelineState = 'expanded';
        document.body.classList.add('tl-open');
      }
    }
  });

  const gearBtn = document.createElement('button');
  gearBtn.className = 'transport-gear ctrl-interactive';
  gearBtn.innerHTML = '&#9776;';
  gearBtn.title = 'Toggle panels (Tab)';
  gearBtn.addEventListener('click', toggleCollapse);

  bar.appendChild(playBtn);
  bar.appendChild(stopBtn);
  bar.appendChild(scrub);
  bar.appendChild(timelineBtn);
  bar.appendChild(gearBtn);
}

function updateTransportUI() {
  const tScrub = document.querySelector('.transport-scrub');
  if (tScrub) tScrub.value = `${animation.progress * 1000}`;

  const playBtn = document.querySelector('.transport-btn-mini[data-role="playpause"]');
  if (playBtn) {
    playBtn.innerHTML = animation.playing ? '&#10074;&#10074;' : '&#9654;';
    playBtn.title = animation.playing ? 'Pause' : 'Play';
  }
}

function syncSliderReadOnlyState() {
  const isPlaying = typeof sceneManager !== 'undefined' && sceneManager && sceneManager.isPlaying();
  const containers = [
    document.getElementById('controls-container'), 
    document.getElementById('camera-accordion-body')
  ];
  
  containers.forEach(container => {
    if (!container) return;
    const inputs = container.querySelectorAll('.slider-input, .ctrl-interactive, input[type="number"], input[type="text"]');
    inputs.forEach(el => {
      if (el.classList.contains('panel-visibility-btn')) return;
      el.disabled = isPlaying;
      el.style.pointerEvents = isPlaying ? 'none' : 'auto';
      el.style.opacity = isPlaying ? '0.4' : '1';
    });
  });
}

function consumeBufferedPayload(derived, signature, budget, fx, stepsToConsume) {
  let latest = null;
  const steps = Math.max(1, Math.floor(Number.isFinite(stepsToConsume) ? stepsToConsume : 1));
  // Buffer consumption for step-based animation removed.
  return null;
}

function animationFrame() {
  const now = performance.now();
  const dtSeconds = Math.max(0, (now - _lastFrameMs) / 1000);
  _lastFrameMs = now;

  const changed = animation.update();
  if (changed) updateTransportUI();

  const derived = deriveState();
  // Sync slider UI (especially the live-thumb) when animation progress moves
  if (changed) {
    for (const sync of sliderUiSyncFns) sync();
    syncCameraSliderUi();
  }
  normalizeVisualHelpers();
  const fx = getEffectiveFx();
  const budget = computePointBudget();
  const signature = computeMathSignature(derived, budget);
  syncSignatureAndBufferState(derived, signature, 'frame');

  if (state.bufferEnabled) {
    if (state.bufferPhase === 'prefill') {
      // Still pre-filling — skip render, just update buffer status
      updateBufferStatus();
      return;
    }
    applyBufferTargetWithMemoryGuard(derived);
  }

  // Build and apply the render payload
  let payload = pendingRenderPayload;
  pendingRenderPayload = null;
  if (!payload || payload.signature !== signature || Math.abs(payload.derived.T - derived.T) > 1e-12) {
    payload = buildRenderPayload(derived, budget, signature, fx);
    payload.bounceDir = _stepBounceDir;
  }
  applyRenderPayload(payload, fx);
  updateProofPayload();

  // Background buffer fill when idle
  if (state.bufferEnabled && !animation.playing && state.bufferPhase !== 'prefill') {
    const bgBudget = computeAdaptiveBuildBudget({
      phase: 'background',
      fps: getCurrentFps(),
      depth: playbackBuffer.depth,
      target: state.bufferTargetFrames,
    });
    fillPlaybackBuffer(derived, signature, budget, bgBudget, fx);
  }
  updateBufferStatus();
}

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        {
          const wasPlaying = animation.playing;
          if (!wasPlaying && state.autoHidePanels && !isCollapsed()) {
            setCollapsed(true);
            buildTransportBar();
            hideTimelineForAutoHide();
          }
          if (!wasPlaying) {
            sceneManager.startPlayback();
            audioPlayer.play();
          } else {
            audioPlayer.pause();
          }
          animation.toggle();
          deriveState();
          const signature = computeMathSignature(state, computePointBudget());
          if (!state.bufferEnabled) {
            reseedPlaybackBuffer(state, signature);
          } else if (!wasPlaying && animation.playing) {
            beginHardPrefill(state, signature, 'play start', false);
          }
          updateBufferStatus();
          updateTransportUI();
          syncSliderReadOnlyState();
        }
        break;
      case 'Tab':
        e.preventDefault();
        toggleCollapse();
        buildTransportBar();
        break;
      case 'Escape':
        animation.stop();
        sceneManager.stopPlayback();
        audioPlayer.pause();
        if (state.autoHidePanels && isCollapsed()) {
          setCollapsed(false);
          buildTransportBar();
          restoreTimelineForAutoHide();
        }
        _stepBounceDir = 1;
        deriveState();
        setBufferPhase('idle');
        state.bufferProgress = 0;
        state.bufferNotice = '';
        reseedPlaybackBuffer(state, computeMathSignature(state, computePointBudget()), true);
        updateBufferStatus();
        regenerate(true);
        updateTransportUI();
        syncSliderReadOnlyState();
        break;
      case 'r':
      case 'R':
        resetCamera();
        break;
    }
  });
}

export function initControls() {
  initCameraPanelBridge();
  initHudPanel();
  buildControls();
  console.log('[function-control] registry coverage', registryCoverageSummary());
  buildTransportBar();
  setupKeyboard();
  initTimelinePanel();
  setExternalUpdate(animationFrame);
  regenerate();
  // Init audio player (async — doesn't block render)
  audioPlayer.init().then(() => {
    console.log(`[audio-player] ${audioPlayer.getState().tracks.length} track(s) discovered`);
  });
}







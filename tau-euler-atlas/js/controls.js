import { TAU } from './complex.js';
import {
  computeProofPayloadFromState,
  EXPRESSION_CHILDREN,
  generateAllPoints,
  generateAlphaTrace,
  generateAtlasPaths,
  generateTauTrace,
  setPointBudget,
} from './generators.js';
import {
  buildDerivedState,
  applyDerivedState,
  advanceStepTraversal,
  shouldAdvanceStep,
} from './derivation.js';
import {
  defaultExpressionModel,
  SET_KEYS,
  TRANSFORM_KEYS,
} from './expression-model.js';
import {
  updatePointCloud,
  updateStrandPaths,
  updateAtlasPaths,
  updateGhostTraces,
  updateOrbitCircle,
  setBloomEnabled,
  setBloomStrength,
  setBloomRadius,
  setBloomThreshold,
  setToneEnabled,
  setToneExposure,
  setFogEnabled,
  setFogDensity,
  setStarVisibility,
  setStarOpacity,
  setStarMotion,
  setHeavyEffectsSuspended,
  getCurrentFps,
  resetCamera,
  captureScreenshot,
  setExternalUpdate,
} from './scene.js';
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
  computeZRangeBounds,
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
  isPerformance,
} from './modes.js';
import {
  defaultCinematicFx,
  resolveEffectiveCinematicFx,
  resolveStyleBloomGain,
} from './cinematic-fx.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export const state = {
  T: 2,
  T_start: 1.99999,
  T_stop: 2,
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

  Z: 710,
  Z_min: 0,
  Z_max: 710,
  pathBudget: 500,

  l_base: 10,
  l_func: 10,
  kStepsInAlignmentsBool: 1,
  formulaMode: 'tau',

  q_scale: 1,
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
  hudPanelOpen: true,
  proofPanelOpen: false,
  proofResults: null,

  expressionModel: defaultExpressionModel(),
  cinematicFx: defaultCinematicFx(),
};

const TRANSFORM_LABELS = {
  base: 'base',
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  log_sin: 'log(sin)',
  log_cos: 'log(cos)',
  log_tan: 'log(tan)',
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

let regenerateTimeout = null;
let controlsContainer = null;
let proofsContainer = null;
let _lastFrameMs = performance.now();
let _stepBounceDir = 1;
let _bufferGenerationToken = 0;
const MAX_BUFFER_BYTES = DEFAULT_BUFFER_MAX_BYTES;

const sliderUiSyncFns = [];
const sliderBoundsSyncFns = [];
const playbackBuffer = new PlaybackPrecomputeBuffer();
let lastMathSignature = '';
let lastProofSignature = '';
let pendingRenderPayload = null;

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

function pushCommitStatus(row, status) {
  row.dataset.commitStatus = status;
  if (row._commitStatusTimer) clearTimeout(row._commitStatusTimer);
  row._commitStatusTimer = setTimeout(() => {
    if (row.dataset.commitStatus === status) row.dataset.commitStatus = '';
  }, 700);
}

export function deriveState() {
  return applyDerivedState(state);
}

function getTSliderStep() {
  if (!state.syncTStepToS) return 0.00001;
  const s = Math.abs(Number.isFinite(state.s) ? state.s : 0.00001);
  return clamp(s, 0.000001, 0.1);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
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

function computePointBudget() {
  return isPerformance() ? 50_000 : 200_000;
}

function computeMathSignature(derived, budget) {
  const renderMode = getRenderMode();
  const theme = getTheme();
  const styleBloomGain = resolveStyleBloomGain({ renderMode, theme });
  return JSON.stringify({
    budget,
    renderMode,
    theme,
    styleBloomGain,
    T_start: derived.T_start,
    T_stop: derived.T_stop,
    Z: derived.Z,
    Z_min: derived.Z_min,
    Z_max: derived.Z_max,
    formulaMode: derived.formulaMode,
    pathBudget: derived.pathBudget,
    l_base: derived.l_base,
    l_func: derived.l_func,
    kStepsInAlignmentsBool: derived.kStepsInAlignmentsBool,
    q_scale: derived.q_scale,
    q_tauScale: derived.q_tauScale,
    q_bool: derived.q_bool,
    q_correction: derived.q_correction,
    k2: derived.k2,
    k3: derived.k3,
    alpha: derived.alpha,
    P: derived.P,
    b: derived.b,
    stepLoopMode: derived.stepLoopMode,
    syncTStepToS: derived.syncTStepToS,
    precomputeBufferFrames: derived.precomputeBufferFrames,
    expressionModel: derived.expressionModel,
  });
}

function buildRenderPayload(derived, budget, signature) {
  const styleBloomGain = resolveStyleBloomGain({
    renderMode: getRenderMode(),
    theme: getTheme(),
  });
  const renderParams = { ...derived, styleBloomGain };
  setPointBudget(budget);
  const points = generateAllPoints(renderParams);
  const atlasPaths = generateAtlasPaths(renderParams);

  const alphaNotTau = Math.abs(derived.alpha - TAU) > 0.001;
  const tauTrace = generateTauTrace(256, derived.k);
  const alphaTrace = alphaNotTau ? generateAlphaTrace(derived.alpha, 256, derived.k) : null;

  return {
    signature,
    derived,
    points,
    atlasPaths,
    tauTrace,
    alphaTrace,
    showAlpha: alphaNotTau,
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
    setText('atlas-paths-display-panel', `${payload.atlasPaths.length} / ${state.pathBudget}`);

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
    setText('atlas-paths-display-panel', '-');
    setText('atlas-expr-display', '-');
  }

  const ghostEnabled = fx.ghostTraces.enabled && state.expressionModel.parent.enabled;
  if (ghostEnabled) {
    updateGhostTraces(payload.tauTrace, payload.alphaTrace, fx.ghostTraces.showAlpha && payload.showAlpha);
  } else {
    updateGhostTraces(null, null, false);
  }
  updateOrbitCircle(state.k);
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

function fillPlaybackBuffer(derived, signature, budget, maxBuild, generationToken = _bufferGenerationToken) {
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
      const advance = advanceStepTraversal({
        T,
        T_start: derived.T_start,
        T_stop: derived.T_stop,
        dtSeconds: 1 / PRECOMPUTE_FPS,
        s: derived.s,
        stepLoopMode: derived.stepLoopMode,
        bounceDir,
      });
      const nextBounceDir = derived.stepLoopMode === 'bounce' ? advance.bounceDir : 1;
      const nextDerived = buildDerivedState({ ...derived, T: advance.T });
      const payload = buildRenderPayload(nextDerived, budget, signature);
      payload.bounceDir = nextBounceDir;
      return {
        payload,
        nextT: nextDerived.T,
        nextBounceDir,
      };
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
  clearTimeout(regenerateTimeout);
  const delay = isHeavy ? 48 : 16;

  regenerateTimeout = setTimeout(() => {
    const derived = deriveState();
    refreshSliderBounds();
    const fx = resolveEffectiveCinematicFx(state.cinematicFx, {
      renderMode: getRenderMode(),
      theme: getTheme(),
    });
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
      payload = buildRenderPayload(derived, budget, signature);
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
      fillPlaybackBuffer(derived, signature, budget, bgBudget);
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
    } = options;
    const row = document.createElement('div');
    row.className = 'slider-row';
    const lbl = document.createElement('span');
    lbl.className = 'slider-label';
    lbl.textContent = label;

    let activeBounds = { min, max, step };
    const getCurrentBounds = () => {
      if (typeof dynamicBounds !== 'function') return { ...activeBounds };
      const next = dynamicBounds() || {};
      const nextMin = Number.isFinite(next.min) ? next.min : activeBounds.min;
      const nextMax = Number.isFinite(next.max) ? next.max : activeBounds.max;
      const nextStep = Number.isFinite(next.step) ? next.step : activeBounds.step;
      const orderedMin = Math.min(nextMin, nextMax);
      const orderedMax = Math.max(nextMin, nextMax);
      return { min: orderedMin, max: orderedMax, step: nextStep };
    };

    activeBounds = getCurrentBounds();

    const getBoundValue = () => {
      if (index !== null) return Number(obj[key][index]);
      return Number(obj[key]);
    };

    const setBoundValue = (v) => {
      if (index !== null) obj[key][index] = v;
      else obj[key] = v;
    };

    if (!Number.isFinite(getBoundValue())) setBoundValue(activeBounds.min);

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
    inputBase.value = String(getBoundValue());
    if (id) inputBase.id = id;
    trackWrap.appendChild(inputBase);

    const valueCluster = document.createElement('div');
    valueCluster.className = 'slider-value-cluster';
    const baseChip = document.createElement('button');
    baseChip.className = 'value-chip ctrl-interactive';
    valueCluster.appendChild(baseChip);

    const syncBounds = () => {
      const next = getCurrentBounds();
      activeBounds = next;
      inputBase.min = String(next.min);
      inputBase.max = String(next.max);
      inputBase.step = String(next.step);
    };
    sliderBoundsSyncFns.push(syncBounds);

    const syncUI = () => {
      syncBounds();
      const current = getBoundValue();
      inputBase.value = String(current);
      baseChip.textContent = format(current);
    };

    sliderUiSyncFns.push(syncUI);

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

      setBoundValue(next);

      if (triggerChange && onChange) onChange(next);
      refreshSliderBounds();
      syncUI();
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

    baseChip.addEventListener('click', () => {
      startInlineEdit(
        baseChip,
        () => getBoundValue(),
        (v) => commitBaseValue(v, { mode: commitMode, source: 'text' }),
      );
    });
    syncUI();

    row.appendChild(lbl);
    row.appendChild(trackWrap);
    row.appendChild(valueCluster);
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

  modeToggle(label, getter, setter, a, b, labelA, labelB) {
    const row = document.createElement('div');
    row.className = 'mode-toggle-row';
    const lbl = document.createElement('span');
    lbl.className = 'mode-label';
    lbl.textContent = label;
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
      regenerate();
    });
    btnB.addEventListener('click', () => {
      setter(b);
      setActive();
      regenerate();
    });

    group.appendChild(btnA);
    group.appendChild(btnB);
    row.appendChild(lbl);
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

function addTransformControls(b) {
  b.section('Transforms', false)
    .info('Enable/disable transform families. Default is sin-core only.');

  for (const key of TRANSFORM_KEYS) {
    const style = state.expressionModel.transforms[key];
    b.childSection(`${TRANSFORM_LABELS[key]}`, true, {
      visibility: { obj: style, key: 'enabled' },
    })
      .slider('point size x', style, 'pointSize', 0, 4, 0.05)
      .slider('point opacity x', style, 'pointOpacity', 0, 1, 0.05)
      .slider('line width x', style, 'lineWidth', 0, 4, 0.05)
      .slider('line opacity x', style, 'lineOpacity', 0, 1, 0.05)
      .slider('point bloom x', style, 'pointBloom', 0, 4, 0.05)
      .slider('line bloom x', style, 'lineBloom', 0, 4, 0.05);
    b.endChild();
  }
}

function addSetAndChildControls(b) {
  b.section('Function Sets', false)
    .info('Hierarchical controls: parent x set x transform x child.');

  for (const setKey of SET_KEYS) {
    const setLabel = setKey === 'positive' ? 'Positive' : 'Negative';
    const setStyle = state.expressionModel.sets[setKey];
    b.childSection(setLabel, false, {
      visibility: { obj: setStyle, key: 'enabled' },
    })
      .slider('point size x', setStyle, 'pointSize', 0, 4, 0.05)
      .slider('point opacity x', setStyle, 'pointOpacity', 0, 1, 0.05)
      .slider('line width x', setStyle, 'lineWidth', 0, 4, 0.05)
      .slider('line opacity x', setStyle, 'lineOpacity', 0, 1, 0.05)
      .slider('point bloom x', setStyle, 'pointBloom', 0, 4, 0.05)
      .slider('line bloom x', setStyle, 'lineBloom', 0, 4, 0.05);

    const parentBody = b.activeChildBody;
    if (parentBody) {
      const nested = new UIBuilder(parentBody);
      for (const child of EXPRESSION_CHILDREN[setKey]) {
        const childStyle = state.expressionModel.children[child.key];
        nested.childSection(child.label, true, {
          visibility: { obj: childStyle, key: 'enabled' },
        })
          .color('color', childStyle, 'color')
          .slider('point size x', childStyle, 'pointSize', 0, 4, 0.05)
          .slider('point opacity x', childStyle, 'pointOpacity', 0, 1, 0.05)
          .slider('line width x', childStyle, 'lineWidth', 0, 4, 0.05)
          .slider('line opacity x', childStyle, 'lineOpacity', 0, 1, 0.05)
          .slider('point bloom x', childStyle, 'pointBloom', 0, 4, 0.05)
          .slider('line bloom x', childStyle, 'lineBloom', 0, 4, 0.05);
        nested.endChild();
      }
    }
    b.endChild();
  }
}

function buildProofPanel() {
  if (!proofsContainer) proofsContainer = document.getElementById('proofs-panel');
  if (!proofsContainer) return;

  proofsContainer.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'accordion-panel';
  const header = document.createElement('div');
  const collapsed = state.proofPanelOpen !== true;
  header.className = `accordion-header${collapsed ? ' collapsed' : ''}`;
  header.textContent = 'Proofs';
  const body = document.createElement('div');
  body.className = `accordion-body${collapsed ? ' collapsed' : ''}`;

  header.addEventListener('click', () => {
    header.classList.toggle('collapsed');
    body.classList.toggle('collapsed');
    state.proofPanelOpen = !header.classList.contains('collapsed');
    if (state.proofPanelOpen) updateProofPayload(true);
  });

  wrap.appendChild(header);
  wrap.appendChild(body);
  proofsContainer.appendChild(wrap);

  const b = new UIBuilder(body);
  b.info('Proof diagnostics for Euler/Tau equivalence across all base children.');
  b.info('P = strand-offset index used by E_proof. alpha = comparison base used by closure trace (alpha=tau => 1 step = 1 turn).');
  b.html(`
    <div class="ctrl-info arch-info" style="margin-top:6px">
      <div><strong>The Axiom</strong></div>
      <div>f = k1 * exp(i*tau^k) with mirrored negative-imaginary branch</div>
      <div>Transforms: base, sin, cos, tan, log(sin/cos/tan)</div>
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
}

function buildControls() {
  if (!controlsContainer) controlsContainer = document.getElementById('controls-panel');
  deriveState();
  sliderUiSyncFns.length = 0;
  sliderBoundsSyncFns.length = 0;
  controlsContainer.innerHTML = '';

  const b = new UIBuilder(controlsContainer);

  b.section('Mode')
    .modeToggle('Theme', getTheme, setTheme, 'dark', 'light', 'Dark', 'Light')
    .modeToggle('Render', getRenderMode, setRenderMode, 'cinematic', 'performance', 'Cinematic', 'Performance')
    .modeToggle('View', getViewMode, setViewMode, '3d', '2d', '3D', '2D');

  b.section('Kernel', false)
    .info('Global formula kernel for chart generation and proof comparison.')
    .modeToggle(
      'formula',
      () => state.formulaMode,
      (v) => { state.formulaMode = (v === 'euler' ? 'euler' : 'tau'); },
      'tau',
      'euler',
      'Tau',
      'Euler',
    );

  b.section('Traversal', false)
    .info('JSON-literal k: k={bool=0:T, bool>0:kAligned}. Playback is binary (play/pause) and uses deterministic stepping.')
    .slider('T', state, 'T', state.T_start, state.T_stop, getTSliderStep(), {
      fmt: (v) => v.toFixed(6),
      commitMode: 'exact',
      dynamicBounds: () => computeTraversalTBounds(state, getTSliderStep()),
      onCommit: (v) => applyTraversalCommit(state, 'T', v),
    })
    .slider('T_start', state, 'T_start', -1000000, 1000000, 0.000001, {
      fmt: (v) => v.toFixed(6),
      commitMode: 'exact',
      onCommit: (v) => applyTraversalCommit(state, 'T_start', v),
    })
    .slider('T_stop', state, 'T_stop', -1000000, 1000000, 0.000001, {
      fmt: (v) => v.toFixed(6),
      commitMode: 'exact',
      onCommit: (v) => applyTraversalCommit(state, 'T_stop', v),
    })
    .html(`<div class="mode-row">
      <span class="slider-label">step loop</span>
      <button class="mode-pill ctrl-interactive" id="steploop-clamp">clamp</button>
      <button class="mode-pill ctrl-interactive" id="steploop-bounce">bounce</button>
    </div>`)
    .slider('b', state, 'b', 1, 100000000, 1, { fmt: (v) => v.toFixed(0) })
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

  b.section('n Domain', false)
    .info('Canonical n = [Z_min+1 ... Z_max-1], with fixed 710 boundary coloring.')
    .slider('Z', state, 'Z', 1, 50000, 1, {
      fmt: (v) => v.toFixed(0),
      heavy: true,
      onCommit: (v) => applyZRangeCommit(state, 'Z', v),
    })
    .slider('Z_min', state, 'Z_min', -state.Z, 0, 1, {
      fmt: (v) => v.toFixed(0),
      heavy: true,
      dynamicBounds: () => computeZRangeBounds(state).zMin,
      onCommit: (v) => applyZRangeCommit(state, 'Z_min', v),
    })
    .slider('Z_max', state, 'Z_max', 0, state.Z, 1, {
      fmt: (v) => v.toFixed(0),
      heavy: true,
      dynamicBounds: () => computeZRangeBounds(state).zMax,
      onCommit: (v) => applyZRangeCommit(state, 'Z_max', v),
    })
    .slider('path budget', state, 'pathBudget', 10, 2000, 10, { fmt: (v) => v.toFixed(0), heavy: true });

  b.section('Scaling', false)
    .slider('l_base', state, 'l_base', 0.01, 20, 0.01, { fmt: (v) => v.toFixed(3) })
    .slider('l_func', state, 'l_func', 0.01, 20, 0.01, { fmt: (v) => v.toFixed(3) })
    .html(`<div class="mode-row">
      <span class="slider-label">k alignment bool</span>
      <button class="mode-pill ctrl-interactive" id="kbool-0">0</button>
      <button class="mode-pill ctrl-interactive" id="kbool-1">1</button>
    </div>`)
    .slider('q_scale (strands)', state, 'q_scale', 0, 50, 0.001, { fmt: (v) => v.toFixed(3) })
    .slider('q_tauScale', state, 'q_tauScale', -10, 10, 1, { fmt: (v) => v.toFixed(0) })
    .html(`<div class="mode-row">
      <span class="slider-label">q_bool</span>
      <button class="mode-pill ctrl-interactive" id="qbool-0">0</button>
      <button class="mode-pill ctrl-interactive" id="qbool-1">1</button>
    </div>`)
    .html(`<div class="mode-row">
      <span class="slider-label">q_correction</span>
      <button class="mode-pill ctrl-interactive" id="qcorr-0">0</button>
      <button class="mode-pill ctrl-interactive" id="qcorr-1">1</button>
    </div>`)
    .slider('k2', state, 'k2', 0, 10, 0.01, { fmt: (v) => v.toFixed(3) })
    .slider('k3', state, 'k3', 0.01, 10, 0.01, { fmt: (v) => v.toFixed(3) });

  bindModeButtons(
    controlsContainer,
    'kbool',
    [{ value: '0' }, { value: '1' }],
    () => String(state.kStepsInAlignmentsBool),
    (v) => { state.kStepsInAlignmentsBool = Number(v); },
  );
  bindModeButtons(
    controlsContainer,
    'qbool',
    [{ value: '0' }, { value: '1' }],
    () => String(state.q_bool),
    (v) => { state.q_bool = Number(v); },
  );
  bindModeButtons(
    controlsContainer,
    'qcorr',
    [{ value: '0' }, { value: '1' }],
    () => String(state.q_correction),
    (v) => { state.q_correction = Number(v); },
  );

  b.section('Expression Parent', false, {
    visibility: { obj: state.expressionModel.parent, key: 'enabled' },
  })
    .slider('point size', state.expressionModel.parent, 'pointSize', 0, 6, 0.05)
    .slider('point opacity', state.expressionModel.parent, 'pointOpacity', 0, 1, 0.01)
    .slider('line width', state.expressionModel.parent, 'lineWidth', 0, 6, 0.05)
    .slider('line opacity', state.expressionModel.parent, 'lineOpacity', 0, 1, 0.01)
    .slider('point bloom', state.expressionModel.parent, 'pointBloom', 0, 4, 0.05)
    .slider('line bloom', state.expressionModel.parent, 'lineBloom', 0, 4, 0.05);

  addSetAndChildControls(b);
  addTransformControls(b);

  b.section('Cinematic', isPerformance())
    .info('Keep effects active; style bloom is controlled per hierarchy above.')
    .toggle('Master enabled', state.cinematicFx.master, 'enabled')
    .slider('Master intensity', state.cinematicFx.master, 'intensity', 0, 2, 0.01, { fmt: (v) => v.toFixed(2) })
    .toggle('Points', state.cinematicFx.points, 'enabled')
    .toggle('Lines', state.cinematicFx.atlasLines, 'enabled')
    .toggle('Ghost traces', state.cinematicFx.ghostTraces, 'enabled')
    .toggle('Stars', state.cinematicFx.stars, 'enabled')
    .toggle('Bloom', state.cinematicFx.bloom, 'enabled')
    .toggle('Fog', state.cinematicFx.fog, 'enabled')
    .toggle('Tone', state.cinematicFx.tone, 'enabled')
    .childSection('Advanced FX', true)
    .slider('star opacity', state.cinematicFx.stars, 'opacity', 0, 1, 0.01)
    .slider('star rot Y', state.cinematicFx.stars, 'rotY', 0, 0.002, 0.0001, { fmt: (v) => v.toFixed(4) })
    .slider('star rot X', state.cinematicFx.stars, 'rotX', 0, 0.001, 0.00005, { fmt: (v) => v.toFixed(5) })
    .slider('star drift', state.cinematicFx.stars, 'drift', 0, 1, 0.01)
    .slider('bloom strength', state.cinematicFx.bloom, 'strength', 0, 2, 0.05)
    .slider('bloom radius', state.cinematicFx.bloom, 'radius', 0, 1, 0.05)
    .slider('bloom threshold', state.cinematicFx.bloom, 'threshold', 0, 1, 0.01)
    .slider('fog density', state.cinematicFx.fog, 'density', 0, 0.01, 0.0001, { fmt: (v) => v.toFixed(4) })
    .slider('tone exposure', state.cinematicFx.tone, 'exposure', 0.5, 3, 0.01);
  b.endChild();

  b.section('Atlas', false)
    .html('<div class="hud-row" style="margin-top:4px"><span class="hud-key">Active paths</span><span class="hud-val" id="atlas-paths-display-panel">â€”</span></div>')
    .html('<div class="hud-row"><span class="hud-key">Expressions</span><pre class="hud-val" id="atlas-expr-display" style="font-size:9px;margin:2px 0 0;white-space:pre-line;line-height:1.4;font-family:var(--mono)">â€”</pre></div>');

  b.section('View')
    .html('<div class="preset-row"><button class="preset-btn ctrl-interactive" id="btn-reset-camera">â†» Reset Camera</button><button class="preset-btn ctrl-interactive" id="btn-screenshot">ðŸ“· Screenshot</button></div>');
  const resetBtn = controlsContainer.querySelector('#btn-reset-camera');
  const shotBtn = controlsContainer.querySelector('#btn-screenshot');
  if (resetBtn) resetBtn.addEventListener('click', () => resetCamera());
  if (shotBtn) shotBtn.addEventListener('click', () => captureScreenshot());
  buildProofPanel();
  setText('formula-display', state.formulaMode === 'euler' ? 'Euler' : 'Tau');

  animation.onStateChange(() => {
    updateTransportUI();
    refreshSliderBounds();
    for (const sync of sliderUiSyncFns) sync();
  });
  refreshSliderBounds();
  for (const sync of sliderUiSyncFns) sync();
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
  });

  const stopBtn = document.createElement('button');
  stopBtn.className = 'transport-btn-mini ctrl-interactive';
  stopBtn.dataset.role = 'stop';
  stopBtn.innerHTML = '&#9632;';
  stopBtn.title = 'Stop';
  stopBtn.addEventListener('click', () => {
    animation.stop();
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
  });

  const scrub = document.createElement('input');
  scrub.type = 'range';
  scrub.className = 'slider-input transport-scrub';
  scrub.min = 0;
  scrub.max = 1000;
  scrub.step = 1;
  scrub.value = `${animation.progress * 1000}`;
  scrub.addEventListener('input', () => {
    const p = parseFloat(scrub.value) / 1000;
    animation.seek(p);
    deriveState();
    const nextT = state.T_start + ((state.T_stop - state.T_start) * p);
    const commit = applyTraversalCommit(state, 'T', nextT);
    state.T = commit.value;
    _stepBounceDir = 1;
    const signature = computeMathSignature(state, computePointBudget());
    if (state.bufferEnabled) {
      beginHardPrefill(state, signature, 'scrub seek', true);
    } else {
      reseedPlaybackBuffer(state, signature, true);
    }
    updateBufferStatus();
    regenerate();
  });

  const gearBtn = document.createElement('button');
  gearBtn.className = 'transport-gear ctrl-interactive';
  gearBtn.innerHTML = '&#9776;';
  gearBtn.title = 'Toggle panels (Tab)';
  gearBtn.addEventListener('click', toggleCollapse);

  bar.appendChild(playBtn);
  bar.appendChild(stopBtn);
  bar.appendChild(scrub);
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

function consumeBufferedPayload(derived, signature, budget, stepsToConsume) {
  let latest = null;
  const steps = Math.max(1, Math.floor(Number.isFinite(stepsToConsume) ? stepsToConsume : 1));
  for (let i = 0; i < steps; i++) {
    let frame = playbackBuffer.consume();
    if (!frame) {
      const advance = advanceStepTraversal({
        T: derived.T,
        T_start: derived.T_start,
        T_stop: derived.T_stop,
        dtSeconds: 1 / PRECOMPUTE_FPS,
        s: derived.s,
        stepLoopMode: derived.stepLoopMode,
        bounceDir: _stepBounceDir,
      });
      _stepBounceDir = derived.stepLoopMode === 'bounce' ? advance.bounceDir : 1;
      const fallbackDerived = buildDerivedState({ ...derived, T: advance.T });
      frame = buildRenderPayload(fallbackDerived, budget, signature);
      frame.bounceDir = _stepBounceDir;
      derived = fallbackDerived;
    } else {
      _stepBounceDir = frame.bounceDir ?? _stepBounceDir;
      derived = frame.derived;
    }
    latest = frame;
  }
  return latest;
}

function animationFrame() {
  const now = performance.now();
  const dtSeconds = Math.max(0, (now - _lastFrameMs) / 1000);
  _lastFrameMs = now;

  const changed = animation.update();
  if (changed) updateTransportUI();

  const derived = deriveState();
  const budget = computePointBudget();
  const signature = computeMathSignature(derived, budget);
  syncSignatureAndBufferState(derived, signature, 'frame');

  if (!state.bufferEnabled) {
    setBufferPhase('idle');
    state.bufferProgress = 0;
    state.bufferNotice = '';
    if (shouldAdvanceStep(state, animation.playing)) {
      const advance = advanceStepTraversal({
        T: derived.T,
        T_start: derived.T_start,
        T_stop: derived.T_stop,
        dtSeconds,
        s: derived.s,
        stepLoopMode: derived.stepLoopMode,
        bounceDir: _stepBounceDir,
      });
      _stepBounceDir = derived.stepLoopMode === 'bounce' ? advance.bounceDir : 1;
      if (Math.abs(advance.T - state.T) > 1e-12) {
        const nextDerived = buildDerivedState({ ...derived, T: advance.T });
        state.T = nextDerived.T;
        pendingRenderPayload = buildRenderPayload(nextDerived, budget, signature);
        regenerate();
      }
    }
    updateBufferStatus();
    return;
  }

  const target = applyBufferTargetWithMemoryGuard(derived);
  const prefillMinDepth = computePrefillMinDepth(target);
  const fps = getCurrentFps();

  if (state.bufferPhase === 'prefill') {
    const prefillBudget = computeAdaptiveBuildBudget({
      phase: 'prefill',
      fps,
      depth: playbackBuffer.depth,
      target,
    });
    fillPlaybackBuffer(derived, signature, budget, prefillBudget, _bufferGenerationToken);
    state.bufferProgress = computeBufferProgress(playbackBuffer.depth, prefillMinDepth);

    if (playbackBuffer.depth >= prefillMinDepth) {
      setBufferPhase('background');
      state.bufferProgress = 1;
      if (state.bufferNotice.startsWith('play start') || state.bufferNotice.startsWith('scrub') || state.bufferNotice.startsWith('frame') || state.bufferNotice.startsWith('regenerate') || state.bufferNotice.startsWith('toggle on') || state.bufferNotice.startsWith('buffer')) {
        state.bufferNotice = '';
      }
    }
    updateBufferStatus();
    return;
  }

  if (shouldAdvanceStep(state, animation.playing)) {
    const consumeCount = Math.max(1, Math.min(8, Math.round(dtSeconds * PRECOMPUTE_FPS)));
    const frame = consumeBufferedPayload(derived, signature, budget, consumeCount);
    if (frame && Math.abs(frame.derived.T - state.T) > 1e-12) {
      state.T = frame.derived.T;
      pendingRenderPayload = frame;
      regenerate();
    }
  }

  if (playbackBuffer.depth < target) {
    const backgroundBudget = computeAdaptiveBuildBudget({
      phase: 'background',
      fps,
      depth: playbackBuffer.depth,
      target,
    });
    const refillDerived = buildDerivedState(state);
    fillPlaybackBuffer(refillDerived, signature, budget, backgroundBudget, _bufferGenerationToken);
  }
  state.bufferProgress = 1;
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
        }
        break;
      case 'Tab':
        e.preventDefault();
        toggleCollapse();
        buildTransportBar();
        break;
      case 'Escape':
        animation.stop();
        _stepBounceDir = 1;
        deriveState();
        setBufferPhase('idle');
        state.bufferProgress = 0;
        state.bufferNotice = '';
        reseedPlaybackBuffer(state, computeMathSignature(state, computePointBudget()), true);
        updateBufferStatus();
        regenerate(true);
        updateTransportUI();
        break;
      case 'r':
      case 'R':
        resetCamera();
        break;
    }
  });
}

export function initControls() {
  initHudPanel();
  buildControls();
  buildTransportBar();
  setupKeyboard();
  setExternalUpdate(animationFrame);
  regenerate();
}







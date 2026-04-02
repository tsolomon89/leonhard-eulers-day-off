import { TAU } from './complex.js';
import {
  computeEProofFromState,
  EXPRESSION_CHILDREN,
  generateAllPoints,
  generateAlphaTrace,
  generateAtlasPaths,
  generateTauTrace,
  setPointBudget,
} from './generators.js';
import {
  applyDerivedState,
  computeStepDelta,
  shouldAdvanceStep,
} from './derivation.js';
import {
  defaultExpressionModel,
  normalizeExpressionModel,
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
  resetCamera,
  captureScreenshot,
  setExternalUpdate,
} from './scene.js';
import { animation } from './animation.js';
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
  normalizeStateCinematicFx,
  resolveEffectiveCinematicFx,
} from './cinematic-fx.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export const state = {
  T: 2,
  T_start: 1.99999,
  T_stop: 2,
  timeMode: 'animation',
  b: 36000000,
  stepRate: 1,
  syncTStepToS: true,

  Z: 710,
  Z_min: 0,
  Z_max: 710,
  numStrands: 1,
  pathBudget: 500,

  l_base: 10,
  l_func: 10,
  kStepsInAlignmentsBool: 1,

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

let regenerateTimeout = null;
let controlsContainer = null;
let _lastFrameMs = performance.now();

export function deriveState() {
  applyDerivedState(state);
  state.expressionModel = normalizeExpressionModel(state.expressionModel);
  normalizeStateCinematicFx(state);
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

export function regenerate(isHeavy = false) {
  clearTimeout(regenerateTimeout);
  const delay = isHeavy ? 48 : 16;

  regenerateTimeout = setTimeout(() => {
    deriveState();
    const fx = resolveEffectiveCinematicFx(state.cinematicFx, { renderMode: getRenderMode() });

    setBloomEnabled(fx.bloom.enabled);
    setBloomStrength(fx.bloom.strength);
    setBloomRadius(fx.bloom.radius);
    setBloomThreshold(fx.bloom.threshold);
    setToneEnabled(fx.tone.enabled);
    setToneExposure(fx.tone.exposure);
    setFogEnabled(fx.fog.enabled);
    setFogDensity(fx.fog.density);
    setStarVisibility(fx.stars.enabled);
    setStarOpacity(fx.stars.opacity);
    setStarMotion(fx.stars.rotX, fx.stars.rotY, fx.stars.drift);

    const budget = isPerformance() ? 50_000 : 200_000;
    setPointBudget(budget);

    const pointsEnabled = fx.points.enabled && fx.points.opacity > 0.001 && state.expressionModel.parent.enabled;
    if (pointsEnabled) {
      const data = generateAllPoints(state);
      updatePointCloud(data, fx.points.size * fx.points.k3, fx.points.opacity);
      if (data.meta) {
        const m = data.meta;
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
        setText('budget-display', `${data.count.toLocaleString()} / ${data.budget.toLocaleString()}`);
      }
    } else {
      updatePointCloud({
        positions: new Float32Array(0),
        colors: new Float32Array(0),
        sizes: new Float32Array(0),
        count: 0,
      }, 0, 0);
      setText('budget-display', '—');
    }

    updateStrandPaths(null, 0, 0, false);

    const lineEnabled = fx.atlasLines.enabled && fx.atlasLines.opacity > 0.001 && state.expressionModel.parent.enabled;
    if (lineEnabled) {
      const atlasPaths = generateAtlasPaths(state);
      updateAtlasPaths(atlasPaths, fx.atlasLines.width, fx.atlasLines.opacity);
      setText('atlas-paths-display', `${atlasPaths.length} / ${state.pathBudget}`);
      setText('atlas-paths-display-panel', `${atlasPaths.length} / ${state.pathBudget}`);

      if (atlasPaths.length > 0) {
        const labels = new Set();
        for (const p of atlasPaths) {
          if (!p.tag) continue;
          labels.add(`${p.tag.set}·${p.tag.child}·${p.tag.transform}`);
        }
        setText('atlas-expr-display', [...labels].slice(0, 12).join('\n'));
      } else {
        setText('atlas-expr-display', '—');
      }
    } else {
      updateAtlasPaths(null, 0, 0);
      setText('atlas-paths-display', '—');
      setText('atlas-paths-display-panel', '—');
      setText('atlas-expr-display', '—');
    }

    const alphaNotTau = Math.abs(state.alpha - TAU) > 0.001;
    const ghostEnabled = fx.ghostTraces.enabled && state.expressionModel.parent.enabled;
    if (ghostEnabled) {
      const tauTrace = generateTauTrace(256, state.k);
      const alphaTrace = alphaNotTau ? generateAlphaTrace(state.alpha, 256, state.k) : null;
      updateGhostTraces(tauTrace, alphaTrace, fx.ghostTraces.showAlpha && alphaNotTau);
    } else {
      updateGhostTraces(null, null, false);
    }
    updateOrbitCircle(state.k);

    const stepsToClose = (TAU / state.alpha).toFixed(4);
    const closureMsg = alphaNotTau ? `α: ${stepsToClose} steps` : 'α = τ → 1 step = 1 turn';
    setText('closure-display', closureMsg);
    setText('closure-display-panel', closureMsg);

    const proof = computeEProofFromState(state);
    state.P1 = proof.P1;
    state.eProof = proof.value;
    const eProofMsg = Number.isFinite(state.eProof) ? state.eProof.toFixed(6) : '—';
    setText('eproof-display', eProofMsg);
    setText('eproof-display-panel', eProofMsg);
    setText('p1-display-panel', Number.isFinite(state.P1) ? state.P1.toFixed(6) : '—');
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

  section(title, collapsed = false) {
    const wrap = document.createElement('div');
    wrap.className = 'accordion-panel';
    const head = document.createElement('div');
    head.className = `accordion-header${collapsed ? ' collapsed' : ''}`;
    head.textContent = title;
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

  childSection(title, collapsed = true) {
    const wrap = document.createElement('div');
    wrap.className = 'accordion-child-panel';
    const head = document.createElement('div');
    head.className = `accordion-child-header${collapsed ? ' collapsed' : ''}`;
    head.textContent = title;
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
    const { fmt, onChange, heavy = false, id = null } = options;
    const row = document.createElement('div');
    row.className = 'slider-row';
    const lbl = document.createElement('span');
    lbl.className = 'slider-label';
    lbl.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'slider-input';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(obj[key]);
    if (id) input.id = id;
    const val = document.createElement('span');
    val.className = 'slider-value';
    const format = (v) => {
      if (fmt) return fmt(v);
      if (step >= 1) return `${Math.round(v)}`;
      return v.toFixed(3);
    };
    val.textContent = format(Number(obj[key]));

    input.addEventListener('input', () => {
      obj[key] = parseFloat(input.value);
      val.textContent = format(Number(obj[key]));
      if (onChange) onChange(obj[key]);
      regenerate(heavy);
    });

    row.appendChild(lbl);
    row.appendChild(input);
    row.appendChild(val);
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
  for (const opt of options) {
    const btn = container.querySelector(`#${prefix}-${opt.value}`);
    if (!btn) continue;
    btn.classList.toggle('active', currentValue() === opt.value);
    btn.addEventListener('click', () => {
      onSet(opt.value);
      regenerate();
      buildControls();
    });
  }
}

function addTransformControls(b) {
  b.section('Transforms', false)
    .info('Enable/disable transform families. Default is sin-core only.');

  for (const key of TRANSFORM_KEYS) {
    const style = state.expressionModel.transforms[key];
    b.childSection(`${TRANSFORM_LABELS[key]}`, true)
      .toggle('enabled', style, 'enabled')
      .slider('point size ×', style, 'pointSize', 0, 4, 0.05)
      .slider('point opacity ×', style, 'pointOpacity', 0, 1, 0.05)
      .slider('line width ×', style, 'lineWidth', 0, 4, 0.05)
      .slider('line opacity ×', style, 'lineOpacity', 0, 1, 0.05)
      .slider('point bloom ×', style, 'pointBloom', 0, 4, 0.05)
      .slider('line bloom ×', style, 'lineBloom', 0, 4, 0.05);
    b.endChild();
  }
}

function addSetAndChildControls(b) {
  b.section('Function Sets', false)
    .info('Hierarchical controls: parent × set × transform × child.');

  for (const setKey of SET_KEYS) {
    const setStyle = state.expressionModel.sets[setKey];
    b.childSection(`${setKey} set`, false)
      .toggle('enabled', setStyle, 'enabled')
      .slider('point size ×', setStyle, 'pointSize', 0, 4, 0.05)
      .slider('point opacity ×', setStyle, 'pointOpacity', 0, 1, 0.05)
      .slider('line width ×', setStyle, 'lineWidth', 0, 4, 0.05)
      .slider('line opacity ×', setStyle, 'lineOpacity', 0, 1, 0.05)
      .slider('point bloom ×', setStyle, 'pointBloom', 0, 4, 0.05)
      .slider('line bloom ×', setStyle, 'lineBloom', 0, 4, 0.05);

    for (const child of EXPRESSION_CHILDREN[setKey]) {
      const childStyle = state.expressionModel.children[child.key];
      b.childSection(child.label, true)
        .toggle('enabled', childStyle, 'enabled')
        .color('color', childStyle, 'color')
        .slider('point size ×', childStyle, 'pointSize', 0, 4, 0.05)
        .slider('point opacity ×', childStyle, 'pointOpacity', 0, 1, 0.05)
        .slider('line width ×', childStyle, 'lineWidth', 0, 4, 0.05)
        .slider('line opacity ×', childStyle, 'lineOpacity', 0, 1, 0.05)
        .slider('point bloom ×', childStyle, 'pointBloom', 0, 4, 0.05)
        .slider('line bloom ×', childStyle, 'lineBloom', 0, 4, 0.05);
      b.endChild();
    }
    b.endChild();
  }
}

function buildControls() {
  if (!controlsContainer) controlsContainer = document.getElementById('controls-panel');
  deriveState();
  controlsContainer.innerHTML = '';

  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'collapse-btn ctrl-interactive';
  collapseBtn.innerHTML = '✕';
  collapseBtn.addEventListener('click', toggleCollapse);
  controlsContainer.appendChild(collapseBtn);

  const b = new UIBuilder(controlsContainer);

  b.section('Mode')
    .modeToggle('Theme', getTheme, setTheme, 'dark', 'light', 'Dark', 'Light')
    .modeToggle('Render', getRenderMode, setRenderMode, 'cinematic', 'performance', 'Cinematic', 'Performance')
    .modeToggle('View', getViewMode, setViewMode, '3d', '2d', '3D', '2D');

  b.section('Traversal', false)
    .info('JSON-literal k: k={bool=0:T, bool>0:kAligned}.')
    .slider('T', state, 'T', state.T_start, state.T_stop, getTSliderStep(), { fmt: (v) => v.toFixed(6) })
    .slider('T_start', state, 'T_start', 0.000001, 10, 0.000001, {
      fmt: (v) => v.toFixed(6),
      onChange: () => {
        if (state.T_start > state.T_stop) state.T_stop = state.T_start;
        state.T = clamp(state.T, state.T_start, state.T_stop);
      },
    })
    .slider('T_stop', state, 'T_stop', 0.000001, 10, 0.000001, {
      fmt: (v) => v.toFixed(6),
      onChange: () => {
        if (state.T_stop < state.T_start) state.T_start = state.T_stop;
        state.T = clamp(state.T, state.T_start, state.T_stop);
      },
    })
    .html(`<div class="mode-row">
      <span class="slider-label">time mode</span>
      <button class="mode-pill ctrl-interactive" id="timemode-animation">animation</button>
      <button class="mode-pill ctrl-interactive" id="timemode-step">step</button>
    </div>`)
    .slider('b', state, 'b', 1, 100000000, 1, { fmt: (v) => v.toFixed(0) })
    .slider('stepRate', state, 'stepRate', -100, 100, 0.01, { fmt: (v) => v.toFixed(2) })
    .html(`<div class="mode-row">
      <span class="slider-label">T step source</span>
      <button class="mode-pill ctrl-interactive" id="tstep-sync-on">sync s</button>
      <button class="mode-pill ctrl-interactive" id="tstep-sync-off">fixed</button>
    </div>`);

  bindModeButtons(
    controlsContainer,
    'timemode',
    [{ value: 'animation' }, { value: 'step' }],
    () => state.timeMode,
    (v) => { state.timeMode = v; },
  );
  bindModeButtons(
    controlsContainer,
    'tstep-sync',
    [{ value: 'on' }, { value: 'off' }],
    () => (state.syncTStepToS ? 'on' : 'off'),
    (v) => { state.syncTStepToS = v === 'on'; },
  );

  b.section('n Domain', false)
    .info('Canonical n = [Z_min ... Z_max-1], with fixed 710 boundary coloring.')
    .slider('Z', state, 'Z', 1, 50000, 1, {
      fmt: (v) => v.toFixed(0),
      heavy: true,
      onChange: () => {
        if (state.Z_max > state.Z) state.Z_max = state.Z;
      },
    })
    .slider('Z_min', state, 'Z_min', 0, state.Z - 1, 1, {
      fmt: (v) => v.toFixed(0),
      heavy: true,
      onChange: () => {
        if (state.Z_min >= state.Z_max) state.Z_max = Math.min(state.Z, state.Z_min + 1);
      },
    })
    .slider('Z_max', state, 'Z_max', 1, state.Z, 1, {
      fmt: (v) => v.toFixed(0),
      heavy: true,
      onChange: () => {
        if (state.Z_max <= state.Z_min) state.Z_min = Math.max(0, state.Z_max - 1);
      },
    })
    .slider('num strands', state, 'numStrands', 1, 32, 1, { fmt: (v) => v.toFixed(0), heavy: true })
    .slider('path budget', state, 'pathBudget', 10, 2000, 10, { fmt: (v) => v.toFixed(0), heavy: true });

  b.section('Scaling', false)
    .slider('l_base', state, 'l_base', 0.01, 20, 0.01, { fmt: (v) => v.toFixed(3) })
    .slider('l_func', state, 'l_func', 0.01, 20, 0.01, { fmt: (v) => v.toFixed(3) })
    .html(`<div class="mode-row">
      <span class="slider-label">k alignment bool</span>
      <button class="mode-pill ctrl-interactive" id="kbool-0">0</button>
      <button class="mode-pill ctrl-interactive" id="kbool-1">1</button>
    </div>`)
    .slider('q_scale', state, 'q_scale', 0, 50, 0.001, { fmt: (v) => v.toFixed(3) })
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

  b.section('Expression Parent', false)
    .toggle('enabled', state.expressionModel.parent, 'enabled')
    .slider('point size', state.expressionModel.parent, 'pointSize', 0, 6, 0.05)
    .slider('point opacity', state.expressionModel.parent, 'pointOpacity', 0, 1, 0.01)
    .slider('line width', state.expressionModel.parent, 'lineWidth', 0, 6, 0.05)
    .slider('line opacity', state.expressionModel.parent, 'lineOpacity', 0, 1, 0.01)
    .slider('point bloom', state.expressionModel.parent, 'pointBloom', 0, 4, 0.05)
    .slider('line bloom', state.expressionModel.parent, 'lineBloom', 0, 4, 0.05);

  addTransformControls(b);
  addSetAndChildControls(b);

  b.section('Proof', false)
    .slider('P', state, 'P', 1, 200, 1, { fmt: (v) => v.toFixed(0) })
    .slider('alpha', state, 'alpha', 1, 20, 0.001, {
      fmt: (v) => {
        if (Math.abs(v - TAU) < 0.01) return `τ ≈ ${TAU.toFixed(3)}`;
        return v.toFixed(3);
      },
    })
    .toggle('show alpha trace', state.cinematicFx.ghostTraces, 'showAlpha')
    .html('<div class="hud-row" style="margin-top:6px"><span class="hud-key">Closure</span><span class="hud-val" id="closure-display-panel">—</span></div>')
    .html('<div class="hud-row"><span class="hud-key">P₁</span><span class="hud-val" id="p1-display-panel">—</span></div>')
    .html('<div class="hud-row"><span class="hud-key">E_proof</span><span class="hud-val" id="eproof-display-panel">—</span></div>');

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
    .html('<div class="hud-row" style="margin-top:4px"><span class="hud-key">Active paths</span><span class="hud-val" id="atlas-paths-display-panel">—</span></div>')
    .html('<div class="hud-row"><span class="hud-key">Expressions</span><pre class="hud-val" id="atlas-expr-display" style="font-size:9px;margin:2px 0 0;white-space:pre-line;line-height:1.4;font-family:var(--mono)">—</pre></div>');

  b.section('View')
    .html('<div class="preset-row"><button class="preset-btn ctrl-interactive" id="btn-reset-camera">↻ Reset Camera</button><button class="preset-btn ctrl-interactive" id="btn-screenshot">📷 Screenshot</button></div>');
  const resetBtn = controlsContainer.querySelector('#btn-reset-camera');
  const shotBtn = controlsContainer.querySelector('#btn-screenshot');
  if (resetBtn) resetBtn.addEventListener('click', () => resetCamera());
  if (shotBtn) shotBtn.addEventListener('click', () => captureScreenshot());

  b.section('The Axiom', true)
    .html(`
      <div class="ctrl-info arch-info">
        <div>f = k₁ · e^{i·τ^k} and mirrored negative branch</div>
        <div>Transforms: base, sin, cos, tan, log(sin/cos/tan)</div>
        <div>n = [Z_min ... Z_max-1], with 710-block color boundaries</div>
      </div>
    `);
}

function buildTransportBar() {
  const bar = document.getElementById('transport-bar');
  if (!bar) return;
  bar.innerHTML = '';

  const playBtn = document.createElement('button');
  playBtn.className = 'transport-btn-mini ctrl-interactive';
  playBtn.textContent = animation.playing ? '⏸' : '▶';
  playBtn.addEventListener('click', () => {
    animation.toggle();
    updateTransportUI();
  });

  const stopBtn = document.createElement('button');
  stopBtn.className = 'transport-btn-mini ctrl-interactive';
  stopBtn.textContent = '⏹';
  stopBtn.addEventListener('click', () => {
    animation.stop();
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
    animation.seek(parseFloat(scrub.value) / 1000);
    regenerate();
  });

  const gearBtn = document.createElement('button');
  gearBtn.className = 'transport-gear ctrl-interactive';
  gearBtn.textContent = '⚙';
  gearBtn.title = 'Expand panels (Tab)';
  gearBtn.addEventListener('click', toggleCollapse);

  bar.appendChild(playBtn);
  bar.appendChild(stopBtn);
  bar.appendChild(scrub);
  bar.appendChild(gearBtn);
}

function updateTransportUI() {
  const tScrub = document.querySelector('.transport-scrub');
  if (tScrub) tScrub.value = `${animation.progress * 1000}`;

  document.querySelectorAll('.transport-btn-mini').forEach((btn) => {
    if (btn.textContent === '▶' || btn.textContent === '⏸') {
      btn.textContent = animation.playing ? '⏸' : '▶';
    }
  });
}

function animationFrame() {
  const now = performance.now();
  const dtSeconds = Math.max(0, (now - _lastFrameMs) / 1000);
  _lastFrameMs = now;

  let shouldRegenerate = false;
  const changed = animation.update();
  if (changed) {
    shouldRegenerate = true;
    updateTransportUI();
  }

  if (shouldAdvanceStep(state, animation.playing)) {
    deriveState();
    const dT = computeStepDelta(state, dtSeconds);
    if (Number.isFinite(dT) && dT !== 0) {
      state.T = clamp(state.T + dT, state.T_start, state.T_stop);
      shouldRegenerate = true;
    }
  }

  if (shouldRegenerate) regenerate();
}

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        animation.toggle();
        updateTransportUI();
        break;
      case 'Tab':
        e.preventDefault();
        toggleCollapse();
        buildTransportBar();
        break;
      case 'Escape':
        animation.stop();
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
  buildControls();
  buildTransportBar();
  setupKeyboard();
  setExternalUpdate(animationFrame);
  animation.onStateChange(() => updateTransportUI());
  regenerate();
}

// ═══════════════════════════════════════════════════════════════
//  controls.js — Unified UI with Polymorphic Builder & Portable Animation
//  τ-Euler Atlas · Leonhard Euler's Day Off
// ═══════════════════════════════════════════════════════════════

import { TAU, QUADS } from './complex.js';
import { TRIG } from './complex.js';
import {
  generateAllPoints,
  generatePrimaryPaths,
  generateAtlasPaths,
  generateAlphaTrace,
  generateTauTrace,
  setPointBudget,
  H_LABELS,
  computeEProofFromState,
} from './generators.js';
import {
  applyDerivedState,
  computeKFromT,
  computeStepDelta,
  computeTFromK,
  shouldAdvanceStep,
} from './derivation.js';
import {
  updatePointCloud, updateStrandPaths, updateAtlasPaths, updateGhostTraces, updateOrbitCircle,
  setBloomStrength, setBloomRadius, setBloomThreshold, setToneExposure, setFogDensity,
  resetCamera, captureScreenshot,
  setExternalUpdate, cinematic, setStarVisibility, setStarOpacity
} from './scene.js';
import { animation } from './animation.js';
import {
  getTheme, getRenderMode, getViewMode, isCollapsed,
  setTheme, setRenderMode, setViewMode, toggleCollapse,
  isPerformance
} from './modes.js';

// ── Visibility group factory ─────────────────────────────────

function visGroup(vals, defaults = {}) {
  return {
    vals:    [...vals],
    sizes:   vals.map(() => defaults.size ?? 1), // s_ system: per-member width/size multiplier
    ptScale: defaults.ptScale ?? 1,
    lineW:   defaults.lineW   ?? 1,
    lineOp:  defaults.lineOp  ?? 1,
  };
}

// ── State ────────────────────────────────────────────────────

export const state = {
  // ── Traversal ───────────────────────────────────────────────
  T: 1.9999,          // master traversal parameter
  tRegion: 'full',    // traversal range preset
  syncTStepToS: true, // keep T slider granularity synced to s=1/b
  kMode: 'derived',   // 'derived' (from T) | 'manual'
  k: 1,               // manual value when kMode='manual'
  k_value: 1,         // alignment/manual k input
  kStepsInAlignments: 0,
  timeMode: 'animation', // 'animation' | 'step'
  b: 1000,            // deterministic stepping denominator
  stepRate: 1,        // deterministic stepping multiplier

  // ── Amplitude / q-system ────────────────────────────────────
  q1: 26.3,           // spoke parameter
  q2: 0,              // τ-exponent (integer)
  q_a: 1,             // q parity switch: 0 => k1=q1, 1 => derived k1
  q_correction: 1,    // correction switch in k1 denominator
  manual_k1: false,   // advanced override
  k1_manual: 1,       // advanced manual value
  k1: 1,              // resolved value after derivation
  qMode: 'derived',   // legacy compatibility mirror only
  l_base: 10,         // log base used for C2 representation
  logBaseSource: 'l_base', // 'l_base' | 'X'
  logXIsIndependentVar: 0,
  X_n: 1,
  X: 1,

  // ── Output scaling ──────────────────────────────────────────
  k2: 1,
  k3: 1,
  Z: 710,             // canonical sample count
  n: 710,             // legacy alias
  nIsPrimeOnly: 0,
  U_unit: 1,
  nList: [],
  numStrands: 6,
  primaryTrigIndex: 1,

  // ── Proof ───────────────────────────────────────────────────
  P: 1,
  P1: 1,
  eProof: NaN,
  alpha: TAU, showAlpha: true,

  // ── Rendering (primary strands) ─────────────────────────────
  showLines: true,
  primaryLineWidth: 2.0,
  primaryLineOpacity: 0.5,
  ptSize: 1.5,
  ptOpacity: 0.7,

  // ── Atlas curves (independent layer) ────────────────────────
  atlasLineWidth:   1.0,
  atlasLineOpacity: 0.35,
  atlasBudget:      200,

  bloomStrength: 0.45,
  bloomRadius: 0.45,
  bloomThreshold: 0.8,
  toneExposure: 1.05,
  fogDensity: 0.0008,

  vis: {
    A: visGroup([1, 1]),              
    B: visGroup([1, 0]),              
    C: visGroup([1, 0]),              
    D: visGroup([1, 0, 0, 0]),        
    E: visGroup([1, 0, 0]),           
    F: visGroup([1, 1]),              
    G: visGroup([1, 0, 0, 0]),        
    H: visGroup(Array(H_LABELS.length).fill(1)),
  },
};

const GROUP_META = {
  A: { name: 'A: Render Primitive', labels: ['A₁: Points', 'A₂: Lines'], colors: [null, null] },
  B: { name: 'B: Sign Family', labels: ['B₁: Positive (+f)', 'B₂: Negative (−f)'], colors: [null, null] },
  C: { name: 'C: Representation', labels: ['C₁: Base (raw)', 'C₂: Log-wrapped'], colors: [null, null] },
  D: { name: 'D: Transform', labels: ['D₁: base', 'D₂: sin', 'D₃: cos', 'D₄: tan'], colors: [null, null, null, null] },
  E: { name: 'E: Geometry', labels: ['E₁: F (point)', 'E₂: V (vector)', 'E₃: C (curve)'], colors: [null, null, null] },
  F: { name: 'F: Branch', labels: ['F₁: Branch A (f₁)', 'F₂: Branch B (f₂)'], colors: [null, null] },
  G: { name: 'G: Color Family', labels: ['G₁: Red', 'G₂: Green', 'G₃: Blue', 'G₄: Purple'], colors: [QUADS[0].hex, QUADS[1].hex, QUADS[2].hex, QUADS[3].hex] },
  H: { name: 'H: Variant', labels: H_LABELS.map((l, i) => `H${i}: ${l}`), colors: Array(H_LABELS.length).fill(null) },
};

// Derive all dependent state values from canonical inputs.
export function deriveState() {
  applyDerivedState(state);
}

const T_REGION_CONFIG = {
  near1: { min: 0.9, max: 1.1, center: 1, b: 5000 },
  near2: { min: 1.9, max: 2.1, center: 2, b: 5000 },
  near2tight: { min: 1.99, max: 2.01, center: 1.999, b: 10000 },
  full: { min: 0.0001, max: 4, center: 1.9999, b: null },
};

function getTRegionConfig(region) {
  return T_REGION_CONFIG[region] || T_REGION_CONFIG.full;
}

function getTSliderStep() {
  if (!state.syncTStepToS) return 0.0001;
  const s = Math.abs(Number.isFinite(state.s) ? state.s : 0.0001);
  return Math.max(0.000001, Math.min(0.1, s));
}

function applyTRegionPreset(region) {
  const cfg = getTRegionConfig(region);
  state.tRegion = region;
  state.T = cfg.center;
  if (Number.isFinite(cfg.b)) state.b = cfg.b;
  deriveState();
}

// ── Regenerate ───────────────────────────────────────────────

let regenerateTimeout = null;

export function regenerate(isHeavy = false) {
  clearTimeout(regenerateTimeout);
  const delay = isHeavy ? 50 : 16;

  regenerateTimeout = setTimeout(() => {
    deriveState(); // always run derivation before using state
    setPointBudget(isPerformance() ? 50_000 : 200_000);

    const pointsEnabled = state.vis.A.vals[0] > 0;
    const linesEnabled  = state.vis.A.vals[1] > 0;

    if (pointsEnabled) {
      const data = generateAllPoints(state);
      updatePointCloud(data, state.ptSize * state.k3, state.ptOpacity * state.vis.A.vals[0]);
      if (data.meta) {
        const m = data.meta;
        const tauK = Math.pow(TAU, m.k);
        setText('T-display',      state.T.toFixed(6));
        setText('k-display',      m.k.toFixed(6) + (state.kMode === 'derived' ? ' ←T' : ''));
        setText('k1-display',     m.k1.toFixed(6) + (!state.manual_k1 ? ' ←q' : ''));
        setText('q-display',      state.q.toFixed(4));
        setText('d-display',      state.d.toFixed(6));
        setText('lbase-display',  state.logBase.toFixed(3));
        setText('s-display',      state.s.toExponential(2));
        setText('tauk-display',   tauK.toFixed(6));
        setText('f-display',      `(${m.f[0].toFixed(3)}, ${m.f[1].toFixed(3)}i)`);
        setText('compute-display',`${m.computeMs.toFixed(0)}ms`);
        setText('budget-display', `${data.count.toLocaleString()} / ${data.budget.toLocaleString()}`);
        // sync derived slider displays if in derived mode
        syncDerivedSliders();
      }
    } else {
      updatePointCloud({ positions: new Float32Array(0), colors: new Float32Array(0), sizes: new Float32Array(0), count: 0 }, 0, 0);
    }

    // ── Primary strand lines ──────────────────────────
    if (linesEnabled && state.showLines && state.primaryLineOpacity > 0.01) {
      const primaryPaths = generatePrimaryPaths(state);
      updateStrandPaths(primaryPaths, state.primaryLineWidth, state.primaryLineOpacity * state.vis.A.vals[1], true);
    } else {
      updateStrandPaths(null, 0, 0, false);
    }

    // ── Atlas curve lines (auto-enabled by visibility groups) ─────────────────────
    const atlasActive = linesEnabled && state.vis.G.vals.some(v => v > 0);
    if (atlasActive && state.atlasLineOpacity > 0.01) {
      const atlasPaths = generateAtlasPaths(state);
      updateAtlasPaths(atlasPaths, state.atlasLineWidth, state.atlasLineOpacity * state.vis.A.vals[1]);
      setText('atlas-paths-display', `${atlasPaths.length} / ${state.atlasBudget}`);
      setText('atlas-paths-display-panel', `${atlasPaths.length} / ${state.atlasBudget}`);
      if (atlasPaths.length > 0) {
        const exprLabels = new Set();
        for (const p of atlasPaths) {
          if (!p.tag) continue;
          const t = p.tag;
          exprLabels.add([
            QUADS[t.gi].name,
            t.fIdx === 0 ? 'A' : 'B',
            H_LABELS[t.hIdx],
            TRIG[t.di].label,
            t.ci === 0 ? 'base' : 'log',
            t.bi === 0 ? '+' : '−',
          ].join('·'));
        }
        setText('atlas-expr-display', [...exprLabels].slice(0, 10).join('\n'));
      } else {
        setText('atlas-expr-display', '—');
      }
    } else {
      updateAtlasPaths(null, 0, 0);
      setText('atlas-paths-display', '—');
      setText('atlas-paths-display-panel', '—');
      setText('atlas-expr-display', '—');
    }

    const tauTrace = generateTauTrace(256, state.k);
    const alphaNotTau = Math.abs(state.alpha - TAU) > 0.001;
    const alphaTrace = alphaNotTau ? generateAlphaTrace(state.alpha, 256, state.k) : null;
    updateGhostTraces(tauTrace, alphaTrace, state.showAlpha && alphaNotTau);
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

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// Sync readonly slider tracks when values are overwritten by derivation
function syncDerivedSliders() {
  if (state.kMode === 'derived') {
    const el = document.getElementById('slider-k');
    if (el) el.value = state.k;
  }
}

// ── Polymorphic UI Builder ───────────────────────────────────

class UIBuilder {
  constructor(container) {
    this.container = container;
    this.currentBody = container;
    this.activeChildWrapper = null;
  }

  section(title, startCollapsed = false) {
    const sec = document.createElement('div');
    sec.className = 'accordion-panel';
    const header = document.createElement('div');
    header.className = 'accordion-header' + (startCollapsed ? ' collapsed' : '');
    header.textContent = title;
    const body = document.createElement('div');
    body.className = 'accordion-body' + (startCollapsed ? ' collapsed' : '');
    
    header.addEventListener('click', () => {
      body.classList.toggle('collapsed');
      header.classList.toggle('collapsed');
    });
    
    sec.appendChild(header);
    sec.appendChild(body);
    this.container.appendChild(sec);
    this.currentBody = body;
    this.activeChildWrapper = null;
    return this;
  }

  childSection(title, startCollapsed = true) {
    const wrapper = document.createElement('div');
    wrapper.className = 'accordion-child-panel';
    const header = document.createElement('div');
    header.className = 'accordion-child-header' + (startCollapsed ? ' collapsed' : '');
    header.textContent = title;
    const body = document.createElement('div');
    body.className = 'accordion-child-body' + (startCollapsed ? ' collapsed' : '');
    
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      body.classList.toggle('collapsed');
      header.classList.toggle('collapsed');
    });
    
    wrapper.appendChild(header);
    wrapper.appendChild(body);
    this.currentBody.appendChild(wrapper);
    this.activeChildWrapper = body;
    return this;
  }

  _getParent() {
    return this.activeChildWrapper || this.currentBody;
  }

  // Polymorphic slider supporting Portable Scroll-Animation NumberParam binding
  slider(label, obj, key, min, max, step, props = {}) {
    const { index = null, isHeavy = false, fmt, color, onChange, id: inputId } = props;
    const parent = this._getParent();
    
    // Register param for global playback targeting
    const link = animation.registerLink(obj, key, index);
    
    const row = document.createElement('div');
    row.className = 'slider-row anim-ready' + (label.trimStart().startsWith('↳') ? ' sz-row' : '');
    
    // Link Toggle
    const linkBtn = document.createElement('button');
    linkBtn.className = 'link-toggle';
    linkBtn.innerHTML = '⚯'; // Link icon
    linkBtn.title = 'Link to animation playback';
    
    if (color) {
      const dot = document.createElement('span');
      dot.className = 'dim-dot';
      dot.style.background = color;
      dot.style.opacity = link.baseValue;
      row.appendChild(dot);
      row._dot = dot;
    }
    
    const lbl = document.createElement('span');
    lbl.className = 'slider-label';
    lbl.textContent = label;

    const trackWrap = document.createElement('div');
    trackWrap.className = 'slider-track-wrap';

    // Base value input
    const inputStr = '<input type="range" class="slider-input base-thumb" min="'+min+'" max="'+max+'" step="'+step+'">';
    trackWrap.innerHTML = inputStr;
    const inputBase = trackWrap.querySelector('.base-thumb');
    if (inputId) inputBase.id = inputId;
    inputBase.value = link.baseValue;
    
    // Target value input (for animation)
    const inputTarget = document.createElement('input');
    inputTarget.type = 'range'; inputTarget.className = 'slider-input target-thumb hidden';
    inputTarget.min = min; inputTarget.max = max; inputTarget.step = step;
    trackWrap.appendChild(inputTarget);
    
    const valSpan = document.createElement('span');
    valSpan.className = 'slider-value';
    
    const formatVal = (v) => {
      if (fmt) return fmt(v);
      return Number.isInteger(step) || step >= 1 ? v : v.toFixed(Math.max(1, -Math.floor(Math.log10(step))));
    };

    const updateUI = () => {
      // Sync internal engine outputs to the DOM
      const targetVal = obj === state && key === 'bloomStrength' ? state.bloomStrength : (index !== null ? obj[key][index] : obj[key]);
      inputBase.value = targetVal;
      valSpan.textContent = formatVal(parseFloat(targetVal));
      if (row._dot) row._dot.style.opacity = targetVal;
      linkBtn.classList.toggle('active', link.isLinked);
      if (link.endValue !== null) {
        inputTarget.classList.remove('hidden');
        inputTarget.value = link.endValue;
      } else {
        inputTarget.classList.add('hidden');
      }
    };
    updateUI();
    
    // Interaction Handlers (Authoring Semantic Contract)
    const handleInput = (e, isTarget) => {
      const v = parseFloat(e.target.value);
      if (isTarget) {
        link.endValue = v;
      } else {
        if (e.shiftKey) {
           link.endValue = v;
           e.target.value = link.baseValue; // Reject shift drag on base thumb visually
        } else {
           link.baseValue = v;
           if (index !== null) obj[key][index] = v;
           else obj[key] = v;
        }
      }
      
      if (onChange) onChange(v);
      updateUI();
      regenerate(isHeavy);
    };

    inputBase.addEventListener('input', e => handleInput(e, false));
    inputTarget.addEventListener('input', e => handleInput(e, true));

    linkBtn.addEventListener('click', () => {
      link.isLinked = !link.isLinked;
      if (link.isLinked && link.endValue === null) {
         link.endValue = Math.min(max, link.baseValue + (max - min) * 0.2); // Default target offset
      }
      if (!link.isLinked) link.endValue = null; // Clear intent
      updateUI();
    });

    // Store updateUI on the link so buildControls can batch-register after all sliders are created
    link._updateUI = updateUI;

    row.appendChild(linkBtn);
    row.appendChild(lbl);
    row.appendChild(trackWrap);
    row.appendChild(valSpan);
    parent.appendChild(row);
    
    return this;
  }

  toggle(label, obj, key, onChange) {
    const parent = this._getParent();
    const btn = document.createElement('button');
    btn.className = 'toggle-pill ctrl-interactive' + (obj[key] ? ' active' : '');
    btn.innerHTML = `<span class="pill-dot"></span>${label}`;
    btn.addEventListener('click', () => {
      obj[key] = !obj[key];
      btn.classList.toggle('active', obj[key]);
      if (onChange) onChange(obj[key]);
      regenerate();
    });
    parent.appendChild(btn);
    return this;
  }

  modeToggle(label, getter, setter, valueA, valueB, labelA, labelB) {
    const parent = this._getParent();
    const row = document.createElement('div');
    row.className = 'mode-toggle-row';
    const lbl = document.createElement('span');
    lbl.className = 'mode-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    const group = document.createElement('div');
    group.className = 'toggle-group-inline';

    const btnA = document.createElement('button');
    btnA.className = 'toggle-pill ctrl-interactive' + (getter() === valueA ? ' active' : '');
    btnA.innerHTML = `<span class="pill-dot"></span>${labelA}`;

    const btnB = document.createElement('button');
    btnB.className = 'toggle-pill ctrl-interactive' + (getter() === valueB ? ' active' : '');
    btnB.innerHTML = `<span class="pill-dot"></span>${labelB}`;

    btnA.addEventListener('click', () => { setter(valueA); btnA.classList.add('active'); btnB.classList.remove('active'); regenerate(); });
    btnB.addEventListener('click', () => { setter(valueB); btnB.classList.add('active'); btnA.classList.remove('active'); regenerate(); });

    group.appendChild(btnA); group.appendChild(btnB);
    row.appendChild(group);
    parent.appendChild(row);
    return this;
  }

  presetGroup(buttons) {
    const parent = this._getParent();
    const row = document.createElement('div');
    row.className = 'preset-row';
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'preset-btn ctrl-interactive';
      btn.textContent = b.label;
      btn.addEventListener('click', () => {
        b.action();
        regenerate();
        buildControls(); // Rebuild UI state fully
      });
      row.appendChild(btn);
    });
    parent.appendChild(row);
    return this;
  }

  info(htmlContent) {
    const parent = this._getParent();
    const div = document.createElement('div');
    div.className = 'ctrl-info';
    div.innerHTML = htmlContent;
    parent.appendChild(div);
    return this;
  }

  html(htmlContent) {
    const parent = this._getParent();
    const div = document.createElement('div');
    div.innerHTML = htmlContent;
    parent.appendChild(div);
    return this;
  }

  // Polymorphic generator for Vis Groups (A-H)
  visGroup(groupKey, collapsed = true) {
    const meta  = GROUP_META[groupKey];
    const group = state.vis[groupKey];
    
    this.section(meta.name, collapsed);
    
    // Bulk Toggles (opacity — the c_ system)
    const toggleRow = document.createElement('div');
    toggleRow.className = 'parent-toggle-row';
    const allOn = document.createElement('button');
    allOn.className = 'parent-toggle-btn on ctrl-interactive'; allOn.textContent = 'All On';
    allOn.addEventListener('click', () => { group.vals.fill(1); regenerate(true); buildControls(); });
    const allOff = document.createElement('button');
    allOff.className = 'parent-toggle-btn off ctrl-interactive'; allOff.textContent = 'All Off';
    allOff.addEventListener('click', () => { group.vals.fill(0); regenerate(true); buildControls(); });
    toggleRow.appendChild(allOn); toggleRow.appendChild(allOff);
    this.currentBody.appendChild(toggleRow);

    // Per-member: opacity (c_) + size (s_) sliders — Global→Group→Function
    for (let i = 0; i < group.vals.length; i++) {
      // Opacity slider (c_ system)
      this.slider(meta.labels[i], group, 'vals', 0, 1, 0.05, { index: i, color: meta.colors[i] });
      // Size/width slider (s_ system) — compact label
      this.slider(`  ↳ sz`, group, 'sizes', 0, 3, 0.05, { index: i });
    }

    // Group-level multipliers (child, collapsed) — these are the "Group" tier
    this.childSection('⚙ Group Render', true);
    this.slider('Point scale ×', group, 'ptScale', 0.1, 3, 0.05);
    this.slider('Line width ×',  group, 'lineW',   0.1, 3, 0.05);
    this.slider('Line opacity ×', group, 'lineOp',  0,   1, 0.05);

    // Special controls for A group
    if (groupKey === 'A') {
      this.slider('point size', state, 'ptSize', 0.1, 6, 0.1);
      this.slider('point opacity', state, 'ptOpacity', 0, 1, 0.05);
    }
    
    return this;
  }
}

// ── Build control panel ──────────────────────────────────────

let controlsContainer = null;

function buildControls() {
  if (!controlsContainer) controlsContainer = document.getElementById('controls-panel');
  deriveState();
  controlsContainer.innerHTML = '';
  animation.clearLinks(); // Reset bindings

  // Collapse UI
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

  // ── TRAVERSAL ──────────────────────────────────────────────
  const tCfg = getTRegionConfig(state.tRegion);
  const tStep = getTSliderStep();
  b.section('Traversal')
   .info('T is the primary parameter. k is derived from T via k = log_tau(T*tau/2).')
   .slider('T (traversal)', state, 'T', tCfg.min, tCfg.max, tStep, {
     fmt: v => v.toFixed(6),
     onChange: () => { if (state.kMode === 'derived') { state.k = computeKFromT(state.T); } }
   })
   .html(`<div class="mode-row">
     <span class="slider-label">T region</span>
     <button class="mode-pill ctrl-interactive" id="tregion-near1">near 1</button>
     <button class="mode-pill ctrl-interactive" id="tregion-near2">near 2</button>
     <button class="mode-pill ctrl-interactive" id="tregion-near2tight">1.99–2.01</button>
     <button class="mode-pill ctrl-interactive" id="tregion-full">full</button>
   </div>`)
   .html(`<div class="mode-row">
     <span class="slider-label">T step source</span>
     <button class="mode-pill ctrl-interactive" id="tstep-sync-on">sync s</button>
     <button class="mode-pill ctrl-interactive" id="tstep-sync-off">fixed</button>
   </div>`)
   .html(`<div class="mode-row">
     <span class="slider-label">k source</span>
     <button class="mode-pill ctrl-interactive" id="kmode-derived">derived</button>
     <button class="mode-pill ctrl-interactive" id="kmode-manual">manual</button>
   </div>`)
   .slider('k (exponent)', state, 'k', -3, 3, 0.001, {
     id: 'slider-k',
     fmt: v => v.toFixed(6),
     onChange: () => {
       if (state.kMode === 'manual') {
         state.k_value = state.k;
         state.T = computeTFromK(state.k);
       }
     }
   })
   .slider('k_value (alignment input)', state, 'k_value', 0.01, 20, 0.01, { fmt: v => v.toFixed(4) })
   .html(`<div class="mode-row">
     <span class="slider-label">k alignment</span>
     <button class="mode-pill ctrl-interactive" id="kalign-off">off</button>
     <button class="mode-pill ctrl-interactive" id="kalign-on">on</button>
   </div>`)
   .html(`<div class="mode-row">
     <span class="slider-label">time mode</span>
     <button class="mode-pill ctrl-interactive" id="timemode-animation">animation</button>
     <button class="mode-pill ctrl-interactive" id="timemode-step">step</button>
   </div>`)
   .slider('b (resolution)', state, 'b', 1, 10000, 1, { fmt: v => v.toFixed(0) })
   .slider('stepRate', state, 'stepRate', -100, 100, 0.01, { fmt: v => v.toFixed(2) });

  // Wire k-mode pills
  (() => {
    ['derived','manual'].forEach(mode => {
      const btn = b.container.querySelector(`#kmode-${mode}`);
      if (!btn) return;
      btn.classList.toggle('active', state.kMode === mode);
      btn.addEventListener('click', () => {
        state.kMode = mode;
        b.container.querySelectorAll('#kmode-derived,#kmode-manual').forEach(el =>
          el.classList.toggle('active', el.id === `kmode-${mode}`));
        deriveState(); regenerate();
      });
    });
  })();

  (() => {
    const regions = ['near1', 'near2', 'near2tight', 'full'];
    regions.forEach((region) => {
      const btn = b.container.querySelector(`#tregion-${region}`);
      if (!btn) return;
      btn.classList.toggle('active', state.tRegion === region);
      btn.addEventListener('click', () => {
        applyTRegionPreset(region);
        regenerate();
        buildControls();
      });
    });
  })();

  (() => {
    const onBtn = b.container.querySelector('#tstep-sync-on');
    const offBtn = b.container.querySelector('#tstep-sync-off');
    if (!onBtn || !offBtn) return;
    onBtn.classList.toggle('active', state.syncTStepToS);
    offBtn.classList.toggle('active', !state.syncTStepToS);
    onBtn.addEventListener('click', () => {
      state.syncTStepToS = true;
      deriveState();
      regenerate();
      buildControls();
    });
    offBtn.addEventListener('click', () => {
      state.syncTStepToS = false;
      deriveState();
      regenerate();
      buildControls();
    });
  })();

  (() => {
    const offBtn = b.container.querySelector('#kalign-off');
    const onBtn = b.container.querySelector('#kalign-on');
    if (!offBtn || !onBtn) return;
    offBtn.classList.toggle('active', state.kStepsInAlignments === 0);
    onBtn.classList.toggle('active', state.kStepsInAlignments === 1);
    offBtn.addEventListener('click', () => {
      state.kStepsInAlignments = 0;
      deriveState();
      regenerate();
      buildControls();
    });
    onBtn.addEventListener('click', () => {
      state.kStepsInAlignments = 1;
      deriveState();
      regenerate();
      buildControls();
    });
  })();

  (() => {
    ['animation', 'step'].forEach(mode => {
      const btn = b.container.querySelector(`#timemode-${mode}`);
      if (!btn) return;
      btn.classList.toggle('active', state.timeMode === mode);
      btn.addEventListener('click', () => {
        state.timeMode = mode;
        b.container.querySelectorAll('#timemode-animation,#timemode-step').forEach(el =>
          el.classList.toggle('active', el.id === `timemode-${mode}`));
        deriveState(); regenerate();
      });
    });
  })();

  // ── AMPLITUDE / q-SYSTEM ──────────────────────────────────
  b.section('Amplitude')
   .info('k1 = { q_a=0: q1, q_a=1: tau/((q/2)*corr) }, q=q1*tau^q2.')
   .slider('q₁ (spoke param)', state, 'q1', 0.1, 71, 0.01, { fmt: v => v.toFixed(4) })
   .slider('q₂ (τ-exponent)', state, 'q2', -4, 4, 1, { fmt: v => v.toFixed(0) })
   .html(`<div class="mode-row">
     <span class="slider-label">q parity</span>
     <button class="mode-pill ctrl-interactive" id="qa-off">q_a = 0</button>
     <button class="mode-pill ctrl-interactive" id="qa-on">q_a = 1</button>
   </div>`)
   .html(`<div class="mode-row">
     <span class="slider-label">correction</span>
     <button class="mode-pill ctrl-interactive" id="qcorr-off">off</button>
     <button class="mode-pill ctrl-interactive" id="qcorr-on">on</button>
   </div>`)
   .html(`<div class="mode-row">
     <span class="slider-label">k₁ source</span>
     <button class="mode-pill ctrl-interactive" id="k1-auto">auto</button>
     <button class="mode-pill ctrl-interactive" id="k1-manual">manual</button>
   </div>`)
   .slider('k₁ manual', state, 'k1_manual', 0.01, 100, 0.01, { id: 'slider-k1-manual', fmt: v => v.toFixed(4) });

  (() => {
    const qaOff = b.container.querySelector('#qa-off');
    const qaOn = b.container.querySelector('#qa-on');
    if (qaOff && qaOn) {
      qaOff.classList.toggle('active', state.q_a === 0);
      qaOn.classList.toggle('active', state.q_a === 1);
      qaOff.addEventListener('click', () => { state.q_a = 0; deriveState(); regenerate(); buildControls(); });
      qaOn.addEventListener('click', () => { state.q_a = 1; deriveState(); regenerate(); buildControls(); });
    }
    const qcOff = b.container.querySelector('#qcorr-off');
    const qcOn = b.container.querySelector('#qcorr-on');
    if (qcOff && qcOn) {
      qcOff.classList.toggle('active', state.q_correction === 0);
      qcOn.classList.toggle('active', state.q_correction === 1);
      qcOff.addEventListener('click', () => { state.q_correction = 0; deriveState(); regenerate(); buildControls(); });
      qcOn.addEventListener('click', () => { state.q_correction = 1; deriveState(); regenerate(); buildControls(); });
    }
    const k1Auto = b.container.querySelector('#k1-auto');
    const k1Manual = b.container.querySelector('#k1-manual');
    if (k1Auto && k1Manual) {
      k1Auto.classList.toggle('active', !state.manual_k1);
      k1Manual.classList.toggle('active', state.manual_k1);
      k1Auto.addEventListener('click', () => { state.manual_k1 = false; deriveState(); regenerate(); buildControls(); });
      k1Manual.addEventListener('click', () => { state.manual_k1 = true; deriveState(); regenerate(); buildControls(); });
    }
  })();

  // ── OUTPUT SCALING ─────────────────────────────────────────
  b.section('Output Scaling')
   .slider('k₂ (spoke scale)', state, 'k2', 0.01, 5, 0.01)
   .slider('k₃ (point scale)', state, 'k3', 0.1, 5, 0.01)
   .slider('Z (sample points)', state, 'Z', 1, 2000, 1, { isHeavy: true, fmt: v => v.toString(), onChange: () => { state.n = state.Z; } })
   .html(`<div class="mode-row">
     <span class="slider-label">n domain</span>
     <button class="mode-pill ctrl-interactive" id="nmode-dense">integers</button>
     <button class="mode-pill ctrl-interactive" id="nmode-prime">primes</button>
   </div>`)
   .slider('U_unit (domain scale)', state, 'U_unit', 0.1, 10, 0.1, { fmt: v => v.toFixed(2) })
   .slider('log base (l_base)', state, 'l_base', 0.1, 20, 0.1, { fmt: v => v.toFixed(2) })
   .html(`<div class="mode-row">
     <span class="slider-label">log base source</span>
     <button class="mode-pill ctrl-interactive" id="logbase-lbase">l_base</button>
     <button class="mode-pill ctrl-interactive" id="logbase-x">X</button>
   </div>`)
   .html(`<div class="mode-row">
     <span class="slider-label">X source</span>
     <button class="mode-pill ctrl-interactive" id="xsource-k">k</button>
     <button class="mode-pill ctrl-interactive" id="xsource-xn">X_n</button>
   </div>`)
   .slider('X_n', state, 'X_n', 0.01, 20, 0.01, { fmt: v => v.toFixed(4) })
   .slider('# strands', state, 'numStrands', 1, 28, 1, { isHeavy: true, fmt: v => v.toString() })
   .info('Direct family on n·f with optional prime-domain and X-based log control.');

  (() => {
    const dense = b.container.querySelector('#nmode-dense');
    const prime = b.container.querySelector('#nmode-prime');
    if (!dense || !prime) return;
    dense.classList.toggle('active', state.nIsPrimeOnly === 0);
    prime.classList.toggle('active', state.nIsPrimeOnly === 1);
    dense.addEventListener('click', () => {
      state.nIsPrimeOnly = 0;
      deriveState();
      regenerate(true);
      buildControls();
    });
    prime.addEventListener('click', () => {
      state.nIsPrimeOnly = 1;
      deriveState();
      regenerate(true);
      buildControls();
    });
  })();

  (() => {
    const lBaseBtn = b.container.querySelector('#logbase-lbase');
    const xBtn = b.container.querySelector('#logbase-x');
    if (!lBaseBtn || !xBtn) return;
    lBaseBtn.classList.toggle('active', state.logBaseSource !== 'X');
    xBtn.classList.toggle('active', state.logBaseSource === 'X');
    lBaseBtn.addEventListener('click', () => {
      state.logBaseSource = 'l_base';
      deriveState();
      regenerate();
      buildControls();
    });
    xBtn.addEventListener('click', () => {
      state.logBaseSource = 'X';
      deriveState();
      regenerate();
      buildControls();
    });
  })();

  (() => {
    const kBtn = b.container.querySelector('#xsource-k');
    const xnBtn = b.container.querySelector('#xsource-xn');
    if (!kBtn || !xnBtn) return;
    kBtn.classList.toggle('active', state.logXIsIndependentVar === 0);
    xnBtn.classList.toggle('active', state.logXIsIndependentVar === 1);
    kBtn.addEventListener('click', () => {
      state.logXIsIndependentVar = 0;
      deriveState();
      regenerate();
      buildControls();
    });
    xnBtn.addEventListener('click', () => {
      state.logXIsIndependentVar = 1;
      deriveState();
      regenerate();
      buildControls();
    });
  })();

  // ── PROOF ─────────────────────────────────────────────────
  b.section('Proof')
   .info('α<sup>i·nα/ln(α)</sup> closes at n=1 ⟺ α = τ')
   .slider('P (offset)', state, 'P', 1, 50, 1, { fmt: v => v.toFixed(0) })
   .slider('α (base)', state, 'alpha', 1, 20, 0.001, {
     fmt: v => {
       if (Math.abs(v - TAU) < 0.01) return `τ ≈ ${TAU.toFixed(3)}`;
       if (Math.abs(v - Math.E) < 0.01) return `e ≈ ${Math.E.toFixed(3)}`;
       if (Math.abs(v - Math.PI) < 0.01) return `π ≈ ${Math.PI.toFixed(3)}`;
       return v.toFixed(3);
     }
   })
   .toggle('Show α trace', state, 'showAlpha')
   .html('<div class="hud-row" style="margin-top:6px"><span class="hud-key">Closure</span><span class="hud-val" id="closure-display-panel">—</span></div>')
   .html('<div class="hud-row"><span class="hud-key">P₁</span><span class="hud-val" id="p1-display-panel">—</span></div>')
   .html('<div class="hud-row"><span class="hud-key">E_proof</span><span class="hud-val" id="eproof-display-panel">—</span></div>');

  // ── ATLAS VISIBILITY ───────────────────────────────────────
  b.visGroup('A', false)
   .visGroup('G', true)
   .visGroup('D', true)
   .visGroup('E', true)
   .visGroup('B', true)
   .visGroup('C', true)
   .visGroup('F', true)
   .visGroup('H', true);

  b.section('Primary Strand', false)
   .info('Primary strand uses selected direct family on n·f (base/sin/cos/tan).')
   .html(`<div class="mode-row">
     <span class="slider-label">trig</span>
     <button class="mode-pill ctrl-interactive" id="ptrig-0">base</button>
     <button class="mode-pill ctrl-interactive" id="ptrig-1">sin</button>
     <button class="mode-pill ctrl-interactive" id="ptrig-2">cos</button>
     <button class="mode-pill ctrl-interactive" id="ptrig-3">tan</button>
   </div>`)
   .toggle('Show strand lines', state, 'showLines')
   .slider('strand width', state, 'primaryLineWidth', 0.5, 8, 0.25)
   .slider('strand opacity', state, 'primaryLineOpacity', 0, 1, 0.05);

  (() => {
    for (let i = 0; i < 4; i++) {
      const btn = b.container.querySelector(`#ptrig-${i}`);
      if (!btn) continue;
      btn.classList.toggle('active', state.primaryTrigIndex === i);
      btn.addEventListener('click', () => {
        state.primaryTrigIndex = i;
        deriveState();
        regenerate();
        buildControls();
      });
    }
  })();

  b.section('Atlas Curves', false)
   .info('Connected curves for active expression combinations.')
   .slider('atlas width', state, 'atlasLineWidth', 0.1, 8, 0.1, { fmt: v => v.toFixed(1) })
   .slider('atlas opacity', state, 'atlasLineOpacity', 0, 1, 0.05, { fmt: v => v.toFixed(2) })
   .slider('path budget', state, 'atlasBudget', 10, 500, 10, { isHeavy: true, fmt: v => v.toString() })
   .html('<div class="hud-row" style="margin-top:4px"><span class="hud-key">Active paths</span><span class="hud-val" id="atlas-paths-display-panel">—</span></div>')
   .html('<div class="hud-row"><span class="hud-key">Expressions</span><pre class="hud-val" id="atlas-expr-display" style="font-size:9px;margin:2px 0 0;white-space:pre-line;line-height:1.4;font-family:var(--mono)">—</pre></div>');

  b.section('Rendering')
   .slider('point size', state, 'ptSize', 0.1, 6, 0.1)
   .slider('point opacity', state, 'ptOpacity', 0, 1, 0.05)
   .childSection('✦ Post Processing')
   .slider('bloom strength', state, 'bloomStrength', 0, 2, 0.05, { onChange: v => setBloomStrength(v) })
   .slider('bloom radius', state, 'bloomRadius', 0, 1, 0.05, { onChange: v => setBloomRadius(v) })
   .slider('bloom threshold', state, 'bloomThreshold', 0, 1, 0.05, { onChange: v => setBloomThreshold(v) })
   .slider('tone exposure', state, 'toneExposure', 0.5, 3, 0.05, { onChange: v => setToneExposure(v) })
   .slider('fog density', state, 'fogDensity', 0, 0.01, 0.0001, { onChange: v => setFogDensity(v), fmt: v => v.toFixed(4) });

  b.section('Cinematic', isPerformance())
   .info('✦ Stars')
   .toggle('Stars visible', cinematic, 'starsEnabled', setStarVisibility)
   .slider('rotation Y', cinematic, 'starRotY', 0, 0.002, 0.0001)
   .slider('rotation X', cinematic, 'starRotX', 0, 0.001, 0.00005)
   .slider('opacity', cinematic, 'starOpacity', 0, 1, 0.05, { onChange: v => setStarOpacity(v) })
   .slider('drift speed', cinematic, 'starDrift', 0, 1, 0.05);

  b.section('Playback Control')
   .info('Click ⚯ on any slider to link it. Shift+drag sets its animation target value.')
   .html(`<div class="slider-row" style="margin-top:6px">
     <span class="slider-label">Duration</span>
     <input type="range" class="slider-input" style="flex:1" min="1" max="120" step="1" value="${animation.duration}" oninput="this.nextElementSibling.textContent=this.value+'s'; this.dispatchEvent(new CustomEvent('dur',{detail:+this.value,bubbles:true}))">
     <span class="slider-value">${animation.duration}s</span></div>`);
  (() => {
    const el = b.container.querySelector('[type=range]:last-of-type');
    if (el) el.addEventListener('dur', e => { animation.duration = e.detail; });
  })();

  b.section('View')
   .presetGroup([
     { label: '↻ Reset Camera', action: resetCamera },
     { label: '📷 Screenshot', action: captureScreenshot }
   ]);

  b.section('Presets')
   .presetGroup([
      { label: 'τ = 1 turn', action: () => {
         Object.assign(state, {
           T: computeTFromK(1), k: 1, kMode: 'manual',
           manual_k1: true, k1_manual: 1,
           q_a: 1, q_correction: 1,
           k2: 1, alpha: TAU, numStrands: 6, Z: 710, n: 710
         });
         state.vis.G.vals = [1, 0, 0, 0]; buildControls(); } },
      { label: 'Derived (q)', action: () => {
         Object.assign(state, {
           T: 1.9999, kMode: 'derived',
           q1: 26.3, q2: 0, q_a: 1, q_correction: 1,
           manual_k1: false,
           alpha: TAU, numStrands: 6, Z: 710, n: 710
         });
         buildControls(); } },
      { label: 'The Proof', action: () => Object.assign(state, {
        k: 1, kMode: 'manual', manual_k1: true, k1_manual: 1, k2: 1, alpha: Math.E, showAlpha: true, numStrands: 1, Z: 710, n: 710
      }) },
      { label: 'Concentric', action: () => Object.assign(state, {
        k: 0.5, kMode: 'manual', manual_k1: true, k1_manual: 1, k2: 1, alpha: TAU, numStrands: 6
      }) },
      { label: 'Full Atlas', action: () => {
          state.vis.A.vals = [1, 1]; state.vis.G.vals = [1, 1, 1, 1];
          state.vis.D.vals = [1, 1, 1, 1]; state.vis.E.vals = [1, 1, 1];
          state.vis.B.vals = [1, 1]; state.vis.C.vals = [1, 1];
          state.vis.F.vals = [1, 1]; state.vis.H.vals = Array(H_LABELS.length).fill(1);
      }},
      { label: 'All 28', action: () => Object.assign(state, {
        numStrands: 28, primaryLineWidth: 1.0, primaryLineOpacity: 0.3, ptSize: 0.5
      }) }
   ]);

  b.section('The Axiom', true)
   .html(`
    <div class="ctrl-info arch-info">
      <div>f = k₁ · τ<sup>i · τ<sup>k</sup> / ln(τ)</sup></div>
      <div>&nbsp; ≡ k₁ · e<sup>iτ<sup>k</sup></sup></div>
      <div class="arch-spacer"></div>
      <div>α<sup>i·nα/ln(α)</sup> closes at n=1 ⟺ α = τ</div>
      <div class="arch-spacer"></div>
      <div>τ is the substrate. e is infrastructure.</div>
      <div class="arch-spacer"></div>
      <div>Each strand family: base/sin/cos/tan on n·f, scaled by k₂</div>
      <div>Atlas: A(2) × G(4) × E(3) × D(4) × B(2) × C(2) × F(2) × H(10)</div>
      <div>visible(item) = A[a] × B[b] × … × H[h]</div>
    </div>
  `);

  // ── Register single stateChange callback after all sliders are built ──
  // Each link has an _updateUI closure stored by the slider builder.
  animation.onStateChange(() => {
    for (const link of animation.links) {
      if (link._updateUI) link._updateUI();
    }
    updateTransportUI();
  });
}

// ── Transport bar (persistent) ─────────────────────────────────

function buildTransportBar() {
  const bar = document.getElementById('transport-bar');
  if (!bar) return;
  bar.innerHTML = '';

  const playBtn = document.createElement('button');
  playBtn.className = 'transport-btn-mini ctrl-interactive';
  playBtn.textContent = animation.playing ? '⏸' : '▶';
  playBtn.addEventListener('click', () => { animation.toggle(); updateTransportUI(); });
  
  const stopBtn = document.createElement('button');
  stopBtn.className = 'transport-btn-mini ctrl-interactive'; stopBtn.textContent = '⏹';
  stopBtn.addEventListener('click', () => { animation.stop(); regenerate(true); updateTransportUI(); });
  
  const scrub = document.createElement('input');
  scrub.type = 'range'; scrub.className = 'slider-input transport-scrub';
  scrub.min = 0; scrub.max = 1000; scrub.step = 1;
  scrub.value = animation.progress * 1000;
  scrub.addEventListener('input', () => {
    animation.seek((parseFloat(scrub.value) / 1000));
    regenerate();
  });
  
  const gearBtn = document.createElement('button');
  gearBtn.className = 'transport-gear ctrl-interactive'; gearBtn.textContent = '⚙';
  gearBtn.title = 'Expand panels (Tab)';
  gearBtn.addEventListener('click', toggleCollapse);
  
  bar.appendChild(playBtn); bar.appendChild(stopBtn);
  bar.appendChild(scrub); bar.appendChild(gearBtn);
}

function updateTransportUI() {
  const tScrub = document.querySelector('.transport-scrub');
  if (tScrub) tScrub.value = animation.progress * 1000;
  
  const mProg = document.getElementById('master-progress');
  if (mProg) mProg.textContent = (animation.progress * 100).toFixed(1) + '%';

  document.querySelectorAll('.transport-btn-mini').forEach(btn => {
    if (btn.textContent === '▶' || btn.textContent === '⏸') {
      btn.textContent = animation.playing ? '⏸' : '▶';
    }
  });
}

// ── Animation integration ────────────────────────────────────

let _lastFrameMs = performance.now();

function animationFrame() {
  const now = performance.now();
  const dtSeconds = Math.max(0, (now - _lastFrameMs) / 1000);
  _lastFrameMs = now;

  let shouldRegenerate = false;
  const changed = animation.update();
  if (changed) {
    // Sync all slider UIs if engine wrote new values
    for (const link of animation.links) {
      if (link._updateUI) link._updateUI();
    }
    shouldRegenerate = true;
    updateTransportUI();
  }

  if (shouldAdvanceStep(state, animation.playing)) {
    deriveState();
    const dT = computeStepDelta(state, dtSeconds);
    if (Number.isFinite(dT) && dT !== 0) {
      state.T += dT;
      shouldRegenerate = true;
    }
  }

  if (shouldRegenerate) regenerate();
}

// ── Keyboard shortcuts ───────────────────────────────────────

function setupKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    switch (e.key) {
      case ' ': e.preventDefault(); animation.toggle(); updateTransportUI(); break;
      case 'Tab': e.preventDefault(); toggleCollapse(); buildTransportBar(); break;
      case 'Escape': animation.stop(); regenerate(true); updateTransportUI(); break;
      case 'r': case 'R': resetCamera(); break;
    }
  });
}

// ── Public init ──────────────────────────────────────────────

export function initControls() {
  buildControls();
  buildTransportBar();
  setupKeyboard();
  setExternalUpdate(animationFrame);
  animation.onStateChange(() => updateTransportUI());
  regenerate();
}

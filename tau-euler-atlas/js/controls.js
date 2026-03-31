// ═══════════════════════════════════════════════════════════════
//  controls.js — Unified UI with Polymorphic Builder & Portable Animation
//  τ-Euler Atlas · Leonhard Euler's Day Off
// ═══════════════════════════════════════════════════════════════

import { TAU, QUADS } from './complex.js';
import { generateAllPoints, generateStrandPaths, generateAtlasPaths, generateAlphaTrace, generateTauTrace, setPointBudget, H_LABELS } from './generators.js';
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
  kMode: 'derived',   // 'derived' (from T) | 'manual'
  k: 1,               // k = log_τ(T·τ/2) in derived mode

  // ── Amplitude / q-system ────────────────────────────────────
  q1: 26.3,           // spoke parameter (free slider)
  q2: 0,              // τ-exponent (integer)
  qMode: 'manual',    // 'derived' (k₁ from q,d) | 'direct' (k₁=q₁) | 'manual'
  k1: 1,              // k₁ = τ/((q/2)·d) in derived mode

  // ── Output scaling ──────────────────────────────────────────
  k2: 1,
  n: 710,
  numStrands: 6,

  // ── Proof ───────────────────────────────────────────────────
  alpha: TAU, showAlpha: true,
  P: 1,               // block offset for E_proof comparison

  // ── Rendering (primary strands) ─────────────────────────────
  showLines: true, lineWidth: 2.0, lineOpacity: 0.5, ptSize: 1.5, ptOpacity: 0.7,

  // ── Atlas curves (independent layer) ────────────────────────
  showAtlasPaths:   false, // off by default — gates generateAtlasPaths() entirely
  atlasLineWidth:   1.0,   // global width multiplied by widthMul (s_ system) per path
  atlasLineOpacity: 0.35,  // independent opacity
  atlasBudget:      200,   // max path segments (performance guard)

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
    H: visGroup([1, 1, 1, 1, 1, 1, 1, 1]), 
  },
};

const GROUP_META = {
  A: { name: 'A: Render Primitive', labels: ['A₁: Points', 'A₂: Lines'], colors: [null, null] },
  B: { name: 'B: Sign Family', labels: ['B₁: Positive (+f)', 'B₂: Negative (−f)'], colors: [null, null] },
  C: { name: 'C: Representation', labels: ['C₁: Base (raw)', 'C₂: Log-wrapped'], colors: [null, null] },
  D: { name: 'D: Transform', labels: ['D₁: identity', 'D₂: sin', 'D₃: cos', 'D₄: tan'], colors: [null, null, null, null] },
  E: { name: 'E: Geometry', labels: ['E₁: F (point)', 'E₂: V (vector)', 'E₃: C (curve)'], colors: [null, null, null] },
  F: { name: 'F: Branch', labels: ['F₁: Branch A (f₁)', 'F₂: Branch B (f₂)'], colors: [null, null] },
  G: { name: 'G: Color Family', labels: ['G₁: Red', 'G₂: Green', 'G₃: Blue', 'G₄: Purple'], colors: [QUADS[0].hex, QUADS[1].hex, QUADS[2].hex, QUADS[3].hex] },
  H: { name: 'H: Variant', labels: H_LABELS.map((l, i) => `H${i}: ${l}`), colors: Array(8).fill(null) },
};

// ── Derivation chain ────────────────────────────────────────

export function computeKFromT(T) {
  // k = log_τ(T · τ/2)  ←→  τ^k = T·τ/2
  return Math.log(T * TAU / 2) / Math.log(TAU);
}

export function computeTFromK(k) {
  // inverse: T = 2·τ^k / τ = 2·τ^(k-1)
  return 2 * Math.pow(TAU, k - 1);
}

function computeD(T) {
  return Math.abs(2 * Math.cos(Math.PI * T));
}

function computeQ(q1, q2) {
  return q1 * Math.pow(TAU, q2);
}

// Derive all dependent state values from free inputs.
// Call this before every regenerate.
export function deriveState() {
  // T ↔ k
  if (state.kMode === 'derived') {
    state.k = computeKFromT(state.T);
  } else {
    // manual k — back-compute T for HUD display only
    state.T = computeTFromK(state.k);
  }

  // q and d (always computed for HUD)
  state._q  = computeQ(state.q1, state.q2);
  state._d  = computeD(state.T);

  // k₁ derivation
  if (state.qMode === 'derived') {
    const denom = (state._q / 2) * state._d;
    state.k1 = denom > 0 ? TAU / denom : 1;
  } else if (state.qMode === 'direct') {
    state.k1 = state.q1;
  }
  // 'manual': k1 stays as-is
}

// E_proof: Σ |sin(n_x(P)·f)·k₂ − sin(n_x(P₁)·f)·k₂|
// where n_x(x) = n + x·Z,  P₁ = P·(1 + τ/Z)
function computeEProof(f, k2, Z, P) {
  const P1 = P * (1 + TAU / Z);
  let sum = 0;
  // f as complex [re,im]; sin(n·f) ≈ sin of real part for strand probe
  const fRe = f[0], fIm = f[1];
  for (let i = 0; i < Z; i++) {
    const nx0 = i + P  * Z;
    const nx1 = i + P1 * Z;
    const v0 = Math.sin(nx0 * fRe) * k2;
    const v1 = Math.sin(nx1 * fRe) * k2;
    sum += Math.abs(v0 - v1);
  }
  return sum;
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
      updatePointCloud(data, state.ptSize, state.ptOpacity * state.vis.A.vals[0]);
      if (data.meta) {
        const m = data.meta;
        const tauK = Math.pow(TAU, m.k);
        const eproof = computeEProof(m.f, state.k2, state.n, state.P);
        setText('T-display',      state.T.toFixed(6));
        setText('k-display',      m.k.toFixed(6) + (state.kMode === 'derived' ? ' ←T' : ''));
        setText('k1-display',     m.k1.toFixed(6) + (state.qMode !== 'manual' ? ' ←q' : ''));
        setText('q-display',      (state._q  ?? computeQ(state.q1, state.q2)).toFixed(4));
        setText('d-display',      (state._d  ?? computeD(state.T)).toFixed(6));
        setText('tauk-display',   tauK.toFixed(6));
        setText('f-display',      `(${m.f[0].toFixed(3)}, ${m.f[1].toFixed(3)}i)`);
        setText('eproof-display', eproof.toExponential(3));
        setText('compute-display',`${m.computeMs.toFixed(0)}ms`);
        setText('budget-display', `${data.count.toLocaleString()} / ${data.budget.toLocaleString()}`);
        // sync derived slider displays if in derived mode
        syncDerivedSliders();
      }
    } else {
      updatePointCloud({ positions: new Float32Array(0), colors: new Float32Array(0), sizes: new Float32Array(0), count: 0 }, 0, 0);
    }

    // ── Primary strand lines (unchanged) ──────────────────────────
    if (linesEnabled && state.showLines && state.lineOpacity > 0.01) {
      const primaryPaths = generateStrandPaths(state);
      updateStrandPaths(primaryPaths, state.lineWidth, state.lineOpacity * state.vis.A.vals[1], true);
    } else {
      updateStrandPaths(null, 0, 0, false);
    }

    // ── Atlas curve lines (independent layer) ─────────────────────
    if (linesEnabled && state.showAtlasPaths && state.atlasLineOpacity > 0.01) {
      const atlasPaths = generateAtlasPaths(state);
      updateAtlasPaths(atlasPaths, state.atlasLineWidth, state.atlasLineOpacity * state.vis.A.vals[1]);
      setText('atlas-paths-display', `${atlasPaths.length} / ${state.atlasBudget}`);
    } else {
      updateAtlasPaths(null, 0, 0);
      setText('atlas-paths-display', '—');
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
  if (state.qMode !== 'manual') {
    const el = document.getElementById('slider-k1');
    if (el) el.value = state.k1;
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

    // Special child section for A group: Atlas Curves controls
    if (groupKey === 'A') {
      this.childSection('❆ Atlas Curves', true);
      this.toggle('Atlas paths on', state, 'showAtlasPaths');
      this.slider('atlas width',   state, 'atlasLineWidth',   0.1, 8,   0.1,  { fmt: v => v.toFixed(1) });
      this.slider('atlas opacity', state, 'atlasLineOpacity', 0,   1,   0.05, { fmt: v => v.toFixed(2) });
      this.slider('path budget',   state, 'atlasBudget',      10,  500, 10,   { isHeavy: true, fmt: v => v.toString() });
      this.html('<div class="hud-row" style="margin-top:4px"><span class="hud-key">Atlas paths</span><span class="hud-val" id="atlas-paths-display">—</span></div>');
    }
    
    return this;
  }
}

// ── Build control panel ──────────────────────────────────────

let controlsContainer = null;

function buildControls() {
  if (!controlsContainer) controlsContainer = document.getElementById('controls-panel');
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
  b.section('Traversal')
   .info('T is the primary parameter. k is derived from T via k = log_τ(T·τ/2).')
   .slider('T (traversal)', state, 'T', 0.01, 4, 0.0001, {
     fmt: v => v.toFixed(6),
     onChange: () => { if (state.kMode === 'derived') { state.k = computeKFromT(state.T); } }
   })
   .html(`<div class="mode-row">
     <span class="slider-label">k source</span>
     <button class="mode-pill ctrl-interactive" id="kmode-derived">derived</button>
     <button class="mode-pill ctrl-interactive" id="kmode-manual">manual</button>
   </div>`)
   .slider('k (exponent)', state, 'k', -3, 3, 0.001, {
     id: 'slider-k',
     fmt: v => v.toFixed(6),
     onChange: () => { if (state.kMode === 'manual') { state.T = computeTFromK(state.k); } }
   });

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

  // ── AMPLITUDE / q-SYSTEM ──────────────────────────────────
  b.section('Amplitude')
   .info('k₁ = τ / ((q/2)·d)   where q = q₁·τ^q₂ and d = |2cos(πT)|')
   .slider('q₁ (spoke param)', state, 'q1', 0.1, 71, 0.01, { fmt: v => v.toFixed(4) })
   .slider('q₂ (τ-exponent)', state, 'q2', -4, 4, 1, { fmt: v => v.toFixed(0) })
   .html(`<div class="mode-row">
     <span class="slider-label">k₁ source</span>
     <button class="mode-pill ctrl-interactive" id="qmode-derived">q,d→k₁</button>
     <button class="mode-pill ctrl-interactive" id="qmode-direct">k₁=q₁</button>
     <button class="mode-pill ctrl-interactive" id="qmode-manual">manual</button>
   </div>`)
   .slider('k₁ (amplitude)', state, 'k1', 0.01, 100, 0.01, { id: 'slider-k1', fmt: v => v.toFixed(4) });

  // Wire q-mode pills
  (() => {
    ['derived','direct','manual'].forEach(mode => {
      const btn = b.container.querySelector(`#qmode-${mode}`);
      if (!btn) return;
      btn.classList.toggle('active', state.qMode === mode);
      btn.addEventListener('click', () => {
        state.qMode = mode;
        b.container.querySelectorAll('#qmode-derived,#qmode-direct,#qmode-manual').forEach(el =>
          el.classList.toggle('active', el.id === `qmode-${mode}`));
        deriveState(); regenerate();
      });
    });
  })();

  // ── OUTPUT SCALING ─────────────────────────────────────────
  b.section('Output Scaling')
   .slider('k₂ (spoke scale)', state, 'k2', 0.01, 5, 0.01)
   .slider('Z (sample points)', state, 'n', 1, 2000, 1, { isHeavy: true, fmt: v => v.toString() })
   .slider('# strands', state, 'numStrands', 1, 28, 1, { isHeavy: true, fmt: v => v.toString() })
   .info('sin(n·f)·k₂, strands offset by n');

  // ── PROOF ─────────────────────────────────────────────────
  b.section('Proof')
   .info('α<sup>i·nα/ln(α)</sup> closes at n=1 ⟺ α = τ')
   .slider('α (base)', state, 'alpha', 1, 20, 0.001, {
     fmt: v => {
       if (Math.abs(v - TAU) < 0.01) return `τ ≈ ${TAU.toFixed(3)}`;
       if (Math.abs(v - Math.E) < 0.01) return `e ≈ ${Math.E.toFixed(3)}`;
       if (Math.abs(v - Math.PI) < 0.01) return `π ≈ ${Math.PI.toFixed(3)}`;
       return v.toFixed(3);
     }
   })
   .toggle('Show α trace', state, 'showAlpha')
   .slider('P (block offset)', state, 'P', 1, 50, 1, { fmt: v => v.toFixed(0) })
   .html('<div class="hud-row" style="margin-top:6px"><span class="hud-key">Closure</span><span class="hud-val" id="closure-display-panel">—</span></div>');

  // ── ATLAS VISIBILITY ───────────────────────────────────────
  b.visGroup('A', false)
   .visGroup('G', true)
   .visGroup('D', true)
   .visGroup('E', true)
   .visGroup('B', true)
   .visGroup('C', true)
   .visGroup('F', true)
   .visGroup('H', true);

  b.section('Rendering')
   .slider('point size', state, 'ptSize', 0.1, 6, 0.1)
   .slider('point opacity', state, 'ptOpacity', 0, 1, 0.05)
   .toggle('Show lines', state, 'showLines')
   .slider('line width', state, 'lineWidth', 0.5, 8, 0.25)
   .slider('line opacity', state, 'lineOpacity', 0, 1, 0.05)
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
         Object.assign(state, { T: computeTFromK(1), k: 1, kMode: 'manual', k1: 1, qMode: 'manual', k2: 1, alpha: TAU, numStrands: 6, n: 710 });
         state.vis.G.vals = [1, 0, 0, 0]; buildControls(); } },
     { label: 'Derived (q)', action: () => {
         Object.assign(state, { T: 1.9999, kMode: 'derived', q1: 26.3, q2: 0, qMode: 'derived', alpha: TAU, numStrands: 6, n: 710 });
         buildControls(); } },
     { label: 'The Proof', action: () => Object.assign(state, { k: 1, k1: 1, k2: 1, alpha: Math.E, showAlpha: true, numStrands: 1, n: 710 }) },
     { label: 'Concentric', action: () => Object.assign(state, { k: 0.5, k1: 1, k2: 1, alpha: TAU, numStrands: 6 }) },
     { label: 'Full Atlas', action: () => {
         state.vis.A.vals = [1, 1]; state.vis.G.vals = [1, 1, 1, 1];
         state.vis.D.vals = [1, 1, 1, 1]; state.vis.E.vals = [1, 1, 1];
         state.vis.B.vals = [1, 1]; state.vis.C.vals = [1, 1];
         state.vis.F.vals = [1, 1]; state.vis.H.vals = [1, 1, 1, 1, 1, 1, 1, 1];
     }},
     { label: 'All 28', action: () => Object.assign(state, { numStrands: 28, lineWidth: 1.0, lineOpacity: 0.3, ptSize: 0.5 }) }
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
      <div>Each strand: sin(n·f) · k₂</div>
      <div>Atlas: A(2) × G(4) × E(3) × D(4) × B(2) × C(2) × F(2) × H(8)</div>
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

function animationFrame() {
  const changed = animation.update();
  if (changed) {
    // Sync all slider UIs if engine wrote new values
    for (const link of animation.links) {
      if (link._updateUI) link._updateUI();
    }
    regenerate();
    updateTransportUI();
  }
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

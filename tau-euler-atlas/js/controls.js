// ═══════════════════════════════════════════════════════════════
//  controls.js — UI state management & DOM control binding
//  τ-Euler Atlas · Three.js Edition
// ═══════════════════════════════════════════════════════════════

import { TAU, ZETA_ZEROS, QUADS } from './complex.js';
import { generateAllPoints, generateLineSegments } from './generators.js';
import {
  updatePointCloud, updateLines,
  setBloomStrength, setBloomRadius, resetCamera
} from './scene.js';

// ── State ────────────────────────────────────────────────────
const state = {
  // Core (Model2)
  Z: 710,
  T: 1.9999,
  lFunc: 10,
  lBase: 10,
  k2: 1,

  // q system
  qA: 1,
  q1Mode: 0,
  q1A: 26.3,
  q2: 0,
  zetaIdx: 0,
  qCorr: 1,

  // Strands
  numStrands: 6,
  showLogPlot: false,

  // Rendering
  lineWidth: 0.8,
  lineOpacity: 0.5,
  ptSize: 1.5,
  ptOpacity: 0.7,

  // Stepping
  stepB: 360,

  // Bloom
  bloomStrength: 0.45,

  // Dimensions (Model1)
  dG: [1, 0, 0, 0],       // Quadrants: only RED active by default
  dD: [1, 0, 0, 0],       // Trig: only identity
  dE: [1, 0, 0],           // Expression: only F(point)
  dB: [1, 0],              // Sign: only positive
  dC: [1, 0],              // Log: only raw
};

let regenerateTimeout = null;

// ── Regenerate on state change ───────────────────────────────
function regenerate() {
  // Debounce for rapid slider changes
  clearTimeout(regenerateTimeout);
  regenerateTimeout = setTimeout(() => {
    const data = generateAllPoints(state);
    updatePointCloud(data);

    // Lines
    if (state.lineOpacity > 0.01) {
      const segs = generateLineSegments(state);
      updateLines(segs, state.lineWidth, state.lineOpacity);
    } else {
      updateLines(null, 0, 0);
    }

    // Update HUD
    if (data.meta) {
      const m = data.meta;
      const kDisp = document.getElementById('k-display');
      const k1Disp = document.getElementById('k1-display');
      const fDisp = document.getElementById('f-display');
      if (kDisp) kDisp.textContent = m.k.toFixed(6);
      if (k1Disp) k1Disp.textContent = m.k1.toFixed(6);
      if (fDisp) fDisp.textContent = `(${m.f[0].toFixed(3)}, ${m.f[1].toFixed(3)}i)`;
    }
  }, 16);
}

// ── Build control panel DOM ──────────────────────────────────

function createSection(title) {
  const sec = document.createElement('div');
  sec.className = 'ctrl-section';

  const header = document.createElement('div');
  header.className = 'ctrl-section-header';
  header.textContent = title;

  const body = document.createElement('div');
  body.className = 'ctrl-section-body';

  // Collapsible
  header.addEventListener('click', () => {
    body.classList.toggle('collapsed');
    header.classList.toggle('collapsed');
  });

  sec.appendChild(header);
  sec.appendChild(body);
  return { sec, body };
}

function createSlider(parent, label, key, min, max, step, fmt) {
  const row = document.createElement('div');
  row.className = 'slider-row';

  const lbl = document.createElement('span');
  lbl.className = 'slider-label';
  lbl.textContent = label;

  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = state[key];
  input.className = 'slider-input';

  const val = document.createElement('span');
  val.className = 'slider-value';
  const formatVal = () => {
    if (fmt) return fmt(parseFloat(input.value));
    const v = parseFloat(input.value);
    return Number.isInteger(step) || step >= 1 ? v : v.toFixed(Math.max(1, -Math.floor(Math.log10(step))));
  };
  val.textContent = formatVal();

  input.addEventListener('input', () => {
    state[key] = parseFloat(input.value);
    val.textContent = formatVal();
    regenerate();
  });

  row.appendChild(lbl);
  row.appendChild(input);
  row.appendChild(val);
  parent.appendChild(row);

  return input;
}

function createDimSlider(parent, label, getter, setter, color) {
  const row = document.createElement('div');
  row.className = 'dim-slider-row';

  if (color) {
    const dot = document.createElement('span');
    dot.className = 'dim-dot';
    dot.style.background = color;
    dot.style.opacity = getter();
    row.appendChild(dot);
    // Update dot opacity on change
    row._dot = dot;
  }

  const lbl = document.createElement('span');
  lbl.className = 'dim-label';
  lbl.textContent = label;

  const input = document.createElement('input');
  input.type = 'range';
  input.min = 0;
  input.max = 1;
  input.step = 0.05;
  input.value = getter();
  input.className = 'slider-input';

  const val = document.createElement('span');
  val.className = 'slider-value';
  val.textContent = getter().toFixed(1);

  input.addEventListener('input', () => {
    setter(parseFloat(input.value));
    val.textContent = parseFloat(input.value).toFixed(1);
    if (row._dot) row._dot.style.opacity = parseFloat(input.value);
    regenerate();
  });

  row.appendChild(lbl);
  row.appendChild(input);
  row.appendChild(val);
  parent.appendChild(row);
}

function createToggle(parent, label, key) {
  const btn = document.createElement('button');
  btn.className = 'toggle-pill' + (state[key] ? ' active' : '');
  btn.innerHTML = `<span class="pill-dot"></span>${label}`;

  btn.addEventListener('click', () => {
    state[key] = !state[key];
    btn.classList.toggle('active', state[key]);
    regenerate();
  });

  parent.appendChild(btn);
  return btn;
}

function createToggleValue(parent, label, key, value) {
  const btn = document.createElement('button');
  btn.className = 'toggle-pill' + (state[key] === value ? ' active' : '');
  btn.innerHTML = `<span class="pill-dot"></span>${label}`;

  btn.addEventListener('click', () => {
    state[key] = value;
    // Deactivate siblings
    parent.querySelectorAll('.toggle-pill').forEach(b => {
      b.classList.remove('active');
    });
    btn.classList.add('active');
    regenerate();
  });

  parent.appendChild(btn);
  return btn;
}

function createPresetButton(parent, label, presetFn) {
  const btn = document.createElement('button');
  btn.className = 'preset-btn';
  btn.textContent = label;

  btn.addEventListener('click', () => {
    presetFn();
    regenerate();
    // Rebuild controls to reflect new values
    buildControls();
  });

  parent.appendChild(btn);
}

// ── Master control builder ───────────────────────────────────
let controlsContainer = null;

function buildControls() {
  if (!controlsContainer) {
    controlsContainer = document.getElementById('controls-panel');
  }
  controlsContainer.innerHTML = '';

  // ── Core Parameters ──
  const { sec: coreSec, body: coreBody } = createSection('Core Parameters');
  createSlider(coreBody, 'Z', 'Z', 1, 2000, 1);
  createSlider(coreBody, 'T', 'T', 0.01, 4, 0.0001, v => v.toFixed(4));
  createSlider(coreBody, 'log base (l)', 'lFunc', 2, 100, 0.1);
  createSlider(coreBody, 'k₂ (scale)', 'k2', 0.01, 5, 0.01);
  controlsContainer.appendChild(coreSec);

  // ── k₁ System ──
  const { sec: k1Sec, body: k1Body } = createSection('k₁ System');

  const qaRow = document.createElement('div');
  qaRow.className = 'toggle-group-inline';
  createToggleValue(qaRow, 'qₐ=0 (k₁=q₁)', 'qA', 0);
  createToggleValue(qaRow, 'qₐ=1 (k₁=τ/…)', 'qA', 1);
  k1Body.appendChild(qaRow);

  const q1Row = document.createElement('div');
  q1Row.className = 'toggle-group-inline';
  createToggleValue(q1Row, 'Manual q₁', 'q1Mode', 0);
  createToggleValue(q1Row, 'Zeta zero', 'q1Mode', 1);
  k1Body.appendChild(q1Row);

  if (state.q1Mode === 0) {
    createSlider(k1Body, 'q₁', 'q1A', 0.01, 100, 0.001);
  } else {
    createSlider(k1Body, 'ζ zero #', 'zetaIdx', 0, 12, 1,
      v => `${v + 1}: ${ZETA_ZEROS[v].toFixed(4)}`);
  }

  createSlider(k1Body, 'q₂ (τ^q₂)', 'q2', -5, 2, 1, v => v.toString());

  if (state.qA === 1) {
    const corrRow = document.createElement('div');
    corrRow.className = 'toggle-group-inline';
    createToggleValue(corrRow, 'No correction', 'qCorr', 0);
    createToggleValue(corrRow, 'd-correction', 'qCorr', 1);
    k1Body.appendChild(corrRow);
  }
  controlsContainer.appendChild(k1Sec);

  // ── Strands ──
  const { sec: strandSec, body: strandBody } = createSection('Strands');
  createSlider(strandBody, '# strands', 'numStrands', 1, 28, 1, v => v.toString());

  const strandInfo = document.createElement('div');
  strandInfo.className = 'ctrl-info';
  strandInfo.textContent = `n = [0..${state.Z - 1}], bands offset by Z`;
  strandBody.appendChild(strandInfo);

  createToggle(strandBody, 'Show log overlay', 'showLogPlot');
  if (state.showLogPlot) {
    createSlider(strandBody, 'log base', 'lBase', 2, 100, 0.1);
  }
  controlsContainer.appendChild(strandSec);

  // ── G: Quadrants ──
  const { sec: gSec, body: gBody } = createSection('G: Quadrants');
  QUADS.forEach((q, i) => {
    createDimSlider(gBody,
      `${q.name} (${q.s < 0 ? '−' : '+'})(${q.iS < 0 ? '−i' : '+i'})`,
      () => state.dG[i],
      v => { state.dG[i] = v; },
      q.hex
    );
  });
  controlsContainer.appendChild(gSec);

  // ── D: Trig ──
  const { sec: dSec, body: dBody } = createSection('D: Trig Function');
  ['identity', 'sin', 'cos', 'tan'].forEach((l, i) => {
    createDimSlider(dBody, l,
      () => state.dD[i],
      v => { state.dD[i] = v; }
    );
  });
  controlsContainer.appendChild(dSec);

  // ── E: Expression type ──
  const { sec: eSec, body: eBody } = createSection('E: Expression Type');
  ['F (point)', 'V (vector: J·F)', 'C (curve: (τ/n)ᵏ)'].forEach((l, i) => {
    createDimSlider(eBody, l,
      () => state.dE[i],
      v => { state.dE[i] = v; }
    );
  });
  controlsContainer.appendChild(eSec);

  // ── B×C: Sign × Log ──
  const { sec: bcSec, body: bcBody } = createSection('B×C: Sign × Log');
  createDimSlider(bcBody, 'B₁: positive (+f)', () => state.dB[0], v => { state.dB[0] = v; });
  createDimSlider(bcBody, 'B₂: negative (−f)', () => state.dB[1], v => { state.dB[1] = v; });
  createDimSlider(bcBody, 'C₁: base (raw)', () => state.dC[0], v => { state.dC[0] = v; });
  createDimSlider(bcBody, 'C₂: log-wrapped', () => state.dC[1], v => { state.dC[1] = v; });
  controlsContainer.appendChild(bcSec);

  // ── Rendering ──
  const { sec: renSec, body: renBody } = createSection('Rendering');
  createSlider(renBody, 'point size', 'ptSize', 0.1, 6, 0.25);
  createSlider(renBody, 'line opacity', 'lineOpacity', 0, 1, 0.05);
  createSlider(renBody, 'bloom', 'bloomStrength', 0, 1.5, 0.05);

  // Bloom listener
  const bloomInput = renBody.querySelector('input[type="range"]:last-of-type');
  if (bloomInput) {
    bloomInput.addEventListener('input', () => {
      setBloomStrength(state.bloomStrength);
    });
  }
  controlsContainer.appendChild(renSec);

  // ── View ──
  const { sec: viewSec, body: viewBody } = createSection('View');
  const viewRow = document.createElement('div');
  viewRow.className = 'preset-row';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'preset-btn';
  resetBtn.textContent = 'Reset Camera';
  resetBtn.addEventListener('click', resetCamera);
  viewRow.appendChild(resetBtn);
  viewBody.appendChild(viewRow);
  controlsContainer.appendChild(viewSec);

  // ── Presets ──
  const { sec: presetSec, body: presetBody } = createSection('Presets');
  const presetRow = document.createElement('div');
  presetRow.className = 'preset-row';

  createPresetButton(presetRow, 'Default (Z=710)', () => {
    Object.assign(state, {
      Z: 710, T: 1.9999, q1A: 26.3, q2: 0, qA: 1, qCorr: 1,
      numStrands: 6, lFunc: 10
    });
  });

  createPresetButton(presetRow, 'Zeta ζ₁=14.13', () => {
    Object.assign(state, {
      Z: 710, T: 1.9999, q1Mode: 1, zetaIdx: 0, qA: 1, qCorr: 1
    });
  });

  createPresetButton(presetRow, '3 spokes', () => {
    Object.assign(state, {
      Z: 710, q1A: 3.052072, q2: -3, qA: 1, qCorr: 1
    });
  });

  createPresetButton(presetRow, '4 spokes', () => {
    Object.assign(state, {
      Z: 710, q1A: 3.1374845, q2: -4, qA: 1, qCorr: 1
    });
  });

  createPresetButton(presetRow, '5 spokes', () => {
    Object.assign(state, {
      Z: 710, q1A: 3.1371689, q2: -4, qA: 1, qCorr: 1
    });
  });

  createPresetButton(presetRow, 'All 28 strands', () => {
    Object.assign(state, {
      numStrands: 28, lineWidth: 0.3, lineOpacity: 0.3, ptSize: 0.5
    });
  });

  createPresetButton(presetRow, 'Full Atlas', () => {
    Object.assign(state, {
      dG: [1, 1, 1, 1], dD: [1, 1, 1, 1], dE: [1, 1, 1],
      dB: [1, 1], dC: [1, 1]
    });
  });

  createPresetButton(presetRow, 'Sin only', () => {
    Object.assign(state, {
      dG: [0, 0, 0, 1], dD: [0, 1, 0, 0], dE: [1, 0, 0],
      dB: [1, 0], dC: [1, 0]
    });
  });

  presetBody.appendChild(presetRow);
  controlsContainer.appendChild(presetSec);

  // ── Architecture Info ──
  const { sec: archSec, body: archBody } = createSection('Architecture');
  const archInfo = document.createElement('div');
  archInfo.className = 'ctrl-info arch-info';
  archInfo.innerHTML = `
    <div>f = k₁ · e<sup>iτ<sup>k</sup></sup></div>
    <div>k = log<sub>l</sub>(T·τ/2) / log<sub>l</sub>(τ)</div>
    <div class="arch-spacer"></div>
    <div>qₐ=0: k₁ = q₁ directly</div>
    <div>qₐ=1: k₁ = τ / (q/2 · corr)</div>
    <div class="arch-spacer"></div>
    <div>q = q₁ · τ<sup>q₂</sup></div>
    <div>d = |2cos(τT/2)| correction</div>
    <div class="arch-spacer"></div>
    <div>C_a = 710/(113τ) ≈ ${(710 / (113 * TAU)).toFixed(6)}</div>
    <div class="arch-spacer"></div>
    <div>Each strand: sin((n + j·Z) · f) · k₂</div>
    <div>Spoke count ↔ rational divisions of τ via k₁</div>
    <div class="arch-spacer"></div>
    <div>Atlas: G(4 quadrants) × E(3 expr) × D(4 trig) × B(2 sign) × C(2 log)</div>
  `;
  archBody.appendChild(archInfo);
  controlsContainer.appendChild(archSec);
}

// ── Public init ──────────────────────────────────────────────
export function initControls() {
  buildControls();
  regenerate();
}

// ═══════════════════════════════════════════════════════════════
//  scene.js — Three.js scene, camera, postprocessing (v4)
//  Line2 fat lines, 2D/3D cameras, perf/cinematic toggle
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { TAU } from './complex.js';
import {
  isPerformance, isCinematic, is2D, is3D,
  isDark, isLight,
  onThemeChange, onRenderChange, onViewChange
} from './modes.js';

let scene, renderer, composer, controls;
let perspCam, orthoCam;
let activeCamera;
let bloomPass, renderPass, outputPass;
let pointCloud = null;
let strandLines = [];
let atlasLines  = [];  // independent layer for atlas expression curves
let gridGroup = null;
let refCircles = null;
let starSystem = null;
let ghostTauLine = null;    // τ-native circle trace (cyan)
let ghostAlphaLine = null;  // α-base circle trace (amber, proof)
let orbitCircle = null;     // dynamic r = τ^{-k} circle
let time = 0;
let frameCount = 0, lastFpsTime = performance.now(), fps = 60;
let idleTimer = 0;
let isIdle = false;
let _userInteracted = false;

const FOG_COLOR = 0x050608;
let bloomEnabled = true;
let bloomStrength = 0.45;
let bloomRadius = 0.45;
let bloomThreshold = 0.8;
let fogEnabled = true;
let fogDensity = 0.0008;
let toneEnabled = true;
let toneExposure = 1.05;

// ── Cinematic parameters (exposed to controls) ──────────────
export const cinematic = {
  starRotY: 0.0002,
  starRotX: 0.00008,
  starDrift: 0.04,
  starsEnabled: true,
  starOpacity: 0.25,
};

function hasComposerPass(pass) {
  return !!(composer && pass && composer.passes.includes(pass));
}

function setComposerPassEnabled(pass, enabled) {
  if (!composer || !pass || !outputPass) return;
  const hasPass = hasComposerPass(pass);
  if (enabled && !hasPass) {
    composer.removePass(outputPass);
    composer.addPass(pass);
    composer.addPass(outputPass);
  } else if (!enabled && hasPass) {
    composer.removePass(pass);
  }
}

function applyBloomRuntime() {
  if (!bloomPass) return;
  bloomPass.strength = bloomStrength;
  bloomPass.radius = bloomRadius;
  bloomPass.threshold = bloomThreshold;
  setComposerPassEnabled(bloomPass, isCinematic() && bloomEnabled);
}

function applyFogRuntime() {
  if (!scene) return;
  const shouldShowFog = isCinematic() && fogEnabled && fogDensity > 0;
  scene.fog = shouldShowFog ? new THREE.FogExp2(FOG_COLOR, fogDensity) : null;
}

function applyToneRuntime() {
  if (!renderer) return;
  renderer.toneMapping = isCinematic() ? THREE.ACESFilmicToneMapping : THREE.LinearToneMapping;
  renderer.toneMappingExposure = toneEnabled ? toneExposure : 1;
}

function applyStarRuntime() {
  if (!starSystem) return;
  const visible = isCinematic() && isDark() && cinematic.starsEnabled;
  starSystem.visible = visible;
  starSystem.material.opacity = cinematic.starOpacity;
}

// ── Textures ─────────────────────────────────────────────────

function makeParticleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0,    'rgba(255,255,255,1.0)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.4,  'rgba(200,230,255,0.35)');
  g.addColorStop(0.75, 'rgba(180,210,255,0.08)');
  g.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

function makeTrailTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0,   'rgba(255,255,255,0.7)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.2)');
  g.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

function makeSimpleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0,   'rgba(255,255,255,1.0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  g.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const cinematicTexture = makeParticleTexture();
const perfTexture = makeSimpleTexture();

// ── Star particle system ──────────────────────────────────────

const STAR_COLORS = [
  [0.36, 0.83, 0.94],  // cyan
  [0.55, 0.91, 1.0],   // pale cyan
  [0.66, 0.84, 0.78],  // teal
  [0.50, 0.72, 0.82],  // slate blue
  [0.80, 0.96, 1.0],   // ice
  [0.42, 0.78, 0.89],  // aqua
];

function buildStars() {
  const STAR_COUNT = 3000;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(STAR_COUNT * 3);
  const col = new Float32Array(STAR_COUNT * 3);
  const siz = new Float32Array(STAR_COUNT);

  for (let i = 0; i < STAR_COUNT; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * 180;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 140;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 180;
    const tc = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    col[i * 3]     = tc[0];
    col[i * 3 + 1] = tc[1];
    col[i * 3 + 2] = tc[2];
    siz[i] = Math.random() * 1.0 + 0.2;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(siz, 1));

  const mat = new THREE.PointsMaterial({
    size: 1.0,
    map: makeParticleTexture(),
    vertexColors: true,
    transparent: true,
    opacity: cinematic.starOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  starSystem = new THREE.Points(geo, mat);
  scene.add(starSystem);
}

function animateStars() {
  if (!starSystem || !starSystem.visible || !cinematic.starsEnabled) return; // Strict performance guard
  
  const pos = starSystem.geometry.attributes.position.array;
  const count = pos.length / 3;
  const drift = cinematic.starDrift;

  // Particle drift physics
  for (let i = 0; i < count; i++) {
    const ix = i * 3, iy = ix + 1, iz = ix + 2;
    pos[iy] += drift;
    if (pos[iy] > 55) pos[iy] = -55;
    pos[ix] += Math.sin(time * 2 + i * 0.08) * 0.06;
    pos[iz] += Math.cos(time * 1.7 + i * 0.08) * 0.06;
  }
  starSystem.geometry.attributes.position.needsUpdate = true;
  
  // Overall group rotation
  starSystem.rotation.y += cinematic.starRotY;
  starSystem.rotation.x += cinematic.starRotX;
}

export function setStarVisibility(v) {
  cinematic.starsEnabled = !!v;
  applyStarRuntime();
}

export function setStarOpacity(v) {
  cinematic.starOpacity = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : cinematic.starOpacity;
  applyStarRuntime();
}

export function setStarMotion(rotX, rotY, drift) {
  if (Number.isFinite(rotX)) cinematic.starRotX = Math.max(0, rotX);
  if (Number.isFinite(rotY)) cinematic.starRotY = Math.max(0, rotY);
  if (Number.isFinite(drift)) cinematic.starDrift = Math.max(0, drift);
}

// ── Grid + axes ──────────────────────────────────────────────

function buildGrid() {
  gridGroup = new THREE.Group();
  const darkMode = isDark();

  const gridMat = new THREE.LineBasicMaterial({
    color: darkMode ? 0x0e0e22 : 0xe0e0e8,
    transparent: true,
    opacity: 0.6
  });

  const extent = 20;
  for (let v = -extent; v <= extent; v++) {
    const vGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(v, -extent, 0),
      new THREE.Vector3(v, extent, 0)
    ]);
    gridGroup.add(new THREE.Line(vGeo, gridMat));
    const hGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-extent, v, 0),
      new THREE.Vector3(extent, v, 0)
    ]);
    gridGroup.add(new THREE.Line(hGeo, gridMat));
  }

  const axisMat = new THREE.LineBasicMaterial({
    color: darkMode ? 0x1a1a3a : 0x333366,
    transparent: true,
    opacity: 0.9
  });

  const reAxis = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-extent, 0, 0),
    new THREE.Vector3(extent, 0, 0)
  ]);
  gridGroup.add(new THREE.Line(reAxis, axisMat));

  const imAxis = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -extent, 0),
    new THREE.Vector3(0, extent, 0)
  ]);
  gridGroup.add(new THREE.Line(imAxis, axisMat));

  scene.add(gridGroup);
}

// ── Reference circles ────────────────────────────────────────

function buildRefCircles() {
  refCircles = new THREE.Group();

  const unitGeo = new THREE.RingGeometry(0.99, 1.01, 128);
  const unitMat = new THREE.MeshBasicMaterial({
    color: 0x222255,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  });
  refCircles.add(new THREE.Mesh(unitGeo, unitMat));

  const tauR = 1 / TAU;
  const tauPts = [];
  for (let i = 0; i <= 256; i++) {
    const angle = (i / 256) * TAU;
    tauPts.push(new THREE.Vector3(
      Math.cos(angle) * tauR,
      Math.sin(angle) * tauR, 0
    ));
  }
  const tauGeo = new THREE.BufferGeometry().setFromPoints(tauPts);
  const tauMat = new THREE.LineDashedMaterial({
    color: 0x552222,
    dashSize: 0.02, gapSize: 0.02,
    transparent: true, opacity: 0.5
  });
  const tauLine = new THREE.Line(tauGeo, tauMat);
  tauLine.computeLineDistances();
  refCircles.add(tauLine);

  scene.add(refCircles);
}

// ── Scene initialization ─────────────────────────────────────

export function initScene() {
  scene = new THREE.Scene();
  scene.fog = null;

  // Perspective camera (3D mode) — FOV 70 matches style examples
  perspCam = new THREE.PerspectiveCamera(
    70, window.innerWidth / window.innerHeight, 0.01, 2000
  );
  perspCam.position.set(0, 0, 5);

  // Orthographic camera (2D mode)
  const aspect = window.innerWidth / window.innerHeight;
  const frustum = 4;
  orthoCam = new THREE.OrthographicCamera(
    -frustum * aspect, frustum * aspect,
    frustum, -frustum, 0.01, 2000
  );
  orthoCam.position.set(0, 0, 10);
  orthoCam.lookAt(0, 0, 0);

  activeCamera = is2D() ? orthoCam : perspCam;

  // Renderer
  renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true   // for screenshot export
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = toneExposure;

  document.getElementById('container').appendChild(renderer.domElement);

  // Controls — damping 0.07, zoom 0.8 matches style examples
  controls = new OrbitControls(activeCamera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.8;
  controls.minDistance = 0.5;
  controls.maxDistance = 350;
  controls.enablePan = true;
  controls.enableRotate = is3D();

  // Post-processing — bloom params from style_example_2: 0.55, 0.45, 0.8
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(scene, activeCamera);
  composer.addPass(renderPass);

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    bloomStrength, bloomRadius, bloomThreshold
  );

  outputPass = new OutputPass();
  composer.addPass(outputPass);

  // Scene elements
  buildGrid();
  buildRefCircles();
  if (isDark()) buildStars();
  applyBloomRuntime();
  applyFogRuntime();
  applyToneRuntime();
  applyStarRuntime();

  // Resize
  window.addEventListener('resize', handleResize);

  // Idle tracking
  ['mousemove', 'mousedown', 'wheel', 'touchstart'].forEach(ev => {
    renderer.domElement.addEventListener(ev, () => {
      _userInteracted = true;
      isIdle = false;
      idleTimer = 0;
    });
  });

  // Dblclick reset
  renderer.domElement.addEventListener('dblclick', resetCamera);

  // Mode change hooks
  onThemeChange(handleThemeChange);
  onRenderChange(handleRenderChange);
  onViewChange(handleViewChange);
}

function handleResize() {
  const w = window.innerWidth, h = window.innerHeight;
  const aspect = w / h;

  perspCam.aspect = aspect;
  perspCam.updateProjectionMatrix();

  const f = 4;
  orthoCam.left = -f * aspect;
  orthoCam.right = f * aspect;
  orthoCam.top = f;
  orthoCam.bottom = -f;
  orthoCam.updateProjectionMatrix();

  renderer.setSize(w, h);
  composer.setSize(w, h);

  // Update Line2 materials resolution
  strandLines.forEach(line => {
    if (line.material.resolution) {
      line.material.resolution.set(w, h);
    }
  });
}

// ── Mode change handlers ─────────────────────────────────────

function handleThemeChange(theme) {
  // CSS filter: invert(1) hue-rotate(180deg) handles light mode visually.
  // Scene stays dark in both modes — the filter inverts it for the user.
  // Just rebuild the grid in case it has theme-sensitive colors.

  // Rebuild grid with new colors
  if (gridGroup) {
    scene.remove(gridGroup);
    gridGroup.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
  buildGrid();
  if (isDark() && !starSystem) buildStars();
  applyStarRuntime();
}

function handleRenderChange(mode) {
  if (mode === 'cinematic' && isDark() && !starSystem) buildStars();
  applyBloomRuntime();
  applyFogRuntime();
  applyToneRuntime();
  applyStarRuntime();
}

function handleViewChange(mode) {
  if (mode === '2d') {
    activeCamera = orthoCam;
    controls.object = orthoCam;
    controls.enableRotate = false;
    // Match perspective position roughly
    const dist = perspCam.position.length();
    orthoCam.position.set(0, 0, 10);
    orthoCam.zoom = 5 / Math.max(1, dist);
    orthoCam.updateProjectionMatrix();
  } else {
    activeCamera = perspCam;
    controls.object = perspCam;
    controls.enableRotate = true;
  }
  renderPass.camera = activeCamera;
  controls.update();
}

// ── Point cloud management ───────────────────────────────────

export function updatePointCloud(data, ptSize, ptOpacity) {
  const { positions, colors, sizes, count } = data;

  if (pointCloud) {
    scene.remove(pointCloud);
    pointCloud.geometry.dispose();
    pointCloud.material.dispose();
    pointCloud = null;
  }

  if (count === 0) return;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const tex = isPerformance() ? perfTexture : cinematicTexture;
  // Size 3.0 base in cinematic mode (matching style_example_2), scaled by user ptSize
  const baseSize = isCinematic() ? 0.06 : 0.03;
  const mat = new THREE.PointsMaterial({
    size: Math.max(0.005, ptSize * baseSize),
    map: tex,
    vertexColors: true,
    transparent: true,
    opacity: Math.max(0.01, ptOpacity),
    blending: isDark() ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    sizeAttenuation: true
  });

  pointCloud = new THREE.Points(geo, mat);
  scene.add(pointCloud);

  const nodeDisp = document.getElementById('node-display');
  if (nodeDisp) nodeDisp.textContent = count.toLocaleString();
}

// ── Line2 strand path management ─────────────────────────────

export function updateStrandPaths(paths, lineWidth, lineOpacity, showLines) {
  // Dispose old
  strandLines.forEach(line => {
    scene.remove(line);
    line.geometry.dispose();
    line.material.dispose();
  });
  strandLines = [];

  if (!showLines || !paths || paths.length === 0 || lineOpacity < 0.01 || lineWidth < 0.1) return;

  const w = window.innerWidth, h = window.innerHeight;

  for (const path of paths) {
    if (path.pointCount < 2) continue;

    const geo = new LineGeometry();

    // LineGeometry expects flat position array [x,y,z, x,y,z, ...]
    geo.setPositions(path.positions);

    // Set per-vertex colors
    const flatColors = new Float32Array(path.pointCount * 3);
    for (let i = 0; i < path.pointCount; i++) {
      flatColors[i * 3]     = path.color[0];
      flatColors[i * 3 + 1] = path.color[1];
      flatColors[i * 3 + 2] = path.color[2];
    }
    geo.setColors(flatColors);

    const mat = new LineMaterial({
      linewidth: Math.max(0.5, lineWidth),
      vertexColors: true,
      transparent: true,
      opacity: lineOpacity,
      worldUnits: false,  // screen-space pixels
      alphaToCoverage: false,
      depthWrite: false,
    });
    mat.resolution.set(w, h);

    const line = new Line2(geo, mat);
    line.computeLineDistances();
    scene.add(line);
    strandLines.push(line);
  }
}

// ── Atlas curve path management (independent from strand lines) ──
//
//  finalLineWidth = globalWidth × path.widthMul
//  where widthMul = Π(group.lineW) × Π(member.sizes[i])  — the s_ system

export function updateAtlasPaths(paths, globalWidth, lineOpacity) {
  // Dispose old atlas lines
  atlasLines.forEach(line => {
    scene.remove(line);
    line.geometry.dispose();
    line.material.dispose();
  });
  atlasLines = [];

  if (!paths || paths.length === 0 || lineOpacity < 0.01 || globalWidth < 0.05) return;

  const w = window.innerWidth, h = window.innerHeight;

  for (const path of paths) {
    if (path.pointCount < 2) continue;

    const geo = new LineGeometry();
    geo.setPositions(path.positions);

    const flatColors = new Float32Array(path.pointCount * 3);
    for (let i = 0; i < path.pointCount; i++) {
      flatColors[i * 3]     = path.color[0];
      flatColors[i * 3 + 1] = path.color[1];
      flatColors[i * 3 + 2] = path.color[2];
    }
    geo.setColors(flatColors);

    // Apply per-path width multiplier (s_ system: global × widthMul)
    const pw = Math.max(0.2, globalWidth * (path.widthMul ?? 1));
    // Apply per-path opacity multiplier (lineOp system: global × opacityMul)
    const po = Math.min(1, lineOpacity * (path.opacityMul ?? 1));

    const mat = new LineMaterial({
      linewidth: pw,
      vertexColors: true,
      transparent: true,
      opacity: po,
      worldUnits: false,
      alphaToCoverage: false,
      depthWrite: false,
    });
    mat.resolution.set(w, h);

    const line = new Line2(geo, mat);
    line.computeLineDistances();
    scene.add(line);
    atlasLines.push(line);
  }
}

// ── Ghost traces (α-comparison proof) ────────────────────────
//  τ trace:  τ^{i·nτ^k/ln(τ)} — always closes at n=1 (cyan)
//  α trace:  α^{i·nα^k/ln(α)} — only closes at n=1 when α=τ (amber)

export function updateGhostTraces(tauPts, alphaPts, showAlpha) {
  // Dispose old traces
  if (ghostTauLine) {
    scene.remove(ghostTauLine);
    ghostTauLine.geometry.dispose();
    ghostTauLine.material.dispose();
    ghostTauLine = null;
  }
  if (ghostAlphaLine) {
    scene.remove(ghostAlphaLine);
    ghostAlphaLine.geometry.dispose();
    ghostAlphaLine.material.dispose();
    ghostAlphaLine = null;
  }

  const w = window.innerWidth, h = window.innerHeight;

  // τ trace — always shown (cyan, bright)
  if (tauPts && tauPts.length >= 2) {
    const pos = new Float32Array(tauPts.length * 3);
    const col = new Float32Array(tauPts.length * 3);
    for (let i = 0; i < tauPts.length; i++) {
      pos[i * 3] = tauPts[i][0];
      pos[i * 3 + 1] = tauPts[i][1];
      pos[i * 3 + 2] = 0;
      col[i * 3]     = 0.2;
      col[i * 3 + 1] = 0.85;
      col[i * 3 + 2] = 1.0;
    }
    const geo = new LineGeometry();
    geo.setPositions(pos);
    geo.setColors(col);
    const mat = new LineMaterial({
      linewidth: 3,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      worldUnits: false,
      depthWrite: false,
    });
    mat.resolution.set(w, h);
    ghostTauLine = new Line2(geo, mat);
    ghostTauLine.computeLineDistances();
    scene.add(ghostTauLine);
  }

  // α trace — shown only when α ≠ τ (amber, dimmer)
  if (showAlpha && alphaPts && alphaPts.length >= 2) {
    const pos = new Float32Array(alphaPts.length * 3);
    const col = new Float32Array(alphaPts.length * 3);
    for (let i = 0; i < alphaPts.length; i++) {
      pos[i * 3] = alphaPts[i][0];
      pos[i * 3 + 1] = alphaPts[i][1];
      pos[i * 3 + 2] = 0;
      col[i * 3]     = 1.0;
      col[i * 3 + 1] = 0.65;
      col[i * 3 + 2] = 0.15;
    }
    const geo = new LineGeometry();
    geo.setPositions(pos);
    geo.setColors(col);
    const mat = new LineMaterial({
      linewidth: 2.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      worldUnits: false,
      depthWrite: false,
    });
    mat.resolution.set(w, h);
    ghostAlphaLine = new Line2(geo, mat);
    ghostAlphaLine.computeLineDistances();
    scene.add(ghostAlphaLine);
  }
}

// ── Dynamic orbit circle at r = τ^{-k} ──────────────────────

export function updateOrbitCircle(k) {
  if (orbitCircle) {
    scene.remove(orbitCircle);
    orbitCircle.geometry.dispose();
    orbitCircle.material.dispose();
    orbitCircle = null;
  }

  const radius = Math.pow(TAU, -k);
  if (radius < 0.001 || radius > 100 || !isFinite(radius)) return;

  // Don't draw if it's basically the unit circle (already shown)
  if (Math.abs(radius - 1) < 0.02) return;
  // Don't draw if it's basically the 1/τ circle (already shown)
  if (Math.abs(radius - 1 / TAU) < 0.02) return;

  const pts = [];
  for (let i = 0; i <= 256; i++) {
    const angle = (i / 256) * TAU;
    pts.push(new THREE.Vector3(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius, 0
    ));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineDashedMaterial({
    color: 0x336688,
    dashSize: 0.03, gapSize: 0.02,
    transparent: true, opacity: 0.4
  });
  orbitCircle = new THREE.Line(geo, mat);
  orbitCircle.computeLineDistances();
  scene.add(orbitCircle);
}

// ── FPS tracking ─────────────────────────────────────────────

function updateFps() {
  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    fps = Math.round(frameCount * 1000 / (now - lastFpsTime));
    const fpsEl = document.getElementById('fps-display');
    if (fpsEl) fpsEl.textContent = fps;
    frameCount = 0;
    lastFpsTime = now;
  }
}

// ── Bloom control ────────────────────────────────────────────

export function setBloomEnabled(v) {
  bloomEnabled = !!v;
  applyBloomRuntime();
}

export function setBloomStrength(v)  {
  if (Number.isFinite(v)) bloomStrength = Math.max(0, v);
  applyBloomRuntime();
}

export function setBloomRadius(v)    {
  if (Number.isFinite(v)) bloomRadius = Math.max(0, v);
  applyBloomRuntime();
}

export function setBloomThreshold(v) {
  if (Number.isFinite(v)) bloomThreshold = Math.max(0, Math.min(1, v));
  applyBloomRuntime();
}

export function setToneEnabled(v) {
  toneEnabled = !!v;
  applyToneRuntime();
}

export function setToneExposure(v)   {
  if (Number.isFinite(v)) toneExposure = Math.max(0.1, v);
  applyToneRuntime();
}

export function setFogEnabled(v) {
  fogEnabled = !!v;
  applyFogRuntime();
}

export function setFogDensity(v)     {
  if (Number.isFinite(v)) fogDensity = Math.max(0, v);
  applyFogRuntime();
}


// ── Camera ───────────────────────────────────────────────────

export function resetCamera() {
  perspCam.position.set(0, 0, 5);
  perspCam.lookAt(0, 0, 0);
  orthoCam.position.set(0, 0, 10);
  orthoCam.zoom = 1;
  orthoCam.updateProjectionMatrix();
  controls.reset();
}

// ── Screenshot export ────────────────────────────────────────

export function captureScreenshot() {
  composer.render();
  const link = document.createElement('a');
  link.download = `tau-euler-atlas-${Date.now()}.png`;
  link.href = renderer.domElement.toDataURL('image/png');
  link.click();
}

// ── Animation loop ───────────────────────────────────────────

let _externalUpdate = null;
export function setExternalUpdate(fn) { _externalUpdate = fn; }

export function startRenderLoop() {
  function animate() {
    requestAnimationFrame(animate);

    // Idle throttle: drop to 10fps when idle for 2s
    if (!_userInteracted) {
      idleTimer += 1 / 60;
      if (idleTimer > 2 && !isIdle) {
        isIdle = true;
      }
    } else {
      _userInteracted = false;
    }

    // Skip frames in idle mode (render every 6th frame ≈ 10fps)
    if (isIdle && frameCount % 6 !== 0 && !_externalUpdate) {
      frameCount++;
      return;
    }

    time += 0.01;
    updateFps();
    controls.update();

    // External update (animation engine)
    if (_externalUpdate) _externalUpdate();

    // Star ambient motion (user-controllable speeds)
    if (isCinematic()) {
      animateStars();
    }

    composer.render();
  }

  animate();
}

// ── Renderer access (for screenshot) ─────────────────────────

export function getRenderer() { return renderer; }

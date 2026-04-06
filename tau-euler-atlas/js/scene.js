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
  normalizeCameraSnapshot,
  applyCameraFieldToSnapshot,
} from './camera-panel.js';
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
let pointCloudMat = null;   // persistent material — never disposed
let strandLines = [];       // object pool — entries hidden, not disposed
let atlasLines  = [];       // object pool — independent layer for atlas expression curves
let gridGroup = null;
let refCircles = null;
let starSystem = null;
let ghostTauLine = null;    // τ-native circle trace (cyan) — singleton, reused
let ghostAlphaLine = null;  // α-base circle trace (amber, proof) — singleton, reused
let orbitCircle = null;     // dynamic r = τ^{-k} circle — singleton, reused

// ── Cached DOM references (set once in initScene) ────────────
let _fpsEl = null;
let _nodeDispEl = null;
let time = 0;
let frameCount = 0, lastFpsTime = performance.now(), fps = 60;
let idleTimer = 0;
let isIdle = false;
let _userInteracted = false;
let suspendHeavyEffects = false;
const cameraPanelListeners = new Set();

const FOG_COLOR = 0x050608;
let bloomEnabled = true;
let bloomStrength = 0.45;
let bloomRadius = 0.45;
let bloomThreshold = 0.8;
let fogEnabled = true;
let fogDensity = 0.0008;
let toneEnabled = true;
let toneExposure = 1.05;

function emitCameraPanelChange(reason = 'scene', source = 'scene') {
  if (cameraPanelListeners.size === 0) return;
  const snapshot = getCameraPanelSnapshot();
  for (const cb of cameraPanelListeners) {
    try {
      cb({
        reason,
        source,
        snapshot,
      });
    } catch (_) {
      // Ignore callback exceptions from UI listeners.
    }
  }
}

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
  setComposerPassEnabled(bloomPass, isCinematic() && bloomEnabled && !suspendHeavyEffects);
}

function applyFogRuntime() {
  if (!scene) return;
  const shouldShowFog = isCinematic() && fogEnabled && fogDensity > 0 && !suspendHeavyEffects;
  scene.fog = shouldShowFog ? new THREE.FogExp2(FOG_COLOR, fogDensity) : null;
}

function applyToneRuntime() {
  if (!renderer) return;
  renderer.toneMapping = isCinematic() ? THREE.ACESFilmicToneMapping : THREE.LinearToneMapping;
  renderer.toneMappingExposure = toneEnabled ? toneExposure : 1;
}

function applyStarRuntime() {
  if (!starSystem) return;
  const visible = isCinematic() && isDark() && cinematic.starsEnabled && !suspendHeavyEffects;
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
  if (!starSystem || !starSystem.visible || !cinematic.starsEnabled || suspendHeavyEffects) return; // Strict performance guard
  
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

export function setHeavyEffectsSuspended(v) {
  suspendHeavyEffects = !!v;
  applyBloomRuntime();
  applyFogRuntime();
  applyStarRuntime();
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

export function setReferenceCirclesVisible(v) {
  if (!refCircles) return;
  refCircles.visible = !!v;
}

export function setGridVisible(v) {
  if (!gridGroup) return;
  gridGroup.visible = !!v;
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

  // Cache DOM refs for hot-path updates
  _fpsEl = document.getElementById('fps-display');
  _nodeDispEl = document.getElementById('node-display');

  // Controls — damping 0.07, zoom 0.8 matches style examples
  controls = new OrbitControls(activeCamera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.8;
  controls.minDistance = 0.5;
  controls.maxDistance = 350;
  controls.enablePan = true;
  controls.panSpeed = 1;

  controls.addEventListener('change', () => {
    emitCameraPanelChange('orbit-change', 'scene');
  });
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

  // Update Line2 materials resolution (both pools)
  for (const line of strandLines) {
    if (line.material.resolution) line.material.resolution.set(w, h);
  }
  for (const line of atlasLines) {
    if (line.material.resolution) line.material.resolution.set(w, h);
  }
  if (ghostTauLine?.material.resolution) ghostTauLine.material.resolution.set(w, h);
  if (ghostAlphaLine?.material.resolution) ghostAlphaLine.material.resolution.set(w, h);
}

// ── Mode change handlers ─────────────────────────────────────

function handleThemeChange(theme) {
  // CSS filter: invert(1) hue-rotate(180deg) handles light mode visually.
  // Scene stays dark in both modes — the filter inverts it for the user.
  // Re-apply runtime effect gates too so theme-linked policies are immediate.

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
  applyBloomRuntime();
  applyFogRuntime();
  applyToneRuntime();
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
  emitCameraPanelChange('view-change', 'scene');
}

// ── Point cloud management ───────────────────────────────────

export function updatePointCloud(data, ptSize, ptOpacity) {
  const { positions, colors, sizes, count } = data;

  if (count === 0) {
    if (pointCloud) pointCloud.visible = false;
    if (_nodeDispEl) _nodeDispEl.textContent = '0';
    return;
  }

  const tex = isPerformance() ? perfTexture : cinematicTexture;
  const baseSize = isCinematic() ? 0.06 : 0.03;

  if (!pointCloud) {
    // First-time allocation — material and mesh persist for the session
    pointCloudMat = new THREE.PointsMaterial({
      size: Math.max(0.005, ptSize * baseSize),
      map: tex,
      vertexColors: true,
      transparent: true,
      opacity: Math.max(0.01, ptOpacity),
      blending: isDark() ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const geo = new THREE.BufferGeometry();
    pointCloud = new THREE.Points(geo, pointCloudMat);
    scene.add(pointCloud);
  }

  // Swap buffer data without disposing geometry
  pointCloud.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pointCloud.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  pointCloud.geometry.computeBoundingSphere();

  // Mutate persistent material properties
  pointCloudMat.size = Math.max(0.005, ptSize * baseSize);
  pointCloudMat.map = tex;
  pointCloudMat.opacity = Math.max(0.01, ptOpacity);
  pointCloudMat.blending = isDark() ? THREE.AdditiveBlending : THREE.NormalBlending;
  pointCloudMat.needsUpdate = true;

  pointCloud.visible = true;

  const countStr = count.toLocaleString();
  if (_nodeDispEl && _nodeDispEl.textContent !== countStr) _nodeDispEl.textContent = countStr;
}

// ── Line2 strand path management ─────────────────────────────

export function updateStrandPaths(paths, lineWidth, lineOpacity, showLines) {
  if (!showLines || !paths || paths.length === 0 || lineOpacity < 0.01 || lineWidth < 0.1) {
    // Hide all pooled lines
    for (const line of strandLines) line.visible = false;
    return;
  }

  const w = window.innerWidth, h = window.innerHeight;
  let poolIdx = 0;

  for (const path of paths) {
    if (path.pointCount < 2) continue;

    let line = strandLines[poolIdx];
    if (!line) {
      // Grow pool — only happens when more curves appear than ever before
      const geo = new LineGeometry();
      const mat = new LineMaterial({
        vertexColors: true,
        transparent: true,
        worldUnits: false,
        alphaToCoverage: false,
        depthWrite: false,
      });
      line = new Line2(geo, mat);
      scene.add(line);
      strandLines.push(line);
    }

    // Rewrite geometry data in-place
    line.geometry.setPositions(path.positions);
    const flatColors = new Float32Array(path.pointCount * 3);
    for (let i = 0; i < path.pointCount; i++) {
      flatColors[i * 3]     = path.color[0];
      flatColors[i * 3 + 1] = path.color[1];
      flatColors[i * 3 + 2] = path.color[2];
    }
    line.geometry.setColors(flatColors);
    line.computeLineDistances();

    // Mutate material
    line.material.linewidth = Math.max(0.5, lineWidth);
    line.material.opacity = lineOpacity;
    line.material.resolution.set(w, h);
    line.visible = true;
    poolIdx++;
  }

  // Hide unused pool entries
  for (let i = poolIdx; i < strandLines.length; i++) {
    strandLines[i].visible = false;
  }
}

// ── Atlas curve path management (independent from strand lines) ──
//
//  finalLineWidth = globalWidth × path.widthMul
//  where widthMul = Π(group.lineW) × Π(member.sizes[i])  — the s_ system

export function updateAtlasPaths(paths, globalWidth, lineOpacity) {
  if (!paths || paths.length === 0 || lineOpacity < 0.01 || globalWidth < 0.05) {
    for (const line of atlasLines) line.visible = false;
    return;
  }

  const w = window.innerWidth, h = window.innerHeight;
  let poolIdx = 0;

  for (const path of paths) {
    if (path.pointCount < 2) continue;

    let line = atlasLines[poolIdx];
    if (!line) {
      const geo = new LineGeometry();
      const mat = new LineMaterial({
        vertexColors: true,
        transparent: true,
        worldUnits: false,
        alphaToCoverage: false,
        depthWrite: false,
      });
      line = new Line2(geo, mat);
      scene.add(line);
      atlasLines.push(line);
    }

    line.geometry.setPositions(path.positions);
    const flatColors = new Float32Array(path.pointCount * 3);
    for (let i = 0; i < path.pointCount; i++) {
      flatColors[i * 3]     = path.color[0];
      flatColors[i * 3 + 1] = path.color[1];
      flatColors[i * 3 + 2] = path.color[2];
    }
    line.geometry.setColors(flatColors);
    line.computeLineDistances();

    // Apply per-path width multiplier (s_ system: global × widthMul)
    line.material.linewidth = Math.max(0.2, globalWidth * (path.widthMul ?? 1));
    // Apply per-path opacity multiplier (lineOp system: global × opacityMul)
    line.material.opacity = Math.min(1, lineOpacity * (path.opacityMul ?? 1));
    line.material.resolution.set(w, h);
    line.visible = true;
    poolIdx++;
  }

  // Hide unused pool entries
  for (let i = poolIdx; i < atlasLines.length; i++) {
    atlasLines[i].visible = false;
  }
}

// ── Ghost traces (α-comparison proof) ────────────────────────
//  τ trace:  τ^{i·nτ^k/ln(τ)} — always closes at n=1 (cyan)
//  α trace:  α^{i·nα^k/ln(α)} — only closes at n=1 when α=τ (amber)

function ensureGhostLine(existing, linewidth, opacity, r, g, b) {
  if (existing) return existing;
  const geo = new LineGeometry();
  const mat = new LineMaterial({
    linewidth,
    vertexColors: true,
    transparent: true,
    opacity,
    worldUnits: false,
    depthWrite: false,
  });
  const line = new Line2(geo, mat);
  line.visible = false;
  scene.add(line);
  return line;
}

// Pre-allocated buffers for ghost traces (max 257 vertices × 3 floats)
const GHOST_MAX_PTS = 257;
const _ghostTauPos = new Float32Array(GHOST_MAX_PTS * 3);
const _ghostTauCol = new Float32Array(GHOST_MAX_PTS * 3);
const _ghostAlphaPos = new Float32Array(GHOST_MAX_PTS * 3);
const _ghostAlphaCol = new Float32Array(GHOST_MAX_PTS * 3);

export function updateGhostTraces(tauPts, alphaPts, showAlpha) {
  const w = window.innerWidth, h = window.innerHeight;

  // τ trace — always shown (cyan, bright)
  if (tauPts && tauPts.length >= 2) {
    ghostTauLine = ensureGhostLine(ghostTauLine, 3, 0.7, 0.2, 0.85, 1.0);
    const len = Math.min(tauPts.length, GHOST_MAX_PTS);
    for (let i = 0; i < len; i++) {
      _ghostTauPos[i * 3] = tauPts[i][0];
      _ghostTauPos[i * 3 + 1] = tauPts[i][1];
      _ghostTauPos[i * 3 + 2] = 0;
      _ghostTauCol[i * 3]     = 0.2;
      _ghostTauCol[i * 3 + 1] = 0.85;
      _ghostTauCol[i * 3 + 2] = 1.0;
    }
    ghostTauLine.geometry.setPositions(_ghostTauPos.subarray(0, len * 3));
    ghostTauLine.geometry.setColors(_ghostTauCol.subarray(0, len * 3));
    ghostTauLine.computeLineDistances();
    ghostTauLine.material.resolution.set(w, h);
    ghostTauLine.visible = true;
  } else if (ghostTauLine) {
    ghostTauLine.visible = false;
  }

  // α trace — shown only when α ≠ τ (amber, dimmer)
  if (showAlpha && alphaPts && alphaPts.length >= 2) {
    ghostAlphaLine = ensureGhostLine(ghostAlphaLine, 2.5, 0.55, 1.0, 0.65, 0.15);
    const len = Math.min(alphaPts.length, GHOST_MAX_PTS);
    for (let i = 0; i < len; i++) {
      _ghostAlphaPos[i * 3] = alphaPts[i][0];
      _ghostAlphaPos[i * 3 + 1] = alphaPts[i][1];
      _ghostAlphaPos[i * 3 + 2] = 0;
      _ghostAlphaCol[i * 3]     = 1.0;
      _ghostAlphaCol[i * 3 + 1] = 0.65;
      _ghostAlphaCol[i * 3 + 2] = 0.15;
    }
    ghostAlphaLine.geometry.setPositions(_ghostAlphaPos.subarray(0, len * 3));
    ghostAlphaLine.geometry.setColors(_ghostAlphaCol.subarray(0, len * 3));
    ghostAlphaLine.computeLineDistances();
    ghostAlphaLine.material.resolution.set(w, h);
    ghostAlphaLine.visible = true;
  } else if (ghostAlphaLine) {
    ghostAlphaLine.visible = false;
  }
}

// ── Dynamic orbit circle at r = τ^{-k} ──────────────────────

// Pre-allocate orbit circle position buffer (257 vertices × 3 floats)
const _orbitPositions = new Float32Array(257 * 3);

export function updateOrbitCircle(k) {
  const radius = Math.pow(TAU, -k);
  const hide = radius < 0.001 || radius > 100 || !isFinite(radius)
    || Math.abs(radius - 1) < 0.02
    || Math.abs(radius - 1 / TAU) < 0.02;

  if (hide) {
    if (orbitCircle) orbitCircle.visible = false;
    return;
  }

  if (!orbitCircle) {
    // One-time allocation
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(_orbitPositions, 3));
    const mat = new THREE.LineDashedMaterial({
      color: 0x336688,
      dashSize: 0.03, gapSize: 0.02,
      transparent: true, opacity: 0.4,
    });
    orbitCircle = new THREE.Line(geo, mat);
    scene.add(orbitCircle);
  }

  // Write positions into the persistent buffer
  for (let i = 0; i <= 256; i++) {
    const angle = (i / 256) * TAU;
    _orbitPositions[i * 3]     = Math.cos(angle) * radius;
    _orbitPositions[i * 3 + 1] = Math.sin(angle) * radius;
    _orbitPositions[i * 3 + 2] = 0;
  }
  orbitCircle.geometry.attributes.position.needsUpdate = true;
  orbitCircle.computeLineDistances();
  orbitCircle.visible = true;
}

// ── FPS tracking ─────────────────────────────────────────────

function updateFps() {
  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    fps = Math.round(frameCount * 1000 / (now - lastFpsTime));
    if (_fpsEl) {
      const fpsStr = String(fps);
      if (_fpsEl.textContent !== fpsStr) _fpsEl.textContent = fpsStr;
    }
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
  emitCameraPanelChange('reset', 'scene');
}

function applySnapshotToActiveCamera(snapshot) {
  const next = normalizeCameraSnapshot(snapshot);
  const cam = activeCamera;
  if (!cam || !controls) return null;

  cam.position.set(next.position.x, next.position.y, next.position.z);
  controls.target.set(next.target.x, next.target.y, next.target.z);
  controls.dampingFactor = next.orbit.dampingFactor;
  controls.rotateSpeed = next.orbit.rotateSpeed;
  controls.zoomSpeed = next.orbit.zoomSpeed;
  controls.panSpeed = next.orbit.panSpeed;
  controls.minDistance = next.orbit.minDistance;
  controls.maxDistance = next.orbit.maxDistance;

  cam.near = next.lens.near;
  cam.far = next.lens.far;

  if (next.viewMode === '3d') {
    if (Number.isFinite(next.lens.fov)) perspCam.fov = next.lens.fov;
    perspCam.near = next.lens.near;
    perspCam.far = next.lens.far;
    perspCam.updateProjectionMatrix();
    controls.enableRotate = true;
  } else {
    if (Number.isFinite(next.lens.zoom)) orthoCam.zoom = next.lens.zoom;
    orthoCam.near = next.lens.near;
    orthoCam.far = next.lens.far;
    orthoCam.updateProjectionMatrix();
    controls.enableRotate = false;
  }

  controls.update();
  return getCameraPanelSnapshot();
}

export function getCameraPanelSnapshot() {
  if (!activeCamera || !controls) return null;

  const viewMode = is2D() ? '2d' : '3d';
  const raw = {
    viewMode,
    cameraType: viewMode === '2d' ? 'orthographic' : 'perspective',
    rotateEnabled: !!controls.enableRotate,
    position: {
      x: activeCamera.position.x,
      y: activeCamera.position.y,
      z: activeCamera.position.z,
    },
    target: {
      x: controls.target.x,
      y: controls.target.y,
      z: controls.target.z,
    },
    orbit: {
      dampingFactor: controls.dampingFactor,
      rotateSpeed: controls.rotateSpeed,
      zoomSpeed: controls.zoomSpeed,
      panSpeed: controls.panSpeed,
      minDistance: controls.minDistance,
      maxDistance: controls.maxDistance,
    },
    lens: viewMode === '3d'
      ? { fov: perspCam.fov, near: perspCam.near, far: perspCam.far }
      : { zoom: orthoCam.zoom, near: orthoCam.near, far: orthoCam.far },
  };
  return normalizeCameraSnapshot(raw);
}

export function setCameraPanelField(path, value, options = {}) {
  const current = getCameraPanelSnapshot();
  if (!current || typeof path !== 'string') return current;

  const next = applyCameraFieldToSnapshot(current, path, value);
  const applied = applySnapshotToActiveCamera(next);
  emitCameraPanelChange('field-set', options.source === 'ui' ? 'ui' : 'api');
  return applied;
}

export function onCameraPanelChange(cb) {
  if (typeof cb !== 'function') return () => {};
  cameraPanelListeners.add(cb);
  return () => {
    cameraPanelListeners.delete(cb);
  };
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
export function getCurrentFps() { return fps; }

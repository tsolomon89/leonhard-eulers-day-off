// ═══════════════════════════════════════════════════════════════
//  scene.js — Three.js scene, camera, postprocessing, render
//  τ-Euler Atlas · Three.js Edition
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TAU } from './complex.js';

let scene, camera, renderer, composer, controls, bloomPass;
let pointCloud = null;
let linesMesh = null;
let gridGroup = null;
let refCircles = null;
let bgStars = null;
let time = 0;
let frameCount = 0, lastFpsTime = performance.now(), fps = 60;

// ── Particle sprite texture ──────────────────────────────────
function makeParticleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0,    'rgba(255,255,255,1.0)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(200,230,255,0.4)');
  g.addColorStop(0.65, 'rgba(180,210,255,0.1)');
  g.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// ── Background star field ────────────────────────────────────
function buildBgStars() {
  const N = 4000;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);

  for (let i = 0; i < N; i++) {
    const r = 200 + Math.random() * 400;
    const phi = Math.random() * Math.PI * 2;
    const th = Math.random() * Math.PI;
    pos[i * 3]     = r * Math.sin(th) * Math.cos(phi);
    pos[i * 3 + 1] = r * Math.sin(th) * Math.sin(phi);
    pos[i * 3 + 2] = r * Math.cos(th);
    const v = 0.06 + Math.random() * 0.14;
    col[i * 3]     = v * 0.6;
    col[i * 3 + 1] = v * 0.7;
    col[i * 3 + 2] = v;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.6,
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  bgStars = new THREE.Points(geo, mat);
  scene.add(bgStars);
}

// ── Complex plane grid + axes ────────────────────────────────
function buildGrid() {
  gridGroup = new THREE.Group();

  // Grid lines on XY plane (Re × Im)
  const gridMat = new THREE.LineBasicMaterial({
    color: 0x0e0e22,
    transparent: true,
    opacity: 0.6
  });

  const extent = 20;
  for (let v = -extent; v <= extent; v++) {
    // Vertical lines (constant Re)
    const vGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(v, -extent, 0),
      new THREE.Vector3(v, extent, 0)
    ]);
    gridGroup.add(new THREE.Line(vGeo, gridMat));

    // Horizontal lines (constant Im)
    const hGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-extent, v, 0),
      new THREE.Vector3(extent, v, 0)
    ]);
    gridGroup.add(new THREE.Line(hGeo, gridMat));
  }

  // Axes (brighter)
  const axisMat = new THREE.LineBasicMaterial({
    color: 0x1a1a3a,
    transparent: true,
    opacity: 0.9,
    linewidth: 2
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

// ── Reference circles (r=1 and r=1/τ) ───────────────────────
function buildRefCircles() {
  refCircles = new THREE.Group();

  // Unit circle
  const unitGeo = new THREE.RingGeometry(0.99, 1.01, 128);
  const unitMat = new THREE.MeshBasicMaterial({
    color: 0x222255,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  });
  const unitCircle = new THREE.Mesh(unitGeo, unitMat);
  refCircles.add(unitCircle);

  // r = 1/τ circle (dashed via line)
  const tauR = 1 / TAU;
  const tauPts = [];
  for (let i = 0; i <= 256; i++) {
    const angle = (i / 256) * TAU;
    tauPts.push(new THREE.Vector3(
      Math.cos(angle) * tauR,
      Math.sin(angle) * tauR,
      0
    ));
  }
  const tauGeo = new THREE.BufferGeometry().setFromPoints(tauPts);
  const tauMat = new THREE.LineDashedMaterial({
    color: 0x552222,
    dashSize: 0.02,
    gapSize: 0.02,
    transparent: true,
    opacity: 0.5
  });
  const tauLine = new THREE.Line(tauGeo, tauMat);
  tauLine.computeLineDistances();
  refCircles.add(tauLine);

  scene.add(refCircles);
}

// ── Scene initialization ─────────────────────────────────────
export function initScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050608, 0.003);

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.01,
    2000
  );
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  document.getElementById('container').appendChild(renderer.domElement);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.9;
  controls.minDistance = 0.5;
  controls.maxDistance = 200;
  controls.enablePan = true;
  controls.autoRotate = false;

  // Post-processing
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.45,  // strength
    0.4,   // radius
    0.85   // threshold
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  // Scene elements
  buildGrid();
  buildRefCircles();
  buildBgStars();

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  // Dblclick reset
  renderer.domElement.addEventListener('dblclick', () => {
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    controls.reset();
  });
}

// ── Point cloud management ───────────────────────────────────

const particleTexture = makeParticleTexture();

/**
 * Build or rebuild the main point cloud from generator data.
 */
export function updatePointCloud(data) {
  const { positions, colors, sizes, count } = data;

  if (pointCloud) {
    scene.remove(pointCloud);
    pointCloud.geometry.dispose();
    pointCloud.material.dispose();
  }

  if (count === 0) return;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    size: 0.04,
    map: particleTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });

  pointCloud = new THREE.Points(geo, mat);
  scene.add(pointCloud);

  // Update HUD
  const nodeDisp = document.getElementById('node-display');
  if (nodeDisp) nodeDisp.textContent = count.toLocaleString();
}

/**
 * Build line segments for strand connectivity.
 */
export function updateLines(segments, lineWidth, lineOpacity) {
  if (linesMesh) {
    scene.remove(linesMesh);
    linesMesh.geometry.dispose();
    linesMesh.material.dispose();
    linesMesh = null;
  }

  if (!segments || segments.length === 0 || lineOpacity < 0.01) return;

  const positions = new Float32Array(segments.length * 6);
  const colors = new Float32Array(segments.length * 6);

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const idx = i * 6;

    positions[idx]     = s.x1;
    positions[idx + 1] = s.y1;
    positions[idx + 2] = 0;
    positions[idx + 3] = s.x2;
    positions[idx + 4] = s.y2;
    positions[idx + 5] = 0;

    // HSL to RGB conversion for strand hue
    const h = s.hue * 6;
    const x = 1 - Math.abs(h % 2 - 1);
    let r, g, b;
    if (h < 1)      { r = 1; g = x; b = 0; }
    else if (h < 2) { r = x; g = 1; b = 0; }
    else if (h < 3) { r = 0; g = 1; b = x; }
    else if (h < 4) { r = 0; g = x; b = 1; }
    else if (h < 5) { r = x; g = 0; b = 1; }
    else            { r = 1; g = 0; b = x; }

    r = r * 0.85 + 0.15;
    g = g * 0.85 + 0.15;
    b = b * 0.85 + 0.15;

    colors[idx]     = r;
    colors[idx + 1] = g;
    colors[idx + 2] = b;
    colors[idx + 3] = r;
    colors[idx + 4] = g;
    colors[idx + 5] = b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: lineOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  linesMesh = new THREE.LineSegments(geo, mat);
  scene.add(linesMesh);
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

// ── Animation loop ───────────────────────────────────────────
export function startRenderLoop() {
  function animate() {
    requestAnimationFrame(animate);
    time += 0.005;

    updateFps();
    controls.update();

    // Gentle star rotation
    if (bgStars) {
      bgStars.rotation.y += 0.00015;
      bgStars.rotation.x += 0.00005;
    }

    composer.render();
  }

  animate();
}

// ── Bloom control ────────────────────────────────────────────
export function setBloomStrength(v) {
  if (bloomPass) bloomPass.strength = v;
}

export function setBloomRadius(v) {
  if (bloomPass) bloomPass.radius = v;
}

export function setBloomThreshold(v) {
  if (bloomPass) bloomPass.threshold = v;
}

// ── Camera presets ───────────────────────────────────────────
export function resetCamera() {
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  controls.reset();
}

export function setCameraDistance(d) {
  const dir = camera.position.clone().normalize();
  camera.position.copy(dir.multiplyScalar(d));
}

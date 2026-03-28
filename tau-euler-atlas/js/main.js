// ═══════════════════════════════════════════════════════════════
//  main.js — Entry point
//  τ-Euler Atlas · Three.js Edition
// ═══════════════════════════════════════════════════════════════

import { initScene, startRenderLoop } from './scene.js';
import { initControls } from './controls.js';

// Boot
initScene();
initControls();
startRenderLoop();

console.log('τ-Euler Atlas initialized');

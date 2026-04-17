// ═══════════════════════════════════════════════════════════════
//  main.js — Entry point (v5 unified)
//  Leonhard Euler's Day Off · τ-Euler Atlas
// ═══════════════════════════════════════════════════════════════

import { initScene, startRenderLoop } from './scene.js';
import { initControls } from './controls.js';
import { initOnboarding } from './onboarding.js';

// Boot sequence
initScene();
initControls();
startRenderLoop();
initOnboarding();

console.log('τ-Euler Atlas v5 — Leonhard Euler\'s Day Off');
console.log('  f = k₁ · τ^{i·τ^k/ln(τ)}  ≡  k₁ · e^{iτ^k}');
console.log('  α^{i·nα/ln(α)} closes at n=1  ⟺  α = τ');
console.log('  τ is the substrate. e is infrastructure.');

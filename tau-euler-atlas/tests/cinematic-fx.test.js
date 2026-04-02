import test from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultCinematicFx,
  normalizeCinematicFx,
  normalizeStateCinematicFx,
  resolveEffectiveCinematicFx,
} from '../js/cinematic-fx.js';

test('canonical cinematic normalization ingests legacy mirror values', () => {
  const normalized = normalizeCinematicFx(null, {
    ptSize: 2.2,
    ptOpacity: 0.6,
    k3: 1.4,
    showLines: false,
    primaryLineWidth: 3.2,
    primaryLineOpacity: 0.25,
    atlasLineWidth: 1.7,
    atlasLineOpacity: 0.4,
    atlasBudget: 320,
    showAlpha: false,
    bloomStrength: 0.9,
    bloomRadius: 0.55,
    bloomThreshold: 0.65,
    fogDensity: 0.002,
    toneExposure: 1.3,
  });

  assert.equal(normalized.points.size, 2.2);
  assert.equal(normalized.points.opacity, 0.6);
  assert.equal(normalized.points.k3, 1.4);
  assert.equal(normalized.primaryLines.enabled, false);
  assert.equal(normalized.primaryLines.width, 3.2);
  assert.equal(normalized.primaryLines.opacity, 0.25);
  assert.equal(normalized.atlasLines.width, 1.7);
  assert.equal(normalized.atlasLines.opacity, 0.4);
  assert.equal(normalized.atlasLines.pathBudget, 320);
  assert.equal(normalized.ghostTraces.showAlpha, false);
  assert.equal(normalized.bloom.strength, 0.9);
  assert.equal(normalized.bloom.radius, 0.55);
  assert.equal(normalized.bloom.threshold, 0.65);
  assert.equal(normalized.fog.density, 0.002);
  assert.equal(normalized.tone.exposure, 1.3);
});

test('master toggle disables all subsystems in effective runtime', () => {
  const fx = defaultCinematicFx();
  fx.master.enabled = false;
  const effective = resolveEffectiveCinematicFx(fx, { renderMode: 'cinematic' });

  assert.equal(effective.points.enabled, false);
  assert.equal(effective.primaryLines.enabled, false);
  assert.equal(effective.atlasLines.enabled, false);
  assert.equal(effective.ghostTraces.enabled, false);
  assert.equal(effective.stars.enabled, false);
  assert.equal(effective.bloom.enabled, false);
  assert.equal(effective.fog.enabled, false);
  assert.equal(effective.tone.enabled, false);
});

test('subsystem toggles gate independently with master scaling', () => {
  const fx = defaultCinematicFx();
  fx.master.intensity = 0.5;
  fx.points.enabled = false;
  fx.primaryLines.enabled = true;
  fx.primaryLines.width = 4;
  fx.primaryLines.opacity = 0.8;

  const effective = resolveEffectiveCinematicFx(fx, { renderMode: 'cinematic' });
  assert.equal(effective.points.enabled, false);
  assert.equal(effective.primaryLines.enabled, true);
  assert.equal(effective.primaryLines.width, 2);
  assert.equal(effective.primaryLines.opacity, 0.4);
});

test('performance mode hard-disables expensive effects but preserves configured values', () => {
  const fx = defaultCinematicFx();
  fx.stars.enabled = true;
  fx.bloom.enabled = true;
  fx.fog.enabled = true;
  fx.stars.opacity = 0.7;
  fx.bloom.strength = 1.25;
  fx.fog.density = 0.004;

  const perf = resolveEffectiveCinematicFx(fx, { renderMode: 'performance' });
  assert.equal(perf.stars.enabled, false);
  assert.equal(perf.bloom.enabled, false);
  assert.equal(perf.fog.enabled, false);

  const cinematic = resolveEffectiveCinematicFx(fx, { renderMode: 'cinematic' });
  assert.equal(cinematic.stars.enabled, true);
  assert.equal(cinematic.bloom.enabled, true);
  assert.equal(cinematic.fog.enabled, true);
  assert.equal(cinematic.stars.opacity, 0.7);
  assert.equal(cinematic.bloom.strength, 1.25);
  assert.equal(cinematic.fog.density, 0.004);
});

test('state mirror sync updates legacy keys from canonical cinematic state', () => {
  const state = {
    cinematicFx: {
      master: { enabled: true, intensity: 1 },
      points: { enabled: true, size: 2, opacity: 0.5, k3: 1.2 },
      primaryLines: { enabled: false, width: 3, opacity: 0.2 },
      atlasLines: { enabled: true, width: 1.4, opacity: 0.45, pathBudget: 280 },
      ghostTraces: { enabled: true, showAlpha: false },
      stars: { enabled: true, opacity: 0.2, rotX: 0.0001, rotY: 0.0002, drift: 0.05 },
      bloom: { enabled: true, strength: 0.6, radius: 0.4, threshold: 0.75 },
      fog: { enabled: true, density: 0.0015 },
      tone: { enabled: true, exposure: 1.2 },
    },
  };

  normalizeStateCinematicFx(state);

  assert.equal(state.ptSize, 2);
  assert.equal(state.ptOpacity, 0.5);
  assert.equal(state.k3, 1.2);
  assert.equal(state.showLines, false);
  assert.equal(state.primaryLineWidth, 3);
  assert.equal(state.primaryLineOpacity, 0.2);
  assert.equal(state.atlasLineWidth, 1.4);
  assert.equal(state.atlasLineOpacity, 0.45);
  assert.equal(state.atlasBudget, 280);
  assert.equal(state.showAlpha, false);
  assert.equal(state.bloomStrength, 0.6);
  assert.equal(state.bloomRadius, 0.4);
  assert.equal(state.bloomThreshold, 0.75);
  assert.equal(state.fogDensity, 0.0015);
  assert.equal(state.toneExposure, 1.2);
});


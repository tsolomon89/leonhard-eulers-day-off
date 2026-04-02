const DEFAULT_CINEMATIC_FX = Object.freeze({
  master: { enabled: true, intensity: 1 },
  points: { enabled: true, size: 1.5, opacity: 0.7, k3: 1 },
  primaryLines: { enabled: true, width: 2.0, opacity: 0.5 },
  atlasLines: { enabled: true, width: 1.0, opacity: 0.35, pathBudget: 200 },
  ghostTraces: { enabled: true, showAlpha: true },
  stars: { enabled: true, opacity: 0.25, rotX: 0.00008, rotY: 0.0002, drift: 0.04 },
  bloom: { enabled: true, strength: 0.45, radius: 0.45, threshold: 0.8 },
  fog: { enabled: true, density: 0.0008 },
  tone: { enabled: true, exposure: 1.05 },
});

const EXPENSIVE_SUBSYSTEMS = new Set(['bloom', 'stars', 'fog']);

function pickNum(primary, fallback, defaultValue) {
  if (Number.isFinite(primary)) return primary;
  if (Number.isFinite(fallback)) return fallback;
  return defaultValue;
}

function pickBool(primary, fallback, defaultValue) {
  if (typeof primary === 'boolean') return primary;
  if (typeof fallback === 'boolean') return fallback;
  return defaultValue;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function cloneDefaults() {
  return {
    master: { ...DEFAULT_CINEMATIC_FX.master },
    points: { ...DEFAULT_CINEMATIC_FX.points },
    primaryLines: { ...DEFAULT_CINEMATIC_FX.primaryLines },
    atlasLines: { ...DEFAULT_CINEMATIC_FX.atlasLines },
    ghostTraces: { ...DEFAULT_CINEMATIC_FX.ghostTraces },
    stars: { ...DEFAULT_CINEMATIC_FX.stars },
    bloom: { ...DEFAULT_CINEMATIC_FX.bloom },
    fog: { ...DEFAULT_CINEMATIC_FX.fog },
    tone: { ...DEFAULT_CINEMATIC_FX.tone },
  };
}

function safeObj(value) {
  return value && typeof value === 'object' ? value : {};
}

export function defaultCinematicFx() {
  return cloneDefaults();
}

export function normalizeCinematicFx(rawFx = null, legacy = {}) {
  const fx = safeObj(rawFx);
  const defaults = cloneDefaults();

  const master = safeObj(fx.master);
  const points = safeObj(fx.points);
  const primaryLines = safeObj(fx.primaryLines);
  const atlasLines = safeObj(fx.atlasLines);
  const ghostTraces = safeObj(fx.ghostTraces);
  const stars = safeObj(fx.stars);
  const bloom = safeObj(fx.bloom);
  const fog = safeObj(fx.fog);
  const tone = safeObj(fx.tone);

  const normalized = {
    master: {
      enabled: pickBool(master.enabled, null, defaults.master.enabled),
      intensity: clamp(pickNum(master.intensity, null, defaults.master.intensity), 0, 4),
    },
    points: {
      enabled: pickBool(points.enabled, null, defaults.points.enabled),
      size: clamp(pickNum(points.size, legacy.ptSize, defaults.points.size), 0, 12),
      opacity: clamp(pickNum(points.opacity, legacy.ptOpacity, defaults.points.opacity), 0, 1),
      k3: clamp(pickNum(points.k3, legacy.k3, defaults.points.k3), 0.01, 12),
    },
    primaryLines: {
      enabled: pickBool(primaryLines.enabled, legacy.showLines, defaults.primaryLines.enabled),
      width: clamp(pickNum(primaryLines.width, legacy.primaryLineWidth, defaults.primaryLines.width), 0, 12),
      opacity: clamp(pickNum(primaryLines.opacity, legacy.primaryLineOpacity, defaults.primaryLines.opacity), 0, 1),
    },
    atlasLines: {
      enabled: pickBool(atlasLines.enabled, null, defaults.atlasLines.enabled),
      width: clamp(pickNum(atlasLines.width, legacy.atlasLineWidth, defaults.atlasLines.width), 0, 12),
      opacity: clamp(pickNum(atlasLines.opacity, legacy.atlasLineOpacity, defaults.atlasLines.opacity), 0, 1),
      pathBudget: Math.max(1, Math.floor(pickNum(atlasLines.pathBudget, legacy.atlasBudget, defaults.atlasLines.pathBudget))),
    },
    ghostTraces: {
      enabled: pickBool(ghostTraces.enabled, null, defaults.ghostTraces.enabled),
      showAlpha: pickBool(ghostTraces.showAlpha, legacy.showAlpha, defaults.ghostTraces.showAlpha),
    },
    stars: {
      enabled: pickBool(stars.enabled, null, defaults.stars.enabled),
      opacity: clamp(pickNum(stars.opacity, legacy.starOpacity, defaults.stars.opacity), 0, 1),
      rotX: clamp(pickNum(stars.rotX, legacy.starRotX, defaults.stars.rotX), 0, 0.01),
      rotY: clamp(pickNum(stars.rotY, legacy.starRotY, defaults.stars.rotY), 0, 0.02),
      drift: clamp(pickNum(stars.drift, legacy.starDrift, defaults.stars.drift), 0, 5),
    },
    bloom: {
      enabled: pickBool(bloom.enabled, null, defaults.bloom.enabled),
      strength: clamp(pickNum(bloom.strength, legacy.bloomStrength, defaults.bloom.strength), 0, 6),
      radius: clamp(pickNum(bloom.radius, legacy.bloomRadius, defaults.bloom.radius), 0, 2),
      threshold: clamp(pickNum(bloom.threshold, legacy.bloomThreshold, defaults.bloom.threshold), 0, 1),
    },
    fog: {
      enabled: pickBool(fog.enabled, null, defaults.fog.enabled),
      density: clamp(pickNum(fog.density, legacy.fogDensity, defaults.fog.density), 0, 0.1),
    },
    tone: {
      enabled: pickBool(tone.enabled, null, defaults.tone.enabled),
      exposure: clamp(pickNum(tone.exposure, legacy.toneExposure, defaults.tone.exposure), 0.1, 6),
    },
  };

  if (!Number.isFinite(legacy.atlasLineOpacity) && !Number.isFinite(atlasLines.opacity) && typeof atlasLines.enabled !== 'boolean') {
    normalized.atlasLines.enabled = normalized.atlasLines.opacity > 0;
  }
  if (!Number.isFinite(legacy.bloomStrength) && !Number.isFinite(bloom.strength) && typeof bloom.enabled !== 'boolean') {
    normalized.bloom.enabled = normalized.bloom.strength > 0;
  }
  if (!Number.isFinite(legacy.fogDensity) && !Number.isFinite(fog.density) && typeof fog.enabled !== 'boolean') {
    normalized.fog.enabled = normalized.fog.density > 0;
  }

  return normalized;
}

function effectiveSubsystemEnabled(masterEnabled, subsystemEnabled, renderMode, subsystemName) {
  if (!masterEnabled || !subsystemEnabled) return false;
  if (renderMode === 'performance' && EXPENSIVE_SUBSYSTEMS.has(subsystemName)) return false;
  return true;
}

export function resolveEffectiveCinematicFx(rawFx, options = {}) {
  const renderMode = options.renderMode === 'performance' ? 'performance' : 'cinematic';
  const fx = normalizeCinematicFx(rawFx);

  const masterEnabled = fx.master.enabled && fx.master.intensity > 0;
  const intensity = masterEnabled ? fx.master.intensity : 0;
  const scaled = (value) => value * intensity;

  const pointsEnabled = effectiveSubsystemEnabled(masterEnabled, fx.points.enabled, renderMode, 'points');
  const primaryEnabled = effectiveSubsystemEnabled(masterEnabled, fx.primaryLines.enabled, renderMode, 'primaryLines');
  const atlasEnabled = effectiveSubsystemEnabled(masterEnabled, fx.atlasLines.enabled, renderMode, 'atlasLines');
  const ghostEnabled = effectiveSubsystemEnabled(masterEnabled, fx.ghostTraces.enabled, renderMode, 'ghostTraces');
  const starsEnabled = effectiveSubsystemEnabled(masterEnabled, fx.stars.enabled, renderMode, 'stars');
  const bloomEnabled = effectiveSubsystemEnabled(masterEnabled, fx.bloom.enabled, renderMode, 'bloom');
  const fogEnabled = effectiveSubsystemEnabled(masterEnabled, fx.fog.enabled, renderMode, 'fog');
  const toneEnabled = effectiveSubsystemEnabled(masterEnabled, fx.tone.enabled, renderMode, 'tone');

  return {
    renderMode,
    master: {
      enabled: masterEnabled,
      intensity,
    },
    points: {
      enabled: pointsEnabled,
      size: pointsEnabled ? scaled(fx.points.size) : 0,
      opacity: pointsEnabled ? clamp(scaled(fx.points.opacity), 0, 1) : 0,
      k3: fx.points.k3,
    },
    primaryLines: {
      enabled: primaryEnabled,
      width: primaryEnabled ? scaled(fx.primaryLines.width) : 0,
      opacity: primaryEnabled ? clamp(scaled(fx.primaryLines.opacity), 0, 1) : 0,
    },
    atlasLines: {
      enabled: atlasEnabled,
      width: atlasEnabled ? scaled(fx.atlasLines.width) : 0,
      opacity: atlasEnabled ? clamp(scaled(fx.atlasLines.opacity), 0, 1) : 0,
      pathBudget: Math.max(1, Math.floor(fx.atlasLines.pathBudget)),
    },
    ghostTraces: {
      enabled: ghostEnabled,
      showAlpha: ghostEnabled && fx.ghostTraces.showAlpha,
    },
    stars: {
      enabled: starsEnabled,
      opacity: starsEnabled ? clamp(scaled(fx.stars.opacity), 0, 1) : 0,
      rotX: starsEnabled ? scaled(fx.stars.rotX) : 0,
      rotY: starsEnabled ? scaled(fx.stars.rotY) : 0,
      drift: starsEnabled ? scaled(fx.stars.drift) : 0,
    },
    bloom: {
      enabled: bloomEnabled,
      strength: bloomEnabled ? scaled(fx.bloom.strength) : 0,
      radius: bloomEnabled ? clamp(scaled(fx.bloom.radius), 0, 2) : 0,
      threshold: fx.bloom.threshold,
    },
    fog: {
      enabled: fogEnabled,
      density: fogEnabled ? scaled(fx.fog.density) : 0,
    },
    tone: {
      enabled: toneEnabled,
      exposure: toneEnabled ? scaled(fx.tone.exposure) : 1,
    },
  };
}

export function syncLegacyCinematicMirrors(state) {
  if (!state || typeof state !== 'object') return state;
  const normalized = normalizeCinematicFx(state.cinematicFx, state);
  state.cinematicFx = normalized;

  state.ptSize = normalized.points.size;
  state.ptOpacity = normalized.points.opacity;
  state.k3 = normalized.points.k3;

  state.showLines = normalized.primaryLines.enabled;
  state.primaryLineWidth = normalized.primaryLines.width;
  state.primaryLineOpacity = normalized.primaryLines.opacity;

  state.atlasLineWidth = normalized.atlasLines.width;
  state.atlasLineOpacity = normalized.atlasLines.opacity;
  state.atlasBudget = normalized.atlasLines.pathBudget;

  state.showAlpha = normalized.ghostTraces.showAlpha;

  state.bloomStrength = normalized.bloom.strength;
  state.bloomRadius = normalized.bloom.radius;
  state.bloomThreshold = normalized.bloom.threshold;

  state.fogDensity = normalized.fog.density;
  state.toneExposure = normalized.tone.exposure;
  return state;
}

export function normalizeStateCinematicFx(state) {
  if (!state || typeof state !== 'object') return state;
  state.cinematicFx = normalizeCinematicFx(state.cinematicFx, state);
  return syncLegacyCinematicMirrors(state);
}


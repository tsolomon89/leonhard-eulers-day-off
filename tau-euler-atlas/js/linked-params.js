import { clamp } from './complex.js';

const EPS = 1e-12;

function safeNumber(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

export function sanitizeDirection(direction) {
  return direction === -1 ? -1 : 1;
}

export function ensureLinkedParam(registry, path, initialValue) {
  if (!registry || typeof registry !== 'object') return null;
  if (typeof path !== 'string' || path.length === 0) return null;
  const existing = registry[path];
  if (existing && typeof existing === 'object') {
    if (!Number.isFinite(existing.value)) existing.value = safeNumber(initialValue, 0);
    if (!Number.isFinite(existing.direction)) existing.direction = 1;
    existing.direction = sanitizeDirection(existing.direction);
    if (typeof existing.isLinked !== 'boolean') existing.isLinked = false;
    if (!Number.isFinite(existing.endValue)) existing.endValue = null;
    return existing;
  }

  registry[path] = {
    value: safeNumber(initialValue, 0),
    endValue: null,
    isLinked: false,
    direction: 1,
  };
  return registry[path];
}

export function resolveLinkedValue(linked, progress) {
  if (!linked || typeof linked !== 'object') return NaN;
  const base = safeNumber(linked.baseValue ?? linked.value, 0);
  const end = linked.endValue;
  if (!linked.isLinked || !Number.isFinite(end)) return base;

  const t = clamp(safeNumber(progress, 0), 0, 1);
  const dir = sanitizeDirection(linked.direction);
  const tt = dir === -1 ? (1 - t) : t;
  return base + ((end - base) * tt);
}

export function seedEndpoint(value, min, max, step) {
  const lo = safeNumber(min, 0);
  const hi = safeNumber(max, lo + 1);
  const orderedMin = Math.min(lo, hi);
  const orderedMax = Math.max(lo, hi);
  const span = orderedMax - orderedMin;
  if (span < EPS) return orderedMin;
  const fallbackStep = Number.isFinite(step) && step > 0 ? step : span / 100;
  const raw = safeNumber(value, orderedMin) + (span * 0.2);
  const snapped = Math.round(raw / fallbackStep) * fallbackStep;
  return clamp(snapped, orderedMin, orderedMax);
}

const CORE_LINKABLE_FIELDS = new Set([
  'T',
  'b',
  'l_base',
  'l_func',
  'q_scale',
  'q_tauScale',
  'k2',
  'k3',
  'themeBlend',
  'visualHelpers.gridOpacity',
  'visualHelpers.referenceOpacity',
  'visualHelpers.orbitOpacity',
]);

const INSTANT_LINK_PATHS = new Set([
  'kStepsInAlignmentsBool',
  'q_bool',
  'q_correction',
]);

export function isInstantLinkPath(path) {
  return INSTANT_LINK_PATHS.has(path);
}

const EXCLUDED_LINK_FIELDS = new Set([
  'T_lowerBound',
  'T_upperBound',
  'Z',
  'Z_min',
  'Z_max',
]);

export function isLinkEligiblePath(path) {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (EXCLUDED_LINK_FIELDS.has(path)) return false;
  if (CORE_LINKABLE_FIELDS.has(path)) return true;
  if (INSTANT_LINK_PATHS.has(path)) return true;
  if (path.startsWith('camera.')) return true;
  if (path.startsWith('expression.')) return true;
  if (path.startsWith('cinematic.')) return true;
  return false;
}

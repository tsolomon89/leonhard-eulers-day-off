import {
  resolveLinkedValue,
  sanitizeDirection,
  seedEndpoint,
} from './linked-params.js';
import { clamp } from './complex.js';

function toNumber(v, fallback = NaN) {
  return Number.isFinite(v) ? v : fallback;
}

function normalizeBounds(bounds, fallbackValue = 0) {
  const min = Number.isFinite(bounds?.min) ? bounds.min : fallbackValue;
  const max = Number.isFinite(bounds?.max) ? bounds.max : fallbackValue;
  const step = Number.isFinite(bounds?.step) && bounds.step > 0 ? bounds.step : 0.001;
  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
    step,
  };
}

function cloneRecord(record) {
  return {
    path: record.path,
    baseValue: record.baseValue,
    endValue: record.endValue,
    isLinked: record.isLinked,
    direction: record.direction,
    lastResolved: record.lastResolved,
  };
}

export function createLinkEngine(options = {}) {
  const records = new Map();
  const debug = options.debug === true;
  const debugFilter = typeof options.debugFilter === 'function'
    ? options.debugFilter
    : (path) => path.startsWith('camera.');
  const logger = typeof options.logger === 'function'
    ? options.logger
    : (...args) => console.debug(...args);

  function maybeLog(path, phase, before, after) {
    if (!debug || !debugFilter(path)) return;
    logger(`[link-engine] ${phase} ${path}`, {
      before,
      after,
    });
  }

  function getRecord(path) {
    if (typeof path !== 'string' || path.length === 0) return null;
    return records.get(path) || null;
  }

  function getBounds(record) {
    const live = toNumber(record.adapter.getLive(), 0);
    const raw = typeof record.adapter.getBounds === 'function'
      ? record.adapter.getBounds()
      : { min: live, max: live, step: 0.001 };
    return normalizeBounds(raw, live);
  }

  function normalizeBase(record) {
    const bounds = getBounds(record);
    const live = toNumber(record.adapter.getLive(), bounds.min);
    if (!Number.isFinite(record.baseValue)) record.baseValue = live;
    record.baseValue = clamp(record.baseValue, bounds.min, bounds.max);
    return record.baseValue;
  }

  function register(path, adapter, initial = {}) {
    if (typeof path !== 'string' || path.length === 0) return null;
    if (!adapter || typeof adapter.getLive !== 'function' || typeof adapter.setLive !== 'function') return null;

    const existing = records.get(path);
    if (existing) {
      existing.adapter = adapter;
      if (!Number.isFinite(existing.baseValue)) {
        existing.baseValue = toNumber(initial.baseValue, toNumber(adapter.getLive(), 0));
      }
      if (!Number.isFinite(existing.direction)) existing.direction = 1;
      existing.direction = sanitizeDirection(existing.direction);
      if (typeof existing.isLinked !== 'boolean') existing.isLinked = false;
      if (!Number.isFinite(existing.endValue)) existing.endValue = null;
      normalizeBase(existing);
      return existing;
    }

    const record = {
      path,
      adapter,
      baseValue: toNumber(initial.baseValue, toNumber(adapter.getLive(), 0)),
      endValue: Number.isFinite(initial.endValue) ? initial.endValue : null,
      isLinked: initial.isLinked === true,
      direction: sanitizeDirection(initial.direction),
      lastResolved: NaN,
    };
    normalizeBase(record);
    records.set(path, record);
    return record;
  }

  function get(path) {
    return getRecord(path);
  }

  function updateBaseFromLive(path) {
    const record = getRecord(path);
    if (!record) return null;
    if (record.isLinked) return record;
    const before = cloneRecord(record);
    const live = toNumber(record.adapter.getLive(), record.baseValue);
    record.baseValue = live;
    normalizeBase(record);
    maybeLog(path, 'baseFromLive', before, cloneRecord(record));
    return record;
  }

  function setBase(path, value) {
    const record = getRecord(path);
    if (!record) return null;
    const before = cloneRecord(record);
    const bounds = getBounds(record);
    record.baseValue = clamp(toNumber(value, record.baseValue), bounds.min, bounds.max);
    if (!record.isLinked) {
      record.adapter.setLive(record.baseValue);
      record.lastResolved = record.baseValue;
    }
    maybeLog(path, 'setBase', before, cloneRecord(record));
    return record;
  }

  function setEnd(path, value, options = {}) {
    const record = getRecord(path);
    if (!record) return null;
    const before = cloneRecord(record);
    const bounds = getBounds(record);
    record.endValue = clamp(toNumber(value, record.baseValue), bounds.min, bounds.max);
    if (options.autoLink !== false) record.isLinked = true;
    record.direction = sanitizeDirection(record.direction);
    maybeLog(path, 'setEnd', before, cloneRecord(record));
    return record;
  }

  function linkOn(path) {
    const record = getRecord(path);
    if (!record) return null;
    const before = cloneRecord(record);
    const bounds = getBounds(record);
    const live = toNumber(record.adapter.getLive(), record.baseValue);
    record.baseValue = clamp(live, bounds.min, bounds.max);
    if (!Number.isFinite(record.endValue)) {
      record.endValue = seedEndpoint(record.baseValue, bounds.min, bounds.max, bounds.step);
    }
    record.direction = sanitizeDirection(record.direction);
    record.isLinked = true;
    maybeLog(path, 'linkOn', before, cloneRecord(record));
    return record;
  }

  function linkOff(path) {
    const record = getRecord(path);
    if (!record) return null;
    const before = cloneRecord(record);
    const bounds = getBounds(record);
    record.baseValue = clamp(toNumber(record.baseValue, toNumber(record.adapter.getLive(), bounds.min)), bounds.min, bounds.max);
    record.isLinked = false;
    record.endValue = null;
    record.adapter.setLive(record.baseValue);
    record.lastResolved = record.baseValue;
    maybeLog(path, 'linkOff', before, cloneRecord(record));
    return record;
  }

  function toggleDirection(path) {
    const record = getRecord(path);
    if (!record) return null;
    const before = cloneRecord(record);
    record.direction = record.direction === 1 ? -1 : 1;
    maybeLog(path, 'toggleDirection', before, cloneRecord(record));
    return record;
  }

  function applyPath(path, progress) {
    const record = getRecord(path);
    if (!record) return NaN;
    const bounds = getBounds(record);
    if (!record.isLinked || !Number.isFinite(record.endValue)) {
      const base = clamp(toNumber(record.baseValue, bounds.min), bounds.min, bounds.max);
      record.baseValue = base;
      record.adapter.setLive(base);
      record.lastResolved = base;
      return base;
    }
    const resolved = resolveLinkedValue({
      baseValue: record.baseValue,
      endValue: record.endValue,
      isLinked: record.isLinked,
      direction: record.direction,
    }, progress);
    let next = clamp(toNumber(resolved, record.baseValue), bounds.min, bounds.max);
    if (Number.isFinite(bounds.step) && bounds.step > 0) {
      next = clamp(Math.round((next - bounds.min) / bounds.step) * bounds.step + bounds.min, bounds.min, bounds.max);
    }
    record.adapter.setLive(next);
    record.lastResolved = next;
    return next;
  }

  function resolveAndApply(progress) {
    const p = clamp(toNumber(progress, 0), 0, 1);
    for (const record of records.values()) {
      if (!record.isLinked || !Number.isFinite(record.endValue)) continue;
      applyPath(record.path, p);
    }
  }

  function prune(predicate) {
    if (typeof predicate !== 'function') return;
    for (const [path, record] of records.entries()) {
      if (!predicate(path, record)) records.delete(path);
    }
  }

  return {
    register,
    get,
    linkOn,
    linkOff,
    setBase,
    setEnd,
    toggleDirection,
    resolveAndApply,
    applyPath,
    prune,
    updateBaseFromLive,
  };
}

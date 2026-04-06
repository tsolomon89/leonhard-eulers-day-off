import { clamp } from './complex.js';

const EPS = 1e-12;

function quantize(v, min, max, step) {
  const clamped = clamp(v, min, max);
  if (!Number.isFinite(step) || step <= 0) return clamped;
  const snapped = Math.round((clamped - min) / step) * step + min;
  return clamp(snapped, min, max);
}

function differs(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a !== b;
  return Math.abs(a - b) > EPS;
}

export function normalizeInputText(text) {
  const raw = String(text ?? '').trim().replace(/\s+/g, '');
  if (!raw) return '';
  if (raw.includes(',') && raw.includes('.')) return raw.replace(/,/g, '');
  if (raw.includes(',')) return raw.replace(',', '.');
  return raw;
}

export function parseNumericInput(text, normalize = normalizeInputText) {
  const normalized = normalize(text);
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function resolveCommittedValue(rawValue, bounds, mode = 'snap') {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return { ok: false, value: NaN, status: 'invalid' };

  const min = Number.isFinite(bounds?.min) ? bounds.min : value;
  const max = Number.isFinite(bounds?.max) ? bounds.max : value;
  const step = Number.isFinite(bounds?.step) ? bounds.step : 0;

  if (mode === 'exact') {
    const clamped = clamp(value, min, max);
    return {
      ok: true,
      value: clamped,
      status: differs(clamped, value) ? 'normalized' : 'applied',
    };
  }

  const quantized = quantize(value, min, max, step);
  return {
    ok: true,
    value: quantized,
    status: differs(quantized, value) ? 'normalized' : 'applied',
  };
}

export function applyBoundedTripletCommit(state, config, key, rawValue) {
  if (!state || typeof state !== 'object') return { value: rawValue, status: 'applied' };
  const { keys = [], coerce = (v) => v, normalize } = config || {};
  if (!Array.isArray(keys) || keys.length !== 3 || !keys.includes(key) || typeof normalize !== 'function') {
    return { value: rawValue, status: 'applied' };
  }

  const draft = {};
  for (const k of keys) draft[k] = state[k];

  const raw = Number(rawValue);
  const coerced = coerce(rawValue, key, draft);
  draft[key] = coerced;

  let normalizedFlag = Number.isFinite(raw) && Number.isFinite(coerced) && differs(raw, coerced);
  const next = normalize({ ...draft }, key);

  for (const k of keys) {
    const candidate = Number.isFinite(next[k]) ? next[k] : draft[k];
    if (differs(candidate, draft[k])) normalizedFlag = true;
    state[k] = candidate;
  }

  return { value: state[key], status: normalizedFlag ? 'normalized' : 'applied' };
}

export function applyTraversalCommit(state, key, value) {
  return applyBoundedTripletCommit(
    state,
    {
      keys: ['T', 'T_lowerBound', 'T_upperBound'],
      coerce: (raw) => Number(raw),
      normalize: (next) => {
        let T_lowerBound = Number.isFinite(next.T_lowerBound) ? next.T_lowerBound : 0;
        let T_upperBound = Number.isFinite(next.T_upperBound) ? next.T_upperBound : T_lowerBound + 1;
        if (T_lowerBound > T_upperBound) {
          const tmp = T_lowerBound;
          T_lowerBound = T_upperBound;
          T_upperBound = tmp;
        }

        let T = Number.isFinite(next.T) ? next.T : T_lowerBound;
        T = clamp(T, T_lowerBound, T_upperBound);
        return { T, T_lowerBound, T_upperBound };
      },
    },
    key,
    value,
  );
}

export function applyZRangeCommit(state, key, value) {
  return applyBoundedTripletCommit(
    state,
    {
      keys: ['Z', 'Z_min', 'Z_max'],
      coerce: (raw) => Math.floor(Number(raw)),
      normalize: (next, editedKey) => {
        let rawZ = Number.isFinite(next.Z) ? Math.floor(next.Z) : 1;
        let Z = Math.max(1, rawZ);

        let Z_min = Number.isFinite(next.Z_min) ? Math.floor(next.Z_min) : 0;
        let Z_max = Number.isFinite(next.Z_max) ? Math.floor(next.Z_max) : Z;

        if (Z_max > Z) {
          Z = Z_max;
        }

        // JSON-literal linkage: Z_min in [-Z,0], Z_max in [0,Z],
        // with n=[Z_min+1...Z_max-1], so enforce Z_max - Z_min >= 2.
        Z_max = clamp(Z_max, 0, Z);
        Z_min = clamp(Z_min, -Z, 0);

        if ((Z_max - Z_min) < 2) {
          if (editedKey === 'Z_min') {
            Z_max = clamp(Z_min + 2, 0, Z);
            if ((Z_max - Z_min) < 2) Z_min = clamp(Z_max - 2, -Z, 0);
          } else {
            Z_min = clamp(Z_max - 2, -Z, 0);
            if ((Z_max - Z_min) < 2) Z_max = clamp(Z_min + 2, 0, Z);
          }
        }

        return { Z, Z_min, Z_max };
      },
    },
    key,
    value,
  );
}

export function computeTraversalTBounds(state, step = 0.00001) {
  const a = Number.isFinite(state?.T_lowerBound) ? state.T_lowerBound : 0;
  const b = Number.isFinite(state?.T_upperBound) ? state.T_upperBound : 1;
  return { min: Math.min(a, b), max: Math.max(a, b), step };
}

export function computeZRangeBounds(state) {
  const Z = Math.max(1, Math.floor(Number.isFinite(state?.Z) ? state.Z : 710));
  return {
    zMin: { min: -Z, max: 0, step: 1 },
    zMax: { min: 0, max: Z, step: 1 },
  };
}

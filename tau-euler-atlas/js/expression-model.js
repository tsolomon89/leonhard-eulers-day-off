import {
  EXPONENT_FAMILIES,
  FUNCTION_NODES,
  VARIANT_DEFINITIONS,
  canonicalizeFunctionKey,
  getFunctionNodesByExponent,
} from './function-registry.js';

export const VARIANT_KEYS = VARIANT_DEFINITIONS.map((variant) => variant.key);
export const TRANSFORM_KEYS = [...VARIANT_KEYS]; // Legacy alias retained.
export const SET_KEYS = EXPONENT_FAMILIES.map((family) => family.key);

export const POSITIVE_CHILDREN = getFunctionNodesByExponent('positive').map((node) => ({
  key: node.key,
  label: node.label,
}));

export const NEGATIVE_CHILDREN = getFunctionNodesByExponent('negative').map((node) => ({
  key: node.key,
  label: node.label,
}));

export const CHILDREN_BY_SET = {
  positive: POSITIVE_CHILDREN,
  negative: NEGATIVE_CHILDREN,
};

const DEFAULT_STYLE = Object.freeze({
  enabled: true,
  pointSize: 1,
  pointOpacity: 1,
  lineWidth: 1,
  lineOpacity: 1,
  pointBloom: 1,
  lineBloom: 1,
  colorHue: undefined,
});

const DEFAULT_PARENT_STYLE = Object.freeze({
  enabled: true,
  pointSize: 1.5,
  pointOpacity: 0.75,
  lineWidth: 1.1,
  lineOpacity: 0.42,
  pointBloom: 1,
  lineBloom: 1,
  colorHue: 0.62,
});

const DEFAULT_SET_STYLE = Object.freeze({
  positive: { ...DEFAULT_STYLE, enabled: true },
  negative: { ...DEFAULT_STYLE, enabled: true },
});

const DEFAULT_TRANSFORM_STYLE = Object.freeze({
  base: { ...DEFAULT_STYLE, enabled: true },
  sin: { ...DEFAULT_STYLE, enabled: true },
  cos: { ...DEFAULT_STYLE, enabled: false },
  tan: { ...DEFAULT_STYLE, enabled: false },
  log: { ...DEFAULT_STYLE, enabled: false },
  log_sin: { ...DEFAULT_STYLE, enabled: false },
  log_cos: { ...DEFAULT_STYLE, enabled: false },
  log_tan: { ...DEFAULT_STYLE, enabled: false },
});

function wrapHue01(v) {
  if (!Number.isFinite(v)) return undefined;
  const frac = v - Math.floor(v);
  return frac < 0 ? frac + 1 : frac;
}

function hexToRgb(hex) {
  const raw = typeof hex === 'string' ? hex.trim() : '';
  const h = raw.startsWith('#') ? raw.slice(1) : raw;
  if (h.length !== 6) return null;
  const int = Number.parseInt(h, 16);
  if (!Number.isFinite(int)) return null;
  return [
    ((int >> 16) & 0xff) / 255,
    ((int >> 8) & 0xff) / 255,
    (int & 0xff) / 255,
  ];
}

function rgbToHue(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta <= 1e-12) return 0;

  let h;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  return wrapHue01(h / 6);
}

export function hueFromHex(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return undefined;
  return rgbToHue(rgb[0], rgb[1], rgb[2]);
}

export function normalizeColorHue(value, fallback = undefined) {
  const wrapped = wrapHue01(value);
  if (wrapped === undefined) return fallback;
  return wrapped;
}

function makeChildDefaults() {
  const children = {};
  POSITIVE_CHILDREN.forEach((child) => {
    children[child.key] = {
      ...DEFAULT_STYLE,
      enabled: true,
    };
  });
  NEGATIVE_CHILDREN.forEach((child) => {
    children[child.key] = {
      ...DEFAULT_STYLE,
      enabled: true,
    };
  });
  return children;
}

function makeChildVariantDefaults() {
  const variants = {};
  for (const fnNode of FUNCTION_NODES) {
    variants[fnNode.key] = {};
    for (const variantKey of VARIANT_KEYS) {
      variants[fnNode.key][variantKey] = cloneStyle(DEFAULT_TRANSFORM_STYLE[variantKey]);
    }
  }
  return variants;
}

function cloneStyle(style) {
  let colorHue = normalizeColorHue(style.colorHue, undefined);
  if (colorHue === undefined) colorHue = hueFromHex(style.color);
  return {
    enabled: style.enabled !== false,
    pointSize: Number.isFinite(style.pointSize) ? style.pointSize : 1,
    pointOpacity: Number.isFinite(style.pointOpacity) ? style.pointOpacity : 1,
    lineWidth: Number.isFinite(style.lineWidth) ? style.lineWidth : 1,
    lineOpacity: Number.isFinite(style.lineOpacity) ? style.lineOpacity : 1,
    pointBloom: Number.isFinite(style.pointBloom) ? style.pointBloom : 1,
    lineBloom: Number.isFinite(style.lineBloom) ? style.lineBloom : 1,
    colorHue,
    color: typeof style.color === 'string' ? style.color : undefined,
  };
}

function mergeStyle(base, incoming = {}) {
  const incomingStyle = incoming && typeof incoming === 'object' ? incoming : {};
  const merged = { ...base, ...incomingStyle };
  if (!Number.isFinite(incomingStyle.colorHue) && typeof incomingStyle.color === 'string') {
    merged.colorHue = hueFromHex(incomingStyle.color);
  }
  return cloneStyle(merged);
}

function normalizeTransforms(sourceTransforms = null) {
  const transforms = {};
  for (const key of VARIANT_KEYS) {
    transforms[key] = mergeStyle(DEFAULT_TRANSFORM_STYLE[key], sourceTransforms?.[key]);
  }
  return transforms;
}

function normalizeChildVariants(defaults, incomingTree, legacyTransforms = null) {
  const variants = {};

  for (const [childKey, childDefaultTree] of Object.entries(defaults)) {
    variants[childKey] = {};
    for (const variantKey of VARIANT_KEYS) {
      const baseStyle = childDefaultTree[variantKey];
      const legacyStyle = legacyTransforms?.[variantKey] || null;
      const incomingStyle = incomingTree?.[childKey]?.[variantKey] || null;
      variants[childKey][variantKey] = mergeStyle(
        mergeStyle(baseStyle, legacyStyle),
        incomingStyle,
      );
    }
  }

  return variants;
}

function normalizeIncomingChildrenTree(rawChildren) {
  const normalized = {};
  if (!rawChildren || typeof rawChildren !== 'object') return normalized;

  for (const [rawKey, style] of Object.entries(rawChildren)) {
    const canonical = canonicalizeFunctionKey(rawKey) || rawKey;
    if (!canonical) continue;
    const previous = normalized[canonical] || {};
    normalized[canonical] = { ...previous, ...(style && typeof style === 'object' ? style : {}) };
  }

  return normalized;
}

function normalizeIncomingChildVariantsTree(rawVariants) {
  const normalized = {};
  if (!rawVariants || typeof rawVariants !== 'object') return normalized;

  for (const [rawKey, maybeVariants] of Object.entries(rawVariants)) {
    const canonical = canonicalizeFunctionKey(rawKey) || rawKey;
    if (!canonical) continue;
    if (!normalized[canonical]) normalized[canonical] = {};
    if (!maybeVariants || typeof maybeVariants !== 'object') continue;
    for (const [variantKey, style] of Object.entries(maybeVariants)) {
      if (!style || typeof style !== 'object') continue;
      const previous = normalized[canonical][variantKey] || {};
      normalized[canonical][variantKey] = { ...previous, ...style };
    }
  }

  return normalized;
}

export function defaultExpressionModel() {
  const children = makeChildDefaults();
  const transforms = normalizeTransforms();
  const childVariants = makeChildVariantDefaults();

  return {
    parent: cloneStyle(DEFAULT_PARENT_STYLE),
    sets: {
      positive: cloneStyle(DEFAULT_SET_STYLE.positive),
      negative: cloneStyle(DEFAULT_SET_STYLE.negative),
    },
    transforms,
    children,
    childVariants,
  };
}

export function normalizeExpressionModel(raw = null) {
  const defaults = defaultExpressionModel();
  const source = raw && typeof raw === 'object' ? raw : {};

  const sourceTransforms = normalizeTransforms(source.transforms);
  const incomingChildVariants = normalizeIncomingChildVariantsTree(source.childVariants || source.variants || null);
  const incomingChildren = normalizeIncomingChildrenTree(source.children);

  const model = {
    parent: mergeStyle(defaults.parent, source.parent),
    sets: {
      positive: mergeStyle(defaults.sets.positive, source.sets?.positive),
      negative: mergeStyle(defaults.sets.negative, source.sets?.negative),
    },
    transforms: sourceTransforms,
    children: {},
    childVariants: normalizeChildVariants(defaults.childVariants, incomingChildVariants, source.transforms),
  };

  for (const [childKey, childDefault] of Object.entries(defaults.children)) {
    model.children[childKey] = mergeStyle(childDefault, incomingChildren?.[childKey]);
  }

  return model;
}

export function summarizeExponentSubtree(model, exponentKey) {
  const nodes = getFunctionNodesByExponent(exponentKey);
  let functionCount = 0;
  let functionEnabledCount = 0;
  let variantCount = 0;
  let variantEnabledCount = 0;

  for (const node of nodes) {
    functionCount += 1;
    if (model.children?.[node.key]?.enabled) functionEnabledCount += 1;

    for (const variant of VARIANT_DEFINITIONS) {
      variantCount += 1;
      if (model.childVariants?.[node.key]?.[variant.key]?.enabled) variantEnabledCount += 1;
    }
  }

  const descendantCount = functionCount + variantCount;
  const descendantEnabledCount = functionEnabledCount + variantEnabledCount;

  return {
    exponentKey,
    setEnabled: !!model.sets?.[exponentKey]?.enabled,
    functionCount,
    functionEnabledCount,
    variantCount,
    variantEnabledCount,
    descendantCount,
    descendantEnabledCount,
    descendantsAllEnabled: descendantCount > 0
      ? descendantEnabledCount === descendantCount
      : true,
    descendantsNoneEnabled: descendantEnabledCount === 0,
  };
}

export function resolveExponentTriState(model, exponentKey) {
  const snapshot = summarizeExponentSubtree(model, exponentKey);
  if (snapshot.setEnabled && snapshot.functionEnabledCount === snapshot.functionCount) return 'enabled';
  if (!snapshot.setEnabled && snapshot.functionEnabledCount === 0) return 'disabled';
  return 'mixed';
}

export function setExponentSubtreeEnabled(model, exponentKey, enabled) {
  const next = !!enabled;
  const nodes = getFunctionNodesByExponent(exponentKey);

  if (model.sets?.[exponentKey]) model.sets[exponentKey].enabled = next;

  for (const node of nodes) {
    if (model.children?.[node.key]) model.children[node.key].enabled = next;
    if (model.childVariants?.[node.key]) {
      for (const variant of VARIANT_DEFINITIONS) {
        if (model.childVariants[node.key][variant.key]) {
          model.childVariants[node.key][variant.key].enabled = next;
        }
      }
    }
  }
}

export function summarizeFunctionSubtree(model, functionKey) {
  let variantCount = 0;
  let variantEnabledCount = 0;

  for (const variant of VARIANT_DEFINITIONS) {
    variantCount += 1;
    if (model.childVariants?.[functionKey]?.[variant.key]?.enabled) variantEnabledCount += 1;
  }

  return {
    functionKey,
    childEnabled: !!model.children?.[functionKey]?.enabled,
    variantCount,
    variantEnabledCount,
    variantsAllEnabled: variantCount > 0
      ? variantEnabledCount === variantCount
      : true,
    variantsNoneEnabled: variantEnabledCount === 0,
  };
}

export function resolveFunctionTriState(model, functionKey) {
  const snapshot = summarizeFunctionSubtree(model, functionKey);
  if (snapshot.childEnabled && snapshot.variantsAllEnabled) return 'enabled';
  if (!snapshot.childEnabled && snapshot.variantsNoneEnabled) return 'disabled';
  return 'mixed';
}

export function setFunctionSubtreeEnabled(model, functionKey, enabled) {
  const next = !!enabled;

  if (model.children?.[functionKey]) model.children[functionKey].enabled = next;

  if (model.childVariants?.[functionKey]) {
    for (const variant of VARIANT_DEFINITIONS) {
      if (model.childVariants[functionKey][variant.key]) {
        model.childVariants[functionKey][variant.key].enabled = next;
      }
    }
  }
}

export function setFunctionNodeEnabledWithAncestors(model, exponentKey, functionKey, enabled) {
  const next = !!enabled;
  if (next && model.sets?.[exponentKey]) model.sets[exponentKey].enabled = true;
  if (next) {
    setFunctionSubtreeEnabled(model, functionKey, true);
    return;
  }
  setFunctionSubtreeEnabled(model, functionKey, false);
}

export function setVariantNodeEnabledWithAncestors(model, exponentKey, functionKey, variantKey, enabled) {
  const next = !!enabled;
  if (next) {
    if (model.sets?.[exponentKey]) model.sets[exponentKey].enabled = true;
    if (model.children?.[functionKey]) model.children[functionKey].enabled = true;
  }
  if (model.childVariants?.[functionKey]?.[variantKey]) {
    model.childVariants[functionKey][variantKey].enabled = next;
  }
}

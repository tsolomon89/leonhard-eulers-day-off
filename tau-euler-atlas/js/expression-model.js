import {
  EXPONENT_FAMILIES,
  FUNCTION_NODES,
  VARIANT_DEFINITIONS,
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
});

const DEFAULT_PARENT_STYLE = Object.freeze({
  enabled: true,
  pointSize: 1.5,
  pointOpacity: 0.75,
  lineWidth: 1.1,
  lineOpacity: 0.42,
  pointBloom: 1,
  lineBloom: 1,
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

const POSITIVE_COLORS = [
  '#ff4f4f',
  '#ff7f50',
  '#ffb347',
  '#ffd166',
  '#9be564',
  '#35d07f',
  '#2dbca8',
  '#4ecdc4',
  '#4da3ff',
  '#9d6bff',
  '#7ca2ff',
  '#5fb8ff',
];

const NEGATIVE_COLORS = [
  '#ff5d8f',
  '#ff7ac6',
  '#f28bff',
  '#c58bff',
  '#9f96ff',
  '#8798ff',
  '#6aa4ff',
  '#73abff',
  '#51c8ff',
  '#4ee4d0',
  '#56d8b2',
  '#6be59c',
];

function makeChildDefaults() {
  const children = {};
  POSITIVE_CHILDREN.forEach((child, idx) => {
    children[child.key] = {
      ...DEFAULT_STYLE,
      enabled: true,
      color: POSITIVE_COLORS[idx] || '#ffffff',
    };
  });
  NEGATIVE_CHILDREN.forEach((child, idx) => {
    children[child.key] = {
      ...DEFAULT_STYLE,
      enabled: true,
      color: NEGATIVE_COLORS[idx] || '#ffffff',
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
  return {
    enabled: style.enabled !== false,
    pointSize: Number.isFinite(style.pointSize) ? style.pointSize : 1,
    pointOpacity: Number.isFinite(style.pointOpacity) ? style.pointOpacity : 1,
    lineWidth: Number.isFinite(style.lineWidth) ? style.lineWidth : 1,
    lineOpacity: Number.isFinite(style.lineOpacity) ? style.lineOpacity : 1,
    pointBloom: Number.isFinite(style.pointBloom) ? style.pointBloom : 1,
    lineBloom: Number.isFinite(style.lineBloom) ? style.lineBloom : 1,
    color: typeof style.color === 'string' ? style.color : undefined,
  };
}

function mergeStyle(base, incoming = {}) {
  const merged = { ...base, ...(incoming || {}) };
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
  const incomingChildVariants = source.childVariants || source.variants || null;

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
    model.children[childKey] = mergeStyle(childDefault, source.children?.[childKey]);
    if (typeof model.children[childKey].color !== 'string') {
      model.children[childKey].color = childDefault.color;
    }
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
  setFunctionSubtreeEnabled(model, functionKey, next);
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

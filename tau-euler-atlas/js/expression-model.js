export const TRANSFORM_KEYS = [
  'base',
  'sin',
  'cos',
  'tan',
  'log_sin',
  'log_cos',
  'log_tan',
];

export const SET_KEYS = ['positive', 'negative'];

export const POSITIVE_CHILDREN = [
  { key: 'positiveImaginary', label: 'f_positiveImaginary' },
  { key: 'positiveImaginaryReciprocal', label: 'f_positiveImaginaryReciprocal' },
  { key: 'positiveImaginaryVectorA', label: 'f_positiveImaginaryVectorA' },
  { key: 'positiveImaginaryVectorReciprocal', label: 'f_positiveImaginaryVectorReciprocal' },
  { key: 'positiveImaginaryVectorB', label: 'f_positiveImaginaryVectorB' },
  { key: 'positiveImaginaryCircleC', label: 'f_positiveImaginaryCircleC' },
  { key: 'positiveImaginaryCircleBReciprocal', label: 'f_positiveImaginaryCircleBReciprocal' },
  { key: 'positiveImaginaryCircleCReciprocal', label: 'f_positiveImaginaryCircleCReciprocal' },
];

export const NEGATIVE_CHILDREN = [
  { key: 'negativeImaginary', label: 'f_negativeImaginary' },
  { key: 'negativeImaginaryReciprocal', label: 'f_negativeImaginaryReciprocal' },
  { key: 'negativeImaginaryVectorA', label: 'f_negativeImaginaryVectorA' },
  { key: 'negativeImaginaryVectorReciprocal', label: 'f_negativeImaginaryVectorReciprocal' },
  { key: 'negativeImaginaryVectorB', label: 'f_negativeImaginaryVectorB' },
  { key: 'negativeImaginaryCircleC', label: 'f_negativeImaginaryCircleC' },
  { key: 'negativeImaginaryCircleBReciprocal', label: 'f_negativeImaginaryCircleBReciprocal' },
  { key: 'negativeImaginaryCircleCReciprocal', label: 'f_negativeImaginaryCircleCReciprocal' },
];

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
  '#4ecdc4',
  '#4da3ff',
  '#9d6bff',
];

const NEGATIVE_COLORS = [
  '#ff5d8f',
  '#ff7ac6',
  '#f28bff',
  '#c58bff',
  '#9f96ff',
  '#73abff',
  '#51c8ff',
  '#4ee4d0',
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

export function defaultExpressionModel() {
  const children = makeChildDefaults();
  const transforms = {};
  for (const key of TRANSFORM_KEYS) transforms[key] = cloneStyle(DEFAULT_TRANSFORM_STYLE[key]);
  return {
    parent: cloneStyle(DEFAULT_PARENT_STYLE),
    sets: {
      positive: cloneStyle(DEFAULT_SET_STYLE.positive),
      negative: cloneStyle(DEFAULT_SET_STYLE.negative),
    },
    transforms,
    children,
  };
}

export function normalizeExpressionModel(raw = null) {
  const defaults = defaultExpressionModel();
  const source = raw && typeof raw === 'object' ? raw : {};

  const model = {
    parent: mergeStyle(defaults.parent, source.parent),
    sets: {
      positive: mergeStyle(defaults.sets.positive, source.sets?.positive),
      negative: mergeStyle(defaults.sets.negative, source.sets?.negative),
    },
    transforms: {},
    children: {},
  };

  for (const key of TRANSFORM_KEYS) {
    model.transforms[key] = mergeStyle(defaults.transforms[key], source.transforms?.[key]);
  }

  for (const [childKey, childDefault] of Object.entries(defaults.children)) {
    model.children[childKey] = mergeStyle(childDefault, source.children?.[childKey]);
    if (typeof model.children[childKey].color !== 'string') {
      model.children[childKey].color = childDefault.color;
    }
  }

  return model;
}


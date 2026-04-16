export const EXPONENT_FAMILIES = Object.freeze([
  {
    key: 'positive',
    id: 'exp:positive',
    label: '+ exponent',
    legacyLabel: 'positive',
  },
  {
    key: 'negative',
    id: 'exp:negative',
    label: '- exponent',
    legacyLabel: 'negative',
  },
]);

export const VARIANT_DEFINITIONS = Object.freeze([
  { key: 'base', label: '(f)', legacyTransformKey: 'base' },
  { key: 'sin', label: 'sin(f)', legacyTransformKey: 'sin' },
  { key: 'cos', label: 'cos(f)', legacyTransformKey: 'cos' },
  { key: 'tan', label: 'tan(f)', legacyTransformKey: 'tan' },
  { key: 'log', label: 'log(f)', legacyTransformKey: 'log' },
  { key: 'log_sin', label: 'log(sin(f))', legacyTransformKey: 'log_sin' },
  { key: 'log_cos', label: 'log(cos(f))', legacyTransformKey: 'log_cos' },
  { key: 'log_tan', label: 'log(tan(f))', legacyTransformKey: 'log_tan' },
]);

const FUNCTION_BASE_FAMILIES = Object.freeze([
  { key: 'base', suffix: '', functionFamily: 'base', label: 'base' },
  { key: 'vectorA', suffix: 'VectorA', functionFamily: 'vector_a', label: 'vector A' },
  { key: 'vectorB', suffix: 'VectorB', functionFamily: 'vector_b', label: 'vector B' },
  { key: 'vectorC', suffix: 'VectorC', functionFamily: 'vector_c', label: 'vector C' },
  { key: 'circleA', suffix: 'CircleA', functionFamily: 'circle_a', label: 'Circle A' },
  { key: 'circleB', suffix: 'CircleB', functionFamily: 'circle_b', label: 'Circle B' },
  { key: 'circleC', suffix: 'CircleC', functionFamily: 'circle_c', label: 'Circle C' },
]);

function buildFunctionNodesForExponent(prefix) {
  const nodes = [];
  for (const family of FUNCTION_BASE_FAMILIES) {
    const baseKey = `${prefix}${family.suffix}`;
    nodes.push({
      key: baseKey,
      functionFamily: family.functionFamily,
      familyKey: family.key,
      reciprocal: false,
      reciprocalOf: null,
      label: family.label,
    });
    nodes.push({
      key: `${baseKey}Reciprocal`,
      functionFamily: `${family.functionFamily}_inverse`,
      familyKey: family.key,
      reciprocal: true,
      reciprocalOf: baseKey,
      label: `${family.label}^-1`,
    });
  }
  return nodes;
}

const POSITIVE_FUNCTIONS = buildFunctionNodesForExponent('positiveExponent');
const NEGATIVE_FUNCTIONS = buildFunctionNodesForExponent('negativeExponent');

export const FUNCTION_NODES = Object.freeze([
  ...POSITIVE_FUNCTIONS.map((node) => ({
    ...node,
    exponentKey: 'positive',
    exponentLabel: '+ exponent',
    id: `fn:${node.key}`,
    parentId: 'exp:positive',
    legacyLabel: `f_${node.key}`,
  })),
  ...NEGATIVE_FUNCTIONS.map((node) => ({
    ...node,
    exponentKey: 'negative',
    exponentLabel: '- exponent',
    id: `fn:${node.key}`,
    parentId: 'exp:negative',
    legacyLabel: `f_${node.key}`,
  })),
]);

const LEGACY_FUNCTION_KEY_ALIASES = Object.freeze({
  positiveImaginary: 'positiveExponent',
  positiveImaginaryReciprocal: 'positiveExponentReciprocal',
  positiveImaginaryVectorA: 'positiveExponentVectorA',
  positiveImaginaryVectorReciprocal: 'positiveExponentVectorB',
  positiveImaginaryVectorB: 'positiveExponentVectorC',
  positiveImaginaryVectorBReciprocal: 'positiveExponentVectorCReciprocal',
  positiveImaginaryCircleA: 'positiveExponentCircleA',
  positiveImaginaryCircleAReciprocal: 'positiveExponentCircleAReciprocal',
  positiveImaginaryCircleB: 'positiveExponentCircleB',
  positiveImaginaryCircleBReciprocal: 'positiveExponentCircleBReciprocal',
  positiveImaginaryCircleC: 'positiveExponentCircleC',
  positiveImaginaryCircleCReciprocal: 'positiveExponentCircleCReciprocal',
  negativeImaginary: 'negativeExponent',
  negativeImaginaryReciprocal: 'negativeExponentReciprocal',
  negativeImaginaryVectorA: 'negativeExponentVectorA',
  negativeImaginaryVectorReciprocal: 'negativeExponentVectorB',
  negativeImaginaryVectorB: 'negativeExponentVectorC',
  negativeImaginaryVectorBReciprocal: 'negativeExponentVectorCReciprocal',
  negativeImaginaryCircleA: 'negativeExponentCircleA',
  negativeImaginaryCircleAReciprocal: 'negativeExponentCircleAReciprocal',
  negativeImaginaryCircleB: 'negativeExponentCircleB',
  negativeImaginaryCircleBReciprocal: 'negativeExponentCircleBReciprocal',
  negativeImaginaryCircleC: 'negativeExponentCircleC',
  negativeImaginaryCircleCReciprocal: 'negativeExponentCircleCReciprocal',
  negtaitiveExponentCircleC: 'negativeExponentCircleC',
  negtaitiveExponentCircleCReciprocal: 'negativeExponentCircleCReciprocal',
});

export const FUNCTION_KEY_ALIASES = LEGACY_FUNCTION_KEY_ALIASES;

const FUNCTION_NODE_BY_KEY = new Map(FUNCTION_NODES.map((node) => [node.key, node]));
const VARIANT_BY_KEY = new Map(VARIANT_DEFINITIONS.map((variant) => [variant.key, variant]));

export function canonicalizeFunctionKey(functionKey) {
  if (typeof functionKey !== 'string' || functionKey.length === 0) return null;
  if (FUNCTION_NODE_BY_KEY.has(functionKey)) return functionKey;
  const aliased = FUNCTION_KEY_ALIASES[functionKey];
  if (typeof aliased === 'string' && FUNCTION_NODE_BY_KEY.has(aliased)) return aliased;
  return null;
}

export function canonicalizeExpressionPath(path) {
  if (typeof path !== 'string' || path.length === 0) return path;
  const parts = path.split('.');
  if (parts.length < 3) return path;
  if (parts[0] !== 'expression') return path;
  if (parts[1] !== 'children' && parts[1] !== 'childVariants' && parts[1] !== 'variants') return path;
  const canonical = canonicalizeFunctionKey(parts[2]);
  if (!canonical || canonical === parts[2]) return path;
  parts[2] = canonical;
  return parts.join('.');
}

function isDesmosVariantCovered(_functionKey, variantKey) {
  if (!VARIANT_BY_KEY.has(variantKey)) return false;
  return variantKey === 'base'
    || variantKey === 'sin'
    || variantKey === 'cos'
    || variantKey === 'tan';
}

function resolveCoverageStatus(implemented, inDesmos) {
  if (implemented && inDesmos) return 'covered';
  if (implemented && !inDesmos) return 'app-only';
  if (!implemented && inDesmos) return 'missing-implementation';
  return 'unimplemented';
}

export const FUNCTION_PLOTTABLES = Object.freeze(
  FUNCTION_NODES.flatMap((fnNode) => (
    VARIANT_DEFINITIONS.map((variant) => {
      const implemented = true;
      const inDesmos = isDesmosVariantCovered(fnNode.key, variant.key);
      return {
        id: `plot:${fnNode.key}:${variant.key}`,
        parentId: fnNode.id,
        exponentKey: fnNode.exponentKey,
        functionKey: fnNode.key,
        functionLabel: fnNode.label,
        functionFamily: fnNode.functionFamily,
        variantKey: variant.key,
        variantLabel: variant.label,
        implemented,
        inDesmos,
        coverageStatus: resolveCoverageStatus(implemented, inDesmos),
        legacy: {
          setKey: fnNode.exponentKey,
          childKey: fnNode.key,
          transformKey: variant.legacyTransformKey,
        },
      };
    })
  ))
);

const PLOTTABLE_BY_ID = new Map(FUNCTION_PLOTTABLES.map((node) => [node.id, node]));
const PLOTTABLE_BY_KEY = new Map(FUNCTION_PLOTTABLES.map((node) => [`${node.functionKey}:${node.variantKey}`, node]));

export function getFunctionNode(functionKey) {
  const canonical = canonicalizeFunctionKey(functionKey);
  if (!canonical) return null;
  return FUNCTION_NODE_BY_KEY.get(canonical) || null;
}

export function getVariantDefinition(variantKey) {
  return VARIANT_BY_KEY.get(variantKey) || null;
}

export function getFunctionNodesByExponent(exponentKey) {
  return FUNCTION_NODES.filter((node) => node.exponentKey === exponentKey);
}

export function getPlottable(functionKey, variantKey) {
  const canonical = canonicalizeFunctionKey(functionKey);
  if (!canonical) return null;
  return PLOTTABLE_BY_KEY.get(`${canonical}:${variantKey}`) || null;
}

export function getPlottableById(id) {
  return PLOTTABLE_BY_ID.get(id) || null;
}

export function registryCoverageSummary() {
  const summary = {
    total: FUNCTION_PLOTTABLES.length,
    covered: 0,
    appOnly: 0,
    missingImplementation: 0,
    unimplemented: 0,
  };

  for (const node of FUNCTION_PLOTTABLES) {
    if (node.coverageStatus === 'covered') summary.covered += 1;
    else if (node.coverageStatus === 'app-only') summary.appOnly += 1;
    else if (node.coverageStatus === 'missing-implementation') summary.missingImplementation += 1;
    else summary.unimplemented += 1;
  }

  return summary;
}

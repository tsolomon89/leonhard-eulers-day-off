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

const POSITIVE_FUNCTIONS = [
  { key: 'positiveImaginary', functionFamily: 'base', label: 'base' },
  { key: 'positiveImaginaryReciprocal', functionFamily: 'base_inverse', label: 'base^-1' },
  { key: 'positiveImaginaryVectorA', functionFamily: 'vector_a', label: 'vector A' },
  { key: 'positiveImaginaryVectorReciprocal', functionFamily: 'vector_a_inverse', label: 'vector A^-1' },
  { key: 'positiveImaginaryVectorB', functionFamily: 'vector_b', label: 'vector B' },
  { key: 'positiveImaginaryVectorBReciprocal', functionFamily: 'vector_b_inverse', label: 'vector B^-1' },
  { key: 'positiveImaginaryCircleA', functionFamily: 'circle_a', label: 'Circle A' },
  { key: 'positiveImaginaryCircleAReciprocal', functionFamily: 'circle_a_inverse', label: 'Circle A^-1' },
  { key: 'positiveImaginaryCircleB', functionFamily: 'circle_b', label: 'Circle B' },
  { key: 'positiveImaginaryCircleBReciprocal', functionFamily: 'circle_b_inverse', label: 'Circle B^-1' },
  { key: 'positiveImaginaryCircleC', functionFamily: 'circle_c', label: 'Circle C' },
  { key: 'positiveImaginaryCircleCReciprocal', functionFamily: 'circle_c_inverse', label: 'Circle C^-1' },
];

const NEGATIVE_FUNCTIONS = [
  { key: 'negativeImaginary', functionFamily: 'base', label: 'base' },
  { key: 'negativeImaginaryReciprocal', functionFamily: 'base_inverse', label: 'base^-1' },
  { key: 'negativeImaginaryVectorA', functionFamily: 'vector_a', label: 'vector A' },
  { key: 'negativeImaginaryVectorReciprocal', functionFamily: 'vector_a_inverse', label: 'vector A^-1' },
  { key: 'negativeImaginaryVectorB', functionFamily: 'vector_b', label: 'vector B' },
  { key: 'negativeImaginaryVectorBReciprocal', functionFamily: 'vector_b_inverse', label: 'vector B^-1' },
  { key: 'negativeImaginaryCircleA', functionFamily: 'circle_a', label: 'Circle A' },
  { key: 'negativeImaginaryCircleAReciprocal', functionFamily: 'circle_a_inverse', label: 'Circle A^-1' },
  { key: 'negativeImaginaryCircleB', functionFamily: 'circle_b', label: 'Circle B' },
  { key: 'negativeImaginaryCircleBReciprocal', functionFamily: 'circle_b_inverse', label: 'Circle B^-1' },
  { key: 'negativeImaginaryCircleC', functionFamily: 'circle_c', label: 'Circle C' },
  { key: 'negativeImaginaryCircleCReciprocal', functionFamily: 'circle_c_inverse', label: 'Circle C^-1' },
];

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

const FUNCTION_NODE_BY_KEY = new Map(FUNCTION_NODES.map((node) => [node.key, node]));
const VARIANT_BY_KEY = new Map(VARIANT_DEFINITIONS.map((variant) => [variant.key, variant]));

function isDesmosVariantCovered(functionKey, variantKey) {
  if (/VectorBReciprocal$|CircleAReciprocal$/.test(functionKey)) return false;
  if (variantKey === 'base') return true;
  if (variantKey === 'log') return false;
  if (!VARIANT_BY_KEY.has(variantKey)) return false;
  if (/CircleA$|CircleB$/.test(functionKey)) return false;
  return true;
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
  return FUNCTION_NODE_BY_KEY.get(functionKey) || null;
}

export function getVariantDefinition(variantKey) {
  return VARIANT_BY_KEY.get(variantKey) || null;
}

export function getFunctionNodesByExponent(exponentKey) {
  return FUNCTION_NODES.filter((node) => node.exponentKey === exponentKey);
}

export function getPlottable(functionKey, variantKey) {
  return PLOTTABLE_BY_KEY.get(`${functionKey}:${variantKey}`) || null;
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

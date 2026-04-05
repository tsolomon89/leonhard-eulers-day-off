import { FUNCTION_PLOTTABLES } from './function-registry.js';

export function toComboId(functionKey, variantKey) {
  return `${functionKey}::${variantKey}`;
}

function classifyVariantFromLatex(latex) {
  if (/^\\log_\{l_\{func\}\}\\left\(\\sin\\left\(/.test(latex)) return 'log_sin';
  if (/^\\log_\{l_\{func\}\}\\left\(\\cos\\left\(/.test(latex)) return 'log_cos';
  if (/^\\log_\{l_\{func\}\}\\left\(\\tan\\left\(/.test(latex)) return 'log_tan';
  if (/^\\sin\\left\(/.test(latex)) return 'sin';
  if (/^\\cos\\left\(/.test(latex)) return 'cos';
  if (/^\\tan\\left\(/.test(latex)) return 'tan';
  if (/^f_\{[^}]+\}=/.test(latex)) return 'base';
  return null;
}

function extractFunctionKeys(latex) {
  const keys = [];
  const re = /f_\{([^}]+)\}/g;
  let match = null;
  while ((match = re.exec(latex))) keys.push(match[1]);
  return keys;
}

function extractPrimaryFunctionKey(latex, variantKey) {
  const keys = extractFunctionKeys(latex);
  if (keys.length === 0) return null;

  if (variantKey === 'base') {
    const lhs = keys[0];
    if (lhs.endsWith('Proof')) return null;
    if (/^(positiveImaginary|negativeImaginary)/.test(lhs)) return lhs;
    return null;
  }

  const firstKnown = keys.find((key) => /^(positiveImaginary|negativeImaginary)/.test(key));
  return firstKnown || null;
}

export function extractDesmosCombosFromExpressions(expressions) {
  const combos = new Map();

  for (const expression of (Array.isArray(expressions) ? expressions : [])) {
    const latex = typeof expression?.latex === 'string' ? expression.latex : '';
    if (!latex) continue;

    const variantKey = classifyVariantFromLatex(latex);
    if (!variantKey) continue;

    const functionKey = extractPrimaryFunctionKey(latex, variantKey);
    if (!functionKey) continue;

    const comboId = toComboId(functionKey, variantKey);
    if (!combos.has(comboId)) {
      combos.set(comboId, {
        comboId,
        functionKey,
        variantKey,
        sourceLatex: latex,
      });
    }
  }

  return [...combos.values()];
}

function indexRegistryPlottables(registryPlottables = FUNCTION_PLOTTABLES) {
  const index = new Map();
  for (const node of registryPlottables) {
    const comboId = toComboId(node.functionKey, node.variantKey);
    index.set(comboId, {
      comboId,
      functionKey: node.functionKey,
      variantKey: node.variantKey,
      coverageStatus: node.coverageStatus,
      implemented: node.implemented,
      inDesmos: node.inDesmos,
    });
  }
  return index;
}

export function buildCoverageReportFromCombos(desmosCombos, registryPlottables = FUNCTION_PLOTTABLES) {
  const desmosIndex = new Map((Array.isArray(desmosCombos) ? desmosCombos : []).map((combo) => [combo.comboId, combo]));
  const registryIndex = indexRegistryPlottables(registryPlottables);

  const desmosOnly = [];
  const appOnly = [];
  const covered = [];
  const missingImplementation = [];

  for (const [comboId, desmosCombo] of desmosIndex.entries()) {
    const registryCombo = registryIndex.get(comboId);
    if (!registryCombo) {
      desmosOnly.push(desmosCombo);
      continue;
    }
    if (!registryCombo.implemented) {
      missingImplementation.push({ ...registryCombo, sourceLatex: desmosCombo.sourceLatex });
      continue;
    }
    covered.push({ ...registryCombo, sourceLatex: desmosCombo.sourceLatex });
  }

  for (const [comboId, registryCombo] of registryIndex.entries()) {
    if (!desmosIndex.has(comboId)) appOnly.push(registryCombo);
  }

  const byVariant = {};
  for (const combo of covered) {
    byVariant[combo.variantKey] = (byVariant[combo.variantKey] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      desmosCombos: desmosIndex.size,
      implementedCombos: registryIndex.size,
      covered: covered.length,
      desmosOnly: desmosOnly.length,
      appOnly: appOnly.length,
      missingImplementation: missingImplementation.length,
    },
    byVariant,
    covered,
    desmosOnly,
    appOnly,
    missingImplementation,
    namingMismatches: [
      {
        from: 'positive / negative imaginary labels',
        to: '+ exponent / - exponent',
        status: 'resolved-in-ui',
      },
    ],
  };
}

export function buildCoverageReportFromDesmosJson(desmosJson, registryPlottables = FUNCTION_PLOTTABLES) {
  const expressions = desmosJson?.expressions?.list || [];
  const combos = extractDesmosCombosFromExpressions(expressions);
  return buildCoverageReportFromCombos(combos, registryPlottables);
}

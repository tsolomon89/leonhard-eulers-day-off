import {
  FUNCTION_PLOTTABLES,
  canonicalizeFunctionKey,
} from './function-registry.js';

export function toComboId(functionKey, variantKey) {
  return `${functionKey}::${variantKey}`;
}

function classifyVariantFromLatex(latex) {
  if (/^\\log_\{l_\{func\}\}\\left\(\\sin\\left\(/.test(latex)) return 'log_sin';
  if (/^\\log_\{l_\{func\}\}\\left\(\\cos\\left\(/.test(latex)) return 'log_cos';
  if (/^\\log_\{l_\{func\}\}\\left\(\\tan\\left\(/.test(latex)) return 'log_tan';
  if (/^\\log_\{l_\{func\}\}\\left\(f_\{/.test(latex)) return 'log';
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
    return canonicalizeFunctionKey(lhs);
  }

  for (const key of keys) {
    const canonical = canonicalizeFunctionKey(key);
    if (canonical) return canonical;
  }
  return null;
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

export function extractDesmosWarnings(expressions) {
  const seen = new Set();
  const warnings = [];

  for (const expression of (Array.isArray(expressions) ? expressions : [])) {
    const latex = typeof expression?.latex === 'string' ? expression.latex : '';
    if (!/^f_\{[^}]+\}=/.test(latex)) continue;
    const keys = extractFunctionKeys(latex);
    if (keys.length === 0) continue;

    const lhsRaw = keys[0];
    const lhsCanonical = canonicalizeFunctionKey(lhsRaw);
    if (!lhsCanonical || lhsRaw.endsWith('Proof')) continue;

    if (/negtaitive/.test(lhsRaw)) {
      const warning = {
        kind: 'typo',
        expressionId: expression?.id ?? null,
        functionKey: lhsRaw,
        message: `Function key typo detected: ${lhsRaw}`,
      };
      const dedupe = `${warning.kind}:${warning.functionKey}`;
      if (!seen.has(dedupe)) {
        seen.add(dedupe);
        warnings.push(warning);
      }
    }

    const rhsKeys = keys.slice(1).map((key) => canonicalizeFunctionKey(key)).filter(Boolean);
    const lhsIsPositive = lhsCanonical.startsWith('positiveExponent');
    const lhsIsNegative = lhsCanonical.startsWith('negativeExponent');
    if (!lhsIsPositive && !lhsIsNegative) continue;

    const hasPositiveRef = rhsKeys.some((key) => key.startsWith('positiveExponent'));
    const hasNegativeRef = rhsKeys.some((key) => key.startsWith('negativeExponent'));
    if ((lhsIsNegative && hasPositiveRef) || (lhsIsPositive && hasNegativeRef)) {
      const warning = {
        kind: 'cross_branch_dependency',
        expressionId: expression?.id ?? null,
        functionKey: lhsRaw,
        canonicalFunctionKey: lhsCanonical,
        message: `Cross-branch dependency in ${lhsRaw}`,
      };
      const dedupe = `${warning.kind}:${warning.canonicalFunctionKey}:${expression?.id ?? ''}`;
      if (!seen.has(dedupe)) {
        seen.add(dedupe);
        warnings.push(warning);
      }
    }
  }

  return warnings;
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

export function buildCoverageReportFromCombos(desmosCombos, registryPlottables = FUNCTION_PLOTTABLES, warnings = []) {
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
      warnings: Array.isArray(warnings) ? warnings.length : 0,
    },
    byVariant,
    covered,
    desmosOnly,
    appOnly,
    missingImplementation,
    warnings: Array.isArray(warnings) ? warnings : [],
    namingMismatches: [
      {
        from: 'positive / negative imaginary labels',
        to: '+ exponent / - exponent',
        status: 'canonicalized-in-runtime',
      },
    ],
  };
}

export function buildCoverageReportFromDesmosJson(desmosJson, registryPlottables = FUNCTION_PLOTTABLES) {
  const expressions = desmosJson?.expressions?.list || [];
  const combos = extractDesmosCombosFromExpressions(expressions);
  const warnings = extractDesmosWarnings(expressions);
  return buildCoverageReportFromCombos(combos, registryPlottables, warnings);
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCoverageReportFromDesmosJson } from '../tau-euler-atlas/js/desmos-coverage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const desmosPath = path.join(repoRoot, 'agents_context/desmos-json/graphs/euler_again.json');
const outputJsonPath = path.join(repoRoot, 'docs/desmos-euler_again-coverage.json');
const outputMdPath = path.join(repoRoot, 'docs/desmos-euler_again-coverage.md');

const desmosJson = JSON.parse(fs.readFileSync(desmosPath, 'utf8'));
const report = buildCoverageReportFromDesmosJson(desmosJson);

const md = [
  '# Desmos Coverage Audit: euler_again',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  '## Summary',
  '',
  `- Desmos combos: ${report.counts.desmosCombos}`,
  `- Implemented combos: ${report.counts.implementedCombos}`,
  `- Covered combos: ${report.counts.covered}`,
  `- Desmos-only (missing in app): ${report.counts.desmosOnly}`,
  `- App-only (not in Desmos): ${report.counts.appOnly}`,
  `- Missing implementation (exists in Desmos but unimplemented): ${report.counts.missingImplementation}`,
  '',
  '## Covered By Variant',
  '',
  ...Object.entries(report.byVariant)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => `- ${key}: ${count}`),
  '',
  '## App-only Combos',
  '',
  ...(report.appOnly.length === 0
    ? ['- none']
    : report.appOnly.map((combo) => `- ${combo.functionKey} :: ${combo.variantKey}`)),
  '',
  '## Desmos-only Combos',
  '',
  ...(report.desmosOnly.length === 0
    ? ['- none']
    : report.desmosOnly.map((combo) => `- ${combo.functionKey} :: ${combo.variantKey}`)),
  '',
  '## Naming Alignment',
  '',
  ...report.namingMismatches.map((entry) => `- ${entry.from} -> ${entry.to} (${entry.status})`),
  '',
].join('\n');

fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(outputMdPath, `${md}\n`, 'utf8');

console.log(`coverage report written:`);
console.log(`- ${path.relative(repoRoot, outputJsonPath)}`);
console.log(`- ${path.relative(repoRoot, outputMdPath)}`);

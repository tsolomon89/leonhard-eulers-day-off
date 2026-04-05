import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCoverageReportFromDesmosJson } from '../js/desmos-coverage.js';
import { getPlottable } from '../js/function-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const desmosPath = path.join(repoRoot, 'agents_context/desmos-json/graphs/euler_again.json');

function loadDesmos() {
  return JSON.parse(fs.readFileSync(desmosPath, 'utf8'));
}

test('Desmos coverage report matches expected deterministic counts', () => {
  const report = buildCoverageReportFromDesmosJson(loadDesmos());

  assert.equal(report.counts.desmosCombos, 116);
  assert.equal(report.counts.implementedCombos, 192);
  assert.equal(report.counts.covered, 116);
  assert.equal(report.counts.desmosOnly, 0);
  assert.equal(report.counts.appOnly, 76);
  assert.equal(report.counts.missingImplementation, 0);
});

test('coverage report highlights app-only log(f) and extra CircleA/B trig-log variants', () => {
  const report = buildCoverageReportFromDesmosJson(loadDesmos());
  const appOnlyIds = new Set(report.appOnly.map((combo) => `${combo.functionKey}::${combo.variantKey}`));

  assert.ok(appOnlyIds.has('positiveImaginary::log'));
  assert.ok(appOnlyIds.has('negativeImaginary::log'));
  assert.ok(appOnlyIds.has('positiveImaginaryCircleA::sin'));
  assert.ok(appOnlyIds.has('negativeImaginaryCircleB::log_tan'));
  assert.ok(appOnlyIds.has('positiveImaginaryVectorBReciprocal::base'));
  assert.ok(appOnlyIds.has('negativeImaginaryCircleAReciprocal::base'));
});

test('registry plottable metadata exposes coverage tags', () => {
  const covered = getPlottable('positiveImaginary', 'sin');
  const appOnly = getPlottable('positiveImaginary', 'log');

  assert.ok(covered);
  assert.ok(appOnly);
  assert.equal(covered.coverageStatus, 'covered');
  assert.equal(covered.inDesmos, true);
  assert.equal(appOnly.coverageStatus, 'app-only');
  assert.equal(appOnly.inDesmos, false);
});

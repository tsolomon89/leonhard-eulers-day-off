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

  assert.equal(report.counts.desmosCombos, 112);
  assert.equal(report.counts.implementedCombos, 224);
  assert.equal(report.counts.covered, 112);
  assert.equal(report.counts.desmosOnly, 0);
  assert.equal(report.counts.appOnly, 112);
  assert.equal(report.counts.missingImplementation, 0);
  assert.equal(report.counts.warnings, 5);
});

test('coverage report highlights app-only log variants while base/sin/cos/tan remain covered', () => {
  const report = buildCoverageReportFromDesmosJson(loadDesmos());
  const appOnlyIds = new Set(report.appOnly.map((combo) => `${combo.functionKey}::${combo.variantKey}`));

  assert.ok(appOnlyIds.has('positiveExponent::log'));
  assert.ok(appOnlyIds.has('negativeExponent::log'));
  assert.ok(appOnlyIds.has('negativeExponentCircleB::log_tan'));
  assert.ok(appOnlyIds.has('positiveExponentVectorCReciprocal::log_cos'));
  assert.ok(appOnlyIds.has('negativeExponentCircleAReciprocal::log_sin'));
  assert.ok(!appOnlyIds.has('positiveExponentCircleA::sin'));
  assert.ok(!appOnlyIds.has('negativeExponentCircleAReciprocal::base'));
});

test('coverage report emits warnings for known JSON anomalies', () => {
  const report = buildCoverageReportFromDesmosJson(loadDesmos());
  const warningKinds = new Set(report.warnings.map((warning) => warning.kind));
  const warningKeys = new Set(report.warnings.map((warning) => warning.functionKey));

  assert.ok(warningKinds.has('typo'));
  assert.ok(warningKinds.has('cross_branch_dependency'));
  assert.ok(warningKeys.has('negtaitiveExponentCircleC'));
  assert.ok(warningKeys.has('negativeExponentVectorA'));
});

test('registry plottable metadata exposes coverage tags', () => {
  const covered = getPlottable('positiveExponent', 'sin');
  const appOnly = getPlottable('positiveExponent', 'log');
  const legacyAlias = getPlottable('positiveImaginary', 'sin');

  assert.ok(covered);
  assert.ok(appOnly);
  assert.ok(legacyAlias);
  assert.equal(legacyAlias.functionKey, 'positiveExponent');
  assert.equal(covered.coverageStatus, 'covered');
  assert.equal(covered.inDesmos, true);
  assert.equal(appOnly.coverageStatus, 'app-only');
  assert.equal(appOnly.inDesmos, false);
});

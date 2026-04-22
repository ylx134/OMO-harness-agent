import test from 'node:test';
import assert from 'node:assert/strict';

import * as plugin from '../dist/index.js';
import {
  buildRouteFileContract,
  isPlaceholderDeliverable,
} from '../dist/state/file-contract.js';

test('shared route file contract derives planning, execution, acceptance, and placeholder rules centrally', () => {
  const route = plugin.routeConfig('P-H1');
  const contract = buildRouteFileContract({
    route,
    selectedProbes: route.probes,
  });

  assert.deepEqual(contract.requiredPlanningFiles, [
    'task.md',
    'product-spec.md',
    'features.json',
    'features-summary.md',
    'baseline-source.md',
    'gap-analysis.md',
    'working-memory.md',
  ]);
  assert.deepEqual(contract.requiredExecutionFiles, [
    'product-spec.md',
    'features.json',
    'features-summary.md',
    'task.md',
    'round-contract.md',
    'execution-status.md',
    'evidence-ledger.md',
  ]);
  assert.ok(contract.requiredAcceptanceGates.includes('acceptance-report.md'));
  assert.ok(contract.requiredAcceptanceGates.includes('ui-probe-agent'));
  assert.equal(isPlaceholderDeliverable('features.json', '{}'), true);
  assert.equal(isPlaceholderDeliverable('product-spec.md', '# Product Spec'), true);
});

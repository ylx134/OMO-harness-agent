import test from 'node:test';
import assert from 'node:assert/strict';

import * as plugin from '../dist/index.js';

test('compileRouteGraph creates a stable step graph with concurrent execution fan-out and concurrent probe fan-out into closure fan-in', () => {
  const route = plugin.routeConfig('C-M1');
  const selectedCapabilityHands = ['docs-agent', 'code-agent', 'shell-agent'];
  const selectedProbes = ['regression-probe-agent', 'artifact-probe-agent'];

  const graph = plugin.compileRouteGraph({
    routeId: 'C-M1',
    route,
    selectedCapabilityHands,
    selectedProbes,
  });

  assert.deepEqual(Object.keys(graph.steps), [
    'manager:planning-manager',
    'manager:execution-manager',
    'capability-hand:docs-agent',
    'capability-hand:code-agent',
    'capability-hand:shell-agent',
    'manager:acceptance-manager',
    'probe:regression-probe-agent',
    'probe:artifact-probe-agent',
    'acceptance-closure:acceptance-manager',
  ]);

  assert.deepEqual(graph.steps['manager:planning-manager'].dependsOnStepIds, []);
  assert.deepEqual(graph.steps['manager:execution-manager'].dependsOnStepIds, ['manager:planning-manager']);
  assert.deepEqual(graph.steps['capability-hand:docs-agent'].dependsOnStepIds, ['manager:execution-manager']);
  assert.deepEqual(graph.steps['capability-hand:code-agent'].dependsOnStepIds, ['manager:execution-manager']);
  assert.deepEqual(graph.steps['capability-hand:shell-agent'].dependsOnStepIds, ['manager:execution-manager']);
  assert.deepEqual(graph.steps['manager:acceptance-manager'].dependsOnStepIds, ['capability-hand:docs-agent', 'capability-hand:code-agent', 'capability-hand:shell-agent']);
  assert.deepEqual(graph.steps['probe:regression-probe-agent'].dependsOnStepIds, ['manager:acceptance-manager']);
  assert.deepEqual(graph.steps['probe:artifact-probe-agent'].dependsOnStepIds, ['manager:acceptance-manager']);
  assert.deepEqual(
    new Set(graph.steps['acceptance-closure:acceptance-manager'].dependsOnStepIds),
    new Set(['probe:regression-probe-agent', 'probe:artifact-probe-agent']),
  );
  assert.deepEqual(graph.steps['capability-hand:docs-agent'].resourceLocks, ['docs-write']);
  assert.deepEqual(graph.steps['capability-hand:code-agent'].resourceLocks, ['workspace-write']);
  assert.deepEqual(graph.steps['capability-hand:shell-agent'].resourceLocks, ['workspace-write', 'build-runner']);
});

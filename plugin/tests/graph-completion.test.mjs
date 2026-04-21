import test from 'node:test';
import assert from 'node:assert/strict';

import * as plugin from '../dist/index.js';

test('compiled acceptance graph fans probes out from acceptance-manager and fans closure back in', () => {
  const route = plugin.routeConfig('F-M1');
  const graph = plugin.compileRouteGraph({
    routeId: 'F-M1',
    route,
    selectedCapabilityHands: route.capability,
    selectedProbes: route.probes,
  });

  assert.deepEqual(graph.steps['probe:regression-probe-agent'].dependsOnStepIds, ['manager:acceptance-manager']);
  assert.deepEqual(graph.steps['probe:artifact-probe-agent'].dependsOnStepIds, ['manager:acceptance-manager']);
  assert.deepEqual(
    new Set(graph.steps['acceptance-closure:acceptance-manager'].dependsOnStepIds),
    new Set(['probe:regression-probe-agent', 'probe:artifact-probe-agent']),
  );
});

test('acceptance closure completion only requires terminal steps that can still reach closure', () => {
  const graph = {
    routeId: 'graph-completion-test',
    taskType: 'fix',
    flowTier: 'M1',
    steps: {
      'manager:acceptance-manager': {
        id: 'manager:acceptance-manager',
        actor: 'acceptance-manager',
        kind: 'manager',
        phase: 'acceptance',
        dependsOnStepIds: [],
        dependsOnSignals: [],
        emitsSignals: [],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: [],
      },
      'probe:required-probe': {
        id: 'probe:required-probe',
        actor: 'required-probe',
        kind: 'probe',
        phase: 'acceptance',
        dependsOnStepIds: ['manager:acceptance-manager'],
        dependsOnSignals: [],
        emitsSignals: [],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: [],
      },
      'probe:orphaned-probe': {
        id: 'probe:orphaned-probe',
        actor: 'orphaned-probe',
        kind: 'probe',
        phase: 'acceptance',
        dependsOnStepIds: ['manager:acceptance-manager'],
        dependsOnSignals: [],
        emitsSignals: [],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: [],
      },
      'acceptance-closure:acceptance-manager': {
        id: 'acceptance-closure:acceptance-manager',
        actor: 'acceptance-manager',
        kind: 'acceptance-closure',
        phase: 'acceptance',
        dependsOnStepIds: ['probe:required-probe'],
        dependsOnSignals: [],
        emitsSignals: [],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: [],
      },
    },
  };

  const state = plugin.ensureGraphState({
    mode: 'harness',
    routeId: 'graph-completion-test',
    taskType: 'fix',
    flowTier: 'M1',
    graph,
    stepRuntime: {
      'manager:acceptance-manager': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:00:00.000Z',
        completedAt: '2026-04-21T00:01:00.000Z',
        lastProgressAt: '2026-04-21T00:01:00.000Z',
        completionSource: 'chat',
        lastError: null,
      },
      'probe:required-probe': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:01:00.000Z',
        completedAt: '2026-04-21T00:02:00.000Z',
        lastProgressAt: '2026-04-21T00:02:00.000Z',
        completionSource: 'chat',
        lastError: null,
      },
      'probe:orphaned-probe': {
        status: 'pending',
        attemptCount: 0,
        activeSessionID: null,
        startedAt: null,
        completedAt: null,
        lastProgressAt: null,
        completionSource: null,
        lastError: null,
      },
      'acceptance-closure:acceptance-manager': {
        status: 'in_progress',
        attemptCount: 1,
        activeSessionID: 'child_close',
        startedAt: '2026-04-21T00:03:00.000Z',
        completedAt: null,
        lastProgressAt: '2026-04-21T00:03:00.000Z',
        completionSource: null,
        lastError: null,
      },
    },
    pendingManagers: [],
    pendingCapabilityHands: [],
    pendingProbes: [],
    dispatchedManagers: ['acceptance-manager'],
    dispatchedCapabilityHands: [],
    dispatchedProbes: ['required-probe'],
    deferredDispatchState: 'acceptance_closure_in_progress',
    activeDispatch: {
      actor: 'acceptance-manager',
      phase: 'acceptance-closure',
      stepId: 'acceptance-closure:acceptance-manager',
      sessionID: 'child_close',
      startedAt: '2026-04-21T00:03:00.000Z',
    },
    currentPhase: 'acceptance',
    nextExpectedActor: 'acceptance-manager',
    completedDeliverables: ['round-contract.md', 'execution-status.md', 'evidence-ledger.md', 'acceptance-report.md'],
    childDispatchSessionIDs: {
      planning: [],
      execution: [],
      acceptance: ['child_accept'],
      capabilityHands: {},
      probes: { 'required-probe': ['child_probe_required'] },
      acceptanceClosure: ['child_close'],
    },
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:03:00.000Z',
    rawUserInput: 'graph completion test',
  });

  const closure = plugin.completeGraphStep(state, {
    stepId: 'acceptance-closure:acceptance-manager',
    source: 'tool',
    completedAt: '2026-04-21T00:04:00.000Z',
    deliverablesSatisfied: true,
  });

  assert.equal(closure.changed, true);
  assert.equal(closure.reason, 'completed');
  assert.equal(closure.state.stepRuntime['acceptance-closure:acceptance-manager'].status, 'succeeded');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  routeConfig,
  selectCapabilityHands,
  selectProbes,
} from '../dist/index.js';

const routingTable = JSON.parse(
  readFileSync(new URL('../../control/config/routing-table.json', import.meta.url), 'utf8'),
);

function expectedRoute(routeId) {
  const route = routingTable.routes[routeId];
  return {
    taskType: route.task_type,
    flowTier: route.flow_tier,
    managers: route.manager_requirements,
    capability: route.capability_requirements,
    probes: route.probe_requirements,
    description: route.description,
    startupFiles: route.startup_files,
    deliverables: route.deliverables,
    antiShallowBar: route.anti_shallow_bar,
    executionMode: {
      multiAgent: route.execution_mode.multi_agent,
      singleThreadAllowed: route.execution_mode.single_thread_allowed,
      requiresContractNegotiation: route.execution_mode.requires_contract_negotiation,
    },
    category: routingTable.category_mapping[route.task_type],
  };
}

test('J-L1 route is derived from the routing registry instead of the old hardcoded manager stack', () => {
  const route = routeConfig('J-L1');
  assert.deepEqual(route, expectedRoute('J-L1'));
});

test('A-M1 route includes capability-planner before planning-manager', () => {
  const route = routeConfig('A-M1');
  assert.deepEqual(route, expectedRoute('A-M1'));
});

test('P-H1 route includes feature-planner and UI/browser-oriented dispatch', () => {
  const route = routeConfig('P-H1');
  assert.deepEqual(route, expectedRoute('P-H1'));

  const hands = selectCapabilityHands({
    routeId: 'P-H1',
    rawUserInput: '为现有系统做一个完整产品级前端功能并验证主要用户旅程',
    requiredCapabilityHands: route.capability,
  });
  assert.ok(hands.includes('browser-agent'));
  assert.ok(hands.includes('code-agent'));
  assert.ok(hands.includes('shell-agent'));

  const probes = selectProbes({
    routeId: 'P-H1',
    rawUserInput: '验证主要用户旅程和发布质量',
    requiredProbes: route.probes,
  });
  assert.equal(probes[0], 'ui-probe-agent');
  assert.ok(probes.includes('regression-probe-agent'));
});

test('F-M1 selects shell and code hands plus regression/artifact probes', () => {
  const route = routeConfig('F-M1');
  assert.deepEqual(route, expectedRoute('F-M1'));

  const hands = selectCapabilityHands({
    routeId: 'F-M1',
    rawUserInput: '修复构建报错并补上回归验证',
    requiredCapabilityHands: route.capability,
  });
  assert.deepEqual(hands, ['shell-agent', 'code-agent', 'evidence-agent']);

  const probes = selectProbes({
    routeId: 'F-M1',
    rawUserInput: '修复构建报错并补上回归验证',
    requiredProbes: route.probes,
  });
  assert.deepEqual(probes, ['regression-probe-agent', 'artifact-probe-agent']);
});

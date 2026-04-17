import test from 'node:test';
import assert from 'node:assert/strict';

import {
  routeConfig,
  selectCapabilityHands,
  selectProbes,
} from '../dist/index.js';

test('A-M1 route includes capability-planner before planning-manager', () => {
  const route = routeConfig('A-M1');
  assert.deepEqual(route.managers, [
    'capability-planner',
    'planning-manager',
    'execution-manager',
    'acceptance-manager',
  ]);
});

test('P-H1 route includes feature-planner and UI/browser-oriented dispatch', () => {
  const route = routeConfig('P-H1');
  assert.deepEqual(route.managers, [
    'feature-planner',
    'planning-manager',
    'execution-manager',
    'acceptance-manager',
  ]);

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

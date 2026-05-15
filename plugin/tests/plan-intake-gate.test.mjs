import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPlanIntakeGate } from '../dist/index.js';

test('clean task with no risk flags returns high confidence and no questions', () => {
  const result = buildPlanIntakeGate(
    'Fix the broken test in the auth module',
    'F-M1',
  );

  assert.deepEqual(result.blockingQuestions, []);
  assert.deepEqual(result.nonBlockingQuestions, []);
  assert.equal(result.planConfidence, 1.0);
  assert.equal(result.checkerReviewRequired, false);
  assert.equal(result.riskFlags.ambiguous_goal, false);
  assert.equal(result.riskFlags.destructive_change, false);
  assert.equal(result.riskFlags.external_credential, false);
  assert.equal(result.riskFlags.cost_or_real_money, false);
  assert.equal(result.riskFlags.safety_boundary, false);
  assert.equal(result.riskFlags.new_route_or_goal_change, false);
  assert.ok(result.assumptions.length > 0);
});

test('ambiguous_goal detected via "maybe"', () => {
  const result = buildPlanIntakeGate(
    'maybe fix the auth module, or possibly refactor it',
    'F-M1',
  );

  assert.equal(result.riskFlags.ambiguous_goal, true);
  assert.ok(result.blockingQuestions.length > 0);
  assert.ok(result.blockingQuestions.some((q) => q.includes('ambiguous')));
  assert.ok(result.planConfidence < 1.0);
  assert.equal(result.checkerReviewRequired, true);
});

test('ambiguous_goal detected via Chinese "大概"', () => {
  const result = buildPlanIntakeGate(
    '大概修复一下那个认证模块的问题',
    'F-M1',
  );

  assert.equal(result.riskFlags.ambiguous_goal, true);
  assert.ok(result.blockingQuestions.length > 0);
});

test('ambiguous_goal detected via "不确定"', () => {
  const result = buildPlanIntakeGate(
    '不确定是否需要修改数据库schema',
    'C-M1',
  );

  assert.equal(result.riskFlags.ambiguous_goal, true);
  assert.ok(result.blockingQuestions.length > 0);
});

test('destructive_change detected via "delete"', () => {
  const result = buildPlanIntakeGate(
    'delete all user records from the database',
    'F-M1',
  );

  assert.equal(result.riskFlags.destructive_change, true);
  assert.ok(result.blockingQuestions.length > 0);
  assert.ok(result.blockingQuestions.some((q) => q.includes('destructive')));
  assert.equal(result.checkerReviewRequired, true);
});

test('destructive_change detected via "drop"', () => {
  const result = buildPlanIntakeGate(
    'drop the legacy users table and remove all related indexes',
    'C-M1',
  );

  assert.equal(result.riskFlags.destructive_change, true);
});

test('destructive_change detected via Chinese "删除"', () => {
  const result = buildPlanIntakeGate(
    '删除旧的配置文件并清除所有缓存',
    'F-M1',
  );

  assert.equal(result.riskFlags.destructive_change, true);
});

test('destructive_change detected via "destroy"', () => {
  const result = buildPlanIntakeGate(
    'destroy the staging environment and purge all data',
    'C-M1',
  );

  assert.equal(result.riskFlags.destructive_change, true);
});

test('external_credential detected via "api key"', () => {
  const result = buildPlanIntakeGate(
    'configure the api key for the payment gateway',
    'C-M1',
  );

  assert.equal(result.riskFlags.external_credential, true);
  assert.ok(result.blockingQuestions.some((q) => q.includes('credential')));
});

test('external_credential detected via "token"', () => {
  const result = buildPlanIntakeGate(
    'rotate the auth token in the deployment config',
    'F-M1',
  );

  assert.equal(result.riskFlags.external_credential, true);
});

test('external_credential detected via "password"', () => {
  const result = buildPlanIntakeGate(
    'reset the admin password for the staging server',
    'F-M1',
  );

  assert.equal(result.riskFlags.external_credential, true);
});

test('external_credential detected via Chinese "密钥"', () => {
  const result = buildPlanIntakeGate(
    '需要更新API的密钥配置',
    'C-M1',
  );

  assert.equal(result.riskFlags.external_credential, true);
});

test('cost_or_real_money detected via "deploy"', () => {
  const result = buildPlanIntakeGate(
    'deploy the new version to production',
    'F-M1',
  );

  assert.equal(result.riskFlags.cost_or_real_money, true);
  assert.ok(result.nonBlockingQuestions.length > 0);
  assert.ok(result.nonBlockingQuestions.some((q) => q.includes('deploying')));
});

test('cost_or_real_money detected via "publish"', () => {
  const result = buildPlanIntakeGate(
    'publish the package to the npm registry',
    'C-M1',
  );

  assert.equal(result.riskFlags.cost_or_real_money, true);
});

test('cost_or_real_money detected via Chinese "部署"', () => {
  const result = buildPlanIntakeGate(
    '部署到生产环境',
    'F-M1',
  );

  assert.equal(result.riskFlags.cost_or_real_money, true);
});

test('cost_or_real_money detected via Chinese "发布"', () => {
  const result = buildPlanIntakeGate(
    '发布新版本到线上',
    'C-M1',
  );

  assert.equal(result.riskFlags.cost_or_real_money, true);
});

test('safety_boundary detected via "data loss"', () => {
  const result = buildPlanIntakeGate(
    'migrate the schema which could cause data loss if not careful',
    'C-M1',
  );

  assert.equal(result.riskFlags.safety_boundary, true);
  assert.ok(result.blockingQuestions.some((q) => q.includes('safety')));
  assert.equal(result.checkerReviewRequired, true);
});

test('safety_boundary detected via "corrupt"', () => {
  const result = buildPlanIntakeGate(
    'fix the script that could corrupt the database',
    'F-M1',
  );

  assert.equal(result.riskFlags.safety_boundary, true);
});

test('safety_boundary detected via Chinese "数据丢失"', () => {
  const result = buildPlanIntakeGate(
    '这个操作可能导致数据丢失，请小心处理',
    'C-M1',
  );

  assert.equal(result.riskFlags.safety_boundary, true);
});

test('safety_boundary detected via Chinese "不可恢复"', () => {
  const result = buildPlanIntakeGate(
    '删除操作不可恢复，需要确认',
    'F-M1',
  );

  assert.equal(result.riskFlags.safety_boundary, true);
});

test('new_route_or_goal_change detected via "also"', () => {
  const result = buildPlanIntakeGate(
    'fix the auth module and also update the dashboard layout',
    'F-M1',
  );

  assert.equal(result.riskFlags.new_route_or_goal_change, true);
  assert.ok(result.nonBlockingQuestions.length > 0);
  assert.ok(result.nonBlockingQuestions.some((q) => q.includes('separate')));
});

test('new_route_or_goal_change detected via "additionally"', () => {
  const result = buildPlanIntakeGate(
    'refactor the API layer, additionally add rate limiting',
    'C-M1',
  );

  assert.equal(result.riskFlags.new_route_or_goal_change, true);
});

test('new_route_or_goal_change detected via Chinese "另外"', () => {
  const result = buildPlanIntakeGate(
    '修复登录问题，另外也优化一下首页加载速度',
    'F-M1',
  );

  assert.equal(result.riskFlags.new_route_or_goal_change, true);
});

test('multiple risks compound confidence penalty', () => {
  const result = buildPlanIntakeGate(
    'maybe delete the api key config and also deploy to production which could cause data loss',
    'F-M1',
  );

  assert.equal(result.riskFlags.ambiguous_goal, true);
  assert.equal(result.riskFlags.destructive_change, true);
  assert.equal(result.riskFlags.external_credential, true);
  assert.equal(result.riskFlags.cost_or_real_money, true);
  assert.equal(result.riskFlags.safety_boundary, true);
  assert.equal(result.riskFlags.new_route_or_goal_change, true);

  assert.ok(result.planConfidence < 0.3);
  assert.equal(result.checkerReviewRequired, true);
  assert.ok(result.blockingQuestions.length >= 3);
  assert.ok(result.nonBlockingQuestions.length >= 2);
});

test('checkerReviewRequired is true when any blocking risk is present', () => {
  const result = buildPlanIntakeGate(
    'maybe update the config',
    'F-M1',
  );

  assert.equal(result.riskFlags.ambiguous_goal, true);
  assert.equal(result.checkerReviewRequired, true);
});

test('checkerReviewRequired is false for clean tasks', () => {
  const result = buildPlanIntakeGate(
    'add unit tests for the auth module',
    'F-M1',
  );

  assert.equal(result.checkerReviewRequired, false);
});

test('checkerReviewRequired is true when confidence falls below 0.6', () => {
  // Multiple risk flags: destructive_change(0.30) + safety_boundary(0.35) = 0.35 confidence
  const result = buildPlanIntakeGate(
    'destroy the database which could cause irreversible data loss',
    'F-M1',
  );

  assert.ok(result.planConfidence < 0.6);
  assert.equal(result.checkerReviewRequired, true);
});

test('confidence ranges between 0 and 1 inclusive', () => {
  const safe = buildPlanIntakeGate('simple task', 'F-M1');
  assert.ok(safe.planConfidence >= 0 && safe.planConfidence <= 1);

  const risky = buildPlanIntakeGate(
    'maybe destroy the db with api key and token causing data loss and also deploy',
    'F-M1',
  );
  assert.ok(risky.planConfidence >= 0 && risky.planConfidence <= 1);
  assert.ok(risky.planConfidence < safe.planConfidence);
});

test('scoped route descriptions without risk keywords pass cleanly', () => {
  const tasks = [
    'Add input validation to the signup form',
    'Update error messages for better UX clarity',
    'Refactor the caching layer to use a shared interface',
    'Write integration tests for the payment flow',
    'Optimize database queries in the report module',
  ];

  for (const task of tasks) {
    const result = buildPlanIntakeGate(task, 'C-M1');
    assert.deepEqual(result.blockingQuestions, [], `Task "${task}" should have no blocking questions`);
    assert.equal(result.planConfidence, 1.0, `Task "${task}" should have 1.0 confidence`);
    assert.equal(result.checkerReviewRequired, false);
  }
});

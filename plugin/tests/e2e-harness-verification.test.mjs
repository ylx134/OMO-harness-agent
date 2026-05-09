/**
 * 完整端到端验证 — 模拟 OpenCode 真实环境中的插件生命周期
 * 覆盖：启动 → /control → hook 链 → manager dispatch → 状态推进 → 完成
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { server } from '../dist/index.js';

// ── 工具函数 ──────────────────────────────────────────────
async function setupHarness(commandText = '修复构建报错并补上回归验证') {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-e2e-'));
  let childCount = 0;
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        create: async () => ({ data: { id: `child_${++childCount}` } }),
        promptAsync: async () => {},
      },
    },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4116/'),
  });
  return { workspace, hooks, nextChildId: () => ++childCount };
}

function loadState(workspace) {
  return readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8')
    .then(JSON.parse);
}

function loadDebug(workspace) {
  return readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
}

// ── Test Suite ────────────────────────────────────────────

test('E2E: 插件启动 + 基础 hook 注册', async () => {
  const { workspace, hooks } = await setupHarness();
  assert.ok(hooks['command.execute.before'], 'command.execute.before hook 已注册');
  assert.ok(hooks['chat.message'], 'chat.message hook 已注册');
  assert.ok(hooks['tool.execute.before'], 'tool.execute.before hook 已注册');
  assert.ok(hooks['tool.execute.after'], 'tool.execute.after hook 已注册');
  assert.ok(hooks['experimental.chat.system.transform'], 'system.transform hook 已注册');
  assert.ok(hooks['experimental.chat.messages.transform'], 'messages.transform hook 已注册');
  assert.ok(hooks['permission.ask'], 'permission.ask hook 已注册');
  assert.ok(hooks['tool.definition'], 'tool.definition hook 已注册');
  assert.ok(hooks['chat.params'], 'chat.params hook 已注册');
  assert.ok(hooks['experimental.session.compacting'], 'compacting hook 已注册');
  assert.ok(hooks['experimental.compaction.autocontinue'], 'autocontinue hook 已注册');
  await rm(workspace, { recursive: true, force: true });
});

test('E2E: /control intake → 状态文件全部写入', async () => {
  const { workspace, hooks } = await setupHarness();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_main' },
    { parts: [] },
  );

  const state = await loadState(workspace);
  assert.equal(state.routeId, 'F-M1');
  assert.equal(state.taskType, '修复型');
  assert.equal(state.semanticLockStatus, 'locked');
  assert.equal(state.autopilotEnabled, true);
  assert.equal(state.currentPhase, 'planning');
  assert.ok(state.requiredManagers.includes('planning-manager'));

  // 验证所有关键文件存在
  const files = ['task.md', 'route-packet.json', 'orchestration-status.md', 'brain-brief.md', 'route-summary.md'];
  for (const f of files) {
    const content = await readFile(path.join(workspace, '.agent-memory', f), 'utf8');
    assert.ok(content.length > 50, `${f} 不应为空`);
  }

  await rm(workspace, { recursive: true, force: true });
});

test('E2E: system.transform 注入调度指令', async () => {
  const { workspace, hooks } = await setupHarness();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_sys' },
    { parts: [] },
  );

  const sysOutput = { system: [] };
  await hooks['experimental.chat.system.transform'](
    { sessionID: 'ses_sys', model: { providerID: 'openai', modelID: 'gpt-5.4' } },
    sysOutput,
  );

  assert.ok(sysOutput.system.length > 0, '系统指令应被注入');
  const fullSystem = sysOutput.system.join(' ');
  assert.ok(fullSystem.includes('HARNESS MODE IS ACTIVE'), '应包含 HARNESS 模式标识');
  assert.ok(fullSystem.includes('THE DISPATCHER ONLY'), '应包含 DISPATCHER 角色说明');
  assert.ok(fullSystem.includes('DISPATCH NOW'), '应包含 DISPATCH NOW 指令');

  await rm(workspace, { recursive: true, force: true });
});

test('E2E: messages.transform 注入冗余调度指令', async () => {
  const { workspace, hooks } = await setupHarness();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_msg' },
    { parts: [] },
  );

  const msgOutput = {
    messages: [
      { info: { role: 'user' }, parts: [{ type: 'text', text: '原始用户消息' }] },
    ],
  };
  await hooks['experimental.chat.messages.transform']({}, msgOutput);

  // 应该往最后一条消息前面注入了 DISPATCH 指令
  const lastParts = msgOutput.messages[0].parts;
  assert.ok(lastParts.length >= 2, '应注入了额外 part');
  assert.ok(lastParts[0].text.includes('DISPATCH NOW'), '注入的指令应包含 DISPATCH NOW');

  await rm(workspace, { recursive: true, force: true });
});

test('E2E: permission.ask — blocked 状态拒绝操作', async () => {
  const { workspace, hooks } = await setupHarness('看一下这个');

  // J-L1 模糊请求进入 blocked
  await hooks['command.execute.before'](
    { command: 'control', arguments: '看一下这个', sessionID: 'ses_perm' },
    { parts: [] },
  );

  const state = await loadState(workspace);
  assert.equal(state.blocked, true, '模糊请求应被 blocked');

  const permOutput = { status: 'ask' };
  await hooks['permission.ask']({}, permOutput);

  assert.equal(permOutput.status, 'deny', 'blocked 状态下应拒绝权限');

  await rm(workspace, { recursive: true, force: true });
});

test('E2E: tool.definition — acceptance 阶段限制工具', async () => {
  const { workspace, hooks } = await setupHarness();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_tool' },
    { parts: [] },
  );

  // 模拟 acceptance 阶段
  const statePath = path.join(workspace, '.agent-memory', 'harness-plugin-state.json');
  const state = await loadState(workspace);
  state.currentPhase = 'acceptance';
  state.activeAgent = 'acceptance-manager';
  await (await import('node:fs/promises')).writeFile(statePath, JSON.stringify(state));

  const toolOutput = { description: 'Edit file contents', parameters: {} };
  await hooks['tool.definition']({ toolID: 'edit' }, toolOutput);

  assert.ok(toolOutput.description.includes('ACCEPTANCE'), 'acceptance 阶段应限制工具描述');

  await rm(workspace, { recursive: true, force: true });
});

test('E2E: chat.params — 按阶段调整模型参数', async () => {
  const { workspace, hooks } = await setupHarness();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_param' },
    { parts: [] },
  );

  // planning 阶段
  {
    const output = { temperature: 0.7, topP: 0.9, topK: 40, maxOutputTokens: undefined, options: {} };
    const s = await loadState(workspace);
    s.currentPhase = 'planning';
    await (await import('node:fs/promises')).writeFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), JSON.stringify(s));

    await hooks['chat.params']({ sessionID: 'ses_param', agent: 'planning-manager' }, output);
    assert.ok(output.temperature < 0.5, 'planning 阶段温度应低于 0.5');
  }

  await rm(workspace, { recursive: true, force: true });
});

test('E2E: compaction 保护 — 压缩时保留路由状态', async () => {
  const { workspace, hooks } = await setupHarness();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_compact' },
    { parts: [] },
  );

  const compactOutput = { context: [] };
  await hooks['experimental.session.compacting'](
    { sessionID: 'ses_compact' },
    compactOutput,
  );

  assert.ok(compactOutput.context.length > 0, '压缩时应注入路由上下文');
  assert.ok(compactOutput.context.some(c => c.includes('F-M1')), '应包含 Route ID');
  assert.ok(compactOutput.context.some(c => c.includes('planning-manager')), '应包含 pending managers');

  await rm(workspace, { recursive: true, force: true });
});

test('E2E: compaction.autocontinue — acceptance 阶段禁用自动继续', async () => {
  const { workspace, hooks } = await setupHarness();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_auto' },
    { parts: [] },
  );

  // 模拟 acceptance 阶段
  const s = await loadState(workspace);
  s.currentPhase = 'acceptance';
  await (await import('node:fs/promises')).writeFile(
    path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), JSON.stringify(s));

  const autoOutput = { enabled: true };
  await hooks['experimental.compaction.autocontinue'](
    { sessionID: 'ses_auto' },
    autoOutput,
  );

  assert.equal(autoOutput.enabled, false, 'acceptance 阶段应禁用自动继续');

  await rm(workspace, { recursive: true, force: true });
});

test('E2E: 自动模式 orchestrator 输出不被阻断', async () => {
  const { workspace, hooks } = await setupHarness();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_chat' },
    { parts: [] },
  );

  const chatOutput = {
    parts: [{ type: 'text', text: '正在调度 planning-manager...' }],
  };

  await hooks['chat.message'](
    { agent: 'harness-orchestrator', sessionID: 'ses_chat' },
    chatOutput,
  );

  // 自动模式 + 有 pending managers → 不应阻断
  assert.equal(chatOutput.parts[0].text, '正在调度 planning-manager...');

  await rm(workspace, { recursive: true, force: true });
});

test('E2E: 手动模式 orchestrator 输出被阻断', async () => {
  const { workspace, hooks } = await setupHarness('修复构建报错并补上回归验证 --manual');

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证 --manual', sessionID: 'ses_manual' },
    { parts: [] },
  );

  const state = await loadState(workspace);
  assert.equal(state.autopilotEnabled, false, '手动模式 autopilot 应为 false');

  const chatOutput = {
    parts: [{ type: 'text', text: '我正在分析代码...' }],
  };

  await hooks['chat.message'](
    { agent: 'harness-orchestrator', sessionID: 'ses_manual' },
    chatOutput,
  );

  // 手动模式 → 应被阻断
  assert.ok(chatOutput.parts[0].text.includes('Use /plan'), '手动模式应提示使用 /plan');

  await rm(workspace, { recursive: true, force: true });
});

test('E2E: /plan 推进 planning-manager', async () => {
  const { workspace, hooks } = await setupHarness('修复构建报错并补上回归验证 --manual');

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证 --manual', sessionID: 'ses_plan' },
    { parts: [] },
  );

  // /plan 命令
  await hooks['command.execute.before'](
    { command: 'plan', arguments: '', sessionID: 'ses_plan' },
    { parts: [] },
  );

  const state = await loadState(workspace);
  assert.equal(state.currentPhase, 'planning', '/plan 应推进到 planning 阶段');
  assert.ok(state.dispatchedManagers.includes('planning-manager'), 'planning-manager 应被调度');

  await rm(workspace, { recursive: true, force: true });
});

test('E2E: 完整 F-M1 生命周期 — /control → /plan → manager 完成 → 状态推进', async () => {
  const { workspace, hooks } = await setupHarness('修复构建报错并补上回归验证');

  // 1. /control intake
  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_full' },
    { parts: [] },
  );

  let state = await loadState(workspace);
  assert.equal(state.currentPhase, 'planning', 'Step 1: intake 后应进入 planning');
  assert.ok(state.dispatchedManagers.includes('planning-manager'), 'planning-manager 应被自动调度');

  // 2. 模拟 planning-manager 完成（通过 chat.message + HARNESS_COMPLETE）
  await hooks['chat.message'](
    { agent: 'planning-manager', sessionID: state.childDispatchSessionIDs?.planning?.[0] },
    {
      parts: [{ type: 'text', text: 'planning-manager completed. HARNESS_COMPLETE {"status":"done","summary":"contract written"}' }],
    },
  );

  state = await loadState(workspace);
  assert.ok(!state.pendingManagers.includes('planning-manager'), 'planning-manager 应从 pending 移除');
  assert.equal(state.nextExpectedActor, 'execution-manager', '下一个应为 execution-manager');

  // 3. 模拟 /drive 推进 execution-manager
  state.sessionID = 'ses_full';
  await (await import('node:fs/promises')).writeFile(
    path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), JSON.stringify(state));

  await hooks['command.execute.before'](
    { command: 'drive', arguments: '', sessionID: 'ses_full' },
    { parts: [] },
  );

  state = await loadState(workspace);
  assert.ok(state.dispatchedManagers.includes('execution-manager'), 'execution-manager 应被调度');

  // 4. 模拟 execution-manager 完成
  await hooks['chat.message'](
    { agent: 'execution-manager', sessionID: state.childDispatchSessionIDs?.execution?.[0] },
    {
      parts: [{ type: 'text', text: 'execution-manager completed. HARNESS_COMPLETE {"status":"done","summary":"implementation done"}' }],
    },
  );

  state = await loadState(workspace);
  assert.ok(!state.pendingManagers.includes('execution-manager'), 'execution-manager 应从 pending 移除');

  await rm(workspace, { recursive: true, force: true });
});

test('E2E: 调试日志完整性', async () => {
  const { workspace, hooks } = await setupHarness();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_log' },
    { parts: [] },
  );

  const debug = await loadDebug(workspace);

  // 验证关键日志条目
  assert.ok(debug.includes('plugin.server.init'), '应有启动日志');
  assert.ok(debug.includes('hook.command.before'), '应有 command hook 日志');
  assert.ok(debug.includes('state.initialized.from_command'), '应有状态初始化日志');
  assert.ok(debug.includes('dispatch.deferred.after_intake'), '应有 intake 日志');
  assert.ok(debug.includes('deferred.manager.dispatch.requested'), '应有 manager 调度日志');

  // 验证 activity.jsonl
  const activity = await readFile(path.join(workspace, '.agent-memory', 'activity.jsonl'), 'utf8');
  assert.ok(activity.includes('task.intake'), 'activity 应记录 intake');
  assert.ok(activity.includes('route.selected'), 'activity 应记录 route selection');

  await rm(workspace, { recursive: true, force: true });
});

test('E2E: P-H1 产品型路由', async () => {
  const { workspace, hooks } = await setupHarness('从零搭建一个用户管理系统');

  await hooks['command.execute.before'](
    { command: 'control', arguments: '从零搭建一个用户管理系统', sessionID: 'ses_ph1' },
    { parts: [] },
  );

  const state = await loadState(workspace);
  assert.equal(state.routeId, 'P-H1');
  assert.equal(state.taskType, '产品型');
  assert.equal(state.flowTier, '重流程');
  assert.ok(state.requiredManagers.includes('feature-planner'), 'P-H1 需要 feature-planner');
  assert.ok(state.selectedCapabilityHands.includes('browser-agent'), 'P-H1 需要 browser-agent');
  assert.ok(state.selectedProbes.includes('ui-probe-agent'), 'P-H1 需要 ui-probe-agent');

  await rm(workspace, { recursive: true, force: true });
});

test('E2E: A-M1 能力型路由', async () => {
  const { workspace, hooks } = await setupHarness('让系统具备自动处理并发请求的能力');

  await hooks['command.execute.before'](
    { command: 'control', arguments: '让系统具备自动处理并发请求的能力', sessionID: 'ses_am1' },
    { parts: [] },
  );

  const state = await loadState(workspace);
  assert.equal(state.routeId, 'A-M1');
  assert.ok(state.requiredManagers.includes('capability-planner'), 'A-M1 需要 capability-planner');
  assert.ok(state.selectedProbes.includes('api-probe-agent'), 'A-M1 需要 api-probe-agent');

  await rm(workspace, { recursive: true, force: true });
});

import { promises as fs } from "fs";
import path from "path";

export const id = "omo-harness-plugin";

const HARNESS_AGENTS = new Set([
  "harness-orchestrator",
  "feature-planner",
  "capability-planner",
  "planning-manager",
  "execution-manager",
  "acceptance-manager",
]);

const MANAGER_AGENTS = new Set([
  "feature-planner",
  "capability-planner",
  "planning-manager",
  "execution-manager",
  "acceptance-manager",
]);

const CAPABILITY_AGENTS = new Set([
  "browser-agent",
  "code-agent",
  "shell-agent",
  "docs-agent",
  "evidence-agent",
]);

const PROBE_AGENTS = new Set([
  "ui-probe-agent",
  "api-probe-agent",
  "regression-probe-agent",
  "artifact-probe-agent",
]);

const MANAGER_SKILLS = {
  "feature-planner": ["feature-planner", "plan"],
  "capability-planner": ["capability-planner", "plan"],
  "planning-manager": ["plan"],
  "execution-manager": ["drive", "memory"],
  "acceptance-manager": ["check"],
};

function nowIso() {
  return new Date().toISOString();
}

function requestId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `REQ-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function lower(s) {
  return String(s || "").toLowerCase();
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readText(p, fallback = "") {
  try { return await fs.readFile(p, 'utf8'); } catch { return fallback; }
}

async function writeText(p, text) {
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, text, 'utf8');
}

async function appendText(p, text) {
  await ensureDir(path.dirname(p));
  await fs.appendFile(p, text, 'utf8');
}

function classifyTask(message) {
  const msg = lower(message);
  if (["fix", "bug", "修复", "报错", "回归"].some(k => msg.includes(k))) return "F-M1";
  if (["product", "从零", "搭建", "build a", "create a", "产品"].some(k => msg.includes(k))) return "P-H1";
  if (["capability", "能力", "truly able", "deeper", "less visible"].some(k => msg.includes(k))) return "A-M1";
  if (["refactor", "重构", "改造", "rework"].some(k => msg.includes(k))) return "C-M1";
  return "J-L1";
}

export function routeConfig(routeId) {
  const configs = {
    "J-L1": {
      taskType: "判断型",
      flowTier: "轻流程",
      managers: ["planning-manager","execution-manager","acceptance-manager"],
      capability: ["docs-agent","evidence-agent"],
      probes: ["artifact-probe-agent"],
      description: 'decision, comparison, review, explanation, or audit where the main output is a grounded judgment',
      startupFiles: ['task.md', 'working-memory.md', 'round-contract.md', 'orchestration-status.md'],
      deliverables: ['task.md', 'round-contract.md', 'execution-status.md', 'evidence-ledger.md', 'acceptance-report.md'],
      summaryOutputs: ['task.md', 'execution-status.md', 'acceptance-report.md'],
      antiShallowBar: 'do not present a plausible guess as a judged conclusion; even read-only analysis must pass through planning, execution evidence gathering, and independent acceptance',
      executionMode: { multiAgent: true, singleThreadAllowed: false, requiresContractNegotiation: true },
      category: 'quick',
    },
    "F-M1": {
      taskType: "修复型",
      flowTier: "中流程",
      managers: ["planning-manager","execution-manager","acceptance-manager"],
      capability: ["shell-agent","code-agent","evidence-agent"],
      probes: ["regression-probe-agent","artifact-probe-agent"],
      description: 'an existing failure, regression, or broken path must stop failing and nearby breakage must be checked',
      startupFiles: ['task.md', 'working-memory.md', 'round-contract.md', 'orchestration-status.md'],
      deliverables: ['round-contract.md', 'execution-status.md', 'evidence-ledger.md', 'acceptance-report.md'],
      summaryOutputs: ['execution-status.md', 'acceptance-report.md'],
      antiShallowBar: 'the main failure must be removed and at least one adjacent regression check must be evidenced',
      executionMode: { multiAgent: true, singleThreadAllowed: false, requiresContractNegotiation: true },
      category: 'deep',
    },
    "C-M1": {
      taskType: "改造型",
      flowTier: "中流程",
      managers: ["planning-manager","execution-manager","acceptance-manager"],
      capability: ["docs-agent","code-agent","shell-agent","evidence-agent"],
      probes: ["regression-probe-agent","artifact-probe-agent"],
      description: 'a bounded capability inside an existing system must change without losing architectural or behavioral coherence',
      startupFiles: ['task.md', 'capability-map.md', 'gap-analysis.md', 'working-memory.md', 'round-contract.md', 'orchestration-status.md'],
      deliverables: ['task.md', 'round-contract.md', 'execution-status.md', 'evidence-ledger.md', 'acceptance-report.md'],
      summaryOutputs: ['task.md', 'execution-status.md', 'acceptance-report.md'],
      antiShallowBar: 'visible output alone does not count; the named capability gap must materially shrink and preserve surrounding behavior',
      executionMode: { multiAgent: true, singleThreadAllowed: false, requiresContractNegotiation: true },
      category: 'deep',
    },
    "A-M1": {
      taskType: "能力型",
      flowTier: "中流程",
      managers: ["capability-planner","planning-manager","execution-manager","acceptance-manager"],
      capability: ["docs-agent","shell-agent","code-agent","evidence-agent"],
      probes: ["api-probe-agent","regression-probe-agent","artifact-probe-agent"],
      description: 'the system must gain a deeper capability whose proof is often less visible than the interface',
      startupFiles: ['task.md', 'baseline-source.md', 'capability-map.md', 'gap-analysis.md', 'quality-guardrails.md', 'working-memory.md', 'round-contract.md', 'orchestration-status.md'],
      deliverables: ['baseline-source.md', 'capability-map.md', 'gap-analysis.md', 'task.md', 'round-contract.md', 'execution-status.md', 'evidence-ledger.md', 'acceptance-report.md'],
      summaryOutputs: ['gap-analysis.md', 'task.md', 'execution-status.md', 'acceptance-report.md'],
      antiShallowBar: 'a shell that looks complete is insufficient; the hidden or rule-heavy ability must be explicitly proved',
      executionMode: { multiAgent: true, singleThreadAllowed: false, requiresContractNegotiation: true },
      category: 'ultrabrain',
    },
    "P-H1": {
      taskType: "产品型",
      flowTier: "重流程",
      managers: ["feature-planner","planning-manager","execution-manager","acceptance-manager"],
      capability: ["docs-agent","browser-agent","code-agent","shell-agent","evidence-agent"],
      probes: ["ui-probe-agent","regression-probe-agent","artifact-probe-agent"],
      description: 'a product or subsystem surface must be defined and delivered across multiple managed rounds',
      startupFiles: ['task.md', 'product-spec.md', 'features.json', 'features-summary.md', 'baseline-source.md', 'gap-analysis.md', 'working-memory.md', 'round-contract.md', 'orchestration-status.md'],
      deliverables: ['product-spec.md', 'features.json', 'features-summary.md', 'task.md', 'round-contract.md', 'execution-status.md', 'evidence-ledger.md', 'acceptance-report.md'],
      summaryOutputs: ['features-summary.md', 'task.md', 'execution-status.md', 'acceptance-report.md'],
      antiShallowBar: 'do not accept thin slices that technically exist but miss the promised product depth, real journeys, or release-critical polish',
      executionMode: { multiAgent: true, singleThreadAllowed: false, requiresContractNegotiation: true },
      category: 'visual-engineering',
    },
  };
  return configs[routeId] || configs["J-L1"];
}

function planningFilesForRoute(route) {
  return unique(route.startupFiles.filter((name) => ['task.md', 'baseline-source.md', 'capability-map.md', 'gap-analysis.md', 'quality-guardrails.md', 'product-spec.md', 'features.json', 'features-summary.md', 'working-memory.md'].includes(name)));
}

function executionFilesForRoute(route) {
  return unique(route.deliverables.filter((name) => ['round-contract.md', 'execution-status.md', 'evidence-ledger.md', 'task.md', 'features.json', 'features-summary.md', 'product-spec.md', 'baseline-source.md', 'capability-map.md', 'gap-analysis.md'].includes(name)));
}

function acceptanceGatesForRoute(route, state) {
  return unique([
    ...(state?.selectedProbes || route.probes),
    'acceptance-report.md',
    route.antiShallowBar,
  ]);
}

async function detectCompletedDeliverables(workspace, route) {
  const placeholderContent = {
    'task.md': '# Task\n\n',
    'working-memory.md': '# Working Memory\n\n',
    'round-contract.md': '# Round Contract\n\n',
    'orchestration-status.md': '# Orchestration Status\n\n',
    'execution-status.md': '# Execution Status\n\n',
    'acceptance-report.md': '# Acceptance Report\n\n',
    'evidence-ledger.md': '# Evidence Ledger\n\n',
  };
  const completed = [];
  for (const deliverable of route.deliverables) {
    const deliverablePath = path.join(workspace, '.agent-memory', deliverable);
    if (!(await exists(deliverablePath))) continue;
    const content = await readText(deliverablePath, '');
    if ((placeholderContent[deliverable] || null) === content) continue;
    completed.push(deliverable);
  }
  return completed;
}

function buildRoutePacket(routeId, route, state) {
  const missingDeliverables = route.deliverables.filter((name) => !(state?.completedDeliverables || []).includes(name));
  return {
    routeId,
    taskType: route.taskType,
    flowTier: route.flowTier,
    reasonForLane: route.description,
    routingContractRow: `${routeId} | ${route.taskType} | ${route.flowTier} | managers=${route.managers.join(' -> ')}`,
    resolvedSkillStack: unique([...route.managers, ...(state?.selectedCapabilityHands || []), ...(state?.selectedProbes || [])]),
    defaultMainRoute: routeId,
    requiredStartupFiles: route.startupFiles,
    requiredPlanningFiles: planningFilesForRoute(route),
    requiredExecutionFiles: executionFilesForRoute(route),
    requiredAcceptanceGates: acceptanceGatesForRoute(route, state),
    requiredDeliverables: route.deliverables,
    missingDeliverables,
    routeBlockingGaps: state?.blocked ? [state.blockedReason || 'blocked'] : [],
    pendingManagers: state?.pendingManagers || route.managers,
    pendingCapabilityHands: state?.pendingCapabilityHands || state?.selectedCapabilityHands || route.capability,
    pendingProbes: state?.pendingProbes || state?.selectedProbes || route.probes,
    deferredDispatchState: state?.deferredDispatchState || 'ready',
    lastCompletedActor: state?.lastCompletedActor || 'none',
    category: route.category,
    antiShallowBar: route.antiShallowBar,
  };
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function includesAny(message, keywords) {
  return keywords.some((keyword) => message.includes(keyword));
}

export function selectCapabilityHands(state) {
  const routeId = state?.routeId || "J-L1";
  const required = unique(state?.requiredCapabilityHands || routeConfig(routeId).capability);
  const msg = lower(state?.rawUserInput || "");

  if (routeId === "P-H1" || routeId === "A-M1") return required;

  if (routeId === "F-M1") {
    const selected = ["shell-agent", "code-agent", "evidence-agent"].filter((name) => required.includes(name));
    return selected.length ? selected : required;
  }

  if (routeId === "C-M1") {
    const selected = ["docs-agent", "code-agent"];
    if (includesAny(msg, ["build", "test", "运行", "启动", "compile", "编译", "migration", "migrate", "命令", "脚本", "api"])) {
      selected.push("shell-agent");
    }
    selected.push("evidence-agent");
    return unique(selected.filter((name) => required.includes(name)));
  }

  const selected = ["docs-agent"];
  if (required.includes("evidence-agent") && includesAny(msg, ["evidence", "proof", "日志", "screenshot", "artifact", "依据", "证据", "输出"])) {
    selected.push("evidence-agent");
  }
  for (const requiredHand of required) {
    if (!selected.includes(requiredHand)) selected.push(requiredHand);
  }
  return unique(selected);
}

export function selectProbes(state) {
  const routeId = state?.routeId || "J-L1";
  const required = unique(state?.requiredProbes || routeConfig(routeId).probes);
  const msg = lower(state?.rawUserInput || "");

  if (routeId === "P-H1") {
    return unique(["ui-probe-agent", "regression-probe-agent", "artifact-probe-agent"].filter((name) => required.includes(name)));
  }
  if (routeId === "A-M1") {
    return unique(["api-probe-agent", "regression-probe-agent", "artifact-probe-agent"].filter((name) => required.includes(name)));
  }
  if (routeId === "F-M1") {
    return unique(["regression-probe-agent", "artifact-probe-agent"].filter((name) => required.includes(name)));
  }
  if (routeId === "C-M1") {
    const selected = ["regression-probe-agent", "artifact-probe-agent"];
    if (includesAny(msg, ["api", "endpoint", "接口", "contract"]) && required.includes("api-probe-agent")) {
      selected.unshift("api-probe-agent");
    }
    return unique(selected.filter((name) => required.includes(name)));
  }
  return required;
}

function determineActiveAgent(input) {
  return input?.agent || input?.body?.agent || "";
}

function isHarnessAgent(agent) {
  return HARNESS_AGENTS.has(agent);
}

function normalizeCommandName(command) {
  return String(command || '').replace(/^\//, '').trim();
}

function isHarnessCommand(command) {
  return ['control', 'plan', 'drive', 'check'].includes(normalizeCommandName(command));
}

function routeIdForCommand(command, message = '') {
  const normalized = normalizeCommandName(command);
  if (normalized === 'plan') return 'C-M1';
  if (normalized === 'drive') return 'C-M1';
  if (normalized === 'check') return 'J-L1';
  return classifyTask(message);
}

function isSyntheticHarnessExpansionMessage(message) {
  const msg = String(message || '');
  return msg.includes('[analyze-mode]')
    || msg.includes('<auto-slash-command>')
    || msg.includes('# /control Command')
    || msg.includes('MANDATORY delegate_task params')
    || msg.includes('<system-reminder>')
    || msg.includes('<!-- OMO_INTERNAL_INITIATOR -->')
    || msg.includes('[BACKGROUND TASK COMPLETED]')
    || msg.includes('[ALL BACKGROUND TASKS COMPLETE]');
}

function buildSystemAdditions(agent, state = null) {
  if (agent === "harness-orchestrator") {
    const intakeOnlyLines = state?.currentPhase === 'intake'
      ? [
          'The Harness plugin has already completed intake and written the route packet.',
          'Do not call tools, subagents, skills, or background agents from this top-level orchestrator turn.',
          'Do not continue generic analyze-mode exploration after intake is written.',
          'Respond briefly that Harness intake is initialized and the next expected actor is the recorded manager, then stop.',
        ]
      : [];
    return [
      "[harness-mode] HARNESS MODE IS ACTIVE.",
      "You are not in generic OMO analyze-mode even if other plugins inject their defaults.",
      "You must not complete tasks in one thread.",
      "You must create a route packet, dispatch the full required manager stack, then supervise selected hands and probes by summary files.",
      "Do not perform deep business analysis or command validation yourself before manager dispatch markers exist.",
      ...intakeOnlyLines,
      "If required managers/hands/probes are unavailable, mark the route blocked honestly."
    ];
  }
  if (agent === "feature-planner") {
    return ["[harness-manager] You are feature-planner. Own product framing and feature contract setup before bounded execution begins."];
  }
  if (agent === "capability-planner") {
    return ["[harness-manager] You are capability-planner. Own baseline, capability-map, and gap-analysis setup before bounded execution begins."];
  }
  if (agent === "planning-manager") {
    return ["[harness-manager] You are planning-manager. Produce contracts and summaries, not implementation."];
  }
  if (agent === "execution-manager") {
    return ["[harness-manager] You are execution-manager. You must dispatch the selected capability hands before an execution round may complete."];
  }
  if (agent === "acceptance-manager") {
    return ["[harness-manager] You are acceptance-manager. You must require the selected probes before acceptance may complete."];
  }
  return [];
}

async function loadPluginState(workspace) {
  const p = path.join(workspace, '.agent-memory', 'harness-plugin-state.json');
  if (!(await exists(p))) return { path: p, state: null };
  try {
    return { path: p, state: JSON.parse(await fs.readFile(p, 'utf8')) };
  } catch {
    return { path: p, state: null };
  }
}

async function savePluginState(workspace, state) {
  const p = path.join(workspace, '.agent-memory', 'harness-plugin-state.json');
  await writeText(p, JSON.stringify(state, null, 2) + '\n');
}

async function initMemoryScaffold(workspace) {
  const memoryDir = path.join(workspace, '.agent-memory');
  const inboxDir = path.join(memoryDir, 'inbox');
  const evidenceDir = path.join(workspace, 'evidence');
  await ensureDir(memoryDir);
  await ensureDir(inboxDir);
  await ensureDir(evidenceDir);
  for (const rel of ['screenshots','command-outputs','api-traces','artifacts','smoke-tests']) {
    await ensureDir(path.join(evidenceDir, rel));
  }
  const placeholders = {
    'brain-brief.md': '# Brain Brief\n\n',
    'route-summary.md': '# Route Summary\n\n',
    'risk-summary.md': '# Risk Summary\n\n',
    'acceptance-summary.md': '# Acceptance Summary\n\n',
    'task.md': '# Task\n\n',
    'working-memory.md': '# Working Memory\n\n',
    'round-contract.md': '# Round Contract\n\n',
    'orchestration-status.md': '# Orchestration Status\n\n',
    'execution-status.md': '# Execution Status\n\n',
    'acceptance-report.md': '# Acceptance Report\n\n',
    'evidence-ledger.md': '# Evidence Ledger\n\n',
  };
  for (const [name, content] of Object.entries(placeholders)) {
    const f = path.join(memoryDir, name);
    if (!(await exists(f))) await writeText(f, content);
  }
  const idx = path.join(inboxDir, 'index.jsonl');
  if (!(await exists(idx))) await writeText(idx, '');
}

async function initializeHarnessTask(workspace, message, agent, routeIdOverride = '') {
  await initMemoryScaffold(workspace);
  const routeId = routeIdOverride || classifyTask(message);
  const route = routeConfig(routeId);
  const reqId = requestId();
  const completedDeliverables = await detectCompletedDeliverables(workspace, route);
  const state = {
    version: 1,
    mode: 'harness',
    activeAgent: agent,
    requestId: reqId,
    routeId,
    taskType: route.taskType,
    flowTier: route.flowTier,
    currentPhase: 'intake',
    nextExpectedActor: route.managers[0] || 'planning-manager',
    requiredManagers: route.managers,
    pendingManagers: [...route.managers],
    dispatchedManagers: [],
    requiredCapabilityHands: route.capability,
    selectedCapabilityHands: selectCapabilityHands({ routeId, rawUserInput: message, requiredCapabilityHands: route.capability }),
    pendingCapabilityHands: selectCapabilityHands({ routeId, rawUserInput: message, requiredCapabilityHands: route.capability }),
    dispatchedCapabilityHands: [],
    requiredProbes: route.probes,
    selectedProbes: selectProbes({ routeId, rawUserInput: message, requiredProbes: route.probes }),
    pendingProbes: selectProbes({ routeId, rawUserInput: message, requiredProbes: route.probes }),
    dispatchedProbes: [],
    completedDeliverables,
    deferredDispatchState: 'ready',
    lastCompletedActor: 'none',
    lastDispatchError: null,
    childDispatchSessionIDs: {
      planning: [],
      execution: [],
      acceptance: [],
      capabilityHands: {},
      probes: {},
      acceptanceClosure: [],
    },
    activeDispatch: null,
    blocked: false,
    blockedReason: '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    rawUserInput: message,
  };
  const routePacket = buildRoutePacket(routeId, route, state);
  await savePluginState(workspace, state);
  await writeText(path.join(workspace, '.agent-memory', 'route-packet.json'), JSON.stringify(routePacket, null, 2) + '\n');
  const inboxFile = path.join(workspace, '.agent-memory', 'inbox', `${reqId}.md`);
  await writeText(inboxFile, `# ${reqId}\n\n## Original request\n\n${message}\n`);
  await appendText(path.join(workspace, '.agent-memory', 'inbox', 'index.jsonl'), JSON.stringify({ id: reqId, routeId, createdAt: state.createdAt }) + '\n');
  await writeText(path.join(workspace, '.agent-memory', 'orchestration-status.md'), [
    '# Orchestration Status',
    '',
    `- Mode: harness`,
    `- Request ID: ${reqId}`,
    `- Route: ${routeId}`,
    `- Task Type: ${route.taskType}`,
    `- Flow Tier: ${route.flowTier}`,
    `- Current Phase: intake`,
    `- Expected Next Writer: ${route.managers[0] || 'planning-manager'}`,
    `- Reason for Lane: ${routePacket.reasonForLane}`,
    `- Routing Contract Row: ${routePacket.routingContractRow}`,
    `- Resolved Skill Stack: ${routePacket.resolvedSkillStack.join(', ')}`,
    `- Default Main Route: ${routePacket.defaultMainRoute}`,
    `- Required Startup Files: ${routePacket.requiredStartupFiles.join(', ')}`,
    `- Required Planning Files: ${routePacket.requiredPlanningFiles.join(', ')}`,
    `- Required Execution Files: ${routePacket.requiredExecutionFiles.join(', ')}`,
    `- Required Acceptance Gates: ${routePacket.requiredAcceptanceGates.join(', ')}`,
    `- Required Managers: ${route.managers.join(', ')}`,
    `- Required Capability Hands: ${route.capability.join(', ')}`,
    `- Selected Capability Hands: ${state.selectedCapabilityHands.join(', ')}`,
    `- Required Probes: ${route.probes.join(', ')}`,
    `- Selected Probes: ${state.selectedProbes.join(', ')}`,
    `- Required Deliverables: ${routePacket.requiredDeliverables.join(', ')}`,
    `- Missing Deliverables: ${routePacket.missingDeliverables.join(', ') || 'none'}`,
    `- Route Blocking Gaps: ${routePacket.routeBlockingGaps.join(', ') || 'none'}`,
  ].join('\n') + '\n');
  await writeText(path.join(workspace, '.agent-memory', 'brain-brief.md'), `# Brain Brief\n\n- Request ID: ${reqId}\n- Goal: ${message}\n- Route: ${routeId}\n- Next expected actor: ${route.managers[0] || 'planning-manager'}\n`);
  await writeText(path.join(workspace, '.agent-memory', 'route-summary.md'), `# Route Summary\n\n- Route ID: ${routeId}\n- Task Type: ${route.taskType}\n- Managers: ${route.managers.join(', ')}\n- Hands: ${route.capability.join(', ')}\n- Selected Hands: ${state.selectedCapabilityHands.join(', ')}\n- Probes: ${route.probes.join(', ')}\n- Selected Probes: ${state.selectedProbes.join(', ')}\n- Deliverables: ${route.deliverables.join(', ')}\n`);
  await appendText(path.join(workspace, '.agent-memory', 'activity.jsonl'), JSON.stringify({ event: 'task.intake', requestId: reqId, routeId, ts: nowIso() }) + '\n');
  return state;
}

async function updateState(workspace, mutator) {
  const loaded = await loadPluginState(workspace);
  const state = loaded.state;
  if (!state) return null;
  const next = mutator(structuredClone(state)) || state;
  next.updatedAt = nowIso();
  await savePluginState(workspace, next);
  return next;
}

function inferRoleFromTaskArgs(args) {
  const flat = JSON.stringify(args || {});
  const lowerFlat = flat.toLowerCase();
  const foundManagers = Array.from(MANAGER_AGENTS).filter(a => lowerFlat.includes(a));
  const foundHands = Array.from(CAPABILITY_AGENTS).filter(a => lowerFlat.includes(a));
  const foundProbes = Array.from(PROBE_AGENTS).filter(a => lowerFlat.includes(a));
  return { foundManagers, foundHands, foundProbes };
}

async function recordDispatch(workspace, args) {
  const inferred = inferRoleFromTaskArgs(args);
  return await updateState(workspace, (state) => {
    for (const m of inferred.foundManagers) if (!state.dispatchedManagers.includes(m)) state.dispatchedManagers.push(m);
    for (const h of inferred.foundHands) if (!state.dispatchedCapabilityHands.includes(h)) state.dispatchedCapabilityHands.push(h);
    for (const p of inferred.foundProbes) if (!state.dispatchedProbes.includes(p)) state.dispatchedProbes.push(p);
    if (inferred.foundManagers.includes('planning-manager')) state.currentPhase = 'planning';
    if (inferred.foundManagers.includes('execution-manager')) state.currentPhase = 'execution';
    if (inferred.foundManagers.includes('acceptance-manager')) state.currentPhase = 'acceptance';
    return state;
  });
}

async function syncStatusFromState(workspace) {
  const { state } = await loadPluginState(workspace);
  if (!state) return;
  const route = routeConfig(state.routeId);
  const completedDeliverables = await detectCompletedDeliverables(workspace, route);
  if (JSON.stringify(completedDeliverables) !== JSON.stringify(state.completedDeliverables || [])) {
    state.completedDeliverables = completedDeliverables;
    await savePluginState(workspace, state);
  }
  const routePacket = buildRoutePacket(state.routeId, route, state);
  await writeText(path.join(workspace, '.agent-memory', 'route-packet.json'), JSON.stringify(routePacket, null, 2) + '\n');
  await writeText(path.join(workspace, '.agent-memory', 'orchestration-status.md'), [
    '# Orchestration Status', '',
    `- Mode: ${state.mode}`,
    `- Request ID: ${state.requestId}`,
    `- Route: ${state.routeId}`,
    `- Task Type: ${state.taskType}`,
    `- Flow Tier: ${state.flowTier}`,
    `- Current Phase: ${state.currentPhase}`,
    `- Expected Next Writer: ${state.nextExpectedActor}`,
    `- Reason for Lane: ${routePacket.reasonForLane}`,
    `- Routing Contract Row: ${routePacket.routingContractRow}`,
    `- Resolved Skill Stack: ${routePacket.resolvedSkillStack.join(', ')}`,
    `- Default Main Route: ${routePacket.defaultMainRoute}`,
    `- Required Startup Files: ${routePacket.requiredStartupFiles.join(', ')}`,
    `- Required Planning Files: ${routePacket.requiredPlanningFiles.join(', ')}`,
    `- Required Execution Files: ${routePacket.requiredExecutionFiles.join(', ')}`,
    `- Required Acceptance Gates: ${routePacket.requiredAcceptanceGates.join(', ')}`,
    `- Dispatched Managers: ${state.dispatchedManagers.join(', ') || 'none'}`,
    `- Selected Capability Hands: ${(state.selectedCapabilityHands || []).join(', ') || 'none'}`,
    `- Dispatched Capability Hands: ${state.dispatchedCapabilityHands.join(', ') || 'none'}`,
    `- Selected Probes: ${(state.selectedProbes || []).join(', ') || 'none'}`,
    `- Dispatched Probes: ${state.dispatchedProbes.join(', ') || 'none'}`,
    `- Required Deliverables: ${routePacket.requiredDeliverables.join(', ')}`,
    `- Missing Deliverables: ${routePacket.missingDeliverables.join(', ') || 'none'}`,
    `- Route Blocking Gaps: ${routePacket.routeBlockingGaps.join(', ') || 'none'}`,
    `- Blocked: ${state.blocked}`,
    `- Blocked Reason: ${state.blockedReason || 'none'}`,
  ].join('\n') + '\n');
}

async function syncManagedAgentIndex(workspace) {
  const { state } = await loadPluginState(workspace);
  if (!state) return;
  const indexPath = path.join(workspace, '.agent-memory', 'managed-agent-state-index.json');
  let index = {};
  try { index = JSON.parse(await fs.readFile(indexPath, 'utf8')); } catch {}
  index.version = 2;
  index.mode = 'managed-agents';
  index.last_updated = nowIso();
  index.route = {
    request_id: state.requestId,
    route_id: state.routeId,
    task_type: state.taskType,
    flow_tier: state.flowTier,
    current_phase: state.currentPhase,
    next_expected_actor: state.nextExpectedActor,
    blocked: state.blocked,
    blocked_reason: state.blockedReason,
  };
  index.required_manager_dispatch = state.requiredManagers;
  index.pending_manager_dispatch = state.pendingManagers || state.requiredManagers;
  index.dispatched_managers = state.dispatchedManagers;
  index.required_capability_hands = state.requiredCapabilityHands;
  index.selected_capability_hands = state.selectedCapabilityHands || state.requiredCapabilityHands;
  index.pending_capability_hands = state.pendingCapabilityHands || state.selectedCapabilityHands || state.requiredCapabilityHands;
  index.dispatched_capability_hands = state.dispatchedCapabilityHands;
  index.required_probes = state.requiredProbes;
  index.selected_probes = state.selectedProbes || state.requiredProbes;
  index.pending_probes = state.pendingProbes || state.selectedProbes || state.requiredProbes;
  index.dispatched_probes = state.dispatchedProbes;
  index.deferred_dispatch_state = state.deferredDispatchState || 'ready';
  index.last_completed_actor = state.lastCompletedActor || 'none';
  index.probe_requirements = index.probe_requirements || { default: {}, current: {} };
  index.probe_requirements.current = {
    ui: state.requiredProbes.includes('ui-probe-agent'),
    api: state.requiredProbes.includes('api-probe-agent'),
    regression: state.requiredProbes.includes('regression-probe-agent'),
    artifact: state.requiredProbes.includes('artifact-probe-agent'),
    reason: 'harness plugin route requirements',
  };
  index.acceptance = index.acceptance || {};
  index.acceptance.accepted_probe_producers = Array.from(PROBE_AGENTS);
  await writeText(indexPath, JSON.stringify(index, null, 2) + '\n');
}

async function setBlocked(workspace, reason) {
  await updateState(workspace, (state) => {
    state.blocked = true;
    state.blockedReason = reason;
    state.currentPhase = 'blocked';
    state.nextExpectedActor = 'none';
    return state;
  });
  await syncStatusFromState(workspace);
  await syncManagedAgentIndex(workspace);
}

async function requireHarnessManagerDispatch(workspace, tool, args, currentAgent) {
  const { state } = await loadPluginState(workspace);
  if (!state || currentAgent !== 'harness-orchestrator') return;
  const toolName = lower(tool);
  if (state.currentPhase === 'intake') {
    await appendPluginDebug(workspace, 'tool.blocked.during_intake', { tool: toolName, routeId: state.routeId, nextExpectedActor: state.nextExpectedActor });
    throw new Error('Harness plugin blocked this action: intake is already initialized; top-level harness-orchestrator must not continue tool work.');
  }
  if (state.mode === 'harness' && state.currentPhase !== 'complete' && state.deferredDispatchState && state.deferredDispatchState !== 'idle') {
    await appendPluginDebug(workspace, 'tool.blocked.while_deferred_route_active', { tool: toolName, routeId: state.routeId, currentPhase: state.currentPhase, deferredDispatchState: state.deferredDispatchState });
    throw new Error('Harness plugin blocked this action: top-level harness-orchestrator must not continue tool work while the deferred route is active.');
  }
  const safePreDispatchTools = new Set(['task']);
  const hasPlanning = state.dispatchedManagers.includes('planning-manager');
  if (!hasPlanning && !safePreDispatchTools.has(toolName)) {
    throw new Error('Harness plugin blocked this action: harness-orchestrator must dispatch planning-manager before performing substantive tool work.');
  }
}

async function guardExecutionManager(workspace, tool, args, currentAgent) {
  const { state } = await loadPluginState(workspace);
  if (!state || currentAgent !== 'execution-manager') return;
  const toolName = lower(tool);
  const targetPath = args?.file_path || args?.path || '';
  const isExecutionSummaryWrite = typeof targetPath === 'string' && (targetPath.includes('execution-status.md') || targetPath.includes('acceptance-report.md'));
  if (isExecutionSummaryWrite && state.dispatchedCapabilityHands.length === 0) {
    throw new Error('Harness plugin blocked this write: execution-manager must dispatch at least one capability hand before completing the round.');
  }
  if (toolName === 'task') {
    const inferred = inferRoleFromTaskArgs(args);
    if (inferred.foundManagers.length > 0) {
      throw new Error('Execution-manager must dispatch capability agents, not recurse into manager orchestration.');
    }
  }
}

async function guardAcceptanceManager(workspace, tool, args, currentAgent) {
  const { state } = await loadPluginState(workspace);
  if (!state || currentAgent !== 'acceptance-manager') return;
  const targetPath = args?.file_path || args?.path || '';
  const isAcceptanceWrite = typeof targetPath === 'string' && targetPath.includes('acceptance-report.md');
  if (isAcceptanceWrite && state.dispatchedProbes.length === 0) {
    throw new Error('Harness plugin blocked this write: acceptance-manager must dispatch at least one probe before acceptance may complete.');
  }
}

async function appendEvent(workspace, event, payload = {}) {
  await appendText(path.join(workspace, '.agent-memory', 'activity.jsonl'), JSON.stringify({ event, ts: nowIso(), ...payload }) + '\n');
}

async function appendPluginDebug(workspace, label, payload = {}) {
  await appendText(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), `[${nowIso()}] ${label} ${JSON.stringify(payload)}\n`);
}

async function createChildDispatchSession(client, workspace, state, actor, phase) {
  if (!client?.session?.create) {
    return { sessionID: state.sessionID, created: false };
  }
  const response = await client.session.create({
    query: { directory: workspace },
    body: {
      parentID: state.sessionID,
      title: `Harness ${phase}: ${actor}`,
    },
  });
  const sessionID = response?.data?.id || response?.id || response?.sessionID || response?.sessionId;
  if (!sessionID) {
    throw new Error(`child session creation returned no id for ${actor}`);
  }
  return { sessionID, created: true };
}

function recordChildDispatchSession(state, actor, phase, sessionID) {
  const next = { ...(state.childDispatchSessionIDs || {}) };
  if (phase === 'manager') {
    const bucket = actor === 'execution-manager' ? 'execution' : actor === 'acceptance-manager' ? 'acceptance' : 'planning';
    next[bucket] = [...(next[bucket] || []), sessionID];
    return next;
  }
  if (phase === 'capability-hand') {
    const hands = { ...(next.capabilityHands || {}) };
    hands[actor] = [...(hands[actor] || []), sessionID];
    next.capabilityHands = hands;
    return next;
  }
  if (phase === 'probe') {
    const probes = { ...(next.probes || {}) };
    probes[actor] = [...(probes[actor] || []), sessionID];
    next.probes = probes;
    return next;
  }
  next.acceptanceClosure = [...(next.acceptanceClosure || []), sessionID];
  return next;
}

async function autoDispatchManager(client, workspace, state, managerName) {
  if (!client || !state || !managerName) return state;
  const { sessionID: targetSessionID } = await createChildDispatchSession(client, workspace, state, managerName, 'manager');
  const skills = MANAGER_SKILLS[managerName] || [];
  const actionLines = managerName === 'feature-planner'
    ? [
        '- define or refine the product-level spec and release-critical journeys',
        '- update product planning artifacts such as product-spec.md / features-summary.md when needed',
      ]
    : managerName === 'capability-planner'
      ? [
          '- define or refine baseline-source.md / capability-map.md / gap-analysis.md',
          '- make hidden capability gaps explicit before execution begins',
        ]
      : managerName === 'planning-manager'
        ? [
            '- create or refine the planning contract',
            '- update .agent-memory/task.md if needed',
            '- set up the next bounded execution-ready contract',
          ]
        : managerName === 'execution-manager'
          ? [
              '- create or refine the current round contract',
              '- dispatch the selected capability hands',
              '- keep execution evidence and summaries consistent',
            ]
          : [
              '- perform independent acceptance management',
              '- dispatch the selected probes',
              '- keep acceptance records and summaries consistent',
            ];
  const prompt = [
    `You are being auto-dispatched by the Harness plugin as ${managerName}.`,
    `Request ID: ${state.requestId}`,
    `Route ID: ${state.routeId}`,
    `Task Type: ${state.taskType}`,
    `Flow Tier: ${state.flowTier}`,
    `Raw User Input: ${state.rawUserInput}`,
    `Required managers: ${state.requiredManagers.join(', ')}`,
    `Selected capability hands: ${(state.selectedCapabilityHands || []).join(', ') || 'none'}`,
    `Selected probes: ${(state.selectedProbes || []).join(', ') || 'none'}`,
    `Suggested skills: ${skills.join(', ') || 'none'}`,
    'Your required action:',
    ...actionLines,
    '- preserve harness role boundaries',
    managerName === 'execution-manager' ? '- do not perform acceptance.' : '- do not collapse the route into one-thread execution.',
  ].join('\n');
  await client.session.promptAsync({
    path: { id: targetSessionID },
    query: { directory: workspace },
    body: {
      agent: managerName,
      parts: [{ type: 'text', text: prompt }]
    }
  });
  return {
    targetSessionID,
    phase: 'manager',
    actor: managerName,
  };
}

async function autoDispatchCapabilityHand(client, workspace, state, capabilityName = 'docs-agent') {
  if (!client || !state) return state;
  const { sessionID: targetSessionID } = await createChildDispatchSession(client, workspace, state, capabilityName, 'capability-hand');
  const prompt = [
    `You are being auto-dispatched by the Harness plugin as ${capabilityName}.`,
    `Request ID: ${state.requestId}`,
    `Route ID: ${state.routeId}`,
    `Task Type: ${state.taskType}`,
    `Flow Tier: ${state.flowTier}`,
    `Raw User Input: ${state.rawUserInput}`,
    'Your required action:',
    '- perform narrow capability work only',
    '- do not become a manager or acceptance judge',
    '- write or support evidence relevant to your capability',
    '- preserve harness role boundaries',
  ].join('\n');
  await client.session.promptAsync({
    path: { id: targetSessionID },
    query: { directory: workspace },
    body: {
      agent: capabilityName,
      parts: [{ type: 'text', text: prompt }]
    }
  });
  return {
    targetSessionID,
    phase: 'capability-hand',
    actor: capabilityName,
  };
}

async function autoDispatchAcceptanceManager(client, workspace, state) {
  if (!client || !state) return state;
  const { sessionID: targetSessionID } = await createChildDispatchSession(client, workspace, state, 'acceptance-manager', 'manager');
  const prompt = [
    'You are being auto-dispatched by the Harness plugin as acceptance-manager.',
    `Request ID: ${state.requestId}`,
    `Route ID: ${state.routeId}`,
    `Task Type: ${state.taskType}`,
    `Flow Tier: ${state.flowTier}`,
    `Raw User Input: ${state.rawUserInput}`,
    `Required probes: ${state.requiredProbes.join(', ')}`,
    'Your required action:',
    '- perform independent acceptance management',
    '- dispatch at least one required probe',
    '- do not perform implementation',
    '- keep acceptance records and summaries consistent',
  ].join('\n');
  await client.session.promptAsync({
    path: { id: targetSessionID },
    query: { directory: workspace },
    body: {
      agent: 'acceptance-manager',
      parts: [{ type: 'text', text: prompt }]
    }
  });
  return {
    targetSessionID,
    phase: 'manager',
    actor: 'acceptance-manager',
  };
}

async function autoDispatchProbe(client, workspace, state, probeName = 'artifact-probe-agent') {
  if (!client || !state) return state;
  const { sessionID: targetSessionID } = await createChildDispatchSession(client, workspace, state, probeName, 'probe');
  const prompt = [
    `You are being auto-dispatched by the Harness plugin as ${probeName}.`,
    `Request ID: ${state.requestId}`,
    `Route ID: ${state.routeId}`,
    `Task Type: ${state.taskType}`,
    `Flow Tier: ${state.flowTier}`,
    `Raw User Input: ${state.rawUserInput}`,
    'Your required action:',
    '- perform narrow verification work only',
    '- collect evidence relevant to your probe',
    '- do not issue final acceptance',
    '- preserve harness role boundaries',
  ].join('\n');
  await client.session.promptAsync({
    path: { id: targetSessionID },
    query: { directory: workspace },
    body: {
      agent: probeName,
      parts: [{ type: 'text', text: prompt }]
    }
  });
  return {
    targetSessionID,
    phase: 'probe',
    actor: probeName,
  };
}

async function autoDispatchAcceptanceClosure(client, workspace, state) {
  if (!client || !state) return state;
  const { sessionID: targetSessionID } = await createChildDispatchSession(client, workspace, state, 'acceptance-manager', 'acceptance-closure');
  const prompt = [
    'You are being re-dispatched by the Harness plugin as acceptance-manager for final closure.',
    `Request ID: ${state.requestId}`,
    `Route ID: ${state.routeId}`,
    `Task Type: ${state.taskType}`,
    `Flow Tier: ${state.flowTier}`,
    `Dispatched capability hands: ${(state.dispatchedCapabilityHands || []).join(', ') || 'none'}`,
    `Dispatched probes: ${(state.dispatchedProbes || []).join(', ') || 'none'}`,
    'Your required action:',
    '- consume probe results and acceptance evidence',
    '- issue final acceptance closure',
    '- update acceptance artifacts if needed',
    '- do not reopen implementation unless a real blocker is found',
  ].join('\n');
  await client.session.promptAsync({
    path: { id: targetSessionID },
    query: { directory: workspace },
    body: {
      agent: 'acceptance-manager',
      parts: [{ type: 'text', text: prompt }]
    }
  });
  return {
    targetSessionID,
    phase: 'acceptance-closure',
    actor: 'acceptance-manager',
  };
}

async function beginDeferredDispatch(workspace, state, actor, phase) {
  if (state.activeDispatch) {
    await appendPluginDebug(workspace, 'deferred.dispatch.duplicate_skipped', {
      routeId: state.routeId,
      requestId: state.requestId,
      activeDispatch: state.activeDispatch,
      requestedActor: actor,
      requestedPhase: phase,
    });
    return { state, skipped: true };
  }
  const activeDispatch = {
    actor,
    phase,
    startedAt: nowIso(),
  };
  const nextState = {
    ...state,
    activeDispatch,
  };
  await savePluginState(workspace, nextState);
  await syncManagedAgentIndex(workspace);
  await syncStatusFromState(workspace);
  return { state: nextState, skipped: false };
}

async function clearDeferredDispatch(workspace, state) {
  const nextState = {
    ...state,
    activeDispatch: null,
  };
  await savePluginState(workspace, nextState);
  await syncManagedAgentIndex(workspace);
  await syncStatusFromState(workspace);
  return nextState;
}

async function recordDeferredDispatchError(workspace, state, actor, phase, error) {
  const nextState = {
    ...state,
    activeDispatch: null,
    deferredDispatchState: 'retryable_error',
    lastDispatchError: {
      actor,
      phase,
      message: String(error?.message || error),
      at: nowIso(),
    },
  };
  await savePluginState(workspace, nextState);
  await syncManagedAgentIndex(workspace);
  await syncStatusFromState(workspace);
  await appendPluginDebug(workspace, 'deferred.dispatch.error', {
    actor,
    phase,
    routeId: state.routeId,
    requestId: state.requestId,
    error: String(error?.message || error),
  });
  return nextState;
}

async function dispatchNextDeferredManager(client, workspace, state) {
  if (!client || !state) return state;
  const pendingManagers = [...(state.pendingManagers || [])];
  const manager = pendingManagers.shift();
  if (!manager) return state;
  const begun = await beginDeferredDispatch(workspace, state, manager, 'manager');
  if (begun.skipped) return begun.state;
  state = begun.state;
  try {
    const dispatch = await autoDispatchManager(client, workspace, state, manager);
    state = {
      ...state,
      childDispatchSessionIDs: recordChildDispatchSession(state, dispatch.actor, dispatch.phase, dispatch.targetSessionID),
    };
  } catch (error) {
    return await recordDeferredDispatchError(workspace, state, manager, 'manager', error);
  }
  let nextState = {
    ...state,
    pendingManagers,
    dispatchedManagers: Array.from(new Set([...(state.dispatchedManagers || []), manager])),
    currentPhase: manager === 'execution-manager' ? 'execution' : manager === 'acceptance-manager' ? 'acceptance' : 'planning',
    nextExpectedActor: manager === 'execution-manager'
      ? ((state.pendingCapabilityHands || state.selectedCapabilityHands || [])[0] || pendingManagers[0] || 'acceptance-manager')
      : manager === 'acceptance-manager'
        ? ((state.pendingProbes || state.selectedProbes || [])[0] || 'none')
        : pendingManagers[0] || ((state.pendingCapabilityHands || state.selectedCapabilityHands || [])[0] || 'none'),
    deferredDispatchState: 'manager_in_progress',
    lastCompletedActor: manager,
    lastDispatchError: null,
  };
  nextState = await clearDeferredDispatch(workspace, nextState);
  await savePluginState(workspace, nextState);
  await syncManagedAgentIndex(workspace);
  await syncStatusFromState(workspace);
  await appendEvent(workspace, 'manager.dispatch.requested', { manager, requestId: state.requestId, routeId: state.routeId });
  await appendPluginDebug(workspace, 'deferred.manager.dispatch.requested', { manager, requestId: state.requestId, remainingManagers: pendingManagers });
  return nextState;
}

async function dispatchNextDeferredHand(client, workspace, state) {
  if (!client || !state) return state;
  const pendingCapabilityHands = [...(state.pendingCapabilityHands || [])];
  const capabilityName = pendingCapabilityHands.shift();
  if (!capabilityName) return state;
  const begun = await beginDeferredDispatch(workspace, state, capabilityName, 'capability-hand');
  if (begun.skipped) return begun.state;
  state = begun.state;
  try {
    const dispatch = await autoDispatchCapabilityHand(client, workspace, state, capabilityName);
    state = {
      ...state,
      childDispatchSessionIDs: recordChildDispatchSession(state, dispatch.actor, dispatch.phase, dispatch.targetSessionID),
    };
  } catch (error) {
    return await recordDeferredDispatchError(workspace, state, capabilityName, 'capability-hand', error);
  }
  let nextState = {
    ...state,
    pendingCapabilityHands,
    dispatchedCapabilityHands: Array.from(new Set([...(state.dispatchedCapabilityHands || []), capabilityName])),
    currentPhase: 'execution',
    nextExpectedActor: pendingCapabilityHands[0] || ((state.pendingProbes || state.selectedProbes || [])[0] || 'acceptance-manager'),
    deferredDispatchState: 'hand_in_progress',
    lastCompletedActor: capabilityName,
    lastDispatchError: null,
  };
  nextState = await clearDeferredDispatch(workspace, nextState);
  await savePluginState(workspace, nextState);
  await syncManagedAgentIndex(workspace);
  await syncStatusFromState(workspace);
  await appendEvent(workspace, 'capability.dispatch.requested', { capability: capabilityName, requestId: state.requestId, routeId: state.routeId });
  await appendPluginDebug(workspace, 'deferred.hand.dispatch.requested', { capability: capabilityName, requestId: state.requestId, remainingCapabilityHands: pendingCapabilityHands });
  return nextState;
}

async function dispatchNextDeferredProbe(client, workspace, state) {
  if (!client || !state) return state;
  const pendingProbes = [...(state.pendingProbes || [])];
  const probeName = pendingProbes.shift();
  if (!probeName) return state;
  const begun = await beginDeferredDispatch(workspace, state, probeName, 'probe');
  if (begun.skipped) return begun.state;
  state = begun.state;
  try {
    const dispatch = await autoDispatchProbe(client, workspace, state, probeName);
    state = {
      ...state,
      childDispatchSessionIDs: recordChildDispatchSession(state, dispatch.actor, dispatch.phase, dispatch.targetSessionID),
    };
  } catch (error) {
    return await recordDeferredDispatchError(workspace, state, probeName, 'probe', error);
  }
  let nextState = {
    ...state,
    pendingProbes,
    dispatchedProbes: Array.from(new Set([...(state.dispatchedProbes || []), probeName])),
    currentPhase: 'probe-verification',
    nextExpectedActor: pendingProbes[0] || 'acceptance-manager',
    deferredDispatchState: 'probe_in_progress',
    lastCompletedActor: probeName,
    lastDispatchError: null,
  };
  nextState = await clearDeferredDispatch(workspace, nextState);
  await savePluginState(workspace, nextState);
  await syncManagedAgentIndex(workspace);
  await syncStatusFromState(workspace);
  await appendEvent(workspace, 'probe.dispatch.requested', { probe: probeName, requestId: state.requestId, routeId: state.routeId });
  await appendPluginDebug(workspace, 'deferred.probe.dispatch.requested', { probe: probeName, requestId: state.requestId, remainingProbes: pendingProbes });
  return nextState;
}

async function finalizeDeferredAcceptance(client, workspace, state) {
  if (!client || !state) return state;
  const begun = await beginDeferredDispatch(workspace, state, 'acceptance-manager', 'acceptance-closure');
  if (begun.skipped) return begun.state;
  state = begun.state;
  const route = routeConfig(state.routeId);
  const completedDeliverables = await detectCompletedDeliverables(workspace, route);
  const missingDeliverables = route.deliverables.filter((name) => !completedDeliverables.includes(name));
  if (missingDeliverables.length > 0) {
    const nextState = {
      ...state,
      activeDispatch: null,
      completedDeliverables,
      deferredDispatchState: 'retryable_error',
      lastDispatchError: {
        actor: 'acceptance-manager',
        phase: 'acceptance-closure',
        message: `missing deliverables: ${missingDeliverables.join(', ')}`,
        at: nowIso(),
      },
      nextExpectedActor: 'acceptance-manager',
      currentPhase: 'acceptance',
    };
    await savePluginState(workspace, nextState);
    await syncManagedAgentIndex(workspace);
    await syncStatusFromState(workspace);
    await appendPluginDebug(workspace, 'deferred.acceptance.closure.blocked_missing_deliverables', {
      routeId: state.routeId,
      requestId: state.requestId,
      missingDeliverables,
    });
    return nextState;
  }
  try {
    const dispatch = await autoDispatchAcceptanceClosure(client, workspace, state);
    state = {
      ...state,
      childDispatchSessionIDs: recordChildDispatchSession(state, dispatch.actor, dispatch.phase, dispatch.targetSessionID),
    };
  } catch (error) {
    return await recordDeferredDispatchError(workspace, state, 'acceptance-manager', 'acceptance-closure', error);
  }
  let nextState = {
    ...state,
    completedDeliverables,
    currentPhase: 'complete',
    nextExpectedActor: 'none',
    deferredDispatchState: 'complete',
    lastCompletedActor: 'acceptance-manager',
    lastDispatchError: null,
  };
  nextState = await clearDeferredDispatch(workspace, nextState);
  await savePluginState(workspace, nextState);
  await syncManagedAgentIndex(workspace);
  await syncStatusFromState(workspace);
  await appendEvent(workspace, 'route.completed', { routeId: state.routeId, requestId: state.requestId });
  await appendPluginDebug(workspace, 'deferred.acceptance.closure.requested', { requestId: state.requestId, routeId: state.routeId });
  return nextState;
}

export const server = async (input) => {
  const workspace = input.directory;
  const client = input.client;
  await ensureDir(path.join(workspace, '.agent-memory'));
  await appendPluginDebug(workspace, 'plugin.server.init', { directory: workspace, worktree: input.worktree, serverUrl: input.serverUrl.toString() });
  return {
    config: async (config) => {
      config.plugin = config.plugin || [];
    },
    event: async ({ event }) => {
      if (event?.type === 'session.created') {
        await appendEvent(workspace, 'session.created', { type: event.type });
      }
    },
    "command.execute.before": async (hookInput, output) => {
      await appendPluginDebug(workspace, 'hook.command.before', { command: hookInput.command, arguments: hookInput.arguments, partsCount: (output.parts || []).length });
      if (isSyntheticHarnessExpansionMessage(`${hookInput.command}\n${hookInput.arguments || ''}`)) {
        await appendPluginDebug(workspace, 'hook.command.before.synthetic_ignored', { command: hookInput.command });
        return;
      }
      const command = normalizeCommandName(hookInput.command);
      if (!isHarnessCommand(command)) return;
      const routeId = routeIdForCommand(command, hookInput.arguments || '');
      const agentMap = {
        control: 'harness-orchestrator',
        plan: 'planning-manager',
        drive: 'execution-manager',
        check: 'acceptance-manager'
      };
      const activeAgent = agentMap[command] || 'harness-orchestrator';
      const loaded = await loadPluginState(workspace);
      const state = loaded.state;

      if (command === 'plan' && state?.mode === 'harness') {
        const nextManager = state.pendingManagers?.[0] || '';
        if (['feature-planner', 'capability-planner', 'planning-manager'].includes(nextManager)) {
          state.sessionID = hookInput.sessionID;
          await savePluginState(workspace, state);
          await dispatchNextDeferredManager(client, workspace, state);
          return;
        }
      }

      if (command === 'drive' && state?.mode === 'harness') {
        const nextManager = state.pendingManagers?.[0] || '';
        state.sessionID = hookInput.sessionID;
        await savePluginState(workspace, state);
        if (nextManager === 'execution-manager') {
          await dispatchNextDeferredManager(client, workspace, state);
          return;
        }
        if (state.dispatchedManagers?.includes('execution-manager') && (state.pendingCapabilityHands || []).length > 0) {
          await dispatchNextDeferredHand(client, workspace, state);
          return;
        }
      }

      if (command === 'check' && state?.mode === 'harness') {
        const nextManager = state.pendingManagers?.[0] || '';
        state.sessionID = hookInput.sessionID;
        await savePluginState(workspace, state);
        if (nextManager === 'acceptance-manager') {
          await dispatchNextDeferredManager(client, workspace, state);
          return;
        }
        if (state.dispatchedManagers?.includes('acceptance-manager') && (state.pendingProbes || []).length > 0) {
          await dispatchNextDeferredProbe(client, workspace, state);
          return;
        }
        if (state.dispatchedManagers?.includes('acceptance-manager') && (state.pendingProbes || []).length === 0) {
          await finalizeDeferredAcceptance(client, workspace, state);
          return;
        }
      }

      const newState = await initializeHarnessTask(workspace, hookInput.arguments || hookInput.command, activeAgent, routeId);
      newState.sessionID = hookInput.sessionID;
      await savePluginState(workspace, newState);
      await syncManagedAgentIndex(workspace);
      await syncStatusFromState(workspace);
      await appendEvent(workspace, 'route.selected', { routeId: newState.routeId, requestId: newState.requestId, source: 'command.execute.before' });
      await appendPluginDebug(workspace, 'state.initialized.from_command', { requestId: newState.requestId, routeId: newState.routeId, activeAgent, sessionID: hookInput.sessionID });
      await appendPluginDebug(workspace, 'dispatch.deferred.after_intake', {
        requestId: newState.requestId,
        routeId: newState.routeId,
        nextExpectedActor: newState.nextExpectedActor,
        selectedManagers: newState.requiredManagers,
        selectedCapabilityHands: newState.selectedCapabilityHands,
        selectedProbes: newState.selectedProbes,
      });
    },
    "chat.message": async (hookInput, output) => {
      const agent = determineActiveAgent(hookInput);
      const { state } = await loadPluginState(workspace);
      await appendPluginDebug(workspace, 'hook.chat.message', { agent, hasParts: Boolean(output.parts?.length), partTypes: (output.parts || []).map((p) => p.type), currentPhase: state?.currentPhase || '' });
      if (!isHarnessAgent(agent)) return;
      const textParts = (output.parts || []).filter((p) => p.type === 'text').map((p) => p.text || '');
      const message = textParts.join('\n').trim();
      await appendPluginDebug(workspace, 'hook.chat.message.harness', { agent, messagePreview: message.slice(0, 200) });
      if (!message) return;
      if (agent === 'harness-orchestrator' && state?.currentPhase === 'intake') {
        output.parts = [{
          type: 'text',
          text: `Harness intake initialized for ${state.routeId}. Next expected actor: ${state.nextExpectedActor}. Route packet written to .agent-memory/route-packet.json.`,
        }];
        await appendPluginDebug(workspace, 'hook.chat.message.orchestrator_short_circuited', {
          reason: 'intake-only top-level response enforced',
          routeId: state.routeId,
          nextExpectedActor: state.nextExpectedActor,
        });
        return;
      }
      if (agent === 'harness-orchestrator') {
        await appendPluginDebug(workspace, 'hook.chat.message.orchestrator_ignored', { reason: 'top-level task init is command-only' });
        return;
      }
      if (isSyntheticHarnessExpansionMessage(message)) {
        await appendPluginDebug(workspace, 'hook.chat.message.synthetic_ignored', { agent });
        return;
      }
      return;
    },
    "experimental.chat.system.transform": async (hookInput, output) => {
      const { state } = await loadPluginState(workspace);
      const agent = hookInput.agent || state?.activeAgent || '';
      await appendPluginDebug(workspace, 'hook.chat.system.transform', { agent, initialSystemCount: (output.system || []).length, routeId: state?.routeId || '', currentPhase: state?.currentPhase || '' });
      if (!isHarnessAgent(agent)) return;
      output.system = output.system || [];
      output.system.unshift(...buildSystemAdditions(agent, state));
    },
    "tool.execute.before": async (hookInput, output) => {
      const currentAgent = hookInput.args?.agent || hookInput.args?.subagent_type || '';
      const { state } = await loadPluginState(workspace);
      const activeAgent = state?.activeAgent || currentAgent || '';
      await appendPluginDebug(workspace, 'hook.tool.before', { tool: hookInput.tool, activeAgent, argsKeys: output.args ? Object.keys(output.args) : [] });
      await requireHarnessManagerDispatch(workspace, hookInput.tool, output.args, activeAgent);
      await guardExecutionManager(workspace, hookInput.tool, output.args, activeAgent);
      await guardAcceptanceManager(workspace, hookInput.tool, output.args, activeAgent);
      if (lower(hookInput.tool) === 'task') {
        await recordDispatch(workspace, output.args);
        await syncManagedAgentIndex(workspace);
        await syncStatusFromState(workspace);
        await appendEvent(workspace, 'actor.dispatched', { tool: hookInput.tool, args: output.args });
        await appendPluginDebug(workspace, 'dispatch.recorded', inferRoleFromTaskArgs(output.args));
      }
    },
    "tool.execute.after": async (hookInput, output) => {
      const tool = lower(hookInput.tool);
      await appendPluginDebug(workspace, 'hook.tool.after', { tool, title: output.title });
      if (tool === 'task') {
        await appendEvent(workspace, 'actor.completed', { title: output.title, metadata: output.metadata });
      }
      const { state } = await loadPluginState(workspace);
      if (state) {
        await syncManagedAgentIndex(workspace);
        await syncStatusFromState(workspace);
      }
    }
  };
};

export default { server };

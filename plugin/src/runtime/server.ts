// @ts-nocheck
import { promises as fs } from "fs";
import os from "os";
import { DatabaseSync } from 'node:sqlite';
import path from "path";

import { actorForAuthorizedSession, authorizeDeferredChildActor, listLiveDeferredSteps } from '../dispatch/authorization.js';
import { completeGraphStep } from '../dispatch/completion.js';
import { reconcileRuntime } from '../dispatch/reconcile.js';
import { markStepInProgress, recordStepRetryableError, stepIdForActorPhase } from '../dispatch/recovery.js';
import { guardFileWrite } from '../dispatch/phase-guard.js';
import { applyStandardSignalEvents, parseStandardSignalEvents } from '../dispatch/standard-signals.js';
import { selectCapabilityHands, selectProbes } from '../dispatch/capability-selector.js';
import { createGraphRuntimeRollout, isManualHarnessMode, rolloutBudgetsForState } from '../mode/index.js';
import { actorRequiresDelegatedAgent, actorKind, validateCompletion } from '../dispatch/role-boundary.js';
import {
  buildManagedAgentIndexProjection,
  buildRoutePacketProjection,
  buildStatusProjection,
} from '../observability/projections.js';
import { routeConfig } from '../routing/table.js';
import { deriveNextExpectedActor } from '../state/next-expected-actor.js';
import {
  buildAcceptanceClosurePrompt,
  buildCapabilityHandDispatchPrompt,
  buildManagerDispatchPrompt,
  buildProbeDispatchPrompt,
} from './prompts.js';
import { detectCompletedDeliverables } from '../state/file-contract.js';
import { ensureGraphState } from '../state/migration.js';
import { loadPluginState, savePluginState } from '../state/storage.js';
import {
  nowIso, requestId, lower, unique, includesAny, formatSection, formatSignalList,
  normalizeCommandName, isHarnessCommand, completedManagerPhase, withoutFirst,
  chatMessageSessionID, isSyntheticHarnessExpansionMessage, isSyntheticAutoDispatchEcho,
  toolCountsAsChildProgress,
} from './utils.js';
import {
  HARNESS_AGENTS, MANAGER_AGENTS, CAPABILITY_AGENTS, PROBE_AGENTS, MANAGER_SKILLS,
} from './constants.js';

export const id = "omo-harness-plugin";

const AUTOPILOT_WATCHERS = new Map();

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function writeText(p, text) {
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, text, 'utf8');
}

async function appendText(p, text) {
  await ensureDir(path.dirname(p));
  await fs.appendFile(p, text, 'utf8');
}

export function classifyTask(message) {
  const msg = lower(message);
  if (["fix", "bug", "修复", "报错", "回归"].some(k => msg.includes(k))) return "F-M1";
  if (["product", "从零", "搭建", "build a", "create a", "产品"].some(k => msg.includes(k))) return "P-H1";
  if (["capability", "能力", "truly able", "deeper", "less visible"].some(k => msg.includes(k))) return "A-M1";
  if (["refactor", "重构", "改造", "rework"].some(k => msg.includes(k))) return "C-M1";
  return "J-L1";
}

function buildRouteDoneCriteria(route, semanticLockStatus) {
  if (semanticLockStatus !== 'locked') {
    return [
      'Clarify the user intent before any planning or execution begins.',
      'Do not dispatch managers, hands, or probes while the semantic lock is unresolved.',
    ];
  }

  return [
    `Route ${route.taskType} / ${route.flowTier} is locked to the requested outcome.`,
    `Required deliverables: ${(route.deliverables || []).join(', ') || 'none'}.`,
    route.antiShallowBar,
  ];
}

function resolveSemanticLock(message, routeId, route) {
  const raw = String(message || '').trim();
  const msg = lower(raw).replace(/\s+/g, ' ').trim();
  const obviouslyAmbiguous = new Set([
    '看一下这个',
    '看看这个',
    '这个',
    'check this',
    'look into this',
    'review this',
    'check it',
    'look into it',
    'this',
    'it',
  ]);
  const vagueInvestigations = ['看一下', '看看', 'check', 'look into', 'review'];
  const referentialWords = ['这个', 'this', 'it', 'that'];
  const needsClarification = obviouslyAmbiguous.has(msg)
    || (routeId === 'J-L1'
      && vagueInvestigations.some((phrase) => msg.includes(phrase))
      && referentialWords.some((word) => msg.includes(word))
      && msg.length <= 20);

  if (needsClarification) {
    return {
      status: 'needs_clarification',
      text: 'Clarification required: the request is too referential to lock a safe route.',
      whatCountsAsDone: [
        'The user clarifies the exact target, outcome, or comparison frame.',
        'A route can be selected without guessing hidden intent.',
      ],
      whatDoesNotCountAsDone: [
        'Guessing what “this” or “这个” refers to.',
        'Picking a route and progressing anyway just because a plausible interpretation exists.',
      ],
      nonDegradableRequirements: [
        'Do not guess the user intent when the core meaning is not locked.',
      ],
    };
  }

  return {
    status: 'locked',
    text: `Locked goal: ${raw || route.description}`,
    whatCountsAsDone: [
      route.description,
      ...buildRouteDoneCriteria(route, 'locked'),
    ],
    whatDoesNotCountAsDone: [route.antiShallowBar],
    nonDegradableRequirements: [route.antiShallowBar],
  };
}

function buildTaskDocument(message, routeId, route, semanticLock) {
  const finalGoal = semanticLock.status === 'locked'
    ? semanticLock.text.replace(/^Locked goal:\s*/, '')
    : 'Clarify the user intent before continuing with managed routing.';

  return [
    '# Task',
    '',
    'Global Plan Version: v1.0',
    '',
    '## Final Goal',
    '',
    finalGoal,
    '',
    '## Semantic Lock',
    '',
    semanticLock.text,
    '',
    '## What Counts As Done',
    '',
    formatSection(semanticLock.whatCountsAsDone),
    '',
    '## What Does Not Count As Done',
    '',
    formatSection(semanticLock.whatDoesNotCountAsDone),
    '',
    '## Non-Degradable Requirements Summary',
    '',
    formatSection(semanticLock.nonDegradableRequirements),
    '',
    '## Done Criteria',
    '',
    formatSection(buildRouteDoneCriteria(route, semanticLock.status)),
    '',
    '## Non-Goals',
    '',
    formatSection([
      'Do not silently widen the route beyond the locked task type.',
      'Do not treat placeholder artifacts as completed deliverables.',
    ]),
    '',
    '## Hard Constraints',
    '',
    formatSection([
      'Harness runtime remains authoritative for route state artifacts.',
      'Deferred progression must happen via /plan, /drive, and /check only.',
    ]),
    '',
    '## Global Phase Structure',
    '',
    'Phase G1: Intake and route lock',
    '- Purpose: Capture the request, lock the meaning, and write authoritative state artifacts.',
    '- Boundary: Intake always writes state first; default mode may auto-dispatch the first legal actor after intake, while --manual stops here.',
    `- Done condition: Semantic lock is ${semanticLock.status} and intake artifacts are synchronized.`,
    '',
    'Phase G2: Deferred progression',
    '- Purpose: Advance the selected route through planning, execution, and acceptance only after intake is stable.',
    '- Boundary: No silent one-transaction auto-completion.',
    '- Done condition: Required actors and deliverables for the locked route are complete.',
    '',
    '## Product Spec Pointer',
    '',
    '(For product work) Full product contract in: `.agent-memory/product-spec.md`',
    '',
    `<!-- route:${routeId} semantic-lock:${semanticLock.status} -->`,
  ].join('\n');
}

function buildRoutePacket(routeId, route, state) {
  return buildRoutePacketProjection(routeId, {
    ...route,
    startupFiles: route.startupFiles,
    deliverables: route.deliverables,
    probes: route.probes,
  }, {
    ...state,
    selectedCapabilityHands: state?.selectedCapabilityHands || route.capability,
    selectedProbes: state?.selectedProbes || route.probes,
  });
}

function requiredManagersForRoute(route) {
  return unique([...(route?.managers || []), 'summary-manager']);
}

function determineActiveAgent(input) {
  return input?.agent || input?.body?.agent || "";
}

function isHarnessAgent(agent) {
  return HARNESS_AGENTS.has(agent) || CAPABILITY_AGENTS.has(agent) || PROBE_AGENTS.has(agent);
}

function routeIdForCommand(command, message = '') {
  const normalized = normalizeCommandName(command);
  if (normalized === 'plan') return 'C-M1';
  if (normalized === 'drive') return 'C-M1';
  if (normalized === 'check') return 'J-L1';
  return classifyTask(message);
}

function logicalActorForSession(state, sessionID = '') {
  if (!state || !sessionID) return '';
  const authorizedActor = actorForAuthorizedSession(state, sessionID);
  if (authorizedActor) return authorizedActor;
  if (state.activeDispatch?.sessionID === sessionID && state.activeDispatch?.actor) return state.activeDispatch.actor;
  if (state.sessionID === sessionID) return state.activeAgent || 'harness-orchestrator';
  return actorForSession(state, sessionID);
}

function logicalActorForInput(state, input) {
  const sessionActor = logicalActorForSession(state, chatMessageSessionID(input));
  return sessionActor || determineActiveAgent(input) || '';
}

function actorForSession(state, sessionID = '') {
  if (!state || !sessionID) return '';
  const authorizedActor = actorForAuthorizedSession(state, sessionID);
  if (authorizedActor) return authorizedActor;
  if (state?.stepRuntime) return '';
  const child = state.childDispatchSessionIDs || {};
  if ((child.planning || []).includes(sessionID)) {
    if (state.activeDispatch?.sessionID === sessionID && state.activeDispatch?.actor) return state.activeDispatch.actor;
    return state.pendingManagers?.[0] || 'planning-manager';
  }
  if ((child.execution || []).includes(sessionID)) return 'execution-manager';
  if ((child.acceptance || []).includes(sessionID)) return 'acceptance-manager';
  if ((child.summary || []).includes(sessionID)) return 'summary-manager';
  for (const [actor, sessions] of Object.entries(child.capabilityHands || {})) {
    if ((sessions || []).includes(sessionID)) return actor;
  }
  for (const [actor, sessions] of Object.entries(child.probes || {})) {
    if ((sessions || []).includes(sessionID)) return actor;
  }
  if ((child.acceptanceClosure || []).includes(sessionID)) return 'acceptance-manager';
  return '';
}

function buildDispatchBlock(state = null) {
  const actor = state?.nextExpectedActor;
  if (!actor || actor === 'none' || actor === 'harness-orchestrator') return [];

  const isPendingManager = (state?.pendingManagers || []).includes(actor);
  if (!isPendingManager) return [];

  const skills = MANAGER_SKILLS[actor] || [];
  const description = `Harness dispatch: ${actor} role`;
  const prompt = buildManagerDispatchPromptInline(actor, state);

  return [
    `DISPATCH NOW: ${actor} has not been dispatched yet.`,
    `You MUST call task() with these EXACT parameters:`,
    '',
    `task(subagent_type="general",`,
    `     description="${description}",`,
    `     run_in_background=true,`,
    `     load_skills=["${skills.join('", "')}"],`,
    `     prompt="${prompt}")`,
    '',
    `AFTER calling task(): your turn is OVER. The subagent will complete the ${actor} role.`,
    `Do NOT call any other tools after task().`,
  ];
}

function buildManagerDispatchPromptInline(managerName, state) {
  const skills = MANAGER_SKILLS[managerName] || [];
  return `You are being dispatched as ${managerName}. `
    + `Route: ${state?.routeId || 'unknown'}. Task: ${state?.rawUserInput || 'see .agent-memory/task.md'}. `
    + `Skill stack: ${skills.join(', ') || 'none'}. `
    + `Read .agent-memory/task.md and .agent-memory/orchestration-status.md first, `
    + `then write the manager contract files. `
    + `When done, end your response with: HARNESS_COMPLETE {"status":"done","summary":"${managerName} completed their work"}`;
}

function buildSystemAdditions(agent, state = null) {
  if (agent === "harness-orchestrator") {
    if (state?.blocked) {
      return [
        "[harness-mode] HARNESS ROUTE IS BLOCKED.",
        `Reason: ${state.blockedReason || 'unknown'}`,
      ];
    }
    if (state?.deferredDispatchState === 'retryable_error') {
      return [
        "[harness-mode] HARNESS ROUTE IS IN RETRYABLE ERROR.",
        `Last error: ${state.lastDispatchError?.message || 'unknown'}`,
      ];
    }
    const intakeOnlyLines = state?.currentPhase === 'intake'
      ? [
          'The Harness plugin has already completed intake and written the route packet.',
          'Your ONLY job now: read .agent-memory/task.md and .agent-memory/route-packet.json, then dispatch the actors below.',
          'After you call task(), your turn is DONE. Do NOT implement, analyze, or explore code.',
        ]
      : [];

    const dispatchBlock = state?.autopilotEnabled ? buildDispatchBlock(state) : [];

    return [
      "[harness-mode] HARNESS MODE IS ACTIVE. You are THE DISPATCHER ONLY.",
      "You must NOT implement features, read business code, write code, or explore the codebase yourself.",
      "You create a route packet, dispatch managers/hands/probes via task() calls, then supervise via summary files.",
      "Delegated roles cannot complete without your accepted review after subagent returns.",
      "Self-completion by top-level identity (main, harness-orchestrator, etc.) is blocked.",
      ...intakeOnlyLines,
      ...dispatchBlock,
      "If the dispatch instruction above is empty, the route is blocked — report this to the user.",
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
  if (agent === "summary-manager") {
    return ["[harness-manager] You are summary-manager. Own final synthesis: consume progress and handoff signals, write final-summary.md and handoff-summary.md, then complete without doing implementation."];
  }
  return [];
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
    'final-summary.md': '# Final Summary\n\n',
    'handoff-summary.md': '# Handoff Summary\n\n',
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
  for (const jsonl of ['progress-events.jsonl', 'handoff-events.jsonl', 'completion-events.jsonl']) {
    const f = path.join(memoryDir, jsonl);
    if (!(await exists(f))) await writeText(f, '');
  }

  const reviewsDir = path.join(memoryDir, 'orchestrator-reviews');
  const delegationsDir = path.join(memoryDir, 'delegations');
  const sessionsDir = path.join(memoryDir, 'sessions');
  await ensureDir(reviewsDir);
  await ensureDir(delegationsDir);
  await ensureDir(sessionsDir);

  const initScript = path.join(workspace, 'init.sh');
  if (!(await exists(initScript))) {
    await writeText(initScript, '#!/usr/bin/env bash\n\nset -euo pipefail\n\ncd "$(dirname "$0")"\n\necho "Customize init.sh for this project before relying on autonomous startup."\n');
  }

  const progressFile = path.join(workspace, 'claude-progress.txt');
  if (!(await exists(progressFile))) {
    await writeText(progressFile, `=== Session 1 (${nowIso()}) ===\nCompleted:\nWorking on:\nBlocked:\nNotes:\n`);
  }
}

export async function initializeHarnessTask(workspace, message, agent, routeIdOverride = '', autopilotEnabled = true) {
  await initMemoryScaffold(workspace);
  const routeId = routeIdOverride || classifyTask(message);
  const route = routeConfig(routeId);
  const requiredManagers = requiredManagersForRoute(route);
  const semanticLock = resolveSemanticLock(message, routeId, route);
  const reqId = requestId();
  const completedDeliverables = await detectCompletedDeliverables(workspace, route);
  const selectedCapabilityHands = selectCapabilityHands({ routeId, rawUserInput: message, requiredCapabilityHands: route.capability });
  const selectedProbes = selectProbes({ routeId, rawUserInput: message, requiredProbes: route.probes });
  const state = ensureGraphState({
    version: 1,
    mode: 'harness',
    activeAgent: agent,
    requestId: reqId,
    routeId,
    taskType: route.taskType,
    flowTier: route.flowTier,
    currentPhase: semanticLock.status === 'locked' ? 'intake' : 'blocked',
    nextExpectedActor: semanticLock.status === 'locked' ? deriveNextExpectedActor({ compat: undefined, nextExpectedActor: undefined, pendingManagers: requiredManagers }) : 'none',
    requiredManagers,
    pendingManagers: [...requiredManagers],
    dispatchedManagers: [],
    requiredCapabilityHands: route.capability,
    selectedCapabilityHands,
    pendingCapabilityHands: [...selectedCapabilityHands],
    dispatchedCapabilityHands: [],
    requiredProbes: route.probes,
    selectedProbes,
    pendingProbes: [...selectedProbes],
    dispatchedProbes: [],
    completedDeliverables,
    deferredDispatchState: semanticLock.status === 'locked' ? 'ready' : 'blocked',
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
    blocked: semanticLock.status !== 'locked',
    blockedReason: semanticLock.status !== 'locked' ? semanticLock.text : '',
    semanticLockStatus: semanticLock.status,
    semanticLockText: semanticLock.text,
    autopilotEnabled: Boolean(autopilotEnabled && semanticLock.status === 'locked'),
    graphRuntimeRollout: createGraphRuntimeRollout({
      mode: autopilotEnabled && semanticLock.status === 'locked' ? 'bounded-concurrency' : 'serial-compat',
    }),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    rawUserInput: message,
  });
  const routePacket = buildRoutePacket(routeId, route, state);
  await savePluginState(workspace, state);
  await writeText(path.join(workspace, '.agent-memory', 'task.md'), buildTaskDocument(message, routeId, route, semanticLock));
  await writeText(path.join(workspace, '.agent-memory', 'route-packet.json'), JSON.stringify(routePacket, null, 2) + '\n');
  const inboxFile = path.join(workspace, '.agent-memory', 'inbox', `${reqId}.md`);
  await writeText(inboxFile, `# ${reqId}\n\n## Original request\n\n${message}\n`);
  await appendText(path.join(workspace, '.agent-memory', 'inbox', 'index.jsonl'), JSON.stringify({ id: reqId, routeId, createdAt: state.createdAt }) + '\n');
  await writeText(path.join(workspace, '.agent-memory', 'orchestration-status.md'), buildStatusProjection(state, routePacket));
  await writeText(path.join(workspace, '.agent-memory', 'brain-brief.md'), `# Brain Brief\n\n- Request ID: ${reqId}\n- Goal: ${message}\n- Route: ${routeId}\n- Semantic lock: ${state.semanticLockStatus}\n- Next expected actor: ${state.nextExpectedActor}\n`);
  await writeText(path.join(workspace, '.agent-memory', 'route-summary.md'), `# Route Summary\n\n- Route ID: ${routeId}\n- Task Type: ${route.taskType}\n- Semantic Lock Status: ${state.semanticLockStatus}\n- Managers: ${route.managers.join(', ') || 'none'}\n- Hands: ${route.capability.join(', ') || 'none'}\n- Selected Hands: ${state.selectedCapabilityHands.join(', ') || 'none'}\n- Probes: ${route.probes.join(', ') || 'none'}\n- Selected Probes: ${state.selectedProbes.join(', ') || 'none'}\n- Deliverables: ${route.deliverables.join(', ') || 'none'}\n`);
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

async function reconcileHarnessRuntime(context) {
  return await reconcileRuntime({
    ...context,
    options: {
      ...(context.options || {}),
      budgets: rolloutBudgetsForState(context.state, context.options?.budgets || {}),
    },
  });
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
  await writeText(path.join(workspace, '.agent-memory', 'task.md'), buildTaskDocument(state.rawUserInput || '', state.routeId, route, {
    status: state.semanticLockStatus || 'locked',
    text: state.semanticLockText || `Locked goal: ${state.rawUserInput || route.description}`,
    whatCountsAsDone: [route.description, ...buildRouteDoneCriteria(route, state.semanticLockStatus || 'locked')],
    whatDoesNotCountAsDone: [route.antiShallowBar],
    nonDegradableRequirements: [route.antiShallowBar],
  }));
  await writeText(path.join(workspace, '.agent-memory', 'route-packet.json'), JSON.stringify(routePacket, null, 2) + '\n');
  await writeText(path.join(workspace, '.agent-memory', 'orchestration-status.md'), buildStatusProjection(state, routePacket));
}

async function syncManagedAgentIndex(workspace) {
  const { state } = await loadPluginState(workspace);
  if (!state) return;
  const indexPath = path.join(workspace, '.agent-memory', 'managed-agent-state-index.json');
  const index = buildManagedAgentIndexProjection(state, { lastUpdated: nowIso() });
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

async function guardOrchestratorTaskDispatch(workspace, hookInput, toolArgs, currentAgent) {
  const { state } = await loadPluginState(workspace);
  if (!state || currentAgent !== 'harness-orchestrator') return;
  const toolName = lower(hookInput.tool);
  if (toolName !== 'task') return;

  const subagentType = String((toolArgs.subagent_type || toolArgs.agent) || '').toLowerCase();
  if (!subagentType) return;

  const allowedHarnessAgents = new Set([
    ...HARNESS_AGENTS,
    ...CAPABILITY_AGENTS,
    ...PROBE_AGENTS,
    "general",  // orchestrator dispatches managers via subagent_type="general"
  ]);

  if (!allowedHarnessAgents.has(subagentType)) {
    await appendPluginDebug(workspace, 'tool.blocked.orchestrator_unauthorized_task', {
      tool: toolName,
      subagentType,
      routeId: state.routeId,
    });
    throw new Error(`Harness plugin blocked this dispatch: harness-orchestrator may only dispatch known harness agents, not "${subagentType}".`);
  }
}

async function requireHarnessManagerDispatch(workspace, tool, args, currentAgent) {
  const { state } = await loadPluginState(workspace);
  if (!state || currentAgent !== 'harness-orchestrator') return;
  const toolName = lower(tool);

  if (toolName === 'task') {
    const subagentType = String((args?.subagent_type || args?.agent) || '').toLowerCase();
    const target = [...MANAGER_AGENTS, ...CAPABILITY_AGENTS, ...PROBE_AGENTS].find(a => subagentType.includes(a) || subagentType === 'general');
    if (target) {
      if (state.deferredDispatchState && (state.deferredDispatchState === 'idle' || state.deferredDispatchState === 'ready')) {
        return;
      }
    }
  }

  if (state.currentPhase === 'intake') {
    await appendPluginDebug(workspace, 'tool.blocked.during_intake', { tool: toolName, routeId: state.routeId, nextExpectedActor: state.nextExpectedActor });
    throw new Error('Harness plugin blocked this action: intake is already initialized; top-level harness-orchestrator must not continue tool work.');
  }
  if (state.mode === 'harness' && state.currentPhase !== 'complete' && state.deferredDispatchState && state.deferredDispatchState !== 'idle') {
    await appendPluginDebug(workspace, 'tool.blocked.while_deferred_route_active', { tool: toolName, routeId: state.routeId, currentPhase: state.currentPhase, deferredDispatchState: state.deferredDispatchState });
    throw new Error('Harness plugin blocked this action: top-level harness-orchestrator must not continue tool work while the deferred route is active.');
  }
  const hasPlanning = state.dispatchedManagers.includes('planning-manager');
  if (!hasPlanning && !MANAGER_AGENTS.has(toolName) && toolName !== 'task') {
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

async function guardInactiveChildActor(workspace, hookInput, currentAgent) {
  const { state } = await loadPluginState(workspace);
  if (!state || !currentAgent || currentAgent === 'harness-orchestrator') return;
  if (!isHarnessAgent(currentAgent)) return;

  const sessionID = chatMessageSessionID(hookInput);
  const authorization = authorizeDeferredChildActor(state, { agent: currentAgent, sessionID });
  if (authorization.authorized) return;

  throw new Error('Harness plugin blocked this action: only a live deferred child actor may continue tool work.');
}

async function guardUnknownToolDuringActiveHarnessRoute(workspace, hookInput, currentAgent) {
  const { state } = await loadPluginState(workspace);
  if (!state?.mode || state.mode !== 'harness') return;
  if (state.currentPhase === 'complete' || state.currentPhase === 'blocked') return;
  if (!currentAgent || isHarnessAgent(currentAgent)) return;

  await appendPluginDebug(workspace, 'tool.blocked.unknown_actor_while_route_active', {
    agent: currentAgent,
    sessionID: chatMessageSessionID(hookInput),
    routeId: state.routeId,
    currentPhase: state.currentPhase,
  });
  throw new Error('Harness plugin blocked this action: active harness routes only allow the top-level orchestrator or live dispatched child actors to use tools.');
}

async function appendEvent(workspace, event, payload = {}) {
  await appendText(path.join(workspace, '.agent-memory', 'activity.jsonl'), JSON.stringify({ event, ts: nowIso(), ...payload }) + '\n');
}

async function appendPluginDebug(workspace, label, payload = {}) {
  await appendText(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), `[${nowIso()}] ${label} ${JSON.stringify(payload)}\n`);
}

async function appendJsonlEvents(workspace, fileName, events = []) {
  for (const event of events || []) {
    await appendText(path.join(workspace, '.agent-memory', fileName), JSON.stringify(event) + '\n');
  }
}

async function recordStandardSignalsFromMessage(workspace, state, authorization, sessionID, message) {
  const parsed = parseStandardSignalEvents(message, {
    state,
    actor: authorization.actor,
    phase: authorization.phase,
    stepId: authorization.stepId,
    sessionID,
    at: nowIso(),
  });

  if (!parsed.hasSignals) {
    return { state, hasSignals: false, hasCompletion: false };
  }

  await appendJsonlEvents(workspace, 'progress-events.jsonl', parsed.progress);
  await appendJsonlEvents(workspace, 'handoff-events.jsonl', parsed.handoff);
  await appendJsonlEvents(workspace, 'completion-events.jsonl', parsed.completion);

  const nextState = applyStandardSignalEvents(state, parsed);
  await savePluginState(workspace, nextState);
  await syncManagedAgentIndex(workspace);
  await syncStatusFromState(workspace);
  await appendPluginDebug(workspace, 'standard.signals.recorded', {
    actor: authorization.actor,
    stepId: authorization.stepId,
    progress: parsed.progress.length,
    handoff: parsed.handoff.length,
    completion: parsed.completion.length,
  });

  return { state: nextState, hasSignals: true, hasCompletion: parsed.hasCompletion };
}

async function hasNonPlaceholderText(filePath, heading) {
  if (!(await exists(filePath))) return false;
  const text = await fs.readFile(filePath, 'utf8');
  const trimmed = text.trim();
  return Boolean(trimmed && trimmed !== `# ${heading}`);
}

async function ensureFinalSummaryArtifacts(workspace, state) {
  const finalPath = path.join(workspace, '.agent-memory', 'final-summary.md');
  const handoffPath = path.join(workspace, '.agent-memory', 'handoff-summary.md');
  const progress = state?.progressSignals || [];
  const handoffs = state?.handoffSignals || [];
  const completions = state?.completionSignals || [];
  const activeActors = [
    ...(state?.dispatchedManagers || []),
    ...(state?.dispatchedCapabilityHands || []),
    ...(state?.dispatchedProbes || []),
  ];

  if (!(await hasNonPlaceholderText(finalPath, 'Final Summary'))) {
    await writeText(finalPath, [
      '# Final Summary',
      '',
      `Request ID: ${state.requestId || 'unknown'}`,
      `Route ID: ${state.routeId || 'unknown'}`,
      `Task Type: ${state.taskType || 'unknown'}`,
      `Flow Tier: ${state.flowTier || 'unknown'}`,
      '',
      '## Participating Actors',
      '',
      formatSection(unique(activeActors)),
      '',
      '## Progress Signals',
      '',
      formatSignalList(progress),
      '',
      '## Handoff Signals',
      '',
      formatSignalList(handoffs),
      '',
      '## Completion Signals',
      '',
      formatSignalList(completions),
      '',
    ].join('\n'));
  }

  if (!(await hasNonPlaceholderText(handoffPath, 'Handoff Summary'))) {
    const blockers = unique(handoffs.flatMap((event) => event.blockers || []));
    const nextActions = unique(handoffs.flatMap((event) => event.nextActions || []));
    const artifacts = unique(handoffs.flatMap((event) => event.artifacts || []));
    await writeText(handoffPath, [
      '# Handoff Summary',
      '',
      `Request ID: ${state.requestId || 'unknown'}`,
      `Route ID: ${state.routeId || 'unknown'}`,
      '',
      '## Artifacts',
      '',
      formatSection(artifacts),
      '',
      '## Blockers',
      '',
      formatSection(blockers),
      '',
      '## Next Actions',
      '',
      formatSection(nextActions),
      '',
    ].join('\n'));
  }
}

async function createChildDispatchSession(client, workspace, state, actor, phase) {
  if (!client?.session?.create) {
    throw new Error(`child session creation is unavailable for ${actor}; concrete harness work must run in a subagent`);
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
    const bucket = actor === 'execution-manager'
      ? 'execution'
      : actor === 'acceptance-manager'
        ? 'acceptance'
        : actor === 'summary-manager'
          ? 'summary'
          : 'planning';
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

function activeDispatchMatches(state, agent, sessionID = '') {
  const authorization = authorizeDeferredChildActor(state, { agent, sessionID });
  if (authorization.authorized) return true;

  const activeDispatch = state?.activeDispatch;
  if (!activeDispatch) return false;
  if (activeDispatch.actor !== agent) return false;
  if (activeDispatch.sessionID && sessionID && activeDispatch.sessionID !== sessionID) return false;
  return true;
}

const FILE_WRITE_LOCK_LIVE_STATUSES = new Set(['dispatching', 'in_progress', 'waiting']);

function isGovernedWritePath(filePath = '') {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  return (
    normalized.includes('/.agent-memory/')
    || normalized.includes('.agent-memory/')
    || normalized.includes('/evidence/')
    || normalized.startsWith('evidence/')
  );
}

function normalizeFileWriteLockPath(workspace, filePath = '') {
  if (!filePath) return '';
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(workspace, filePath);
  return path.normalize(absolute);
}

function isLiveStep(state, stepId) {
  return FILE_WRITE_LOCK_LIVE_STATUSES.has(state?.stepRuntime?.[stepId]?.status || '');
}

function liveStepIdsForFileLocks(state) {
  return new Set(Object.keys(state?.stepRuntime || {}).filter((stepId) => isLiveStep(state, stepId)));
}

function pruneFileWriteLocks(state) {
  const liveStepIds = liveStepIdsForFileLocks(state);
  const nextLocks = {};
  for (const [filePath, lock] of Object.entries(state?.fileWriteLocks || {})) {
    if (lock?.stepId && liveStepIds.has(lock.stepId)) {
      nextLocks[filePath] = lock;
    }
  }
  return nextLocks;
}

function findLiveStepForActor(state, actor, sessionID = '') {
  const stepIds = [
    ...(state?.activeStepIds || []),
    ...Object.keys(state?.stepRuntime || {}),
  ];
  for (const stepId of Array.from(new Set(stepIds))) {
    if (!isLiveStep(state, stepId)) continue;
    const step = state?.graph?.steps?.[stepId];
    if (step?.actor !== actor) continue;
    const activeSessionID = state?.stepRuntime?.[stepId]?.activeSessionID || '';
    if (sessionID && activeSessionID && sessionID !== activeSessionID) continue;
    return { stepId, phase: step.kind, sessionID: activeSessionID };
  }
  return null;
}

function buildFileWriteLockBlock(actor, filePath, existingLock) {
  return [
    'File write lock blocked this write.',
    `Actor: ${actor}`,
    `File: ${filePath}`,
    `Current holder: ${existingLock.actor} (${existingLock.stepId})`,
    '',
    'This file is already owned by another live child step.',
    'Recovery:',
    '1. Write a different evidence file, or',
    '2. Send a HARNESS_HANDOFF event with your contribution, or',
    '3. Wait until the current holder completes.',
  ].join('\n');
}

function extractPatchFilePaths(patchText = '') {
  const paths = [];
  for (const line of String(patchText || '').split(/\r?\n/)) {
    const match = line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/);
    if (match?.[1]) paths.push(match[1].trim());
  }
  return paths;
}

function extractWriteTargetPaths(toolName = '', toolArgs = {}) {
  const targets = [];
  const addTarget = (value) => {
    if (Array.isArray(value)) {
      value.forEach(addTarget);
      return;
    }
    if (value) targets.push(String(value));
  };

  addTarget(toolArgs.file_path || toolArgs.path);
  for (const edit of toolArgs.edits || []) {
    addTarget(edit?.file_path || edit?.path);
  }

  if (['apply_patch', 'patch'].includes(toolName)) {
    targets.push(...extractPatchFilePaths(toolArgs.patch || toolArgs.content || toolArgs.input || ''));
  }

  return Array.from(new Set(targets.filter(Boolean)));
}

async function guardAndAcquireFileWriteLock(workspace, state, actor, sessionID, filePath, content = '') {
  if (!state?.mode || state.mode !== 'harness') return state;
  if (!actor || !isGovernedWritePath(filePath)) return state;
  if (String(content || '').includes('PHASE_GUARD_BYPASS')) return state;

  const lockPath = normalizeFileWriteLockPath(workspace, filePath);
  if (!lockPath) return state;

  const currentStep = findLiveStepForActor(state, actor, sessionID);
  if (!currentStep) return state;

  const locks = pruneFileWriteLocks(state);
  const existingLock = locks[lockPath];
  if (existingLock && existingLock.stepId !== currentStep.stepId) {
    throw new Error(buildFileWriteLockBlock(actor, lockPath, existingLock));
  }

  const nextState = {
    ...state,
    fileWriteLocks: {
      ...locks,
      [lockPath]: {
        actor,
        stepId: currentStep.stepId,
        phase: currentStep.phase,
        sessionID: currentStep.sessionID || sessionID || '',
        acquiredAt: existingLock?.acquiredAt || nowIso(),
      },
    },
  };
  await savePluginState(workspace, nextState);
  return nextState;
}

async function persistDeferredState(workspace, state) {
  const nextState = {
    ...state,
    fileWriteLocks: pruneFileWriteLocks(state),
  };
  await savePluginState(workspace, nextState);
  await syncManagedAgentIndex(workspace);
  await syncStatusFromState(workspace);
  return nextState;
}

async function managerArtifactCompletionReady(workspace, state, actor) {
  const route = routeConfig(state.routeId);
  const completedDeliverables = await detectCompletedDeliverables(workspace, route);
  if (actor === 'planning-manager') return completedDeliverables.includes('round-contract.md');
  if (actor === 'capability-planner') {
    return ['baseline-source.md', 'capability-map.md', 'gap-analysis.md'].every((name) => completedDeliverables.includes(name));
  }
  if (actor === 'feature-planner') {
    return ['product-spec.md', 'features.json', 'features-summary.md'].every((name) => completedDeliverables.includes(name));
  }
  return false;
}

function opencodeDbPath() {
  return process.env.OPENCODE_DB_PATH || path.join(os.homedir(), '.local/share/opencode', 'opencode.db');
}

function latestCompletedAssistantMessage(sessionID = '', startedAt = '') {
  if (!sessionID) return null;
  const startedAtMs = Number.isFinite(Date.parse(startedAt)) ? Date.parse(startedAt) : 0;
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(opencodeDbPath(), { readonly: true });
    const rows = db.prepare('SELECT data FROM message WHERE session_id = ? AND time_created >= ? ORDER BY time_created DESC LIMIT 25').all(sessionID, startedAtMs);
    for (const row of rows) {
      const data = JSON.parse(row.data || '{}');
      if (data.role !== 'assistant') continue;
      if (!data.time?.completed) continue;
      if (data.finish !== 'stop') continue;
      return data;
    }
  } catch {
    return null;
  } finally {
    try { db?.close(); } catch {}
  }
  return null;
}

async function maybeAdvanceFromToolActivity(client, workspace, state, hookInput) {
  const sessionID = chatMessageSessionID(hookInput);
  const agent = logicalActorForInput(state, hookInput);
  const authorization = authorizeDeferredChildActor(state, { agent, sessionID });
  if (!authorization.authorized) return state;

  const toolName = lower(hookInput.tool);
  let shouldComplete = false;
  if (authorization.phase === 'manager') {
    if (['planning-manager', 'capability-planner', 'feature-planner'].includes(agent)) {
      shouldComplete = await managerArtifactCompletionReady(workspace, state, agent);
    } else {
      shouldComplete = toolCountsAsChildProgress(toolName);
    }
    if (!shouldComplete) return state;
    await appendPluginDebug(workspace, 'deferred.manager.completed_from_tool', { actor: agent, tool: toolName, sessionID });
    return await reconcileHarnessRuntime({
      client,
      workspace,
      state,
      source: 'tool.execute.after',
      appendPluginDebug,
      completeDeferredManager,
      completeDeferredCapabilityHand,
      completeDeferredProbe,
      completeDeferredAcceptanceClosure,
      dispatchNextDeferredManager,
      dispatchNextDeferredHand,
      dispatchNextDeferredProbe,
      finalizeDeferredAcceptance,
      options: {
        completeActiveDispatch: true,
        completeStepId: authorization.stepId,
        completeActor: authorization.actor,
        completePhase: authorization.phase,
        completionSource: 'tool',
      },
    });
  }

  if (authorization.phase === 'capability-hand' && toolCountsAsChildProgress(toolName)) {
    await appendPluginDebug(workspace, 'deferred.hand.completed_from_tool', { actor: agent, tool: toolName, sessionID });
    return await reconcileHarnessRuntime({
      client,
      workspace,
      state,
      source: 'tool.execute.after',
      appendPluginDebug,
      completeDeferredManager,
      completeDeferredCapabilityHand,
      completeDeferredProbe,
      completeDeferredAcceptanceClosure,
      dispatchNextDeferredManager,
      dispatchNextDeferredHand,
      dispatchNextDeferredProbe,
      finalizeDeferredAcceptance,
      options: {
        completeActiveDispatch: true,
        completeStepId: authorization.stepId,
        completeActor: authorization.actor,
        completePhase: authorization.phase,
        completionSource: 'tool',
      },
    });
  }

  if (authorization.phase === 'probe' && toolCountsAsChildProgress(toolName)) {
    await appendPluginDebug(workspace, 'deferred.probe.completed_from_tool', { actor: agent, tool: toolName, sessionID });
    return await reconcileHarnessRuntime({
      client,
      workspace,
      state,
      source: 'tool.execute.after',
      appendPluginDebug,
      completeDeferredManager,
      completeDeferredCapabilityHand,
      completeDeferredProbe,
      completeDeferredAcceptanceClosure,
      dispatchNextDeferredManager,
      dispatchNextDeferredHand,
      dispatchNextDeferredProbe,
      finalizeDeferredAcceptance,
      options: {
        completeActiveDispatch: true,
        completeStepId: authorization.stepId,
        completeActor: authorization.actor,
        completePhase: authorization.phase,
        completionSource: 'tool',
      },
    });
  }

  if (authorization.phase === 'acceptance-closure' && toolCountsAsChildProgress(toolName)) {
    await appendPluginDebug(workspace, 'deferred.acceptance.closure.completed_from_tool', { actor: agent, tool: toolName, sessionID });
    return await reconcileHarnessRuntime({
      client,
      workspace,
      state,
      source: 'tool.execute.after',
      appendPluginDebug,
      completeDeferredManager,
      completeDeferredCapabilityHand,
      completeDeferredProbe,
      completeDeferredAcceptanceClosure,
      dispatchNextDeferredManager,
      dispatchNextDeferredHand,
      dispatchNextDeferredProbe,
      finalizeDeferredAcceptance,
      options: {
        completeActiveDispatch: true,
        completeStepId: authorization.stepId,
        completeActor: authorization.actor,
        completePhase: authorization.phase,
        completionSource: 'tool',
      },
    });
  }

  return state;
}

async function maybeAdvanceFromWorkspaceArtifacts(client, workspace, state) {
  if (!state?.activeDispatch) return state;
  if (state.activeDispatch.phase !== 'manager') return state;
  const actor = state.activeDispatch.actor;
  if (!['planning-manager', 'capability-planner', 'feature-planner'].includes(actor)) return state;

  const shouldComplete = await managerArtifactCompletionReady(workspace, state, actor);
  if (!shouldComplete) return state;

  await appendPluginDebug(workspace, 'deferred.manager.completed_from_workspace', { actor, sessionID: state.activeDispatch.sessionID || '' });
  return await reconcileHarnessRuntime({
    client,
    workspace,
    state,
    source: 'autopilot.watcher.workspace_artifacts',
    appendPluginDebug,
    completeDeferredManager,
    completeDeferredCapabilityHand,
    completeDeferredProbe,
    completeDeferredAcceptanceClosure,
    dispatchNextDeferredManager,
    dispatchNextDeferredHand,
    dispatchNextDeferredProbe,
    finalizeDeferredAcceptance,
    options: { completeActiveDispatch: true, completionSource: 'workspace-artifact' },
  });
}

async function maybeAdvanceFromSessionStore(client, workspace, state) {
  const liveSteps = listLiveDeferredSteps(state);
  for (const liveStep of liveSteps) {
    const completedMessage = latestCompletedAssistantMessage(liveStep.sessionID, state?.stepRuntime?.[liveStep.stepId]?.startedAt || state?.activeDispatch?.startedAt);
    if (!completedMessage) continue;

    if (liveStep.phase === 'manager') {
      await appendPluginDebug(workspace, 'deferred.manager.completed_from_session_store', { actor: liveStep.actor, sessionID: liveStep.sessionID });
    } else if (liveStep.phase === 'capability-hand') {
      await appendPluginDebug(workspace, 'deferred.hand.completed_from_session_store', { actor: liveStep.actor, sessionID: liveStep.sessionID });
    } else if (liveStep.phase === 'probe') {
      await appendPluginDebug(workspace, 'deferred.probe.completed_from_session_store', { actor: liveStep.actor, sessionID: liveStep.sessionID });
    } else if (liveStep.phase === 'acceptance-closure') {
      await appendPluginDebug(workspace, 'deferred.acceptance.closure.completed_from_session_store', { actor: liveStep.actor, sessionID: liveStep.sessionID });
    }

    return await reconcileHarnessRuntime({
      client,
      workspace,
      state,
      source: 'autopilot.watcher.session_store',
      appendPluginDebug,
      completeDeferredManager,
      completeDeferredCapabilityHand,
      completeDeferredProbe,
      completeDeferredAcceptanceClosure,
      dispatchNextDeferredManager,
      dispatchNextDeferredHand,
      dispatchNextDeferredProbe,
      finalizeDeferredAcceptance,
      options: {
        completeActiveDispatch: true,
        completeStepId: liveStep.stepId,
        completeActor: liveStep.actor,
        completePhase: liveStep.phase,
        completionSource: 'session-store',
      },
    });
  }

  return state;
}

function ensureAutopilotWatcher(client, workspace) {
  if (AUTOPILOT_WATCHERS.has(workspace)) return;
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      if (!(await exists(path.join(workspace, '.agent-memory', 'harness-plugin-state.json')))) {
        clearInterval(timer);
        AUTOPILOT_WATCHERS.delete(workspace);
        return;
      }
      const { state } = await loadPluginState(workspace);
      if (!state?.autopilotEnabled || (state.activeStepIds || []).length === 0) return;
      const afterSessionStore = await maybeAdvanceFromSessionStore(client, workspace, state);
      if (afterSessionStore !== state) return;
      await maybeAdvanceFromWorkspaceArtifacts(client, workspace, state);
    } catch {
      // Keep the watcher best-effort; hook-driven paths remain authoritative when available.
    } finally {
      running = false;
    }
  }, 200);
  timer.unref?.();
  AUTOPILOT_WATCHERS.set(workspace, timer);
}

async function autoDispatchManager(client, workspace, state, managerName) {
  if (!client || !state || !managerName) return state;
  const { sessionID: targetSessionID } = await createChildDispatchSession(client, workspace, state, managerName, 'manager');
  const skills = MANAGER_SKILLS[managerName] || [];
  const prompt = buildManagerDispatchPrompt(managerName, state, skills);
  await client.session.promptAsync({
    path: { id: targetSessionID },
    query: { directory: workspace },
    body: {
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
  const prompt = buildCapabilityHandDispatchPrompt(capabilityName, state);
  await client.session.promptAsync({
    path: { id: targetSessionID },
    query: { directory: workspace },
    body: {
      parts: [{ type: 'text', text: prompt }]
    }
  });
  return {
    targetSessionID,
    phase: 'capability-hand',
    actor: capabilityName,
  };
}

async function autoDispatchProbe(client, workspace, state, probeName = 'artifact-probe-agent') {
  if (!client || !state) return state;
  const { sessionID: targetSessionID } = await createChildDispatchSession(client, workspace, state, probeName, 'probe');
  const prompt = buildProbeDispatchPrompt(probeName, state);
  await client.session.promptAsync({
    path: { id: targetSessionID },
    query: { directory: workspace },
    body: {
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
  const prompt = buildAcceptanceClosurePrompt(state);
  await client.session.promptAsync({
    path: { id: targetSessionID },
    query: { directory: workspace },
    body: {
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
  const persisted = await loadPluginState(workspace);
  const latestState = persisted?.state || state;
  const activeSteps = (latestState.activeStepIds || []).map((stepId) => latestState?.graph?.steps?.[stepId]).filter(Boolean);
  const hasNonHandActiveStep = activeSteps.some((step) => step.kind !== 'capability-hand');
  const hasNonProbeActiveStep = activeSteps.some((step) => step.kind !== 'probe');
  const hasExclusiveActiveStep = phase === 'capability-hand'
    ? hasNonHandActiveStep
    : phase === 'probe'
      ? hasNonProbeActiveStep
      : activeSteps.length > 0;
  const allowConcurrentHand = phase === 'capability-hand' && !hasNonHandActiveStep;
  const allowConcurrentProbe = phase === 'probe' && !hasNonProbeActiveStep;
  const stepId = stepIdForActorPhase(latestState, actor, phase);

  if ((latestState.activeStepIds || []).includes(stepId)) {
    await appendPluginDebug(workspace, 'deferred.dispatch.duplicate_skipped', {
      routeId: latestState.routeId,
      requestId: latestState.requestId,
      activeDispatch: latestState.activeDispatch,
      requestedActor: actor,
      requestedPhase: phase,
      reason: 'step_already_live',
    });
    return { state: latestState, skipped: true };
  }

  if ((latestState.activeDispatch && !allowConcurrentHand && !allowConcurrentProbe) || hasExclusiveActiveStep) {
    await appendPluginDebug(workspace, 'deferred.dispatch.duplicate_skipped', {
      routeId: latestState.routeId,
      requestId: latestState.requestId,
      activeDispatch: latestState.activeDispatch,
      requestedActor: actor,
      requestedPhase: phase,
    });
    return { state: latestState, skipped: true };
  }

  const activeDispatch = {
    actor,
    phase,
    stepId,
    startedAt: nowIso(),
  };
  const nextState = markStepInProgress({
    ...latestState,
    activeDispatch,
  }, { stepId, startedAt: activeDispatch.startedAt });
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
  const nextState = recordStepRetryableError(state, {
    stepId: stepIdForActorPhase(state, actor, phase),
    message: String(error?.message || error),
    at: nowIso(),
  });
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

async function dispatchNextDeferredManager(client, workspace, state, requestedManager = null) {
  if (!client || !state) return state;
  const manager = requestedManager || [...(state.pendingManagers || [])][0];
  if (!manager) return state;
  const begun = await beginDeferredDispatch(workspace, state, manager, 'manager');
  if (begun.skipped) return begun.state;
  state = begun.state;
  const pendingManagers = [...(state.pendingManagers || [])];
  let dispatch: Awaited<ReturnType<typeof autoDispatchManager>>;
  try {
    dispatch = await autoDispatchManager(client, workspace, state, manager);
  } catch (error) {
    return await recordDeferredDispatchError(workspace, state, manager, 'manager', error);
  }
  const nextState = {
    ...state,
    childDispatchSessionIDs: recordChildDispatchSession(state, dispatch.actor, dispatch.phase, dispatch.targetSessionID),
    activeDispatch: {
      ...state.activeDispatch,
      actor: manager,
      phase: 'manager',
      stepId: stepIdForActorPhase(state, manager, 'manager'),
      sessionID: dispatch.targetSessionID,
      startedAt: state.activeDispatch?.startedAt || nowIso(),
    },
    stepRuntime: {
      ...(state.stepRuntime || {}),
      [stepIdForActorPhase(state, manager, 'manager')]: {
        ...(state.stepRuntime?.[stepIdForActorPhase(state, manager, 'manager')] || {}),
        activeSessionID: dispatch.targetSessionID,
        lastProgressAt: nowIso(),
      },
    },
    dispatchedManagers: Array.from(new Set([...(state.dispatchedManagers || []), manager])),
    currentPhase: completedManagerPhase(manager),
    nextExpectedActor: deriveNextExpectedActor({ ...state, compat: undefined, nextExpectedActor: undefined, activeDispatch: { ...state.activeDispatch, actor: manager, phase: 'manager', stepId: stepIdForActorPhase(state, manager, 'manager') }, pendingManagers: state.pendingManagers, pendingCapabilityHands: state.pendingCapabilityHands, pendingProbes: state.pendingProbes }),
    deferredDispatchState: 'manager_in_progress',
    lastDispatchError: null,
  };
  await persistDeferredState(workspace, nextState);
  await appendEvent(workspace, 'manager.dispatch.requested', { manager, requestId: state.requestId, routeId: state.routeId });
  await appendPluginDebug(workspace, 'deferred.manager.dispatch.requested', { manager, requestId: state.requestId, remainingManagers: pendingManagers });
  return nextState;
}

async function dispatchNextDeferredHand(client, workspace, state, requestedCapabilityName = null) {
  if (!client || !state) return state;
  const capabilityName = requestedCapabilityName || [...(state.pendingCapabilityHands || [])][0];
  if (!capabilityName) return state;
  const begun = await beginDeferredDispatch(workspace, state, capabilityName, 'capability-hand');
  if (begun.skipped) return begun.state;
  state = begun.state;
  const pendingCapabilityHands = [...(state.pendingCapabilityHands || [])];
  let dispatch: Awaited<ReturnType<typeof autoDispatchCapabilityHand>>;
  try {
    dispatch = await autoDispatchCapabilityHand(client, workspace, state, capabilityName);
  } catch (error) {
    return await recordDeferredDispatchError(workspace, state, capabilityName, 'capability-hand', error);
  }
  const nextState = {
    ...state,
    childDispatchSessionIDs: recordChildDispatchSession(state, dispatch.actor, dispatch.phase, dispatch.targetSessionID),
    activeDispatch: {
      ...state.activeDispatch,
      actor: capabilityName,
      phase: 'capability-hand',
      stepId: stepIdForActorPhase(state, capabilityName, 'capability-hand'),
      sessionID: dispatch.targetSessionID,
      startedAt: state.activeDispatch?.startedAt || nowIso(),
    },
    stepRuntime: {
      ...(state.stepRuntime || {}),
      [stepIdForActorPhase(state, capabilityName, 'capability-hand')]: {
        ...(state.stepRuntime?.[stepIdForActorPhase(state, capabilityName, 'capability-hand')] || {}),
        activeSessionID: dispatch.targetSessionID,
        lastProgressAt: nowIso(),
      },
    },
    dispatchedCapabilityHands: Array.from(new Set([...(state.dispatchedCapabilityHands || []), capabilityName])),
    currentPhase: 'execution',
    nextExpectedActor: deriveNextExpectedActor({ ...state, compat: undefined, nextExpectedActor: undefined, activeDispatch: { ...state.activeDispatch, actor: capabilityName, phase: 'capability-hand', stepId: stepIdForActorPhase(state, capabilityName, 'capability-hand') }, pendingManagers: state.pendingManagers, pendingCapabilityHands: state.pendingCapabilityHands, pendingProbes: state.pendingProbes }),
    deferredDispatchState: 'hand_in_progress',
    lastDispatchError: null,
  };
  await persistDeferredState(workspace, nextState);
  await appendEvent(workspace, 'capability.dispatch.requested', { capability: capabilityName, requestId: state.requestId, routeId: state.routeId });
  await appendPluginDebug(workspace, 'deferred.hand.dispatch.requested', { capability: capabilityName, requestId: state.requestId, remainingCapabilityHands: pendingCapabilityHands });
  return nextState;
}

async function dispatchNextDeferredProbe(client, workspace, state, requestedProbeName = null) {
  if (!client || !state) return state;
  const probeName = requestedProbeName || [...(state.pendingProbes || [])][0];
  if (!probeName) return state;
  const begun = await beginDeferredDispatch(workspace, state, probeName, 'probe');
  if (begun.skipped) return begun.state;
  state = begun.state;
  const pendingProbes = [...(state.pendingProbes || [])];
  let dispatch: Awaited<ReturnType<typeof autoDispatchProbe>>;
  try {
    dispatch = await autoDispatchProbe(client, workspace, state, probeName);
  } catch (error) {
    return await recordDeferredDispatchError(workspace, state, probeName, 'probe', error);
  }
  const nextState = {
    ...state,
    childDispatchSessionIDs: recordChildDispatchSession(state, dispatch.actor, dispatch.phase, dispatch.targetSessionID),
    activeDispatch: {
      ...state.activeDispatch,
      actor: probeName,
      phase: 'probe',
      stepId: stepIdForActorPhase(state, probeName, 'probe'),
      sessionID: dispatch.targetSessionID,
      startedAt: state.activeDispatch?.startedAt || nowIso(),
    },
    stepRuntime: {
      ...(state.stepRuntime || {}),
      [stepIdForActorPhase(state, probeName, 'probe')]: {
        ...(state.stepRuntime?.[stepIdForActorPhase(state, probeName, 'probe')] || {}),
        activeSessionID: dispatch.targetSessionID,
        lastProgressAt: nowIso(),
      },
    },
    dispatchedProbes: Array.from(new Set([...(state.dispatchedProbes || []), probeName])),
    currentPhase: 'probe-verification',
    nextExpectedActor: deriveNextExpectedActor({ ...state, compat: undefined, nextExpectedActor: undefined, activeDispatch: { ...state.activeDispatch, actor: probeName, phase: 'probe', stepId: stepIdForActorPhase(state, probeName, 'probe') }, pendingManagers: state.pendingManagers, pendingCapabilityHands: state.pendingCapabilityHands, pendingProbes: state.pendingProbes }),
    deferredDispatchState: 'probe_in_progress',
    lastDispatchError: null,
  };
  await persistDeferredState(workspace, nextState);
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
    const blockedAt = nowIso();
    const baseState = {
      ...recordStepRetryableError(state, {
        stepId: stepIdForActorPhase(state, 'acceptance-manager', 'acceptance-closure'),
        message: `missing deliverables: ${missingDeliverables.join(', ')}`,
        at: blockedAt,
      }),
      activeDispatch: null,
      completedDeliverables,
      deferredDispatchState: 'retryable_error',
      lastDispatchError: {
        actor: 'acceptance-manager',
        phase: 'acceptance-closure',
        message: `missing deliverables: ${missingDeliverables.join(', ')}`,
        at: blockedAt,
      },
      currentPhase: 'acceptance',
    };
    const nextState = {
      ...baseState,
      nextExpectedActor: 'acceptance-manager',
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
  let dispatch: Awaited<ReturnType<typeof autoDispatchAcceptanceClosure>>;
  try {
    dispatch = await autoDispatchAcceptanceClosure(client, workspace, state);
  } catch (error) {
    return await recordDeferredDispatchError(workspace, state, 'acceptance-manager', 'acceptance-closure', error);
  }
  const nextState = {
    ...state,
    childDispatchSessionIDs: recordChildDispatchSession(state, dispatch.actor, dispatch.phase, dispatch.targetSessionID),
    activeDispatch: {
      ...state.activeDispatch,
      actor: 'acceptance-manager',
      phase: 'acceptance-closure',
      stepId: stepIdForActorPhase(state, 'acceptance-manager', 'acceptance-closure'),
      sessionID: dispatch.targetSessionID,
      startedAt: state.activeDispatch?.startedAt || nowIso(),
    },
    stepRuntime: {
      ...(state.stepRuntime || {}),
      [stepIdForActorPhase(state, 'acceptance-manager', 'acceptance-closure')]: {
        ...(state.stepRuntime?.[stepIdForActorPhase(state, 'acceptance-manager', 'acceptance-closure')] || {}),
        activeSessionID: dispatch.targetSessionID,
        lastProgressAt: nowIso(),
      },
    },
    completedDeliverables,
    currentPhase: 'acceptance',
    nextExpectedActor: 'acceptance-manager',
    deferredDispatchState: 'acceptance_closure_in_progress',
    lastDispatchError: null,
  };
  await persistDeferredState(workspace, nextState);
  await appendPluginDebug(workspace, 'deferred.acceptance.closure.requested', { requestId: state.requestId, routeId: state.routeId });
  return nextState;
}

async function completeDeferredManager(workspace, state, managerName, completionSource = null) {
  const stepId = stepIdForActorPhase(state, managerName, 'manager');
  const completed = completeGraphStep(state, {
    stepId,
    source: completionSource || (state?.activeDispatch?.stepId === stepId ? 'chat' : 'session-store'),
  });
  if (!completed.changed) return completed.state;
  const pendingManagers = withoutFirst(completed.state.pendingManagers, managerName);
	  const nextState = {
	    ...completed.state,
	    pendingManagers,
	    activeDispatch: null,
	    currentPhase: completedManagerPhase(managerName),
    nextExpectedActor: deriveNextExpectedActor({ ...completed.state, compat: undefined, nextExpectedActor: undefined, activeDispatch: null, pendingManagers, pendingCapabilityHands: completed.state.pendingCapabilityHands, pendingProbes: completed.state.pendingProbes }),
    deferredDispatchState: 'ready',
	    lastCompletedActor: managerName,
	    lastDispatchError: null,
	  };
	  if (managerName === 'summary-manager') {
	    await ensureFinalSummaryArtifacts(workspace, nextState);
	  }
	  await persistDeferredState(workspace, nextState);
  await appendEvent(workspace, 'manager.completed', { manager: managerName, requestId: state.requestId, routeId: state.routeId });
  await appendPluginDebug(workspace, 'deferred.manager.completed', { manager: managerName, requestId: state.requestId, remainingManagers: pendingManagers });
  return nextState;
}

async function completeDeferredCapabilityHand(workspace, state, capabilityName, completionSource = null) {
  const stepId = stepIdForActorPhase(state, capabilityName, 'capability-hand');
  const completed = completeGraphStep(state, {
    stepId,
    source: completionSource || (state?.activeDispatch?.stepId === stepId ? 'chat' : 'session-store'),
  });
  if (!completed.changed) return completed.state;
  const pendingCapabilityHands = withoutFirst(completed.state.pendingCapabilityHands, capabilityName);
  const nextState = {
    ...completed.state,
    pendingCapabilityHands,
    activeDispatch: null,
    currentPhase: 'execution',
    nextExpectedActor: deriveNextExpectedActor({ ...completed.state, compat: undefined, nextExpectedActor: undefined, activeDispatch: null, pendingManagers: completed.state.pendingManagers, pendingCapabilityHands, pendingProbes: completed.state.pendingProbes }),
    deferredDispatchState: 'ready',
    lastCompletedActor: capabilityName,
    lastDispatchError: null,
  };
  await persistDeferredState(workspace, nextState);
  await appendEvent(workspace, 'capability.completed', { capability: capabilityName, requestId: state.requestId, routeId: state.routeId });
  await appendPluginDebug(workspace, 'deferred.hand.completed', { capability: capabilityName, requestId: state.requestId, remainingCapabilityHands: pendingCapabilityHands });
  return nextState;
}

async function completeDeferredProbe(workspace, state, probeName, completionSource = null) {
  const stepId = stepIdForActorPhase(state, probeName, 'probe');
  const completed = completeGraphStep(state, {
    stepId,
    source: completionSource || (state?.activeDispatch?.stepId === stepId ? 'chat' : 'session-store'),
  });
  if (!completed.changed) return completed.state;
  const pendingProbes = withoutFirst(completed.state.pendingProbes, probeName);
  const nextState = {
    ...completed.state,
    pendingProbes,
    activeDispatch: null,
    currentPhase: 'probe-verification',
    nextExpectedActor: deriveNextExpectedActor({ ...completed.state, compat: undefined, nextExpectedActor: undefined, activeDispatch: null, pendingManagers: completed.state.pendingManagers, pendingCapabilityHands: completed.state.pendingCapabilityHands, pendingProbes }),
    deferredDispatchState: 'ready',
    lastCompletedActor: probeName,
    lastDispatchError: null,
  };
  await persistDeferredState(workspace, nextState);
  await appendEvent(workspace, 'probe.completed', { probe: probeName, requestId: state.requestId, routeId: state.routeId });
  await appendPluginDebug(workspace, 'deferred.probe.completed', { probe: probeName, requestId: state.requestId, remainingProbes: pendingProbes });
  return nextState;
}

async function completeDeferredAcceptanceClosure(workspace, state, completionSource = null) {
  const route = routeConfig(state.routeId);
  const completedDeliverables = await detectCompletedDeliverables(workspace, route);
  const completed = completeGraphStep(state, {
    stepId: stepIdForActorPhase(state, 'acceptance-manager', 'acceptance-closure'),
    source: completionSource || (state?.activeDispatch?.phase === 'acceptance-closure' ? 'chat' : 'session-store'),
    deliverablesSatisfied: route.deliverables.every((name) => completedDeliverables.includes(name)),
  });
  if (!completed.changed) return completed.state;
  const nextState = {
    ...completed.state,
    activeDispatch: null,
    completedDeliverables,
    currentPhase: 'complete',
    nextExpectedActor: deriveNextExpectedActor({ ...completed.state, compat: undefined, nextExpectedActor: undefined, activeDispatch: null, currentPhase: 'complete', deferredDispatchState: 'complete', pendingManagers: completed.state.pendingManagers, pendingCapabilityHands: completed.state.pendingCapabilityHands, pendingProbes: completed.state.pendingProbes }),
    deferredDispatchState: 'complete',
    lastCompletedActor: 'acceptance-manager',
    lastDispatchError: null,
  };
  await persistDeferredState(workspace, nextState);
  await appendEvent(workspace, 'route.completed', { routeId: state.routeId, requestId: state.requestId });
  await appendPluginDebug(workspace, 'deferred.acceptance.closure.completed', { requestId: state.requestId, routeId: state.routeId });
  return nextState;
}

async function handleDeferredActorCompletion(client, workspace, state, hookInput, message) {
  const agent = logicalActorForInput(state, hookInput);
  const sessionID = chatMessageSessionID(hookInput);
  const authorization = authorizeDeferredChildActor(state, { agent, sessionID });
  if (!authorization.authorized) return state;
  if (isSyntheticAutoDispatchEcho(message)) {
    await appendPluginDebug(workspace, 'hook.chat.message.synthetic_ignored', { agent, sessionID, reason: 'auto-dispatch-echo' });
    return state;
  }

  const signalResult = await recordStandardSignalsFromMessage(workspace, state, authorization, sessionID, message);
  state = signalResult.state;
  if (signalResult.hasSignals && !signalResult.hasCompletion) {
    await appendPluginDebug(workspace, 'standard.signals.progress_only_no_completion', {
      actor: authorization.actor,
      stepId: authorization.stepId,
    });
    return state;
  }

  const actor = authorization.actor;
  const kind = actorKind(actor);
  if (actorRequiresDelegatedAgent(actor, kind)) {
    const validation = validateCompletion(actor, agent, state.activeDispatch?.assignedAgentId);
    if (!validation.ok) {
      await appendPluginDebug(workspace, 'review.completion_blocked', {
        actor,
        reason: validation.reason,
        completingAgent: agent,
      });
      await appendText(path.join(workspace, '.agent-memory', 'orchestrator-reviews', `${actor.replace(/[^a-zA-Z0-9_.:-]+/g, '_')}.blocked.json`), JSON.stringify({ actor, reason: validation.reason, ts: nowIso(), awaitingAcceptedReview: true }) + '\n');
      return state;
    }
  }

  return await reconcileHarnessRuntime({
    client,
    workspace,
    state,
    source: 'chat.message',
    appendPluginDebug,
    completeDeferredManager,
    completeDeferredCapabilityHand,
    completeDeferredProbe,
    completeDeferredAcceptanceClosure,
     dispatchNextDeferredManager,
      dispatchNextDeferredHand,
      dispatchNextDeferredProbe,
      finalizeDeferredAcceptance,
      options: {
        completeActiveDispatch: true,
        completeStepId: authorization.stepId,
        completeActor: authorization.actor,
        completePhase: authorization.phase,
        completionSource: 'chat',
      },
    });
}

async function advanceDeferredRouteOnce(client, workspace, state) {
  return await reconcileRuntime({
    client,
    workspace,
    state,
    source: 'advanceDeferredRouteOnce',
    appendPluginDebug,
    completeDeferredManager,
    completeDeferredCapabilityHand,
    completeDeferredProbe,
    completeDeferredAcceptanceClosure,
    dispatchNextDeferredManager,
    dispatchNextDeferredHand,
    dispatchNextDeferredProbe,
    finalizeDeferredAcceptance,
    options: { forceDispatch: true },
  });
}

export const server = async (input) => {
  const workspace = input.directory;
  const client = input.client;
  await ensureDir(path.join(workspace, '.agent-memory'));
  await appendPluginDebug(workspace, 'plugin.server.init', { directory: workspace, worktree: input.worktree, serverUrl: input.serverUrl.toString() });
  ensureAutopilotWatcher(client, workspace);
  return {
    config: async (config) => {
      config.plugin = config.plugin || [];
    },
    event: async ({ event }) => {
      if (event?.type === 'session.created') {
        await appendEvent(workspace, 'session.created', { type: event.type });
      }
    },
    "permission.ask": async (hookInput, output) => {
      const { state } = await loadPluginState(workspace);
      if (!state || state.mode !== 'harness') return;
      if (state.blocked) {
        output.status = 'deny';
        await appendPluginDebug(workspace, 'permission.denied.route_blocked', { routeId: state.routeId });
        return;
      }
      if (state.currentPhase === 'intake' && state.autopilotEnabled) {
        output.status = 'allow';
        return;
      }
    },
    "tool.definition": async (hookInput, output) => {
      const { state } = await loadPluginState(workspace);
      if (!state || state.mode !== 'harness') return;
      const agent = state.activeAgent || '';
      if (!isHarnessAgent(agent)) return;
      const toolID = String(hookInput.toolID || '');
      const phase = state.currentPhase || '';
      if (phase === 'acceptance' && ['edit', 'write', 'bash', 'task'].includes(toolID)) {
        output.description = (output.description || '') + ' [ACCEPTANCE: evidence collection only, no implementation]';
      }
    },
    "chat.params": async (hookInput, output) => {
      const { state } = await loadPluginState(workspace);
      if (!state || state.mode !== 'harness') return;
      if (state.currentPhase === 'planning') {
        output.temperature = 0.3;
        output.topP = 0.8;
      } else if (state.currentPhase === 'acceptance') {
        output.temperature = 0.2;
        output.topP = 0.7;
      }
    },
    "experimental.session.compacting": async (hookInput, output) => {
      const { state } = await loadPluginState(workspace);
      if (!state || state.mode !== 'harness') return;
      const routeInfo = [
        `[Harness] Route: ${state.routeId}, Phase: ${state.currentPhase}, Actor: ${state.nextExpectedActor || 'none'}`,
        `Pending managers: ${(state.pendingManagers || []).join(', ') || 'none'}`,
        `Dispatched managers: ${(state.dispatchedManagers || []).join(', ') || 'none'}`,
        `Selected hands: ${(state.selectedCapabilityHands || []).join(', ') || 'none'}`,
        `Selected probes: ${(state.selectedProbes || []).join(', ') || 'none'}`,
      ];
      output.context = output.context || [];
      output.context.push(...routeInfo);
      await appendPluginDebug(workspace, 'compaction.context.preserved', { routeId: state.routeId });
    },
    "experimental.compaction.autocontinue": async (hookInput, output) => {
      const { state } = await loadPluginState(workspace);
      if (!state || state.mode !== 'harness') return;
      if (state.currentPhase === 'acceptance' || state.currentPhase === 'complete') {
        output.enabled = false;
        await appendPluginDebug(workspace, 'compaction.autocontinue.disabled', { phase: state.currentPhase });
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
      const manualControl = command === 'control' && isManualHarnessMode(hookInput.arguments || '');
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
        if (state.blocked) return;
        const nextManager = state.pendingManagers?.[0] || '';
        if (['feature-planner', 'capability-planner', 'planning-manager'].includes(nextManager)) {
          state.sessionID = hookInput.sessionID;
          await savePluginState(workspace, state);
          await reconcileHarnessRuntime({
            client,
            workspace,
            state,
            source: 'command.execute.before',
            appendPluginDebug,
            completeDeferredManager,
            completeDeferredCapabilityHand,
            completeDeferredProbe,
            completeDeferredAcceptanceClosure,
            dispatchNextDeferredManager,
            dispatchNextDeferredHand,
            dispatchNextDeferredProbe,
            finalizeDeferredAcceptance,
            options: { forceDispatch: true, allowedKinds: ['manager'] },
          });
          return;
        }
      }

      if (command === 'drive' && state?.mode === 'harness') {
        if (state.blocked) return;
        const nextManager = state.pendingManagers?.[0] || '';
        state.sessionID = hookInput.sessionID;
        await savePluginState(workspace, state);
        if (nextManager === 'execution-manager') {
          await reconcileHarnessRuntime({
            client,
            workspace,
            state,
            source: 'command.execute.before',
            appendPluginDebug,
            completeDeferredManager,
            completeDeferredCapabilityHand,
            completeDeferredProbe,
            completeDeferredAcceptanceClosure,
            dispatchNextDeferredManager,
            dispatchNextDeferredHand,
            dispatchNextDeferredProbe,
            finalizeDeferredAcceptance,
            options: { forceDispatch: true, allowedKinds: ['manager'] },
          });
          return;
        }
        if (state.dispatchedManagers?.includes('execution-manager') && (state.pendingCapabilityHands || []).length > 0) {
          await reconcileHarnessRuntime({
            client,
            workspace,
            state,
            source: 'command.execute.before',
            appendPluginDebug,
            completeDeferredManager,
            completeDeferredCapabilityHand,
            completeDeferredProbe,
            completeDeferredAcceptanceClosure,
            dispatchNextDeferredManager,
            dispatchNextDeferredHand,
            dispatchNextDeferredProbe,
            finalizeDeferredAcceptance,
            options: { forceDispatch: true, allowedKinds: ['capability-hand'] },
          });
          return;
        }
      }

      if (command === 'check' && state?.mode === 'harness') {
        if (state.blocked) return;
        const nextManager = state.pendingManagers?.[0] || '';
        state.sessionID = hookInput.sessionID;
        await savePluginState(workspace, state);
        if (nextManager === 'acceptance-manager') {
          await reconcileHarnessRuntime({
            client,
            workspace,
            state,
            source: 'command.execute.before',
            appendPluginDebug,
            completeDeferredManager,
            completeDeferredCapabilityHand,
            completeDeferredProbe,
            completeDeferredAcceptanceClosure,
            dispatchNextDeferredManager,
            dispatchNextDeferredHand,
            dispatchNextDeferredProbe,
            finalizeDeferredAcceptance,
            options: { forceDispatch: true, allowedKinds: ['manager'] },
          });
          return;
        }
        if (state.dispatchedManagers?.includes('acceptance-manager')) {
          await reconcileHarnessRuntime({
            client,
            workspace,
            state,
            source: 'command.execute.before',
            appendPluginDebug,
            completeDeferredManager,
            completeDeferredCapabilityHand,
            completeDeferredProbe,
            completeDeferredAcceptanceClosure,
            dispatchNextDeferredManager,
            dispatchNextDeferredHand,
            dispatchNextDeferredProbe,
            finalizeDeferredAcceptance,
            options: { forceDispatch: true, allowedKinds: ['manager', 'probe', 'acceptance-closure'] },
          });
          return;
        }
      }

      if (command === 'control' && state?.mode === 'harness' && !state.blocked && state.currentPhase !== 'complete' && !manualControl) {
        state.sessionID = hookInput.sessionID;
        await savePluginState(workspace, state);
        await reconcileHarnessRuntime({
          client,
          workspace,
          state,
          source: 'command.execute.before',
          appendPluginDebug,
          completeDeferredManager,
          completeDeferredCapabilityHand,
          completeDeferredProbe,
          completeDeferredAcceptanceClosure,
          dispatchNextDeferredManager,
          dispatchNextDeferredHand,
          dispatchNextDeferredProbe,
          finalizeDeferredAcceptance,
          options: { forceDispatch: true },
        });
        output.parts = [{
          type: 'text',
          text: `Harness route ${state.routeId} advanced. Current phase: ${state.currentPhase}. Next expected actor: ${state.nextExpectedActor}.`,
        }];
        return;
      }

      const newState = await initializeHarnessTask(workspace, hookInput.arguments || hookInput.command, activeAgent, routeId, !manualControl);
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
      if (command === 'control' && !newState.blocked && !manualControl) {
        await reconcileHarnessRuntime({
          client,
          workspace,
          state: newState,
          source: 'command.execute.before',
          appendPluginDebug,
          completeDeferredManager,
          completeDeferredCapabilityHand,
          completeDeferredProbe,
          completeDeferredAcceptanceClosure,
          dispatchNextDeferredManager,
          dispatchNextDeferredHand,
          dispatchNextDeferredProbe,
          finalizeDeferredAcceptance,
        });
      }

      if (newState.blocked || manualControl) {
        output.parts = [{
          type: 'text',
          text: newState.blocked
            ? `Harness intake blocked: ${newState.blockedReason || 'clarification required'}`
            : `Harness intake initialized for ${newState.routeId}. Next expected actor: ${newState.nextExpectedActor}. Use /plan, /drive, /check to advance.`,
        }];
      }
    },
    "chat.message": async (hookInput, output) => {
      const { state } = await loadPluginState(workspace);
      const agent = logicalActorForInput(state, hookInput);
      const sessionID = chatMessageSessionID(hookInput);
      await appendPluginDebug(workspace, 'hook.chat.message', { agent, sessionID, hasParts: Boolean(output.parts?.length), partTypes: (output.parts || []).map((p) => p.type), currentPhase: state?.currentPhase || '' });
      if (!isHarnessAgent(agent)) return;
      const textParts = (output.parts || []).filter((p) => p.type === 'text').map((p) => p.text || '');
      const message = textParts.join('\n').trim();
      await appendPluginDebug(workspace, 'hook.chat.message.harness', { agent, sessionID, messagePreview: message.slice(0, 200) });
      if (!message) return;
      if (agent === 'harness-orchestrator' && state?.currentPhase === 'intake') {
        if (!state.autopilotEnabled) {
          output.parts = [{
            type: 'text',
            text: `Harness intake initialized for ${state.routeId}. Next expected actor: ${state.nextExpectedActor}. Use /plan, /drive, /check to advance.`,
          }];
          await appendPluginDebug(workspace, 'hook.chat.message.orchestrator_short_circuited', {
            reason: 'manual intake — top-level response enforced',
            routeId: state.routeId,
            nextExpectedActor: state.nextExpectedActor,
          });
          return;
        }
      }
      if (agent === 'harness-orchestrator' && state?.currentPhase === 'blocked') {
        output.parts = [{
          type: 'text',
          text: `Harness intake blocked: ${state.blockedReason || 'clarification required'}`,
        }];
        await appendPluginDebug(workspace, 'hook.chat.message.orchestrator_blocked', {
          reason: state.blockedReason || 'clarification required',
          routeId: state.routeId,
        });
        return;
      }
      if (agent === 'harness-orchestrator') {
        const hasPendingDispatch = state?.autopilotEnabled
          && (state?.pendingManagers || []).length > 0;
        if (!hasPendingDispatch) {
          output.parts = [{
            type: 'text',
            text: `Harness route ${state.routeId} is active. Top-level harness-orchestrator is supervising only; concrete work belongs to ${state.nextExpectedActor || state.activeDispatch?.actor || 'the dispatched subagent'}.`,
          }];
          await appendPluginDebug(workspace, 'hook.chat.message.orchestrator_short_circuited_active_route', {
            reason: 'top-level concrete work blocked while route is active',
            routeId: state.routeId,
            currentPhase: state.currentPhase,
            nextExpectedActor: state.nextExpectedActor || '',
          });
          return;
        }
      }
      if (isSyntheticHarnessExpansionMessage(message)) {
        await appendPluginDebug(workspace, 'hook.chat.message.synthetic_ignored', { agent });
        return;
      }
      await handleDeferredActorCompletion(client, workspace, state, hookInput, message);
      return;
    },
    "experimental.chat.system.transform": async (hookInput, output) => {
      const { state } = await loadPluginState(workspace);
      const agent = logicalActorForInput(state, hookInput) || state?.activeAgent || '';
      await appendPluginDebug(workspace, 'hook.chat.system.transform', { agent, initialSystemCount: (output.system || []).length, routeId: state?.routeId || '', currentPhase: state?.currentPhase || '' });
      if (!isHarnessAgent(agent)) return;
      output.system = output.system || [];
      output.system.unshift(...buildSystemAdditions(agent, state));
    },
    "experimental.chat.messages.transform": async (hookInput, output) => {
      const { state } = await loadPluginState(workspace);
      if (!state || state.mode !== 'harness') return;
      if (!state.autopilotEnabled || !(state.pendingManagers || []).length) return;
      const dispatchBlock = buildDispatchBlock(state);
      if (!dispatchBlock.length) return;
      const messages = output.messages || [];
      if (messages.length === 0) return;
      const lastMsg = messages[messages.length - 1];
      const parts = lastMsg.parts || [];
      parts.unshift({ type: 'text', text: dispatchBlock.join('\n') + '\n\n' } as any);
      lastMsg.parts = parts;
      await appendPluginDebug(workspace, 'hook.chat.messages.transform.dispatch_injected', {
        routeId: state.routeId,
        nextExpectedActor: state.nextExpectedActor,
      });
    },
    "tool.execute.before": async (hookInput, output) => {
      let { state } = await loadPluginState(workspace);
      const toolArgs = {
        ...(hookInput?.args || {}),
        ...(output?.args || {}),
      };
      const currentAgent = logicalActorForInput(state, hookInput) || toolArgs.agent || toolArgs.subagent_type || '';
      const activeAgent = currentAgent || state?.activeAgent || '';
      await appendPluginDebug(workspace, 'hook.tool.before', { tool: hookInput.tool, activeAgent, argsKeys: Object.keys(toolArgs) });
      await guardUnknownToolDuringActiveHarnessRoute(workspace, hookInput, currentAgent);
      await guardInactiveChildActor(workspace, hookInput, currentAgent);
      await guardOrchestratorTaskDispatch(workspace, hookInput, toolArgs, activeAgent);
      await requireHarnessManagerDispatch(workspace, hookInput.tool, toolArgs, activeAgent);
      await guardExecutionManager(workspace, hookInput.tool, toolArgs, activeAgent);
      await guardAcceptanceManager(workspace, hookInput.tool, toolArgs, activeAgent);

      // ── Phase-Actor File Write Authorization (#1) ──────────────────
      const toolName = lower(hookInput.tool);
      if (['edit', 'write', 'multi_edit', 'apply_patch', 'patch'].includes(toolName) && state?.mode === 'harness' && currentAgent) {
        const targetPaths = extractWriteTargetPaths(toolName, toolArgs);
        const content = toolArgs.content || toolArgs.new_string || '';
        for (const targetPath of targetPaths) {
          const blockReason = guardFileWrite(currentAgent, targetPath, content, state);
          if (blockReason) {
            await appendPluginDebug(workspace, 'phase-guard.blocked', {
              actor: currentAgent,
              file: targetPath,
              reason: blockReason.slice(0, 200),
            });
            throw new Error(blockReason);
          }
          try {
            state = await guardAndAcquireFileWriteLock(workspace, state, currentAgent, hookInput.sessionID || toolArgs.sessionID || '', targetPath, content);
          } catch (error) {
            await appendPluginDebug(workspace, 'file-write-lock.blocked', {
              actor: currentAgent,
              file: targetPath,
              reason: String(error?.message || error).slice(0, 200),
            });
            throw error;
          }
        }
      }
      // ── End Phase-Actor Guard ──────────────────────────────────────

      if (lower(hookInput.tool) === 'task') {
        const inferred = inferRoleFromTaskArgs(toolArgs);
        if (inferred.foundManagers.length > 0) {
          const { state } = await loadPluginState(workspace);
          const manager = inferred.foundManagers[0];
          const stepId = stepIdForActorPhase(state, manager, 'manager');
          if (stepId) {
            await beginDeferredDispatch(workspace, state, manager, 'manager');
          }
        }
        await recordDispatch(workspace, toolArgs);
        await syncManagedAgentIndex(workspace);
        await syncStatusFromState(workspace);
        await appendEvent(workspace, 'actor.dispatched', { tool: hookInput.tool, args: toolArgs });
        await appendPluginDebug(workspace, 'dispatch.recorded', inferRoleFromTaskArgs(toolArgs));
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
        await maybeAdvanceFromToolActivity(client, workspace, state, hookInput);
        await syncManagedAgentIndex(workspace);
        await syncStatusFromState(workspace);
      }
    }
  };
};

export default { server };

export { selectCapabilityHands, selectProbes };

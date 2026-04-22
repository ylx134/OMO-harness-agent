import type { HarnessDispatchStateLike } from '../types.js';

function managerActionLines(managerName: string) {
  if (managerName === 'feature-planner') {
    return [
      '- define or refine the product-level spec and release-critical journeys',
      '- update product planning artifacts such as product-spec.md / features-summary.md when needed',
    ];
  }

  if (managerName === 'capability-planner') {
    return [
      '- define or refine baseline-source.md / capability-map.md / gap-analysis.md',
      '- make hidden capability gaps explicit before execution begins',
    ];
  }

  if (managerName === 'planning-manager') {
    return [
      '- create or refine the planning contract',
      '- update .agent-memory/task.md if needed',
      '- set up the next bounded execution-ready contract',
    ];
  }

  if (managerName === 'execution-manager') {
    return [
      '- create or refine the current round contract',
      '- dispatch the selected capability hands',
      '- keep execution evidence and summaries consistent',
    ];
  }

  return [
    '- perform independent acceptance management',
    '- dispatch the selected probes',
    '- keep acceptance records and summaries consistent',
  ];
}

export function buildManagerDispatchPrompt(managerName: string, state: HarnessDispatchStateLike, skills: string[] = []) {
  return [
    `You are being auto-dispatched by the Harness plugin as ${managerName}.`,
    `Request ID: ${state.requestId}`,
    `Route ID: ${state.routeId}`,
    `Task Type: ${state.taskType}`,
    `Flow Tier: ${state.flowTier}`,
    `Raw User Input: ${state.rawUserInput}`,
    `Required managers: ${(state.requiredManagers || []).join(', ')}`,
    `Selected capability hands: ${(state.selectedCapabilityHands || []).join(', ') || 'none'}`,
    `Selected probes: ${(state.selectedProbes || []).join(', ') || 'none'}`,
    `Suggested skills: ${skills.join(', ') || 'none'}`,
    'Your required action:',
    ...managerActionLines(managerName),
    '- preserve harness role boundaries',
    managerName === 'execution-manager' ? '- do not perform acceptance.' : '- do not collapse the route into one-thread execution.',
  ].join('\n');
}

export function buildCapabilityHandDispatchPrompt(capabilityName: string, state: HarnessDispatchStateLike) {
  return [
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
}

export function buildProbeDispatchPrompt(probeName: string, state: HarnessDispatchStateLike) {
  return [
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
}

export function buildAcceptanceClosurePrompt(state: HarnessDispatchStateLike) {
  return [
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
}

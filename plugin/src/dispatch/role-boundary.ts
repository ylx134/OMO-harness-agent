import type { GraphStateLike } from '../types.js';

const ORCHESTRATOR_IDENTITIES = new Set([
  'main', 'main-agent', 'top-level', 'top-level-agent',
  'harness-orchestrator', 'orchestrator', 'supervisor',
]);

const SELF_EXECUTING_KINDS = new Set(['closure']);

export function actorRequiresDelegatedAgent(actor: string, kind?: string): boolean {
  if (!actor) return false;
  if (SELF_EXECUTING_KINDS.has(kind ?? '')) return false;
  if (actor === 'acceptance-closure') return false;
  return true;
}

export function actorKind(actor: string): string {
  if (actor === 'acceptance-closure' || actor.endsWith(':closure')) return 'closure';
  if (actor.endsWith('-probe-agent')) return 'probe';
  if (actor.endsWith('-manager') || actor === 'feature-planner' || actor === 'capability-planner') {
    return 'manager';
  }
  return 'hand';
}

export function validateCompletion(
  actor: string,
  completingAgent: string,
  expectedAssignedAgentId?: string,
): { ok: true } | { ok: false; reason: string } {
  const kind = actorKind(actor);
  if (!actorRequiresDelegatedAgent(actor, kind)) {
    return { ok: true };
  }

  const actual = (completingAgent || '').trim();
  if (!actual) {
    return { ok: false, reason: `actor ${actor} must be completed by its assigned subagent` };
  }

  if (ORCHESTRATOR_IDENTITIES.has(actual)) {
    return {
      ok: false,
      reason: `actor ${actor} cannot be self-completed by top-level orchestrator identity "${actual}" — delegated work requires real sub-agent execution`,
    };
  }

  const expected = (expectedAssignedAgentId || '').trim();
  if (expected && actual !== expected) {
    return { ok: false, reason: `actor ${actor} assignedAgentId mismatch: expected ${expected}, got ${actual}` };
  }

  return { ok: true };
}

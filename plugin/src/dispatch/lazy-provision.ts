/**
 * Lazy Provision — Safety Net for Deferred Capability/Probe Selection
 *
 * Inspired by the Managed Agents article principle:
 * "The harness leaves the container. It calls the container the way it calls any other tool."
 * "Decoupling the brain from the hands means containers are provisioned only if needed."
 *
 * Design:
 *   - Hands/probes are SELECTED at /control init time (names from routing table)
 *   - Hands/probes are DISPATCHED only after the relevant manager completes
 *   - This module serves as a safety net: if hands/probes are somehow empty when
 *     the reconcile loop reaches the dispatch phase, it re-provisions them
 *
 * The key insight from Managed Agents is not deferring the selection,
 * but deferring the actual agent launch — which this plugin already does
 * through the dispatch-in-order scheduler.
 */

import { routeConfig } from '../routing/table.js';
import type { GraphStateLike } from '../types.js';

// ─── Inlined helpers (mirrors server.ts selectCapabilityHands / selectProbes) ───

function lower(s: string): string {
  return String(s || '').toLowerCase();
}

function unique(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function includesAny(message: string, keywords: string[]): boolean {
  return keywords.some((keyword) => message.includes(keyword));
}

function selectCapabilityHands(state: { routeId?: string; rawUserInput?: string; requiredCapabilityHands?: string[] }): string[] {
  const routeId = state?.routeId || 'J-L1';
  const required = unique(state?.requiredCapabilityHands || routeConfig(routeId).capability || []);
  const msg = lower(state?.rawUserInput || '');

  if (required.length === 0) return [];
  if (routeId === 'P-H1' || routeId === 'A-M1') return required;

  if (routeId === 'F-M1') {
    const selected = ['shell-agent', 'code-agent', 'evidence-agent'].filter((name) => required.includes(name));
    return selected.length ? selected : required;
  }

  if (routeId === 'C-M1') {
    const selected = ['docs-agent', 'code-agent'];
    if (includesAny(msg, ['build', 'test', '运行', '启动', 'compile', '编译', 'migration', 'migrate', '命令', '脚本', 'api'])) {
      selected.push('shell-agent');
    }
    selected.push('evidence-agent');
    return unique(selected.filter((name) => required.includes(name)));
  }

  const selected = ['docs-agent'];
  if (required.includes('evidence-agent') && includesAny(msg, ['evidence', 'proof', '日志', 'screenshot', 'artifact', '依据', '证据', '输出'])) {
    selected.push('evidence-agent');
  }
  for (const requiredHand of required) {
    if (!selected.includes(requiredHand)) selected.push(requiredHand);
  }
  return unique(selected);
}

function selectProbes(state: { routeId?: string; rawUserInput?: string; requiredProbes?: string[] }): string[] {
  const routeId = state?.routeId || 'J-L1';
  const required = unique(state?.requiredProbes || routeConfig(routeId).probes || []);
  const msg = lower(state?.rawUserInput || '');

  if (routeId === 'P-H1') {
    return unique(['ui-probe-agent', 'regression-probe-agent', 'artifact-probe-agent'].filter((name) => required.includes(name)));
  }
  if (routeId === 'A-M1') {
    return unique(['api-probe-agent', 'regression-probe-agent', 'artifact-probe-agent'].filter((name) => required.includes(name)));
  }
  if (routeId === 'F-M1') {
    return unique(['regression-probe-agent', 'artifact-probe-agent'].filter((name) => required.includes(name)));
  }
  if (routeId === 'C-M1') {
    const selected = ['regression-probe-agent', 'artifact-probe-agent'];
    if (includesAny(msg, ['api', 'endpoint', '接口', 'contract']) && required.includes('api-probe-agent')) {
      selected.unshift('api-probe-agent');
    }
    return unique(selected.filter((name) => required.includes(name)));
  }
  return required;
}

// ─── Public API ──────────────────────────────────────────────────

export function shouldProvisionHands(state: GraphStateLike | null): boolean {
  if (!state) return false;
  if ((state as any).mode !== 'harness') return false;
  if (!(state as any).dispatchedManagers?.includes('execution-manager')) return false;
  if (((state as any).selectedCapabilityHands || []).length > 0) return false;
  return true;
}

export function shouldProvisionProbes(state: GraphStateLike | null): boolean {
  if (!state) return false;
  if ((state as any).mode !== 'harness') return false;
  if (!(state as any).dispatchedManagers?.includes('acceptance-manager')) return false;
  if (((state as any).selectedProbes || []).length > 0) return false;
  return true;
}

export function provisionHands(state: GraphStateLike): {
  selectedCapabilityHands: string[];
  pendingCapabilityHands: string[];
  graphUpdated: boolean;
} {
  const routeId = (state as any)?.routeId || 'J-L1';
  const route = routeConfig(routeId);
  const requiredHands = [...route.capability];

  const selected = selectCapabilityHands({
    routeId,
    rawUserInput: (state as any)?.rawUserInput || '',
    requiredCapabilityHands: requiredHands,
  });

  return {
    selectedCapabilityHands: selected.length > 0 ? selected : requiredHands,
    pendingCapabilityHands: selected.length > 0 ? selected : requiredHands,
    graphUpdated: selected.length > 0,
  };
}

export function provisionProbes(state: GraphStateLike): {
  selectedProbes: string[];
  pendingProbes: string[];
  graphUpdated: boolean;
} {
  const routeId = (state as any)?.routeId || 'J-L1';
  const route = routeConfig(routeId);
  const requiredProbes = [...route.probes];

  const selected = selectProbes({
    routeId,
    rawUserInput: (state as any)?.rawUserInput || '',
    requiredProbes,
  });

  return {
    selectedProbes: selected.length > 0 ? selected : requiredProbes,
    pendingProbes: selected.length > 0 ? selected : requiredProbes,
    graphUpdated: selected.length > 0,
  };
}

export function lazyProvisionIfNeeded(state: GraphStateLike): Partial<GraphStateLike> | null {
  const patches: Record<string, unknown> = {};

  if (shouldProvisionHands(state)) {
    const handResult = provisionHands(state);
    patches['selectedCapabilityHands'] = handResult.selectedCapabilityHands;
    patches['pendingCapabilityHands'] = handResult.pendingCapabilityHands;
  }

  if (shouldProvisionProbes(state)) {
    const probeResult = provisionProbes(state);
    patches['selectedProbes'] = probeResult.selectedProbes;
    patches['pendingProbes'] = probeResult.pendingProbes;
  }

  return Object.keys(patches).length > 0 ? (patches as any) : null;
}

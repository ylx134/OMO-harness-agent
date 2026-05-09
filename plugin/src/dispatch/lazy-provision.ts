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
import { selectCapabilityHands, selectProbes } from './capability-selector.js';
import type { GraphStateLike } from '../types.js';

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

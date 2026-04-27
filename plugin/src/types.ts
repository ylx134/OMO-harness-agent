export type StepKind = 'manager' | 'capability-hand' | 'probe' | 'acceptance-closure';

export interface GraphStep {
  id: string;
  actor: string;
  kind: StepKind;
  phase: string;
  dependsOnStepIds: string[];
  dependsOnSignals: string[];
  emitsSignals: string[];
  resourceLocks: string[];
  completionPolicy: string;
  retryPolicy: {
    maxAttempts: number;
    backoffMs: number;
  };
  allowedToolsPolicy: string;
  producesDeliverables: string[];
}

export interface RouteGraph {
  routeId: string;
  taskType: string | null;
  flowTier: string | null;
  steps: Record<string, GraphStep>;
}

export interface StepRuntime {
  status: string;
  attemptCount?: number;
  activeSessionID?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  lastProgressAt?: string | null;
  completionSource?: string | null;
  lastError?: unknown;
}

export interface GraphStateLike {
  graph?: RouteGraph;
  stepRuntime?: Record<string, StepRuntime>;
  activeStepIds?: string[];
  readyStepIds?: string[];
  heldLocks?: Record<string, string>;
  pendingCapabilityHands?: string[];
  pendingProbes?: string[];
  activeDispatch?: { actor?: string | null } | null;
}

export interface RouteConfigShape {
  taskType: string | null;
  flowTier: string | null;
  managers: string[];
  capability: string[];
  probes: string[];
  description: string;
  startupFiles: string[];
  deliverables: string[];
  antiShallowBar: string;
  executionMode: {
    multiAgent: boolean;
    singleThreadAllowed: boolean;
    requiresContractNegotiation: boolean;
  };
  category: string;
}

export interface HarnessDispatchStateLike {
  requestId: string;
  routeId: string;
  taskType: string;
  flowTier: string;
  rawUserInput: string;
  requiredManagers?: string[];
  selectedCapabilityHands?: string[];
  selectedProbes?: string[];
  requiredProbes?: string[];
  dispatchedCapabilityHands?: string[];
  dispatchedProbes?: string[];
}

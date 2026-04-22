import { readFileSync } from 'node:fs';

import type { RouteConfigShape } from '../types.js';

type RawRoute = {
  task_type?: string;
  flow_tier?: string;
  manager_requirements?: string[];
  capability_requirements?: string[];
  probe_requirements?: string[];
  description?: string;
  startup_files?: string[];
  deliverables?: string[];
  anti_shallow_bar?: string;
  execution_mode?: {
    multi_agent?: boolean;
    single_thread_allowed?: boolean;
    requires_contract_negotiation?: boolean;
  };
};

type RawRoutingTable = {
  routes?: Record<string, RawRoute>;
  category_mapping?: Record<string, string>;
};

export const ROUTING_TABLE: RawRoutingTable = JSON.parse(
  readFileSync(new URL('../../config/routing-table.json', import.meta.url), 'utf8'),
);

export function routeConfig(routeId: string): RouteConfigShape {
  const routes = ROUTING_TABLE.routes || {};
  const route = routes[routeId] || routes['J-L1'];
  return {
    taskType: route.task_type,
    flowTier: route.flow_tier,
    managers: [...(route.manager_requirements || [])],
    capability: [...(route.capability_requirements || [])],
    probes: [...(route.probe_requirements || [])],
    description: route.description,
    startupFiles: [...(route.startup_files || [])],
    deliverables: [...(route.deliverables || [])],
    antiShallowBar: route.anti_shallow_bar,
    executionMode: {
      multiAgent: Boolean(route.execution_mode?.multi_agent),
      singleThreadAllowed: Boolean(route.execution_mode?.single_thread_allowed),
      requiresContractNegotiation: Boolean(route.execution_mode?.requires_contract_negotiation),
    },
    category: ROUTING_TABLE.category_mapping?.[route.task_type] || 'quick',
  };
}

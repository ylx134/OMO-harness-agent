import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { RouteConfigShape } from '../types.js';

const planningFileNames = new Set([
  'task.md',
  'baseline-source.md',
  'capability-map.md',
  'gap-analysis.md',
  'quality-guardrails.md',
  'product-spec.md',
  'features.json',
  'features-summary.md',
  'working-memory.md',
]);

const executionFileNames = new Set([
  'round-contract.md',
  'execution-status.md',
  'evidence-ledger.md',
  'task.md',
  'features.json',
  'features-summary.md',
  'product-spec.md',
  'baseline-source.md',
  'capability-map.md',
  'gap-analysis.md',
]);

const placeholderContent = {
  'task.md': '# Task\n\n',
  'working-memory.md': '# Working Memory\n\n',
  'round-contract.md': '# Round Contract\n\n',
  'orchestration-status.md': '# Orchestration Status\n\n',
  'execution-status.md': '# Execution Status\n\n',
  'acceptance-report.md': '# Acceptance Report\n\n',
  'evidence-ledger.md': '# Evidence Ledger\n\n',
};

const scaffoldMarkdownHeadings = {
  'product-spec.md': 'product spec',
  'features-summary.md': 'features summary',
  'baseline-source.md': 'baseline source',
  'capability-map.md': 'capability map',
  'gap-analysis.md': 'gap analysis',
};

function unique(values: string[] = []) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

type RouteFileContractInput = Pick<RouteConfigShape, 'startupFiles' | 'deliverables' | 'probes' | 'antiShallowBar'>;

export function buildRouteFileContract({ route, selectedProbes = [] }: { route: RouteFileContractInput; selectedProbes?: string[] }) {
  const requiredStartupFiles = unique(route?.startupFiles || []);
  const requiredDeliverables = unique(route?.deliverables || []);

  return {
    requiredStartupFiles,
    requiredPlanningFiles: requiredStartupFiles.filter((name) => planningFileNames.has(name)),
    requiredExecutionFiles: requiredDeliverables.filter((name) => executionFileNames.has(name)),
    requiredAcceptanceGates: unique([...(selectedProbes || route?.probes || []), 'acceptance-report.md', route?.antiShallowBar].filter(Boolean)),
    requiredDeliverables,
  };
}

export function isPlaceholderDeliverable(deliverable: string, content: string) {
  const normalized = String(content || '');
  const trimmed = normalized.trim();

  if (!trimmed) return true;
  if ((placeholderContent[deliverable as keyof typeof placeholderContent] || null) === normalized) return true;

  if (deliverable === 'features.json') {
    try {
      const parsed = JSON.parse(trimmed);
      if ((Array.isArray(parsed) && parsed.length === 0) || (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length === 0)) {
        return true;
      }
    } catch {
      return false;
    }
  }

  const expectedHeading = scaffoldMarkdownHeadings[deliverable as keyof typeof scaffoldMarkdownHeadings];
  if (expectedHeading) {
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 1 && lines[0].toLowerCase() === `# ${expectedHeading}`) return true;
  }

  return false;
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function detectCompletedDeliverables(workspace: string, route: Pick<RouteConfigShape, 'deliverables'>) {
  const completed: string[] = [];

  for (const deliverable of route?.deliverables || []) {
    const deliverablePath = path.join(workspace, '.agent-memory', deliverable);
    if (!(await exists(deliverablePath))) continue;

    const content = await fs.readFile(deliverablePath, 'utf8');
    if (isPlaceholderDeliverable(deliverable, content)) continue;
    completed.push(deliverable);
  }

  return completed;
}

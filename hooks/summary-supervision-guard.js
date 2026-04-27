/**
 * Summary-First Supervision Guard Hook
 *
 * Detects when brain (harness-orchestrator) or manager agents read
 * detail-layer files (.agent-memory/ detail files, raw evidence/ files)
 * and emits a warning to stderr. Does NOT block reads — this is a
 * visibility guard, not a hard enforcement.
 *
 * The goal: make "reading detail when you should be reading summary"
 * a visible event rather than a silent drift, while respecting that
 * sometimes a deep dive is genuinely needed.
 *
 * Layering:
 *   - SUMMARY files: brain-brief.md, route-summary.md, risk-summary.md,
 *                    acceptance-summary.md, orchestration-status.md
 *   - MANAGER files: task.md, working-memory.md, round-contract.md,
 *                    acceptance-report.md, execution-status.md
 *   - DETAIL files: evidence-ledger.md, journal.md, activity.jsonl,
 *                   evidence/**, handoff.md (in non-resume context)
 *
 * Brain/Manager agents should prefer SUMMARY files first.
 * This hook warns when they reach directly into DETAIL.
 *
 * Trigger: PostToolUse on Read/Grep/Glob when the agent role is
 * brain or manager, and the target is a detail-layer file.
 */

const DETAIL_PATTERNS = [
  '/.agent-memory/evidence-ledger',
  '/.agent-memory/journal',
  '/.agent-memory/activity.jsonl',
  '/.agent-memory/evidence/',
  '/evidence/screenshots/',
  '/evidence/command-outputs/',
  '/evidence/api-traces/',
  '/evidence/artifacts/',
  '/evidence/smoke-tests/',
];

const BRAIN_MARKERS = [
  'harness-orchestrator',
  'control',
  'orchestrator',
  'brain',
];

const MANAGER_MARKERS = [
  'planning-manager',
  'execution-manager',
  'acceptance-manager',
  'plan',
  'drive',
  'check',
  'feature-planner',
  'capability-planner',
  'manager',
];

function getTargetPath(input = {}) {
  return input.file_path || input.path || input.uri || '';
}

function getActorHints() {
  const env = Deno.env.toObject();
  return [
    env.OPENCODE_SKILL,
    env.OMO_ACTIVE_SKILL,
    env.ACTIVE_SKILL,
    env.AGENT_ROLE,
    env.AGENT_NAME,
    env.TASK_SUBAGENT_TYPE,
    env.OMO_AGENT_NAME,
    env.OPENAICODE_AGENT,
  ].filter(Boolean);
}

function isBrain(hints) {
  const joined = hints.join(' ').toLowerCase();
  return BRAIN_MARKERS.some((marker) => joined.includes(marker));
}

function isManager(hints) {
  const joined = hints.join(' ').toLowerCase();
  return MANAGER_MARKERS.some((marker) => joined.includes(marker));
}

function isBrainOrManager(hints) {
  return isBrain(hints) || isManager(hints);
}

function targetsDetailSurface(targetPath) {
  return DETAIL_PATTERNS.some((pattern) => targetPath.includes(pattern));
}

// ─── Warning rate limiter ────────────────────────────────────────
// Avoid flooding stderr when an agent reads many detail files in a
// single invocation. Track recent warnings in a simple in-memory set
// (resets per hook invocation).

let warningCount = 0;
const MAX_WARNINGS_PER_INVOCATION = 5;

// ─── Export ──────────────────────────────────────────────────────

export default {
  name: 'summary-supervision-guard',
  description: 'Warn when brain or manager agents read detail-layer files instead of staying at the summary level.',
  match: ['Read', 'Grep', 'Glob', 'Bash'],
  handler: async ({ input, toolName }) => {
    try {
      const targetPath = getTargetPath(input);

      // Only check file reads that target .agent-memory/ or evidence/
      if (!targetPath || !targetsDetailSurface(targetPath)) {
        return { continue: true, suppressOutput: true };
      }

      const actorHints = getActorHints();

      // Only act if the reader is a brain or manager
      if (!isBrainOrManager(actorHints)) {
        return { continue: true, suppressOutput: true };
      }

      // Rate limit warnings
      if (warningCount >= MAX_WARNINGS_PER_INVOCATION) {
        return { continue: true, suppressOutput: true };
      }
      warningCount++;

      const actorType = isBrain(actorHints) ? 'brain/orchestrator' : 'manager';

      const warning = [
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        `⚠ SUMMARY-FIRST SUPERVISION: ${actorType} reading detail-layer file`,
        `   File: ${targetPath}`,
        `   Tool: ${toolName}`,
        `   Detected role hints: ${actorHints.join(', ') || 'none'}`,
        '',
        '   Managed-agents mode prefers summary-files first:',
        '   brain  → brain-brief.md, route-summary.md, orchestration-status.md',
        '   manager → task.md, working-memory.md, execution-status.md',
        '',
        '   This detail file may be needed for legitimate reasons,',
        '   but consider whether a summary-layer file would suffice.',
        '   Repeated deep reads from upper layers erode the summary-first',
        '   architecture and bloat context windows over long runs.',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
      ].join('\n');

      console.error(JSON.stringify({
        event: 'summary_supervision_warning',
        actor_type: actorType,
        file: targetPath,
        tool: toolName,
        actor_hints: actorHints,
        warning_count: warningCount,
      }));

      // IMPORTANT: This is a WARNING only. We do NOT block the read.
      // Blocking reads could deadlock the entire harness workflow.
      // The warning goes to stderr for operator visibility.
      console.error(warning);

      // Still suppress the hook's own output to the agent (keep it invisible to the LLM)
      return { continue: true, suppressOutput: true };

    } catch (error) {
      console.error('summary-supervision-guard error:', error.message);
      return { continue: true, suppressOutput: true };
    }
  }
};

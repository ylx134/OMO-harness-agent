/**
 * Output Contract Guard Hook
 *
 * Warns when agent output contains forbidden internal/implementation terms
 * that should not appear in summary-layer or acceptance-facing artifacts.
 *
 * This hook enforces a cleanliness boundary for agent output:
 * - FORBIDDEN: task IDs, session IDs, state patches, lock operations,
 *   agent role names (when used as internal identifiers), tool names
 * - ALLOWED: business conclusions, tradeoffs, risks, gaps,
 *   deliverable references, evidence citations
 *
 * The goal: keep manager-to-manager and acceptance-facing output
 * free of internal runtime implementation details. This is a WARNING
 * hook — it never blocks output, but it flags contamination for
 * operator visibility.
 *
 * Trigger: PostToolUse on Write/Edit when writing to
 * .agent-memory/ summary files and acceptance artifacts.
 */

// ─── Forbidden Patterns ──────────────────────────────────────────

/**
 * Terms that MUST NOT appear in summary/acceptance output.
 * These are internal runtime implementation details that erode
 * the abstraction boundary between layers.
 */
const FORBIDDEN_PATTERNS = [
  // Task/session identifiers (internal runtime detail)
  { pattern: /\btask[_\s]?[iI][dD]\b/, label: 'task_id' },
  { pattern: /\bsession[_\s]?[iI][dD]\b/, label: 'session_id' },
  { pattern: /\brequest[_\s]?[iI][dD]\b/, label: 'request_id' },
  { pattern: /\bchild[_\s]?session\b/i, label: 'child_session' },

  // State mutation internals
  { pattern: /\bstate[_\s]?patch\b/i, label: 'state_patch' },
  { pattern: /\bsavePluginState\b/, label: 'save_plugin_state' },
  { pattern: /\bloadPluginState\b/, label: 'load_plugin_state' },
  { pattern: /\bstructuredClone\b/, label: 'structured_clone' },

  // Lock/step internals
  { pattern: /\bfileWriteLocks?\b/, label: 'file_write_lock' },
  { pattern: /\bstepRuntime\b/, label: 'step_runtime' },
  { pattern: /\bactiveStepIds?\b/, label: 'active_step_ids' },
  { pattern: /\bbeginDeferredDispatch\b/, label: 'deferred_dispatch' },
  { pattern: /\bclearDeferredDispatch\b/, label: 'clear_dispatch' },
  { pattern: /\bacquireFileWriteLock\b/, label: 'acquire_lock' },

  // Internal agent role names used as identifiers
  { pattern: /\bharness-orchestrator\b/, label: 'harness_orchestrator' },
  { pattern: /\bacceptance-manager\b/, label: 'acceptance_manager_role' },
  { pattern: /\bexecution-manager\b/, label: 'execution_manager_role' },
  { pattern: /\bplanning-manager\b/, label: 'planning_manager_role' },
  { pattern: /\bsummary-manager\b/, label: 'summary_manager_role' },
  { pattern: /\bfeature-planner\b/, label: 'feature_planner_role' },
  { pattern: /\bcapability-planner\b/, label: 'capability_planner_role' },

  // Tool names (implementation detail)
  { pattern: /\bmcp_name\b/, label: 'mcp_name' },
  { pattern: /\btool_name\b/, label: 'tool_name' },
  { pattern: /\bsubagent_type\b/, label: 'subagent_type' },
  { pattern: /\brun_in_background\b/, label: 'run_in_background' },
  { pattern: /\bload_skills\b/, label: 'load_skills' },
  { pattern: /\btask\(/, label: 'task_call' },

  // Dispatch internals
  { pattern: /\bpendingManagers?\b/, label: 'pending_managers' },
  { pattern: /\bdispatchedManagers?\b/, label: 'dispatched_managers' },
  { pattern: /\bpendingCapabilityHands?\b/, label: 'pending_hands' },
  { pattern: /\bdispatchedCapabilityHands?\b/, label: 'dispatched_hands' },
  { pattern: /\bpendingProbes?\b/, label: 'pending_probes' },
  { pattern: /\bdispatchedProbes?\b/, label: 'dispatched_probes' },
  { pattern: /\bdeferredDispatchState\b/, label: 'deferred_state' },

  // Operator-visible plugin internals
  { pattern: /\bplugin\.server\.init\b/, label: 'plugin_init' },
  { pattern: /\bharness-plugin-debug\.log\b/, label: 'debug_log' },
  { pattern: /\bappendPluginDebug\b/, label: 'plugin_debug' },

  // Graph internals
  { pattern: /\bgraph[_\s]?runtime\b/i, label: 'graph_runtime' },
  { pattern: /\bstepIdForActorPhase\b/, label: 'step_id_for_actor' },
  { pattern: /\bcompileRouteGraph\b/, label: 'compile_graph' },
  { pattern: /\breconcile[_\s]?[rR]untime\b/, label: 'reconcile_runtime' },
];

/**
 * Allowed patterns that should not trigger false positives.
 * These are terms that might match forbidden patterns but are
 * legitimate in business/acceptance context.
 */
const ALLOWED_OVERRIDES = [
  /\bacceptance[_\s]?report\b/i,
  /\bacceptance[_\s]?summary\b/i,
  /\bacceptance[_\s]?decision\b/i,
  /\bacceptance[_\s]?manager\s+(?:must|should|will|shall|may|is|has|reports)\b/i,
  /\bexecution[_\s]?status\b/i,
];

// ─── Target Files ────────────────────────────────────────────────

/**
 * Files that are subject to output contract enforcement.
 * These are summary-layer and acceptance-facing artifacts.
 */
const GOVERNED_FILES = [
  '/.agent-memory/acceptance-report.md',
  '/.agent-memory/acceptance-summary.md',
  '/.agent-memory/route-summary.md',
  '/.agent-memory/risk-summary.md',
  '/.agent-memory/brain-brief.md',
  '/.agent-memory/final-summary.md',
  '/.agent-memory/handoff-summary.md',
  '/.agent-memory/orchestration-status.md',
  '/.agent-memory/quality-guardrails.md',
  '/.agent-memory/acceptance-lessons.md',
];

// ─── Helpers ─────────────────────────────────────────────────────

function getTargetPath(input = {}) {
  return input.file_path || input.path || '';
}

function getNewContent(input = {}, toolName = '') {
  if (toolName === 'Write') return input.content || '';
  return input.new_string || '';
}

function isGovernedFile(targetPath) {
  return GOVERNED_FILES.some((pattern) => targetPath.includes(pattern));
}

function isAllowedByOverride(text) {
  return ALLOWED_OVERRIDES.some((pattern) => pattern.test(text));
}

// ─── Rate Limiter ────────────────────────────────────────────────

let warningCount = 0;
const MAX_WARNINGS_PER_INVOCATION = 10;

// ─── Export ──────────────────────────────────────────────────────

export default {
  name: 'output-contract-guard',
  description: 'Warn when summary/acceptance output contains forbidden internal implementation terms that should not leak across abstraction boundaries.',
  match: ['Write', 'Edit'],
  handler: async ({ input, toolName }) => {
    try {
      const targetPath = getTargetPath(input);

      // Only govern writes to summary/acceptance files
      if (!targetPath || !isGovernedFile(targetPath)) {
        return { continue: true, suppressOutput: true };
      }

      const newContent = getNewContent(input, toolName);

      // Allow bypass marker for legitimate emergency situations
      if (newContent.includes('OUTPUT_CONTRACT_BYPASS')) {
        return { continue: true, suppressOutput: true };
      }

      // Check each forbidden pattern
      const violations = [];
      for (const { pattern, label } of FORBIDDEN_PATTERNS) {
        if (pattern.test(newContent)) {
          // Check against allowed overrides to avoid false positives
          if (!isAllowedByOverride(newContent)) {
            violations.push({ label, matched: pattern.toString() });
          }
        }
      }

      if (violations.length === 0) {
        return { continue: true, suppressOutput: true };
      }

      // Rate limit warnings
      if (warningCount >= MAX_WARNINGS_PER_INVOCATION) {
        return { continue: true, suppressOutput: true };
      }
      warningCount++;

      // Build warning message
      const violationLabels = violations.map((v) => v.label);
      const uniqueLabels = [...new Set(violationLabels)];

      const warning = [
        '',
        '┌─────────────────────────────────────────────────────────────┐',
        '│ ⚠ OUTPUT CONTRACT VIOLATION                                │',
        `│ File: ${targetPath}`,
        `│ Tool: ${toolName}`,
        '│',
        '│ Forbidden internal terms detected in summary/acceptance',
        '│ output. These terms expose runtime implementation details',
        '│ that should not cross abstraction boundaries:',
        '│',
        ...uniqueLabels.map((label) => `│   • ${label}`),
        '│',
        '│ This file is a summary-layer or acceptance-facing artifact.',
        '│ It should contain business conclusions, tradeoffs, risks,',
        '│ gaps, deliverable references, and evidence citations only.',
        '│',
        '│ Internal identifiers (task IDs, session IDs, state patches,',
        '│ lock operations, agent role names, tool names) belong in',
        '│ runtime artifacts, not in summary/acceptance output.',
        '│',
        '│ Action: Remove or replace the flagged terms with',
        '│ business-facing equivalents. If this is a legitimate',
        '│ emergency, add OUTPUT_CONTRACT_BYPASS to the content.',
        '└─────────────────────────────────────────────────────────────┘',
        '',
      ].join('\n');

      // Log structured event to stderr
      console.error(JSON.stringify({
        event: 'output_contract_violation',
        file: targetPath,
        tool: toolName,
        violation_count: violations.length,
        unique_violations: uniqueLabels,
        warning_count: warningCount,
      }));

      // WARNING only — never block the write
      console.error(warning);

      return { continue: true, suppressOutput: true };

    } catch (error) {
      console.error('output-contract-guard error:', error.message);
      return { continue: true, suppressOutput: true };
    }
  }
};

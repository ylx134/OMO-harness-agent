const HARNESS_AGENTS = new Set([
  "harness-orchestrator",
  "feature-planner",
  "capability-planner",
  "planning-manager",
  "execution-manager",
  "acceptance-manager",
  "summary-manager",
]);

const MANAGER_AGENTS = new Set([
  "feature-planner",
  "capability-planner",
  "planning-manager",
  "execution-manager",
  "acceptance-manager",
  "summary-manager",
]);

const CAPABILITY_AGENTS = new Set([
  "browser-agent",
  "code-agent",
  "shell-agent",
  "docs-agent",
  "evidence-agent",
  "review-agent",
]);

const PROBE_AGENTS = new Set([
  "ui-probe-agent",
  "api-probe-agent",
  "regression-probe-agent",
  "artifact-probe-agent",
]);

const MANAGER_SKILLS: Record<string, string[]> = {
  "feature-planner": ["feature-planner", "plan"],
  "capability-planner": ["capability-planner", "plan"],
  "planning-manager": ["plan"],
  "execution-manager": ["drive", "memory"],
  "acceptance-manager": ["check"],
  "summary-manager": ["memory"],
};

export {
  HARNESS_AGENTS,
  MANAGER_AGENTS,
  CAPABILITY_AGENTS,
  PROBE_AGENTS,
  MANAGER_SKILLS,
};

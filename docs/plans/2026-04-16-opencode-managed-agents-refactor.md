# OpenCode OMO Harness Skills Managed-Agents Refactor Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development when splitting independent implementation tasks. Verify each phase before claiming completion.

Goal: Refactor the OMO/OpenCode harness skills from a primarily stage-role harness (planner / executor / checker) into a layered managed-agents architecture aligned with “Scaling Managed Agents: Decoupling the brain from the hands”, while preserving OpenCode usability and exploiting OMO features such as categories, hooks, background task dispatch, and durable memory.

Architecture:
- L1 Global Orchestrator (`control`) becomes the brain: route selection, semantic lock, manager dispatch, summary-level supervision.
- L2 Managers (`plan`, `drive`, `check`, planners) become workflow managers: planning-manager, execution-manager, acceptance-manager.
- L3 Capability Agents become the hands: browser/code/shell/evidence/docs/etc. agents with narrow responsibilities.
- L4 Probe Agents perform specialized verification so acceptance acts as judge, not do-everything executor.

Tech Stack:
- OpenCode skill packs
- OMO `task()` dispatch + categories + built-in hooks
- Custom hooks in `hooks/`
- Markdown skill docs + JSON config + shell installer scripts

---

## Refactor Outcomes

By the end of this refactor, the repo should provide:
1. A documented layered architecture explicit about brain / managers / hands / probes.
2. Narrow capability-agent skills that execution-manager can dispatch instead of acting as a universal executor.
3. Narrow probe-agent skills that acceptance-manager can dispatch instead of performing all verification itself.
4. Updated routing/config/install scripts so the new skills are first-class in OpenCode.
5. Hook-level guardrails that enforce separation-of-concerns and evidence discipline instead of relying only on prose.
6. Updated docs showing how OpenCode/OMO users should operate the new system.

## Phase 1: Repo-Level Architecture Rewrite

### Task 1.1: Add a top-level migration plan file
Files:
- Create: `docs/plans/2026-04-16-opencode-managed-agents-refactor.md`

Steps:
1. Save this refactor plan.
2. Ensure the plan explains current-vs-target architecture, phase ordering, and verification requirements.

### Task 1.2: Rewrite README architecture section around layered managed agents
Files:
- Modify: `README.md`

Steps:
1. Replace “three-agent split” framing with a layered architecture explanation.
2. Add explicit mapping:
   - L1 global orchestrator
   - L2 workflow managers
   - L3 capability agents
   - L4 probe agents
3. Keep backward-compatible command entrypoints (`/control`, `drive`, `check`, `plan`) but redefine their roles.
4. Document how this uses OMO’s `task()` dispatch and hooks.
5. Update installation / usage examples to include new skills.
6. Add a migration section describing how the architecture differs from the old harness.

### Task 1.3: Add a dedicated managed-agents reference doc
Files:
- Create: `control/references/managed-agents-architecture.md`

Steps:
1. Explain current repo role mapping to article concepts.
2. Define allowed responsibilities for brain, managers, hands, and probes.
3. Include anti-patterns:
   - universal executor
   - checker as all-in-one verifier
   - orchestrator reading raw execution logs by default
4. Define what must stay summary-only vs detail-level.

## Phase 2: Promote Existing Skills into Managers

### Task 2.1: Refactor `control` into the L1 orchestrator
Files:
- Modify: `control/SKILL.md`
- Modify: `control/config/routing-table.json`
- Modify: `control/config/coordination-rules.md`
- Modify: `control/agents/planner.md`
- Modify: `control/agents/executor.md`
- Modify: `control/agents/checker.md`

Steps:
1. Rewrite `control` overview so it is explicitly the global orchestrator / brain.
2. Reduce language implying that `control` directly governs implementation details.
3. Add new dispatch grammar that prefers:
   - manager dispatch for phase-level work
   - capability / probe dispatch for execution and verification details
4. Update route definitions to include manager stacks plus capability/probe expectations.
5. Redefine planner / executor / checker prompt templates as planning-manager / execution-manager / acceptance-manager prompt templates.
6. Update coordination rules so state ownership is layered, not just role-based.

### Task 2.2: Refactor `plan` into planning-manager
Files:
- Modify: `plan/SKILL.md`

Steps:
1. Keep task-planning strengths.
2. Reframe it as a manager that produces task contracts and route summaries, not a final top-level architecture brain.
3. Explicitly state which lower-level agents it may ask for evidence or context from (docs, baseline, capability inventory).
4. Add output contract for summary-level files.

### Task 2.3: Refactor `drive` into execution-manager
Files:
- Modify: `drive/SKILL.md`
- Modify: `control/agents/executor.md`

Steps:
1. Remove “do everything” language.
2. Make execution-manager responsible for sequencing lower-level capability agents.
3. Add explicit sub-dispatch policy:
   - browser-agent for UI exploration and interaction
   - code-agent for code changes
   - shell-agent for init/build/test/run
   - evidence-agent for structured proof collection
   - docs-agent for baseline/doc retrieval
4. Add manager-level writeback expectations (execution summary, not all details inline).

### Task 2.4: Refactor `check` into acceptance-manager
Files:
- Modify: `check/SKILL.md`
- Modify: `control/agents/checker.md`

Steps:
1. Keep strong acceptance stance.
2. Reframe `check` as judge/coordinator of probes.
3. Split “verification duty” into:
   - what the acceptance-manager decides
   - what probe agents gather
4. Require probes for browser/API/regression/artifact checks when relevant.
5. Preserve hard gates and evidence-first discipline.

## Phase 3: Introduce Capability Agents (Hands)

### Task 3.1: Add `browser-agent`
Files:
- Create: `browser-agent/SKILL.md`

Steps:
1. Define browser-agent as narrow UI hand.
2. Responsibilities:
   - open app/page
   - interact with UI
   - navigate user journeys
   - take screenshots
   - capture visible states
3. It must not decide acceptance or re-plan.
4. Include OpenCode/OMO dispatch examples.

### Task 3.2: Add `code-agent`
Files:
- Create: `code-agent/SKILL.md`

Steps:
1. Define narrow responsibility for code edits/refactors.
2. Require local scope and explicit in-scope files from execution-manager.
3. Forbid redefining requirements or acceptance criteria.

### Task 3.3: Add `shell-agent`
Files:
- Create: `shell-agent/SKILL.md`

Steps:
1. Define startup/build/test/process health responsibility.
2. Require artifact capture for command outputs.
3. Keep it execution-only.

### Task 3.4: Add `evidence-agent`
Files:
- Create: `evidence-agent/SKILL.md`

Steps:
1. Move evidence-ledger discipline into a dedicated hand.
2. Define screenshot / stdout / api-trace / artifact bookkeeping.
3. Add rules for evidence normalization and paths.

### Task 3.5: Add `docs-agent`
Files:
- Create: `docs-agent/SKILL.md`

Steps:
1. Define responsibility for baseline/doc/reference retrieval.
2. Keep it away from implementation and acceptance decisions.

## Phase 4: Introduce Probe Agents (Verification Hands)

### Task 4.1: Add `ui-probe-agent`
Files:
- Create: `ui-probe-agent/SKILL.md`

Steps:
1. Specialize browser-based verification for acceptance-manager.
2. Explicitly collect screenshots and path walkthroughs.
3. Return observations, not pass/fail judgment.

### Task 4.2: Add `api-probe-agent`
Files:
- Create: `api-probe-agent/SKILL.md`

Steps:
1. Specialize live API probing.
2. Capture request/response traces.
3. Return findings only.

### Task 4.3: Add `regression-probe-agent`
Files:
- Create: `regression-probe-agent/SKILL.md`

Steps:
1. Specialize regression spot-checks and smoke follow-up.
2. Focus on “what broke or did not break”.

### Task 4.4: Add `artifact-probe-agent`
Files:
- Create: `artifact-probe-agent/SKILL.md`

Steps:
1. Verify generated files/artifacts/outputs.
2. Report concrete structural mismatches.

## Phase 5: Evolve Memory into Summary-First Multi-Layer State

### Task 5.1: Add summary-layer files to `memory`
Files:
- Modify: `memory/SKILL.md`
- Create: `memory/templates/brain-brief.md`
- Create: `memory/templates/route-summary.md`
- Create: `memory/templates/risk-summary.md`
- Create: `memory/templates/acceptance-summary.md`

Steps:
1. Define which files are brain-facing summaries.
2. Define which files are manager-facing work contracts.
3. Define which files are hand/probe evidence/detail records.
4. Update default layout and read order.

### Task 5.2: Add a machine-readable state index for layered state
Files:
- Create: `memory/templates/managed-agent-state-index.json`
- Modify: `memory/references/file-contract.md` (if needed)

Steps:
1. Record which actor class reads/writes each file.
2. Expose summary/detail boundaries to hooks.

## Phase 6: Hook-Backed Guardrails for OpenCode / OMO

### Task 6.1: Add a manager file-boundary hook
Files:
- Create: `hooks/manager-boundary-guard.js`

Steps:
1. Block managers from directly overwriting files that belong to capability/probe execution details unless allowed.
2. Use file path heuristics on `.agent-memory/` and evidence targets.
3. Keep the hook failure message actionable.

### Task 6.2: Add a summary-sync hook
Files:
- Create: `hooks/summary-sync-guard.js`

Steps:
1. When manager-owned files change, ensure summary files are updated or explicitly acknowledged.
2. Enforce the new summary-first architecture.

### Task 6.3: Add a probe-evidence guard
Files:
- Create: `hooks/probe-evidence-guard.js`

Steps:
1. Acceptance report writes must reference probe-produced evidence when a probe was required by route/contract.
2. Reuse the current evidence-verifier philosophy, but make it probe-aware.

### Task 6.4: Keep / extend existing hooks
Files:
- Modify: `hooks/evidence-verifier.js`
- Modify: `hooks/features-json-guard.js`

Steps:
1. Preserve current protections.
2. Update wording to fit the managed-agents architecture.
3. Ensure compatibility with new files.

## Phase 7: OpenCode Installer / Config Integration

### Task 7.1: Update setup and uninstall scripts for new skills + hooks
Files:
- Modify: `setup.sh`
- Modify: `uninstall.sh`

Steps:
1. Install/symlink all new skills.
2. Install/symlink hooks into the OpenCode hooks location.
3. Keep idempotent behavior.
4. Update uninstall accordingly.

### Task 7.2: Expand OMO category config
Files:
- Modify: `oh-my-opencode.json`

Steps:
1. Keep existing categories.
2. Add categories suited to capability/probe dispatch (for example a browser / verification focused category if supported by your OMO conventions).
3. Keep backward compatibility for current commands.

## Phase 8: Documentation and Migration Guide

### Task 8.1: Add migration notes for existing users
Files:
- Create: `docs/managed-agents-migration.md`

Steps:
1. Explain what changed conceptually.
2. Explain what old entrypoints still work.
3. Explain how capability/probe agents should be dispatched.
4. Explain why this is more aligned with the managed-agents article.

## Verification Plan

1. Run markdown/config sanity checks:
   - read modified files for consistency
   - ensure setup/uninstall lists match created skill directories
2. Run syntax validation for hooks and scripts:
   - `node --check hooks/*.js`
   - `bash -n setup.sh uninstall.sh`
3. Verify JSON validity:
   - `python3 -m json.tool oh-my-opencode.json`
   - `python3 -m json.tool control/config/routing-table.json`
4. Verify the plan and README align with the new architecture.
5. Verify there is no remaining wording that still treats `drive` or `check` as universal do-everything agents.

## Execution Strategy

Implement in this order:
1. architecture + plan docs
2. manager skill rewrites
3. capability/probe skills
4. memory summary layer
5. hooks
6. setup/config integration
7. final verification

This ordering preserves repo coherence and keeps OpenCode installation paths correct while the architecture expands.

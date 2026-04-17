---
name: control
description: Use when a long-running or multi-phase project should be handled from one main thread while planning, execution, memory, and acceptance are coordinated through shared files and fresh subagents. Supports AUTO-PILOT MODE for fully autonomous execution. Includes a Task Router Gate that automatically decides whether to use Control or delegate to Sisyphus directly.
---

# Control

## Overview

Run a long project from one main thread. The user should not have to manually coordinate planner, executor, and checker threads.

This skill is the conductor that coordinates all other skills to achieve complete autonomous execution.

Agent prompts are defined in `agents/` (planner.md, executor.md, checker.md) and rendered with `{{variable}}` substitution before dispatch. Routing rules live in `config/routing-table.json`. Error handling policies live in `config/error-handling.json`.

## Task Router Gate (自动决策)

**CRITICAL**: Before doing anything, Control MUST run the Task Router Gate to decide whether to use the full harness or delegate to Sisyphus directly.

### Step 1: Classify the Request

Evaluate the user's request against these criteria:

| Criterion | Sisyphus (direct) | Control (harness) |
|-----------|-------------------|-------------------|
| Files to change | 1-2 files | 3+ files |
| Planning needed | No — scope is clear | Yes — impact unclear |
| Acceptance needed | No — trivial to verify | Yes — quality matters |
| Interruption risk | Low — one session | High — may span sessions |
| User said "ulw" | Yes — wants ultrathink mode | No — wants autonomous |
| User said "/control" | No | Yes — explicitly requested |

### Step 2: Decision Rules

**Route to Sisyphus (direct execution, no harness) when ANY of these are true:**
- Request is purely informational ("explain X", "what does Y do")
- Request is a single-line change ("add console.log", "change config value")
- Request is a code review ("look at this code, any issues?")
- Request is a file operation ("create directory", "rename file")
- Request is a quick prototype ("just write a demo")
- User explicitly said "ulw" (wants ultrathink mode, not autonomous harness)

**Route to Control (full harness) when ANY of these are true:**
- User explicitly said "/control"
- Request involves building a new feature or capability
- Request involves refactoring a module with unclear impact
- Request involves building a product from scratch
- Request involves long-running work that may span multiple sessions
- Request involves quality-critical work (needs independent acceptance)

### Step 3: Execute Decision

**If routed to Sisyphus:**
- Do NOT initialize `.agent-memory/`
- Do NOT launch planner/executor/checker
- Execute directly using Sisyphus's own capabilities
- Tell the user: "This is a simple task — executing directly without harness overhead."

**If routed to Control:**
- Proceed with the full harness workflow (Semantic Lock Gate → Task Typing → Auto-Pilot or manual rounds)
- If the request was borderline and user didn't explicitly request harness, briefly explain why: "This involves 3+ files and quality-critical changes — using the full harness for planning, execution, and independent acceptance."

## Semantic Lock Gate

**CRITICAL**: If the task could be misunderstood at the level of core meaning, control must lock the meaning first.

Do not start implementation from a guess when any of these are true:
- more than one materially different interpretation of success exists
- a scaffold, wrapper, page, or local fallback could be mistaken for the real core result
- the user is pointing at an old system, old behavior, or old capability and expects true parity
- the user clearly cares about who or what performs the core work, not only whether some output exists
- the task can "look complete" while the central capability is still fake, partial, or manually patched

When one of those is true:
1. stop before execution
2. ask the user 1 to 3 short, direct clarification questions
3. write the confirmed meaning into the planning files
4. do not let planning or execution proceed until that lock exists

## Task Typing Gate

**CRITICAL**: Control must classify the task type first before choosing any flow.

Allowed task types:
- `判断型`: understand, compare, review, audit, explain, or decide
- `修复型`: fix a bug, regression, broken workflow, or broken test
- `改造型`: add or change a focused capability inside an existing project
- `能力型`: make the system truly able to do something deeper, less visible, or more rule-heavy
- `产品型`: expand, build, or reshape a larger product or subsystem

Record the chosen task type and reason in `.agent-memory/orchestration-status.md`.

Use `config/routing-table.json` as the single static rule table for:
- task type → flow tier → default route
- resolved skill stack and startup package
- required deliverables and anti-shallow hard bars
- upgrade/downgrade triggers

### Flow Tier Rules

After task type is chosen, assign a flow tier:
- `轻流程`: one bounded goal, small localized changes, no long-lived coordination needed
- `中流程`: focused capability change spanning several files, independent acceptance important
- `重流程`: product-shaped task, whole-task planning must be externalized, many rounds expected

### Unique Main Entry By Task Type

| Task Type | Default Route |
|-----------|---------------|
| `判断型` | `check` or direct analysis |
| `修复型` | `drive` + `check` |
| `改造型` | `plan` if needed, then `drive` + `check` |
| `能力型` | `capability-planner` + `plan` + `drive` + `check` |
| `产品型` | `feature-planner` + `plan` + multi-round `drive` + `check` |

## Change Inbox Gate

Any newly arrived request must enter `.agent-memory/inbox/` first.
Do not let a new request jump directly into `task.md`, `working-memory.md`, or `round-contract.md`.

Minimum rule:
1. add the request to `.agent-memory/inbox/index.jsonl`
2. create or update `.agent-memory/inbox/REQ-<id>.md`
3. classify: no plan impact / local-only / global
4. only then may approved target files be updated

## No-Early-Stop Gate

**CRITICAL**: Control must not stop just because it can describe the current gap clearly.

These do **not** count as task completion:
- "we found the missing pieces"
- "the current state is now understood"
- "the planner has now written the right plan"

Control may stop only when:
1. core outstanding items are empty
2. a real blocker remains after reasonable attempts
3. the user explicitly asks to pause

## Context Anxiety Detection

**CRITICAL**: Watch for completion-signaling language that masks unfinished work.

The following phrases in your own output are red flags that require immediate self-correction:
- "看起来差不多了" / "looks about done" — Verify with evidence, not feelings
- "后续可以改进" / "can be improved later" — Is "later" tracked? If not, it won't happen
- "基本完成" / "basically complete" — "Basically" means "not actually". Check the contract
- "应该可以工作" / "should work" — "Should" means "not tested". Run the verification

When you catch yourself using these phrases:
1. Stop immediately
2. Re-read the round contract criteria
3. Run actual verification (tests, build, manual check)
4. Only proceed if evidence confirms completion

## Required Role Split

**CRITICAL**: For any long-running, multi-phase, or auto-pilot run, control MUST launch independent subagents for these three roles:

- `规划代理`: owns product expansion and whole-task planning
- `执行代理`: owns the current round's implementation and execution writeback
- `验收代理`: owns contract review and acceptance decisions

Single-thread role-playing is only allowed in `降级模式`, and only when subagent launch failed or the user explicitly asked to avoid subagents. If `降级模式` is used, record it in `.agent-memory/orchestration-status.md` and tell the user.

### Degraded Mode (降级模式)

**Purpose**: Allow the harness to work in environments where `task()` is unavailable (e.g., vanilla Claude Code, Codex, non-OMO setups).

**Activation**: Degraded mode activates automatically when ANY of these are true:
- `task()` call fails or is unavailable
- User explicitly requests single-thread mode
- Environment detection shows non-OMO platform

**Behavioral Differences in Degraded Mode**:

| Aspect | Multi-Agent Mode | Degraded Mode |
|--------|-----------------|---------------|
| Role execution | Separate subagents | Same agent plays all roles sequentially |
| Contract negotiation | Executor↔Checker turn-taking | Skipped (same agent writes and reviews) |
| Parallel execution | Possible | Not possible |
| orchestration-status.md | Full (agent IDs, Expected Next Writer) | Simplified (current role, current phase only) |
| File ownership | Enforced per-agent | Self-enforced per-role-phase |
| State management | Unchanged | Unchanged |
| Scoring framework | Unchanged | Unchanged |
| Quality guardrails | Unchanged | Unchanged |
| Git checkpoint | Unchanged | Unchanged |

**Degraded Mode Workflow**:
1. Control reads `config/routing-table.json`, checks `execution_mode.single_thread_allowed` for the selected route
2. If `single_thread_allowed: false` (e.g., P-H1): warn user that product-type tasks require multi-agent mode, offer to downgrade to `改造型` route
3. If `single_thread_allowed: true`: proceed with sequential role execution
4. Execute roles in order: planner phase → executor phase → checker phase
5. Between role switches, explicitly write a role-transition marker to `orchestration-status.md`
6. Self-assessment replaces contract negotiation: executor writes contract, immediately reviews it against the task.md criteria before proceeding

**Recording**:
```
## Execution Mode
Mode: 降级模式 (single-thread)
Reason: task() unavailable | user requested | non-OMO environment
Activated: {timestamp}
```

### Multi-Agent Coordination

See `config/coordination-rules.md` for the complete file ownership model, state machine, and deadlock prevention rules.

Key principles:
- Each file has a single write-owner per round (see ownership table in coordination-rules.md)
- `activity.jsonl` and `journal.md` are append-only shared files
- `orchestration-status.md` is the state machine — agents must verify `Expected Next Writer` matches their role before writing
- Round contract is the coordination point between executor and checker (turn-taking, not simultaneous)
- If no agent writes for 10 minutes, control re-dispatches the expected writer or triggers context reset

## OMO Integration Rules

### Task Dispatch

Use `task()` to dispatch work. Do not use `spawn_agent`.

```
Planner:  task(category="deep", load_skills=["plan", "feature-planner"], run_in_background=true)
Executor: task(category="deep", load_skills=["drive", "memory"], run_in_background=true)
Checker:  task(category="quick", load_skills=["check"], run_in_background=true)
```

Category mapping is defined in `config/routing-table.json` → `category_mapping`.

### State Synchronization

After each `task()` completes:
1. Read `.agent-memory/orchestration-status.md`
2. Verify `Expected Next Writer` matches the next expected role
3. If mismatch, re-dispatch the correct agent

### Agent Prompt Rendering

Agent prompts in `agents/` use `{{variable}}` syntax. Before dispatch, render:
- `{{project_path}}` → current working directory
- `{{task_type}}` → classified task type
- `{{flow_tier}}` → assigned flow tier
- `{{route_id}}` → selected route from routing table
- `{{#if is_product_task}}...{{/if}}` → conditional sections

## Memory Initialization Logic

When starting:
1. Check if `.agent-memory/` exists:
   - If exists: read `autopilot-status.md`, check status (in progress / completed / interrupted)
   - If not exists: initialize new project with `/memory init {path}`
2. Verify initialization: `.agent-memory/task.md` exists, `.agent-memory/autopilot-status.md` exists, `evidence/` directory exists

Before initialization completes, write into `.agent-memory/orchestration-status.md`:
- `Task Type`, `Flow Tier`, `Reason For Lane`, `Inbox Index File`, `Inbox Pending Count`

## features.json Protection Rule

**CRITICAL**: Once `features.json` is generated by `/feature-planner`, it is an immutable contract.
- Executing agents may ONLY change the `passes` field (from `false` to `true`)
- No other field may be modified, deleted, or reordered
- New features must go through the inbox gate and a new `/feature-planner` pass

Control must enforce this rule. If an executor modifies feature definitions instead of just the `passes` field, control must revert the change and restart that executor.

## Git Checkpoint Discipline

**CRITICAL**: Git commits are the primary state recovery mechanism.
- Every completed feature or round of work MUST be committed
- Commit messages must be descriptive (used for orientation at session start)
- The codebase after commit must be in "clean state" — no major bugs, orderly, merge-ready
- Session startup MUST include `git log --oneline -20` for orientation

## Anti-Shallow Feedback Loop

After any `rejected` or meaningful `needs-follow-up` result:
1. Read `.agent-memory/acceptance-report.md`
2. Extract: failure class / what was shallow / what proof was missing
3. Write or update `.agent-memory/quality-guardrails.md`
4. Require the next round contract to include those raised bars

## Dynamic Quality Gate

**CRITICAL**: Quality thresholds are not static. They evolve based on project history.

### Threshold Adjustment Rules

After every `rejected` acceptance:
1. Read the failure class from `acceptance-report.md`
2. Count consecutive rejections for the same failure class
3. Apply threshold adjustment:

| Consecutive Rejections | Action |
|------------------------|--------|
| 1 | Add specific rule to `quality-guardrails.md` |
| 2 | Raise the relevant scoring dimension threshold by +0.5 |
| 3+ | Escalate to user — the harness cannot solve this alone |

After every 5 consecutive `accepted` results:
1. Review `quality-guardrails.md` for rules that haven't been triggered
2. Candidate rules for relaxation (but do NOT remove automatically)
3. Log the observation in `acceptance-lessons.md`

### Guardrails File Format

```markdown
# Quality Guardrails

## Active Rules (newest first)

### Rule G-003 (added: 2026-04-03, trigger: consecutive_rejection)
- Source failure: executor produced stub API endpoints
- Raised bar: All API endpoints must return real data, not hardcoded/mock responses
- Scoring impact: 功能完整性 threshold raised from 8 → 8.5
- Relaxation candidate: No (triggered 2x in last 10 rounds)

### Rule G-002 (added: 2026-04-02, trigger: missing_evidence)
- Source failure: checker accepted without running playwright
- Raised bar: Web acceptance MUST include screenshot evidence
- Scoring impact: None (process rule, not score adjustment)
- Relaxation candidate: No

### Rule G-001 (added: 2026-04-01, trigger: shallow_work)
- Source failure: login form had no error handling
- Raised bar: Every user-facing form must handle validation errors
- Scoring impact: 产品深度 threshold raised from 7 → 7.5
- Relaxation candidate: Yes (not triggered in last 20 rounds)
```

### Integration with Sprint Contract

When `quality-guardrails.md` exists:
1. Executor MUST read it before drafting Sprint Contract
2. All active rules MUST be incorporated into the contract's acceptance criteria
3. Checker MUST verify each active rule during acceptance
4. Any rule violation → automatic `rejected` regardless of other scores

## Error Handling and Auto-Recovery

Follow `config/error-handling.json` for retry policies and recovery procedures.

### Retry Policies
- Planner: max 3 retries, 30 min timeout
- Executor: max 2 retries, force round restart on consecutive failures
- Checker: max 1 retry, escalate to user on repeated rejection

### Auto-Recovery Procedures

Control must detect and handle these failure conditions automatically:

**Executor failures:**
1. `smoke_test_failure` → `git revert` to last good commit, re-run smoke test
2. `features_json_corruption` → `git checkout` features.json, restart executor with warning
3. `context_anxiety` → trigger Context Reset via `memory/scripts/context_reset.sh`
4. `consecutive_failures` (2x same round) → force fresh round restart
5. `empty_output` → restart agent (OMO `empty-task-response-detector` hook assists)

**Checker failures:**
1. `leniency_drift` → force calibration check, re-read calibration-examples.md
2. `no_evidence_verification` → reject acceptance, add rule to quality-guardrails.md
3. `repeated_rejection` (3x same feature) → escalate to user with last 3 rejection reasons

**Planner failures:**
1. `missing_required_files` → restart planner (check files per route in error-handling.json)
2. `empty_output` → restart agent

### Recovery Decision Tree

```
Agent returns → Check output
  ├── Output empty? → restart_agent (max retries from config)
  ├── Required files missing? → restart_agent
  ├── Smoke test failed? → git revert → re-run smoke
  ├── features.json corrupted? → git checkout → restart
  ├── Context anxiety signals? → context_reset.sh → fresh agent
  ├── Consecutive failures? → force_round_restart
  └── Max retries exceeded? → escalate_to_user
```

### OMO Platform Hooks That Assist Recovery
- `delegate-task-retry`: Automatically retries failed task() dispatches
- `unstable-agent-babysitter`: Monitors agent health, intervenes on timeout/anomaly
- `edit-error-recovery`: Auto-recovers from Edit tool failures
- `json-error-recovery`: Auto-recovers from JSON parse errors in state files
- `empty-task-response-detector`: Detects when a subagent returns nothing
- `write-existing-file-guard`: Prevents overwriting files without reading first

## Auto-Pilot Mode

Auto-pilot is a `重流程` mode only. Activates when ALL of these are true:
1. User explicitly requests autonomous execution
2. Feature list exists (product-spec.md + features.json generated)
3. Done criteria are clear (task.md has specific done criteria)
4. Task typing says this is `产品型` and `重流程`

### Auto-Pilot Workflow

```
T=0:   User request
T=2m:  Task Typing → record in orchestration-status.md
T=5m:  Initialize .agent-memory/ via /memory
T=10m: Launch planner via task(category="deep", load_skills=["plan"])
       NOTE: If using OMO, prefer Prometheus for planning:
       task(subagent_type="prometheus", run_in_background=true)
       Prometheus will interview → plan → Momus review → output:
       - product-spec.md, features.json, features-summary.md, task.md
T=15m: If Prometheus not available, fall back to planner agent + /feature-planner + /plan
T=20m: Auto-Pilot loop begins

Loop for each feature (sorted by priority and dependencies):
  1. Dispatch executor Agent for current round
  2. Executor drafts Sprint Contract (round-contract.md) with specific testable criteria
  3. Checker reviews Sprint Contract (contract-review mode):
     a. If approved-for-execution → proceed to step 4
     b. If needs-revision → Executor revises contract → repeat step 3
     c. Max 3 negotiation rounds, then escalate to user
  4. Executor implements against the approved contract
  5. Executor performs self-assessment before submitting:
     a.对照 Sprint Contract 逐条检查
     b.检查 stub 功能、未处理错误路径、边界情况
     c.诚实列出潜在问题
  6. Checker performs independent verification:
     a. Read calibration-examples.md for judgment calibration
     b. Apply 4-dimension scoring framework (产品深度/功能完整性/视觉设计/代码质量)
     c. Use Playwright MCP for web apps, curl for APIs, Bash for CLI
     d. Score each dimension, check against hard thresholds
  7. If accepted (all thresholds met + final score ≥7.0): mark complete, continue
  8. If rejected: restart executor round, retry up to 3 times
  9. If still fail: mark blocked, continue to next
  10. Every 3 acceptances: run Evaluator Calibration Check
  11. Every 10 features or 30 minutes: report progress
  12. Monitor Context Reset triggers (see memory/SKILL.md)

Final:
  1. Checker runs whole-product final acceptance
  2. Apply 4-dimension scoring to entire product
  3. Only if final acceptance passes: generate final report
```

### Interruption Conditions

Auto-pilot stops and escalates to user when:
1. Too many P0 blockers: >= 5 P0 features blocked
2. Consecutive failures: >= 5 features fail in a row
3. Critical blocker affecting >10 other features
4. Environment issue: missing tools, credentials, or access
5. User manually stops auto-pilot
6. Time limit exceeded (default: 12 hours)

## Flow Tier Summary

| Task Type | Default Flow Tier | Default Route |
|-----------|-------------------|---------------|
| `判断型` | 轻流程 | check / direct analysis |
| `修复型` | 中流程 | drive + check |
| `改造型` | 中流程 | plan if needed + drive + check |
| `能力型` | 中流程 | capability-planner + plan + drive + check |
| `产品型` | 重流程 | feature-planner + plan + drive + check |

## Harness Simplification Principle

> "Every harness component encodes an assumption about what the model can't do on its own. Those assumptions should be stress-tested regularly as models improve."

- Never remove multiple components at once
- Remove one component, measure impact over 10-20 tasks before deciding
- If metrics degrade: restore immediately
- Re-evaluate with each model upgrade

See `references/simplification-principles.md` for full methodology.

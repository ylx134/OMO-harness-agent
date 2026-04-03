---
name: control
description: Use when a long-running or multi-phase project should be handled from one main thread while planning, execution, memory, and acceptance are coordinated through shared files and fresh subagents. Supports AUTO-PILOT MODE for fully autonomous execution.
---

# Control

## Overview

Run a long project from one main thread. The user should not have to manually coordinate planner, executor, and checker threads.

This skill is the conductor that coordinates all other skills to achieve complete autonomous execution.

Agent prompts are defined in `agents/` (planner.md, executor.md, checker.md) and rendered with `{{variable}}` substitution before dispatch. Routing rules live in `config/routing-table.json`. Error handling policies live in `config/error-handling.json`.

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

## Error Handling

Follow `config/error-handling.json` for retry policies:
- Planner: max 3 retries, 30 min timeout
- Executor: max 2 retries, force round restart on consecutive failures
- Checker: max 1 retry, escalate to user on repeated rejection

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
T=10m: Launch planner + checker via task()
T=15m: Planner runs /feature-planner + /plan → writes product-spec.md, features.json, task.md
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

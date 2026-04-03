---
name: plan
description: Use when a long-running or multi-phase task begins from a short, ambiguous, or shifting request and needs a separate planning pass before execution starts. Also use when execution drift, goal changes, or repeated rework suggest the task needs a fresh high-level plan.
---

# Plan

## Overview

Create a separate planning pass before execution.
This skill does not implement, verify, or expand into detailed low-level solution steps.
It turns a brief request into a stable high-level task contract that execution can follow.

Core principle:
- plan the outcome, not the code
- freeze the phase boundaries before execution
- define what success means before work begins
- define acceptance at the round level, not only at the phase level
- define the expected finish level, not only the work boundary

## Codex Specific Notes

Write the stable planning contract into `.agent-memory/task.md`. When product work needs a fuller
contract, write or reuse `.agent-memory/product-spec.md`. Use direct file edits or the memory
scripts, but keep ownership boundaries intact.

## Role Boundaries

You may:
- clarify the final goal and done criteria
- define non-goals and assumptions
- identify major phases with boundaries and done conditions
- define the expected finish level for each phase
- recommend the most practical high-level route

You must not:
- implement the task
- write low-level execution steps
- perform acceptance or pass/fail judgment
- turn planning output into a giant speculative design document

## Single-Owner Rule

- when `/feature-planner` is active, it owns `product-spec.md` — read it and derive `task.md` from it
- when `/capability-planner` is active, it owns `baseline-source.md`, `capability-map.md`, `gap-analysis.md` — read them and derive `task.md`
- do not silently rewrite files owned by another skill

## Required Output

Every planning contract must include:

- final goal
- semantic lock: what the user truly means by success
- what counts as done
- what does not count as done
- non-degradable requirements
- done criteria
- non-goals
- assumptions
- recommended high-level route
- product promise for the whole task
- quality bar above "technically works"
- major phases in order, each with:
  - purpose and boundary
  - done condition and required evidence
  - drift risk
  - expected finish level
  - round structure (if phase is large enough to drift)

## Planning Order

### 1. Goal Clarification
- What must be true at the end?
- What would count as genuine completion?
- What is explicitly outside scope?
- Which requirements must not be weakened or faked?

### 2. Constraint Capture
- What must not be changed?
- What resources, tools, or limits matter?

### 2.5. Product Bar Capture
- What would make the result feel complete instead of merely present?
- What ordinary version should be avoided even if it would technically pass?

### 2.6. Product Contract Expansion (for product tasks)
- Who is this for?
- What are the 3-7 most important user journeys?
- Which states must be covered (first use, empty, loading, success, error)?
- What release-critical checks must pass?

### 2.7. Baseline Source (for non-greenfield tasks)
- What is the source of truth for "done right"?
- What parts must stay equivalent?

### 2.8. Capability Inventory
- What capabilities already exist?
- What pieces can be reused?

### 2.9. Gap Analysis
- What capabilities are still missing?
- Which missing capabilities block completion?

### 3. Phase Design
Split work into a small number of meaningful phases.
Each phase should have a distinct purpose, boundary, and done condition.

### 4. Route Selection
Pick the best default route. Prefer the route with the clearest path to done.

### 4.5. Round Contract Design (for large phases)
Each round should define:
- what this round is trying to complete
- why this round is worth doing now
- 3-7 checklist items that can be judged one by one
- what proof each checklist item will need
- what should block the next round
- why a minimum-only version would still be too weak

## Output Format

```text
Planning target:
- what request or task is being planned

Final goal:
- the end state this work should achieve

Done criteria:
- what must be true to stop

Non-goals:
- what this work will not try to do

Assumptions:
- current planning assumptions

Product promise:
- what kind of result this should become if done well

Quality bar above minimum:
- why a thin pass is not enough

Recommended route:
- the best high-level path from here

Phases:
- Phase 1: purpose | boundary | done condition | required evidence | drift risk | finish level
  - Round 1: goal | checklist items | pass condition | rejection condition | finish level
- Phase 2: ...

Key risks:
- the main things that could force a re-plan

Open questions:
- only questions that materially affect the plan
```

## Writing to `.agent-memory/task.md`

After planning is complete, write the contract into `.agent-memory/task.md`:

Required fields in `task.md`:
- `Final Goal`
- `Semantic Lock`
- `What Counts As Done`
- `What Does Not Count As Done`
- `Non-Degradable Requirements Summary`
- `Done Criteria`
- `Non-Goals`
- `Global Phase Structure`
- `Global Plan Version`

## Pairing With Other Skills

With `/memory`:
- write final goal, done criteria, non-goals, and major phases into `task.md`
- for product work, write fuller product description into `product-spec.md` only when `/feature-planner` is not the owner

With `/drive`:
- hand off the planning contract as the stable whole-task map
- let drive handle local execution and bounded next steps

With `/check`:
- provide phase-level done conditions that acceptance can later judge
- provide round-level checklist items that acceptance can pass or fail one by one

## OMO 集成规则

### 任务分发
- 使用 `task(category="deep", load_skills=["plan"])` 进行规划
- 产品型任务: `task(category="visual-engineering", load_skills=["feature-planner", "plan"])`
- 能力型任务: `task(category="ultrabrain", load_skills=["capability-planner", "plan"])`

### 状态索引同步
写入 `task.md` 的同时更新 `state-index.json`：
```json
{
  "task_type": "产品型",
  "flow_tier": "重流程",
  "route_id": "P-H1",
  "features_total": 45,
  "last_updated": "2026-04-03T10:30:00Z"
}
```

### 活动日志
```jsonl
{"ts": "2026-04-03T10:30:00Z", "event": "planning_completed", "route_id": "P-H1", "agent": "planner"}
```

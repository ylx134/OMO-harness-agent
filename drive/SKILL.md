---
name: drive
description: Use when the user wants Codex to keep going without asking after every step, execute a task end-to-end, manage a multi-step task with nested subproblems, or continue a long-running effort across many turns without losing the main goal.
---

# Drive

## Overview

Drive the task forward in bounded loops until the defined done condition is met.
Optimize for correct-goal reduction first, then distance-to-goal reduction.

Do not stop for routine confirmation. Pause only for real blockers, missing authority, or decisions
with meaningful downside.

## Codex Specific Notes

Read state files directly from disk, run commands with `exec_command`, and use `apply_patch` for
manual file edits. Evidence still lives under `evidence/`, and helper scripts under
`memory/scripts/` should be preferred when they already cover the needed writeback.

## Execution Objective

**CRITICAL**: Drive must not treat "something visible was built" as the default measure of progress.

Default objective by task type:
- `判断型`: clarify the decision and leave evidence, not implementation
- `修复型`: eliminate the failing behavior and prove the failure is gone
- `改造型`: close the current capability gap without widening scope
- `能力型`: close the current blocking capability gap and prove the hidden ability now exists
- `产品型`: build the next bounded product slice that still matches the whole-product contract

## Memory Governance

When paired with `/memory`, treat these as durable sources of truth:
- `.agent-memory/task.md` → whole-task direction
- `.agent-memory/product-spec.md` → whole-product contract (product routes only)
- `.agent-memory/working-memory.md` → active phase
- `.agent-memory/round-contract.md` → current round contract
- `.agent-memory/acceptance-report.md` → latest acceptance decision

## Session Startup Sequence

**CRITICAL**: Every new execution session MUST follow this startup sequence IN ORDER.
Do not skip steps. Do not begin new work until all steps pass.

### Mandatory Startup Steps

1. **Orient**:
   - Run `pwd` to confirm working directory
   - Read `claude-progress.txt` to review recent work
   - Read `git log --oneline -20` to understand recent commits

2. **Read State Files** (in order):
   - `.agent-memory/handoff.md` (if resuming)
   - `.agent-memory/task.md`
   - `.agent-memory/working-memory.md`
   - `.agent-memory/round-contract.md`
   - `.agent-memory/acceptance-report.md`
   - `.agent-memory/orchestration-status.md`
   - `.agent-memory/quality-guardrails.md` (if exists)

   If the live route packet is missing required route fields, **STOP** and tighten routing first.

3. **Start Environment** (MANDATORY):
   - Run `init.sh` to start the development environment
   - If `init.sh` does not exist, **create it first** then run it
   - Verify the environment started correctly (check port, process, etc.)

4. **Run Smoke Test** (MANDATORY — not optional):
   - Run basic end-to-end smoke test to verify existing functionality works
   - For web apps: use `/playwright-cli` or `/agent-browser` to load main page and verify it renders
   - For CLI tools: run main command with `--help` or basic input
   - For APIs: send a health check request via curl
   - Capture output to `evidence/smoke-tests/session-{timestamp}.txt`
   - **If smoke test fails: STOP. Fix the regression BEFORE any new work.**
   - Regression fix is the highest priority — do not build on a broken foundation

5. **Verify Previous Round** (if work was done before):
   - Read last 3 entries in `execution-status.md`
   - Perform a quick spot-check that previous work still functions

6. **Confirm Direction**:
   - State the whole-task goal in one sentence
   - State the active phase in one sentence
   - State the next bounded action in one sentence

Log startup completion to `journal.md`.

## Route Correctness Gate

Before doing new implementation work, answer these four questions:

1. Is the current task type still correct?
2. Is the current flow tier still correct?
3. Is this round really the next highest-value slice?
4. Is there a clear proof path that will let acceptance verify this result later?

If any answer is "no" or "unclear": do not implement yet. Return to `/control` or `/plan`.

## Core-Work Gate

Before implementation, ask:
- Are we building the real core thing, or only a wrapper around it?
- Would this still look "complete" even if the central capability were missing?
- Are we drifting toward a scaffold or placeholder instead of the core result?

If yes or maybe: tighten the round contract first.

## Goal Layers

Keep these three layers separate at all times:
- whole-task goal: what the entire task must achieve
- phase goal: what the current phase must achieve
- current action: the next bounded step being taken now

## Mission Contract

Before substantial work, state a compact mission contract:
- Final goal
- Done criteria
- Constraints and non-goals
- Assumptions being made
- Task type and current flow tier
- Current best path

## Round Contract Drafting

When the current round is still thin or underspecified:
- draft the round contract first (planning action)
- implement only after draft is accepted
- do not treat a submitted draft as implementation progress

## Plan Change Gate

Before changing any plan, classify the proposed change:
- `global`: changes final goal, done criteria, non-goals, or global phase structure
- `local`: changes only how the current phase should be executed
- `none`: changes neither plan

## Main Loop

Repeat until done criteria are satisfied or a hard blocker remains:

### 1. Re-anchor
Restate the final goal and current gap in one or two sentences.

### 2. Choose the next move
Pick the action that most directly reduces the gap to done. Prefer:
- Verification over speculation
- Direction correction over premature implementation
- Small batches of execution over open-ended exploration

### 3. Check plan impact before committing
If impact is `global`:
1. Update `.agent-memory/task.md` first (Write/Edit tool)
2. Re-anchor against revised global plan
3. Update `.agent-memory/working-memory.md`
4. Update `.agent-memory/plan-graph.md` and `.agent-memory/execution-status.md`
5. Record in `decisions.md`

If impact is `local`:
1. Update `.agent-memory/working-memory.md`
2. Update `.agent-memory/plan-graph.md` and `.agent-memory/execution-status.md`

## Re-Anchor Triggers

Stop and re-anchor when:
- two attempts in a row produce no meaningful progress
- the current action can no longer be explained in relation to the whole-task goal
- the memory files no longer agree with each other

## Execution Rhythm

Work in bounded chunks:
1. Do 1-3 concrete actions
2. Verify the result with the smallest reliable check
3. Capture evidence to `evidence/`
4. Update mission ledger and task-tree node state
5. Update `.agent-memory/working-memory.md`
6. Update `.agent-memory/execution-status.md`
7. Update `.agent-memory/evidence-ledger.md`
8. Update `.agent-memory/orchestration-status.md`
9. Generate fresh handoff before phase ends or thread is likely abandoned

## Formal Writeback Duty (CRITICAL)

**CRITICAL**: After completing ANY work, update these files.

### 1. execution-status.md

```markdown
## Latest Execution

Feature ID: {id}
Status: completed
Timestamp: {timestamp}
Changed Files:
  - {file1}
  - {file2}
Evidence Collected:
  - evidence/screenshots/{id}-{step}.png
  - evidence/command-outputs/{id}-test-output.txt
Ready for Acceptance: Yes
```

### 2. evidence-ledger.md

```markdown
## Evidence for {id}

E001:
  - Claim: "{claim}"
  - Proof: evidence/command-outputs/{id}-output.txt
  - Result: {result}
```

### 3. orchestration-status.md

```markdown
Current Routing Step: drive-complete -> check-pending
Last Formal Writer: drive
Expected Next Writer: check
Owed Writeback: none
```

### 4. Git Checkpoint (MANDATORY)

**CRITICAL**: After completing each feature or round of work, create a git commit.
Git commits are the primary state recovery mechanism.

```bash
git add -A
git commit -m "feat({feature-id}): {descriptive message of what was implemented}"
```

Rules:
- One commit per completed feature or meaningful work chunk
- Commit messages must be descriptive — they are used by next session for orientation
- Never commit broken state — verify with smoke test before committing
- The codebase after commit must be in **clean state**: no major bugs, orderly, documented,
  appropriate for a developer to begin work on the next feature without cleanup

### Writeback Verification

Before claiming the round is ready for acceptance, verify:
- [ ] `execution-status.md` updated with latest execution
- [ ] `evidence-ledger.md` has claim-to-proof mapping
- [ ] Evidence files exist at specified paths
- [ ] `orchestration-status.md` says who writes next
- [ ] `round-contract.md` includes a runnable entry package
- [ ] **Git commit created** with descriptive message
- [ ] **Smoke test passes** after commit

**Execution writeback is part of the work itself, not paperwork after the work.**

## Task Tree

Organize meaningful work as a tree:

```text
1 auth-fix [P0] in_progress
  1.1 reproduce-failure [done]
  1.2 isolate-root-cause [in_progress]
    1.2.1 inspect-session-refresh [done]
  1.3 implement-fix [todo]
  1.4 verify-fix [todo]
2 cleanup-followups [todo, P2]
```

Traversal: ordered depth-first. Return to parent after all required children resolved.

## Self-Assessment Limits

The executing agent may state "I believe this phase is complete" but must not treat its own
judgment as final acceptance. Always hand off to `/check` for independent verification.

## Communication Pattern

Short progress updates:
- Goal: final goal in one short line
- Current node: active node path and short purpose
- What changed: newest confirmed progress
- Next step: one bounded action
- Why: one sentence showing fit to both active node and final goal

Escalate only when:
- credentials or external access are missing
- next action is destructive or hard to reverse
- task is blocked after reasonable attempts

## Session Close Protocol (MANDATORY)

**CRITICAL**: Before ending a session or handing off, complete ALL of these steps:

1. **Verify clean state**: run smoke test to confirm nothing is broken
2. **Git commit**: all work committed with descriptive message
3. **Update `claude-progress.txt`**: write what was completed, what is in progress, any blockers
4. **Update `.agent-memory/` files**: working-memory.md, execution-status.md, orchestration-status.md
5. **Generate `handoff.md`** if phase is ending or thread is likely to be abandoned

"Clean state" means:
- No major bugs in committed code
- Code is orderly and documented
- A developer (or next agent session) could begin the next feature without cleanup
- Equivalent to merge-ready code on main branch

## OMO 并行执行规则

### 子任务拆分
将当前轮次拆分为独立子任务，使用 `task(run_in_background=true)` 并行执行：
- 前端修改 → `task(category="visual-engineering", load_skills=["frontend-design"])`
- 后端修改 → `task(category="deep", load_skills=["drive"])`
- 测试更新 → `task(category="quick", load_skills=["test-driven-development"])`

### 自动验证
- 每个子任务完成后，自动触发 smoke test
- 失败则自动重启对应子任务，最多 3 次
- 所有子任务完成后，统一执行 git commit

## OMO 状态同步规则

### 状态文件更新
每次工具调用后，同步更新 `state-index.json`：
```json
{
  "features_completed": 12,
  "features_total": 45,
  "current_round": 3,
  "last_updated": "2026-04-03T10:30:00Z"
}
```

### 活动日志
记录关键事件到 `activity.jsonl`：
```jsonl
{"ts": "2026-04-03T10:30:00Z", "event": "skill_invoked", "skill": "drive", "agent": "executor"}
{"ts": "2026-04-03T10:35:00Z", "event": "file_written", "file": "execution-status.md", "agent": "executor"}
{"ts": "2026-04-03T10:40:00Z", "event": "git_commit", "message": "feat: F001", "agent": "executor"}
```

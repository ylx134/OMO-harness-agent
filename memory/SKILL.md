---
name: memory
description: Use when a task is long-running, multi-step, likely to trigger session compaction, or needs reliable cross-thread continuation. Also use when the user asks to keep records, preserve key steps, resume later, or prevent logs from bloating chat context.
---

# Memory

## Overview

Externalize durable task state into small, structured workspace files so chat context stays lean.
Prefer reading a tiny working set first, then extend into richer records only when needed.

## Platform Integration Notes

The OMO platform provides built-in compaction protection via two hooks:
- `compaction-context-injector`: Automatically injects critical session state before compaction
- `compaction-todo-preserver`: Preserves todo list state across compaction events

These replace the custom `compaction-protector.js` hook. No manual compaction protection
is needed in skill prompts — the platform handles it.

Use the helper scripts in `memory/scripts/` whenever they already cover initialization,
handoff-building, inbox resolution, or machine-readable event logging.
The `.agent-memory/` directory still lives in the workspace root, and evidence still lives under
`evidence/`.

## Core Principle

Treat chat as a transient execution surface, not the source of truth for long-running work.

Store durable state in workspace files under `.agent-memory/`:
- `task.md` — stable whole-task facts
- `product-spec.md` — full product contract (product routes only)
- `baseline-source.md` — reference source (non-greenfield work)
- `capability-map.md` — current capability inventory
- `gap-analysis.md` — missing capabilities
- `quality-guardrails.md` — raised bars after shallow work
- `working-memory.md` — current execution state
- `round-contract.md` — active round contract
- `acceptance-report.md` — acceptance decision
- `evidence-ledger.md` — claim-to-proof mapping
- `orchestration-status.md` — routing and helper state
- `plan-graph.md` — full plan graph
- `execution-status.md` — progress board
- `acceptance-lessons.md` — acceptance misses
- `decisions.md` — durable reasoning
- `journal.md` — detailed history
- `activity.jsonl` — machine-readable event log
- `inbox/` — pending new requests
- `handoff.md` — thread-to-thread transfer

## Default Layout

```text
{workspace-root}/
├── init.sh                  # Environment startup script (CRITICAL)
├── claude-progress.txt      # Human-readable progress log (CRITICAL)
├── .agent-memory/
│   ├── task.md
│   ├── product-spec.md
│   ├── baseline-source.md
│   ├── capability-map.md
│   ├── gap-analysis.md
│   ├── quality-guardrails.md
│   ├── working-memory.md
│   ├── round-contract.md
│   ├── acceptance-report.md
│   ├── evidence-ledger.md
│   ├── orchestration-status.md
│   ├── plan-graph.md
│   ├── execution-status.md
│   ├── acceptance-lessons.md
│   ├── decisions.md
│   ├── journal.md
│   ├── activity.jsonl
│   ├── inbox/
│   │   ├── index.jsonl
│   │   └── REQ-<id>.md
│   └── handoff.md
│
└── evidence/
    ├── screenshots/
    ├── command-outputs/
    ├── api-traces/
    ├── artifacts/
    └── smoke-tests/
```

## Template Files vs Output Files

### Starter Templates (in `memory/templates/`, copied at init)
- `task.md` — whole-task goal and global plan
- `working-memory.md` — current phase execution state
- `round-contract.md` — current round's written contract
- `acceptance-report.md` — current round's acceptance decision
- `orchestration-status.md` — routing and agent state

### Output Files (created during execution, NOT pre-templated)
- `product-spec.md` — created by `/feature-planner`
- `features.json` — created by `/feature-planner`
- `features-summary.md` — created by `/feature-planner`
- `baseline-source.md` — created by `/capability-planner`
- `capability-map.md` — created by `/capability-planner`
- `gap-analysis.md` — created by `/capability-planner`
- `quality-guardrails.md` — created by `/check` after rejection
- `evidence-ledger.md` — created by `/drive` during execution
- `plan-graph.md` — created by `/plan` or `/drive`
- `execution-status.md` — created by `/drive` during execution
- `acceptance-lessons.md` — created by `/check` when a miss is found
- `decisions.md` — appended by any skill making durable decisions
- `journal.md` — appended for detailed operational history
- `activity.jsonl` — appended for machine-readable events
- `handoff.md` — generated before thread switch

These output files are created on demand. Do not pre-create empty placeholders for them.

## Initialization

When invoked with `init {project_path}`:

1. Run `memory/scripts/init_memory.sh` to create `.agent-memory/`
2. Ensure `evidence/` and its subdirectories exist
3. Copy starter templates into `.agent-memory/`
4. Create `init.sh` in the workspace root
5. Create `claude-progress.txt` in the workspace root
6. Return the created file list

### init.sh — Environment Startup Script (CRITICAL)

**CRITICAL**: Every project MUST have an `init.sh` at workspace root. This script saves tokens by
preventing agents from re-deriving how to start the project each session.

The initializer agent must create `init.sh` containing:
- project dependency installation (if needed)
- development server startup command
- any required environment setup

Example:
```bash
#!/bin/bash
# Auto-generated by memory init — do not delete
cd "$(dirname "$0")"
npm install --silent 2>/dev/null
npm run dev &
echo "Dev server started on http://localhost:3000"
```

The script must be executable (`chmod +x init.sh`).

### claude-progress.txt — Human-Readable Progress Log (CRITICAL)

**CRITICAL**: A simple, concise progress file that agents read first at session start.

This file is simpler than `.agent-memory/execution-status.md` — it answers "what happened recently"
in plain language.

Format:
```
=== Session 3 (2026-04-02 09:30) ===
Completed: F001 Audio import, F002 Waveform display, F003 Play/pause controls
Working on: F004 Timeline scrubbing
Blocked: None
Notes: All smoke tests passing. Dev server runs on port 3000.

=== Session 2 (2026-04-02 08:00) ===
Completed: F001 Audio import
Working on: F002 Waveform display
Blocked: None
```

Update this file at the END of every session, BEFORE generating `handoff.md`.

## File Write Boundaries

Each memory file has a strict role:

**task.md** stores stable whole-task facts only:
- final goal, done criteria, non-goals
- semantic lock, what counts as done, what does not count as done
- non-degradable requirement summary
- global phase structure
- pointer to product-spec.md (product work only)

**product-spec.md** stores full product contract (product routes only):
- semantic confirmation result
- core completion signals, fake completion traps
- non-degradable requirements
- target users, problem to solve
- core user journeys, user stories
- key screens, technical considerations
- data model expectations
- important states (first use, empty, loading, success, error)
- release-critical checks

**working-memory.md** stores current-phase state only:
- based-on global plan version
- active phase, current round
- phase contract state
- phase goal, phase target level
- pointer to active round contract
- pointer to active acceptance report
- bounded next actions
- latest evidence, current blockers

**round-contract.md** stores current round's written contract:
- what this round will do / will not do
- why this round is worth doing now
- what level of finish this round is aiming for
- round checklist with pass conditions
- what proof each item needs
- runnable entry package (startup, main path, error path)

**acceptance-report.md** stores current round's acceptance decision:
- which round contract was reviewed
- checklist results, hard gate results
- primary failure class (if not accepted)
- what evidence was used / missing
- whether scope drift was found
- decision: accepted / rejected / needs-follow-up

**evidence-ledger.md** stores current round's evidence map:
- evidence id, contract item supported
- exact claim supported
- who produced it, where it lives
- whether acceptance reused it
- open evidence gaps

**orchestration-status.md** stores routing and helper state:
- task type, flow tier, reason for lane
- planner/executor/checker agent ids and state
- current routing step
- last formal writer, expected next writer
- owed writeback

## State Layers

Always keep these three layers separate:
- whole-task goal: what entire task must achieve
- phase goal: what current phase must achieve
- current action: next bounded step being executed now

Rules:
- current action must never overwrite whole-task goal
- phase goal must never silently replace whole-task goal
- if uncertain, treat change as local first

## Protected Fields

These fields are protected and should change rarely:
- final goal
- whole-task done criteria
- non-goals
- global phase structure

Do not edit protected fields unless the change is clearly global.

## Plan Synchronization

Every durable decision should be checked for plan impact:
- `global`: changes goal, done criteria, phase ordering, or whole-task structure
- `local`: changes only current phase's execution steps
- `none`: preserves both plans

If impact is `global`:
1. Update `task.md` first
2. Increment global plan version
3. Update `working-memory.md` to align with revised global phase
4. Record decision in `decisions.md`

If impact is `local`:
1. Update `working-memory.md`
2. Keep global plan version unchanged
3. Record decision in `decisions.md`

## Read Policy

Use this read order unless concrete need says otherwise:
1. `task.md`
2. `product-spec.md` (when current route depends on it)
3. `baseline-source.md` (non-greenfield work)
4. `capability-map.md`, `gap-analysis.md` (capability work)
5. `quality-guardrails.md` (if exists)
6. `working-memory.md`
7. `round-contract.md`
8. `acceptance-report.md`
9. `evidence-ledger.md`
10. `orchestration-status.md`
11. `plan-graph.md`
12. `execution-status.md`
13. `handoff.md` (when resuming)
14. `acceptance-lessons.md` (when doing acceptance)
15. `decisions.md` (for decision rationale only)
16. `journal.md` (for deep history only)

Never default to loading everything.

## Thread Switch And Handoff

Before ending a phase or moving to a new thread, generate `handoff.md`.

Include:
- what the whole-task plan is
- which global phase is active now
- what the local plan is for that phase
- where to inspect full plan graph and latest execution status

The new thread should read `handoff.md` first, then `task.md`, then `working-memory.md`.

## Anti-Bloat Rules

- Do not copy chat transcripts into memory files
- Do not paste full logs into `working-memory.md` or `handoff.md`
- Prefer file paths plus one-line conclusions over embedded data
- Keep current-state files short enough to scan quickly
- Use `journal.md` for detail, but do not re-read it by default
- Use `activity.jsonl` for machine replay, not human-first reading

## OMO 上下文管理

### 压缩感知
- 检测到上下文接近限制时，自动压缩 `.agent-memory/journal.md`
- 保留关键状态文件，归档历史证据
- 在压缩前生成 `handoff.md` 确保状态可恢复

### 自动同步
- 每次工具调用后，异步更新 `orchestration-status.md`
- 使用 OMO 的 `PostToolUse` hook 确保状态一致性

## Context Reset 触发机制

### 问题
模型在上下文窗口快满时会出现"上下文焦虑"——提前收尾、重复已完成的工作、或宣布不存在的完成。Compaction（就地压缩）不足以解决这个问题，需要 Context Reset（清空上下文 + 结构化 handoff）。

### 触发条件

满足以下任一条件时，必须触发 Context Reset：

1. **重复工作检测**: 模型开始重复之前已做过的工作
   - 迹象：git diff 显示修改的是已提交过的文件，且改动相似
   - 验证：对比 `activity.jsonl` 中最近的 `file_written` 事件

2. **提前宣布完成**: 模型说"看起来差不多了"但 features.json 还有大量未完成
   - 迹象：`features.json` 中 `passes: false` 的条目 > 50%
   - 验证：读取 `state-index.json` 的 `features_completed / features_total`

3. **上下文接近限制**: 对话 token 数接近模型上下文限制的 80%
   - 迹象：模型开始省略工具调用、跳过验证步骤
   - 验证：检查当前会话的消息数量

4. **上下文焦虑信号**: 模型表现出不正常的收尾行为
   - 迹象：说"代码已经可以工作了"但不做测试
   - 迹象：跳过 round-contract 中的验收标准
   - 迹象：用"后续可以改进"代替当前应该完成的工作

### Reset 流程

```
1. 生成 handoff.md（完整的状态快照）
2. git commit 当前所有工作
3. 记录 activity.jsonl 事件：
   {"time": "...", "event_type": "context_reset", "reason": "...", "agent": "..."}
4. 启动全新 agent 会话
5. 新 agent 的启动序列：
   a. 读取 handoff.md（首要）
   b. 读取 task.md
   c. 读取 working-memory.md
   d. 读取 state-index.json
   e. 运行 git log --oneline -20
   f. 运行 init.sh + smoke test
   g. 从 handoff.md 中的"下一步"继续
```

### handoff.md 要求（Reset 专用）

Context Reset 生成的 handoff.md 必须包含：

```markdown
# Context Reset Handoff

## 当前状态
- 任务类型：{task_type}
- 路由 ID：{route_id}
- 当前轮次：{current_round}
- 已完成功能：{features_completed}/{features_total}

## 最近完成的工作
- {最近 3 个 git commit 的描述}

## 当前进行中
- {正在做的功能}
- {已写到哪一步}

## 下一步（精确到具体操作）
- {下一个应该执行的具体动作}

## 已知问题
- {已发现但未修复的 bug}
- {已知的 stub 功能}

## 关键文件位置
- 产品规格：product-spec.md
- 功能列表：features.json
- 当前合同：round-contract.md
- 质量护栏：quality-guardrails.md（如果存在）
```

### Reset 脚本

使用 `memory/scripts/context_reset.sh <workspace-root> <reset-reason>` 执行标准化的 Context Reset 流程。

支持的 reset reason：
- `tool-count-limit` — Helper exceeded 50 tool calls
- `context-usage-high` — Context window > 70%
- `re-anchor-failure` — 3 consecutive re-anchor failures
- `drift-detected` — Helper changing protected definitions
- `coherence-loss` — Memory files disagree
- `churn-pattern` — Activity without progress
- `restart-signal` — Acceptance requested restart
- `user-request` — User explicitly requested reset

## state-index.json 规范

### 用途
机器可读的状态索引层，供 Hooks 和脚本快速读取，不替代 markdown 文件。

### 位置
`.agent-memory/state-index.json`

### Schema
```json
{
  "$schema": "file://./templates/state-index-schema.json",
  "task_type": "产品型 | 能力型 | 改造型 | 修复型 | 判断型",
  "flow_tier": "重流程 | 中流程 | 轻流程",
  "route_id": "P-H1 | A-M1 | C-M1 | F-M1 | J-L1",
  "current_phase": "planning | execution | acceptance | complete",
  "current_round": 1,
  "features_completed": 0,
  "features_total": 0,
  "blockers_count": 0,
  "last_updated": "2026-04-03T10:30:00Z"
}
```

### 更新时机
- memory init 时创建
- 每次状态变更时同步更新（task type 变化、round 推进、feature 完成、blocker 增减）

## activity.jsonl 规范

### 事件格式
每行一个 JSON 对象，追加写入：
```jsonl
{"time": "2026-04-03T10:30:00Z", "event_type": "agent_spawned", "type": "planner", "id": "agent-abc"}
{"time": "2026-04-03T10:35:00Z", "event_type": "skill_invoked", "skill": "feature-planner", "agent": "agent-abc"}
{"time": "2026-04-03T10:40:00Z", "event_type": "file_written", "file": "product-spec.md", "agent": "agent-abc"}
{"time": "2026-04-03T10:45:00Z", "event_type": "agent_completed", "type": "planner", "id": "agent-abc", "status": "success"}
{"time": "2026-04-03T10:45:01Z", "event_type": "state_index_updated", "route_id": "P-H1", "round": 3}
{"time": "2026-04-03T10:50:00Z", "event_type": "git_commit", "message": "feat: F001", "agent": "executor"}
{"time": "2026-04-03T10:55:00Z", "event_type": "acceptance_completed", "decision": "accepted", "round": 1}
```

### 事件类型
| 事件 | 字段 | 触发时机 |
|------|------|----------|
| `agent_spawned` | type, id | 启动子代理 |
| `agent_completed` | type, id, status | 子代理完成 |
| `skill_invoked` | skill, agent | 调用技能 |
| `file_written` | file, agent | 写入状态文件 |
| `state_index_updated` | route_id, round | 更新索引 |
| `git_commit` | message, agent | 代码提交 |
| `acceptance_completed` | decision, round | 验收完成 |
| `inbox_received` | req_id | 收到新请求 |
| `inbox_resolved` | req_id, action | 处理收件箱 |

# Orchestration Status

## Route

Route Id: {J-L1 | F-M1 | C-M1 | A-M1 | P-H1}
Task Type: {判断型 | 修复型 | 改造型 | 能力型 | 产品型}
Flow Tier: {轻流程 | 中流程 | 重流程}
Reason For Lane: {Why this lane was chosen}
Routing Contract Row: {Row reference}
Resolved Skill Stack: {e.g., plan → drive → check}
Default Main Route: {e.g., drive + check}

## Required Files

Required Startup Files: {list}
Required Planning Files: {list}
Required Execution Files: {list}
Required Acceptance Gates: {list}
Required Deliverables: {list}
Missing Deliverables: {list or "none"}
Route Blocking Gaps: {list or "none"}

## Agent State

Planner Agent Id: {agent id or "none"}
Planner Agent State: {active | idle | closed | not-launched}

Executor Agent Id: {agent id or "none"}
Executor Agent State: {active | idle | closed | not-launched}

Checker Agent Id: {agent id or "none"}
Checker Agent State: {active | idle | closed | not-launched}

Agent Launch Policy: {persistent-planner-checker + per-round-executor}

## Routing State

Current Routing Step: {e.g., drive-complete -> check-pending}
Last Formal Writer: {planner | drive | check | control}
Expected Next Writer: {planner | drive | check | control}
Negotiation Round: 0

## Handoff State

Formal Handoff State: {none | pending | complete}
Owed Writeback: {list of missing files or "none"}

## Run Mode

Run Mode: {normal | single-thread-degraded (only when selected route explicitly allows it)}
Orchestration Proof Level: {full | rules-only}

If the selected route forbids single-thread execution, keep `Run Mode: normal`, leave agent states as `not-launched`, and record the missing-subagent condition in `Route Blocking Gaps`.

## Inbox

Inbox Index File: .agent-memory/inbox/index.jsonl
Inbox Pending Count: 0
Active Inbox Request: none
Inbox Merge Permission: require-triage

## Active Phase

{Mirror from working-memory.md when handoff or inbox scripts need it}

## Active Round

{Mirror from working-memory.md when handoff or inbox scripts need it}

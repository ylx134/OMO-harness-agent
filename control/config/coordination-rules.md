# Multi-Agent Coordination Rules

## File Ownership Model

Each agent role has exclusive write access to specific files. This prevents race conditions
and conflicting writes when planner, executor, and checker operate in parallel.

## Ownership Table

| File | Owner (Write) | Readers |
|------|---------------|---------|
| `product-spec.md` | planner | executor, checker |
| `features.json` | planner (structure), executor (passes field only) | checker |
| `features-summary.md` | planner | executor, checker |
| `task.md` | planner | executor, checker, control |
| `baseline-source.md` | planner | executor, checker |
| `capability-map.md` | planner | executor, checker |
| `gap-analysis.md` | planner | executor, checker |
| `round-contract.md` | executor (draft), checker (approve/reject) | control |
| `execution-status.md` | executor | checker, control |
| `evidence-ledger.md` | executor | checker |
| `acceptance-report.md` | checker | control, executor |
| `acceptance-lessons.md` | checker | control, executor |
| `quality-guardrails.md` | checker (primary), control (escalation) | executor |
| `orchestration-status.md` | control | planner, executor, checker |
| `working-memory.md` | control | planner, executor, checker |
| `state-index.json` | control | all |
| `activity.jsonl` | all (append-only) | all |
| `journal.md` | all (append-only) | all |
| `handoff.md` | control | all (at session start) |
| `autopilot-status.md` | control | all |
| `inbox/` | control | planner |

## Conflict Prevention Rules

### Rule 1: Single Writer Per File Per Round
Only one agent may write to a given file during a single round. If an agent needs data
in a file owned by another agent, it reads the file and writes its own output to a file it owns.

### Rule 2: Append-Only Shared Files
`activity.jsonl` and `journal.md` are append-only. Agents never overwrite or truncate them.
Each entry must include the agent's identity and timestamp.

### Rule 3: Round Contract as Coordination Point
The round contract (`round-contract.md`) is the handoff point between executor and checker:
- Executor writes the draft → checker reads and approves/rejects → executor reads feedback
- They never write to it simultaneously
- Control orchestrates the turn-taking

### Rule 4: Orchestration Status as State Machine
`orchestration-status.md` is the single source of truth for "whose turn is it":

```
Expected Next Writer: planner | executor | checker | control
Current Phase: planning | contract-negotiation | execution | acceptance | complete
```

Before any agent writes, it must verify that `Expected Next Writer` matches its own role.
If mismatch: stop and report to control.

## State Machine

```
                    ┌────────────────────────┐
                    │                        │
                    ▼                        │
┌──────────┐   ┌──────────┐   ┌──────────┐  │  ┌──────────┐
│ planning │──▶│ contract │──▶│execution │──┼─▶│acceptance│
│          │   │ negotia- │   │          │  │  │          │
│ planner  │   │ tion     │   │ executor │  │  │ checker  │
│ writes   │   │ exec↔chk │   │ writes   │  │  │ writes   │
└──────────┘   └──────────┘   └──────────┘  │  └────┬─────┘
                                            │       │
                                            │       ▼
                                            │  ┌──────────┐
                                            │  │ decision │
                                            │  │          │
                                            │  │ accepted?│
                                            │  └────┬─────┘
                                            │       │
                                            │   ┌───┴───┐
                                            │   │       │
                                            │  Yes      No
                                            │   │       │
                                            │   ▼       │
                                            │ next      │
                                            │ feature   │
                                            │           │
                                            └───────────┘
                                            (retry round)
```

## Deadlock Prevention

### Timeout-Based Resolution
If no agent has written to any file for 10 minutes:
1. Control reads `orchestration-status.md`
2. Identifies the expected writer
3. Checks if the expected writer is still running
4. If not running: re-dispatch the expected writer
5. If running but stalled: trigger context reset

### Circular Dependency Prevention
Executor and checker must not create circular dependencies:
- Executor must NOT wait for checker feedback during execution (only before, during contract negotiation)
- Checker must NOT request executor changes during acceptance (only report rejection)
- All communication goes through files, not through direct interaction

## Contract Negotiation Protocol

### Turn-Taking Rules
The contract negotiation phase follows strict turn-taking between executor and checker:

1. **Executor drafts**: writes `round-contract.md` with specific testable criteria
2. **Control updates**: sets `Expected Next Writer: checker` in `orchestration-status.md`
3. **Checker reviews**: reads contract, writes approval/rejection into `round-contract.md`
4. **Control updates**: sets `Expected Next Writer: executor` if revision needed
5. **Maximum 3 negotiation rounds** before escalating to user

### Required Contract Fields
Before marking a contract as ready-for-review, it must contain:
- Round goal (what this round will accomplish)
- Checklist items (3-7 specific, testable items)
- Pass conditions for each item
- Required evidence types
- Files in scope
- Runnable entry package (startup, main path, error path)

### Timeout
If no progress on contract negotiation for 15 minutes, control escalates to user.
See `error-handling.json → contract_negotiation` for configuration.

## Degraded Mode Coordination

When running in `降级模式` (single-thread), the coordination rules are simplified.

This section applies only to routes whose `execution_mode.single_thread_allowed` is `true` in `config/routing-table.json`. Routes `F-M1`, `C-M1`, `A-M1`, and `P-H1` are subagent-required and must not use this degraded sequential flow.

### What Changes
- **No parallel execution**: All roles execute sequentially in one thread
- **No Expected Next Writer check**: The single agent transitions between roles explicitly
- **Contract negotiation skipped**: Agent writes contract and self-reviews against task.md criteria
- **File ownership self-enforced**: Agent respects role boundaries by phase, not by agent ID

If a selected route does not allow single-thread execution, control must record a route-blocking gap instead of entering this mode.

### What Stays the Same
- **File roles**: Each file still has a defined purpose and budget
- **Append-only rules**: `activity.jsonl` and `journal.md` remain append-only
- **State machine phases**: planning → execution → acceptance → decision flow is preserved
- **Git checkpoint discipline**: Commits at round boundaries still required

### Degraded Mode State Machine
```
planning → execution → self-acceptance → decision
    ↑                                       ↓
    └──────── retry (if self-rejected) ─────┘
```

### Role Transition Markers
When switching roles in degraded mode, write a transition marker to `orchestration-status.md`:
```
## Role Transition
Previous Role: executor
Current Role: checker
Phase: acceptance
Timestamp: {ISO-8601}
Reason: round implementation complete, entering self-acceptance
```

# File Contract

Use `.agent-memory/` as the durable workspace memory directory.

## Layered Read Order

Read the smallest sufficient layer first.

### Brain
1. `handoff.md` when resuming
2. `brain-brief.md`
3. `route-summary.md`
4. `risk-summary.md`
5. `acceptance-summary.md`
6. `task.md`
7. `working-memory.md`
8. `orchestration-status.md`
9. `managed-agent-state-index.json`

### Managers
1. `task.md`
2. `working-memory.md`
3. `round-contract.md` or `acceptance-report.md`
4. `route-summary.md`
5. `risk-summary.md`
6. `acceptance-summary.md`
7. `orchestration-status.md`
8. `managed-agent-state-index.json`
9. route-specific files only when needed
10. `evidence-ledger.md` only when concrete proof detail is needed

### Hands and probes
1. `task.md`
2. `working-memory.md`
3. `round-contract.md`
4. `route-summary.md`
5. `managed-agent-state-index.json`
6. only the exact detail files and evidence paths required by the assignment

Do not load all files by default.

## Ownership Classes

### Brain-facing summary files
- `brain-brief.md`
- `route-summary.md`
- `risk-summary.md`
- `acceptance-summary.md`

Purpose: compact routing, supervision, escalation, and acceptance snapshots.
Default writers: brain, sometimes managers when explicitly delegated.

### Manager workflow files
- `task.md`
- `working-memory.md`
- `round-contract.md`
- `acceptance-report.md`
- `orchestration-status.md`
- `plan-graph.md`
- `execution-status.md`
- `product-spec.md`
- `baseline-source.md`
- `capability-map.md`
- `gap-analysis.md`
- `quality-guardrails.md`
- `decisions.md`
- `handoff.md`

Purpose: contracts, route state, progress, decisions, and resumption.
Default writers: brain or managers depending on the file.

### Hand/probe detail files
- `evidence-ledger.md`
- `journal.md`
- `activity.jsonl`
- `inbox/`
- `evidence/**`

Purpose: detailed execution history and proof.
Default writers: capability agents and probe agents.
Managers should cite these files instead of rewriting them unless an emergency override is explicitly recorded.

## Summary Sync Rule

If a manager-owned file changes in a way that affects routing, risk, or acceptance, the corresponding summary layer must stay aligned.

Expected summary targets:
- route or contract changes -> `route-summary.md`
- new blockers or boundary exceptions -> `risk-summary.md`
- acceptance state changes -> `acceptance-summary.md`
- whole-run strategy changes -> `brain-brief.md`

Hooks may use `managed-agent-state-index.json` to enforce these boundaries.

## Canonical Hook Index

`managed-agent-state-index.json` is the canonical machine-readable map for:
- actor classes
- file ownership
- summary/detail boundaries
- summary sync expectations
- evidence directory rules
- probe requirements

Legacy `state-index.json` may still exist for backward compatibility, but hooks should prefer `managed-agent-state-index.json` when present.

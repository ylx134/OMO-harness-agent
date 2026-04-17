---
name: memory
description: Use when a task is long-running, multi-step, likely to trigger session compaction, or needs durable state that survives manager/hand/probe delegation across threads.
---

# Memory

## Overview

Use `.agent-memory/` as the durable state layer for the managed-agents architecture.
Keep the brain on summaries, keep managers on contracts and workflow state, and keep hands/probes on evidence and detailed execution records.

The goal is not to save everything. The goal is to save the minimum state needed for clean delegation, clean resumption, and clean acceptance.

## Platform Integration Notes

OMO already covers compaction protection with built-in hooks.
This skill adds a summary-first state layout so custom hooks can enforce role boundaries, summary sync, and evidence discipline.

Use the helper scripts in `memory/scripts/` when they already cover initialization, handoff generation, append-only logging, or coherence checks.

Default durable roots:
- `.agent-memory/` — layered task state
- `evidence/` — screenshots, command outputs, traces, artifacts, smoke results

## Managed-Agents State Layers

Always separate state by reader level.

### Layer 1: Brain-facing summaries
These are the first files the global orchestrator should prefer.
- `brain-brief.md`
- `route-summary.md`
- `risk-summary.md`
- `acceptance-summary.md`

These files should stay short, current, and decision-oriented.
They exist so the brain does not need to read raw execution detail by default.

### Layer 2: Manager-facing contracts and workflow state
These define or track active work.
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

These files may be richer than summaries, but they still should not contain raw logs or bulk evidence blobs.

### Layer 3: Hand/probe detail and proof records
These are execution-detail surfaces and evidence surfaces.
- `evidence-ledger.md`
- `journal.md`
- `activity.jsonl`
- `inbox/`
- `evidence/screenshots/`
- `evidence/command-outputs/`
- `evidence/api-traces/`
- `evidence/artifacts/`
- `evidence/smoke-tests/`

Capability agents and probe agents may write here freely within their scope.
Managers should reference these files, not rewrite them unless there is an explicit emergency override.

## Canonical State Index

Managed-agents mode adds a machine-readable index:
- `.agent-memory/managed-agent-state-index.json`

This file records:
- actor classes
- file ownership
- summary/detail boundaries
- probe requirements
- summary sync expectations
- evidence directory conventions

Hooks should prefer this file instead of hard-coding every path rule.

For backward compatibility, legacy tooling may still keep `.agent-memory/state-index.json` around.
When both exist, `managed-agent-state-index.json` is the source of truth for layered ownership and hook enforcement.

## Default Layout

```text
{workspace-root}/
├── init.sh
├── claude-progress.txt
├── .agent-memory/
│   ├── brain-brief.md
│   ├── route-summary.md
│   ├── risk-summary.md
│   ├── acceptance-summary.md
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
│   ├── handoff.md
│   ├── journal.md
│   ├── activity.jsonl
│   ├── managed-agent-state-index.json
│   ├── state-index.json              # optional legacy compatibility file
│   └── inbox/
│       ├── index.jsonl
│       └── REQ-<id>.md
└── evidence/
    ├── screenshots/
    ├── command-outputs/
    ├── api-traces/
    ├── artifacts/
    └── smoke-tests/
```

## Template Policy

### Pre-templated starter files
Create these at init time if missing:
- `brain-brief.md`
- `route-summary.md`
- `risk-summary.md`
- `acceptance-summary.md`
- `task.md`
- `working-memory.md`
- `round-contract.md`
- `acceptance-report.md`
- `orchestration-status.md`
- `managed-agent-state-index.json`

### Create-on-demand files
Create when the route actually needs them:
- `product-spec.md`
- `features.json`
- `features-summary.md`
- `baseline-source.md`
- `capability-map.md`
- `gap-analysis.md`
- `quality-guardrails.md`
- `evidence-ledger.md`
- `plan-graph.md`
- `execution-status.md`
- `acceptance-lessons.md`
- `decisions.md`
- `handoff.md`
- `journal.md`
- `activity.jsonl`

Do not pre-fill optional detail files with empty noise if the route has not used them yet.

## Read Order

Read the smallest useful layer first.

### Brain default read order
1. `brain-brief.md`
2. `route-summary.md`
3. `risk-summary.md`
4. `acceptance-summary.md`
5. `task.md`
6. `working-memory.md`
7. `orchestration-status.md`
8. `managed-agent-state-index.json`
9. `handoff.md` when resuming

### Manager default read order
1. `task.md`
2. `working-memory.md`
3. `round-contract.md` or `acceptance-report.md` as applicable
4. `route-summary.md`
5. `risk-summary.md`
6. `acceptance-summary.md`
7. `orchestration-status.md`
8. `managed-agent-state-index.json`
9. route-specific files such as `product-spec.md`, `baseline-source.md`, `capability-map.md`, `gap-analysis.md`
10. `evidence-ledger.md` only when proof detail is needed

### Hand/probe default read order
1. `task.md`
2. `working-memory.md`
3. `round-contract.md`
4. `route-summary.md`
5. `managed-agent-state-index.json`
6. only the exact detail files needed for assigned work

Never default to loading all state files.

## File Ownership Rules

### Brain-owned summary files
The orchestrator owns:
- `brain-brief.md`
- `route-summary.md`
- `risk-summary.md`
- `acceptance-summary.md`

Managers may propose content for these files, but the brain-facing summary should remain compact and stable enough for fast routing.

### Manager-owned workflow files
Managers own:
- `task.md`
- `working-memory.md`
- `round-contract.md`
- `acceptance-report.md`
- `orchestration-status.md`
- `plan-graph.md`
- `execution-status.md`

Managers should write summaries of delegated work, not raw transcripts of delegated work.

### Capability/probe-owned detail files
Hands and probes own:
- `evidence-ledger.md`
- `journal.md`
- `activity.jsonl`
- `evidence/**`

Managers may cite these outputs, but should avoid replacing them wholesale.
If a manager must patch them directly, record the exception in `risk-summary.md` or `brain-brief.md` and use an explicit override note.

## Summary-First Writeback Rules

When manager-level work changes meaningfully, at least one summary file should stay aligned.
Use these expectations:
- route changes or contract changes -> update `route-summary.md`
- new blockers, instability, missing delegation, or override events -> update `risk-summary.md`
- acceptance progress or decision changes -> update `acceptance-summary.md`
- whole-run routing or strategic changes -> update `brain-brief.md`

The rule is not “rewrite every summary every time.”
The rule is “do not leave the brain blind after manager state changes.”

## Evidence Discipline

Acceptance should judge based on evidence gathered by hands and probes.

Use these patterns:
- browser/UI proof -> `evidence/screenshots/`
- shell/build/test proof -> `evidence/command-outputs/`
- API proof -> `evidence/api-traces/`
- generated-file proof -> `evidence/artifacts/`
- smoke or regression proof -> `evidence/smoke-tests/`

`evidence-ledger.md` should map claims to evidence ids and file paths.
`acceptance-report.md` should cite the proof it relied on.
`acceptance-summary.md` should compress the decision, not duplicate the entire report.

When a route or contract requires probes, acceptance should cite probe-produced evidence, not only manager narrative.

## Initialization

When invoked with `init {project_path}`:
1. Run `memory/scripts/init_memory.sh`
2. Ensure `.agent-memory/` exists
3. Ensure `evidence/` subdirectories exist
4. Copy starter templates if missing
5. Create `managed-agent-state-index.json`
6. Optionally maintain `state-index.json` for legacy tooling
7. Create `init.sh` and `claude-progress.txt` if missing

The initializer must be idempotent. Never overwrite an existing workspace file unless the user explicitly asked for regeneration.

## Handoff and Resume

Before a thread switch or context reset:
1. update `brain-brief.md`
2. update the relevant summary files
3. generate `handoff.md`
4. ensure `working-memory.md` and `orchestration-status.md` point to the current phase and next writer

A fresh thread should read:
1. `handoff.md` when present
2. `brain-brief.md`
3. `route-summary.md`
4. `risk-summary.md`
5. `acceptance-summary.md`
6. `task.md`
7. `working-memory.md`
8. `managed-agent-state-index.json`

## Anti-Bloat Rules

- Do not paste raw logs into summary files
- Do not make the brain read `journal.md` by default
- Prefer file paths plus one-line conclusions over embedded blobs
- Keep summary files brief enough for fast routing
- Keep manager files actionable, not encyclopedic
- Keep detail files rich enough to verify, but organized by evidence path

## Managed-Agents Operating Principle

A healthy run looks like this:
- brain reads summaries
- managers read contracts and status
- hands execute narrowly
- probes verify narrowly
- acceptance cites evidence
- hooks enforce the boundary when prompts are not enough

If a file write would blur those roles, prefer adding or updating the correct layer rather than stuffing more detail into the wrong file.

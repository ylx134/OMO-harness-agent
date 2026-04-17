# Managed-Agents Coordination Rules

## Purpose

These rules define layered state ownership for the OMO harness after the managed-agents refactor.

The key change is that ownership is no longer described only by old role names.
It is now described by layer:
- orchestrator / brain
- workflow managers
- capability agents
- probe agents

The objective is to keep summaries, contracts, detailed execution, and detailed verification from collapsing back into the same thread.

## Layer Responsibilities

### L1 Orchestrator (`control`)
Writes:
- route selection state
- orchestration-status.md
- inbox state
- escalation records
- summary-level supervision notes

Reads:
- manager summaries
- final acceptance decisions
- blocker summaries

Default restriction:
- do not read raw execution evidence unless escalation requires it
- do not overwrite manager-owned contracts except to resolve route corruption or blocked transitions

### L2 Workflow Managers (`plan`, `drive`, `check`, plus specialized planners)
Write:
- planning contracts
- round contracts
- execution summaries
- acceptance reports
- quality and risk summaries

Read:
- relevant orchestrator state
- lower-level evidence and local outputs when they need to produce a decision or summary

Default restriction:
- managers should summarize hands/probes instead of reproducing every low-level step inline
- managers should not overwrite each other's core files outside the defined handoff points

### L3 Capability Agents
Write:
- code changes
- shell outputs
- browser walkthrough artifacts
- docs retrieval notes
- evidence packaging outputs

Default restriction:
- do not redefine requirements
- do not issue final acceptance decisions
- do not rewrite top-level route state

### L4 Probe Agents
Write:
- UI observations
- API traces
- regression findings
- artifact validation results

Default restriction:
- return findings and evidence only
- do not declare `accepted` / `rejected`
- do not re-plan the task

## Ownership Table

| File / Surface | Primary Writer | Typical Readers | Notes |
|---|---|---|---|
| `orchestration-status.md` | orchestrator | managers | source of truth for route, phase, next owner |
| `inbox/` | orchestrator | planning-manager | new requests must enter here first |
| `task.md` | planning-manager | execution-manager, acceptance-manager, orchestrator | whole-task contract |
| `product-spec.md` | feature-planner | plan, drive, check | product source contract |
| `features.json` | feature-planner (structure), execution-manager (`passes` only) | check, control | immutable except approved pass markers |
| `features-summary.md` | feature-planner | plan, drive, check, control | summary form for the brain and managers |
| `baseline-source.md` | capability-planner | plan, drive, check | reference baseline |
| `capability-map.md` | capability-planner | plan, drive, check | current capability inventory |
| `gap-analysis.md` | capability-planner / planning-manager | drive, check, control | what still blocks done |
| `working-memory.md` | planning-manager or execution-manager | check, control | active phase / route context |
| `round-contract.md` | execution-manager (draft), acceptance-manager (review outcome) | control | strict handoff point |
| `execution-status.md` | execution-manager | check, control | execution summary, not raw transcript dump |
| `evidence-ledger.md` | execution-manager or evidence-agent under execution-manager control | check | claim-to-proof index |
| `acceptance-report.md` | acceptance-manager | control, drive | final pass/fail/follow-up decision |
| `quality-guardrails.md` | acceptance-manager | drive, control | raised bars after failures or drift |
| `acceptance-lessons.md` | acceptance-manager | control | calibration and drift notes |
| `activity.jsonl` | all | all | append-only shared log |
| `journal.md` | all | all | append-only shared narrative log |
| `evidence/` detail artifacts | capability/probe agents | managers | raw proof store |

## Summary vs Detail Boundary

### Brain-facing summaries
These are the files `control` should prefer:
- `features-summary.md`
- `task.md`
- `execution-status.md`
- `acceptance-report.md`
- `quality-guardrails.md`
- route state inside `orchestration-status.md`

### Manager-facing detail
Managers may inspect:
- `evidence-ledger.md`
- probe outputs
- command traces
- screenshots
- API traces
- generated artifacts

### Hand / probe detail
Capability and probe agents should primarily produce:
- raw command output
- screenshots
- traces
- parsed findings
- artifact copies

Do not stuff all of this raw detail into summary files.

## Handoff Rules

### Rule 1: Single primary writer per contract file
At any given moment, one layer owns the next edit for each contract file.

### Rule 2: Shared logs are append-only
`activity.jsonl` and `journal.md` are append-only.
Never truncate them.

### Rule 3: Round contract is the formal manager handoff
`round-contract.md` is where execution-manager and acceptance-manager coordinate before implementation begins.

Flow:
1. execution-manager drafts
2. orchestrator or route state marks acceptance-manager as next reviewer
3. acceptance-manager approves or requests revision
4. only approved contracts may drive execution

### Rule 4: Probe evidence precedes acceptance on relevant routes
When the route requires browser/API/regression/artifact verification, acceptance-manager must obtain probe-produced evidence before issuing `accepted`, unless it explicitly records why the probe path was impossible.

### Rule 5: Summaries must point to detail, not replace it
Manager summaries should reference evidence paths, probe outputs, and result packets.
They should not pretend that a summary sentence is equivalent to proof.

## State Machine

```text
semantic-lock
  -> route-selection
  -> planning
  -> contract-review
  -> execution
  -> probe-verification
  -> acceptance-decision
  -> next-round or complete
```

Expected owner progression:
- orchestrator
- planning-manager
- execution-manager
- acceptance-manager
- orchestrator

Capability agents and probe agents operate underneath the active manager; they do not become the top-level route owner.

## Deadlock Prevention

If no meaningful state change occurs for the configured timeout window:
1. orchestrator reads `orchestration-status.md`
2. identifies the expected top-level writer
3. checks whether the expected manager is still active
4. re-dispatches or escalates
5. if repeated, review whether the route or contract is wrong

Deadlock symptoms include:
- manager waiting on a file that should have been summarized already
- acceptance waiting for proof that no probe was instructed to gather
- execution continuing after contract rejection
- orchestrator reading raw logs because no summary was written

## Degraded Mode Rules

For the managed-agents harness, degraded mode is a blocked-state recorder, not a valid execution mode.

When required managers / hands / probes are available:
- dispatch them according to route and contract
- record their participation in state and evidence

When required managers / hands / probes are unavailable:
- record a route-blocking gap
- stop the route
- do not silently proceed as a pretend multi-agent run
- do not allow one thread to emulate all roles and still claim normal completion

## Anti-Patterns

Reject these behaviors:
- execution-manager acting as planner, coder, shell runner, evidence clerk, and verifier with no lower-level delegation on a route that requires it
- acceptance-manager accepting based only on execution self-report when probes are required
- orchestrator rewriting low-level detail files to “help” a manager
- raw evidence embedded wholesale into `orchestration-status.md`
- feature structure changes by execution-manager outside the permitted `passes` field

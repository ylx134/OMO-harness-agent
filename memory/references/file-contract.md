# File Contract

Use `.agent-memory/` as the default workspace-local memory directory.

## Read Order

Read the smallest durable state first:

1. `handoff.md` when resuming in a new thread
2. `task.md`
3. `product-spec.md` when the task is product-shaped or the current route still depends on a whole-product contract
4. `baseline-source.md` when the task depends on an existing implementation, reference, or standard
5. `capability-map.md` when the task depends on existing or hidden capabilities
6. `gap-analysis.md` when the task is not greenfield
7. `quality-guardrails.md` when shallow or weakly-proved patterns have already been found
8. `working-memory.md`
9. `round-contract.md`
10. `acceptance-report.md`
11. `evidence-ledger.md`
12. `orchestration-status.md`
13. `plan-graph.md`
14. `execution-status.md`
15. `acceptance-lessons.md` when acceptance is active or a prior miss may tighten current checks
16. `decisions.md` only if rationale matters
17. `journal.md` only if detailed history matters
18. `activity.jsonl` only when state files conflict, replay is needed, or machine diffing is needed
19. `.agent-memory/inbox/index.jsonl` and matching `REQ-<id>.md` only when pending requests exist or handoff points to them

Do not load all memory files by default.

## File Roles

### `task.md`

Stable mission state and the global plan.

Put here:

- final goal
- global plan version
- semantic lock: what the task really means
- what counts as done
- what does not count as done
- non-degradable requirement summary
- pointer to `product-spec.md` when the task is product-shaped
- done criteria
- hard constraints
- non-goals
- global phases or milestones
- high-level sequencing and dependencies
- critical path
- release gate summary
- a few durable file references

Do not put here:

- transient blockers
- detailed step-by-step execution for one phase
- raw logs
- experimental branches

Budget:

- target under 80 lines

### `product-spec.md`

Detailed product contract for the whole task.

This file is required for product-shaped routes.
It is optional for capability-shaped routes.

Put here:

- request snapshot
- semantic confirmation result
- core completion signals
- fake completion traps
- non-degradable requirements
- product promise
- target users
- problems this must solve
- in-scope and out-of-scope product behavior
- success measures
- core user journeys
- user stories
- screens and surfaces
- technical considerations
- data model
- important states such as first use, empty, loading, success, and error
- rules and data expectations
- performance and reliability bar
- release-critical checks
- assumptions and open questions

Do not put here:

- file-by-file implementation steps
- raw logs
- temporary local blockers
- acceptance prose for one round

If a task has core meaning risk, `task.md` and `product-spec.md` must lock that meaning before
execution starts.

Budget:

- long enough to fully describe the product, but still easy to scan section by section

### `baseline-source.md`

Reference source of truth when the task depends on an existing implementation, standard, or known behavior.

Put here:

- baseline type
- baseline artifacts
- what must stay equivalent
- what may differ
- confidence level

### `capability-map.md`

Current inventory of what the system already has.

Put here:

- existing capabilities
- reusable pieces
- hidden rules already found

### `gap-analysis.md`

Explicit list of what is still missing compared to the baseline or desired end state.

Put here:

- missing capabilities
- severity
- whether each gap blocks completion
- order to close gaps

### `quality-guardrails.md`

Raised bars after shallow or weakly-proved results.

Put here:

- repeated shallow failure patterns
- missing proof patterns that now block progress
- new hard requirements for later rounds

### `working-memory.md`

Current execution state.

Put here:

- based-on global plan version
- local plan revision
- active global phase
- current round
- local plan for the current global phase
- pointers to the current round contract and acceptance report
- round checklist state summary
- contract summary
- acceptance summary
- current path
- active assumptions
- freshest evidence
- current blockers
- next step
- only the few files worth reading next

Do not put here:

- whole-task replanning unless it has already been reflected in `task.md`
- old resolved branches
- long command output
- full decision history

Budget:

- target under 100 lines

### `round-contract.md`

Current round contract.

Put here:

- what this round will do
- what this round will not do
- which semantic lock this round is serving
- which done definition this round is serving
- which fake completion traps this round must avoid
- which non-degradable requirements this round must guard
- what level of finish this round is aiming for
- what product promise, experience direction, or quality bar this round is committed to
- what counts as a fuller result, not just a working one
- the round checklist
- what counts as pass for each checklist item
- what proof each checklist item needs
- which checklist items block the next round
- what files, pages, or outputs are in scope
- what evidence the round must make easy to judge later
- what should block the next round
- the runnable entry package:
  - startup or open step
  - health check
  - main path to run
  - error path to run
  - nearby behavior to recheck

Do not put here:

- whole-task replanning
- long acceptance history
- implementation steps beyond what the round needs to be judged

Budget:

- short enough to read and judge quickly

### `acceptance-report.md`

Current round acceptance decision.

Put here:

- the current round id
- which round contract was reviewed
- what was checked
- checklist results
- hard gate results
- primary failure class when not accepted
- direct real checks that were run
- what evidence was used
- what evidence was missing
- which evidence supports which key conclusion
- semantic lock judgment
- done definition judgment
- fake completion trap judgment
- non-degradable requirement judgment
- whether scope drift was found
- what passed and what failed
- whether the round may advance
- whether rework is needed
- what the next action is
- whether the result reached the promised finish level or only the minimum workable slice
- whether any acceptance lesson must be tightened

Do not put here:

- implementation notes
- new plan scope
- long retrospectives

Budget:

- short and decision-focused

### `evidence-ledger.md`

Formal proof map for the current round.

Put here:

- evidence id
- current round id
- contract item or hard gate supported
- exact claim supported or weakened
- who produced it
- whether it came from execution or checker-run verification
- where it lives
- whether acceptance reused or rejected it
- open evidence gaps

Do not put here:

- broad narrative with no evidence id
- repeated screenshots or logs pasted inline
- overall acceptance conclusions that belong in `acceptance-report.md`

Budget:

- short entries, one evidence id per useful proof item

### `orchestration-status.md`

Formal routing and missing-writeback state.

Put here:

- active phase
- active round
- route id
- task type
- flow tier
- reason for lane
- routing contract row
- resolved skill stack
- default main route
- required startup files
- required planning files
- required execution files
- required acceptance gates
- required deliverables
- missing deliverables
- route blocking gaps
- planner agent id and state
- executor agent id and state
- checker agent id and state
- agent launch policy
- current routing step
- last formal writer
- expected next writer
- formal handoff state
- owed writeback
- core outstanding items
- stop permission
- helper status
- routing debt
- emergency patch by the main thread
- restart or route-change trigger

Do not put here:

- implementation detail that belongs in `execution-status.md`
- acceptance reasoning that belongs in `acceptance-report.md`
- hidden reconstruction of missing helper output

Budget:

- one compact current-state view only

### `plan-graph.md`

Persistent whole-run plan map.

Put here:

- top-level phases
- important child nodes
- node ids
- statuses
- dependencies
- current path or active node marker

Do not put here:

- long explanations
- command output
- full retrospective narrative

Budget:

- keep it easy to scan; prefer compact trees and short node titles

### `execution-status.md`

Human-facing progress board for the current run.

Put here:

- current goal
- active global phase
- current path
- node counts or lightweight progress summary
- current focus
- round checklist results
- hard gate results
- recently completed items
- in-progress, blocked, and parked items
- latest milestone notes
- brief pointer to the current `round-contract.md` and `acceptance-report.md`

Do not put here:

- full journal detail
- large copied logs
- repeated plan text already present in `task.md` or `plan-graph.md`

Budget:

- keep it readable enough that a human can inspect progress quickly

### `acceptance-lessons.md`

Short record of where acceptance was too loose and how to be stricter next time.

Put here:

- what earlier acceptance missed
- what signal should have been checked
- what proof must be required next time
- where the tighter rule applies
- how strict the rule now is

Do not put here:

- long retrospectives
- general complaints with no reusable rule
- raw logs or screenshots

Budget:

- terse entries only; one miss should become one reusable rule

### `decisions.md`

Durable decision log.

Each entry should capture:

- change id
- request id when applicable
- what was decided
- plan impact: `global`, `local`, or `none`
- based-on global plan version
- new global plan version when one was created
- superseded global plan version when applicable
- why
- supporting evidence
- whether it supersedes something older
- which files were updated to keep plans synchronized

Budget:

- append-only is fine, but entries should stay terse

### `activity.jsonl`

Append-only machine event log.

Put here:

- timestamp
- event type
- short summary
- route id
- task type
- flow tier
- current phase
- current round
- plan impact
- actor
- status
- based-on global plan version when relevant
- new global plan version when relevant
- superseded global plan version when relevant
- files updated
- evidence ids

Do not put here:

- full command output
- copied screenshots or logs
- long human explanation
- duplicate full-page snapshots from `handoff.md` or `orchestration-status.md`

Budget:

- append-only
- one compact JSON object per meaningful state change

### `.agent-memory/inbox/index.jsonl`

Machine-readable queue of not-yet-merged requests.

Put here:

- request id
- received time
- source
- short summary
- status
- plan impact
- merge state
- merge target
- request file path

### `.agent-memory/inbox/REQ-<id>.md`

Human-readable request card.

Put here:

- original request
- why it appeared now
- based-on global plan version
- impact judgment
- whether it could change the whole-task goal
- suggested merge target
- decision
- merge state
- merged-into global plan version when applicable
- owed writeback
- files to update if accepted
- linked decision
- merged-by change id when applicable

### `memory/scripts/resolve_inbox.sh`

Use this script as the formal gate for inbox resolution.

The script should:

- compare the request's based-on global plan version with the current global plan version
- block merge on version mismatch
- record a formal resolution result
- update inbox summary fields in `orchestration-status.md`
- regenerate `handoff.md`

### `handoff.md`

Cross-thread startup state.

This file should let a fresh thread recover quickly without replaying history.

Put here:

- current goal
- done criteria
- constraints
- compact global plan snapshot
- active global phase
- local plan for that phase
- route id
- routing contract row
- resolved skill stack
- required startup files
- default main route
- required deliverables
- missing deliverables
- route blocking gaps
- current path
- pointers to the current `round-contract.md` and `acceptance-report.md`
- latest evidence
- blockers
- next step
- where to inspect the full plan graph and execution status
- read-first file list

Do not put here:

- long retrospectives
- verbose narrative
- duplicate detail already safe in `journal.md`

Budget:

- target under 80 lines

### `journal.md`

Operational history and deep evidence trail.

Put here:

- checkpoint notes
- command trails
- log paths
- experiment outcomes
- links to outputs worth revisiting

Budget:

- can grow, but archive periodically

## Update Cadence

- Update `task.md` when goals, constraints, phase structure, or the global plan materially change.
- Update `working-memory.md` after each bounded chunk and whenever the active global phase or local
  plan changes.
- Update `round-contract.md` whenever the active round contract changes.
- Update `acceptance-report.md` whenever the current round is reviewed or the acceptance decision changes.
- Update `plan-graph.md` when node structure, dependencies, statuses, or the active path changes.
- Update `execution-status.md` after each bounded chunk so progress is always externally visible.
- Update `acceptance-lessons.md` only when acceptance misses must be captured and tightened.
- Append `decisions.md` for durable decisions, including plan impact and synchronized file updates.
- Append `journal.md` for detailed evidence that might matter later.
- Append `activity.jsonl` for machine-readable key events and plan-impact changes.
- Append inbox entries for newly arrived requests before deciding whether they change the live plan.
- Regenerate `handoff.md` at the end of a phase or before switching threads.

When appending `activity.jsonl`, prefer these event classes:

- `route_selected`
- `plan_changed`
- `round_contract_changed`
- `execution_state_changed`
- `acceptance_changed`
- `handoff_generated`
- `helper_restarted`
- `skill_error`

## Plan Synchronization Rules

- `task.md` is the source of truth for the whole-task plan.
- `working-memory.md` is the source of truth for the current phase's local plan.
- `.agent-memory/inbox/` is the source of truth for requests that are not merged yet.
- `round-contract.md` is the source of truth for the current round contract.
- `acceptance-report.md` is the source of truth for the current round acceptance decision.
- `working-memory.md` is the source of truth for the current phase's local plan and the pointers to
  `round-contract.md` and `acceptance-report.md`.
- If a decision changes the whole-task plan, update `task.md` first, then update
  `working-memory.md`.
- When a whole-task plan change is accepted, increment the global plan version in `task.md`.
- After a whole-task plan change, set `working-memory.md` based-on global plan version to the new
  global plan version and reset the local plan revision.
- If a decision changes only the current phase's execution steps, update `working-memory.md` and
  confirm it still fits `task.md`.
- When a change is local-only, keep the global plan version unchanged and increment only the local
  plan revision in `working-memory.md`.
- Never let `working-memory.md` introduce a new global objective or reorder phases without also
  updating `task.md`.
- Never let a new request bypass `.agent-memory/inbox/` and go straight into `task.md` or
  `working-memory.md`.
- Keep `plan-graph.md`, `execution-status.md`, `round-contract.md`, and `acceptance-report.md`
  synchronized with the latest accepted plan and node state.
- If acceptance is tightened after a miss, write the tightened rule into `acceptance-lessons.md`
  before advancing.

## Compression Rule

When files grow, preserve facts, not narration.

Preferred compaction order:

1. delete resolved blockers from `working-memory.md`
2. collapse assumptions into conclusions
3. move rich detail into `journal.md`
4. keep `plan-graph.md` structural and `execution-status.md` summary-oriented
5. regenerate `handoff.md` from the surviving state

## What Never Belongs In Memory Files

- full chat transcripts
- pasted screenshots as text
- full logs
- giant diffs
- duplicated content across multiple memory files

# Routing Contract

This file is the single static rule table for task routing.

Use it for three things only:

1. choose the task type and flow tier
2. check whether the current route still matches the real goal
3. derive the fixed skill stack, startup package, and required deliverables for the selected route

Do not turn this file into live task state.
Live route choices belong in `.agent-memory/orchestration-status.md`.

## How To Use This Table

For every task:

1. pick the task type from the first matching row
2. take the default flow tier from that row unless stronger evidence says otherwise
3. write the chosen row into `.agent-memory/orchestration-status.md`
4. make `drive` and `check` follow the same row
5. if the route changes later, keep this file unchanged and only update `.agent-memory/orchestration-status.md`

## Route Selection Table

| Route Id | Task Type | What This Really Is | Default Flow Tier | Default Main Route | Required Planning Artifacts | Required Execution Inputs | Required Acceptance Focus | Anti-Shallow Hard Bar | Upgrade Or Downgrade Trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `J-L1` | `判断型` | the user mainly wants a conclusion, comparison, explanation, or review | `轻流程` | direct analysis or `check` | clear question, decision frame, baseline when a comparison target exists | evidence, files under review, current question boundary | correctness of judgment, evidence quality, missing uncertainty | do not pretend a decision task is complete just because a guess sounds plausible | becomes `修复型` or `改造型` when code change becomes the real goal |
| `F-M1` | `修复型` | something already broken must stop failing | `中流程` | `drive + check` | failing example, boundary of the break, baseline if old behavior matters | failure proof, round contract, runnable entry package, recent acceptance result | failure removed, nearby regression absent, proof stronger than “looks fixed” | main failure path and one nearby regression check are both required | becomes heavier if the break exposes wider missing design or repeated replanning |
| `C-M1` | `改造型` | a bounded capability inside an existing system must change | `中流程` | `plan` when needed, then `drive + check` | task framing, baseline when not greenfield, capability map, gap analysis when hidden behavior matters | route packet, current round contract, capability gap being closed, direct proof path | capability gap closed, scope still bounded, no silent widening into product rebuild | do not count visible output alone as progress; the named gap must shrink | becomes `产品型` when the work expands into many slices or whole-surface redesign |
| `A-M1` | `能力型` | the real job is to make the system truly able to do something deeper or less visible | `中流程` by default, `重流程` when many gaps must close | `capability-planner + plan + drive + check` | baseline source, capability map, gap analysis, explicit blocking gaps | route packet, current blocking gap, proof that the hidden ability now exists, raised bars from guardrails | baseline fit, capability fit, no blocking gap left open for this round | do not accept a shell that only looks complete; hidden rule or deeper ability must be proved | becomes `重流程` when many capability gaps or subsystem-wide rewrites are needed |
| `P-H1` | `产品型` | the job is to define or build a wider product or subsystem surface | `重流程` | `feature-planner + plan + multi-round drive + check` | product spec, feature list, release-critical journeys, baseline and gap files when not greenfield | route packet, active round contract, execution status, evidence ledger, quality guardrails | product promise, critical journeys, important states, release gate | do not accept minimum-only slices when the product promise or release bar says fuller depth is required | may downgrade only when the goal is proven much smaller than first classified |

## Route Realization Table

| Route Id | Task Type | Flow Tier | Resolved Skill Stack | First-Hop Startup Package | Required Startup Files | Required Deliverables | Primary Formal Writers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `J-L1` | `判断型` | `轻流程` | direct analysis or `check` | question-boundary package | task.md when durable context matters; acceptance-report.md when `check` is used | answer itself or acceptance-report.md | main thread or checker |
| `F-M1` | `修复型` | `中流程` | `drive -> check` | failing-example package | task.md; baseline-source.md when old behavior matters; working-memory.md; round-contract.md; orchestration-status.md | round-contract.md; execution-status.md; evidence-ledger.md; acceptance-report.md | executor, then checker |
| `C-M1` | `改造型` | `中流程` | `plan? -> drive -> check` | bounded-change package | task.md; baseline-source.md when needed; capability-map.md when hidden behavior matters; gap-analysis.md when not greenfield; working-memory.md; round-contract.md; orchestration-status.md | task.md when plan is used; round-contract.md; execution-status.md; evidence-ledger.md; acceptance-report.md | planner if used, then executor, then checker |
| `A-M1` | `能力型` | `中流程` or `重流程` | `capability-planner -> plan -> drive -> check` | capability-gap package | task.md; baseline-source.md; capability-map.md; gap-analysis.md; quality-guardrails.md when present; working-memory.md; round-contract.md; orchestration-status.md | baseline-source.md; capability-map.md; gap-analysis.md; task.md; round-contract.md; execution-status.md; evidence-ledger.md; acceptance-report.md | capability planner, planner, executor, checker |
| `P-H1` | `产品型` | `重流程` | `feature-planner -> plan -> multi-round drive -> check` | product-start package | task.md; product-spec.md; features.json; features-summary.md; baseline-source.md when needed; gap-analysis.md when not greenfield; working-memory.md; round-contract.md; orchestration-status.md | product-spec.md; features.json; features-summary.md; task.md; round-contract.md; execution-status.md; evidence-ledger.md; acceptance-report.md | feature planner, planner, executor, checker |

## Required Dynamic Route Packet

The live route packet in `.agent-memory/orchestration-status.md` must always record:

- route id
- selected task type
- selected flow tier
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

If the route packet is incomplete, execution or acceptance must stop and tighten it first.

## Execution Mode Policy

- `J-L1` may run on the main thread or use `check` because it is not a harness multi-agent route.
- `F-M1`, `C-M1`, `A-M1`, and `P-H1` are harness multi-agent routes and must not silently fall back to one-thread execution.
- For any route whose `execution_mode.single_thread_allowed` is `false`, failed subagent launch is a route-blocking gap.
- A route-blocking gap must be recorded in `.agent-memory/orchestration-status.md`; it is not permission to continue by role-playing planner, executor, and checker in one thread.

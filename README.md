# OMO Harness Agent

A managed-agents runtime for OpenCode that turns `/control` into a real orchestration entrypoint instead of a prompt convention.

This repo started as an OMO/OpenCode skill pack and has been upgraded into a plugin-governed Harness runtime with:
- authoritative route selection
- durable route/state artifacts
- deferred manager/hand/probe progression
- deliverable-aware acceptance gating
- retry-safe dispatch state
- isolated runtime profiles for Harness vs OMO

In practice, this means you can drive structured work like:
- fix flows (`F-M1`)
- bounded refactors (`C-M1`)
- deep capability upgrades (`A-M1`)
- product-surface builds (`P-H1`)

through explicit command progression instead of hoping one generalist agent behaves correctly.

## What this repo gives you

At a high level, the system now provides:

1. A real Harness plugin
- intercepts `/control`, `/plan`, `/drive`, `/check`
- writes authoritative `.agent-memory/` state
- owns route packet generation and queue progression

2. A layered managed-agents architecture
- L1 brain: `harness-orchestrator`
- L2 managers: `feature-planner`, `capability-planner`, `planning-manager`, `execution-manager`, `acceptance-manager`
- L3 hands: `docs-agent`, `browser-agent`, `code-agent`, `shell-agent`, `evidence-agent`
- L4 probes: `ui-probe-agent`, `api-probe-agent`, `regression-probe-agent`, `artifact-probe-agent`

3. Deferred orchestration
- `/control` performs intake only
- `/plan` advances planning-stage managers
- `/drive` advances execution-manager first, then capability hands one step at a time
- `/check` advances acceptance-manager, then probes, then final closure

4. Real completion semantics
- route state is not allowed to claim `complete` just because queues are empty
- required deliverables must exist with non-placeholder content
- missing deliverables block final closure and leave a retryable state

## Current runtime model

### Intake
`/control ...` writes the authoritative route initialization only.

Artifacts created under `.agent-memory/`:
- `harness-plugin-state.json`
- `orchestration-status.md`
- `managed-agent-state-index.json`
- `route-packet.json`
- `brain-brief.md`
- `route-summary.md`

### Deferred progression
Progression happens through follow-up commands:
- `/plan` -> consume the next planning-stage manager
- `/drive` -> consume `execution-manager` first, then selected capability hands one by one
- `/check` -> consume `acceptance-manager`, then probes one by one, then final acceptance closure

### Dispatch isolation
Deferred actor dispatches are now sent to child sessions rather than the parent orchestration session.

That means:
- the parent session owns queue/state progression
- managers/hands/probes run in child sessions
- parent commands stay short and predictable
- same-session `prompt_async` collisions are reduced

### Retry-safe behavior
If a dispatch fails:
- the pending queue is not advanced incorrectly
- the actor is not falsely marked complete
- `deferredDispatchState` becomes `retryable_error`
- `lastDispatchError` records actor, phase, message, and time
- the same follow-up command can retry the failed actor safely

## Route families

### `F-M1` — fix route
Use for:
- build failures
- regressions
- broken paths that must stop failing

Typical command sequence:
1. `/control 修复构建报错并补上回归验证`
2. `/plan`
3. `/drive`
4. `/drive` repeated for selected hands
5. `/check`
6. `/check` repeated for probes and final closure

### `C-M1` — bounded refactor/change route
Use for:
- scoped internal changes
- behavior-preserving refactors
- bounded subsystem adjustments

Typical sequence:
1. `/control ...`
2. `/plan`
3. `/drive` until execution steps finish
4. `/check` until probes and closure finish

### `A-M1` — capability route
Use for:
- hidden backend/system capability upgrades
- deep functional capability work that is not obvious from the UI alone

Typical sequence:
1. `/control ...`
2. `/plan` (dispatches `capability-planner`)
3. `/plan` (dispatches `planning-manager`)
4. `/drive` repeatedly
5. `/check` repeatedly

### `P-H1` — product route
Use for:
- larger product-surface work
- wider user journey implementation
- release-like product increments

Typical sequence:
1. `/control ...`
2. `/plan` (dispatches `feature-planner`)
3. `/plan` (dispatches `planning-manager`)
4. `/drive` repeatedly
5. `/check` repeatedly

## The key files you should inspect

### 1. `.agent-memory/harness-plugin-state.json`
The authoritative machine-readable route state.

Important fields:
- `routeId`
- `currentPhase`
- `nextExpectedActor`
- `pendingManagers`
- `pendingCapabilityHands`
- `pendingProbes`
- `deferredDispatchState`
- `lastCompletedActor`
- `lastDispatchError`
- `completedDeliverables`
- `childDispatchSessionIDs`

### 2. `.agent-memory/orchestration-status.md`
The human-readable route packet/status summary.

Use this first when you want to understand where the route currently is.

It now includes:
- graph runtime summary fields: `activeStepIds`, `readyStepIds`, `blockedStepIds`, held locks, and signal summary
- a legacy compatibility section so existing queue-based operator habits still work during migration

### 3. `.agent-memory/route-packet.json`
The durable route contract.

Important fields include:
- `reasonForLane`
- `routingContractRow`
- `resolvedSkillStack`
- `requiredStartupFiles`
- `requiredPlanningFiles`
- `requiredExecutionFiles`
- `requiredAcceptanceGates`
- `requiredDeliverables`
- `missingDeliverables`
- `pendingManagers`
- `pendingCapabilityHands`
- `pendingProbes`
- `activeStepIds`
- `readyStepIds`
- `blockedStepIds`
- `heldLocks`
- `signalSummary`
- `legacyCompat`

The queue-shaped fields remain intentionally for one migration cycle so existing tooling does not break while operators gain graph visibility.

### 4. `.agent-memory/managed-agent-state-index.json`
The operator-oriented machine-readable status index.

It now preserves the existing queue-oriented keys and adds:
- `graph_runtime.active_step_ids`
- `graph_runtime.ready_step_ids`
- `graph_runtime.blocked_step_ids`
- `graph_runtime.held_locks`
- `graph_runtime.signal_summary`
- `legacy_compat`

### 5. `.agent-memory/harness-plugin-debug.log`
The runtime truth source for plugin behavior.

Use this when debugging:
- command intake
- deferred dispatch requests
- duplicate dispatch skips
- retryable dispatch errors
- deliverable-gated closure blocking

## Installation

### Install the repo
```bash
git clone git@github.com:ylx134/OMO-harness-agent.git
cd OMO-harness-agent
./setup.sh
```

### Create the isolated launch profiles
```bash
python3 scripts/setup-opencode-profiles.py
```

This creates three launchers in `~/.local/bin/`:
- `opencode-harness`
- `opencode-harness-pure`
- `opencode-omo`

And one convenience shortcut:
- `harness`

## Which launcher should you use?

### `harness`
The shortest and recommended daily command.

Equivalent to:
```bash
opencode-harness-pure --agent harness-orchestrator .
```

If no argument is passed, it starts in the current directory.

### `opencode-harness-pure`
Harness-only runtime.

Loads only the local Harness plugin.

Use this when you want the cleanest, most stable Harness behavior.

Recommended default:
```bash
opencode-harness-pure --agent harness-orchestrator .
```

### `opencode-harness`
Mixed profile.

Loads:
- OMO
- Harness plugin

Useful for compatibility experiments, but noisier than pure Harness.

### `opencode-omo`
OMO-only runtime.

Loads only `oh-my-openagent@latest`.

Use this when you want original OMO/Sisyphus behavior with no Harness plugin involvement.

### `opencode`
The default global OpenCode entrypoint.

Its behavior depends on your default config under `~/.config/opencode/`.
If you want predictable Harness behavior, prefer `harness` or `opencode-harness-pure` instead.

## Recommended usage

### Start Harness mode in the current project
```bash
harness
```

### Start Harness mode in a different directory
```bash
harness /path/to/project
```

### Pure Harness headless server
```bash
opencode-harness-pure serve --port 4123
```

### OMO-only interactive mode
```bash
opencode-omo .
```

## Example end-to-end `F-M1` flow

```text
/control 修复构建报错并补上回归验证
/plan
/drive
/drive
/drive
/drive
/check
/check
/check
/check
```

Healthy final state looks like:
- `currentPhase: "complete"`
- `nextExpectedActor: "none"`
- `pendingManagers: []`
- `pendingCapabilityHands: []`
- `pendingProbes: []`
- `deferredDispatchState: "complete"`

If required artifacts are still missing, final closure will be blocked intentionally and the route will stay retryable instead of falsely claiming completion.

## Example end-to-end `P-H1` flow

```text
/control 为现有系统搭建一个完整产品级功能，覆盖关键用户旅程与发布质量
/plan
/plan
/drive
/drive
/drive
/drive
/drive
/drive
/check
/check
/check
/check
/check
```

## Why completion may be blocked on purpose

The plugin now treats deliverables as part of completion semantics.

That means:
- empty scaffold files do not count as completed deliverables
- routes are not allowed to enter `complete` until required artifacts are real
- final closure can stop with:
  - `deferredDispatchState: retryable_error`
  - `lastDispatchError.actor: acceptance-manager`
  - `lastDispatchError.phase: acceptance-closure`

This is intentional and correct.

## Current status of the project

What is already done:
- stable intake-only `/control`
- authoritative route packet generation
- deferred queue progression through `/plan`, `/drive`, `/check`
- child-session dispatch for actors
- deliverable reconciliation and closure gating
- retry-safe error handling
- isolated Harness / OMO launch profiles
- pure Harness runtime validation

What is still realistic to improve later:
- cleaner human-readable retry guidance
- smarter deliverable semantic validation
- optional auto-progression mode
- provider-aware fallback / budget handling

The core runtime itself is already in a usable state.

## Repository structure

```text
omo-harness-skills/
├── control/                    # L1 orchestration contracts and routing tables
├── plan/                       # planning-manager skill
├── drive/                      # execution-manager skill
├── check/                      # acceptance-manager skill
├── feature-planner/            # product planning skill
├── capability-planner/         # capability planning skill
├── browser-agent/
├── code-agent/
├── shell-agent/
├── docs-agent/
├── evidence-agent/
├── ui-probe-agent/
├── api-probe-agent/
├── regression-probe-agent/
├── artifact-probe-agent/
├── hooks/
├── plugin/
├── agents/
├── docs/
├── setup.sh
├── uninstall.sh
└── scripts/setup-opencode-profiles.py
```

## If something looks wrong

Check in this order:
1. `.agent-memory/harness-plugin-state.json`
2. `.agent-memory/orchestration-status.md`
3. `.agent-memory/route-packet.json`
4. `.agent-memory/harness-plugin-debug.log`

When debugging live runs, prefer those artifacts over broad log substring matches.

## Recommended default

If you want the shortest, cleanest, most stable daily entrypoint:

```bash
harness
```

That is the current recommended way to use this project.

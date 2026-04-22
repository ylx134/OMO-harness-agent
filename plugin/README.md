# OMO Harness Plugin

This package is the runtime control plane for Harness mode.

It currently owns:
- slash-command intake for `/control`, `/plan`, `/drive`, `/check`
- semantic lock and route resolution
- authoritative route/state artifact generation under `.agent-memory/`
- deferred dispatch queues for managers, capability hands, and probes
- top-level harness-orchestrator suppression during active deferred routes
- blocked-state handling
- observability/debug logging

Skills remain behavior modules.
Hooks remain low-level integrity guards.
Agents remain runtime role definitions.

## Current Runtime Model

### 1. Intake
`/control ...` always performs intake and writes:
- `.agent-memory/harness-plugin-state.json`
- `.agent-memory/orchestration-status.md`
- `.agent-memory/managed-agent-state-index.json`
- `.agent-memory/route-packet.json`

After intake, the runtime behaves in one of two ways:
- default mode: it may auto-dispatch the first legal actor from deferred state
- manual mode (`--manual`): it stops after intake so the operator can advance with `/plan`, `/drive`, and `/check`

The outward artifacts are now graph-aware while keeping the legacy queue view for compatibility during migration:
- `orchestration-status.md` includes graph runtime summaries for `activeStepIds`, `readyStepIds`, `blockedStepIds`, held locks, and signal counts, plus a legacy compatibility section
- `managed-agent-state-index.json` keeps the existing queue-shaped fields and adds `graph_runtime` plus `legacy_compat`
- `route-packet.json` keeps the existing route contract fields and now exposes graph runtime fields and `legacyCompat`

### 2. Deferred progression
The plugin now advances the route through explicit follow-up commands:
- `/plan` consumes the next planning-stage manager from `pendingManagers`
- `/drive` consumes `execution-manager` first, then selected capability hands one at a time
- `/check` consumes `acceptance-manager`, then selected probes, then final acceptance closure

This keeps deferred progression out of the original intake transaction and avoids the earlier `prompt_async failed` lifecycle conflict, while still allowing the runtime to auto-start the first legal actor when the route is not in manual mode.

## Packaging Boundary

- `plugin/src/**` is the authored runtime source
- `plugin/dist/**` is generated build output
- `plugin/config/routing-table.json` is the packaged runtime routing asset used outside the repo root

### 3. Top-level orchestrator constraints
While a Harness route is active:
- top-level `harness-orchestrator` is allowed to create intake and emit short route summaries
- top-level tool work is blocked during intake and while a deferred route is active
- downstream work should proceed through the deferred manager/hand/probe queues instead

## Expected Command Sequences

### F-M1 / C-M1 manual flow
1. `/control ...`
2. `/plan`
3. `/drive` (dispatches `execution-manager`)
4. `/drive` repeatedly for each selected capability hand
5. `/check` (dispatches `acceptance-manager`)
6. `/check` repeatedly for each selected probe and final closure

### A-M1 manual flow
1. `/control ...`
2. `/plan` (dispatches `capability-planner`)
3. `/plan` (dispatches `planning-manager`)
4. `/drive` (dispatches `execution-manager`)
5. `/drive` repeatedly for selected hands
6. `/check` repeatedly for acceptance-manager, probes, and final closure

### P-H1 manual flow
1. `/control ...`
2. `/plan` (dispatches `feature-planner`)
3. `/plan` (dispatches `planning-manager`)
4. `/drive` (dispatches `execution-manager`)
5. `/drive` repeatedly for selected hands
6. `/check` repeatedly for acceptance-manager, probes, and final closure

## Verification

Recommended checks after each stage:
- inspect `.agent-memory/harness-plugin-state.json`
- inspect `.agent-memory/orchestration-status.md`
- inspect `.agent-memory/route-packet.json`
- inspect `.agent-memory/harness-plugin-debug.log`

Key graph-aware fields now projected for operators:
- `activeStepIds`
- `readyStepIds`
- `blockedStepIds`
- `heldLocks`
- signal summaries (`emitted` vs `pending`)
- legacy queue compatibility fields (`pendingManagers`, `pendingCapabilityHands`, `pendingProbes`, `deferredDispatchState`, `activeDispatch`)

The route is only fully complete when:
- `currentPhase` becomes `complete`
- `nextExpectedActor` becomes `none`
- all pending queues are empty
- dispatched managers/hands/probes reflect the route requirements

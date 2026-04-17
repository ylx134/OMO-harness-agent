# Managed Agents Migration Guide

This document explains the first-wave migration from the older planner / executor / checker framing to the new managed-agents architecture for OpenCode + OMO.

The goal is not to remove the existing entrypoints.
The goal is to reinterpret them so the system matches a brain / managers / hands / probes model from the managed-agents refactor plan.

## Why This Migration Exists

The prior harness already separated planning, execution, and checking.
That was useful, but `drive` and `check` still tended to absorb too much direct work.

The managed-agents refactor tightens the layer boundaries:
- `control` becomes the brain and route selector
- `plan`, `drive`, and `check` become managers
- capability agents become the hands that do narrow execution work
- probe agents become the hands that collect narrow verification findings

This makes the system more aligned with the managed-agents article idea of decoupling the brain from the hands.
It also fits OMO better because `task()` dispatch, categories, hooks, and durable memory all work best when responsibilities are narrow and explicit.

## Conceptual Before vs After

### Before

Typical mental model:
- `control` coordinates the harness
- `plan` writes the plan
- `drive` often implements, tests, explores, and collects evidence itself
- `check` often verifies everything itself

That works, but it creates two common drifts:
- execution-manager drift: one agent tries to be coder, shell operator, browser operator, and evidence clerk
- acceptance drift: one checker tries to be judge plus every verifier at once

### After

Target layered model:
- L1 `control`: global orchestrator / brain
- L2 `plan`: planning-manager
- L2 `drive`: execution-manager
- L2 `check`: acceptance-manager
- L3 capability agents: browser, code, shell, evidence, docs
- L4 probe agents: UI, API, regression, artifact

Managers still own the workflow.
They just no longer need to perform every narrow action themselves.

## What Still Works

Existing top-level entrypoints remain valid:
- `/control`
- `/plan`
- `/drive`
- `/check`

Existing planner helpers also still fit:
- `/feature-planner`
- `/capability-planner`
- `/memory`

The migration is architectural, not a user-facing breaking rename.
Users can keep invoking the familiar commands.
What changes is how the managers should dispatch internally.

## First-Wave New Agents

### Capability Agents (L3 hands)

- `browser-agent`
  - UI interaction, navigation, screenshots, visible-state capture
- `code-agent`
  - scoped code edits and refactors under explicit file boundaries
- `shell-agent`
  - startup, build, test, smoke, process, and command health work
- `evidence-agent`
  - evidence normalization, claim-to-proof mapping, artifact bookkeeping
- `docs-agent`
  - baseline and documentation retrieval for planning/execution/acceptance support

### Probe Agents (L4 verification hands)

- `ui-probe-agent`
  - browser-based acceptance findings and screenshots
- `api-probe-agent`
  - live API findings and request/response traces
- `regression-probe-agent`
  - spot-checks around preserved behavior and regressions
- `artifact-probe-agent`
  - generated file and output verification

## New Dispatch Pattern

### Old style tendency

Execution and checking often looked like this:
- `drive` does the code edits
- `drive` also starts services
- `drive` also opens the app
- `drive` also captures evidence
- `check` reruns everything itself

### New style target

Execution-manager (`drive`) should delegate by work type:
- browser work -> `browser-agent`
- code edits -> `code-agent`
- command execution -> `shell-agent`
- evidence normalization -> `evidence-agent`
- repo doc or baseline lookup -> `docs-agent`

Acceptance-manager (`check`) should delegate finding collection by verification type:
- UI verification -> `ui-probe-agent`
- API verification -> `api-probe-agent`
- regression spot-checks -> `regression-probe-agent`
- artifact verification -> `artifact-probe-agent`

`check` remains the judge.
The probes are not judges.

## OMO-Oriented Usage

The refactor is designed for OMO task dispatch.
Preferred pattern:

```text
task(category="deep", load_skills=["drive", "memory"], run_in_background=true)
```

Then inside manager logic, dispatch narrower workers such as:

```text
task(category="deep", load_skills=["code-agent", "memory"], run_in_background=true)
task(category="visual-engineering", load_skills=["browser-agent", "memory"], run_in_background=true)
task(category="quick", load_skills=["ui-probe-agent", "memory"], run_in_background=true)
```

Category intent in this first wave:
- `deep` for planning and execution-manager work plus code/shell-heavy hands
- `visual-engineering` for UI-visible browser work
- `quick` for focused evidence retrieval and probe passes
- `ultrabrain` remains useful for capability-level planning, not for routine hand work

## Responsibility Boundaries

### `control`

Should do:
- route selection
- semantic lock
- manager dispatch
- summary-level supervision

Should not do by default:
- low-level execution detail handling
- raw evidence collection
- direct acceptance execution

### `drive`

Should do:
- sequence work
- issue narrow execution contracts
- integrate writeback at manager-summary level

Should not do by default:
- every code edit, shell command, browser interaction, and evidence step personally

### `check`

Should do:
- judge the contract
- decide accepted / rejected / needs-follow-up
- choose which probes are required

Should not do by default:
- act as an all-in-one browser, API, regression, and artifact worker

## Evidence Expectations After Migration

The migration strengthens evidence discipline rather than weakening it.

Execution side:
- hands should produce raw evidence or exact paths
- `evidence-agent` can normalize and map claims to proof
- manager writeback should stay summary-first

Acceptance side:
- when a probe is relevant, `check` should require probe-produced findings
- acceptance conclusions should cite concrete artifacts, not only manager self-report

## Practical Migration Rules

1. Keep using the existing entrypoints.
2. Treat `plan`, `drive`, and `check` as managers, not universal workers.
3. Prefer dispatching a narrow hand or probe when the work type is obvious.
4. Keep managers on summary-level writeback and coordination.
5. Keep probes observation-only.
6. Keep acceptance judgment in `check`.

## Example Migration Scenarios

### Scenario 1: UI feature implementation

Preferred flow:
1. `control` chooses the route.
2. `plan` writes or tightens the contract if needed.
3. `drive` dispatches:
   - `code-agent` for source changes
   - `shell-agent` for startup/build/test
   - `browser-agent` for visible flow walkthrough and screenshots
   - `evidence-agent` if proof needs normalization
4. `check` dispatches `ui-probe-agent` for acceptance findings.
5. `check` issues the final judgment.

### Scenario 2: API bug fix

Preferred flow:
1. `drive` dispatches `code-agent` for the fix.
2. `drive` dispatches `shell-agent` for tests or service startup.
3. `check` dispatches `api-probe-agent` for live request evidence.
4. `check` may add `regression-probe-agent` if nearby preserved behavior matters.
5. `check` decides acceptance.

### Scenario 3: Generated report or export feature

Preferred flow:
1. `drive` uses `code-agent` and `shell-agent` to produce the output.
2. `evidence-agent` organizes artifact paths if needed.
3. `check` dispatches `artifact-probe-agent` to verify generated outputs.
4. `check` decides acceptance.

## What This First Wave Does Not Yet Change

This first wave adds the new skill directories and the migration guidance.
It does not by itself complete all later refactor tasks such as:
- manager prompt rewrites
- hook expansion for new boundaries
- installer/config integration for the new skills
- memory-layer summary templates

Those remain later phases in the managed-agents refactor plan.

## Adoption Guidance

For repo maintainers:
- start routing obvious narrow work to the new capability agents and probe agents
- preserve backward compatibility at the top-level entrypoints
- update manager prompts and hooks next so the new boundaries become enforceable

For OpenCode / OMO users:
- keep invoking `/control`, `/plan`, `/drive`, and `/check`
- expect the system to increasingly dispatch specialist hands underneath
- treat probe-generated findings as the preferred acceptance evidence source

## Migration Summary

The old harness split work by stage.
The new architecture keeps that strength, but adds a second split by responsibility depth:
- managers think and coordinate
- hands execute narrow tasks
- probes gather narrow verification findings

That is the key conceptual move behind this migration.

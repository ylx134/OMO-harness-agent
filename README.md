# OMO Harness Agent

[English](README.md) | [中文](README.zh-CN.md)

OMO Harness Agent turns OpenCode from a prompt-only workflow into a managed, route-driven runtime. Instead of asking one generalist agent to do everything, it gives you a control plane for intake, planning, execution, acceptance, and operator-visible state.

## What you get

- a Harness plugin that intercepts `/control`, `/plan`, `/drive`, and `/check`
- a layered managed-agents architecture: brain → managers → hands → probes
- durable `.agent-memory/` state and route artifacts
- graph-aware progression with bounded concurrency, locks, signals, and deliverable-based closure gating
- clean separation: `opencode` runs OMO, `harness` runs the harness plugin

---

## Quick start

**Prerequisites:** [OpenCode](https://opencode.ai) installed, Node.js 18+.

### 1. Install

```bash
git clone git@github.com:ylx134/OMO-harness-agent.git
cd OMO-harness-agent
./setup.sh
```

That's it. `setup.sh` builds the plugin, creates the isolated harness profile, symlinks all skills/hooks/agents, and installs the `harness` launcher and `hctl` CLI.

### 2. Launch harness mode

```bash
harness .
```

This opens OpenCode with only the harness plugin loaded. OMO stays completely separate — use plain `opencode` for normal Sisyphus work.

### 3. Run a route

```text
/control 修复构建报错并补上回归验证
```

The plugin intercepts the command, classifies the task into a route, writes durable state to `.agent-memory/`, and dispatches managers → hands → probes in sequence.

### 4. Observe the runtime

```bash
# In another terminal
hctl status      # route, phase, active actors
hctl blockers    # what's blocking
hctl summary     # one-liner
```

---

## Two modes, clean separation

| Command | What it loads | When to use |
|---------|--------------|-------------|
| `opencode` | OMO (`oh-my-openagent`) | Normal Sisyphus workflow |
| `harness` | Harness plugin only | Managed route-driven work |

Behind the scenes, `harness` points OpenCode at an isolated config directory. The two modes never interfere.

---

## Architecture

```
L1 Brain:   harness-orchestrator
  ├─ L2 Managers:  feature-planner, capability-planner, planning-manager,
  │                execution-manager, acceptance-manager
  ├─ L3 Hands:     code-agent, shell-agent, browser-agent, docs-agent, evidence-agent
  └─ L4 Probes:    ui-probe, api-probe, regression-probe, artifact-probe

Plugin  = control plane (dispatch, phase gating, state machine)
Skills  = behavior modules
Hooks   = low-level enforcement (file ownership, schema validation, evidence)
Agents  = runtime roles
State   = .agent-memory/ (durable, replay-friendly)
```

### Command lifecycle

```
/control  →  intake, route classification, state written
/plan     →  planning-stage managers
/drive    →  execution-manager, then capability hands (bounded concurrency)
/check    →  acceptance-manager, then probes, then closure
```

---

## Route families

| Route | Use when | Manager stack |
|-------|---------|---------------|
| `F-M1` | fix something broken | planning → execution → acceptance |
| `C-M1` | scoped internal change | planning → execution → acceptance |
| `A-M1` | deeper capability upgrade | capability-planner → planning → execution → acceptance |
| `P-H1` | product surface build | feature-planner → planning → execution → acceptance |

---

## Runtime safety guards

The runtime enforces structural integrity automatically:

| Guard | What it does |
|-------|-------------|
| **Schema validation** | `routing-table.json`, `features.json`, and `state-index.json` are validated against JSON Schemas on every write — no silent corruption |
| **Phase-actor authorization** | Each `.agent-memory/` file has a registered owner. Wrong actor writes are blocked at the plugin level, not left to convention |
| **Manager/hand/probe boundaries** | Execution rounds must include capability hands; acceptance passes must include probes; managers may not skip role separation |
| **Evidence requirements** | Acceptance reports must cite probe-produced evidence when the route requires probes |
| **Summary-first supervision** | Brain/manager agents are warned when reading raw detail files instead of summary-layer files |

---

## Observability

```bash
hctl check         # is the plugin loaded?
hctl status        # route, phase, active actors
hctl blockers      # what's blocking
hctl summary       # one-liner
```

When something looks wrong, inspect in this order:

1. `hctl status`
2. `.agent-memory/harness-plugin-state.json`
3. `.agent-memory/orchestration-status.md`
4. `.agent-memory/harness-plugin-debug.log`

---

## Completion semantics

A route is complete only when:

- `currentPhase` is `complete`
- `nextExpectedActor` is `none`
- the graph has no remaining live or required terminal work
- required deliverables exist (placeholder scaffolds don't count)
- at least one capability hand and one probe participated

Missing deliverables block closure by design — the harness never silently pretends work is done.

---

## Repository structure

```text
omo-harness-skills/
├── control/                     # route selection, semantic lock, orchestration
├── plan/                        # planning-manager skill
├── drive/                       # execution-manager skill
├── check/                       # acceptance-manager skill
├── feature-planner/             # product spec + feature list
├── capability-planner/          # baseline + gap analysis
├── browser-agent/ code-agent/ shell-agent/ docs-agent/ evidence-agent/
├── ui-probe-agent/ api-probe-agent/ regression-probe-agent/ artifact-probe-agent/
├── hooks/                       # enforcement layer
│   ├── schema-guard.js          # validates state files against JSON Schemas
│   ├── phase-guard.ts           # phase-actor file write authorization
│   ├── summary-supervision-guard.js  # warns on summary-first violations
│   ├── schemas/                 # JSON Schema definitions
│   └── ...
├── plugin/                      # runtime control plane (TypeScript)
│   ├── src/dispatch/            # authorization, completion, recovery, scheduling
│   ├── src/routing/             # route table, graph compilation
│   ├── src/state/               # storage, migration, projections
│   ├── src/observability/       # status projections
│   └── tests/                   # 94 tests (unit + E2E)
├── memory/                      # durable state templates and scripts
├── scripts/
│   ├── harness                  # observability CLI (hctl)
│   └── harness-launcher         # harness mode launcher
├── agents/                      # agent prompt definitions
├── docs/                        # architecture and migration docs
├── setup.sh                     # install
└── uninstall.sh                 # clean removal
```

---

## Uninstall

```bash
./uninstall.sh
```

Removes symlinked skills, hooks, agent files, and restores config snapshots.

---

## Test

```bash
npm --prefix plugin test
```

94 tests covering unit dispatch logic, E2E route lifecycles, concurrency, and state integrity.

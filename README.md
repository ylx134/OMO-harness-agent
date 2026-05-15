# OMO Harness Agent

[English](README.md) | [中文](README.zh-CN.md)

OMO Harness Agent turns OpenCode from a prompt-only workflow into a managed, route-driven runtime. Instead of asking one generalist agent to do everything, it gives you a control plane for intake, planning, execution, acceptance, and operator-visible state.

## What you get

- a Harness plugin that intercepts `/control`, `/plan`, `/drive`, and `/check`
- a layered managed-agents architecture: brain → managers → hands → probes
- durable `.agent-memory/` state and route artifacts
- graph-aware progression with bounded concurrency, locks, signals, and deliverable-based closure gating
- **task board** with git worktree isolation — multiple tasks run independently without state pollution
- **credential boundary** and **sandbox system** — secrets redacted, file operations path-isolated
- **session recovery** — crash-proof state reconstruction from event logs
- **simulated mode** — full route lifecycle testing without spawning real subagents
- **MCP server** — JSON-RPC stdio tools for external orchestration
- **plan intake gate** — automatic risk detection and confidence scoring on `/control`
- **continuation policy** — fine-grained autonomous execution control
- **review agent** — independent pre-acceptance quality gate
- **doctor script** — 90+ installation health checks
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
hctl status              # route, phase, active actors
hctl blockers            # what's blocking
hctl summary             # one-liner
```

### 5. Health check

```bash
./scripts/doctor.sh      # 90+ checks: paths, symlinks, runtime, CLI, git
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
  ├─ L3 Hands:     code-agent, shell-agent, browser-agent, docs-agent,
  │                evidence-agent, review-agent
  └─ L4 Probes:    ui-probe, api-probe, regression-probe, artifact-probe

Plugin  = control plane (dispatch, phase gating, state machine)
Skills  = behavior modules
Hooks   = low-level enforcement (file ownership, schema validation, evidence)
Agents  = runtime roles
State   = .agent-memory/ (durable, replay-friendly)
```

### Command lifecycle

```
/control  →  intake, route classification, risk detection, semantic lock, state written
/plan     →  planning-stage managers
/drive    →  execution-manager, then capability hands (bounded concurrency)
/check    →  acceptance-manager, then probes, then closure
```

---

## Route families

| Route | Use when | Manager stack | Sandbox |
|-------|---------|---------------|---------|
| `J-L1` | review, compare, audit | planning → execution → acceptance | — |
| `F-M1` | fix something broken | planning → execution → acceptance | — |
| `C-M1` | scoped internal change | planning → execution → acceptance | ✅ |
| `A-M1` | deeper capability upgrade | capability-planner → planning → execution → acceptance | ✅ |
| `P-H1` | product surface build | feature-planner → planning → execution → acceptance | — |

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
| **Sandbox isolation** | C-M1 and A-M1 routes enforce path isolation — file operations cannot escape the sandbox root |
| **Credential redaction** | API keys, tokens, and secrets are automatically redacted from tool output and event logs |
| **Output contract** | Agent output is filtered to exclude internal orchestration details, keeping user-facing output business-focused |

---

## Observability

```bash
hctl check               # is the plugin loaded?
hctl status              # route, phase, active actors
hctl blockers            # what's blocking
hctl summary             # one-liner

# Task board
hctl task-create "title" # create isolated task with git worktree
hctl task-list           # list all non-archived tasks
hctl task-resume <id>    # resume a paused task
hctl task-archive <id>   # archive a completed task

# Runner
hctl start <task>        # initialize route and run
hctl step                # advance one dispatch step
hctl wake                # recover crashed session
hctl inspect <file>      # pretty-print state artifact
hctl timeline            # actor + tool timeline

# Events
hctl events --last N     # last N raw events
hctl trace --round N     # event timeline for a specific round
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
├── review-agent/                # independent pre-acceptance review
├── browser-agent/ code-agent/ shell-agent/ docs-agent/ evidence-agent/
├── ui-probe-agent/ api-probe-agent/ regression-probe-agent/ artifact-probe-agent/
├── hooks/                       # enforcement layer (11 files)
│   ├── schema-guard.js          # validates state files against JSON Schemas
│   ├── evidence-verifier.js     # validates evidence file references
│   ├── features-json-guard.js   # enforces features.json immutability
│   ├── manager-boundary-guard.js # blocks managers from overwriting detail files
│   ├── probe-evidence-guard.js  # requires probe-produced evidence
│   ├── summary-supervision-guard.js  # warns on summary-first violations
│   ├── summary-sync-guard.js    # enforces summary layer before manager writes
│   ├── managed-route-completeness-guard.js  # blocks incomplete acceptance
│   ├── output-contract-guard.js # filters internal terms from user output
│   └── schemas/                 # 3 JSON Schema definitions
├── plugin/                      # runtime control plane (TypeScript, 288 tests)
│   ├── src/dispatch/            # authorization, completion, recovery, scheduling, credential boundary, sandbox
│   ├── src/routing/             # route table, graph compilation
│   ├── src/state/               # storage, migration, session store, task board
│   ├── src/observability/       # status projections
│   ├── src/intake/              # plan intake gate (risk detection)
│   ├── src/mcp/                 # MCP JSON-RPC server + tools
│   ├── src/security/            # sandbox system
│   ├── src/session/             # crash recovery (wake)
│   ├── src/testing/             # simulated agent adapter
│   └── tests/                   # 60 test files, 288 tests
├── memory/                      # durable state templates and scripts
├── scripts/
│   ├── harness                  # observability + runner CLI (hctl)
│   ├── harness-launcher         # harness mode launcher
│   └── doctor.sh                # 90+ installation health checks
├── agents/                      # 7 agent prompt definitions
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

288 tests covering unit dispatch logic, E2E route lifecycles, concurrency, state integrity, task board, credential boundary, sandbox, session store, recovery, simulated mode, MCP transport, plan intake gate, and continuation policy.

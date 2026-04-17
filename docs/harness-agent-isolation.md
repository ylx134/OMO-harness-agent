# Harness Agent Isolation for OpenCode + OMO

## Goal

Keep two orchestration worlds separate:

1. OMO default agents for everyday OpenCode use
   - `sisyphus`
   - `oracle`
   - `explore`
   - `artistry`
   - etc.

2. Harness-managed agents for the layered managed-agents architecture
   - `harness-orchestrator`
   - `planning-manager`
   - `execution-manager`
   - `acceptance-manager`

This avoids letting Sisyphus/analyze-mode pre-shape `/control` work before your own orchestrator can decide the route.

## Installed Harness Agents

These are installed in two layers:

1. merged into `~/.config/opencode/oh-my-openagent.json` for model/variant mapping
2. symlinked into `~/.config/opencode/agents/agent/` as native OpenCode agent files for real behavior isolation

Agents:

- `harness-orchestrator` — top-level brain for `/control`
- `planning-manager` — dedicated planning manager for `/plan`
- `execution-manager` — dedicated execution manager for `/drive`
- `acceptance-manager` — dedicated acceptance manager for `/check`
- `capability-hand` — optional generic narrow execution profile
- `probe-agent` — optional generic narrow verification profile

## Why This Helps

Under OMO, Sisyphus carries built-in behavior such as analyze-mode, explore/librarian fan-out, and specialist consultation habits. Those defaults are useful in general, but they can interfere with a custom layered harness:

- top-level routing gets preempted by Sisyphus defaults
- `/control` is no longer the real first brain
- execution and verification can collapse back into default agent behavior

By switching to a dedicated harness agent, `/control` starts from a cleaner top-level policy.

## Usage Modes

### Mode A: Default OMO workflow

Use when you want the normal OMO experience.

```bash
cd ~/Documents/other_workspace/DEV-Assistant
opencode .
```

Then stay on the default agent (typically Sisyphus).

### Mode B: Harness workflow

Use when you want your managed-agents system to own orchestration.

```bash
cd ~/Documents/other_workspace/DEV-Assistant
opencode --agent harness-orchestrator .
```

Then run tasks through `/control`.

### Mode C: Direct manager debugging

```bash
opencode --agent planning-manager .
opencode --agent execution-manager .
opencode --agent acceptance-manager .
```

Use these only when debugging manager-specific behavior.

## Recommended Operator Rules

- If the task is general coding / asking / exploring: use default OMO (`sisyphus`)
- If the task is a managed harness flow with contracts, summaries, acceptance, and capability/probe layering: use `harness-orchestrator`
- Do not mix the two in the same session if you are trying to evaluate harness behavior
- In Harness mode, there is no silent single-thread fallback: if managers, hands, or probes cannot be dispatched, the route must block honestly

## Important Caveat

This isolation is primarily about top-level orchestration behavior.

The harness skills still run inside the same OpenCode + OMO environment, so categories, hooks, MCP, task dispatch, and other infrastructure remain shared. That is intentional.

The point is not to remove OMO.
The point is to keep OMO as infrastructure while moving control of the *brain layer* to your own harness agent.

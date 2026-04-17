# Harness Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development when executing independent implementation tasks from this plan. Verify each phase before claiming completion.

**Goal:** Turn `omo-harness-skills` from a skill-pack-plus-hooks system into a true OpenCode/OMO Harness plugin that owns runtime orchestration for Harness mode.

**Architecture:** Build a dedicated Harness plugin that intercepts task intake, performs semantic lock and route resolution, dispatches managers/hands/probes, advances a canonical state machine, blocks invalid fallback behavior, and treats skills/hooks/agents as subordinate behavior modules. OMO remains infrastructure; Harness becomes the workflow governor.

**Tech Stack:** OpenCode plugin runtime, OMO plugin coexistence, agent files, skill packs, JS hooks, JSON route/state registries, `.agent-memory/` durable state, shell install scripts.

---

## 0. Non-Negotiable Target State

When this plan is complete, Harness mode must satisfy all of the following:

1. `/control` is not just a skill entry — it is a plugin-routed workflow entry.
2. Harness mode tasks cannot silently run to completion in one thread.
3. Every Harness task must pass through explicit manager states:
   - planning-manager
   - execution-manager
   - acceptance-manager
4. Every execution round must include at least one capability hand.
5. Every acceptance pass must include at least one probe.
6. If required actors are unavailable, the route blocks.
7. Acceptance cannot complete without valid route progression + evidence + actor participation.
8. OMO default mode and Harness mode can coexist without ambiguous control ownership.

## 1. What This Plan Delivers

This plan covers the full implementation of a real Harness plugin layer, including:
- plugin bootstrap and registration
- Harness-mode session entry
- task intake and normalization
- semantic lock engine
- route engine
- manager dispatch engine
- capability/probe dispatch tracking
- state machine advancement
- blocked-state handling
- observability / event log
- plugin/skills/hooks/agents contract boundaries
- installation and configuration wiring
- validation strategy

This plan does **not** stop at documentation updates. It assumes code, runtime, config, and installation changes are required.

## 2. Repository Targets

Primary repo:
- `~/Documents/my_workspace/omo-harness-skills`

Expected implementation surfaces:
- new plugin source directory (to be created)
- existing `hooks/`
- existing `control/`, `plan/`, `drive/`, `check/`
- existing `agents/agent/`
- existing `memory/`
- existing `setup.sh`, `uninstall.sh`
- existing `oh-my-opencode.json`, `oh-my-openagent.harness.json`
- new plugin docs and test fixtures

## 3. Deliverable Structure

At completion, the repo should contain at least:

```text
omo-harness-skills/
├── plugin/
│   ├── package.json
│   ├── README.md
│   ├── src/
│   │   ├── index.ts
│   │   ├── mode/
│   │   ├── intake/
│   │   ├── semantic-lock/
│   │   ├── routing/
│   │   ├── dispatch/
│   │   ├── state/
│   │   ├── blocking/
│   │   ├── observability/
│   │   └── utils/
│   └── dist/
├── docs/
│   ├── full-harness-plugin-architecture.md
│   ├── harness-agent-isolation.md
│   └── plans/
│       └── 2026-04-16-harness-plugin-implementation-plan.md
└── ...existing skills/hooks/agents/memory/config...
```

## 4. Execution Strategy

Implement in strict order:

1. plugin scaffolding
2. runtime mode separation
3. task intake + semantic lock
4. route engine
5. manager dispatch engine
6. capability/probe tracking
7. state machine + blocking
8. observability
9. hook integration tightening
10. install/uninstall integration
11. smoke tests + validation

Do not jump ahead to hook tuning before the route/dispatch/state engine exists.

## 5. Phase 1: Plugin Scaffolding

### Task 1.1: Create plugin directory and package metadata

**Files:**
- Create: `plugin/package.json`
- Create: `plugin/README.md`
- Create: `plugin/src/index.ts`
- Create: `plugin/tsconfig.json` (or equivalent build config)
- Create: `plugin/.gitignore`

**Step 1: Create `plugin/package.json`**
Include:
- package name (for example `omo-harness-plugin` or similar)
- version
- type/module setting
- build scripts
- dependency on OpenCode plugin SDK/runtime if required
- dependency policy kept minimal

**Step 2: Create `plugin/src/index.ts`**
This is the plugin runtime entry.
Responsibilities initially:
- initialize plugin
- register Harness mode hooks into the OpenCode plugin lifecycle
- expose plugin version and capabilities

**Step 3: Add a minimal plugin README**
Explain:
- this plugin is the runtime governor for Harness mode
- skills remain behavior modules
- hooks remain low-level enforcement

**Step 4: Add build command**
The plugin must be buildable independently from the skill docs.

**Verification:**
- package metadata parses
- build command resolves
- plugin source entry exists

### Task 1.2: Define plugin module layout

**Files:**
- Create: `plugin/src/mode/index.ts`
- Create: `plugin/src/intake/index.ts`
- Create: `plugin/src/semantic-lock/index.ts`
- Create: `plugin/src/routing/index.ts`
- Create: `plugin/src/dispatch/index.ts`
- Create: `plugin/src/state/index.ts`
- Create: `plugin/src/blocking/index.ts`
- Create: `plugin/src/observability/index.ts`
- Create: `plugin/src/utils/index.ts`

**Step 1: Create empty module entry files**
Each file should export placeholders / interfaces.

**Step 2: Define cross-module types**
Core types to define early:
- TaskEnvelope
- SemanticLockResult
- RoutePacket
- DispatchPacket
- ActorCompletionPacket
- RouteBlockingState
- HarnessEvent

**Verification:**
- all modules import cleanly
- no circular dependency introduced at scaffold stage

## 6. Phase 2: Harness Mode Separation

### Task 2.1: Add explicit mode detection

**Files:**
- Modify: `plugin/src/index.ts`
- Create: `plugin/src/mode/detect.ts`
- Create: `plugin/src/mode/types.ts`

**Goal:** separate `omo-default` from `harness` before task routing begins.

**Rules:**
- `opencode --agent harness-orchestrator .` enters Harness mode
- default OMO agents remain in OMO mode
- `/control` in Harness mode must be owned by the plugin runtime
- `/control` in default mode may either reject or redirect to Harness mode depending on design choice (pick one and document it)

**Step 1:** define mode enum
- `OMO_DEFAULT`
- `HARNESS`

**Step 2:** define mode detection sources
- current active agent
- explicit slash command
- future config override if needed

**Step 3:** document precedence
Recommended precedence:
1. explicit Harness agent
2. explicit `/control` under Harness agent
3. default OMO mode otherwise

**Verification:**
- mode decision is deterministic
- logs show which mode was selected

### Task 2.2: Add agent ownership policy

**Files:**
- Create: `plugin/src/mode/agent-ownership.ts`
- Modify: `docs/harness-agent-isolation.md`

**Goal:** define which agents belong to Harness runtime ownership.

Harness-owned agents:
- harness-orchestrator
- planning-manager
- execution-manager
- acceptance-manager

OMO-owned agents:
- sisyphus
- oracle
- explore
- artistry
- others

**Verification:**
- plugin can answer whether a given session belongs to Harness mode

## 7. Phase 3: Task Intake Layer

### Task 3.1: Build TaskEnvelope creation

**Files:**
- Create: `plugin/src/intake/task-envelope.ts`
- Create: `plugin/src/intake/normalize-request.ts`
- Modify: `plugin/src/index.ts`

**Goal:** normalize every Harness request before any manager work begins.

TaskEnvelope fields:
- request_id
- raw_user_input
- normalized_goal
- explicit_entrypoint
- workspace_root
- active_agent
- mode
- timestamp
- prior_context_refs
- desired_outputs
- hard_boundaries

**Step 1:** generate `request_id`
- deterministic enough for traceability

**Step 2:** detect explicit entrypoint
- `/control`
- `/plan`
- `/drive`
- `/check`
- or implicit

**Step 3:** persist the envelope summary
- record in `.agent-memory/orchestration-status.md`
- append to `activity.jsonl`

**Verification:**
- every Harness task creates a request envelope
- no manager dispatch occurs before envelope creation

### Task 3.2: Add request inbox integration

**Files:**
- Modify: `plugin/src/intake/task-envelope.ts`
- Modify: `memory/scripts/init_memory.sh` only if needed

**Goal:** force all new requests through inbox registration before live state mutation.

**Step 1:** create inbox request file if not already present
**Step 2:** append to inbox index
**Step 3:** record classification placeholder before route resolution

**Verification:**
- every Harness task has an inbox record

## 8. Phase 4: Semantic Lock Engine

### Task 4.1: Implement ambiguity checks

**Files:**
- Create: `plugin/src/semantic-lock/evaluate.ts`
- Create: `plugin/src/semantic-lock/persist.ts`
- Modify: `plugin/src/index.ts`

**Goal:** block ambiguous tasks before route selection.

**Required checks:**
- multiple materially different success interpretations
- fake completion trap risk
- parity / baseline-sensitive risk
- wrapper/scaffold mistaken for core result risk

**Step 1:** compute semantic lock outcome
Possible statuses:
- `locked`
- `needs_clarification`

**Step 2:** if `needs_clarification`
- stop dispatch
- write blocked state
- surface clarification request

**Step 3:** if `locked`
- persist semantic lock text to memory

**Verification:**
- route engine never runs before semantic lock resolves

## 9. Phase 5: Route Engine

### Task 5.1: Build runtime route packet generation

**Files:**
- Create: `plugin/src/routing/resolve-route.ts`
- Create: `plugin/src/routing/load-route-registry.ts`
- Create: `plugin/src/routing/types.ts`
- Modify: `plugin/src/index.ts`

**Goal:** generate a RoutePacket at runtime from the current request + semantic lock + route registry.

RoutePacket must include:
- route_id
- task_type
- flow_tier
- manager_stack
- capability_expectations
- probe_expectations
- startup_files
- deliverables
- summary_outputs
- execution_mode
- anti_shallow_bar

**Step 1:** load existing route definitions from `control/config/routing-table.json`
**Step 2:** resolve `J-L1`, `F-M1`, `C-M1`, `A-M1`, `P-H1`
**Step 3:** persist packet summary

**Verification:**
- every Harness task gets a RoutePacket
- no execution starts without a packet

### Task 5.2: Enforce no-fallback semantics at route time

**Files:**
- Modify: `plugin/src/routing/resolve-route.ts`
- Modify: `plugin/src/blocking/index.ts`

**Goal:** if the route requires managers/hands/probes, plugin enforces that requirement before work starts.

**Verification:**
- no route can silently degrade to one-thread completion

## 10. Phase 6: Manager Dispatch Engine

### Task 6.1: Force manager-first execution

**Files:**
- Create: `plugin/src/dispatch/dispatch-manager.ts`
- Create: `plugin/src/dispatch/manager-registry.ts`
- Modify: `plugin/src/index.ts`

**Goal:** the plugin, not the top-level LLM, must force the manager order.

Minimum policy:
- planning-manager required first
- execution-manager required second
- acceptance-manager required last

Even for read-only / judgment-heavy tasks, do not skip planning-manager or execution-manager in Harness mode.

**Step 1:** define manager registry
**Step 2:** create manager dispatch packet schema
**Step 3:** persist dispatched manager markers
**Step 4:** refuse progression if a manager did not run

**Verification:**
- top-level task cannot proceed directly to execution outputs without manager dispatch

### Task 6.2: Add manager completion packet enforcement

**Files:**
- Create: `plugin/src/dispatch/manager-completion.ts`
- Modify: `plugin/src/state/index.ts`

**Goal:** each manager must return a structured completion packet.

Fields:
- manager_name
- status
- output_files
- summary_files
- blockers
- next_expected_actor

**Verification:**
- plugin blocks progression without completion packet

## 11. Phase 7: Capability Dispatch Engine

### Task 7.1: Add capability dispatch tracking

**Files:**
- Create: `plugin/src/dispatch/dispatch-capability.ts`
- Create: `plugin/src/dispatch/capability-registry.ts`
- Modify: `plugin/src/state/index.ts`

**Goal:** enforce that execution-manager cannot finish a round without at least one hand.

**Step 1:** define capability registry
- browser-agent
- code-agent
- shell-agent
- docs-agent
- evidence-agent

**Step 2:** track dispatched hands in state
**Step 3:** mark round invalid if no hand participated

**Verification:**
- execution completion blocked when zero hands participated

### Task 7.2: Add capability packet schema

**Files:**
- Create: `plugin/src/dispatch/capability-packet.ts`

Required fields:
- parent_request_id
- route_id
- round_id
- capability_name
- scope
- allowed_files
- forbidden_actions
- expected_outputs
- expected_evidence

## 12. Phase 8: Probe Dispatch Engine

### Task 8.1: Add probe dispatch tracking

**Files:**
- Create: `plugin/src/dispatch/dispatch-probe.ts`
- Create: `plugin/src/dispatch/probe-registry.ts`
- Modify: `plugin/src/state/index.ts`

**Goal:** acceptance-manager cannot complete without at least one probe in Harness mode.

**Step 1:** define probe registry
- ui-probe-agent
- api-probe-agent
- regression-probe-agent
- artifact-probe-agent

**Step 2:** track dispatched probes in state
**Step 3:** block acceptance if no probe participated

**Verification:**
- acceptance completion blocked when zero probes participated

### Task 8.2: Add probe packet schema

**Files:**
- Create: `plugin/src/dispatch/probe-packet.ts`

Required fields:
- parent_request_id
- route_id
- round_id
- probe_name
- verification_target
- expected_contract_items
- expected_evidence

## 13. Phase 9: Canonical State Machine

### Task 9.1: Implement canonical route progression

**Files:**
- Create: `plugin/src/state/state-machine.ts`
- Create: `plugin/src/state/persist-state.ts`
- Modify: `plugin/src/index.ts`

Canonical phases:
- intake
- semantic-lock
- route-selection
- planning
- execution-contract
- execution
- probe-verification
- acceptance
- complete
- blocked

**Step 1:** define legal transitions
**Step 2:** reject illegal transitions
**Step 3:** persist transitions into `.agent-memory/orchestration-status.md`

**Verification:**
- no implicit transition allowed in Harness mode

### Task 9.2: Extend state index

**Files:**
- Modify: `memory/templates/managed-agent-state-index.json`

Add:
- required_manager_dispatch
- dispatched_managers
- required_capability_hands
- dispatched_capability_hands
- required_probes
- dispatched_probes
- route_blocked_reason
- current_phase
- next_expected_actor

**Verification:**
- hooks and plugin use the same state schema

## 14. Phase 10: Blocking and Recovery Engine

### Task 10.1: Build blocked-state recorder

**Files:**
- Create: `plugin/src/blocking/record-blocked.ts`
- Create: `plugin/src/blocking/types.ts`

Blocked state classes:
- semantic-lock-blocked
- route-resolution-blocked
- manager-dispatch-blocked
- capability-unavailable-blocked
- probe-unavailable-blocked
- acceptance-incomplete-blocked
- state-divergence-blocked

**Goal:** any missing actor or invalid flow becomes explicit blocked state, never silent fallback.

### Task 10.2: Recovery policy integration

**Files:**
- Modify: `plugin/src/blocking/index.ts`
- Integrate with: `control/config/error-handling.json`

**Goal:** unify route-blocking and existing error-handling policies.

**Verification:**
- blocked states are surfaced consistently
- no fake completion on actor absence

## 15. Phase 11: Hook Integration Upgrade

### Task 11.1: Keep current hooks as local integrity layer

Existing hooks remain useful:
- evidence-verifier
- features-json-guard
- manager-boundary-guard
- summary-sync-guard
- probe-evidence-guard
- managed-route-completeness-guard

But now they become subordinate to plugin orchestration rather than primary control.

### Task 11.2: Add manager-dispatch guard

**Files:**
- Create: `hooks/manager-dispatch-guard.js`

**Goal:** block early main-thread task completion before required manager dispatch markers exist.

Checks:
- if task is in Harness mode
- and route packet exists
- and required managers not yet dispatched
- then block writes to final deliverables / acceptance outputs / summary completion markers

This solves the current failure mode where the top-level agent starts doing the work itself before managers truly take over.

### Task 11.3: Align hooks with new state schema

**Files:**
- Modify current hooks to read the new `managed-agent-state-index.json` fields

**Verification:**
- hooks no longer rely on weak textual heuristics when structured fields exist

## 16. Phase 12: Observability Layer

### Task 12.1: Emit structured Harness events

**Files:**
- Create: `plugin/src/observability/events.ts`
- Create: `plugin/src/observability/logger.ts`

Required events:
- task.intake
- semantic_lock.started
- semantic_lock.blocked
- route.selected
- manager.dispatched
- manager.completed
- capability.dispatched
- capability.completed
- probe.dispatched
- probe.completed
- acceptance.blocked
- acceptance.completed
- route.blocked
- route.completed

Persist to:
- `.agent-memory/activity.jsonl`
- optional plugin runtime logs

**Verification:**
- a smoke test can be evaluated from event traces alone

### Task 12.2: Add replay/debug support

**Files:**
- Create: `plugin/src/observability/replay.ts`
- Create: `docs/harness-plugin-debugging.md`

**Goal:** reconstruct route execution and identify where manager dispatch or probe participation failed.

## 17. Phase 13: Installer / Config Integration

### Task 13.1: Update install scripts to include plugin package

**Files:**
- Modify: `setup.sh`
- Modify: `uninstall.sh`

Requirements:
- install/symlink plugin source or package
- install skills
- install hooks
- install agent files
- merge OMO categories
- merge harness agent model config

### Task 13.2: Document runtime startup commands

**Files:**
- Modify: `README.md`
- Modify: `docs/harness-agent-isolation.md`

Document:
- `opencode .` for OMO default mode
- `opencode --agent harness-orchestrator .` for Harness mode
- expected behavior differences

## 18. Phase 14: Verification Plan

### Verification A: Static validation
Run:
- `bash -n setup.sh uninstall.sh`
- `node --check hooks/*.js`
- `python3 -m json.tool control/config/routing-table.json`
- `python3 -m json.tool oh-my-opencode.json`
- `python3 -m json.tool oh-my-openagent.harness.json`
- plugin build command

### Verification B: Install validation
Confirm on machine:
- skills linked
- hooks linked
- harness agent files linked
- agent model config merged
- plugin registered

### Verification C: Harness route smoke tests
Run at least these three:
1. judgment/read-only task
2. bounded execution task
3. verification-heavy task

For every smoke test, verify:
- route packet created
- manager dispatch markers present
- at least one hand used
- at least one probe used
- acceptance blocked when participation is missing

### Verification D: Negative tests
Confirm the system blocks:
- top-level one-thread completion in Harness mode
- acceptance without probe
- execution without hand
- route completion without managers

## 19. Task-by-Task Implementation Style

Each implementation step should follow:
1. add or update one module
2. wire it into the plugin runtime
3. add at least one smoke/negative check
4. verify before moving on
5. commit frequently

Do not batch multiple architectural layers into a single unverified edit.

## 20. Final Definition of Done

This plugin implementation is done when:
1. Harness mode is a true runtime mode, not a skill convention
2. `/control` no longer depends on default OMO orchestration behavior
3. manager dispatch is enforced by runtime state, not just by prose
4. hand/probe participation is mandatory and machine-checked
5. blocked states are explicit and recoverable
6. acceptance cannot complete without independent evidence-backed flow progression
7. OMO default mode and Harness mode coexist cleanly
8. a new session can implement and verify the system by following this document alone

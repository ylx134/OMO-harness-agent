# Full Harness Plugin Architecture

> For Claude: this is a full architecture target, not a minimal patch. The goal is to move the OMO harness from a skill-led coordination layer into a true plugin-led runtime orchestration system.

## 1. Goal

Build a full Harness plugin for OpenCode that provides runtime-level control over:
- task intake
- route classification
- semantic lock
- manager dispatch
- capability/probe dispatch
- state machine progression
- blocking/failure recovery
- acceptance gating
- session / subagent coordination
- memory synchronization
- observability and replay

This plugin must replace skill-only orchestration as the primary control plane.

The design target is:
- OMO remains a useful infrastructure provider
- Harness becomes the workflow governor
- skills become behavior modules
- hooks become low-level guards
- agents become runtime roles
- the plugin becomes the single source of truth for orchestration

## 2. Core Design Principle

The plugin must own the orchestration graph.

Not the top-level agent.
Not the skill text.
Not the hook set.

The plugin should decide:
- what mode the task is in
- which route is active
- which manager runs next
- which capability/probe agents are required
- whether progress is legal
- whether acceptance is allowed
- whether execution must block

This is the exact step that moves the system from “skill-guided workflow” to “runtime-managed workflow”.

## 3. What the Plugin Must Control

### 3.1 Task Intake Layer

Responsibilities:
- intercept all user requests before normal agent execution
- identify whether the active session is in default OMO mode or Harness mode
- if in Harness mode, prevent the default OMO analyze-mode from becoming authoritative
- normalize the user request into a structured task envelope

Task envelope fields:
- request_id
- raw_user_input
- normalized_goal
- explicit_entrypoint (`/control`, `/plan`, `/drive`, `/check`, or implicit)
- current_agent
- active_mode (`omo-default` | `harness`)
- workspace_root
- timestamp
- prior_context_refs

### 3.2 Semantic Lock Layer

Responsibilities:
- determine if the task meaning is ambiguous
- if ambiguous, block downstream execution and require semantic clarification
- store semantic lock result before route selection

Outputs:
- semantic_lock_status (`locked` | `needs_clarification`)
- semantic_lock_text
- fake-completion traps
- non-degradable requirements

### 3.3 Route Engine

Responsibilities:
- classify task type
- assign flow tier
- resolve route ID
- compute required manager stack
- compute required capability stack
- compute required probe stack
- disallow unowned direct execution

Inputs:
- semantic lock
- task envelope
- route registry
- environment availability

Outputs:
- route_id
- task_type
- flow_tier
- manager_requirements
- capability_requirements
- probe_requirements
- blocking_requirements

### 3.4 Manager Orchestration Layer

Managers are runtime actors, not optional roleplay states.

Required managers:
- planning-manager
- execution-manager
- acceptance-manager

Optional manager-support actors:
- feature-planner
- capability-planner

Responsibilities:
- dispatch manager agents explicitly
- track which manager is active
- require manager completion packets
- prevent main-thread substitution

Manager completion packet schema:
- manager_name
- manager_phase
- contract_version
- output_files
- summary_files
- next_expected_actor
- status (`completed` | `blocked` | `needs_revision`)
- blockers
- evidence_refs

### 3.5 Capability Dispatch Layer

Capability agents are execution hands.

Baseline capability agents:
- browser-agent
- code-agent
- shell-agent
- docs-agent
- evidence-agent

Responsibilities:
- receive bounded execution packets from execution-manager
- run narrow-scope work only
- produce structured outputs
- never self-promote into manager behavior

Capability packet schema:
- parent_request_id
- route_id
- round_id
- capability_agent_name
- scope
- allowed_files
- forbidden_actions
- expected_outputs
- expected_evidence
- timeout_budget

### 3.6 Probe Dispatch Layer

Probe agents are verification hands.

Baseline probe agents:
- ui-probe-agent
- api-probe-agent
- regression-probe-agent
- artifact-probe-agent

Responsibilities:
- run independent verification work only
- return observations and evidence
- not issue final acceptance decisions

Probe packet schema:
- parent_request_id
- route_id
- round_id
- probe_name
- verification_target
- expected_contract_items
- expected_evidence
- timeout_budget

### 3.7 Acceptance Gate Layer

Responsibilities:
- prevent acceptance until required managers, capability agents, and probes have produced valid outputs
- verify completeness of the route execution graph
- enforce independent acceptance
- determine accepted / rejected / blocked / needs-follow-up

Acceptance gate must check:
- semantic lock exists
- route exists
- required managers completed
- required hands participated
- required probes participated
- required summary files exist
- required evidence exists
- contract and acceptance states agree

### 3.8 Blocking / Failure Layer

Responsibilities:
- convert “fallback temptation” into runtime blocked states
- prevent degraded mode from becoming silent single-thread execution
- coordinate retry, escalation, recovery, or stop decisions

Blocked state classes:
- semantic-lock-blocked
- route-resolution-blocked
- manager-dispatch-blocked
- capability-unavailable-blocked
- probe-unavailable-blocked
- acceptance-incomplete-blocked
- state-divergence-blocked

### 3.9 Summary-First Memory Layer

The plugin must own memory synchronization policy.

Brain-facing files:
- brain-brief.md
- route-summary.md
- risk-summary.md
- acceptance-summary.md

Manager-facing files:
- task.md
- working-memory.md
- round-contract.md
- orchestration-status.md
- execution-status.md
- acceptance-report.md

Detail/evidence files:
- evidence-ledger.md
- activity.jsonl
- journal.md
- evidence/**

Rule:
- plugin updates summary-layer expectations after each actor transition
- hooks enforce file-level integrity
- plugin enforces phase-level integrity

### 3.10 Observability Layer

The plugin should emit structured runtime events.

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

These events should support:
- debugging
- replay
- evals
- trace visualization
- quality audits

## 4. Full Runtime Architecture

```text
User Request
  ↓
Harness Plugin Entry
  ↓
Task Intake Layer
  ↓
Semantic Lock Layer
  ↓
Route Engine
  ↓
Manager Orchestration Layer
  ├─ planning-manager
  ├─ execution-manager
  └─ acceptance-manager
        ↓
Execution-Manager
  ├─ browser-agent
  ├─ code-agent
  ├─ shell-agent
  ├─ docs-agent
  └─ evidence-agent
        ↓
Acceptance-Manager
  ├─ ui-probe-agent
  ├─ api-probe-agent
  ├─ regression-probe-agent
  └─ artifact-probe-agent
        ↓
Acceptance Gate Layer
  ↓
Final Decision
```

## 5. Separation of Concerns

### Plugin owns
- orchestration graph
- dispatch legality
- phase legality
- blocking semantics
- actor participation requirements
- state machine progression
- mode separation (`omo-default` vs `harness`)

### Agent files own
- role-specific system behavior
- reasoning style
- local responsibilities
- prohibited behavior

### Skills own
- reusable procedures and reference knowledge
- task-type-specific behavior modules
- file-level domain guidance

### Hooks own
- low-level enforcement at write/transition boundaries
- local integrity rules
- fast failure on illegal operations

### Memory owns
- durable state persistence
- replay-friendly artifacts
- summary/detail separation

## 6. Mode Model

The plugin must support two explicit modes.

### Mode A: OMO Default
- default Sisyphus-led workflow
- default analyze-mode behavior allowed
- no harness guarantees
- suitable for generic work

### Mode B: Harness
- only available when entering through harness-orchestrator or explicit harness entrypoint
- analyze-mode cannot override harness route logic
- no silent single-thread fallback
- all task completion requires role-separated execution and acceptance

## 7. Hard Rules in Harness Mode

These are plugin-enforced, not merely documented.

1. Every task must receive a route packet.
2. Every route must have manager requirements.
3. No task may complete without planning-manager participation.
4. No task may complete without execution-manager participation.
5. No task may complete without acceptance-manager participation.
6. No execution round may complete without at least one capability hand.
7. No acceptance pass may complete without at least one probe.
8. If required actors are unavailable, the route blocks.
9. Blocked routes may not silently continue in a single thread.
10. Final acceptance is impossible without evidence and actor participation markers.

## 8. Plugin Interfaces

### 8.1 Entry Hooks
The plugin should hook into:
- session start
- user message submit
- slash-command dispatch
- agent selection
- task dispatch
- task completion
- file write finalization
- acceptance write finalization

### 8.2 Internal Registries
The plugin should maintain:
- route registry
- actor registry
- capability registry
- probe registry
- state transition registry
- failure handling registry

### 8.3 Agent Registry Example
Each agent should be described structurally:
- name
- role_class (`brain` | `manager` | `capability` | `probe`)
- allowed_entrypoints
- required_skills
- required_tools
- forbidden_transitions
- expected_outputs

## 9. State Machine

The plugin should enforce a single canonical state machine.

Example high-level phases:
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

Transitions must be explicit.
Implicit transitions are not allowed in Harness mode.

## 10. Failure and Recovery Design

The plugin must distinguish between:
- task failure
- route failure
- actor absence
- invalid completion attempt
- evidence insufficiency
- state divergence

Recovery actions:
- retry actor dispatch
- re-open contract negotiation
- require additional hand/probe participation
- block and escalate
- abort cleanly with preserved state

## 11. Why Pluginization Matters

This is the core architectural difference between OMO and the current repo.

A plugin can:
- intercept tasks before a default agent begins solving them
- decide routing before an LLM improvises
- force actor participation structurally
- maintain a true state machine
- prevent silent fallback at runtime

A skill pack alone cannot fully do that.
Skills are downstream behavior guides.
Plugins are upstream execution governors.

## 12. Migration Path From Current Repo

### Current state
- repo contains strong skills, hooks, memory model, and route docs
- harness agents now exist
- top-level separation has begun
- fallback space is reduced but not eliminated early enough

### Next migration target
Move these responsibilities into a plugin:
- `/control` entry interception
- route packet generation
- manager dispatch enforcement
- hand/probe participation enforcement before acceptance write
- blocked-state lifecycle
- event logging and replay

## 13. Recommended Implementation Order

1. Build plugin runtime shell
2. Implement task intake and semantic lock
3. Implement route engine using current routing-table.json as source of truth
4. Implement manager dispatch control
5. Implement capability/probe dispatch tracking
6. Connect existing hooks as local integrity layer
7. Add observability and replay
8. Add UI/debug commands for current route state

## 14. Definition of Done

This plugin architecture is complete when:
- Harness mode tasks cannot be completed without manager/hand/probe participation
- the plugin, not the top-level LLM, owns the orchestration graph
- blocked states are explicit and recoverable
- state transitions are inspectable
- OMO default mode and Harness mode can coexist cleanly
- skills become policy modules beneath the plugin instead of the primary control plane

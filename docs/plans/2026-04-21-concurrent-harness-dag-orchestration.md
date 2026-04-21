# Concurrent Harness DAG Orchestration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the Harness plugin from a single-flight deferred scheduler into a concurrent, dependency-aware orchestration runtime that can run multiple subagents in parallel, honor explicit dependencies and durable signals, recover safely after restarts, and still preserve the existing `/control` `/plan` `/drive` `/check` contract.

**Architecture:** Keep the current command surface and `.agent-memory/` artifact surface, but replace the internal queue-head scheduler with a durable graph runtime. Model all work as step nodes with dependencies, locks, retry envelopes, and completion policies; make every hook and watcher call the same idempotent reconcile loop; and represent cross-subagent coordination as runtime-owned signals/events rather than direct child-to-child chat.

**Tech Stack:** OpenCode plugin runtime (`plugin/index.js`, `plugin/dist/index.js`), new authoritative source under `plugin/src/**`, Node.js ESM, Node built-in test runner, `.agent-memory/` JSON/Markdown artifacts, child-session dispatch via `client.session.create()` and `client.session.promptAsync()`.

---

## Current Verified Baseline

What is true right now:
- the live runtime is implemented in `plugin/dist/index.js`
- `plugin/src/**` is mostly stub re-exports and is not authoritative yet
- tests import `../dist/index.js`
- route progression is serialized around a singleton `activeDispatch`
- manager/hand/probe progression is queue-head based
- completion detection already exists through:
  - chat callbacks
  - tool callbacks
  - workspace artifact polling
  - session-store polling
- child sessions already exist and are the correct runtime substrate for future concurrent execution

What is not true yet:
- there is no plural active-step model
- there is no dependency graph or wake-up model
- there is no durable signal/event system between steps
- there is no per-step authorization for multiple live child sessions
- there is no idempotent multi-step recovery model
- current tests explicitly lock in one-at-a-time behavior

---

## Final Capability Contract

The implementation is only complete when all of the following are true:

1. A route compiles into a durable execution graph with stable step IDs and dependency edges.
2. The runtime can have more than one `in_progress` child step at once.
3. Cross-step coordination is represented as durable runtime signals/events, not implicit timing or direct child chat.
4. A step can wait on multiple prerequisites, including both completed steps and emitted signals.
5. After restart, the runtime can reconstruct active, ready, blocked, and terminal steps without corrupting state.
6. Tool/chat/session-store/workspace callbacks are idempotent and safe under duplicate observation.
7. Existing route commands still work for operators.
8. Existing `.agent-memory/` artifacts still exist, but now project graph state.
9. Final closure requires graph completion plus deliverable validation, not merely “no current active dispatch”.
10. The following scenario is covered by automated tests:
   - A and B start prerequisite work in parallel
   - B waits for a durable signal from A
   - A emits the signal
   - B resumes or becomes runnable and completes downstream work
   - main route completes only after B’s downstream work is terminal and acceptance gates pass

---

## Target Runtime Model

### Canonical state shape

The canonical runtime must move from scalar state to graph state.

Recommended persisted schema in `.agent-memory/harness-plugin-state.json`:

```ts
{
  schemaVersion: 2,
  routeId: string,
  taskType: string,
  flowTier: string,
  revision: number,
  graph: {
    steps: {
      [stepId]: {
        id: string,
        actor: string,
        kind: 'manager' | 'capability-hand' | 'probe' | 'acceptance-closure',
        phase: 'planning' | 'execution' | 'acceptance',
        dependsOnStepIds: string[],
        dependsOnSignals: string[],
        emitsSignals: string[],
        resourceLocks: string[],
        completionPolicy: string,
        retryPolicy: { maxAttempts: number, backoffMs: number },
        allowedToolsPolicy: string,
        producesDeliverables: string[]
      }
    }
  },
  stepRuntime: {
    [stepId]: {
      status: 'pending' | 'ready' | 'dispatching' | 'in_progress' | 'waiting' | 'succeeded' | 'retryable_error' | 'terminal_error' | 'skipped' | 'blocked',
      attemptCount: number,
      activeSessionID: string | null,
      startedAt: string | null,
      completedAt: string | null,
      lastProgressAt: string | null,
      completionSource: string | null,
      lastError: null | { message: string, at: string }
    }
  },
  signals: {
    [signalName]: {
      emitted: boolean,
      emittedAt: string | null,
      emittedByStepId: string | null,
      payloadRef: string | null
    }
  },
  activeStepIds: string[],
  readyStepIds: string[],
  blockedStepIds: string[],
  retryQueue: string[],
  heldLocks: { [lockName]: string },
  compat: {
    activeDispatch: object | null,
    pendingManagers: string[],
    pendingCapabilityHands: string[],
    pendingProbes: string[],
    nextExpectedActor: string,
    deferredDispatchState: string,
    childDispatchSessionIDs: object
  }
}
```

### Signal model

Do **not** implement A → B coordination as child A directly messaging child B.

The runtime-owned signal model is:
- step A completes prerequisite work
- step A emits one or more durable signals
- reconcile loop records the signal in state
- any blocked step whose prerequisites are now satisfied becomes `ready`
- scheduler dispatches that step under normal lock/budget rules

This keeps authorization, recovery, and observability in one place.

### Example A/B orchestration graph

Target graph for the user’s example:

```text
planning-manager
  -> execution-manager
    -> step:A-prep
    -> step:B-prep

step:A-prep emits signal:data-ready
step:B-prep + signal:data-ready -> step:B-finish
step:B-finish -> acceptance-manager -> probes -> acceptance-closure
```

Recommended implementation detail:
- prefer `B-prep` and `B-finish` as two explicit steps
- avoid long-lived paused child sessions if possible
- only introduce “resume same child session” after graph-based re-dispatch is proven stable

---

## Execution Rules That Must Hold

1. Managers remain sequential in the first concurrent rollout.
2. Capability hands may run concurrently only when resource locks do not conflict.
3. Probes may run concurrently only after acceptance-manager has produced the acceptance round contract for verification.
4. Acceptance closure never overlaps with probes.
5. Every dispatch, completion, signal emission, retry, and lock transition must be idempotent.
6. Every step transition must be attributable to one of:
   - command input
   - chat completion callback
   - tool callback
   - workspace artifact observation
   - session-store observation
   - retry timer expiry
7. Final completion requires all reachable steps terminal plus deliverable satisfaction.

---

## Phase 0: Establish a Real Build and Test Contract

### Task 1: Make the runtime reproducible before behavior changes

**Files:**
- Modify: `plugin/package.json`
- Modify: `plugin/tsconfig.json`
- Create: `plugin/tsconfig.build.json`
- Create if needed: `plugin/tests/public-entrypoint.test.mjs`

**Step 1: Add failing package-level build/test expectations**
- Add package scripts for `build` and `test`.
- Add one smoke test that imports the public plugin entrypoint and verifies `id` and `server` exports exist.

**Step 2: Run the smoke test and confirm current build ergonomics are incomplete**

Run:
- `node --test plugin/tests/public-entrypoint.test.mjs`

Expected:
- PASS or FAIL is acceptable for the test itself, but package scripts/build path will be incomplete and must be fixed in this phase.

**Step 3: Add real scripts**
- Add `build`, `test`, and `pretest` scripts to `plugin/package.json`.
- Keep `dist/` as the shipped artifact.

**Step 4: Add a build config that can emit from `src` to `dist` later**
- Keep current behavior unchanged.
- Do not introduce graph runtime yet.

**Step 5: Run the package test command**

Run:
- `npm --prefix plugin test`

Expected:
- Existing tests pass.

---

## Phase 1: Make `plugin/src` Authoritative Without Behavioral Change

### Task 2: Port the current runtime into real source modules

**Files:**
- Create: `plugin/src/runtime/server.ts`
- Modify: `plugin/src/index.ts`
- Modify: `plugin/src/state/index.ts`
- Modify: `plugin/src/dispatch/index.ts`
- Modify: `plugin/src/blocking/index.ts`
- Modify: `plugin/src/observability/index.ts`
- Modify: `plugin/src/routing/index.ts`
- Modify: `plugin/src/intake/index.ts`
- Modify: `plugin/src/semantic-lock/index.ts`
- Modify: `plugin/src/mode/index.ts`
- Modify: `plugin/src/utils/index.ts`
- Generate: `plugin/dist/index.js`

**Step 1: Add a failing parity test for generated `dist` behavior**
- Use an existing integration test such as `plugin/tests/child-session-dispatch.test.mjs` or `plugin/tests/auto-progression.test.mjs` as the parity canary.

**Step 2: Run the parity canary before moving code**

Run:
- `node --test plugin/tests/child-session-dispatch.test.mjs plugin/tests/auto-progression.test.mjs`

Expected:
- PASS under current runtime.

**Step 3: Move code from `plugin/dist/index.js` into `plugin/src/runtime/server.ts`**
- Keep behavior line-for-line equivalent first.
- Convert `plugin/src/**` stubs into real module boundaries only where extraction is zero-risk.

**Step 4: Generate `plugin/dist/index.js` from `src` and keep package exports stable**
- `plugin/index.js` should remain the public entrypoint.
- Tests may continue importing `../dist/index.js` during migration.

**Step 5: Re-run the full test suite**

Run:
- `npm --prefix plugin test`

Expected:
- All existing plugin tests pass with no semantic change.

---

## Phase 2: Introduce Versioned Graph State Beside Legacy Fields

### Task 3: Add canonical graph/schema modules and migration scaffolding

**Files:**
- Create: `plugin/src/state/schema.ts`
- Create: `plugin/src/state/storage.ts`
- Create: `plugin/src/state/migration.ts`
- Create: `plugin/src/state/legacy-projection.ts`
- Create: `plugin/src/routing/graph.ts`
- Modify: `plugin/src/intake/index.ts`
- Modify: `plugin/src/runtime/server.ts`
- Generate: `plugin/dist/index.js`
- Create: `plugin/tests/step-graph.test.mjs`
- Create: `plugin/tests/state-schema-migration.test.mjs`
- Create: `plugin/tests/legacy-projection.test.mjs`

**Step 1: Write failing tests for graph compilation and state migration**
- Verify intake produces `schemaVersion: 2` state.
- Verify graph step generation from route metadata and selected hands/probes.
- Verify legacy fields are still projected correctly from graph state.

**Step 2: Run the new graph-state tests**

Run:
- `node --test plugin/tests/step-graph.test.mjs plugin/tests/state-schema-migration.test.mjs plugin/tests/legacy-projection.test.mjs`

Expected:
- FAIL because graph state does not exist yet.

**Step 3: Add graph schema and migration-on-read behavior**
- `loadPluginState()` must upgrade version-1 scalar state to version-2 graph state.
- Keep current scalar fields under `compat` projection.

**Step 4: Persist graph state during intake without changing runtime behavior**
- Queue-head dispatch may still exist temporarily.
- The new graph must be present and valid.

**Step 5: Re-run graph-state tests and full suite**

Run:
- `node --test plugin/tests/step-graph.test.mjs plugin/tests/state-schema-migration.test.mjs plugin/tests/legacy-projection.test.mjs`
- `npm --prefix plugin test`

Expected:
- New tests PASS.
- Existing tests remain green.

---

## Phase 3: Replace Queue-Head Dispatch with a Serial Reconcile Loop

### Task 4: Introduce a single graph-aware reconcile path while keeping concurrency disabled

**Files:**
- Create: `plugin/src/dispatch/reconcile.ts`
- Create: `plugin/src/dispatch/transitions.ts`
- Create: `plugin/src/dispatch/scheduler.ts`
- Modify: `plugin/src/runtime/server.ts`
- Generate: `plugin/dist/index.js`
- Create: `plugin/tests/reconcile-serial-compat.test.mjs`
- Modify: `plugin/tests/auto-progression.test.mjs`
- Modify: `plugin/tests/deferred-manager-dispatch.test.mjs`
- Modify: `plugin/tests/deferred-hand-dispatch.test.mjs`
- Modify: `plugin/tests/deferred-probe-closure.test.mjs`

**Step 1: Write a failing compatibility test for serial reconcile parity**
- The new reconcile loop must reproduce today’s exact actor sequence when all concurrency budgets are `1`.

**Step 2: Run the reconcile parity tests**

Run:
- `node --test plugin/tests/reconcile-serial-compat.test.mjs plugin/tests/auto-progression.test.mjs`

Expected:
- FAIL because current hooks still use imperative queue-head progression.

**Step 3: Route command, chat, tool, and watcher events through `reconcileRuntime()`**
- `command.execute.before`
- `chat.message`
- `tool.execute.after`
- autopilot watcher

**Step 4: Keep concurrency disabled in this phase**
- managers: max `1`
- hands: max `1`
- probes: max `1`

**Step 5: Re-run compatibility tests and full suite**

Run:
- `node --test plugin/tests/reconcile-serial-compat.test.mjs plugin/tests/auto-progression.test.mjs`
- `npm --prefix plugin test`

Expected:
- Serial behavior still matches today.

---

## Phase 4: Replace Singleton Authorization With Per-Step Authorization

### Task 5: Allow multiple valid child sessions without allowing stale or unrelated actors

**Files:**
- Create: `plugin/src/dispatch/authorization.ts`
- Modify: `plugin/src/blocking/index.ts`
- Modify: `plugin/src/runtime/server.ts`
- Generate: `plugin/dist/index.js`
- Create: `plugin/tests/per-step-authorization.test.mjs`
- Modify: `plugin/tests/orchestrator-tool-guard.test.mjs`

**Step 1: Write failing tests for plural active child authorization**
- Two concurrent child sessions may both perform legal work if both correspond to active steps.
- A completed or stale child session must still be rejected.

**Step 2: Run the authorization tests**

Run:
- `node --test plugin/tests/per-step-authorization.test.mjs plugin/tests/orchestrator-tool-guard.test.mjs`

Expected:
- FAIL because current guards assume a single `activeDispatch`.

**Step 3: Replace `activeDispatchMatches()` logic with step-scoped authorization**
- authorize by `stepId`
- authorize by `sessionID`
- authorize by runtime status

**Step 4: Keep top-level orchestrator blocking intact**
- The main thread still must not take over deferred execution work.

**Step 5: Re-run tests**

Run:
- `node --test plugin/tests/per-step-authorization.test.mjs plugin/tests/orchestrator-tool-guard.test.mjs`
- `npm --prefix plugin test`

Expected:
- Authorization is plural for live steps, strict for stale sessions.

---

## Phase 5: Add Per-Step Completion Policies and Idempotent Recovery

### Task 6: Make completion and retry logic graph-safe and duplicate-safe

**Files:**
- Create: `plugin/src/dispatch/completion.ts`
- Create: `plugin/src/dispatch/recovery.ts`
- Modify: `plugin/src/dispatch/reconcile.ts`
- Modify: `plugin/src/state/storage.ts`
- Modify: `plugin/src/runtime/server.ts`
- Generate: `plugin/dist/index.js`
- Create: `plugin/tests/completion-policy.test.mjs`
- Create: `plugin/tests/recovery-reconcile.test.mjs`
- Create: `plugin/tests/out-of-order-completion.test.mjs`
- Create: `plugin/tests/failed-branch-isolation.test.mjs`

**Step 1: Write failing tests for completion sources and duplicate observation**
- artifact completion
- tool-driven completion
- session-store completion
- duplicate completion callbacks
- restart recovery
- one failed branch not corrupting unrelated branches

**Step 2: Run the completion/recovery tests**

Run:
- `node --test plugin/tests/completion-policy.test.mjs plugin/tests/recovery-reconcile.test.mjs plugin/tests/out-of-order-completion.test.mjs plugin/tests/failed-branch-isolation.test.mjs`

Expected:
- FAIL because current completion code is scalar and singleton-oriented.

**Step 3: Implement step-scoped completion policies**
- managers may still complete from artifacts or session completion
- hands and probes complete from explicit progress/completion policy
- acceptance closure completes only after graph + deliverable checks

**Step 4: Make all transitions idempotent**
- same completion event must not double-finish a step
- same retry schedule must not duplicate dispatch

**Step 5: Re-run tests and full suite**

Run:
- `node --test plugin/tests/completion-policy.test.mjs plugin/tests/recovery-reconcile.test.mjs plugin/tests/out-of-order-completion.test.mjs plugin/tests/failed-branch-isolation.test.mjs`
- `npm --prefix plugin test`

Expected:
- Completion and recovery are graph-safe.

---

## Phase 6: Add Durable Signals and Waiting Semantics

### Task 7: Implement A/B-style cross-step notification using runtime-owned signals

**Files:**
- Create: `plugin/src/dispatch/signals.ts`
- Modify: `plugin/src/routing/graph.ts`
- Modify: `plugin/src/dispatch/reconcile.ts`
- Modify: `plugin/src/dispatch/transitions.ts`
- Modify: `plugin/src/runtime/server.ts`
- Generate: `plugin/dist/index.js`
- Create: `plugin/tests/signal-dependency.test.mjs`
- Create: `plugin/tests/waiting-step-wakeup.test.mjs`

**Step 1: Write failing tests for signal emission and wake-up**
- A and B prerequisite steps start together.
- B downstream step stays blocked until A emits `data-ready`.
- Once the signal is recorded, B downstream step becomes `ready` and dispatches.

**Step 2: Run the signal tests**

Run:
- `node --test plugin/tests/signal-dependency.test.mjs plugin/tests/waiting-step-wakeup.test.mjs`

Expected:
- FAIL because no durable signal model exists.

**Step 3: Implement persisted signals in canonical state**
- step definitions declare `dependsOnSignals` and `emitsSignals`
- reconcile loop marks blocked steps ready when both step and signal prerequisites are satisfied

**Step 4: Keep the first implementation as re-dispatch, not same-session resume**
- use `B-prep` and `B-finish` as separate steps
- do not introduce paused interactive child session continuation yet

**Step 5: Re-run tests**

Run:
- `node --test plugin/tests/signal-dependency.test.mjs plugin/tests/waiting-step-wakeup.test.mjs`
- `npm --prefix plugin test`

Expected:
- A/B dependency orchestration works deterministically.

---

## Phase 7: Enable Bounded Concurrent Capability Hands

### Task 8: Dispatch multiple hands concurrently under explicit lock rules

**Files:**
- Create: `plugin/src/dispatch/concurrency.ts`
- Modify: `plugin/src/dispatch/scheduler.ts`
- Modify: `plugin/src/dispatch/reconcile.ts`
- Modify: `plugin/src/routing/graph.ts`
- Generate: `plugin/dist/index.js`
- Create: `plugin/tests/concurrent-hand-dispatch.test.mjs`
- Create: `plugin/tests/lock-conflict-serialization.test.mjs`

**Step 1: Write failing tests for concurrent hand dispatch**
- non-conflicting hands may run together
- conflicting hands remain serialized by lock
- managers stay sequential

**Step 2: Run the concurrency tests**

Run:
- `node --test plugin/tests/concurrent-hand-dispatch.test.mjs plugin/tests/lock-conflict-serialization.test.mjs`

Expected:
- FAIL because concurrency budgets and lock arbitration do not exist.

**Step 3: Implement conservative lock groups**
- `workspace-write`
- `build-runner`
- `docs-write`
- `evidence-write`

**Step 4: Enable bounded hand concurrency only**
- keep probe concurrency disabled in this step
- keep acceptance closure exclusive

**Step 5: Re-run tests and full suite**

Run:
- `node --test plugin/tests/concurrent-hand-dispatch.test.mjs plugin/tests/lock-conflict-serialization.test.mjs`
- `npm --prefix plugin test`

Expected:
- Hand concurrency is correct and deterministic.

---

## Phase 8: Enable Concurrent Probes and Graph-Based Fan-In Closure

### Task 9: Let probes run concurrently and finish only through graph completion

**Files:**
- Modify: `plugin/src/dispatch/scheduler.ts`
- Modify: `plugin/src/dispatch/reconcile.ts`
- Modify: `plugin/src/dispatch/completion.ts`
- Generate: `plugin/dist/index.js`
- Create: `plugin/tests/concurrent-probe-dispatch.test.mjs`
- Create: `plugin/tests/graph-completion.test.mjs`
- Modify: `plugin/tests/deferred-probe-closure.test.mjs`

**Step 1: Write failing tests for parallel probes and final closure fan-in**
- probes may run in parallel after acceptance review
- acceptance closure waits for all reachable probe steps to be terminal

**Step 2: Run the probe fan-in tests**

Run:
- `node --test plugin/tests/concurrent-probe-dispatch.test.mjs plugin/tests/graph-completion.test.mjs plugin/tests/deferred-probe-closure.test.mjs`

Expected:
- FAIL because current probe flow is one-by-one.

**Step 3: Enable bounded probe concurrency and graph-based terminal checks**
- closure must evaluate graph state and deliverables, not queue emptiness

**Step 4: Preserve operator-visible `/check` semantics**
- `/check` should reconcile and advance the acceptance phase, not expose graph internals to the user.

**Step 5: Re-run tests**

Run:
- `node --test plugin/tests/concurrent-probe-dispatch.test.mjs plugin/tests/graph-completion.test.mjs plugin/tests/deferred-probe-closure.test.mjs`
- `npm --prefix plugin test`

Expected:
- Probe parallelism works and closure remains correct.

---

## Phase 9: Upgrade Observability and Operator Surfaces

### Task 10: Project graph runtime into the existing `.agent-memory/` surfaces

**Files:**
- Create: `plugin/src/observability/projections.ts`
- Modify: `plugin/src/observability/index.ts`
- Modify: `plugin/src/state/legacy-projection.ts`
- Modify: `plugin/src/runtime/server.ts`
- Generate: `plugin/dist/index.js`
- Modify: `plugin/README.md`
- Modify: `README.md`
- Create: `plugin/tests/status-projection.test.mjs`
- Create: `plugin/tests/managed-agent-index-projection.test.mjs`
- Create: `plugin/tests/route-packet-graph-summary.test.mjs`

**Step 1: Write failing projection tests**
- state/status/index artifacts must expose:
  - `activeStepIds`
  - `readyStepIds`
  - `blockedStepIds`
  - held locks
  - signal summary
  - legacy compatibility fields

**Step 2: Run projection tests**

Run:
- `node --test plugin/tests/status-projection.test.mjs plugin/tests/managed-agent-index-projection.test.mjs plugin/tests/route-packet-graph-summary.test.mjs`

Expected:
- FAIL because graph projections do not exist.

**Step 3: Update projections and docs**
- keep old fields for one migration cycle
- make graph state visible without requiring operators to parse raw internals

**Step 4: Re-run projection tests**

Run:
- `node --test plugin/tests/status-projection.test.mjs plugin/tests/managed-agent-index-projection.test.mjs plugin/tests/route-packet-graph-summary.test.mjs`

Expected:
- PASS

**Step 5: Re-run the full suite and review docs**

Run:
- `npm --prefix plugin test`

Expected:
- Full suite PASS.

---

## Phase 10: Harden Rollout and Compatibility

### Task 11: Add migration safety and rollout gates before enabling by default

**Files:**
- Modify: `plugin/src/state/migration.ts`
- Modify: `plugin/src/runtime/server.ts`
- Modify: `plugin/src/mode/index.ts`
- Generate: `plugin/dist/index.js`
- Create: `plugin/tests/legacy-state-upgrade-live.test.mjs`
- Create: `plugin/tests/manual-mode-compat.test.mjs`

**Step 1: Write failing tests for legacy live-state upgrade and manual compatibility**
- existing state snapshots upgrade safely
- `--manual` flows still work
- routes without graph-aware selection still reconcile safely under compatibility mode

**Step 2: Run rollout-compat tests**

Run:
- `node --test plugin/tests/legacy-state-upgrade-live.test.mjs plugin/tests/manual-mode-compat.test.mjs`

Expected:
- FAIL until migration paths are complete.

**Step 3: Add feature gating for concurrent execution if needed**
- allow graph runtime with serial budgets as the default during transition
- enable parallel hands/probes only after tests and docs are complete

**Step 4: Re-run compatibility tests and the full suite**

Run:
- `node --test plugin/tests/legacy-state-upgrade-live.test.mjs plugin/tests/manual-mode-compat.test.mjs`
- `npm --prefix plugin test`

Expected:
- PASS

**Step 5: Do one headless end-to-end validation**

Run:
- `npm --prefix plugin test`
- then perform one manual harness dry-run in a temp workspace using the existing slash commands and verify `.agent-memory/` projections

Expected:
- route graph progresses correctly and operator artifacts are understandable.

---

## Required New Test Matrix

Keep all existing tests as characterization tests. Add at minimum:

- `plugin/tests/public-entrypoint.test.mjs`
- `plugin/tests/step-graph.test.mjs`
- `plugin/tests/state-schema-migration.test.mjs`
- `plugin/tests/legacy-projection.test.mjs`
- `plugin/tests/reconcile-serial-compat.test.mjs`
- `plugin/tests/per-step-authorization.test.mjs`
- `plugin/tests/completion-policy.test.mjs`
- `plugin/tests/recovery-reconcile.test.mjs`
- `plugin/tests/out-of-order-completion.test.mjs`
- `plugin/tests/failed-branch-isolation.test.mjs`
- `plugin/tests/signal-dependency.test.mjs`
- `plugin/tests/waiting-step-wakeup.test.mjs`
- `plugin/tests/concurrent-hand-dispatch.test.mjs`
- `plugin/tests/lock-conflict-serialization.test.mjs`
- `plugin/tests/concurrent-probe-dispatch.test.mjs`
- `plugin/tests/graph-completion.test.mjs`
- `plugin/tests/status-projection.test.mjs`
- `plugin/tests/managed-agent-index-projection.test.mjs`
- `plugin/tests/route-packet-graph-summary.test.mjs`
- `plugin/tests/legacy-state-upgrade-live.test.mjs`
- `plugin/tests/manual-mode-compat.test.mjs`

---

## Recommended Commit Sequence

1. `test(plugin): add build/test scripts and freeze public runtime contract`
2. `build(plugin): move runtime source of truth into plugin/src and generate dist`
3. `refactor(plugin): add graph schema, migration, and legacy projections`
4. `refactor(plugin): route all progression through serial reconcile runtime`
5. `refactor(plugin): replace singleton child auth with per-step authorization`
6. `feat(plugin): add graph-safe completion and recovery`
7. `feat(plugin): add durable signals and waiting semantics`
8. `feat(plugin): enable bounded concurrent hand scheduling`
9. `feat(plugin): enable bounded concurrent probe scheduling and graph fan-in closure`
10. `docs(plugin): project graph runtime into status artifacts and update operator docs`
11. `feat(plugin): add rollout gates and legacy-state compatibility coverage`

Every commit must leave `npm --prefix plugin test` green.

---

## Non-Goals

- no new external queue service
- no new external database
- no slash-command redesign
- no hidden direct child-to-child communication channel
- no removal of the current `.agent-memory/` artifacts during the first migration cycle

---

## Final Guidance for Implementation

The safest migration path is:
- first make the runtime graph-shaped but still serial
- then make authorization, completion, and recovery plural
- only then turn on bounded concurrency

Do **not** start by enabling parallel dispatch while `activeDispatch` and queue-head assumptions still own authorization or completion. That path will create duplicate dispatches, stale child sessions, and irrecoverable state races.

# Harness Plugin Full Completion Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
>
> Historical note (2026-04-22): this plan captures an earlier transition state. Keep it for migration context only; the current runtime is source-authored under `plugin/src/**` and package-local routing is no longer anchored on repo-root `plugin/dist/index.js` assumptions.

**Goal:** Finish the Harness plugin from a stable intake/routing controller into a full runtime-governed orchestration system that safely advances manager → hand → probe → acceptance without OMO/Sisyphus contamination.

**Architecture:** Keep `command.execute.before` as an intake-only transaction that writes authoritative route state and route-packet artifacts. Move all downstream progression into an explicit deferred-dispatch state machine that consumes the route packet in later stages, with top-level orchestrator behavior tightly constrained during intake and with per-actor phase ownership enforced in hooks. Preserve command-entry stability while adding safe progression one stage at a time.

**Tech Stack:** OpenCode plugin runtime (`plugin/dist/index.js`), OpenCode hook system (`command.execute.before`, `chat.message`, `experimental.chat.system.transform`, `tool.execute.before`, `tool.execute.after`), Node.js built-in test runner, JSON/Markdown state artifacts under `.agent-memory/`.

---

## Current Verified Baseline

What is already true in the current repo:
- `/control` command intake enters `command.execute.before`
- real headless runs create stable:
  - `.agent-memory/harness-plugin-state.json`
  - `.agent-memory/orchestration-status.md`
  - `.agent-memory/managed-agent-state-index.json`
  - `.agent-memory/route-packet.json`
- route selection and selected hands/probes are working for:
  - `F-M1`
  - `C-M1`
  - `A-M1`
  - `P-H1`
- top-level immediate `promptAsync` fan-out has been removed from intake
- top-level harness-orchestrator tool calls during `currentPhase=intake` are now blocked in the plugin
- plugin regression tests currently pass

What is not finished yet:
- there is no safe deferred dispatch engine that resumes from `route-packet.json`
- managers/hands/probes do not yet advance automatically after intake in the live runtime
- top-level post-intake behavior is constrained, but not yet replaced by a clean deferred orchestration path
- completion/acceptance closure is not yet reintroduced in a safe runtime phase
- route packet is richer, but not yet consumed by a later dispatcher

## Completion Definition

The Harness plugin is only "complete" when all of the following are true:
1. `/control ...` performs intake only and returns reliably.
2. A deferred progression mechanism safely advances the route after intake.
3. `F-M1`, `C-M1`, `A-M1`, and `P-H1` each progress through the correct manager stack.
4. Selected hands/probes are dispatched from deferred state, not from intake.
5. Top-level `harness-orchestrator` no longer falls back into generic OMO analysis work after intake.
6. Acceptance closure can happen again without reintroducing prompt lifecycle conflicts.
7. Live headless validation shows stable route advancement artifacts for at least `F-M1` and `P-H1`.
8. Regression tests cover the state machine so future refactors cannot regress these guarantees.

---

## Phase 1: Lock the Current Stable Intake Contract

### Task 1: Freeze the current intake-only invariants in tests

**Files:**
- Modify: `plugin/tests/hook-dispatch.test.mjs`
- Modify: `plugin/tests/intake-tool-guard.test.mjs`
- Create if needed: `plugin/tests/intake-response-shaping.test.mjs`

**Step 1: Add a failing test for top-level intake response shaping**
- Verify that when a harness-orchestrator message is processed during `currentPhase=intake`, the resulting visible text is a short, deterministic intake-only summary.

**Step 2: Run only the new intake response test and verify it fails**
Run:
- `node --test plugin/tests/intake-response-shaping.test.mjs`
Expected:
- FAIL because current shaping is not fully covered and may still allow excess explanation.

**Step 3: Implement the minimal plugin changes needed to make the test pass**
- Keep the response concise and deterministic.
- Do not add dispatch logic in intake.

**Step 4: Run the intake response test again**
Run:
- `node --test plugin/tests/intake-response-shaping.test.mjs`
Expected:
- PASS

**Step 5: Run all plugin tests**
Run:
- `node --test plugin/tests/*.test.mjs`
Expected:
- All tests PASS

---

## Phase 2: Introduce a Deferred Dispatch Queue Model

### Task 2: Add explicit deferred dispatch state to the route packet and plugin state

**Files:**
- Modify: `plugin/dist/index.js`
- Modify: `plugin/tests/hook-dispatch.test.mjs`
- Modify: `plugin/tests/route-selection.test.mjs`

**Step 1: Write failing tests for deferred queue fields**
Add assertions that intake artifacts include explicit deferred-dispatch fields such as:
- pending manager queue
- pending selected hand queue
- pending selected probe queue
- dispatch mode / dispatch owner

**Step 2: Run the specific failing tests**
Run:
- `node --test plugin/tests/hook-dispatch.test.mjs`
Expected:
- FAIL because those fields are not yet present.

**Step 3: Add minimal queue fields to state + route packet**
Recommended additions:
- `pendingManagers`
- `pendingCapabilityHands`
- `pendingProbes`
- `dispatchStage` or `deferredDispatchState`
- `lastCompletedActor`

**Step 4: Sync queue fields into all durable artifacts**
Update:
- `harness-plugin-state.json`
- `route-packet.json`
- `managed-agent-state-index.json`
- `orchestration-status.md`

**Step 5: Re-run the hook dispatch tests**
Run:
- `node --test plugin/tests/hook-dispatch.test.mjs`
Expected:
- PASS

---

## Phase 3: Create a Safe Post-Intake Progression Trigger

### Task 3: Decide and implement the next runtime hook that is allowed to consume deferred dispatch

**Files:**
- Modify: `plugin/dist/index.js`
- Create/Modify tests under `plugin/tests/`
- Possibly modify: `docs/plans/2026-04-17-harness-plugin-full-completion-plan.md` notes section if runtime discovery changes assumptions

**Step 1: Write a failing test for the next progression trigger**
Choose one safe progression surface and encode it in tests first. Candidate patterns:
- a post-command event path
- a follow-up `chat.message` path that only consumes deferred queues and never creates new intake
- a dedicated tool-safe progression step driven by a route packet marker

The test should prove:
- deferred progression consumes `pendingManagers[0]`
- top-level intake remains untouched
- progression does not happen inside `command.execute.before`

**Step 2: Run the new progression-trigger test**
Expected:
- FAIL

**Step 3: Implement the minimal deferred progression trigger**
Requirements:
- must not call a cascade of prompt dispatches from intake
- must consume only one controlled progression stage at a time
- must update durable state before and after the stage transition

**Step 4: Re-run the progression-trigger test**
Expected:
- PASS

**Step 5: Re-run full plugin tests**
Run:
- `node --test plugin/tests/*.test.mjs`
Expected:
- PASS

---

## Phase 4: Reintroduce Manager Dispatch Safely, One Stage at a Time

### Task 4: Reintroduce only the first manager stage from deferred state

**Files:**
- Modify: `plugin/dist/index.js`
- Modify: `plugin/tests/hook-dispatch.test.mjs`
- Create: `plugin/tests/deferred-manager-dispatch.test.mjs`

**Step 1: Write failing tests for first-manager-only dispatch**
Target behavior:
- `F-M1` should dispatch only `planning-manager` from deferred state first
- `A-M1` should dispatch only `capability-planner` first
- `P-H1` should dispatch only `feature-planner` first
- after dispatch, queue advances and state updates accordingly

**Step 2: Run the new manager dispatch tests**
Expected:
- FAIL

**Step 3: Implement minimal first-manager deferred dispatch**
Constraints:
- only one manager stage per cycle
- update:
  - `dispatchedManagers`
  - `pendingManagers`
  - `nextExpectedActor`
  - `currentPhase`
- keep hands/probes deferred for later phases

**Step 4: Re-run manager dispatch tests**
Expected:
- PASS

**Step 5: Re-run full test suite**
Expected:
- PASS

---

## Phase 5: Add Execution-Hand Dispatch from Manager-Owned State

### Task 5: Let execution-manager consume pending hands without top-level orchestrator drift

**Files:**
- Modify: `plugin/dist/index.js`
- Modify: `plugin/tests/intake-tool-guard.test.mjs`
- Create: `plugin/tests/deferred-hand-dispatch.test.mjs`

**Step 1: Write failing tests for deferred hand progression**
Target behavior:
- hands are not dispatched by intake
- hands are dispatched only when execution phase becomes active
- dispatch order matches `selectedCapabilityHands`

**Step 2: Run the hand progression tests**
Expected:
- FAIL

**Step 3: Implement minimal hand progression logic**
- consume one selected hand at a time or one execution round at a time
- update durable state before/after dispatch
- preserve existing execution-manager guardrails

**Step 4: Re-run hand progression tests**
Expected:
- PASS

**Step 5: Run full test suite**
Expected:
- PASS

---

## Phase 6: Add Probe Dispatch and Acceptance Closure Safely

### Task 6: Reintroduce probe progression and final closure from deferred state

**Files:**
- Modify: `plugin/dist/index.js`
- Create: `plugin/tests/deferred-probe-dispatch.test.mjs`
- Create/Modify: `plugin/tests/deferred-acceptance-closure.test.mjs`

**Step 1: Write failing tests for probe progression**
Target behavior:
- probes are consumed from `pendingProbes`
- acceptance-manager is only considered ready for closure after required probes have been recorded

**Step 2: Write failing tests for final closure**
Target behavior:
- when required managers/hands/probes have all advanced correctly, final state may become `complete`
- route packet + orchestration status update missing deliverables / blocking gaps appropriately

**Step 3: Run these new tests**
Expected:
- FAIL

**Step 4: Implement minimal probe progression and closure logic**
Constraints:
- do not reintroduce intake-time `promptAsync` fan-out
- keep closure gated by durable state, not by optimistic assumptions

**Step 5: Re-run probe + closure tests**
Expected:
- PASS

**Step 6: Run full plugin test suite**
Expected:
- PASS

---

## Phase 7: Live Headless Validation on Real Routes

### Task 7: Validate live runtime behavior on `F-M1` and `P-H1`

**Files:**
- Runtime artifacts under a disposable workspace such as:
  - `/Users/tianyuan/Documents/other_workspace/harness-route-validation/...`

**Step 1: Start a fresh headless OpenCode server on a clean port**
Run:
- `opencode serve --print-logs --log-level DEBUG --port <PORT>`

**Step 2: Create a fresh test workspace and clear `.agent-memory/`**
Ensure a clean slate.

**Step 3: Trigger an `F-M1` route**
Example:
- `/control 修复构建报错并补上回归验证`

**Step 4: Verify live artifacts**
Inspect:
- `.agent-memory/harness-plugin-debug.log`
- `.agent-memory/harness-plugin-state.json`
- `.agent-memory/orchestration-status.md`
- `.agent-memory/route-packet.json`

Confirm:
- intake completes
- deferred manager/hand/probe progression happens in the intended order
- no intake-time `prompt_async failed`

**Step 5: Trigger a `P-H1` route**
Example:
- `/control 为现有系统搭建一个完整产品级功能，覆盖关键用户旅程与发布质量`

**Step 6: Verify live artifacts again**
Confirm:
- `feature-planner` first
- selected UI/browser actors preserved
- route packet and state remain authoritative

**Step 7: Record timing observations**
Do not optimize yet unless correctness regresses. Just record final durations and loop depth.

---

## Phase 8: Final Hardening and Documentation Sync

### Task 8: Align docs/skills with the final runtime behavior

**Files:**
- Modify if needed: `plugin/README.md`
- Modify if needed: `docs/full-harness-plugin-architecture.md`
- Modify if needed: `docs/plans/2026-04-17-harness-plugin-full-completion-plan.md`
- Possibly patch: `software-development/opencode-harness-plugin-development` if new lessons emerge

**Step 1: Write a failing docs checklist**
Checklist items:
- intake-only command hook documented
- deferred dispatch documented
- route packet fields documented
- live validation method documented

**Step 2: Update docs minimally to match reality**
No stale claims about intake-time manager/hand/probe fan-out.

**Step 3: Re-run syntax/tests one last time**
Run:
- `node --check plugin/dist/index.js`
- `node --test plugin/tests/*.test.mjs`
- `bash -n setup.sh uninstall.sh`

Expected:
- all PASS

---

## Likely Files To Change

Core runtime:
- `plugin/dist/index.js`

Tests:
- `plugin/tests/hook-dispatch.test.mjs`
- `plugin/tests/route-selection.test.mjs`
- `plugin/tests/intake-tool-guard.test.mjs`
- `plugin/tests/intake-response-shaping.test.mjs`
- `plugin/tests/deferred-manager-dispatch.test.mjs`
- `plugin/tests/deferred-hand-dispatch.test.mjs`
- `plugin/tests/deferred-probe-dispatch.test.mjs`
- `plugin/tests/deferred-acceptance-closure.test.mjs`

Documentation:
- `plugin/README.md`
- `docs/full-harness-plugin-architecture.md`
- `docs/plans/2026-04-17-harness-plugin-full-completion-plan.md`

---

## Risks and Watchouts

1. **Do not reintroduce immediate dispatch from intake**
This was the original live-runtime failure source.

2. **Keep top-level orchestrator command-only**
Do not let ordinary `chat.message` reopen intake.

3. **Differentiate route correctness from runtime isolation**
A state-machine test passing does not prove OMO contamination is gone.

4. **Do not trust server timing alone**
Always inspect durable state artifacts.

5. **Add tests before each new dispatch phase**
Because regressions here are easy and costly.

---

## Immediate Next Execution Target

The next concrete implementation target after this plan is:
- build the explicit deferred dispatch queue model and first-manager-only progression

That is the smallest safe step that moves this from "stable intake controller" toward the full completion target without reintroducing the intake-time runtime conflict.

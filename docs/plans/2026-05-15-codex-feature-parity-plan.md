# OMO-Harness-Skills → Codex-Harness-Plugin Feature Parity Plan

> **Goal:** Upgrade omo-harness-skills from its current state to achieve full functional parity with codex-harness-plugin, covering task isolation, security boundaries, MCP protocol integration, recovery resilience, and developer experience.

> **Scope:** This plan covers only net-new features that codex-harness-plugin has and omo-harness-skills lacks. It does NOT touch existing omo features (hook enforcement, DAG graph runtime, auto-pilot, etc.) unless integration requires it.

> **Status:** Draft — 2026-05-15

---

## Current Verified Baseline

What is true about omo-harness-skills right now:

| Capability | Status |
|---|---|
| Plugin runtime (TypeScript, 37 source files, 94 tests) | ✅ Production |
| Hook enforcement (8 hooks + 3 JSON Schemas) | ✅ Production |
| DAG graph runtime (signal scheduling, resource locks, bounded concurrency) | ✅ Production |
| 5-route system (J-L1/F-M1/C-M1/A-M1/P-H1) | ✅ Production |
| 4-layer managed agents (brain → managers → hands → probes) | ✅ Production |
| Auto-pilot mode (dynamic quality gates, calibration) | ✅ Production |
| Context reset (8 triggers, handoff generation) | ✅ Production |
| Feature planner (50-200+ features, immutable features.json) | ✅ Production |
| Capability planner (baseline/gap analysis) | ✅ Production |
| Observability CLI (`hctl status/trace/blockers/events/summary/check`) | ✅ Production |
| `.agent-memory/` durable state (50+ file templates) | ✅ Production |
| Agent isolation (`harness` vs `opencode` mode) | ✅ Production |

What is NOT true yet (gaps vs codex-harness-plugin):

| Gap | Priority | Severity |
|---|---|---|
| Task Board + Git Worktree isolation | P0 | Core |
| Credential boundary management | P0 | Core |
| Sandbox system (path isolation, env sanitization, persistence) | P0 | Core |
| SessionStore event replay recovery (JSONL + deep-merge patches) | P1 | Architecture |
| Deterministic agent adapter (Simulated Mode for testing) | P1 | Architecture |
| MCP tool protocol (standardized external tool interface) | P1 | Architecture |
| Plan Intake Gate (risk detection, confidence scoring) | P2 | Enhancement |
| Continuation policy engine (fine-grained autonomy control) | P2 | Enhancement |
| User-facing output contract (global enforcement) | P2 | Enhancement |
| Review Agent (independent pre-acceptance review) | P2 | Enhancement |
| Doctor script (50+ installation health checks) | P2 | DX |
| Runner CLI (start/watch/wake/step/task-create/inspect) | P2 | DX |

---

## Final Capability Contract

The implementation is only complete when ALL of the following are true:

### P0 — Core Security & Isolation

1. **Task Board**: A task creation command creates an isolated git worktree with an independent branch and independent `.agent-memory/`. Multiple tasks can run concurrently without state pollution. Tasks can be listed, resumed, and archived via CLI.
2. **Credential Boundary**: Credentials can be registered by name with tool-scope restrictions. Credentials are resolved from environment on demand and automatically redacted from all event logs and evidence files. Environment variables passed to child processes are sanitized to a safe allowlist.
3. **Sandbox System**: All file operations from capability agents can optionally execute inside a path-isolated sandbox. Shell commands run within the sandbox root. Sandbox state persists across process restarts. Sandbox can be cleaned up explicitly.

### P1 — Architecture Enhancements

4. **SessionStore Recovery**: Every route session has an append-only event log (`events.jsonl`) and deep-merge state patches (`state-patches.jsonl`). After a crash, the runtime can reconstruct full state by replaying events and merging patches without data loss.
5. **Deterministic Agent Adapter**: A `simulated` agent mode exists where all actors write placeholder files with deterministic content instead of spawning real subagents. The full route lifecycle can be tested without any external dependencies.
6. **MCP Tool Protocol**: All runner tools are exposed as MCP-compatible functions callable via JSON-RPC stdio. External systems (beyond OpenCode) can interact with the harness runtime through this standardized protocol.

### P2 — Enhancement & DX

7. **Plan Intake Gate**: On `/control` intake, the system auto-detects 6 risk categories (ambiguous goal, destructive change, external credential, cost/money, safety boundary, route/goal change). It generates blocking vs non-blocking questions and computes a plan confidence score.
8. **Continuation Policy**: Users can specify auto-continuation behavior via keywords. The runtime makes smart decisions: route complete → finish; semantic/credential block → ask user; delegate block → dispatch real agent; other blocks → auto retry.
9. **User-Facing Output Contract**: All agent output exposed to users is filtered to exclude internal orchestration details (task IDs, state patches, lock operations, agent role names, tool names). Currently advisory — plan enforces globally.
10. **Review Agent**: A dedicated `review-agent` capability hand performs independent pre-acceptance review with structured output (`accepted`/`request_changes`/`rejected`).
11. **Doctor Script**: A `doctor.sh` script performs 50+ installation health checks: config paths, symlink integrity, cache consistency, MCP tool availability, plugin load verification, model availability.
12. **Runner CLI Expansion**: `hctl` gains subcommands: `start`, `watch`, `wake`, `step`, `inspect`, `task-create`, `task-list`, `task-resume`, `task-archive`.

---

## Implementation Phases

### Phase 0 — Foundation (Task Board + Worktree Isolation)

**Rationale:** Task isolation is the prerequisite for all other work. Without it, sandbox, credential, and session features cannot be properly tested because tasks would pollute each other's state.

**Output:** Multiple concurrent harness tasks can run in isolated git worktrees without state interference.

#### Task 0.1: Create Task Board storage and CLI

| Item | Detail |
|---|---|
| **Files to create** | `plugin/src/task-board/index.ts`, `plugin/src/task-board/storage.ts`, `plugin/src/task-board/schema.ts` |
| **Files to modify** | `plugin/src/runtime/server.ts` (add task board init), `plugin/src/runtime/constants.ts` (add BOARD_ROOT), `scripts/harness` (add `task-create/list/resume/archive` subcommands) |
| **What to implement** | Task board JSON storage at `~/.opencode/harness-board/tasks.json` (configurable via `OPENCODE_HARNESS_BOARD_ROOT`). File-based locking via `mkdir` mutex with stale lock timeout (30s). Atomic writes (write-to-temp + rename). Task record schema: `taskId`, `title`, `sourceWorkspaceRoot`, `workspaceRoot`, `branch`, `runnerSessionId`, `requestId`, `status`, `nextExpectedActor`, `blockedReason`, `createdAt`, `updatedAt`. |
| **Pattern to follow** | codex-harness-plugin `runner/task-board.mjs` |
| **Tests** | `plugin/tests/task-board.test.ts`: CRUD, concurrent access, stale lock recovery, archive, list filtering |
| **Manual QA** | Create 3 tasks, verify unique worktrees and branches exist, archive one, verify it's excluded from default list |

#### Task 0.2: Implement git worktree creation per task

| Item | Detail |
|---|---|
| **Files to create** | `plugin/src/task-board/worktree.ts` |
| **Files to modify** | `plugin/src/task-board/index.ts` (integrate worktree creation) |
| **What to implement** | On `task create`, run `git worktree add -b codex/harness/<taskId> .harness-worktrees/<taskId>`. Verify `.agent-memory/` is created inside the worktree. On archive, run `git worktree remove .harness-worktrees/<taskId>` and `git branch -D codex/harness/<taskId>`. |
| **Pattern to follow** | codex-harness-plugin `runner/task-board.mjs` |
| **Tests** | `plugin/tests/worktree.test.ts`: verify worktree dir exists, branch exists, `.agent-memory/` initialized, archive cleanup |
| **Manual QA** | Create task, `ls .harness-worktrees/<taskId>`, verify git branch, archive and verify cleanup |

#### Task 0.3: Integrate task board with route intake

| Item | Detail |
|---|---|
| **Files to modify** | `plugin/src/runtime/server.ts` (`initializeHarnessTask` to accept optional taskId), `plugin/src/runtime/utils.ts` (add taskId to route state) |
| **What to implement** | When a task is created via `hctl task-create`, the subsequent `/control` command within that task's worktree automatically associates with the task. `harness-plugin-state.json` includes `taskId` field. `hctl status` shows taskId when applicable. |
| **Tests** | `plugin/tests/task-board-integration.test.ts`: full flow task-create → /control → verify state association |
| **Manual QA** | `hctl task-create "fix build"`, then inside worktree run `/control fix build error`, verify `hctl status` shows taskId |

---

### Phase 1 — Security (Credential Boundary + Sandbox)

**Rationale:** Security isolation must come before any tool protocol work. Credential leaks and path traversal are unacceptable in production.

**Output:** All tool execution is sandboxed. Credentials are never leaked to logs or events.

#### Task 1.1: Implement credential boundary

| Item | Detail |
|---|---|
| **Files to create** | `plugin/src/security/credential-boundary.ts` |
| **What to implement** | `registerCredentialReference(name, provider, toolScope)` — registers a credential by name with tool-scope restrictions. `resolveCredentialForTool(toolName)` — resolves env-based credentials, validates against tool scope. `redactCredentialFromEvents(events, credentials)` — scans event content for credential values and replaces with `[REDACTED]`. `sanitizeEnvironment(env, allowlist)` — strips environment to allowlist (PATH, HOME, LANG, TMPDIR, etc.). |
| **Pattern to follow** | codex-harness-plugin `runner/credential-boundary.mjs` |
| **Config** | `plugin/config/credential-registry.json` — optional file listing known credentials with tool scopes |
| **Tests** | `plugin/tests/credential-boundary.test.ts`: register → resolve → verify scope validation, redact → verify no secrets in output, sanitize → verify only allowlist keys remain |
| **Manual QA** | Register a test credential, resolve it, redact events containing it, verify output is clean |

#### Task 1.2: Implement sandbox system

| Item | Detail |
|---|---|
| **Files to create** | `plugin/src/security/sandbox.ts`, `plugin/src/security/sandbox-contract.ts` |
| **What to implement** | `createSandbox(sessionId, root?)` — creates sandbox root (default: `.agent-memory/sandboxes/<sandboxId>`). `resolveSandboxPath(sandboxId, relativePath)` — resolves paths under sandbox root, rejects paths that escape root. `executeInSandbox(sandboxId, tool, params)` — routes file read/write/append and shell.run through sandbox. `destroySandbox(sandboxId)` — optional cleanup of sandbox files. Sandbox state persisted to `.agent-memory/sandboxes/<sandboxId>.json` for cross-restart survival. |
| **Pattern to follow** | codex-harness-plugin `runner/sandbox/` |
| **Integration** | Sandbox is opt-in per route via routing-table.json `sandbox: true` flag. Default: off for backward compatibility. |
| **Tests** | `plugin/tests/sandbox.test.ts`: path isolation (outside-root access blocked), shell execution within sandbox, file operations, persistence across restarts, destroy cleanup |
| **Manual QA** | Create sandbox, write file inside sandbox root, attempt to read file outside sandbox (should fail), restart process and verify sandbox state survives, destroy and verify cleanup |

#### Task 1.3: Integrate credential boundary into tool executor

| Item | Detail |
|---|---|
| **Files to modify** | `plugin/src/runtime/server.ts` (tool before hook), `plugin/src/runtime/utils.ts` (add credential redaction to event emission) |
| **What to implement** | Before every shell.run or file.write tool execution, sanitize environment via `sanitizeEnvironment()`. After every tool execution, redact credential values from event content before appending to `activity.jsonl`. Add `credential-boundary.ts` integration point in the existing tool callback chain. |
| **Tests** | `plugin/tests/credential-integration.test.ts`: verify env is sanitized before shell.run, verify events are redacted after tool completion |
| **Manual QA** | Set `API_KEY=secret123`, run a route with shell commands, verify `activity.jsonl` contains `[REDACTED]` not `secret123` |

---

### Phase 2 — Recovery & Resilience (SessionStore)

**Rationale:** Current state is file-based with no replay capability. Crashes lose in-flight work. SessionStore adds crash-proof durability.

**Output:** Route sessions survive crashes. State can be reconstructed from event logs.

#### Task 2.1: Implement SessionStore core

| Item | Detail |
|---|---|
| **Files to create** | `plugin/src/session/session-store.ts` |
| **What to implement** | `createSession(sessionId, metadata)` — creates `.agent-memory/sessions/<sessionId>/`, writes `session.json` with metadata, initializes empty `events.jsonl` and `state-patches.jsonl`. `emitEvent(sessionId, event)` — appends to `events.jsonl` with auto-incrementing sequence numbers. `getEvents(sessionId, filters?)` — reads events with optional type/seq range filtering. `appendStatePatch(sessionId, patch)` — appends JSON line with timestamp, applies deep-merge to reconstruct state. `getLatestState(sessionId)` — deep-merges all patches to return current state. |
| **Pattern to follow** | codex-harness-plugin `runner/session-store.mjs` |
| **Tests** | `plugin/tests/session-store.test.ts`: CRUD, event sequencing, type filtering, deep-merge patch reconstruction, empty session, large event volume |
| **Manual QA** | Create session, emit 5 events, read back with type filter, apply 3 state patches, verify deep-merge result |

#### Task 2.2: Wire SessionStore into route lifecycle

| Item | Detail |
|---|---|
| **Files to modify** | `plugin/src/runtime/server.ts` (replace direct activity.jsonl writes with session events), `plugin/src/state/storage.ts` (add session-aware state loading) |
| **What to implement** | On route intake, create a session. On every state transition (manager dispatched, hand completed, probe dispatched, acceptance decided), emit typed events. On plugin startup, `reconcileRuntime()` reads session events instead of (or in addition to) `harness-plugin-state.json`. State patches record each state transition for crash recovery. |
| **Backward compat** | Existing `harness-plugin-state.json` remains authoritative. SessionStore is written in parallel. A migration period flag controls which source is authoritative. |
| **Tests** | `plugin/tests/session-integration.test.ts`: simulate crash at each lifecycle phase, verify SessionStore reconstructs correct state |
| **Manual QA** | Start route, kill process midway, restart, verify `hctl status` shows correct phase |

#### Task 2.3: Implement recovery (wake from crash)

| Item | Detail |
|---|---|
| **Files to create** | `plugin/src/session/recovery.ts` |
| **Files to modify** | `plugin/src/runtime/server.ts` (add wake entry point) |
| **What to implement** | `resumeFromLastEvent(sessionId)` — reads all events, rebuilds active actor/tool state. `repairDerivedState(sessionId)` — releases stale file locks from dead actors. `wake(sessionId)` — full cycle: resume + repair → check for pending tools → return status (blocked/completed/active/runnable). |
| **Pattern to follow** | codex-harness-plugin `runner/recovery.mjs` |
| **Tests** | `plugin/tests/recovery.test.ts`: wake with pending tools, stale lock cleanup, already-completed session, crashed mid-dispatch |
| **Manual QA** | Dispatch a capability hand, kill process, run `hctl wake`, verify hand continues from checkpoint |

---

### Phase 3 — Testing & Simulation (Deterministic Agent Adapter)

**Rationale:** 94 tests currently require real agent dispatch or complex mocking. A deterministic simulator enables fast, reliable testing of the full route lifecycle.

**Output:** All route lifecycles can be tested in simulated mode with deterministic output.

#### Task 3.1: Implement deterministic agent adapter

| Item | Detail |
|---|---|
| **Files to create** | `plugin/src/testing/simulated-agent-adapter.ts` |
| **What to implement** | `DeterministicAgentAdapter` class with mode `simulated`. On dispatch of any actor, instead of spawning a real subagent, writes a placeholder file to the expected evidence/state location with deterministic content (actor name + step ID + timestamp). Supports configurable success/failure simulation per step type. Returns structured results matching the real agent output format. |
| **Pattern to follow** | codex-harness-plugin `runner/agent-adapters/deterministic-agent-adapter.ts` equivalent |
| **Tests** | `plugin/tests/simulated-e2e.test.ts`: run full F-M1/C-M1/P-H1 routes in simulated mode, verify all expected files created, verify route reaches completion |
| **Manual QA** | Run `hctl start --mode simulated` on a test route, verify all phases complete without real agent spawn |

#### Task 3.2: Add simulated mode toggle

| Item | Detail |
|---|---|
| **Files to modify** | `plugin/src/mode/index.ts` (add `isSimulatedMode()`), `plugin/src/runtime/server.ts` (dispatch uses simulated adapter when mode active), `scripts/harness` (add `--simulated` flag to `start`/`watch`) |
| **What to implement** | `simulated` mode via environment variable `OPENCODE_HARNESS_SIMULATED=1` or CLI flag `--simulated`. When active, all agent dispatch goes through deterministic adapter. Mode is logged in `harness-plugin-state.json`. |
| **Tests** | Update existing E2E tests to optionally use simulated mode for faster execution |
| **Manual QA** | Export `OPENCODE_HARNESS_SIMULATED=1`, start route, verify no real subagent spawned |

---

### Phase 4 — Protocol Standardization (MCP Server)

**Rationale:** Currently, the harness can only be driven through OpenCode slash commands. MCP exposes all tools as a standard protocol, enabling external orchestration.

**Output:** All harness tools are callable via MCP JSON-RPC stdio from any MCP-compatible client.

#### Task 4.1: Create MCP server entry point

| Item | Detail |
|---|---|
| **Files to create** | `plugin/src/mcp/server.ts`, `plugin/src/mcp/tools.ts`, `plugin/src/mcp/transport.ts` |
| **Files to modify** | `plugin/package.json` (add `mcp-server` binary), `scripts/harness` (add `mcp` subcommand to start server) |
| **What to implement** | MCP server using JSON-RPC stdio transport. Registers all harness tools as MCP tools with JSON Schema parameter definitions. Tools: `openode_harness_init`, `openode_harness_status`, `openode_harness_next_action`, `openode_harness_dispatch_actor`, `openode_harness_complete_actor`, `openode_harness_validate_write`, `openode_harness_validate_acceptance`, `openode_harness_validate_route_completeness`, `openode_harness_runner_start`, `openode_harness_runner_step`, `openode_harness_runner_wake`, `openode_harness_runner_status`, `openode_harness_session_create`, `openode_harness_session_events`, `openode_harness_session_timeline`, `openode_harness_task_list`, `openode_harness_task_create`, `openode_harness_task_resume`, `openode_harness_task_archive`, `openode_harness_reconcile`, `openode_harness_record_event`. |
| **Pattern to follow** | codex-harness-plugin `plugins/codex-harness-plugin/scripts/codex-harness-mcp.mjs` |
| **Tests** | `plugin/tests/mcp-transport.test.ts`: tool list, tool call/response, error handling, concurrent calls |
| **Manual QA** | Start `hctl mcp`, send JSON-RPC `tools/list` via stdin, verify all tools returned, send `tools/call` and verify response |

#### Task 4.2: Wire MCP tools to existing runtime

| Item | Detail |
|---|---|
| **Files to modify** | `plugin/src/mcp/tools.ts` (implement each tool handler), `plugin/src/mcp/server.ts` (dispatch to runtime) |
| **What to implement** | Each MCP tool handler calls the corresponding internal runtime function. State tools delegate to `plugin/src/state/`. Dispatch tools delegate to `plugin/src/dispatch/`. Validation tools delegate to existing validation functions. Runner tools start/manage the runner loop. |
| **Tests** | `plugin/tests/mcp-integration.test.ts`: full route lifecycle via MCP tools, verify state consistency with slash-command equivalent |
| **Manual QA** | Via MCP client: init → status → dispatch actor → complete actor → validate → verify route completion |

---

### Phase 5 — Intake Enhancement (Plan Intake Gate + Continuation Policy)

**Rationale:** The current semantic lock is binary (block or proceed). The Plan Intake Gate adds nuanced risk detection and confidence scoring. Continuation policy enables fine-grained autonomy control.

**Output:** Intake provides structured risk assessment. Users can specify how autonomously the system should proceed.

#### Task 5.1: Implement Plan Intake Gate

| Item | Detail |
|---|---|
| **Files to create** | `plugin/src/intake/plan-intake-gate.ts` |
| **Files to modify** | `plugin/src/runtime/server.ts` (call Plan Intake Gate after semantic lock), `plugin/src/runtime/utils.ts` (add risk flag types) |
| **What to implement** | `buildPlanIntakeGate(taskDescription, routeId)` — analyzes task description for 6 risk categories: `ambiguous_goal` (unclear what "done" means), `destructive_change` (may break existing functionality), `external_credential` (requires API keys/secrets), `cost_or_real_money` (may incur charges), `safety_boundary` (risk of data loss), `new_route_or_goal_change` (scope creep). Returns: `blockingQuestions` (must be answered), `nonBlockingQuestions` (nice to have), `assumptions` (auto-filled), `riskFlags` (severity per category), `planConfidence` (0.0-1.0), `checkerReviewRequired` (boolean). |
| **Pattern to follow** | codex-harness-plugin `scripts/harness-core.mjs` (`buildPlanIntakeGate()`) |
| **Integration** | After semantic lock passes, Plan Intake Gate runs. If `blockingQuestions.length > 0`, route is blocked until user answers. If `checkerReviewRequired`, acceptance-manager pre-reviews the plan before execution. |
| **Tests** | `plugin/tests/plan-intake-gate.test.ts`: each risk category detection, confidence scoring, blocking vs non-blocking questions, checker review trigger |
| **Manual QA** | `/control "delete all user data"` → verify destructive_change risk detected, `/control "deploy to production"` → verify cost/safety risks detected |

#### Task 5.2: Implement continuation policy engine

| Item | Detail |
|---|---|
| **Files to create** | `plugin/src/mode/continuation-policy.ts` |
| **Files to modify** | `plugin/src/mode/index.ts` (integrate continuation policy), `plugin/src/runtime/server.ts` (apply continuation decisions) |
| **What to implement** | `normalizeContinuationPolicy(userMessage)` — detects keywords: 不要停/持续推进/keep going/continue until/auto. `continuationDecision(state)` — decides next action: route complete → finish; blocked by ambiguity/credential/destructive → ask_user; blocked by delegate requirement → dispatch_real_subagent; other blocks with budget remaining → auto_replan_or_fix; consecutive failures >= limit → ask_user. Policy config: `enabled`, `mode` (standard/until_goal), `goal`, `stopWhen`, `askUserOnlyWhen`, `maxRounds`, `maxConsecutiveFailures`, `checkerMustApprovePlanBeforeExecution`, `checkerRejectionAction` (retry/stop/ask_user). |
| **Pattern to follow** | codex-harness-plugin `scripts/harness-core.mjs` (`normalizeContinuationPolicy()`, `continuationDecision()`) |
| **Tests** | `plugin/tests/continuation-policy.test.ts`: keyword detection, each decision branch, max rounds exceeded, max failures exceeded |
| **Manual QA** | Start route with "keep going until build passes", verify route auto-continues; introduce blocking error, verify route stops and asks user |

---

### Phase 6 — Quality & DX (Review Agent + Output Contract + Doctor + CLI)

**Rationale:** These are the final polish items. Review agent adds an independent quality gate. Output contract improves user experience. Doctor script enables self-service debugging. CLI expansion completes the toolset.

**Output:** Full developer experience parity with codex-harness-plugin.

#### Task 6.1: Implement Review Agent skill

| Item | Detail |
|---|---|
| **Files to create** | `review-agent/SKILL.md` |
| **Files to modify** | `plugin/src/runtime/constants.ts` (add review-agent to CAPABILITY_AGENTS), `plugin/src/dispatch/capability-selector.ts` (include review-agent in selection), `plugin/config/routing-table.json` (add review-agent to relevant routes) |
| **What to implement** | Review agent SKILL.md modeled after codex-harness-plugin `skills/review-agent/SKILL.md`. Responsibilities: independent implementation review before acceptance-manager's final decision. Output format: `Decision: accepted / request_changes / rejected`, milestone coverage verification, finding list, evidence review, role-boundary review. Must NOT: replace acceptance-manager, implement fixes, redefine requirements. |
| **Pattern to follow** | codex-harness-plugin `skills/review-agent/SKILL.md` |
| **Integration** | Added to all routes as optional pre-acceptance step. Execution-manager can optionally request review before handoff to acceptance-manager. |
| **Tests** | `plugin/tests/review-agent.test.ts`: review-agent dispatch, output parsing, decision handling |
| **Manual QA** | Run a route with review-agent, verify review output appears before acceptance |

#### Task 6.2: Implement user-facing output contract enforcement

| Item | Detail |
|---|---|
| **Files to create** | `hooks/output-contract-guard.js` |
| **Files to modify** | `plugin/config/coordination-rules.md` (add output contract rules) |
| **What to implement** | Hook that warns (not blocks) when agent output contains forbidden internal orchestration terms: task IDs, session IDs, state patches, lock operations, agent role names, tool names, internal file paths. Allowed topics: key problem, why this order, tradeoffs, business conclusions, risk, gap to goal, why continue/rework/stop. Pattern matching against output content before it reaches user. |
| **Pattern to follow** | codex-harness-plugin output contract (enforced across README, harness/SKILL.md, control/SKILL.md, runner/README.md) |
| **Tests** | `plugin/tests/output-contract.test.ts`: verify allowed content passes, forbidden terms trigger warnings |
| **Manual QA** | Run a route, verify user sees business-level summary not internal state details |

#### Task 6.3: Implement Doctor script

| Item | Detail |
|---|---|
| **Files to create** | `scripts/doctor.sh` |
| **What to implement** | Shell script performing 50+ health checks grouped by category: (1) Paths: plugin dist exists, config dir exists, skills dir readable. (2) Symlinks: all 16 skills symlinked, all 8 hooks symlinked, all 7 agent files symlinked, no broken links. (3) Config: `openode.json` has plugin entry, harness profile exists, profile has correct plugin path. (4) Cache: plugin cache directory writable. (5) Runtime: Node.js version >= 18, npm dependencies installed, plugin can be required without error. (6) CLI: `hctl` is on PATH, `hctl check` succeeds, `hctl status` runs without crash. (7) Agent models: model config loads without error, required agents are defined. (8) Git: workspace is a git repo, git version >= 2.30. |
| **Pattern to follow** | codex-harness-plugin `scripts/doctor-local-install.mjs` |
| **Manual QA** | Run `./scripts/doctor.sh`, verify all checks pass on clean install, break a symlink and verify doctor catches it |

#### Task 6.4: Expand hctl CLI with runner commands

| Item | Detail |
|---|---|
| **Files to modify** | `scripts/harness` (add subcommands) |
| **What to implement** | New `hctl` subcommands: `start` — initialize route and run until blocked/complete. `watch` — cyclic runner with configurable polling. `wake` — recover crashed session and continue. `step` — run exactly one dispatch step. `inspect` — deep session inspection (current block, retry count, acceptance gaps, suggested next step). `task-create <title>` — create new task with worktree. `task-list` — list all tasks. `task-resume <taskId>` — resume paused task. `task-archive <taskId>` — archive completed task. `timeline` — actor + tool timeline for current session. |
| **Tests** | `plugin/tests/cli.test.ts`: command parsing, each subcommand basic functionality |
| **Manual QA** | Run each new subcommand, verify expected output |

---

## File Inventory — What Gets Created/Modified

### New Files (to create)

```
plugin/src/
├── task-board/
│   ├── index.ts                    # Task board API (Phase 0)
│   ├── storage.ts                  # JSON persistence + file locking (Phase 0)
│   ├── schema.ts                   # Task record type definitions (Phase 0)
│   └── worktree.ts                 # Git worktree management (Phase 0)
├── security/
│   ├── credential-boundary.ts      # Credential registration/resolution/redaction (Phase 1)
│   ├── sandbox.ts                  # Sandbox creation/execution/destruction (Phase 1)
│   └── sandbox-contract.ts         # Sandbox type definitions (Phase 1)
├── session/
│   ├── session-store.ts            # Session CRUD + event log + state patches (Phase 2)
│   └── recovery.ts                 # Crash recovery (wake from events) (Phase 2)
├── testing/
│   └── simulated-agent-adapter.ts  # Deterministic agent for simulated mode (Phase 3)
├── mcp/
│   ├── server.ts                   # MCP JSON-RPC stdio server (Phase 4)
│   ├── tools.ts                    # Tool definitions and handlers (Phase 4)
│   └── transport.ts                # Transport layer (Phase 4)
├── intake/
│   └── plan-intake-gate.ts         # Risk detection + confidence scoring (Phase 5)
└── mode/
    └── continuation-policy.ts      # Auto-continuation decision engine (Phase 5)

plugin/config/
└── credential-registry.json        # Optional credential definitions (Phase 1)

plugin/tests/
├── task-board.test.ts              # Phase 0
├── worktree.test.ts                # Phase 0
├── task-board-integration.test.ts  # Phase 0
├── credential-boundary.test.ts     # Phase 1
├── credential-integration.test.ts  # Phase 1
├── sandbox.test.ts                 # Phase 1
├── session-store.test.ts           # Phase 2
├── session-integration.test.ts     # Phase 2
├── recovery.test.ts                # Phase 2
├── simulated-e2e.test.ts           # Phase 3
├── mcp-transport.test.ts           # Phase 4
├── mcp-integration.test.ts         # Phase 4
├── plan-intake-gate.test.ts        # Phase 5
├── continuation-policy.test.ts     # Phase 5
├── review-agent.test.ts            # Phase 6
├── output-contract.test.ts         # Phase 6
└── cli.test.ts                     # Phase 6

review-agent/
└── SKILL.md                        # Review agent skill definition (Phase 6)

hooks/
└── output-contract-guard.js        # Output contract enforcement (Phase 6)

scripts/
└── doctor.sh                       # Installation health checks (Phase 6)
```

### Modified Files

```
plugin/src/runtime/
├── server.ts           # All phases: integrate task board, credential, sandbox,
│                       #   session, simulated mode, MCP, intake gate, continuation
├── constants.ts        # Phase 0,6: add TASK_BOARD, REVIEW_AGENT, CREDENTIAL_REGISTRY
└── utils.ts            # Phase 0,1,5: add taskId, credential redaction, risk flag types

plugin/src/state/
└── storage.ts          # Phase 2: session-aware state loading

plugin/src/mode/
└── index.ts            # Phase 3,5: simulated mode toggle, continuation integration

plugin/src/dispatch/
└── capability-selector.ts  # Phase 6: include review-agent

plugin/config/
└── routing-table.json  # Phase 1,6: sandbox flag, review-agent in routes

plugin/package.json     # Phase 4: mcp-server binary

scripts/harness         # Phase 0,3,4,6: task-*, start/watch/wake/step/inspect/mcp/timeline

hooks/                  # Phase 6: register output-contract-guard

setup.sh                # Phase 0,4,6: install new hooks, MCP config, doctor
```

---

## Dependency Graph

```
Phase 0 (Task Board + Worktree)
  │
  ├──→ Phase 1 (Credential + Sandbox) ── independent of Phase 0
  │         │
  │         └──→ Phase 2 (SessionStore) ── depends on credential redaction for events
  │                  │
  │                  └──→ Phase 3 (Simulated Mode) ── depends on SessionStore for state
  │                           │
  │                           └──→ Phase 4 (MCP) ── depends on SessionStore + simulated
  │                                    │
  │                                    └──→ Phase 5 (Intake Gate + Continuation) ── independent
  │                                             │
  │                                             └──→ Phase 6 (DX Polish) ── depends on all above
  │
  └──→ Phase 6 (Task CLI) ── depends on Phase 0

Phase 5 can run in parallel with Phase 3 or Phase 4.
Phase 6 is the final integration phase, must run last.
```

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| **Git worktree conflicts** with existing worktrees | Medium | High | Check for existing worktrees before creation; use unique branch names with timestamps |
| **Credential leak** during migration period | Low | Critical | Redact in all event paths before enabling SessionStore; add pre-commit hooks to scan for secrets |
| **Sandbox breaks existing tool execution** | Medium | High | Sandbox is opt-in per route; default off; extensive integration tests before opt-out removal |
| **SessionStore write amplification** (double writes to state.json + events.jsonl) | Medium | Medium | Phase in gradually; monitor file sizes; add pruning to `prune_memory.sh` |
| **MCP protocol incompatibility** with some clients | Low | Medium | Follow MCP spec exactly; interop testing with multiple clients |
| **Backward compatibility break** for existing `.agent-memory/` state | Medium | High | All new features add new files, don't modify existing file formats; migration period with dual writes |
| **Performance regression** from sandbox path resolution | Low | Medium | Cache resolved paths; only sandbox when flag is set |

---

## Test Plan

### Overall Success Criteria

1. All 94 existing tests continue to pass without modification
2. New tests added for each phase covering both happy path and error paths
3. Full E2E route lifecycle testable in simulated mode
4. MCP tools produce identical results to slash-command equivalents

### Per-Phase Testing Strategy

| Phase | Test Files | Target Coverage | Manual QA |
|---|---|---|---|
| Phase 0 | 3 test files | Task board CRUD, worktree lifecycle | Create 3 tasks, list, archive, verify isolation |
| Phase 1 | 3 test files | Credential registration/resolution/redaction, sandbox path isolation | Secret redaction verification, sandbox escape attempts |
| Phase 2 | 3 test files | Session CRUD, event replay, crash recovery | Kill process mid-route, wake, verify continuation |
| Phase 3 | 1 test file | Full route lifecycle in simulated mode | Verify no real agent spawns |
| Phase 4 | 2 test files | MCP tool list, tool call, full route via MCP | Test with external MCP client |
| Phase 5 | 2 test files | Risk detection per category, continuation decisions | Trigger each risk type, test auto-continue |
| Phase 6 | 3 test files | Review agent output, contract enforcement, CLI commands | Doctor full check, CLI all subcommands |

### How to Execute

```bash
# All phases
npm --prefix plugin test

# Phase-specific
npm --prefix plugin test -- --test-name-pattern="task-board"
npm --prefix plugin test -- --test-name-pattern="credential"
npm --prefix plugin test -- --test-name-pattern="session|recovery"
npm --prefix plugin test -- --test-name-pattern="simulated"
npm --prefix plugin test -- --test-name-pattern="mcp"
npm --prefix plugin test -- --test-name-pattern="intake|continuation"
npm --prefix plugin test -- --test-name-pattern="review|output-contract|cli"

# Doctor
./scripts/doctor.sh

# Simulated E2E
OPENCODE_HARNESS_SIMULATED=1 hctl start --route F-M1
```

---

## Estimated Effort

| Phase | Tasks | New Files | Est. Days | Complexity |
|---|---|---|---|---|
| Phase 0 (Task Board) | 3 | 5 | 3-4 | Medium |
| Phase 1 (Security) | 3 | 5 | 4-5 | High |
| Phase 2 (SessionStore) | 3 | 3 | 3-4 | Medium |
| Phase 3 (Simulated) | 2 | 1 | 2-3 | Low |
| Phase 4 (MCP) | 2 | 3 | 3-4 | Medium |
| Phase 5 (Intake) | 2 | 2 | 2-3 | Low |
| Phase 6 (DX Polish) | 4 | 5 | 3-4 | Medium |
| **Total** | **19** | **24** | **20-27** | — |

---

## References

- **codex-harness-plugin source**: `/Users/tianyuan/Documents/my_workspace/codex-harness-plugin`
- **Existing omo DAG plan**: `docs/plans/2026-04-21-concurrent-harness-dag-orchestration.md`
- **Existing omo arch doc**: `docs/full-harness-plugin-architecture.md`
- **Gap analysis**: See conversation context from 2026-05-15 comparison session

---
name: check
description: Use when a phase, milestone, or meaningful chunk of work appears complete and needs an independent pass/fail decision before execution continues. Also use for pre-execution contract review to verify a round contract is clear enough to begin.
---

# Check

## Overview

Provide an independent acceptance step after execution.
This skill does not plan, implement, or expand scope.
It decides whether the current phase may pass, must return for rework, or needs more evidence.

Core principle:
- the builder is not the final judge
- implemented is not the same as accepted
- evidence matters more than self-report
- hard gates matter more than overall impression
- the checker should actively look for breakage, not only confirm success

## Codex Specific Notes

Read all state and evidence files directly from disk, use `exec_command` for real verification
commands, and update `acceptance-report.md` plus `quality-guardrails.md` through file edits.
For web applications, use the available browser tooling for direct UI verification.

## Role Boundaries

You may:
- inspect and approve a phase contract before execution begins
- inspect relevant task state and progress records
- compare promised scope against delivered scope
- run the real behavior yourself when the environment allows it
- identify missing proof, regressions, contradictions, and scope drift
- return a clear acceptance decision
- write the formal acceptance result into `acceptance-report.md`

You must not:
- rewrite the whole-task goal or current phase goal
- implement fixes directly
- silently expand the task
- invent new blocking requirements after work is done unless clearly required by written contract

## Pre-Execution Contract Review

In contract-review mode, judge only whether the phase contract is clear enough to begin execution.

Return one of:
- `approved-for-execution`: phase contract is clear enough to start
- `needs-contract-rewrite`: phase contract is too vague, too broad, or too weak to start safely

Use `needs-contract-rewrite` when:
- scope is unclear
- done conditions are vague
- required evidence is missing
- the draft leaves room for scaffold to be mistaken for the core result

## Required Inputs (CRITICAL)

Before starting verification, read these files:

1. `.agent-memory/round-contract.md` — feature definition, acceptance criteria, verification methods
2. `.agent-memory/execution-status.md` — what was implemented, what files changed, where evidence is
3. `.agent-memory/evidence-ledger.md` — claim-to-proof mapping
4. `evidence/` directory — actual evidence files
5. `.agent-memory/task.md` — whole-task goal
6. `.agent-memory/working-memory.md` — current phase contract
7. `.agent-memory/orchestration-status.md` — routing state
8. `.agent-memory/acceptance-lessons.md` — prior acceptance misses (if exists)
9. `.agent-memory/quality-guardrails.md` — raised bars (if exists)

If any required input is missing:
1. Return decision: `needs-follow-up`
2. Specify exactly what is missing
3. Request drive to complete writeback
4. **DO NOT** proceed with verification

## Direct Verification Duty

**CRITICAL**: Code review alone is NEVER sufficient for acceptance. Unit tests and `curl` commands
alone are NEVER sufficient. You MUST verify real behavior as a human user would experience it.

This is the single most important rule in acceptance: **run the real thing yourself**.

### Required Verification Tools by Work Type

**Web Applications (MANDATORY E2E):**
- **MUST** use `/playwright-cli` or `/agent-browser` skill — this is NOT optional
- **MUST** navigate the actual UI and interact with real elements (click, type, navigate)
- **MUST** capture screenshots to `evidence/screenshots/{round-id}-{step}-{timestamp}.png`
- **MUST** test the happy path end-to-end as a real user would
- **MUST** test at least one error/failure path
- **MUST** test at least one edge case (empty state, first use, etc.)
- **MUST NOT** rely on code reading, unit tests, or `curl` alone for web apps
- If `/playwright-cli` or `/agent-browser` is unavailable: return `needs-follow-up` with reason
  "E2E browser verification not available", do NOT fall back to code review

**CLI Tools / Scripts (MANDATORY execution):**
- **MUST** execute the actual command
- **MUST** capture stdout/stderr to `evidence/command-outputs/{round-id}-{command}-stdout.txt`
- **MUST** verify exit codes
- **MUST** test with both valid and invalid inputs
- **MUST NOT** rely on code reading alone

**APIs / Backend Services (MANDATORY live requests):**
- **MUST** send real HTTP requests (curl/httpie)
- **MUST** capture request/response pairs to `evidence/api-traces/{round-id}-{endpoint}.json`
- **MUST** verify status codes, headers, and response bodies
- **MUST** test error handling with malformed requests

**Generated Files / Artifacts:**
- **MUST** read and parse the actual generated files
- **MUST** verify file structure, content, and format
- **MUST** save copies to `evidence/artifacts/{round-id}-{artifact-name}`

### Verification Completeness Gate

Before issuing any acceptance decision, verify:
- [ ] The `verification_method` from `features.json` or `round-contract.md` was actually used
- [ ] The `verification_steps` from `features.json` were actually executed (if present)
- [ ] Evidence files exist at the paths recorded in `evidence-ledger.md`
- [ ] At least one screenshot exists for web application work
- [ ] At least one command output exists for CLI work

If any of these are missing, return `needs-follow-up` — NOT `accepted`.

## Acceptance Order

Evaluate in this order:

### 1. Round Checklist Fit
Check current round item by item. Which items passed/failed/missing proof?

### 2. Hard Gate Fit
Mark each as `pass` / `fail` / `not-applicable`:
- result quality
- visible quality
- product thickness
- main path
- edge and failure behavior
- implementation quality

### 3. Contract Fit
Did the phase complete its promised scope? Stop at the promised scope?

### 3.5. Baseline Comparison Fit
When task is not greenfield: did result preserve what must stay equivalent?

### 3.6. Capability Gap Fit
When `capability-map.md` and `gap-analysis.md` exist: which gaps were actually closed?

### 4. Non-Goal Fit
Did the work respect what the phase said it would not do?

### 5. Exploratory Fit
- Was the main path directly exercised?
- Was at least one likely failure path checked?
- Was at least one edge or empty state checked?

### 6. Evidence Fit
Is there concrete evidence for the claimed result?

### 7. Whole-Task Fit
Does this phase still support the final goal?

## Hard Gate Rule

- if any required hard gate is `fail` → return `rejected`
- if any required hard gate lacks required proof → return `needs-follow-up`
- only if all required hard gates are `pass` may the result move toward `accepted`

## Scope Drift Checks

Always run these checks:
- Did a current action get promoted into a new phase goal without approval?
- Did a phase goal get promoted into a new whole-task goal?
- Did local execution rewrite protected fields in `task.md`?
- Did a new request bypass `.agent-memory/inbox/` and get merged straight into live plan files?
- Did the result satisfy only a shell while the core requirement stayed unmet?

## Decision States

Return exactly one of:
- `accepted`: phase contract satisfied, next phase may begin
- `rejected`: phase contract not satisfied, rework required
- `needs-follow-up`: evidence or contract incomplete, acceptance cannot be granted yet

Default to `needs-follow-up` rather than over-approving when evidence is incomplete.

## Failure Classification

When result is not `accepted`, classify the primary failure as exactly one of:
- `incomplete-work`: promised work is not done yet
- `missing-proof`: work may be right, but proof is not strong enough
- `wrong-direction`: round is too thin, too ordinary, or pointed the wrong way
- `weak-contract`: round contract itself was too weak to judge properly

## Post-Failure Escalation

After `rejected` or meaningful `needs-follow-up`, produce a bounded `raise-the-bar` packet:
- what was shallow
- what proof was missing
- what new hard requirement must apply next time

Write that packet into `.agent-memory/quality-guardrails.md` using Write/Edit tool.

## Evaluator Calibration Loop

**CRITICAL**: Acceptance quality must not drift over time. Run this calibration loop after every
3 acceptance passes, or immediately when a human reviewer disagrees with the checker's decision.

### Calibration Steps

1. **Read calibration examples** (MANDATORY before every acceptance):
   - Read `references/calibration-examples.md` — the 4-level calibration framework
   - Read `references/acceptance-examples.md` — additional Chinese-calibrated examples
   - Internalize the difference between Level 3 (工整但普通 → 打回) and Level 4 (值得放行)

2. **Review recent acceptance logs**:
   - Read the last 3 entries in `.agent-memory/acceptance-report.md` history
   - Read `.agent-memory/acceptance-lessons.md` (if exists)
   - Read `.agent-memory/quality-guardrails.md` (if exists)

3. **Find divergence from calibration examples**:
   - Compare your recent decisions against `references/calibration-examples.md`
   - Ask: "Would the examples have approved what I approved?"
   - Ask: "Would the examples have rejected what I rejected?"
   - Ask: "Am I consistently too lenient on any specific hard gate?"
   - Ask: "Am I consistently too strict on any specific dimension?"

4. **Apply 4-dimension scoring framework**:
   - Score: 产品深度 (30%), 功能完整性 (30%), 视觉设计 (20%), 代码质量 (20%)
   - Check each against its hard threshold
   - Calculate weighted final score
   - Decision: all thresholds met AND ≥7.0 → eligible; any threshold failed → REJECTED

5. **Detect drift patterns**:
   - **Leniency drift**: approving results that fall into Level 1-2 of calibration examples
     (勉强过线 / 太薄 / 普通) — this is the most common failure mode
   - **Strictness drift**: rejecting results that genuinely meet Level 4 (值得放行)
   - **Gate skipping**: consistently marking a hard gate `not-applicable` when it should be required
   - **Evidence inflation**: accepting self-reported evidence without checker-run verification
   - **Score inflation**: scores trending upward without corresponding quality improvement

6. **Update guardrails**:
   - If leniency drift detected: add specific tightened rule to `quality-guardrails.md`
   - If strictness drift detected: note in `acceptance-lessons.md` to avoid over-rejection
   - If gate skipping detected: add explicit requirement to check that gate
   - If evidence inflation detected: add "checker must run X directly" rule

7. **Record the calibration check** in `acceptance-lessons.md`:
   ```
   ## Calibration Check {date}
   
   Passes reviewed: {ids}
   Drift detected: {leniency | strictness | gate-skipping | evidence-inflation | none}
   Action taken: {what rule was added/updated, or "none needed"}
   ```

### Calibration Triggers

Run calibration immediately when:
- The user says "this shouldn't have passed" or "this was approved too easily"
- The same failure class appears in 2+ consecutive rejections (pattern not caught earlier)
- A round passes acceptance but immediately breaks in the next round (regression = missed check)
- Scoring rubric scores are consistently >8.5 across many rounds (likely inflation)

### Calibration Anti-Patterns

- Do NOT turn calibration into a long retrospective — keep it under 5 minutes
- Do NOT change scoring rubric weights — those are fixed references
- Do NOT add guardrails that duplicate existing hard gates — only add genuinely new rules
- Do NOT calibrate on a single data point — wait for 3+ passes or a clear human signal

## Execution Routing

After making the acceptance decision, also choose:
- `continue-current-round`: current round is still coherent enough to continue
- `restart-current-phase-round`: current round has lost coherence, restart same phase with fresh round
- `project-complete`: whole-task done criteria are satisfied

Use `project-complete` only when ALL of these are true:
- current phase is accepted
- no required later phase remains
- whole-task done criteria are satisfied
- release-critical journeys from `product-spec.md` were directly checked
- all required hard gates passed in final acceptance round

## Final Release Gate

For whole-product closure, verify all of these against `product-spec.md`:
- the release-critical user journeys
- at least one first-use or empty-state experience
- at least one meaningful failure path for each release-critical surface
- the real start-to-finish entry path a user would take

## Output Format

Use this structure for every acceptance pass:

```text
Acceptance target:
- what phase, node, or deliverable is being checked

Round checklist result:
- item id | pass | fail | missing proof | blocking yes/no

Hard gate table:
- result quality: pass | fail | not-applicable
  proof:
  reason:
- visible quality: pass | fail | not-applicable
- product thickness: pass | fail | not-applicable
- main path: pass | fail | not-applicable
- edge and failure behavior: pass | fail | not-applicable
- implementation quality: pass | fail | not-applicable

Contract checked:
- what this phase said it would do
- what this phase said it would not do

Passed checks:
- short list of confirmed passes

Failed checks:
- short list of contract failures or scope drift

Missing evidence:
- proof still required

Decision:
- accepted | rejected | needs-follow-up

Execution routing:
- continue-current-round | restart-current-phase-round | project-complete

Required next action:
- smallest bounded action needed before next acceptance pass

Direct verification:
- what was directly checked by acceptance
- what had to fall back to indirect proof

Exploratory checks:
- which failure path, empty state, edge condition checked

Release worthiness:
- why this result is worth releasing for the round
- or why it is still too thin, too ordinary, or too weak
```

## References

Before running any acceptance pass, read the relevant reference files:

- `references/calibration-examples.md` — few-shot calibration examples (4 levels: 勉强过线/功能够薄/工整普通/值得放行)
- `references/scoring-framework.md` — universal 4-dimension scoring (产品深度/功能完整性/视觉设计/代码质量)
- `references/acceptance-templates.md` — per-work-type acceptance checklist (feature, refactor, UI, docs, automation)
- `references/acceptance-examples.md` — additional calibration examples in Chinese
- `references/scoring-rubrics/frontend-design.md` — UI work: 4 dimensions (Design Quality 35%, Originality 35%, Craft 15%, Functionality 15%)
- `references/scoring-rubrics/backend-logic.md` — Backend work: 4 dimensions (Correctness 40%, Performance 25%, Robustness 20%, Maintainability 15%)
- `references/scoring-rubrics/documentation.md` — Docs work: 4 dimensions (Clarity 35%, Completeness 30%, Accuracy 25%, Usability 10%)
- `references/scoring-rubrics/refactoring.md` — Refactor work: 4 dimensions (Behavior Preservation 45%, Code Quality 30%, Test Coverage 15%, Risk Management 10%)

### Template Selection Rule

Pick one primary template from `acceptance-templates.md` based on the work under review:
- `feature-or-bugfix` — behavior changes, logic fixes, user-visible functionality
- `refactor-or-internal-change` — structural work preserving behavior
- `ui-or-experience-change` — layout, interaction, visual, usability
- `docs-or-content-change` — guides, specs, instructions, written output
- `automation-or-operations-change` — scripts, workflows, configuration, build

### Scoring Rubric Usage

Use scoring rubrics when:
- The work type clearly matches one of the rubrics
- The round contract specifies a quality bar (e.g., "must score 8.0+ on frontend rubric")
- You need to justify a rejection with objective criteria

Score each dimension, calculate weighted final score, compare against threshold (7.5+ to ship).

### Universal Scoring Framework (MANDATORY)

For EVERY acceptance pass, apply the 4-dimension scoring framework from `references/scoring-framework.md`:

| Dimension | Weight | Hard Threshold |
|-----------|--------|----------------|
| 产品深度 | 30% | ≥7/10 |
| 功能完整性 | 30% | ≥8/10 |
| 视觉设计 | 20% | ≥6/10 |
| 代码质量 | 20% | ≥7/10 |

**Any dimension below its threshold → REJECTED regardless of final score.**
**Final score must be ≥7.0 to pass.**

Include the 4-dimension scores in every acceptance report.

### Evaluator Calibration

Read `references/acceptance-examples.md` before every acceptance pass to calibrate judgment.
The examples show 4 levels:
1. 勉强过线（打回）— technically works but barely
2. 功能够但产品太薄（打回）— functional but too thin
3. 工整但普通（打回）— tidy but ordinary
4. 真正值得放行（放行）— genuinely worth releasing

If your judgment consistently diverges from these examples, update `quality-guardrails.md`.

## Quality Bar Beyond "Not Broken"

A result that "works" can still fail if:
- it is too thin to justify release
- it is only ordinary and does not meet the written finish level
- it avoids bugs but does not deliver enough substance for the round

Do not confuse absence of defects with acceptance.

## Pairing With Other Skills

With `/drive`:
- review phase contract before execution begins (contract-review mode)
- run this skill when execution believes a phase is complete
- send rejected work back for rework before moving on

With `/memory`:
- read phase contract from `working-memory.md`
- write formal acceptance result into `acceptance-report.md`
- write acceptance summary into `execution-status.md`
- write tightened rules into `acceptance-lessons.md` and `quality-guardrails.md`

## OMO 验证集成

### 自动化证据收集
- Web 验收: 自动调用 playwright MCP 截图
- API 验收: 自动执行 curl 并捕获响应
- 代码验收: 自动运行 lint/test 并收集输出

### OMO 质量门禁
- 如果 `quality-guardrails.md` 存在，自动应用更严格标准
- 验收失败时，自动更新 `quality-guardrails.md` 并触发重新执行
- 使用 `task(category="quick", load_skills=["check"])` 确保快速验证

### 状态索引更新
验收完成后同步更新 `state-index.json`：
```jsonl
{"ts": "2026-04-03T10:45:00Z", "event": "acceptance_completed", "decision": "accepted", "round": 3}
```

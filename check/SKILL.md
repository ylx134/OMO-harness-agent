---
name: check
description: Use when a managed round, milestone, or contract needs an independent acceptance-manager pass. This skill coordinates probe agents, evaluates proof against the contract, and returns an explicit acceptance decision with quality gates and follow-up direction.
---

# Check

## Identity

`check` is the acceptance-manager skill.

It judges whether a round may pass, must be reworked, or still lacks enough proof.
It is not an implementation skill, and it should not collapse into a universal verifier that personally does every check without probe support.

## What Acceptance-Manager Owns

Primary responsibilities:
- pre-execution contract review
- probe selection and coordination
- quality gating
- final acceptance decision
- raised-bar feedback after failures

Primary outputs:
- `.agent-memory/acceptance-report.md`
- `.agent-memory/quality-guardrails.md` when needed
- `.agent-memory/acceptance-lessons.md` when calibration or drift notes matter

## Judge vs Probe Split

Acceptance-manager decides:
- whether the round contract was clear enough to execute
- which verification surfaces need probes
- whether the collected proof satisfies the contract
- whether the result is accepted, rejected, or needs follow-up

Probe agents gather:
- UI observations and screenshots
- API traces and live request/response evidence
- regression spot-check findings
- artifact structure/content findings

Probes return observations, not final pass/fail.
You are the judge.

## Contract Review Mode

Before execution starts, review `round-contract.md`.
Approve only if it specifies:
- clear scope
- clear done conditions
- clear evidence expectations
- likely failure/edge coverage
- enough specificity for probes to verify later

Return one of:
- `approved-for-execution`
- `needs-contract-rewrite`

## Verification Inputs

Before formal acceptance, read:
- `.agent-memory/task.md`
- `.agent-memory/round-contract.md`
- `.agent-memory/execution-status.md`
- `.agent-memory/evidence-ledger.md`
- `.agent-memory/orchestration-status.md`
- `.agent-memory/quality-guardrails.md` if present
- required probe outputs and underlying evidence files

If the required proof set is incomplete, default to `needs-follow-up`.

## Probe Policy

At least one probe must participate in every Harness-mode acceptance pass.
Read-only or judgment-heavy work may still use a minimal probe such as `artifact-probe-agent`, but acceptance may not be completed as a pure manager monologue.

Use probes whenever the route or round implies them.
Typical mapping:
- UI or browser-visible changes -> `ui-probe-agent`
- service/API behavior -> `api-probe-agent`
- risk of nearby breakage -> `regression-probe-agent`
- generated files/build outputs/config/artifacts -> `artifact-probe-agent`

If a required probe path is unavailable:
- say so explicitly
- record what proof is missing
- block acceptance instead of lowering the bar

## Acceptance Order

1. contract fit
2. hard gates
3. probe completeness
4. evidence integrity
5. regression / failure-path fit
6. whole-task fit
7. route continuation decision

## Decision States

Return exactly one:
- `accepted`
- `rejected`
- `needs-follow-up`

Default to `needs-follow-up` when missing proof is the main issue.
Default to `rejected` when proof shows the promised result is not actually there.

## Failure Classes

When not accepted, classify the main problem as one of:
- `incomplete-work`
- `missing-proof`
- `wrong-direction`
- `weak-contract`

## 4-Dimension Scoring

For routes with scoring config:
- read the route definition from `control/config/routing-table.json`
- apply route-specific weights and thresholds
- any threshold miss means the round does not pass

Scores support the decision; they do not replace evidence.

## Raised-Bar Discipline

After `rejected` or meaningful `needs-follow-up`, write a bounded raised-bar packet when appropriate:
- what was shallow
- what proof was missing
- what new hard requirement must apply next time

That packet belongs in `quality-guardrails.md`.

## Calibration Discipline

Acceptance should stay sharp but not arbitrary.
Use calibration examples and recent lessons to detect:
- leniency drift
- strictness drift
- skipped gates
- evidence inflation

Update `acceptance-lessons.md` or guardrails when drift is real.

## Anti-Patterns

Avoid:
- approving based mainly on execution self-report
- skipping probes on routes that clearly require them
- turning acceptance into implementation-by-another-name
- inventing new scope after the work is done unless the written contract truly required it
- replacing proof with confident narrative

## Completion Rule

Acceptance is complete only when:
- the decision is explicit
- the evidence basis is explicit
- probe usage or probe gaps are explicit
- next action is explicit
- the report is strong enough for `control` to supervise by summary

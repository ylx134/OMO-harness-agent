# Acceptance Report

Round Id: R{n}
Phase: G{n}
Contract Reviewed: round-contract.md

## Product Spec Coverage

{Which product-spec promises, journeys, or states were covered}

## Round Checklist Result

| ID | Status | Proof Used | Blocking |
|----|--------|------------|---------|
| C1 | pass/fail/missing-proof | {proof file or "none"} | yes/no |
| C2 | pass/fail/missing-proof | {proof file or "none"} | yes/no |

## Hard Gate Table

| Gate | Result | Proof | Reason |
|------|--------|-------|--------|
| result quality | pass/fail/n-a | {proof} | {reason} |
| visible quality | pass/fail/n-a | {proof} | {reason} |
| product thickness | pass/fail/n-a | {proof} | {reason} |
| main path | pass/fail/n-a | {proof} | {reason} |
| edge and failure behavior | pass/fail/n-a | {proof} | {reason} |
| implementation quality | pass/fail/n-a | {proof} | {reason} |

## Contract Checked

This phase said it would do: {summary}
This phase said it would not do: {summary}
What counted as done: {summary}

## Passed Checks

- {check 1}
- {check 2}

## Failed Checks

- {check 1 — why it failed}

## Missing Evidence

- {what proof is still required}

## Primary Failure Class

{incomplete-work | missing-proof | wrong-direction | weak-contract | none}

## Decision

{accepted | rejected | needs-follow-up}

## Execution Routing

{continue-current-round | restart-current-phase-round | project-complete}

## Required Next Action

{Smallest bounded action needed before next acceptance pass}

## Direct Verification

Directly checked by acceptance:
- {what was actually run/tested by checker}

Had to fall back to indirect proof:
- {what could not be directly verified and why}

## Exploratory Checks

Failure path checked: {yes/no — description}
Empty/first-use state checked: {yes/no — description}
Edge condition checked: {yes/no — description}
Nearby behavior checked: {yes/no — description}

## Release Worthiness

{Why this result is worth releasing for the round, or why it is still too thin/ordinary/weak}

## Whole-Product Coverage

{Which release-critical journeys or important states were checked}

## Acceptance Lesson To Record

{Only if this pass exposed a previous acceptance miss — what to add to acceptance-lessons.md}

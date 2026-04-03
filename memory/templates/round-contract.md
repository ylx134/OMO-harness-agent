# Round Contract

Round Id: R{n}
Phase: G{n}

## Product Spec Sections This Round Serves

{Which sections of product-spec.md this round is serving}

## User Journeys And States This Round Must Move Forward

{Which journeys and states from product-spec.md}

## Round Goal

{What this round is trying to complete}

## Round Value Now

{Why this round is worth doing now instead of later}

## Round Observable Change

{What visible/measurable change should make this round feel real}

## Round Target Level

{What level of finish this round is aiming for — not just "working"}

## Round Product Promise

{What product promise this round is committed to}

## Round Quality Bar Above Minimum

{Why minimum-only would still be too weak}

## Round Not-Do List

{What this round must not absorb}

## Round Avoided Ordinary Option

{What thin/ordinary version this round must avoid}

## Round Entry Conditions

{What must already be true before this round begins}

## Round Checklist

| ID | What | Pass Condition | Proof Required | Blocks Next Round |
|----|------|----------------|----------------|-------------------|
| C1 | {item} | {condition} | {proof} | yes/no |
| C2 | {item} | {condition} | {proof} | yes/no |

## Round Pass Condition

{What must be true for round to pass}

## Round Rejection Condition

{What would cause round to be rejected}

## Files In Scope

{List of files, pages, or outputs in scope}

## Verification Method (MANDATORY)

Verification type: {e2e_browser | cli_execution | api_test | artifact_check}
Verification tool: {playwright-cli | agent-browser | bash | read}
Evidence required:
  - {evidence/screenshots/{round-id}-happy-path.png}
  - {evidence/screenshots/{round-id}-error-path.png}
  - {evidence/command-outputs/{round-id}-smoke-test.txt}

**Rule**: For web applications, `verification_type` MUST be `e2e_browser`.
Unit tests and curl alone are never sufficient for web app acceptance.

## Runnable Entry Package

Startup step: {how to start the thing under test — or "run init.sh"}
Health check: {quick check the system is running}
Main path: {exact steps for happy path}
Error path: {exact steps for at least one failure path}
Nearby behavior: {adjacent behavior to recheck for regressions}

## Iteration Config

```yaml
iteration:
  enabled: false
  target_score: 7.5
  max_iterations: 5
```

---
name: drive
description: Use when a managed round should be executed with minimal back-and-forth, using execution-manager discipline: sequence work, dispatch capability agents, gather evidence, keep summaries current, and push the task forward until the round is ready for acceptance or a real blocker remains.
---

# Drive

## Identity

`drive` is the execution-manager skill.

It advances the current round toward the task contract by coordinating lower-level capability agents and producing manager-level execution summaries.
It is not a universal do-everything worker.

## What Execution-Manager Owns

Primary responsibilities:
- read the planning contract and active route
- draft and refine `round-contract.md`
- choose and sequence capability-agent work
- ensure init/build/test/run flows happen when needed
- ensure evidence is collected and indexed
- publish execution summaries for acceptance-manager and orchestrator

Primary outputs:
- `.agent-memory/round-contract.md`
- `.agent-memory/execution-status.md`
- `.agent-memory/evidence-ledger.md`
- execution-related updates to `.agent-memory/orchestration-status.md`

## Default Capability-Agent Policy

Prefer narrow hands over one giant execution blob.

**Hard rule in Harness mode:** every execution round must dispatch at least one capability agent.
Execution-manager may coordinate and summarize, but it must not complete the body of the round alone.

Typical delegation:
- `browser-agent` -> UI exploration, navigation, interaction, screenshots, visible-state capture
- `code-agent` -> code edits, refactors, local implementation changes
- `shell-agent` -> init, build, test, port/process checks, startup/health commands
- `docs-agent` -> reference retrieval, baseline lookup, implementation-location discovery
- `evidence-agent` -> evidence normalization, artifact bookkeeping, claim-to-proof mapping

If a required capability agent is unavailable, record a blocking gap and stop that route.
Do not hide missing capability coverage.

## Startup Sequence

Before new implementation work:
1. confirm working directory and repository context
2. read `.agent-memory/task.md`
3. read `.agent-memory/working-memory.md` and `.agent-memory/orchestration-status.md`
4. read existing `round-contract.md` if this is a continuing round
5. read `quality-guardrails.md` if present
6. verify the route still matches the task
7. verify the required capability expectations are known

If the route is unclear, stop and bounce back to `plan` or `control`.

## Contract-First Rule

Before substantial execution:
- draft or refine `round-contract.md`
- state which capability agents will be used
- state what evidence each part should produce
- submit the contract for acceptance-manager review
- do not treat contract drafting as implementation progress

## Execution Rhythm

Repeat until the round is ready for acceptance or a real blocker remains:
1. re-anchor on the round goal
2. choose the next highest-value bounded action
3. dispatch the appropriate capability agent(s)
4. verify the result with the smallest reliable check
5. collect and normalize evidence
6. update manager summaries

## What Good Execution Summaries Look Like

`execution-status.md` should summarize:
- round goal and current state
- delegated capability agents and what they returned
- changed files or changed surfaces
- command/build/test status
- known blockers or missing proof
- whether the round is ready for acceptance

It should not become a raw terminal log dump.

## Evidence Rule

Execution-manager is accountable for proof packaging even when lower-level agents produce the raw artifacts.
That means:
- every meaningful claim should map to evidence
- evidence paths should be stable and explicit
- missing proof should be called out before handoff to acceptance-manager

## features.json Rule

If `features.json` exists:
- structure is immutable
- execution-manager may update only `passes`
- any other structural change requires replanning through the proper route

## Escalation Triggers

Escalate back to `control` or `plan` when:
- the route is wrong
- the round contract is too weak to continue
- the work requires a new global phase
- a non-degradable requirement cannot be satisfied in the current route
- repeated execution attempts do not reduce the real gap to done

## Anti-Patterns

Avoid:
- treating visible output alone as progress
- doing every browser/code/shell/evidence action inline by default
- claiming verification is complete without handing off to acceptance-manager
- burying blockers inside long logs instead of summary files
- letting the round sprawl beyond the approved contract

## Completion Rule

A drive round is complete only when:
- the contract items have been executed or honestly blocked
- evidence is collected and indexed
- `execution-status.md` is up to date
- the round is clearly marked ready or not ready for acceptance
- acceptance-manager has what it needs to judge without guesswork

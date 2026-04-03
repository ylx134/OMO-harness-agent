# Acceptance Templates

Use these templates to make acceptance checks more consistent.
Pick one primary template for the current phase.
Only combine templates when the phase contract genuinely spans two output types.

Each template has:

- when to use it
- required hard gates
- release-worthiness checks
- must-pass checks
- strong evidence examples
- default bad-path checks
- nearby-impact checks
- common rejection signals
- required next-action style

## Universal Hard Gates

Every acceptance pass should fill a hard gate table before giving a final overall decision.

Default hard gates:

- result quality: did the promised thing actually happen
- visible quality: is the user-facing or reader-facing result acceptable for this round
- product thickness: does the result feel complete enough to be worth releasing, not merely not broken
- main path: can the main route be completed end to end
- edge and failure behavior: do obvious bad inputs, empty states, or retries stay coherent
- implementation quality: did the changed code or changed material avoid obvious temporary hacks, hidden regressions, or unapproved scope growth

Rules:

- every template must state which gates are required
- if a required gate fails, the result should be `rejected`
- if a required gate has missing proof, the result should be `needs-follow-up`
- only non-required gates may be marked `not-applicable`
- "not broken" is not enough when the contract calls for a fuller round; the round must be worth releasing for the promised scope

## Release Worthiness Checks

Every acceptance pass should answer one extra question:

- is this result merely acceptable, or is it actually worth releasing for the promised round?

Use `rejected` when the work is technically intact but still too thin, too ordinary, or too empty to justify release for the written contract.
Use `needs-follow-up` when the result may be release-worthy, but the evidence is not strong enough to tell yet.

## Checker-Run Evidence Rule

Execution evidence is useful, but it is not enough by itself for high-confidence acceptance.

Unless direct checking is impossible, acceptance should include at least one checker-run proof such as:

- the checker walks the main path directly
- the checker runs the command directly
- the checker triggers the changed workflow directly
- the checker compares the actual result to the written contract

Do not approve a meaningful round from executing-agent materials alone when the checker could still inspect the real result.

## Universal Active Probe Minimum

For every acceptance pass, try to cover all of these when they are relevant:

- one direct run of the main path
- one likely bad path
- one empty or first-use state
- one edge condition
- one nearby behavior that could have been damaged by the change

If two or more of these were relevant and none were checked, do not approve.

## 1. Feature Or Bugfix

### When To Use

Use this when the phase changes behavior, fixes incorrect behavior, or introduces a user-visible capability.

### Must-Pass Checks

- the promised behavior now exists or the broken behavior is now corrected
- the change matches the written phase contract
- the user-visible or system-visible result matches the intended outcome
- the result is worth releasing for the promised scope, not just technically unbroken
- obvious regressions are not introduced in nearby behavior
- the evidence directly proves the claimed behavior change

### Required Hard Gates

- result quality: required
- visible quality: required when the user can see or interact with the result
- product thickness: required
- main path: required
- edge and failure behavior: required
- implementation quality: required

### Minimum Evidence Required

At least both of these must exist:

- one direct behavior check for the changed behavior
- one concrete result record such as test output, command output, screenshot, log, or reproduction note

Do not approve based only on code inspection.
Do not approve from executing-agent proof alone when the checker can still run the changed behavior directly.

### Strong Evidence

- focused tests for the changed behavior
- before-and-after result comparison
- command output or logs showing the corrected result
- screenshots, recordings, or manual reproduction notes when the output is visual
- file references tied to the exact behavior under review

### Default Bad-Path Checks

- invalid input
- duplicate action
- missing target or missing data
- retry after failure
- stale or old data flowing through the new logic

### Nearby-Impact Checks

- the closest adjacent action still works
- success, failure, and retry feedback stay coherent
- another entry point for the same behavior was not quietly broken

### Reject Or Needs-Follow-Up Signals

- the fix is described but not demonstrated
- only code shape changed while the claimed behavior was never verified
- the wrong problem was solved
- nearby behavior now breaks or becomes inconsistent
- the phase quietly added unrelated features
- only the happy path was shown
- the result works but is too thin, too small, or too ordinary to justify release
- the checker did not run any direct verification even though that was possible

### Required Next Action Style

- verify one missing behavior
- fix one incorrect behavior outcome
- remove one unrelated behavior addition
- supply one concrete proof of the claimed fix

## 2. Refactor Or Internal Change

### When To Use

Use this when the phase claims cleaner structure, simpler maintenance, better separation, or internal cleanup without intended behavior change.

### Must-Pass Checks

- the stated structural improvement is visible in the changed work
- the original behavior still holds where the contract says it should
- the change did not smuggle in unapproved feature work
- the updated structure is consistent with the stated direction
- the result is worth keeping as a finished round, not merely cleaner while still thin
- the evidence shows both internal improvement and behavior stability

### Required Hard Gates

- result quality: required
- visible quality: required only if the refactor changed user-facing output
- product thickness: required
- main path: required
- edge and failure behavior: required for the behavior that was supposed to stay stable
- implementation quality: required

### Minimum Evidence Required

At least both of these must exist:

- one proof that the claimed structural improvement is real
- one proof that the relevant prior behavior still works

Do not approve a refactor that has only style or readability claims.
Do not approve a refactor if the checker did not verify that the old main path still works.

### Strong Evidence

- targeted regression checks
- before-and-after structure summary
- file references showing the simplified or reorganized structure
- command output confirming unchanged behavior where relevant
- notes showing removed duplication or clarified boundaries

### Default Bad-Path Checks

- old inputs still work
- old configuration still works
- one likely error branch still behaves coherently
- one likely edge condition still behaves the same

### Nearby-Impact Checks

- the closest reused path still works
- old defaults still hold
- error handling was not dropped

### Reject Or Needs-Follow-Up Signals

- large structural change with no proof that behavior still works
- claimed cleanup but the resulting structure is more tangled
- refactor used as cover for silent feature changes
- the change increases complexity without clear gain
- the acceptance case rests only on "the code looks cleaner"
- main behavior still works only in the ideal case
- the result is organized but still too small, too ordinary, or not release-worthy
- the checker never tested old behavior directly

### Required Next Action Style

- add one regression proof
- explain one claimed structural gain with evidence
- remove one unapproved behavior change
- tighten one boundary that the refactor blurred

## 3. UI Or Experience Change

### When To Use

Use this when the phase changes layout, interaction, copy on screen, navigation, states, visual hierarchy, responsiveness, or usability.

### Must-Pass Checks

- the screen or interaction matches the promised phase outcome
- the important user path works from start to finish
- the change is usable at the intended sizes or contexts named in the contract
- obvious broken states, confusing states, or missing feedback are not introduced
- the experience feels complete enough to release, not merely tidy or technically intact
- the evidence shows the actual interface result, not only code changes

### Required Hard Gates

- result quality: required when the round promised a user-visible behavior outcome
- visible quality: required
- product thickness: required
- main path: required
- edge and failure behavior: required
- implementation quality: required

### Minimum Evidence Required

At least all of these must exist:

- one proof of the main changed screen or state
- one proof of the main user path or interaction
- one proof for any required alternate state named in the contract, such as error, empty, or responsive behavior

Do not approve from screenshots alone when the contract promises interaction.
Do not approve from a happy-path click-through alone when error, empty, or size-change states were part of the risk.

### Strong Evidence

- screenshots of the changed states
- manual walk-through notes for the main user path
- responsive checks when size changes matter
- interaction proof such as click-through results, recordings, or browser checks
- accessibility or readability checks when they are part of the phase contract

### Default Bad-Path Checks

- empty state
- loading or waiting state
- failure state
- repeated click or repeat submit
- long text or missing asset
- smaller and larger display widths when size matters
- a screen that is neat but ordinary and fails to feel like a finished result

### Nearby-Impact Checks

- the step before the changed screen still leads into it correctly
- the step after the changed screen still works
- closing, backing out, or retrying still behaves coherently

### Reject Or Needs-Follow-Up Signals

- the screen looks different but the promised interaction is untested
- only the happy path is shown while error or empty states are ignored
- the layout works on one size but breaks on the intended others
- the result adds visual polish while missing the actual promised user outcome
- the screen is orderly but still looks too plain, too safe, or too ordinary to release
- the change introduces unrelated redesign work
- the checker never directly tried a failure state or edge state
- the main path works once but breaks on repeat or return

### Required Next Action Style

- verify one missing state
- show one missing interaction result
- correct one layout or usability regression
- remove one unapproved visual expansion

## 4. Docs Or Content Change

### When To Use

Use this when the phase produces or updates instructions, guides, proposals, explanations, release notes, or other written material.

### Must-Pass Checks

- the document covers the promised scope
- the content is consistent with the current task reality
- the intended reader can follow it without missing key steps or context
- the document does not quietly expand into new decisions outside the phase contract
- the writing includes the evidence or references needed for trust
- the document is useful enough to release as a finished round, not just technically correct

### Required Hard Gates

- result quality: required
- visible quality: required as readability and presentation quality
- product thickness: required
- main path: required as reader path from start to finish
- edge and failure behavior: required when the document must explain failure or exception handling
- implementation quality: required

### Minimum Evidence Required

At least both of these must exist:

- one contract-to-document coverage check
- one reader-path check showing the intended reader can follow the output

Do not approve polished wording that still leaves the reader unable to act.
Do not approve a document if the checker did not try to follow the reader path directly.

### Strong Evidence

- direct review against the phase contract
- comparison against the source material the document is supposed to reflect
- clear file references for linked examples, commands, or outputs
- reader-path review: can someone follow the document from start to finish

### Default Bad-Path Checks

- one ambiguous step is followed literally
- one missing prerequisite is simulated
- one error or exception path is checked if the contract expects it

### Nearby-Impact Checks

- linked commands, paths, or examples still match current reality
- related documents do not now contradict this one

### Reject Or Needs-Follow-Up Signals

- the document sounds polished but misses required content
- the document contradicts current behavior or current files
- key instructions are implied rather than stated
- the document introduces new decisions that planning never approved
- the content is incomplete for the intended reader
- the happy path reads well but a real reader still cannot act
- the writing is correct but too flat, too thin, or too ordinary to ship with confidence

### Required Next Action Style

- add one missing section or instruction
- correct one contradiction with source reality
- remove one unapproved decision or scope expansion
- clarify one ambiguous step for the intended reader

## 5. Automation Or Operations Change

### When To Use

Use this when the phase changes scripts, task runners, build steps, configuration, deployment behavior, automation, scheduled jobs, or run-time setup.

### Must-Pass Checks

- the automation or operational behavior matches the contract
- the changed process can be run or reasoned about with concrete evidence
- the change does not quietly alter unrelated operational behavior
- failure conditions, inputs, and outputs are clear enough to trust
- the evidence shows the system running or being validated in the intended way
- the operational change is useful enough to keep, not merely functional in a bare-minimum sense

### Required Hard Gates

- result quality: required
- visible quality: usually not required unless people directly consume the output
- product thickness: required
- main path: required
- edge and failure behavior: required
- implementation quality: required

### Minimum Evidence Required

At least both of these must exist:

- one real run, safe dry-run, or equivalent validation of the changed flow
- one concrete output record such as command output, log, trace, or resulting state

When the contract mentions failure handling or guardrails, include one proof for that too.
Do not approve an operational change if the checker never ran a real or safe validation itself when that validation was possible.

### Strong Evidence

- command output from the changed automation
- dry-run or real-run proof when safe
- configuration diff tied to the intended result
- logs that show the new flow behaving as claimed
- explicit proof for failure handling or guardrails when relevant

### Default Bad-Path Checks

- missing input
- bad input
- repeat run
- partial failure
- timeout or unavailable dependency

### Nearby-Impact Checks

- the old entry point still works when it should
- failure does not leave a dirty half-state
- rerun behavior is safe and understandable

### Reject Or Needs-Follow-Up Signals

- the script changed but was never run or validated
- the configuration was edited without proof of resulting behavior
- the automation works only in the ideal case with no guardrails
- unrelated operational behavior changed without approval
- the acceptance case depends on assumption rather than execution evidence
- the checker never validated the changed flow directly
- failure behavior was promised but never exercised
- the flow works but is too thin, too fragile, or too ordinary to release with confidence

### Required Next Action Style

- run one missing validation
- show one missing output or failure path
- narrow one unintended operational side effect
- document one required input or guardrail that is still unclear

## Cross-Template Stop Checks

No matter which template is chosen, pause acceptance if any of these are true:

- the phase contract is missing or too vague to judge
- the evidence does not match the claimed result
- local work changed the whole-task goal or protected global fields
- the phase quietly absorbed work from a later phase
- the next required action is too broad to be useful

When this happens, prefer `needs-follow-up` over a weak approval.

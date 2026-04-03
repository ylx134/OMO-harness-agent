# Model Upgrade Checklist

When a new Claude model is released (e.g., Opus 4.6 → Opus 5.0), use this checklist to
determine which harness components can be simplified or removed.

## Pre-Upgrade Baseline

Before upgrading the model, establish baseline metrics:

- [ ] Run harness-eval-framework.md with current model
- [ ] Record average scores per task type
- [ ] Record first-pass acceptance rate
- [ ] Record context reset frequency
- [ ] Record calibration drift frequency
- [ ] Record user escalation frequency
- [ ] Save metrics to `.evals/{model-name}-baseline.json`

## Post-Upgrade Testing

After upgrading to the new model:

- [ ] Run harness-eval-framework.md with new model
- [ ] Compare scores to baseline
- [ ] Note any quality improvements
- [ ] Note any new failure modes

## Component Simplification Review

For each harness component, ask: **Does the new model still need this?**

### 1. Sprint Contract Negotiation

**What it prevents**: Executor builds the wrong thing, acceptance criteria mismatch

**Test**: Run 5 tasks without contract negotiation (executor goes straight to coding)
- [ ] Did executor build the wrong thing? (Yes/No)
- [ ] Did checker reject for misalignment? (Yes/No)
- [ ] Decision: Keep / Simplify / Remove

**If "No" to both**: Consider removing contract negotiation phase

### 2. Calibration Examples

**What it prevents**: Checker becomes too lenient over time

**Test**: Run 20 acceptances without reading calibration-examples.md
- [ ] Did scores drift upward? (Yes/No)
- [ ] Did quality degrade in later rounds? (Yes/No)
- [ ] Decision: Keep / Simplify / Remove

**If "No" to both**: Consider removing calibration loop

### 3. 4-Dimension Scoring Framework

**What it prevents**: Inconsistent acceptance quality, missing dimensions

**Test**: Run 10 acceptances with simple "pass/fail" instead of 4-dimension scoring
- [ ] Did acceptance quality vary widely? (Yes/No)
- [ ] Did checker miss obvious issues? (Yes/No)
- [ ] Decision: Keep / Simplify / Remove

**If "No" to both**: Consider simplifying to 2-dimension scoring or binary pass/fail

### 4. Context Reset Mechanism

**What it prevents**: Context anxiety, premature completion, degraded quality in long sessions

**Test**: Run 2-hour session without context resets
- [ ] Did agent show context anxiety signals? (Yes/No)
- [ ] Did quality degrade after 1 hour? (Yes/No)
- [ ] Decision: Keep / Simplify / Remove

**If "No" to both**: Consider removing context reset or increasing threshold

### 5. Dynamic Quality Gate

**What it prevents**: Repeated mistakes, shallow work

**Test**: Run 20 rounds without quality-guardrails.md
- [ ] Did same failure class repeat 3+ times? (Yes/No)
- [ ] Did executor produce shallow work repeatedly? (Yes/No)
- [ ] Decision: Keep / Simplify / Remove

**If "No" to both**: Consider removing dynamic quality gate

### 6. File Ownership / Coordination Rules

**What it prevents**: State file corruption, race conditions

**Test**: Run 10 rounds with all agents writing to any file
- [ ] Did state files get corrupted? (Yes/No)
- [ ] Did agents overwrite each other's work? (Yes/No)
- [ ] Decision: Keep / Simplify / Remove

**If "No" to both**: Consider relaxing file ownership rules

### 7. Separate Planner Agent

**What it prevents**: Poor planning, missing features, unclear scope

**Test**: Run 3 product tasks with control doing planning inline (no separate planner)
- [ ] Did planning quality suffer? (Yes/No)
- [ ] Did features.json have gaps? (Yes/No)
- [ ] Decision: Keep / Simplify / Remove

**If "No" to both**: Consider merging planner into control

### 8. Separate Checker Agent

**What it prevents**: Executor self-grading leniency, missed bugs

**Test**: Run 10 rounds with executor self-checking (no separate checker)
- [ ] Did executor approve shallow work? (Yes/No)
- [ ] Did bugs slip through? (Yes/No)
- [ ] Decision: Keep / Simplify / Remove

**If "No" to both**: Consider merging checker into executor

## Simplification Decision Matrix

| Component | Test Result | Baseline Comparison | Decision |
|-----------|-------------|---------------------|----------|
| Sprint Contract | Pass/Fail | Better/Same/Worse | Keep/Remove |
| Calibration | Pass/Fail | Better/Same/Worse | Keep/Remove |
| 4-Dimension Scoring | Pass/Fail | Better/Same/Worse | Keep/Simplify/Remove |
| Context Reset | Pass/Fail | Better/Same/Worse | Keep/Remove |
| Dynamic Quality Gate | Pass/Fail | Better/Same/Worse | Keep/Remove |
| File Ownership | Pass/Fail | Better/Same/Worse | Keep/Relax |
| Separate Planner | Pass/Fail | Better/Same/Worse | Keep/Merge |
| Separate Checker | Pass/Fail | Better/Same/Worse | Keep/Merge |

## Simplification Protocol

**NEVER remove multiple components at once.** Follow this protocol:

1. Select ONE component to remove (highest "Remove" confidence)
2. Document baseline metrics
3. Remove the component
4. Run 10-20 tasks
5. Measure impact
6. Decision:
   - Metrics improved or same → Keep removal
   - Metrics degraded → Restore component
7. Wait 1 week before next removal

## Documentation Template

After each simplification attempt:

```markdown
## Simplification: {component-name}

**Date**: {date}
**Model**: {model-name}
**Harness Version**: {git-commit}

**Hypothesis**: {why we think this can be removed}

**Baseline Metrics**:
- Success rate: {X%}
- Quality score: {Y}
- First-pass rate: {Z%}

**Test Results** (10-20 tasks):
- Success rate: {X%}
- Quality score: {Y}
- First-pass rate: {Z%}

**Decision**: Keep removal / Restore component

**Reasoning**: {why we made this decision}

**Lessons Learned**: {what we learned}
```

Save to `control/references/simplification-log.md` (append-only).

## Success Criteria

Simplification is successful when:
- ✅ Complexity decreased (fewer components, shorter prompts, less state)
- ✅ Quality maintained or improved
- ✅ User experience maintained or improved
- ✅ Cost decreased (fewer tokens, faster execution)

If any criterion fails, restore the component.

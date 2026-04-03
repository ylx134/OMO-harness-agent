# Simplification Principles

Based on Anthropic's harness design philosophy: "Find the simplest solution possible, and only increase complexity when needed."

## Core Philosophy

As Claude's capabilities improve, harness components that were once necessary may become obsolete. The goal is to continuously simplify the system while maintaining quality.

## Simplification Cycle

Run this review every 3-6 months or after major Claude model updates:

### 1. Component Inventory

List all harness components:

- [ ] `control` skill (orchestration)
- [ ] `plan` skill (planning)
- [ ] `drive` skill (execution)
- [ ] `check` skill (acceptance)
- [ ] `memory` skill (state management)
- [ ] Contract negotiation phase
- [ ] Context reset mechanism
- [ ] Smoke tests
- [ ] Scoring rubrics
- [ ] Round contracts
- [ ] Evidence ledger
- [ ] Orchestration status tracking

### 2. Necessity Assessment

For each component, ask:

**Question 1: What problem does this solve?**
- Document the specific failure mode it prevents
- Example: "Contract negotiation prevents execution/acceptance misalignment"

**Question 2: Does the current model still have this problem?**
- Test with the latest model
- Run experiments without the component
- Measure failure rate

**Question 3: What's the cost of keeping it?**
- Complexity added
- Tokens consumed
- User friction
- Maintenance burden

**Question 4: What's the cost of removing it?**
- Failure modes that return
- Quality degradation
- User impact

### 3. Removal Candidates

A component is a removal candidate if:

1. **The model improved**: The failure mode it prevents rarely occurs now
2. **Low cost to remove**: Removing it doesn't significantly increase other complexity
3. **High cost to keep**: It adds significant overhead or friction
4. **Easy to restore**: If removal fails, it can be quickly restored

### 4. Experimental Removal

**NEVER remove multiple components at once.** Use this protocol:

1. **Select one component** to remove
2. **Document baseline metrics**:
   - Success rate on representative tasks
   - Quality scores
   - User satisfaction
   - Token usage
3. **Remove the component** in a test environment
4. **Run experiments** (10-20 representative tasks)
5. **Measure impact**:
   - Did success rate drop?
   - Did quality degrade?
   - Did token usage improve?
   - Did user experience improve?
6. **Decision**:
   - If metrics improved or stayed same: **Keep removal**
   - If metrics degraded significantly: **Restore component**
   - If unclear: **Run more experiments**

### 5. Documentation

For each removal, document:

```markdown
## Component Removal: {component-name}

**Date**: {date}
**Model**: {claude-version}

**Reason for removal**:
{why this component is no longer needed}

**Baseline metrics**:
- Success rate: {X%}
- Quality score: {Y}
- Token usage: {Z}

**Post-removal metrics**:
- Success rate: {X%}
- Quality score: {Y}
- Token usage: {Z}

**Decision**: {keep-removal | restore-component}

**Lessons learned**:
{what we learned from this experiment}
```

## Historical Simplifications

### Example: Sprint Structure (Anthropic)

**Removed**: Sprint structure with separate Generator/Evaluator negotiation rounds

**Reason**: Opus 4.6 can work coherently for 2+ hours in single session

**Result**: Simpler workflow, same quality

**Lesson**: Better long-context handling enabled simplification

### Example: Context Resets (Anthropic)

**Kept but reduced**: Context resets still needed, but less frequently

**Reason**: Opus 4.6 has better automatic compaction

**Result**: Fewer resets needed (from every 30 tools to every 50 tools)

**Lesson**: Partial simplification is valid

## Simplification Anti-Patterns

### Anti-Pattern 1: Premature Removal

**Mistake**: Removing a component after 2-3 successful tasks

**Why it fails**: Small sample size, may have gotten lucky

**Fix**: Run 10-20 diverse tasks before deciding

### Anti-Pattern 2: Batch Removal

**Mistake**: Removing multiple components at once "to simplify faster"

**Why it fails**: Can't isolate which removal caused problems

**Fix**: Remove one component at a time

### Anti-Pattern 3: Ignoring Edge Cases

**Mistake**: "It works on happy paths, remove the safety check"

**Why it fails**: Edge cases are where components earn their keep

**Fix**: Test edge cases explicitly

### Anti-Pattern 4: Complexity Whack-a-Mole

**Mistake**: Removing one component but adding two others to compensate

**Why it fails**: Net complexity increased

**Fix**: Only remove if total complexity decreases

## Simplification Candidates by Model Capability

### If Claude gets better at planning:

**Consider removing**:
- Separate `plan` skill (merge into `control`)
- Global/local plan separation (single plan layer)
- Phase contracts (simpler milestone markers)

**Keep**:
- Round contracts (still need bounded execution)
- Done criteria (still need clear goals)

### If Claude gets better at self-evaluation:

**Consider removing**:
- Separate `check` skill (execution self-checks)
- Contract negotiation (execution proposes and validates)
- Scoring rubrics (model has better taste)

**Keep**:
- Evidence requirements (still need proof)
- Hard gates (still need objective criteria)

### If Claude gets better at long-context:

**Consider removing**:
- Aggressive context resets (less frequent)
- Memory file splitting (fewer files)
- Handoff scripts (simpler state transfer)

**Keep**:
- File-based state (still better than context)
- Evidence capture (still need durable proof)

### If Claude gets better at following instructions:

**Consider removing**:
- Detailed role boundaries (simpler prompts)
- Explicit routing rules (model figures it out)
- Formal writeback requirements (model does it naturally)

**Keep**:
- Core principles (still need direction)
- Quality standards (still need bar)

## Simplification Metrics

Track these over time:

```
Harness Complexity Metrics:
- Total skills: {count}
- Total memory files: {count}
- Average tokens per task: {count}
- Lines of skill documentation: {count}
- User-facing complexity: {1-10 scale}

Quality Metrics:
- Task success rate: {%}
- Average quality score: {1-10}
- Acceptance rejection rate: {%}
- User satisfaction: {1-10}

Efficiency Metrics:
- Average task duration: {minutes}
- Average token usage: {count}
- Average helper count: {count}
- Average context resets: {count}
```

**Goal**: Reduce complexity metrics while maintaining or improving quality metrics.

## When NOT to Simplify

Don't remove a component if:

1. **Failure mode still common**: Model still makes this mistake regularly
2. **High-stakes work**: Component prevents costly errors
3. **User explicitly wants it**: User values the safety/structure
4. **No clear alternative**: Removing it leaves a gap
5. **Recent addition**: Component hasn't been tested long enough

## Simplification Roadmap Template

```markdown
# Harness Simplification Roadmap

**Model**: Claude Opus 4.6
**Date**: 2026-03-29

## Phase 1: Measurement (Month 1)
- [ ] Establish baseline metrics
- [ ] Document current component usage
- [ ] Identify pain points

## Phase 2: Candidate Selection (Month 2)
- [ ] List removal candidates
- [ ] Prioritize by impact/effort
- [ ] Design experiments

## Phase 3: Experimentation (Months 3-4)
- [ ] Remove candidate #1, measure
- [ ] Remove candidate #2, measure
- [ ] Remove candidate #3, measure

## Phase 4: Consolidation (Month 5)
- [ ] Keep successful removals
- [ ] Restore failed removals
- [ ] Update documentation

## Phase 5: Monitoring (Month 6)
- [ ] Monitor quality metrics
- [ ] Gather user feedback
- [ ] Plan next cycle
```

## The Simplification Mindset

> "The best code is no code. The best component is no component. But only remove what you can prove is unnecessary."

- **Be skeptical of complexity** - always ask "do we really need this?"
- **Be respectful of history** - components exist for reasons, understand them first
- **Be experimental** - try removing things, measure the impact
- **Be reversible** - make it easy to restore what you remove
- **Be patient** - simplification is a long-term process, not a one-time event

## Success Criteria

Simplification is successful when:

✅ Complexity metrics decreased
✅ Quality metrics maintained or improved
✅ User experience improved
✅ System is easier to understand
✅ System is easier to maintain
✅ System is easier to extend

If any of these fail, the simplification was premature.

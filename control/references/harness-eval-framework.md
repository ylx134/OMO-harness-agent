# Harness Evaluation Framework

## Purpose

Evaluate whether the harness is actually improving output quality vs. running without it.
Run this evaluation periodically (monthly or after model upgrades).

## Evaluation Protocol

### Step 1: Select Test Tasks

Choose 5-10 representative tasks across task types:

| # | Task | Type | Complexity | Expected Duration |
|---|------|------|-----------|------------------|
| 1 | Simple bug fix (known cause) | 修复型 | Low | 5-10 min |
| 2 | Code review / analysis | 判断型 | Low | 5-10 min |
| 3 | Add feature to existing app | 改造型 | Medium | 30-60 min |
| 4 | Refactor module | 改造型 | Medium | 30-60 min |
| 5 | Build capability from spec | 能力型 | High | 1-2 hours |
| 6 | Build small product from scratch | 产品型 | High | 2-6 hours |
| 7 | Build complex product from scratch | 产品型 | Very High | 4-12 hours |

### Step 2: Run Each Task in Two Modes

**Mode A: Harness mode** — Full control + drive + check pipeline
**Mode B: Solo mode** — Same model, same prompt, no harness (just "build X")

### Step 3: Score Each Output

Use the 4-dimension scoring framework (`check/references/scoring-framework.md`):
- 产品深度 (30%)
- 功能完整性 (30%)
- 视觉设计 (20%)
- 代码质量 (20%)

### Step 4: Record Results

```markdown
## Eval Run: {date}

### Model: {model-name}
### Harness Version: {git-commit-hash}

### Results

| # | Task | Solo Score | Harness Score | Delta | Harness Worth It? |
|---|------|-----------|---------------|-------|-------------------|
| 1 | Bug fix | 8.5 | 8.7 | +0.2 | No (overhead > gain) |
| 2 | Code review | 9.0 | 9.0 | 0 | No |
| 3 | Add feature | 6.5 | 8.0 | +1.5 | Yes |
| 4 | Refactor | 7.0 | 7.8 | +0.8 | Maybe |
| 5 | Build capability | 5.5 | 7.5 | +2.0 | Yes |
| 6 | Small product | 4.0 | 7.2 | +3.2 | Yes |
| 7 | Complex product | 3.0 | 6.8 | +3.8 | Yes |

### Summary
- Average solo score: {X}
- Average harness score: {Y}
- Average delta: {Z}
- Harness breakeven complexity: {task type where delta > 0.5}

### Conclusions
- {What worked}
- {What didn't}
- {What to change}
```

## Decision Framework

| Delta | Verdict |
|-------|---------|
| > +1.5 | **Strong lift** — harness is clearly worth the cost |
| +0.5 to +1.5 | **Moderate lift** — harness helps, monitor cost/benefit |
| -0.5 to +0.5 | **No significant lift** — consider simplifying this task type's flow |
| < -0.5 | **Negative lift** — harness is hurting, investigate why |

## When to Re-Evaluate

- After every major model upgrade (e.g., Opus 4.6 → Opus 5.0)
- After removing a harness component (per simplification-principles.md)
- After adding a harness component
- Monthly for active projects
- When user reports quality issues

## Component-Level Evaluation

For each harness component, track its individual contribution:

| Component | Failure Mode It Prevents | Still Observed in Solo? | Keep? |
|-----------|--------------------------|------------------------|-------|
| Sprint Contract | Executor builds wrong thing | ? | ? |
| Calibration Examples | Checker too lenient | ? | ? |
| 4-Dimension Scoring | Inconsistent acceptance quality | ? | ? |
| Context Reset | Context anxiety, premature stop | ? | ? |
| Dynamic Quality Gate | Same mistakes repeated | ? | ? |
| File Ownership | State file corruption | ? | ? |

Fill in "?" during each eval run. If "Still Observed in Solo?" is consistently "No" across
3+ eval runs, the component is a candidate for removal per simplification-principles.md.

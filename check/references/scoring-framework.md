# Universal Scoring Framework

A unified 4-dimension scoring framework for all acceptance decisions.
Applies to every sprint/round regardless of work type.

## The 4 Dimensions

### 1. 产品深度 (Product Depth) — Weight: 30%
**Question**: Does this feature deliver the depth that the spec promises, or is it a thin shell?

| Score | Description |
|-------|-------------|
| 10 | Exceeds spec depth — includes bonus capabilities the user didn't ask for but clearly need |
| 9 | Full spec depth — every sub-feature and interaction the spec requires is present |
| 8 | Most spec depth — 1-2 minor sub-features missing but core depth is there |
| 7 | Adequate depth — core capability works, some sub-features are basic but functional |
| 6 | Shallow depth — core works but sub-features are stubs or oversimplified |
| 5 | Very shallow — only the surface layer exists, no depth behind it |
| 4 | Stub — looks like the feature exists but does almost nothing |
| 3 | Placeholder — UI exists with no backend, or backend with no UI |
| 2 | Broken — feature exists but doesn't work as intended |
| 1 | Missing — feature not implemented at all |

**Hard threshold: ≥7/10**

### 2. 功能完整性 (Functional Completeness) — Weight: 30%
**Question**: Can a user complete the core workflow end-to-end without hitting dead ends?

| Score | Description |
|-------|-------------|
| 10 | Complete — happy path, error paths, edge cases all work flawlessly |
| 9 | Nearly complete — one minor edge case missing |
| 8 | Solid — happy path works, most error paths handled, 1-2 edge cases missing |
| 7 | Functional — happy path works, basic error handling, some edge cases unhandled |
| 6 | Partial — happy path works but error handling is weak or missing |
| 5 | Fragile — happy path works under ideal conditions but breaks easily |
| 4 | Unreliable — happy path works sometimes but not consistently |
| 3 | Broken — happy path has bugs or missing steps |
| 2 | Non-functional — feature exists but doesn't work |
| 1 | Missing — not implemented |

**Hard threshold: ≥8/10**

### 3. 视觉设计 (Visual Design) — Weight: 20%
**Question**: Does the result look like a professional product or an AI-generated template?

| Score | Description |
|-------|-------------|
| 10 | Exceptional — distinctive visual identity, custom design decisions, museum quality |
| 9 | Excellent — strong visual coherence, thoughtful typography and spacing |
| 8 | Good — consistent design language, no AI slop patterns, professional |
| 7 | Acceptable — clean and organized, minor inconsistencies, no glaring issues |
| 6 | Basic — functional layout but generic, no distinctive character |
| 5 | Template-like — looks like a stock component library demo |
| 4 | AI slop — purple gradients, generic cards, stock patterns |
| 3 | Inconsistent — mixed design languages, conflicting styles |
| 2 | Broken — layout issues, overlapping elements, unreadable text |
| 1 | Unusable — visual chaos |

**Hard threshold: ≥6/10**

### 4. 代码质量 (Code Quality) — Weight: 20%
**Question**: Is the code well-structured, maintainable, and free of known bugs?

| Score | Description |
|-------|-------------|
| 10 | Excellent — clean architecture, comprehensive tests, zero known bugs, well-documented |
| 9 | Very good — good structure, tests for critical paths, no known bugs |
| 8 | Good — reasonable structure, some tests, no known bugs in critical paths |
| 7 | Acceptable — basic structure, minimal tests, no known bugs in happy path |
| 6 | Fair — structure exists but has issues, no tests, minor known bugs |
| 5 | Poor — messy structure, no tests, known bugs in non-critical paths |
| 4 | Bad — spaghetti code, no organization, known bugs in critical paths |
| 3 | Broken — code doesn't compile or run consistently |
| 2 | Unmaintainable — impossible to understand or modify |
| 1 | Non-existent — no code |

**Hard threshold: ≥7/10**

## Scoring Formula

```
Final Score = (产品深度 × 0.30) + (功能完整性 × 0.30) + (视觉设计 × 0.20) + (代码质量 × 0.20)
```

**Pass/Fail Rule**: 
- ALL individual dimensions must meet their hard threshold
- AND final score must be ≥ 7.0
- If ANY dimension fails its threshold → REJECTED (regardless of final score)

## Usage in Acceptance

1. Score each dimension independently
2. Check each against its hard threshold
3. Calculate weighted final score
4. Decision:
   - All thresholds met AND final score ≥ 7.0 → eligible for acceptance
   - Any threshold failed → REJECTED with specific dimension feedback
   - Final score < 7.0 but thresholds met → NEEDS-FOLLOW-UP (borderline)

## Examples

### Example: Game Maker Sprint 3 (Level Editor)
- 产品深度: 8/10 (tile placement, layer system, undo/redo — minor: no grid snapping)
- 功能完整性: 8/10 (happy path works, error handling for invalid tiles)
- 视觉设计: 7/10 (clean editor layout, consistent toolbar, minor: color picker basic)
- 代码质量: 8/10 (well-structured React components, tests for core logic)
- Final: (8×0.3) + (8×0.3) + (7×0.2) + (8×0.2) = 2.4 + 2.4 + 1.4 + 1.6 = **7.8** → PASS

### Example: Login Form (Level 1)
- 产品深度: 4/10 (only email/password, no recovery, no validation)
- 功能完整性: 5/10 (happy path works, no error handling)
- 视觉设计: 6/10 (basic but clean)
- 代码质量: 5/10 (no tests, no input sanitization)
- Final: (4×0.3) + (5×0.3) + (6×0.2) + (5×0.2) = 1.2 + 1.5 + 1.2 + 1.0 = **4.9** → FAIL (产品深度 below 7)

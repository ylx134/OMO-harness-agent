# Refactoring Scoring Rubric

Refactoring should improve code quality without changing behavior. The challenge is proving "no behavior change."

## Scoring Dimensions

### 1. Behavior Preservation (Weight: 45%)

**What it measures**: Does it still work exactly the same?

**Excellent (9-10)**:
- All tests pass (100% before, 100% after)
- Manual testing confirms identical behavior
- Edge cases verified unchanged
- Performance characteristics similar
- Error messages unchanged
- API contracts maintained
- Database schema unchanged (or migrated safely)

**Good (7-8)**:
- All tests pass
- Main paths verified manually
- Most edge cases checked
- Performance similar
- Minor message changes documented

**Acceptable (5-6)**:
- Most tests pass
- Happy path verified
- Some edge cases unchecked
- Performance not verified
- Some undocumented changes

**Poor (1-4)**:
- Tests failing
- Behavior changed
- Edge cases broken
- Performance degraded
- Undocumented breaking changes

### 2. Code Quality Improvement (Weight: 30%)

**What it measures**: Is the code actually better?

**Excellent (9-10)**:
- Significantly more readable
- Better abstractions
- Reduced complexity
- Eliminated duplication
- Clearer naming
- Better structure
- Easier to test

**Good (7-8)**:
- Noticeably more readable
- Improved abstractions
- Some complexity reduction
- Less duplication
- Better naming

**Acceptable (5-6)**:
- Slightly more readable
- Marginally better abstractions
- Minimal complexity change
- Some duplication removed

**Poor (1-4)**:
- No improvement
- Worse abstractions
- Increased complexity
- More duplication
- Worse naming

### 3. Test Coverage (Weight: 15%)

**What it measures**: Are tests adequate to prove safety?

**Excellent (9-10)**:
- Comprehensive test suite exists
- All critical paths tested
- Edge cases covered
- Tests run fast
- Tests are clear
- New tests added for previously untested code

**Good (7-8)**:
- Good test coverage
- Main paths tested
- Some edge cases
- Tests run reasonably fast
- Tests understandable

**Acceptable (5-6)**:
- Basic test coverage
- Happy paths tested
- Few edge cases
- Tests slow
- Tests unclear

**Poor (1-4)**:
- Poor test coverage
- Critical paths untested
- No edge case tests
- Tests very slow or broken

### 4. Risk Management (Weight: 10%)

**What it measures**: How safely was the refactoring done?

**Excellent (9-10)**:
- Small, incremental changes
- Each step verified
- Easy to revert
- No mixing with feature work
- Clear commit history
- Rollback plan exists

**Good (7-8)**:
- Reasonably sized changes
- Most steps verified
- Revertable
- Mostly pure refactoring
- Decent commit history

**Acceptable (5-6)**:
- Large changes
- Some verification
- Hard to revert
- Some feature mixing
- Messy commits

**Poor (1-4)**:
- Massive changes
- No verification
- Can't revert
- Mixed with features
- Incomprehensible commits

## Scoring Guidelines

### Calculating Final Score

```
Final Score = (Behavior Preservation × 0.45) + (Code Quality × 0.30) + (Test Coverage × 0.15) + (Risk Management × 0.10)
```

### Acceptance Thresholds

- **9.0+**: Exceptional refactoring
- **7.5-8.9**: Strong, safe to merge
- **6.0-7.4**: Acceptable, needs verification
- **4.0-5.9**: Needs rework, too risky
- **<4.0**: Reject, unsafe

### Special Rules for Refactoring

1. **Any behavior change is automatic rejection** unless explicitly documented and approved.

2. **Test failures are automatic rejection** - refactoring should never break tests.

3. **Performance regression >20% is automatic rejection** unless explicitly accepted.

4. **Missing tests for refactored code** cap score at 7.0.

5. **"It looks better" without measurable improvement** caps score at 6.0.

## Critical Checks

Before accepting any refactoring:

- [ ] All existing tests pass
- [ ] No new test failures
- [ ] Manual testing confirms identical behavior
- [ ] Performance benchmarks similar (±10%)
- [ ] API contracts unchanged
- [ ] Database schema unchanged (or safely migrated)
- [ ] Error messages unchanged (or documented)
- [ ] No feature work mixed in
- [ ] Commit history is clear
- [ ] Rollback plan exists
- [ ] Code metrics improved (complexity, duplication, etc.)

## Measurable Improvements

Good refactoring should show measurable improvements:

- **Cyclomatic complexity**: Reduced by X%
- **Code duplication**: Reduced by X lines
- **Function length**: Average reduced from X to Y lines
- **Test coverage**: Increased from X% to Y%
- **Build time**: Reduced from X to Y seconds
- **Lines of code**: Reduced by X% (without losing functionality)

## Example Evaluations

### Example 1: Extract Service Class

**Behavior Preservation: 9.5**
- All 47 tests pass
- Manual testing confirms identical behavior
- Performance within 5%
- Error messages unchanged

**Code Quality: 8.5**
- Much more readable
- Clear separation of concerns
- Reduced complexity from 15 to 8
- Better naming

**Test Coverage: 8.0**
- Good existing coverage (85%)
- Added 3 new tests for edge cases
- Tests run fast

**Risk Management: 9.0**
- Small, incremental commits
- Each step verified
- Easy to revert
- Pure refactoring

**Final: 8.9** - Strong, safe to merge

### Example 2: Rewrite Authentication Module

**Behavior Preservation: 5.0**
- 3 tests failing
- Main path works
- Some edge cases broken
- Performance not verified
- Error messages changed

**Code Quality: 9.0**
- Much cleaner code
- Better abstractions
- Significantly reduced complexity

**Test Coverage: 6.0**
- Decent coverage
- Some critical paths untested
- Tests slow

**Risk Management: 4.0**
- Massive change (500+ lines)
- Hard to revert
- Mixed with feature work
- Messy commits

**Final: 5.8** - Needs rework, too risky despite quality improvements

## Calibration Notes

- **Behavior preservation is paramount** - beautiful but broken code fails
- **"Looks better" is subjective** - use metrics
- **Small steps are safer** - prefer 5 small refactorings over 1 large
- **Tests are your safety net** - don't refactor untested code
- **Ask**: "If this broke production, could I revert it in 5 minutes?"

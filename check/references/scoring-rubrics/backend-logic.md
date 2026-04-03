# Backend Logic Scoring Rubric

Backend work prioritizes correctness, performance, and maintainability over visual appeal.

## Scoring Dimensions

### 1. Correctness (Weight: 40%)

**What it measures**: Does it produce the right results in all cases?

**Excellent (9-10)**:
- All happy paths work correctly
- All error paths handled properly
- Edge cases identified and handled
- Boundary conditions tested
- Race conditions considered
- Data integrity maintained

**Good (7-8)**:
- Happy paths work correctly
- Most error paths handled
- Common edge cases covered
- Basic boundary testing
- Data integrity mostly maintained

**Acceptable (5-6)**:
- Happy path works
- Basic error handling
- Some edge cases missed
- Minimal boundary testing
- Data integrity concerns exist

**Poor (1-4)**:
- Happy path has bugs
- Poor error handling
- Edge cases ignored
- No boundary testing
- Data integrity issues

### 2. Performance (Weight: 25%)

**What it measures**: Efficiency and scalability.

**Excellent (9-10)**:
- Optimal algorithm choices
- Efficient database queries (no N+1)
- Proper indexing
- Caching where appropriate
- Scales to expected load
- Resource usage optimized

**Good (7-8)**:
- Good algorithm choices
- Decent query efficiency
- Basic indexing
- Some caching
- Handles expected load
- Reasonable resource usage

**Acceptable (5-6)**:
- Acceptable algorithms
- Queries work but not optimized
- Minimal indexing
- No caching
- Works at current scale
- Higher resource usage

**Poor (1-4)**:
- Inefficient algorithms
- N+1 queries or worse
- No indexing
- Performance problems
- Won't scale

### 3. Robustness (Weight: 20%)

**What it measures**: Error handling, resilience, safety.

**Excellent (9-10)**:
- Comprehensive error handling
- Graceful degradation
- Input validation
- Transaction safety
- Idempotency where needed
- Retry logic for transient failures
- Circuit breakers for external deps

**Good (7-8)**:
- Good error handling
- Basic degradation
- Input validation present
- Transactions used correctly
- Some retry logic

**Acceptable (5-6)**:
- Basic error handling
- Minimal degradation
- Some input validation
- Transactions mostly correct
- No retry logic

**Poor (1-4)**:
- Poor error handling
- No degradation
- Missing input validation
- Transaction issues
- Fragile to failures

### 4. Maintainability (Weight: 15%)

**What it measures**: Code quality, readability, testability.

**Excellent (9-10)**:
- Clear, self-documenting code
- Appropriate abstractions
- Well-tested (unit + integration)
- Easy to modify
- Good separation of concerns
- Minimal technical debt

**Good (7-8)**:
- Readable code
- Reasonable abstractions
- Decent test coverage
- Modifiable with effort
- Some separation of concerns

**Acceptable (5-6)**:
- Understandable code
- Basic abstractions
- Minimal tests
- Hard to modify
- Weak separation

**Poor (1-4)**:
- Unclear code
- Poor abstractions
- No tests
- Very hard to modify
- Tangled concerns

## Scoring Guidelines

### Calculating Final Score

```
Final Score = (Correctness × 0.40) + (Performance × 0.25) + (Robustness × 0.20) + (Maintainability × 0.15)
```

### Acceptance Thresholds

- **9.0+**: Exceptional, production-ready
- **7.5-8.9**: Strong, ready with minor review
- **6.0-7.4**: Acceptable, needs improvements
- **4.0-5.9**: Needs rework, significant issues
- **<4.0**: Reject, fundamental problems

### Special Rules for Backend

1. **Correctness is paramount** - a beautiful but wrong implementation fails.

2. **Security issues are automatic rejection** regardless of other scores.

3. **Data loss bugs are automatic rejection** regardless of other scores.

4. **Performance issues that affect UX** (>2s response time) cap score at 6.0.

5. **Missing tests for critical paths** cap score at 7.0.

## Critical Checks

Before accepting any backend work, verify:

- [ ] No SQL injection vulnerabilities
- [ ] No authentication/authorization bypasses
- [ ] No data loss scenarios
- [ ] No race conditions in critical paths
- [ ] Proper transaction boundaries
- [ ] Input validation on all external inputs
- [ ] Error messages don't leak sensitive info
- [ ] Secrets not hardcoded
- [ ] Database migrations are reversible
- [ ] API contracts maintained (no breaking changes)

## Example Evaluations

### Example 1: User Registration Endpoint

**Correctness: 9.0**
- Creates user correctly
- Handles duplicate emails
- Validates all inputs
- Sends confirmation email
- Edge cases covered

**Performance: 8.0**
- Efficient queries
- Proper indexing on email
- Password hashing async
- No N+1 issues

**Robustness: 9.5**
- Comprehensive error handling
- Transaction wraps user creation + email
- Idempotent (can retry safely)
- Input validation thorough
- Rate limiting present

**Maintainability: 8.5**
- Clear code structure
- Well-tested (95% coverage)
- Easy to add new fields
- Good separation of concerns

**Final: 8.8** - Strong, ready to ship

### Example 2: Data Export Feature

**Correctness: 7.0**
- Exports data correctly for happy path
- Missing pagination for large datasets
- Doesn't handle deleted records well
- Basic filtering works

**Performance: 4.5**
- Loads entire dataset into memory
- No streaming
- Will OOM on large exports
- Inefficient query

**Robustness: 6.0**
- Basic error handling
- No timeout handling
- No progress tracking
- Fails silently on large datasets

**Maintainability: 7.5**
- Readable code
- Some tests
- Could be refactored easily

**Final: 6.0** - Needs rework for performance and robustness

## Calibration Notes

- **Prioritize correctness and robustness** over performance optimization
- **Security issues are non-negotiable** - reject immediately
- **Performance is relative** - 100ms for simple query is bad, 2s for complex report is fine
- **Tests are evidence** - untested code is assumed broken
- **Ask**: "Would I trust this with production data?"

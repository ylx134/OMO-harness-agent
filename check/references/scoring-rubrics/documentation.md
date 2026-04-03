# Documentation Scoring Rubric

Documentation quality directly impacts developer productivity and user success.

## Scoring Dimensions

### 1. Clarity (Weight: 35%)

**What it measures**: Is it easy to understand?

**Excellent (9-10)**:
- Clear, concise language
- No jargon without explanation
- Examples for every concept
- Logical flow
- Appropriate detail level
- Scannable structure

**Good (7-8)**:
- Generally clear
- Minimal unexplained jargon
- Most concepts have examples
- Decent flow
- Reasonable detail

**Acceptable (5-6)**:
- Understandable with effort
- Some jargon
- Few examples
- Choppy flow
- Uneven detail

**Poor (1-4)**:
- Confusing or ambiguous
- Heavy jargon
- No examples
- Poor flow
- Wrong detail level

### 2. Completeness (Weight: 30%)

**What it measures**: Does it cover what's needed?

**Excellent (9-10)**:
- All features documented
- All parameters explained
- Error cases covered
- Edge cases mentioned
- Prerequisites listed
- Troubleshooting section

**Good (7-8)**:
- Main features documented
- Most parameters explained
- Common errors covered
- Some edge cases
- Basic prerequisites

**Acceptable (5-6)**:
- Core features documented
- Key parameters explained
- Minimal error coverage
- Few edge cases
- Implicit prerequisites

**Poor (1-4)**:
- Incomplete coverage
- Missing parameters
- No error documentation
- No edge cases
- No prerequisites

### 3. Accuracy (Weight: 25%)

**What it measures**: Is it correct and up-to-date?

**Excellent (9-10)**:
- All information correct
- Code examples work
- API signatures match
- Version info current
- No outdated content

**Good (7-8)**:
- Mostly correct
- Examples mostly work
- Minor signature mismatches
- Generally current

**Acceptable (5-6)**:
- Some inaccuracies
- Some examples broken
- Some outdated info
- Needs updates

**Poor (1-4)**:
- Many inaccuracies
- Examples don't work
- Seriously outdated
- Misleading

### 4. Usability (Weight: 10%)

**What it measures**: Can users find what they need?

**Excellent (9-10)**:
- Clear table of contents
- Good search keywords
- Cross-references
- Quick start guide
- Code snippets copyable

**Good (7-8)**:
- Basic TOC
- Some keywords
- Some cross-refs
- Getting started section

**Acceptable (5-6)**:
- Minimal TOC
- Few keywords
- Rare cross-refs
- No quick start

**Poor (1-4)**:
- No TOC
- No keywords
- No cross-refs
- Hard to navigate

## Scoring Guidelines

### Calculating Final Score

```
Final Score = (Clarity × 0.35) + (Completeness × 0.30) + (Accuracy × 0.25) + (Usability × 0.10)
```

### Acceptance Thresholds

- **9.0+**: Exceptional documentation
- **7.5-8.9**: Strong, ready to publish
- **6.0-7.4**: Acceptable, improvements recommended
- **4.0-5.9**: Needs rework
- **<4.0**: Reject, not usable

### Special Rules for Documentation

1. **Broken code examples are automatic rejection** - users will copy-paste them.

2. **Missing critical information** (auth, rate limits, breaking changes) caps score at 6.0.

3. **Outdated version info** is worse than no version info.

4. **"Self-explanatory" is not documentation** - if it needs docs, write them.

## Critical Checks

- [ ] All code examples run without modification
- [ ] All API endpoints documented
- [ ] All parameters have types and descriptions
- [ ] Error codes explained
- [ ] Authentication/authorization covered
- [ ] Rate limits mentioned
- [ ] Deprecation warnings present
- [ ] Migration guides for breaking changes
- [ ] Examples show common use cases
- [ ] Troubleshooting section exists

## Example Evaluation

### Example: API Documentation

**Clarity: 8.5**
- Clear language
- Good examples
- Logical structure
- Scannable

**Completeness: 7.0**
- All endpoints documented
- Most parameters covered
- Missing some error codes
- No troubleshooting section

**Accuracy: 9.0**
- All examples work
- Signatures correct
- Up-to-date

**Usability: 8.0**
- Good TOC
- Searchable
- Some cross-refs
- Quick start present

**Final: 8.1** - Strong, ready with minor additions

## Calibration Notes

- **Test all code examples** - don't assume they work
- **Read as a beginner** - don't fill gaps with your knowledge
- **Check against actual code** - docs drift from reality
- **Ask**: "Could someone use this without asking me questions?"

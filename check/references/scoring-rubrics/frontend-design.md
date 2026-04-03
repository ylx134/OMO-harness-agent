# Frontend Design Scoring Rubric

Based on Anthropic's harness design article, frontend work requires special attention to design quality and originality, not just functionality.

## Scoring Dimensions

### 1. Design Quality (Weight: 35%)

**What it measures**: Overall visual coherence, consistency, and atmosphere.

**Excellent (9-10)**:
- Strong, cohesive visual identity throughout
- Intentional use of space, color, and typography
- Every element feels like it belongs
- Clear visual hierarchy guides the eye naturally
- Consistent design language across all screens

**Good (7-8)**:
- Generally consistent visual approach
- Decent use of design fundamentals
- Some memorable visual moments
- Mostly clear hierarchy
- Minor inconsistencies that don't break the experience

**Acceptable (5-6)**:
- Basic visual consistency
- Functional but unremarkable design
- Hierarchy exists but could be stronger
- Feels like a template with minor customization

**Poor (1-4)**:
- Inconsistent visual language
- No clear design direction
- Weak or confusing hierarchy
- Looks like default/unstyled components

### 2. Originality (Weight: 35%)

**What it measures**: Avoidance of generic AI/template patterns, unique character.

**Excellent (9-10)**:
- Distinctive visual approach not seen in typical templates
- Unexpected but appropriate design choices
- Custom components that feel purpose-built
- Memorable interactions or visual treatments
- Clearly NOT generated from a standard template

**Good (7-8)**:
- Some unique elements mixed with familiar patterns
- At least 2-3 distinctive design decisions
- Feels customized beyond template defaults
- Has some personality

**Acceptable (5-6)**:
- Mostly familiar patterns with minor tweaks
- Recognizable as template-based but not generic
- One or two unique touches
- Safe but not boring

**Poor (1-4)**:
- Obviously template-based with minimal changes
- Generic "AI-generated" aesthetic
- No distinctive character
- Could be any site/app

### 3. Craft (Weight: 15%)

**What it measures**: Technical execution quality.

**Excellent (9-10)**:
- Pixel-perfect alignment and spacing
- Smooth, polished interactions
- Proper responsive behavior
- No visual bugs or glitches
- Attention to micro-details

**Good (7-8)**:
- Generally well-executed
- Minor alignment issues
- Interactions work smoothly
- Responsive with minor issues

**Acceptable (5-6)**:
- Functional but rough around edges
- Some alignment/spacing issues
- Interactions work but not polished
- Basic responsive behavior

**Poor (1-4)**:
- Sloppy execution
- Obvious visual bugs
- Broken interactions
- Poor responsive behavior

### 4. Functionality (Weight: 15%)

**What it measures**: Does it work as intended?

**Excellent (9-10)**:
- All features work perfectly
- Edge cases handled gracefully
- Error states are clear and helpful
- Loading states are smooth

**Good (7-8)**:
- Core features work well
- Most edge cases handled
- Basic error handling
- Functional loading states

**Acceptable (5-6)**:
- Main path works
- Some edge cases missed
- Minimal error handling
- Basic functionality present

**Poor (1-4)**:
- Core features broken
- No edge case handling
- Poor or missing error states
- Buggy behavior

## Scoring Guidelines

### Calculating Final Score

```
Final Score = (Design Quality × 0.35) + (Originality × 0.35) + (Craft × 0.15) + (Functionality × 0.15)
```

### Acceptance Thresholds

- **9.0+**: Exceptional, exceeds expectations
- **7.5-8.9**: Strong, ready to ship
- **6.0-7.4**: Acceptable, minor improvements recommended
- **4.0-5.9**: Needs rework, significant issues
- **<4.0**: Reject, fundamental problems

### Special Rules for Frontend

1. **Design Quality and Originality are weighted highest** because Claude already performs well on Craft and Functionality.

2. **Generic templates automatically cap at 6.0** even if technically perfect. Originality matters.

3. **"Works but boring" is not acceptable** for user-facing frontend work. Aim for 7.5+ on Design Quality.

4. **Visual bugs are more serious** than backend bugs because users see them immediately.

## Example Evaluations

### Example 1: E-commerce Product Page

**Design Quality: 8.5**
- Consistent visual language
- Clear product hierarchy
- Good use of whitespace
- Professional photography treatment

**Originality: 7.0**
- Familiar e-commerce patterns
- One unique product gallery interaction
- Custom "add to cart" animation
- Otherwise standard layout

**Craft: 9.0**
- Pixel-perfect alignment
- Smooth transitions
- Perfect responsive behavior
- No visual bugs

**Functionality: 8.5**
- All features work
- Good error handling
- Smooth loading states
- Minor edge case missed

**Final: 8.2** - Strong, ready to ship

### Example 2: Dashboard Landing

**Design Quality: 6.0**
- Basic consistency
- Standard dashboard layout
- Functional but unremarkable
- Weak visual hierarchy

**Originality: 4.5**
- Obviously template-based
- Generic "admin dashboard" look
- No distinctive elements
- Seen this exact layout 100 times

**Craft: 8.0**
- Well-executed technically
- Good alignment
- Smooth interactions

**Functionality: 9.0**
- Everything works perfectly
- Great error handling

**Final: 6.2** - Needs rework for originality despite technical quality

## Calibration Notes

- **Err on the side of strictness** for Design Quality and Originality
- **Be generous** with Craft and Functionality if technically sound
- **Compare against real products**, not just "does it work"
- **Ask**: "Would I be proud to show this to a designer?"

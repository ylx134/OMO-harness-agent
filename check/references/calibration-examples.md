# Evaluator Calibration Examples

Few-shot calibration examples for acceptance decisions.
Read this file before every acceptance pass to calibrate judgment.
These examples show 4 levels of quality and what decision each deserves.

---

## Level 1: 勉强过线（打回）

**Description**: Technically works but barely. Missing polish, edge cases, or depth.

### Example 1: Login Feature
**What was delivered**: A login form with email/password fields. Clicking "Login" sends a POST request.
**Why it fails**:
- No error handling for wrong credentials (just crashes or shows raw error)
- No loading state during authentication
- No "forgot password" flow
- No input validation (accepts empty strings, invalid emails)
- No session persistence (refreshing logs you out)
- No visual feedback on login success/failure

**Decision**: REJECTED — core login works but the user experience is broken for any real-world scenario.

### Example 2: File Upload Feature
**What was delivered**: A file input that uploads to `/api/upload`. Returns 200 OK.
**Why it fails**:
- No file size limit (accepts 1GB files)
- No file type validation
- No upload progress indicator
- No error handling for network failures
- No success confirmation to user
- Uploaded files not accessible anywhere in the UI

**Decision**: REJECTED — the pipe exists but nothing is connected to it.

---

## Level 2: 功能够但产品太薄（打回）

**Description**: Functional and handles errors, but too thin to justify release. Missing features that the spec or user expectation requires.

### Example 1: Text Editor Feature
**What was delivered**: A textarea with bold/italic/underline buttons. Saves to localStorage.
**Why it fails**:
- No font size control
- No undo/redo
- No word count or character count
- No export functionality
- No formatting preview
- The spec called for a "rich text editor" — this is a formatted textarea

**Decision**: REJECTED — it works, but it's 20% of what a rich text editor should be.

### Example 2: Dashboard Feature
**What was delivered**: A page showing 3 static cards with hardcoded numbers.
**Why it fails**:
- Numbers don't update (no real data source)
- No charts or visualizations
- No time range selector
- No drill-down capability
- No comparison with previous periods
- The spec called for an "analytics dashboard" — this is a static mockup with live text

**Decision**: REJECTED — looks like a dashboard but has no analytical capability.

---

## Level 3: 工整但普通（打回）

**Description**: Well-implemented, handles edge cases, no bugs. But it's generic, template-like, or lacks creative decisions.

### Example 1: Landing Page
**What was delivered**: A clean landing page with hero section, features grid, pricing table, and footer. Uses Tailwind defaults.
**Why it fails**:
- Purple gradient over white cards (AI slop pattern)
- Generic stock-style illustrations
- No custom typography choices
- No distinctive visual identity
- Layout is a standard template — any AI could generate this
- No custom animation or interaction

**Decision**: REJECTED — technically competent but visually indistinguishable from 1000 other AI-generated landing pages.

### Example 2: Settings Page
**What was delivered**: A settings page with toggle switches, dropdown menus, and save buttons. All functional.
**Why it fails**:
- Standard Material Design components with no customization
- No grouping or categorization logic
- No search within settings
- No "reset to defaults" option
- No indication of which settings have been changed
- Works perfectly but feels like a component library demo

**Decision**: REJECTED — functional but shows no design thinking beyond "put controls on a page."

---

## Level 4: 真正值得放行（放行）

**Description**: Genuinely worth releasing. Has depth, handles edge cases, shows creative decisions, and delivers real value.

### Example 1: Game Maker (Anthropic Benchmark)
**What was delivered**: A 2D game maker with level editor, sprite editor, entity behavior system, and playable test mode. Full viewport usage, consistent visual identity, AI-assisted sprite generation, working physics in play mode.
**Why it passes**:
- Core gameplay actually works (entities respond to input)
- Rich sprite editor with proper tool palettes and color picker
- AI integration speeds up workflow meaningfully
- Consistent visual identity throughout
- Sprint contracts had 27+ granular criteria per sprint
- Evaluator caught real bugs (route ordering, event handler conditions)

**Decision**: ACCEPTED — this is a real product, not a shell.

### Example 2: DAW (Digital Audio Workstation)
**What was delivered**: A browser-based DAW with arrangement view, mixer, transport controls, and AI agent for song composition. Working Web Audio API integration, proper tool wiring, end-to-end song creation through prompting.
**Why it passes**:
- Core primitives for song composition are present and working
- AI agent can drive functionality autonomously using tools
- Arrangement view, mixer, and transport all functional
- QA caught real gaps (stub-only recording, missing clip interactions)
- Generator fixed gaps in subsequent rounds

**Decision**: ACCEPTED — not pitch-perfect, but all core pieces of a functional music production program are present.

---

## Calibration Rules

1. **Default to rejection** when in doubt. It's easier to approve a rejected item than to catch a false approval.
2. **Level 1 and 2 are always rejected**. No exceptions.
3. **Level 3 is rejected unless the task explicitly allows "MVP" scope**.
4. **Level 4 is accepted only when ALL of these are true**:
   - Core functionality works end-to-end
   - Edge cases and error paths are handled
   - Visual/design quality meets the project's standards
   - No known bugs or stubs in critical paths
   - The result would be useful to a real user

## Drift Detection Checklist

After every 3 acceptance passes, check:
- [ ] Am I approving things that look like Level 1 or 2? → Leniency drift
- [ ] Am I rejecting things that clearly meet Level 4? → Strictness drift
- [ ] Am I marking hard gates as "not-applicable" to avoid rejection? → Gate skipping
- [ ] Am I accepting self-reported evidence without running it myself? → Evidence inflation
- [ ] Are scores trending upward without real quality improvement? → Score inflation

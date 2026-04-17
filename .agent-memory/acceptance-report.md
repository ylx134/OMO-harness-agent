# Acceptance Report

## Route F-M1 — REQ-20260417-104845

### Decision: ACCEPTED

### Contract Review

| Done Criterion | Status | Evidence |
|---|---|---|
| `npx tsc --noEmit` exits with code 0, no errors | ✅ PASS | No output from tsc, exit code 0 |
| `dist/index.js` still exports `server`, `id`, `routeConfig`, `selectCapabilityHands`, `selectProbes` | ✅ PASS | Node runtime check confirmed all 5 named exports + default |
| evidence-ledger.md records regression verification results | ✅ PASS | Written with pre-fix error, fix details, post-fix result, and export verification |

### Probe Findings

**artifact-probe-agent**: 
- Verified `dist/index.js` exports: `id` (string), `server` (function), `routeConfig` (function), `selectCapabilityHands` (function), `selectProbes` (function), `default` (object)
- All exports intact, no regression

**regression-probe-agent**:
- Full `tsc --noEmit` scan across `src/**/*` — zero errors
- No new TS errors introduced by the fix
- Adjacent `src/` barrel files (routing, dispatch, etc.) still re-export from dist but do not trigger errors

### Anti-Shallow Bar Check
> "the main failure must be removed and at least one adjacent regression check must be evidenced"

- Main failure (TS18004) removed: ✅
- Adjacent regression check evidenced: ✅ (full tsc scan + dist exports verification)

### Quality Notes
- Fix is minimal and surgical — only removed the invalid `export default { id, server }` line
- No `@ts-ignore` or error suppression used
- Runtime behavior preserved (actual entry is `plugin/index.js`, not `src/index.ts`)
- Known technical debt noted: other `src/` barrel files still use the same dist re-export pattern

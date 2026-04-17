# Evidence Ledger

## Build Fix — REQ-20260417-104845

### Pre-Fix State
- **Command**: `npx tsc --noEmit` in `plugin/`
- **Error**: `src/index.ts(3,22): error TS18004: No value exists in scope for the shorthand property 'server'. Either declare one or provide an initializer.`
- **Root Cause**: `src/index.ts` used `export { server } from '../dist/index.js'` (re-export) then `export default { id, server }` (shorthand property). Re-exports do not create local bindings, so `server` was not in scope for the object literal.

### Fix Applied
- **File**: `/Users/tianyuan/Documents/my_workspace/omo-harness-skills/plugin/src/index.ts`
- **Change**: Removed `export default { id, server };` line. Kept named re-exports only:
  ```ts
  export const id = 'omo-harness-plugin';
  export { server } from '../dist/index.js';
  ```
- **Rationale**: The actual runtime entry is `plugin/index.js` (package.json `main`), not `src/index.ts`. Removing the invalid default export eliminates the TS error without affecting runtime behavior.

### Post-Fix Verification
- **Command**: `npx tsc --noEmit` in `plugin/`
- **Result**: Exit code 0, no output (zero errors)
- **Timestamp**: 2026-04-17

### Regression — Dist Exports Verification
- **Command**: `node -e "const m = require('./dist/index.js'); ..."` in `plugin/`
- **Results**:
  - `id`: string ✅
  - `server`: function ✅
  - `routeConfig`: function ✅
  - `selectCapabilityHands`: function ✅
  - `selectProbes`: function ✅
  - `default`: object ✅
- **Conclusion**: All runtime exports intact, no regression.

### Known Technical Debt
- `src/` subdirectories (`routing/`, `dispatch/`, etc.) still contain barrel files that re-export from `../../dist/index.js`. They do not currently trigger TS errors but represent the same source↔build boundary anti-pattern. Future cleanup recommended.

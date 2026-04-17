# Risk Summary

## Route F-M1 — REQ-20260417-104845

### Resolved Risks
- **TS18004 build error**: Resolved by removing invalid `export default { id, server }` from `src/index.ts`
- **Runtime regression risk**: Mitigated — verified all dist exports intact via Node runtime check

### Residual Risks (Low)
- **Technical debt**: Other `src/` barrel files (`routing/`, `dispatch/`, `intake/`, etc.) still re-export from `../../dist/index.js`. Same source↔build boundary anti-pattern. Not currently triggering errors but could break if tsconfig or moduleResolution changes.
- **No build script**: `package.json` has no `build` or `typecheck` script. Future contributors may not know to run `tsc --noEmit` before committing.

### Recommendations
1. Add `"typecheck": "tsc --noEmit"` to `plugin/package.json` scripts
2. Consider consolidating `src/` barrel files or removing them in favor of direct `dist/` usage
3. Add a pre-commit hook or CI step to run typecheck

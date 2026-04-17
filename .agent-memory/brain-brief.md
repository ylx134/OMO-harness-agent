# Brain Brief

- Request ID: REQ-20260417-104845
- Goal: 修复构建报错并补上回归验证
- Route: F-M1
- Planning: complete — contract written in task.md
- Build error: TS18004 in plugin/src/index.ts — `server` imported from dist/index.js, shorthand property fails
- Root cause: src/index.ts re-exports from dist/ (pre-built output), creating source↔build circular dependency
- Fix approach: restructure src/index.ts to not import from dist/; either inline the needed exports or use type-only import
- Next expected actor: execution-manager

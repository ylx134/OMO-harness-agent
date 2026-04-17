# Task

## Final Goal

修复 `plugin/src/index.ts` 的 TypeScript 构建报错（`TS18004: No value exists in scope for the shorthand property 'server'`），并补上回归验证确保构建通过。

## Semantic Lock

- 真正的成功标准：`npx tsc --noEmit` 在 `plugin/` 目录下零错误通过
- 不能把"看起来能跑"或"加了 @ts-ignore 压制报错"当作完成——必须从根源消除类型解析问题
- 修复不能破坏 `dist/index.js` 已有的运行时行为（plugin hooks、dispatch、guards 等）

## What Counts As Done

1. `plugin/src/index.ts` 的 TS18004 错误被根因修复（非 ts-ignore 压制）
2. `npx tsc --noEmit` 零错误通过
3. 回归验证执行并记录证据（构建通过截图/输出）
4. 所有 harness 状态文件更新一致

## What Does Not Count As Done

- 仅用 `// @ts-ignore` 压制错误而不解决根因
- 修复了构建但破坏了 `dist/index.js` 的运行时导出
- 没有执行回归验证就宣称完成

## Non-Degradable Requirements Summary

- 构建必须真正通过，不是压制
- 运行时行为必须等价
- 回归验证必须有证据

## Done Criteria

- [ ] `npx tsc --noEmit` 在 `plugin/` 目录下 exit code 0，无 error 输出
- [ ] `dist/index.js` 仍然正确导出 `server`、`id`、`routeConfig`、`selectCapabilityHands`、`selectProbes`
- [ ] evidence-ledger.md 记录回归验证结果

## Non-Goals

- 不重构整个 plugin 架构
- 不添加新的构建工具链（webpack/rollup 等）
- 不改动 `dist/index.js` 的运行时逻辑

## Assumptions

- `dist/index.js` 是已有的预编译产物，包含完整的 plugin server 实现
- `src/index.ts` 是 TypeScript 源码入口，目前只做了 re-export
- 项目没有配置 `tsc` 编译步骤（`package.json` 无 build script）

## Recommended Route

修复型 F-M1：定位根因 → 修复源码 → 验证构建 → 回归验证

## Manager Stack

- planning-manager → 本合同
- execution-manager → 调度 shell-agent（验证构建）、code-agent（修复源码）、evidence-agent（整理证据）
- acceptance-manager → 调度 regression-probe-agent、artifact-probe-agent

## Capability Expectations

- **shell-agent**: 执行 `npx tsc --noEmit` 验证构建前后状态
- **code-agent**: 修复 `src/index.ts` 的导入/导出结构
- **evidence-agent**: 整理构建输出、回归验证证据到 evidence-ledger.md

## Probe Expectations

- **artifact-probe-agent**: 验证 `dist/index.js` 导出完整性（server、id、routeConfig 等）
- **regression-probe-agent**: 确认修复未引入新的 TS 错误或破坏相邻文件

## Global Phase Structure

### Phase 1: 诊断与复现
- **目的**: 确认构建错误的具体原因和范围
- **边界**: 仅诊断，不修改代码
- **Done 条件**: 错误根因明确记录
- **证据**: tsc 输出

### Phase 2: 修复实施
- **目的**: 修复 `src/index.ts` 的 TS18004 错误
- **边界**: 仅修改 `src/index.ts`，不改动 `dist/index.js` 逻辑
- **Done 条件**: 修改完成且语义等价
- **漂移风险**: 低——修改范围限定在单文件导入/导出

### Phase 3: 构建验证
- **目的**: 确认 `tsc --noEmit` 零错误通过
- **边界**: 仅执行验证命令
- **Done 条件**: exit code 0
- **证据**: 命令输出记录到 evidence-ledger.md

### Phase 4: 回归验证
- **目的**: 验证修复未破坏相邻功能
- **边界**: 检查 TS 诊断全文件、验证 dist 导出
- **Done 条件**: 无新错误、导出完整
- **证据**: artifact-probe + regression-probe 发现

## Product Promise or Capability Promise

plugin 的 TypeScript 源码必须能通过类型检查，且运行时行为保持不变。

## Quality Bar Above Minimum

- 修复方案应消除循环依赖模式（src 不应 import dist）
- 如果有 build script 缺失，应补充但不引入新工具链

## Key Risks

1. `dist/index.js` 和 `src/index.ts` 内容不一致——修复后可能导致运行时行为变化
2. 如果 `dist/index.js` 实际就是 `src/index.ts` 的编译产物，则需要先确立正确的构建流程
3. `tsconfig.json` 的 `moduleResolution: "bundler"` 可能影响 `.js` 文件的类型解析

## Open Questions

1. `dist/index.js` 是手动维护的还是从某个源编译的？（从内容看像是完整的独立实现）
2. 项目是否需要添加 `tsc` build script 到 `package.json`？

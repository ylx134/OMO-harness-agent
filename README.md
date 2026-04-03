# OMO Harness Skills

OpenCode + OMO 增强版长任务技能架构。

## 与 codex-harness-skills 的关系

这是 codex-harness-skills 的 OMO 增强版本，核心改动：

| 维度 | Codex 版本 | OMO 版本 |
|------|-----------|----------|
| 代理调度 | `spawn_agent` + `wait_agent` (阻塞) | `task(category=..., run_in_background=true)` (异步) |
| 模型路由 | 单一模型 | Category 自动匹配最优模型 |
| 行为控制 | Prompt 建议 | Hook 平台强制 |
| 状态管理 | 纯 Markdown | Markdown + JSON 索引层 |
| 上下文压缩 | 无保护 | 自动注入关键状态 |
| 文件结构 | 单文件 466 行 | 模块化拆分 |

## 架构

```
omo-harness-skills/
├── control/                    # 主编排技能
│   ├── skill.md                # 精简版编排逻辑 (~120 行)
│   ├── config/                 # 结构化配置
│   │   ├── routing-table.json  # 路由规则表
│   │   ├── task-types.json     # 任务类型定义
│   │   ├── flow-tiers.json     # 流程层级配置
│   │   └── error-handling.json # 错误处理策略
│   ├── agents/                 # Agent Prompt 模板
│   │   ├── planner.md          # 规划代理
│   │   ├── executor.md         # 执行代理
│   │   └── checker.md          # 验收代理
│   └── references/             # 参考文档
│       ├── routing-contract.md
│       └── simplification-principles.md
├── drive/                      # 执行技能 (+ OMO 并行规则)
├── check/                      # 验收技能 (+ OMO 验证集成)
├── plan/                       # 规划技能 (+ OMO 集成规则)
├── memory/                     # 状态管理 (+ JSON 索引层)
│   ├── templates/              # 状态文件模板
│   ├── scripts/                # Helper 脚本
│   └── references/             # 文件契约
├── feature-planner/            # 产品规划技能
├── capability-planner/         # 能力规划技能
├── hooks/                      # Custom Hook implementations
│   └── evidence-verifier.js    # 证据验证 (no builtin equivalent)
├── oh-my-opencode.json         # OMO 配置
└── README.md
```

## 核心设计原则

### 跨平台优先
技能内部不绑定平台，通过 Category 抽象接入平台能力：

```
技能层（跨平台）: task(category="deep", load_skills=["drive"])
                    ↓
OMO 平台层:        category="deep" → claude-opus-4-6 (带 fallback)
Codex 平台层:      category="deep" → gpt-5.4 (单一模型)
```

### Markdown 为主，JSON 为辅
- LLM 友好的 markdown 文件保留为人类可读
- 新增 `state-index.json` 作为机器可读索引层
- Hooks 和脚本通过 JSON 索引快速判断状态

### 平台强制替代 Prompt 建议
- Codex 时代：靠"说好话"让模型遵守规则
- OMO 时代：通过 48 个内置 Hooks 强制执行（压缩保护、错误恢复、模型 fallback 等）
- 自定义 Hook 仅用于领域特定逻辑（如 evidence-verifier.js）

## 安装

推荐方式：软链接到 OMO 技能目录

```bash
ln -s /Users/tianyuan/Documents/my_workspace/omo-harness-skills/control ~/.config/opencode/skills/control
ln -s /Users/tianyuan/Documents/my_workspace/omo-harness-skills/drive ~/.config/opencode/skills/drive
ln -s /Users/tianyuan/Documents/my_workspace/omo-harness-skills/check ~/.config/opencode/skills/check
ln -s /Users/tianyuan/Documents/my_workspace/omo-harness-skills/plan ~/.config/opencode/skills/plan
ln -s /Users/tianyuan/Documents/my_workspace/omo-harness-skills/memory ~/.config/opencode/skills/memory
ln -s /Users/tianyuan/Documents/my_workspace/omo-harness-skills/feature-planner ~/.config/opencode/skills/feature-planner
ln -s /Users/tianyuan/Documents/my_workspace/omo-harness-skills/capability-planner ~/.config/opencode/skills/capability-planner
```

## 路由表

| 任务类型 | Category | 技能栈 | 流程 |
|----------|----------|--------|------|
| 判断型 | quick | check | 轻流程 |
| 修复型 | deep | drive → check | 中流程 |
| 改造型 | deep | plan? → drive → check | 中流程 |
| 能力型 | ultrabrain | capability-planner → plan → drive → check | 中流程 |
| 产品型 | visual-engineering | feature-planner → plan → drive → check | 重流程 |

## 实施阶段

- [x] **Phase 0**: 技能内部结构重组（跨平台通用）
- [x] **Phase 1**: OMO 基础迁移（task() 替代 spawn_agent）
- [x] **Phase 2**: Hook 集成（48 builtin hooks active, 自定义冗余已移除）
- [ ] **Phase 3**: 高级优化（动态质量门禁、自动错误恢复）
- [ ] **Phase 4**: 验证与迭代

### Platform-Enforced Behavior (via OMO Built-in Hooks)
- **48 built-in hooks active** — context monitoring, compaction protection, error recovery, model fallback, etc.
- **1 custom hook retained** — `evidence-verifier.js` (domain-specific acceptance validation)
- **2 custom hooks removed** — `compaction-protector.js` and `auto-state-writeback.js` (replaced by builtins)

详细路线图见 `.sisyphus/plans/omo-optimization-plan.md`

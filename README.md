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
│   ├── skill.md                # 精简版编排逻辑 (~200 行)
│   ├── config/                 # 结构化配置
│   │   ├── routing-table.json  # 路由规则表
│   │   ├── task-types.json     # 任务类型定义
│   │   ├── flow-tiers.json     # 流程层级配置
│   │   ├── error-handling.json # 错误处理策略 + 自动恢复流程
│   │   └── coordination-rules.md # 多代理协调规则
│   ├── agents/                 # Agent Prompt 模板
│   │   ├── planner.md          # 规划代理
│   │   ├── executor.md         # 执行代理
│   │   └── checker.md          # 验收代理
│   └── references/             # 参考文档
│       ├── routing-contract.md
│       ├── simplification-principles.md
│       ├── harness-eval-framework.md  # 评估框架
│       └── model-upgrade-checklist.md # 模型升级检查清单
├── drive/                      # 执行技能 (+ OMO 并行规则)
├── check/                      # 验收技能 (+ OMO 验证集成)
├── plan/                       # 规划技能 (+ OMO 集成规则)
├── memory/                     # 状态管理 (+ JSON 索引层)
│   ├── templates/              # 状态文件模板 (+ metrics 模板)
│   ├── scripts/                # Helper 脚本 (+ context_reset.sh)
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

## 使用指南

### 三种模式选择

| 场景 | 用什么 | 原因 |
|------|--------|------|
| 改 bug / 单行修改 / 纯问答 | 直接跟 Sisyphus 说 | 无编排开销，最快 |
| 复杂分析 / 重构 / 深度研究 | `ulw` | 强制深度思考 + 严格验证 |
| 新功能 / 产品构建 / 长期项目 | `/control` | 规划→执行→验收完整流程 |

### Control 内置自动决策

Control 内置了 **Task Router Gate**，会自动判断任务是否值得使用 harness：
- 任务太简单 → Control 委托给 Sisyphus 直接执行
- 任务适合 harness → Control 启动完整流程

所以**不确定时用 `/control` 是安全选择**——Control 会自己决定要不要用 harness。

详见 `control/references/decision-tree.md`。

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
- [x] **Phase 3**: 高级优化（动态质量门禁、自动错误恢复、多代理协调、性能监控）
- [x] **Phase 4**: 验证与迭代（评估框架、简化检查清单）

### Platform-Enforced Behavior (via OMO Built-in Hooks)
- **48 built-in hooks active** — context monitoring, compaction protection, error recovery, model fallback, etc.
- **1 custom hook retained** — `evidence-verifier.js` (domain-specific acceptance validation)
- **2 custom hooks removed** — `compaction-protector.js` and `auto-state-writeback.js` (replaced by builtins)

### Phase 3 新增能力
- **动态质量门禁**: quality-guardrails.md 随项目历史自动收紧/放宽阈值
- **自动错误恢复**: 5 种 executor 失败场景 + 4 种 checker 失败场景的自动恢复流程
- **多代理协调**: 文件所有权模型、状态机、死锁预防
- **性能监控**: metrics.json 模板 + activity.jsonl 增强

### Phase 4 新增能力
- **评估框架**: harness-eval-framework.md — 对比 harness vs solo 模式的系统性方法
- **简化检查清单**: model-upgrade-checklist.md — 每次模型升级时评估哪些组件可以移除

详细路线图见 `.sisyphus/plans/omo-optimization-plan.md`

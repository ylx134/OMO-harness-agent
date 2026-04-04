# OMO Harness Skills

OpenCode + OMO 增强版长任务技能架构。基于 Anthropic 的 [Harness Design](https://www.anthropic.com/engineering/harness-design-long-running-apps) 理念，将 AI 编程从"单代理对话"升级为"多代理工程化流程"。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![OpenCode](https://img.shields.io/badge/OpenCode-Compatible-green.svg)](https://github.com/opencode-ai/opencode)
[![OMO](https://img.shields.io/badge/OMO-Enhanced-purple.svg)](https://github.com/anthropics/oh-my-opencode)

## 特性

- **三代理分工**: 规划 → 执行 → 验收，独立角色，互不干扰
- **Sprint Contract 协商**: 编码前与验收代理对齐标准，避免返工
- **4 维度质量评分**: 产品深度 / 功能完整性 / 视觉设计 / 代码质量
- **动态质量门禁**: 验收失败自动收紧标准，持续通过可放松
- **自动错误恢复**: 12 种失败场景的自动检测与恢复流程
- **状态持久化**: `.agent-memory/` 文件系统支持跨会话恢复
- **跨平台兼容**: 通过 Category 抽象接入，Codex 和 OMO 通用
- **48 个内置 Hooks**: 利用 OMO 平台级强制能力（压缩保护、错误恢复、模型 fallback 等）

## 架构

```
omo-harness-skills/
├── control/                    # 主编排技能
│   ├── skill.md                # 编排逻辑 + Task Router Gate
│   ├── config/                 # 结构化配置
│   │   ├── routing-table.json  # 路由规则表
│   │   ├── task-types.json     # 任务类型定义
│   │   ├── flow-tiers.json     # 流程层级配置
│   │   ├── error-handling.json # 错误处理 + 自动恢复
│   │   └── coordination-rules.md # 多代理协调
│   ├── agents/                 # Agent Prompt 模板
│   │   ├── planner.md          # 规划代理
│   │   ├── executor.md         # 执行代理
│   │   └── checker.md          # 验收代理
│   └── references/             # 参考文档
├── drive/                      # 执行技能
├── check/                      # 验收技能
├── plan/                       # 规划技能
├── memory/                     # 状态管理
│   ├── templates/              # 20+ 状态文件模板
│   ├── scripts/                # 9 个 Helper 脚本
│   └── references/             # 文件契约
├── feature-planner/            # 产品规划
├── capability-planner/         # 能力规划
├── hooks/                      # 自定义 Hook
├── setup.sh                    # 一键安装
├── uninstall.sh                # 一键卸载
└── oh-my-opencode.json         # OMO 配置
```

## 快速开始

### 安装

```bash
git clone git@github.com:ylx134/OMO-harness-agent.git
cd OMO-harness-agent
./setup.sh
```

`setup.sh` 会自动：
1. 将 7 个技能目录软链接到 `~/.config/opencode/skills/`
2. 合并 `oh-my-opencode.json` 配置（追加不覆盖）

### 卸载

```bash
./uninstall.sh
```

`uninstall.sh` 会自动：
1. 移除所有技能软链接
2. 清理本技能添加的配置项（保留你自己的配置）

### 使用

```
# 新功能开发 / 产品构建 / 长期项目
/control 帮我做一个音乐编辑器，支持音频导入、波形显示、剪辑、导出

# 复杂分析 / 重构 / 深度研究
ulw 帮我重构 auth 模块，确保不影响现有功能

# 简单修改 / 问答 / 单行改动
直接跟 Sisyphus 说即可
```

## 三种模式对比

| 维度 | Sisyphus（默认） | ulw | /control |
|------|------------------|-----|----------|
| 代理数量 | 1 | 1 + subagent | 3（planner/executor/checker） |
| 探索阶段 | 无 | explore/librarian | explore/librarian |
| 规划阶段 | 脑中规划 | 并行任务图（wave） | 独立 planner 代理 |
| 验收阶段 | 自己验证 | 严格验证（必须 QA） | 独立 checker 代理 |
| 状态持久化 | 无 | 无 | `.agent-memory/` |
| 中断恢复 | 无 | 无 | handoff.md + git |
| 质量门禁 | 无 | 固定 | 动态调整 |
| 适用文件大小 | 1-2 | 2-5 | 5+ |

### 何时用哪种模式

| 场景 | 推荐 | 原因 |
|------|------|------|
| 改 bug / 单行修改 | Sisyphus | 无编排开销 |
| 纯问答 / 解释 | Sisyphus | 不需要流程 |
| 重构模块 / 深度分析 | ulw | 需要探索 + 严格验证 |
| 新功能开发 | /control | 需要规划 + 独立验收 |
| 从零做产品 | /control | 需要 feature 拆解 + Auto-Pilot |
| 长期项目 | /control | 需要状态持久化 + 中断恢复 |

**不确定时用 `/control`** — Control 内置 Task Router Gate，会自动判断是否需要启动完整流程。

## 路由表

| 任务类型 | Category | 技能栈 | 流程 |
|----------|----------|--------|------|
| 判断型 | quick | check | 轻流程 |
| 修复型 | deep | drive → check | 中流程 |
| 改造型 | deep | plan? → drive → check | 中流程 |
| 能力型 | ultrabrain | capability-planner → plan → drive → check | 中流程 |
| 产品型 | visual-engineering | feature-planner → plan → drive → check | 重流程 |

## 核心设计原则

### 跨平台优先
技能内部不绑定平台，通过 Category 抽象接入：
```
技能层: task(category="deep", load_skills=["drive"])
  ↓
OMO:   category="deep" → claude-opus-4-6 (带 fallback)
Codex: category="deep" → gpt-5.4 (单一模型)
```

### 平台强制替代 Prompt 建议
- 48 个 OMO 内置 Hooks 提供平台级强制（压缩保护、错误恢复、模型 fallback）
- 自定义 Hook 仅用于领域特定逻辑（如 `evidence-verifier.js`）

### Markdown 为主，JSON 为辅
- LLM 友好的 markdown 文件保留为人类可读
- `state-index.json` 作为机器可读索引层供 Hooks 快速读取

## 实施阶段

- [x] **Phase 0**: 技能内部结构重组（跨平台通用）
- [x] **Phase 1**: OMO 基础迁移（task() 替代 spawn_agent）
- [x] **Phase 2**: Hook 集成（48 builtin hooks active, 自定义冗余已移除）
- [x] **Phase 3**: 高级优化（动态质量门禁、自动错误恢复、多代理协调、性能监控）
- [x] **Phase 4**: 验证与迭代（评估框架、简化检查清单）

## 设计灵感

本项目基于 Anthropic 工程博客的两篇文章：
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Harness design for long-running apps](https://www.anthropic.com/engineering/harness-design-long-running-apps)

核心改进：
- 独立验收代理（Generator / Evaluator 分离）
- Sprint Contract 协商机制
- Evaluator 校准循环
- 上下文焦虑检测
- 动态质量门禁

## License

MIT

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

## 前置要求

- [OpenCode](https://github.com/opencode-ai/opencode) — 终端 AI 编程工具
- [OhMyOpenCode (OMO)](https://github.com/anthropics/oh-my-opencode) — OpenCode 增强框架
- Node.js ≥ 18（OMO 运行环境）
- Bash + Python3（安装脚本依赖）

## 快速开始

### 安装

#### 方式一：一键安装（推荐）

```bash
git clone git@github.com:ylx134/OMO-harness-agent.git
cd OMO-harness-agent
./setup.sh
```

`setup.sh` 会自动：
1. 将 7 个技能目录软链接到 `~/.config/opencode/skills/`
2. 合并 `oh-my-opencode.json` 配置（追加不覆盖）

#### 方式二：手动安装

```bash
# 1. 克隆仓库
git clone git@github.com:ylx134/OMO-harness-agent.git
cd OMO-harness-agent

# 2. 创建技能链接
SKILLS_DIR="$HOME/.config/opencode/skills"
mkdir -p "$SKILLS_DIR"
for skill in control drive check plan memory feature-planner capability-planner; do
  ln -sf "$(pwd)/$skill" "$SKILLS_DIR/$skill"
done

# 3. 合并配置（追加 categories，不覆盖已有配置）
python3 -c "
import json
config_path = '$HOME/.config/opencode/oh-my-opencode.json'
new_path = './oh-my-opencode.json'
config = json.load(open(config_path)) if __import__('os').path.exists(config_path) else {}
new_cfg = json.load(open(new_path))
config.setdefault('categories', {}).update(new_cfg.get('categories', {}))
config['model_fallback'] = new_cfg.get('model_fallback', True)
config.setdefault('experimental', {}).update(new_cfg.get('experimental', {}))
json.dump(config, open(config_path, 'w'), indent=2)
"
```

### 卸载

```bash
./uninstall.sh
```

### 使用

```
# 新功能开发 / 产品构建 / 长期项目
/control 帮我做一个音乐编辑器，支持音频导入、波形显示、剪辑、导出

# 复杂分析 / 重构 / 深度研究
ulw 帮我重构 auth 模块，确保不影响现有功能

# 简单修改 / 问答 / 单行改动
直接跟 Sisyphus 说即可
```

## Auto-Pilot 工作流

```
用户请求
  │
  ▼
┌─────────────────────────────────────────┐
│  Task Router Gate                       │
│  判断：简单 → Sisyphus 直接执行          │
│        复杂 → 启动完整 Harness 流程      │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Phase 1: 规划                           │
│  Prometheus / Planner 产出：             │
│  - product-spec.md                      │
│  - features.json (功能列表)              │
│  - task.md (完成标准)                    │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Phase 2: Auto-Pilot 循环               │
│                                         │
│  for each feature in features.json:     │
│    1. Executor 起草 Sprint Contract     │
│    2. Checker 审查合同 ←→ 协商          │
│    3. Executor 执行（合同批准后）        │
│    4. Executor 自我评估                 │
│    5. Checker 独立验收                  │
│       - 4 维度评分                      │
│       - calibration 校准                │
│       - evidence 验证                   │
│    6. accepted → 下一个 feature         │
│       rejected → 重试（最多 3 次）      │
│       blocked → 标记，继续下一个        │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Phase 3: 最终验收                       │
│  - 全产品 4 维度评分                     │
│  - 生成验收报告                          │
│  - 通过 → 完成                           │
│  - 不通过 → 列出待改进项                 │
└─────────────────────────────────────────┘
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

## 状态文件说明

`.agent-memory/` 是 Harness 的状态存储目录，每个文件有明确职责：

| 文件 | 作用 | 写入者 |
|------|------|--------|
| `task.md` | 全局任务目标和完成标准 | Planner |
| `features.json` | 功能列表（不可变合同） | Feature-Planner |
| `working-memory.md` | 当前阶段执行状态 | Control |
| `round-contract.md` | 当前轮次的执行合同 | Executor |
| `execution-status.md` | 进度面板 | Executor |
| `evidence-ledger.md` | 证据映射表 | Executor |
| `acceptance-report.md` | 验收决策 | Checker |
| `quality-guardrails.md` | 动态质量规则 | Checker |
| `orchestration-status.md` | 路由状态和代理信息 | Control |
| `state-index.json` | 机器可读索引（供 Hooks 读取） | Control |
| `activity.jsonl` | 事件日志（追加写入） | All |
| `handoff.md` | 跨会话交接文档 | Control |
| `inbox/` | 新请求队列 | Control |

## 配置参考

### 自定义模型

编辑 `~/.config/opencode/oh-my-opencode.json` 中的 `categories`：

```json
{
  "categories": {
    "deep": {
      "description": "Planning and complex execution tasks",
      "model": "your-model-name"
    },
    "quick": {
      "description": "Acceptance checks and lightweight verification",
      "model": "your-fast-model-name"
    },
    "ultrabrain": {
      "description": "Capability planning requiring deep reasoning",
      "model": "your-reasoning-model-name",
      "reasoningEffort": "xhigh"
    }
  }
}
```

不填 `model` 字段时，OMO 会使用 OpenCode 默认配置的模型。

### 调整质量阈值

编辑 `check/references/scoring-framework.md` 中的硬阈值：

| 维度 | 默认阈值 | 建议调整场景 |
|------|---------|-------------|
| 产品深度 | ≥7/10 | 产品型任务可提高到 ≥8 |
| 功能完整性 | ≥8/10 | 核心功能可提高到 ≥9 |
| 视觉设计 | ≥6/10 | UI 密集型可提高到 ≥7 |
| 代码质量 | ≥7/10 | 基础设施可提高到 ≥8 |

### 调整错误恢复策略

编辑 `control/config/error-handling.json`：

```json
{
  "agent_failures": {
    "executor": {
      "max_retries": 2,
      "failure_conditions": [...]
    }
  }
}
```

## 常见问题 (FAQ)

### Q: 安装脚本安全吗？做了什么？

`setup.sh` 只做两件事：
1. 创建软链接（不复制文件，不修改源码）
2. 合并 JSON 配置（追加不覆盖，不删除已有配置）

你可以先 `cat setup.sh` 审查后再运行。

### Q: 和 OMO 自带的 agent 有什么区别？

OMO 提供通用的 agent 系统（Sisyphus、Prometheus、Hephaestus 等），而 Harness 是在此之上构建的**工程化流程**——它定义了什么时候用哪个 agent、怎么协调、怎么验收、怎么恢复。可以理解为 OMO 是"工具"，Harness 是"流水线"。

### Q: 可以在 Codex 上使用吗？

可以。所有技能文件（`.md`）都是跨平台设计的。`oh-my-opencode.json` 和 Hooks 是 OMO 特有的，在 Codex 上忽略即可。

### Q: Auto-Pilot 中途断了怎么办？

所有状态都持久化在 `.agent-memory/` 中。重新运行 `/control 继续这个项目`，Control 会读取 `orchestration-status.md` 和 `features.json`，从上次中断的地方继续。

### Q: 怎么自定义验收标准？

在 `features.json` 中为每个功能定义 `verification_method` 和 `verification_steps`。Checker 会严格按照这些标准进行验收。

### Q: 如何贡献代码？

欢迎提交 Issue 和 Pull Request！详见下方的 Contributing 部分。

## Contributing

欢迎贡献！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-skill`)
3. 提交更改 (`git commit -m 'Add amazing skill'`)
4. 推送到分支 (`git push origin feature/amazing-skill`)
5. 提交 Pull Request

### 开发规范

- 新增技能：参考现有技能的结构（`SKILL.md` + `references/` + `templates/`）
- 修改配置：确保向后兼容，不破坏已有用户的配置
- 提交信息：使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式

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

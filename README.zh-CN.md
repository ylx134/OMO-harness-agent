# OMO Harness Agent

[English](README.md) | [中文](README.zh-CN.md)

OMO Harness Agent 将 OpenCode 从"一个 prompt 一个响应"的工作流转变为受控的、路线驱动的运行时。不再是让一个通用 agent 包揽一切，而是提供了一整套控制面：任务接入、规划、执行、验收、以及可观测的运行时状态。

## 你能得到什么

- 一个 Harness 插件，拦截 `/control`、`/plan`、`/drive`、`/check` 命令
- 分层 managed-agents 架构：大脑 → 管理者 → 执行手 → 探针
- 持久化的 `.agent-memory/` 状态和路线产物
- 图驱动的任务推进：有界并发、锁、信号、基于交付物的闭环门控
- 清晰的模式隔离：`opencode` 启动 OMO，`harness` 启动 harness 插件

---

## 快速开始

**前置条件：** 已安装 [OpenCode](https://opencode.ai)，Node.js 18+。

### 1. 安装

```bash
git clone git@github.com:ylx134/OMO-harness-agent.git
cd OMO-harness-agent
./setup.sh
```

只需这一条命令。`setup.sh` 会自动构建插件、创建隔离的 harness 配置目录、链接所有 skills/hooks/agents、安装 `harness` 启动器和 `hctl` 命令行工具。

### 2. 启动 harness 模式

```bash
harness .
```

这会启动 OpenCode 并只加载 harness 插件。OMO 保持独立——用普通的 `opencode` 命令即可进入 Sisyphus 模式。

### 3. 执行路线

```text
/control 修复构建报错并补上回归验证
```

插件会拦截命令，将任务分类到合适的路线，写入持久化状态到 `.agent-memory/`，然后按顺序调度管理者 → 执行手 → 探针。

### 4. 观察运行时

```bash
# 在另一个终端
hctl status      # 路线、阶段、活跃 actor
hctl blockers    # 阻塞项
hctl summary     # 一行摘要
```

---

## 双模式，清晰隔离

| 命令 | 加载内容 | 使用场景 |
|------|---------|---------|
| `opencode` | OMO（`oh-my-openagent`） | 日常 Sisyphus 工作流 |
| `harness` | 仅 Harness 插件 | 受控的路线驱动任务 |

`harness` 底层通过 `XDG_CONFIG_HOME` 指向独立的配置目录，两种模式完全互不干扰。

---

## 架构

```
L1 大脑:    harness-orchestrator
  ├─ L2 管理者:  feature-planner, capability-planner, planning-manager,
  │              execution-manager, acceptance-manager
  ├─ L3 执行手:  code-agent, shell-agent, browser-agent, docs-agent, evidence-agent
  └─ L4 探针:    ui-probe, api-probe, regression-probe, artifact-probe

插件   = 控制面（调度、phase 门控、状态机）
技能   = 行为模块
钩子   = 底层强制约束（文件所有权、schema 校验、证据要求）
Agent  = 运行时角色
状态   = .agent-memory/（持久化、可重放）
```

### 命令生命周期

```
/control  →  任务接入、路线分类、状态写入
/plan     →  规划阶段管理者
/drive    →  执行管理者、然后调度执行手（有界并发）
/check    →  验收管理者、然后调度探针、最后闭环
```

---

## 路线家族

| 路线 | 使用场景 | 管理者栈 |
|------|---------|---------|
| `F-M1` | 修复已损坏的东西 | planning → execution → acceptance |
| `C-M1` | 有界内部变更或重构 | planning → execution → acceptance |
| `A-M1` | 更深层的能力升级 | capability-planner → planning → execution → acceptance |
| `P-H1` | 产品级功能构建 | feature-planner → planning → execution → acceptance |

---

## 运行时安全护栏

运行时自动执行结构完整性检查：

| 护栏 | 作用 |
|------|------|
| **Schema 校验** | `routing-table.json`、`features.json`、`state-index.json` 在每次写入时根据 JSON Schema 校验——杜绝静默损坏 |
| **Phase-actor 授权** | 每个 `.agent-memory/` 文件有注册的写入者。错误的 actor 写入会在插件层被阻断，而非靠约定遵守 |
| **管理者/手/探针边界** | 每轮执行必须有执行手参与；每次验收必须有探针参与；管理者不可跳过角色分离 |
| **证据要求** | 验收报告必须引用探针产生的证据，不可凭空断言 |
| **摘要优先监督** | 大脑/管理者读取原始详情文件时会收到警告，防止上下文膨胀和角色边界侵蚀 |

---

## 可观测性

```bash
hctl status              # 路线、phase、活跃 actor、图锁、信号
hctl blockers            # 阻塞步骤、待调度项、质量护栏
hctl trace               # activity.jsonl 事件时间线（彩色编码）
hctl trace --round 3     # 按轮次过滤
hctl events --last 20    # 原始事件输出
hctl summary             # 一行 shell 提示符
```

排查问题时按以下顺序检查：

1. `hctl status`
2. `.agent-memory/harness-plugin-state.json`
3. `.agent-memory/orchestration-status.md`
4. `.agent-memory/harness-plugin-debug.log`

---

## 完成语义

一条路线被判定为完成，必须同时满足：

- `currentPhase` 为 `complete`
- `nextExpectedActor` 为 `none`
- 图中没有残留的活跃或必须的终端工作
- 所有必需的交付物存在（占位脚手架不算）
- 至少有一个执行手和一个探针参与

交付物缺失时，闭环节点会被阻塞——harness 永远不会静默地假装工作已完成。

---

## 仓库结构

```text
omo-harness-skills/
├── control/                     # 路线选择、语义锁定、编排
├── plan/                        # planning-manager 技能
├── drive/                       # execution-manager 技能
├── check/                       # acceptance-manager 技能
├── feature-planner/             # 产品规格 + 功能列表
├── capability-planner/          # 基线 + 差距分析
├── browser-agent/ code-agent/ shell-agent/ docs-agent/ evidence-agent/
├── ui-probe-agent/ api-probe-agent/ regression-probe-agent/ artifact-probe-agent/
├── hooks/                       # 强制约束层
│   ├── schema-guard.js          # 状态文件 Schema 校验
│   ├── phase-guard.ts           # phase-actor 文件写入授权
│   ├── summary-supervision-guard.js  # 摘要优先监督告警
│   ├── schemas/                 # JSON Schema 定义
│   └── ...
├── plugin/                      # 运行时控制面（TypeScript）
│   ├── src/dispatch/            # 授权、完成、恢复、调度
│   ├── src/routing/             # 路线表、图编译
│   ├── src/state/               # 存储、迁移、投影
│   ├── src/observability/       # 状态投影
│   └── tests/                   # 94 个测试（单元 + E2E）
├── memory/                      # 持久化状态模板和脚本
├── scripts/
│   ├── harness                  # 可观测性 CLI（hctl）
│   └── harness-launcher         # harness 模式启动器
├── agents/                      # agent prompt 定义
├── docs/                        # 架构和迁移文档
├── setup.sh                     # 安装
└── uninstall.sh                 # 清理卸载
```

---

## 卸载

```bash
./uninstall.sh
```

移除所有 symlink 的技能、钩子、agent 文件，并恢复配置快照。

---

## 测试

```bash
npm --prefix plugin test
```

94 个测试覆盖单元调度逻辑、E2E 路线生命周期、并发控制和状态完整性。

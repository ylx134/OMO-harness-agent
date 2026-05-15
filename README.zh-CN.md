# OMO Harness Agent

[English](README.md) | [中文](README.zh-CN.md)

OMO Harness Agent 将 OpenCode 从"一个 prompt 一个响应"的工作流转变为受控的、路线驱动的运行时。不再是让一个通用 agent 包揽一切，而是提供了一整套控制面：任务接入、规划、执行、验收、以及可观测的运行时状态。

## 你能得到什么

- 一个 Harness 插件，拦截 `/control`、`/plan`、`/drive`、`/check` 命令
- 分层 managed-agents 架构：大脑 → 管理者 → 执行手 → 探针
- 持久化的 `.agent-memory/` 状态和路线产物
- 图驱动的任务推进：有界并发、锁、信号、基于交付物的闭环门控
- **任务面板**与 git worktree 隔离——多个任务独立运行，状态互不污染
- **凭据边界**与**沙箱系统**——密钥自动脱敏，文件操作路径隔离
- **会话恢复**——从事件日志重建状态，断电不丢数据
- **模拟模式**——无需启动真实子 agent 即可跑完整路线生命周期
- **MCP 服务器**——JSON-RPC stdio 工具，支持外部编排
- **规划接收门**——`/control` 时自动检测风险并打分
- **延续策略**——细粒度的自主执行控制
- **审查代理**——验收前独立质量把关
- **诊断脚本**——90+ 项安装健康检查
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

插件会拦截命令，将任务分类到合适的路线，自动检测风险，写入持久化状态到 `.agent-memory/`，然后按顺序调度管理者 → 执行手 → 探针。

### 4. 观察运行时

```bash
# 在另一个终端
hctl status              # 路线、阶段、活跃 actor
hctl blockers            # 阻塞项
hctl summary             # 一行摘要
```

### 5. 健康检查

```bash
./scripts/doctor.sh      # 90+ 项检查：路径、软链接、运行时、CLI、Git
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
  ├─ L3 执行手:  code-agent, shell-agent, browser-agent, docs-agent,
  │              evidence-agent, review-agent
  └─ L4 探针:    ui-probe, api-probe, regression-probe, artifact-probe

插件   = 控制面（调度、phase 门控、状态机）
技能   = 行为模块
钩子   = 底层强制约束（文件所有权、schema 校验、证据要求、凭据脱敏、输出过滤）
Agent  = 运行时角色
状态   = .agent-memory/（持久化、可重放、支持会话恢复）
```

### 命令生命周期

```
/control  →  任务接入、路线分类、风险检测、语义锁定、状态写入
/plan     →  规划阶段管理者
/drive    →  执行管理者、然后调度执行手（有界并发）
/check    →  验收管理者、然后调度探针、最后闭环
```

---

## 路线家族

| 路线 | 使用场景 | 管理者栈 | 沙箱 |
|------|---------|---------|------|
| `J-L1` | 审查、对比、解释 | planning → execution → acceptance | — |
| `F-M1` | 修复已损坏的东西 | planning → execution → acceptance | — |
| `C-M1` | 有界内部变更或重构 | planning → execution → acceptance | ✅ |
| `A-M1` | 更深层的能力升级 | capability-planner → planning → execution → acceptance | ✅ |
| `P-H1` | 产品级功能构建 | feature-planner → planning → execution → acceptance | — |

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
| **沙箱隔离** | C-M1 和 A-M1 路线启用路径隔离——文件操作无法逃逸沙箱根目录 |
| **凭据脱敏** | API 密钥、Token、密码自动从工具输出和事件日志中脱敏 |
| **输出契约** | Agent 输出自动过滤内部编排细节，确保用户看到的是业务结论而非技术细节 |

---

## 可观测性

```bash
hctl check               # 插件是否已加载？
hctl status              # 路线、阶段、活跃 actor
hctl blockers            # 阻塞项
hctl summary             # 一行摘要

# 任务面板
hctl task-create "标题"  # 创建隔离任务（含 git worktree）
hctl task-list           # 列出所有未归档任务
hctl task-resume <id>    # 恢复暂停的任务
hctl task-archive <id>   # 归档已完成任务

# 执行器
hctl start <task>        # 初始化路线并执行
hctl step                # 前进一步调度
hctl wake                # 恢复崩溃的会话
hctl inspect <file>      # 格式化输出状态文件
hctl timeline            # actor + 工具时间线

# 事件
hctl events --last N     # 最近 N 条原始事件
hctl trace --round N     # 指定轮次的事件时间线
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
├── review-agent/                # 独立验收前审查
├── browser-agent/ code-agent/ shell-agent/ docs-agent/ evidence-agent/
├── ui-probe-agent/ api-probe-agent/ regression-probe-agent/ artifact-probe-agent/
├── hooks/                       # 强制约束层（11 个文件）
│   ├── schema-guard.js          # 状态文件 Schema 校验
│   ├── evidence-verifier.js     # 证据文件引用校验
│   ├── features-json-guard.js   # features.json 不可变性强制
│   ├── manager-boundary-guard.js # 阻止管理者覆盖详情文件
│   ├── probe-evidence-guard.js  # 要求探针产生证据
│   ├── summary-supervision-guard.js  # 摘要优先监督告警
│   ├── summary-sync-guard.js    # 强制摘要层先于管理者写入
│   ├── managed-route-completeness-guard.js  # 阻断不完整验收
│   ├── output-contract-guard.js # 过滤用户输出中的内部术语
│   └── schemas/                 # 3 个 JSON Schema 定义
├── plugin/                      # 运行时控制面（TypeScript，288 个测试）
│   ├── src/dispatch/            # 授权、完成、恢复、调度、凭据边界、沙箱
│   ├── src/routing/             # 路线表、图编译
│   ├── src/state/               # 存储、迁移、会话存储、任务面板
│   ├── src/observability/       # 状态投影
│   ├── src/intake/              # 规划接收门（风险检测）
│   ├── src/mcp/                 # MCP JSON-RPC 服务器 + 工具
│   ├── src/security/            # 沙箱系统
│   ├── src/session/             # 崩溃恢复（wake）
│   ├── src/testing/             # 模拟 agent 适配器
│   └── tests/                   # 60 个测试文件，288 个测试
├── memory/                      # 持久化状态模板和脚本
├── scripts/
│   ├── harness                  # 可观测性 + 执行器 CLI（hctl）
│   ├── harness-launcher         # harness 模式启动器
│   └── doctor.sh                # 90+ 项安装健康检查
├── agents/                      # 7 个 agent prompt 定义
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

288 个测试覆盖单元调度逻辑、E2E 路线生命周期、并发控制、状态完整性、任务面板、凭据边界、沙箱、会话存储、恢复、模拟模式、MCP 传输、规划接收门和延续策略。

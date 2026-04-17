# AGENT.md

## 目的

这个文件是本仓库的顶层操作入口。

它不重复 README，也不替代各层 SKILL 和细化设计文档。它只回答一个问题：**在这个 repo 里，managed agents 应该怎么分层、怎么交接、怎么诚实地完成或阻塞任务。**

本仓库吸收了「brain 和 hands 解耦」这条设计思路，但落地 vocabulary 以本 repo 为准。

## 概念映射

把外部文章里的抽象概念，映射成这里已经存在的角色：

- `brain` → `control`，也就是 L1 orchestrator / `harness-orchestrator`
- `managers` → `plan` / `drive` / `check`，必要时加 `feature-planner` / `capability-planner`
- `hands` → L3 capability agents，例如 `code-agent`、`shell-agent`、`browser-agent`、`docs-agent`、`evidence-agent`
- `probes` → L4 verification hands，例如 `ui-probe-agent`、`api-probe-agent`、`regression-probe-agent`、`artifact-probe-agent`
- `session` → OpenCode + OMO 的运行会话，真正可持续的状态落在 `.agent-memory/`，而不是某一轮对话上下文

这里的关键不是“多几个 agent”，而是**把 route 选择、合同写作、执行、取证、裁决拆成稳定边界**。

## 稳定接口原则

架构已经升级为 layered managed-agents harness，但对外稳定接口不变：

- 入口仍然是 `/control`、`/plan`、`/drive`、`/check`
- 调度仍然基于 OMO 的 `task()`、categories、hooks、background tasks
- durable state 仍然写入 `.agent-memory/`

也就是说，这次变化是**职责重解释**，不是把现有入口全部推翻重命名。

## Summary-first 状态原则

本仓库默认用 summary 驱动上层，不用原始细节淹没 brain。

- `control` 主要读 route summary、planning summary、execution summary、acceptance summary、blocker summary
- managers 写 contract、summary、decision，并维护明确 handoff
- hands / probes 产出细节证据，例如命令输出、截图、API traces、artifact findings

`.agent-memory/` 是 durable state，不是随手堆日志的目录。上层看摘要，下层保留细节，必要时再向下钻取。这里的 summary / evidence / probe 边界也不是纯约定，仓库默认依赖 hooks 把这些边界变成可执行约束。

## Replaceable workers 原则

manager 应该依赖**角色契约**，不要依赖某个 worker 的人格化习惯。

- `drive` 关心“谁来做代码编辑、命令执行、浏览器交互、证据整理”
- `check` 关心“谁来提供 UI / API / regression / artifact 的验证观察”
- 只要输入输出契约、证据路径、summary 写回保持稳定，具体 worker 可以替换

所以这里的可替换性不是随意混用角色，而是**在不破坏 contract / summary / evidence 结构的前提下替换具体 hands 或 probes**。

## Tool ownership 与 minimum privilege

每一层只拥有完成自己职责所需的最小权限。

- `control` 负责 semantic lock、task typing、route selection、manager dispatch、summary supervision
- `plan` 负责 whole-task contract、done criteria、planning summary
- `drive` 负责 round-contract、capability dispatch、execution summary、evidence indexing
- `check` 负责 contract review、probe selection、quality gate、acceptance decision
- capability agents 负责窄执行，不重定义需求，不宣布最终通过
- probe agents 只返回 observations 和 evidence，不写 `accepted` / `rejected`

一句话，**brain 不直接下场干活，manager 不变成万能 agent，probe 不抢 judge 的工作。**

## 证据与验收边界

这个 repo 的 acceptance 规则不是“谁说得像完成了就算完成”。

- execution side 的 claim 应该能在 `evidence-ledger.md` 或底层 evidence 路径里找到对应 proof
- `check` 是 judge，不是另一个 implementation thread
- probe 负责取证，`check` 负责基于 contract 和 evidence 做 `accepted` / `rejected` / `needs-follow-up`
- 当 route 要求 UI、API、regression、artifact 验证时，probe-produced evidence 先于 acceptance decision

summary 可以引用 proof，不能冒充 proof。

## Honest blocked mode，禁止 silent fallback

Harness 模式下，没有“看起来任务不大，所以先偷偷单线程做完再说”这种路径。

- 进入 `harness-orchestrator` 或显式走 `/control` 后，任务必须经过 manager 边界
- 每个 execution round 至少有一个 capability hand 参与
- 每个 acceptance pass 至少有一个 probe 参与
- 必需 manager / hand / probe 不可用时，结果是 blocked，不是角色塌缩
- 缺证据、缺 probe、缺 dispatch，都要显式记录 gap，不能伪装成正常完成

degraded mode 在本仓库里是**blocked-state recorder**，不是 silent fallback execution mode。

## 何时进入这套 harness

大致规则：

- 普通问答、轻分析、很小的单点动作，可以继续用默认 OMO agent 世界
- 需要稳定 contract、多阶段推进、独立 acceptance、summary-first supervision 的任务，应进入 `/control`
- 一旦进入 Harness mode，就按这套 layered route 运行，不再让默认单 agent 习惯偷走顶层 orchestration

这也是为什么仓库区分了默认 OMO workflow 和 `harness-orchestrator` workflow。

## 操作时要记住的硬规则

1. `control` 读摘要，默认不吞原始执行日志。
2. `drive` 必须组织 capability agents，不能独自完成整个 round。
3. `check` 必须组织 probe agents，不能把 acceptance 写成 manager monologue。
4. managers 写 summary 和 contract，hands / probes 写 detail evidence。
5. 缺角色、缺证据、缺 probe 时，要诚实 blocked，不要 silent fallback。

## 深入文档

想看完整规则，请继续往下读这些文件：

- `README.md`，整体架构、入口兼容性、使用模式
- `control/SKILL.md`，brain / orchestrator 的 route、semantic lock、degraded mode 规则
- `control/config/coordination-rules.md`，state ownership、handoff、summary vs detail 边界
- `drive/SKILL.md`，execution-manager 的 contract-first、capability dispatch、evidence 纪律
- `check/SKILL.md`，acceptance-manager 的 judge/probe 分工与 decision rules
- `docs/managed-agents-migration.md`，从旧 planner / executor / checker 到新 layered model 的迁移解释
- `docs/harness-agent-isolation.md`，默认 OMO world 和 Harness world 的隔离原则

如果只记一句话，请记这句：**在这个 repo 里，brain 负责选路和监督，managers 负责合同与交接，hands / probes 负责窄执行与取证，完成与否只能由有证据支撑的 acceptance 来决定。**

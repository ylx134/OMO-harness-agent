# Decision Tree: Sisyphus vs /control vs ulw

## Quick Decision Guide

```
用户输入
  │
  ├── 包含 "ulw" 或 "ultrawork"
  │   └── 使用 ultrawork mode（Sisyphus 深度思考模式）
  │       适合：复杂问题需要深度分析，但不需要多代理编排
  │
  ├── 包含 "/control"
  │   └── 使用 Control harness（完整编排）
  │       适合：需要规划→执行→验收的完整流程
  │
  ├── 纯问答/解释
  │   └── 直接跟 Sisyphus 说
  │       例："这段代码什么意思？"
  │
  ├── 单行修改
  │   └── 直接跟 Sisyphus 说
  │       例："加个 console.log"
  │
  ├── 3+ 文件改动
  │   └── 使用 /control
  │       例："加个用户管理系统"
  │
  └── 不确定
      └── 用 /control（安全选择）
          Control 的 Task Router Gate 会自动判断
```

## 三种模式对比

### 1. Sisyphus 直接执行（默认模式）

**什么时候用**：
- 改 bug（已知原因，1-2 个文件）
- 纯问答/解释
- 单行修改
- 代码审查
- 文件操作

**特点**：
- 最快，无编排开销
- Sisyphus 自己思考、自己执行、自己验证
- 没有独立的验收代理

**示例**：
```
用户: 帮我修复 auth.ts 里的 token 过期问题
用户: 这段代码什么意思？
用户: 把 config 里的 port 改成 8080
```

### 2. Ultrawork Mode（ulw）

**什么时候用**：
- 复杂问题需要深度分析
- 架构决策需要反复推敲
- 需要在编码前做充分的探索和研究
- 不需要多代理编排，但需要 Sisyphus 先想清楚再动手

**特点**：
- 强制 Sisyphus 先探索、再规划、再执行
- 有严格的验证要求（必须跑测试、必须手动 QA）
- 仍然是单代理，没有独立的 planner/executor/checker
- 适合"一个聪明人认真干活"的场景

**示例**：
```
用户: ulw 帮我重构 auth 模块，确保不影响现有功能
用户: ulw 分析一下这个性能瓶颈的根本原因
```

### 3. Control Harness（/control）

**什么时候用**：
- 新功能开发（需要规划→执行→验收）
- 产品构建（需要 feature 拆解、Auto-Pilot）
- 能力建设（需要 capability planning）
- 长期项目（可能中断多次）
- 质量关键的工作（需要独立验收）

**特点**：
- 三代理分工：planner → executor → checker
- Sprint Contract 协商：编码前必须和 checker 对齐
- 4 维度评分：产品深度/功能完整性/视觉设计/代码质量
- 质量校准：calibration-examples.md 防止判断漂移
- 状态持久化：.agent-memory/ 支持跨会话恢复
- 自动错误恢复：5 种失败场景的自动恢复流程

**示例**：
```
用户: /control 帮我做一个音乐编辑器
用户: /control 给系统加多语言支持
用户: /control 从零做一个后台管理系统
```

## 决策矩阵

| 维度 | Sisyphus | ulw | /control |
|------|----------|-----|----------|
| 规划 | 脑中规划 | 显式规划 | 独立 planner 代理 |
| 执行 | 自己执行 | 自己执行 | 独立 executor 代理 |
| 验收 | 自己验证 | 严格验证 | 独立 checker 代理 |
| 状态持久化 | 无 | 无 | .agent-memory/ |
| 中断恢复 | 无 | 无 | handoff.md + git |
| 质量门禁 | 无 | 有 | 有 + 动态调整 |
| 多代理协调 | 无 | 无 | 有 |
| 适用文件大小 | 1-2 | 2-5 | 5+ |
| 适用任务复杂度 | 低 | 中 | 高 |
| 编排开销 | 无 | 低 | 中 |

## 常见场景推荐

| 场景 | 推荐 | 原因 |
|------|------|------|
| 改个 typo | Sisyphus | 1 行改动 |
| 解释一段代码 | Sisyphus | 纯问答 |
| 修一个已知原因的 bug | Sisyphus | 范围明确 |
| 重构一个小模块 | ulw | 需要分析影响 |
| 分析性能瓶颈 | ulw | 需要深度研究 |
| 加一个功能到现有项目 | /control | 需要验收 |
| 从零做一个产品 | /control | 需要规划+验收 |
| 能力建设（如多语言） | /control | 需要 capability planning |
| 长期项目 | /control | 需要状态持久化 |

## 不确定时怎么办

**安全选择**：用 `/control`

Control 内置了 Task Router Gate，会自动判断：
- 如果任务太简单，Control 会直接委托给 Sisyphus 执行
- 如果任务适合 harness，Control 会启动完整流程

所以你不需要精确判断——交给 Control 的决策层就行。

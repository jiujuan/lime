# 场景分层与命令选择

> 目标：让 Agent 能按改动风险选择最小验证集合。

## 1. Lane 定义

| Lane | 证明什么 | 成本 |
| --- | --- | --- |
| L0 static / contract | 类型、schema、合同、治理边界 | 低 |
| L1 runtime fixture | RuntimeCore / App Server / tool surface 离线路径 | 低 |
| L2 GUI smoke | 桌面 GUI 主路径可用 | 中 |
| L3 qcloop scenario | worker + verifier + evidence contract | 高 |
| L4 live / semantic | live Provider、长程语义、Supervisor | 最高 |

## 2. 改动类型到 Lane

| 改动类型 | 默认 Lane |
| --- | --- |
| 文档 / 计划 | L0 文档检查即可 |
| App Server method / command boundary | L0 + L1 |
| Agent runtime 状态机 | L0 + L1 + targeted L2 |
| GUI 主路径 | L0 + L2 |
| SkillTool / approval / sandbox | L0 + L1 + targeted L3 |
| Plugin runtime | L0 + L1 + L2 |
| Managed Objective | L0 + L1，必要时 L3 |
| release | L0 + L1 + L2 + L3，必要时 L4 |

## 3. 场景选择规则

```text
如果改 command / bridge -> command-bridge-contract
如果改 Claw streaming / stop / resume -> claw-chat-ready-streaming
如果改 tool / permission / sandbox -> tool-approval-sandbox-boundary
如果改 Skill Forge / SkillTool -> skill-forge-register-bind-enable
如果改 browser runtime / adapter -> browser-runtime-site-adapter
如果改 workspace / session / desktop shell -> workspace-ready-session-restore
如果改 harness / replay / grader -> harness-replay-regression
如果改 release / packaging / version -> release-package-startup-smoke
如果改 objective / continuation / audit -> managed-objective-evidence-continuation
```

## 4. 证据层选择

| 风险 | 需要证据 |
| --- | --- |
| 结构同步 | deterministic-smoke |
| 用户路径 | gui-trace |
| Agent 行为 | runtime-transcript |
| 发布 | release-artifact |
| 语义质量 | Supervisor JSON verdict |

# Agent Workspace 流式与 Thinking UI 评分卡

> 当前静态分：`3.4 / 5`  
> 目标：验证 Agent Workspace 是否能在首字前、运行中、完成后稳定展示 Agent 过程，而不把 thinking / tool / final text 混在一起。

## 1. 5 分标准

| 能力 | 5 分要求 |
| --- | --- |
| 首状态 | runtime accepted 后先显示 status，不等首 token |
| Ordered parts | text、reasoning、tool、action、artifact、evidence 按事件顺序投影 |
| Thinking 策略 | 运行中可见，完成后折叠；原文仅在 provider 允许且用户开启时展示 |
| 中断 / 继续 | interrupt 后显示 interrupted，不误报 failed；后续 turn 可继续 |
| 卡顿控制 | delta backlog、flush interval、TTFT 可度量 |
| 历史噪声控制 | 历史 thinking/tool 默认摘要化，关键过程可展开 |

## 2. 当前证据

| 证据 | 判断 |
| --- | --- |
| Lime `agentStreamThinkingDeltaController`、`agentStreamTextDeltaController`、`agentStreamRuntimeStatusController` | 流式 controller 分层已存在 |
| `agentUiPerformanceMetrics`、TTFT sample scripts | 性能度量有基础 |
| AgentUI flow taxonomy | `reasoning.delta`、`reasoning.summary`、`inline_process` 是标准 surface |
| Vercel AI SDK reasoning parts | thinking/reasoning 是 message part，不应混入 final text |
| CodexMonitor event docs | Codex 有 `item/reasoning/*`、`item/agentMessage/delta`、`turn/completed` 等独立事件 |

## 3. 评分维度

| 评测项 | 当前分 | 必须补证 |
| --- | ---: | --- |
| First status | 3.5 | GUI smoke 记录 submit-to-status |
| First text | 3.5 | GUI smoke 记录 submit-to-first-text |
| Thinking separation | 3.5 | thinking 不污染 final markdown |
| Ordered interleave | 3.0 | active turn 工具与文本穿插展示 |
| Interrupt recovery | 3.0 | abort 后 follow turn completed |
| Backlog / flush metrics | 3.0 | delta backlog、paint latency 进入 evidence |

## 4. P0 实测场景

| 场景 | 输入 | 必须通过 |
| --- | --- | --- |
| `stream-first-status` | 简单问答 | accepted/routing/running 在首 text 前出现 |
| `stream-thinking-final-separation` | 要求推理的任务 | thinking block 与 final answer 分离 |
| `stream-tool-interleave` | 搜索或读文件任务 | tool progress 不打断 final text |
| `stream-interrupt-followup` | 运行中 interrupt 后再追问 | interrupted 与下一轮 completed 都正确 |

## 5. 失败模式

| 失败 | 阻断原因 |
| --- | --- |
| `<think>` 或 thinking delta 出现在 final text | 破坏用户信任和可复制答案 |
| 首字前空白 | 体感卡死，无法判断 runtime 是否活着 |
| completed 后过程消失 | 无法复盘工具、权限和证据 |
| interrupt 显示 failed | 用户会误判任务失败而非取消 |

## 6. 下一刀

把 submit-to-status、submit-to-first-text、first-paint 和 delta backlog 写入 `agent-workspace-basic-streaming` evidence。

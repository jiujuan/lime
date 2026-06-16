# Agent Workspace 协议与 Runtime 事实源评分卡

> 当前静态分：`4.0 / 5`  
> 目标：验证 Agent Workspace UI 是否建立在可信 runtime facts 上，而不是解析 assistant 文本或本地猜状态。

## 1. 5 分标准

| 能力 | 5 分要求 |
| --- | --- |
| Runtime-first projection | UI 只消费 runtime event、read model、task snapshot、artifact/evidence refs |
| 事件分类 | 覆盖 run、text、reasoning、tool、action、queue、artifact、evidence、session、team |
| 身份保真 | sessionId、threadId、turnId、runId、toolCallId、actionId、artifactId、evidenceId 不丢 |
| 顺序保真 | active turn 的 text / reasoning / tool / action 按 sequence 可重放 |
| 缺事实处理 | 缺事实时显示 unavailable / blocked，不从 assistant prose 猜成功态 |
| 可回放 | 同一 transcript 能重建 UI projection state |

## 2. 当前证据

| 证据 | 判断 |
| --- | --- |
| `packages/agent-ui-contracts/README.md` 定义 runtime event、projection、message parts、timeline、graph、fixtures | facts 契约较完整 |
| `internal/roadmap/agentruntime/agentui-adoption-gap.md` 记录 Agent Workspace / Agent App projection bridge 和 Host Run view model first-cut | AgentUI 接入不是零基础 |
| Codex app-server `Thread / Turn / Item` 模型和 stream notifications | Agent Workspace 应对齐 thread/turn/item，而不是自造聊天状态 |
| AG-UI run/text/tool/state/error/thinking event taxonomy | Agent Workspace 当前 event class 方向正确 |
| Vercel AI SDK `UIMessage.parts` | 支持按 typed parts 渲染是行业标准 |

## 3. 评分维度

| 评测项 | 当前分 | 必须补证 |
| --- | ---: | --- |
| Runtime event taxonomy | 4.0 | 与 AG-UI / Codex app-server event 做机器对照 |
| Projection identity preservation | 4.0 | 单测断言所有 id 不丢、不重写 |
| Ordered active parts | 3.0 | GUI 实测 reasoning / tool / text 交错渲染 |
| Missing facts fallback | 3.5 | 缺 artifact/evidence/action 时不能显示假完成 |
| Replay rebuild | 3.0 | 从 transcript 重建 projection 的 fixture |
| App / Host 边界 | 3.5 | Agent App / Agent Workspace 不直接解释 `task:*` 或 assistant prose |

## 4. P0 实测场景

| 场景 | 输入 | 必须通过 |
| --- | --- | --- |
| `protocol-basic-run` | 普通 turn | `run.started -> text.delta -> run.finished` 可投影 |
| `protocol-tool-interleave` | 触发工具的任务 | text、reasoning、tool args/result 按 sequence 展示 |
| `protocol-missing-facts` | 缺 artifact/evidence 的任务 | UI 显示缺事实，不从文本猜保存成功 |
| `protocol-replay` | 读取保存的 transcript | 重放后 UI summary 与原始运行一致 |

## 5. 失败模式

| 失败 | 阻断原因 |
| --- | --- |
| UI 从 final text 判断工具成功 | 会制造假入口和假完成态 |
| actionId / toolCallId 丢失 | 无法受控写回或定位失败工具 |
| sequence 被重排 | active run 过程不可复查 |
| replay 后状态不同 | Evidence / release gate 不可信 |

## 6. 下一刀

把 `agent-workspace-basic-streaming` 和 `agent-workspace-tool-call` 的 runtime transcript 保存为 AgentUI conformance fixture，并加 projection replay 单测。

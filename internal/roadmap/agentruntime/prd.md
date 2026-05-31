# Lime AgentRuntime Profile PRD

> 状态：implementation-audited
> 更新时间：2026-05-12
> Owner：Lime runtime / evidence / GUI 主链
> 关联标准：`/Users/coso/Documents/dev/ai/limecloud/agentruntime` 的 `Agent Runtime v0.4.0` 与 `Lime AgentRuntime Profile`；相邻 owner 为 `/Users/coso/Documents/dev/ai/limecloud/agentcontext`、`/Users/coso/Documents/dev/ai/limecloud/agentevidence`、`/Users/coso/Documents/dev/ai/limecloud/agentpolicy`、`/Users/coso/Documents/dev/ai/limecloud/agentui`

## 1. 背景

Lime 已经拥有大量能力：

- agent turn、subagent turn、automation job
- model routing、service models、OEM policy、成本/限额事件
- runtime queue、thread read、request telemetry
- evidence pack、replay case、analysis handoff、review template
- Workspace / Harness / task center / dashboard 等 GUI 展示
- `agentcontext`、`agentpolicy`、`agentevidence`、`agentui` 等标准协议草案

但这些能力仍然容易进入“瞎子摸象式迭代”：每个模块都能解释自己的局部正确性，却缺少一条可以从用户输入一路追到证据导出的 canonical runtime spine。

Codex 与 Claude Code 给 Lime 的启发是：

1. Codex 通过 `Thread / Turn / Item`、app-server protocol、schema、CI 守卫把协议与实现绑定。
2. Claude Code 通过 `query()` 主循环、message/tool/task/permission/compaction 运行态，把复杂 agent loop 收敛到一条产品主路径。
3. Lime 需要的是两者结合：**公开标准 + Lime 严格 profile + current runtime 实现映射**。

相邻协议不再作为“第十套方案”平行推进：`AgentContext` 只拥有上下文语义，`AgentPolicy` 只拥有策略决策语义，`AgentEvidence` 只拥有证据关系与 completeness，`AgentUI` 只拥有投影与受控交互。AgentRuntime 负责把这些 owner 的 refs 串到同一条 execution facts 主链。

## 2. 问题陈述

当前没有统一 AgentRuntime Profile 时，Lime 会持续遇到这些问题：

| 问题 | 结果 |
| --- | --- |
| 运行事实散落 | GUI、evidence、review、analysis 各自拼状态。 |
| 关联键不稳定 | request telemetry、tool call、turn、evidence 无法可靠 join。 |
| 任务语义混乱 | objective、task、turn、job、subagent、todo list 边界不清。 |
| 测试只覆盖局部 | 无法证明 submit turn 到 evidence export 的完整闭环。 |
| 标准协议与实现脱节 | 文档越来越多，但 Lime current 主链没有被强制收敛。 |

## 3. 产品目标

### 3.1 一句话目标

把 Lime 的 agent 执行统一到 `Lime AgentRuntime Profile`：所有 current runtime、GUI、evidence、review、replay、analysis 都消费同一组 `RuntimeEvent + Snapshot + ThreadReadModel`。

### 3.2 业务目标

1. 让用户看到的任务状态、模型路由、工具审批、证据导出都可解释。
2. 让开发者能按 profile fixture 测试 agent 主链，而不是靠人工猜测。
3. 让未来的子代理、automation job、remote channel 都接入同一事实源。
4. 让 Lime 的标准协议真正服务产品实现，而不是成为平行文档。
5. 让 `agentcontext/agentevidence/agentpolicy/agentui` 的边界进入验收测试，不再靠口头约定避免事实漂移。
6. 让全球用户看到本地化后的运行说明，同时保持 runtime facts 的协议值跨语言稳定。

### 3.3 工程目标

1. 固定 `session/thread/turn/task/run/step/tool/action/subagent/evidence` 关联键。
2. 固定 submit turn、tool approval、task retry、routing single candidate、evidence export 的最小事件闭环。
3. 固定 `ThreadReadModel / TaskSnapshot / EvidenceSummary / RoutingLimitSummary` 的 owner。
4. 补结构测试、fixture 校验和 GUI smoke。
5. 固定本地化分层：Runtime/Profile 只输出稳定事实、代码和 refs；AgentUI/Workspace 负责把这些事实映射到 key-based i18n 文案。

## 4. 非目标

本阶段不做：

1. 不重写完整 runtime。
2. 不把 AgentRuntime 变成 UI / policy / context / evidence / artifact 的大一统协议。
3. 不一次性实现公开 AgentRuntime 的所有 optional event families。
4. 不新增独立调度器、独立 evidence exporter 或独立 GUI 状态源。
5. 不承诺跨产品兼容，只先让 Lime current 主链可落地。
6. 不把 AgentContext、AgentEvidence、AgentPolicy 合并成 AgentRuntime 大一统 schema；Runtime 只引用它们的 owner facts。
7. 不把中文、英文或任一 locale 的展示文案写成 profile `status/type/taskKind/source/reasonCode` 等协议字段。

## 4.1 全球本地化原则

AgentRuntime Profile 必须服务全球用户，但本地化边界要清晰：

| 内容 | 所属层 | 本地化要求 |
| --- | --- | --- |
| `type/status/taskKind/source/failureCategory/reasonCode` | Runtime/Profile 协议事实 | 不本地化，保持 snake_case / dotted stable value。 |
| `sessionId/threadId/turnId/taskId/runId/toolCallId/actionId/evidenceId` | Runtime correlation | 不本地化，不含 locale 信息。 |
| `message/detail/summary` 诊断字段 | Runtime diagnostics | 可以保留原始诊断文本，但不能作为状态机或测试 join 条件。 |
| 标题、按钮、toast、空态、错误说明、aria/title | AgentUI / Workspace projection | 必须走 current key-based i18n resources。 |
| Evidence / Replay / Review Markdown 摘要 | Evidence/Review presentation | 默认按导出 locale 渲染，并保留稳定 facts JSON 作为机器事实源。 |

验收口径：

1. 测试断言优先断言稳定协议值，不断言用户可见译文。
2. GUI 只根据 stable facts 选择 i18n key，不从中文/英文 message 中反推状态。
3. Evidence pack 同时保留机器可读 facts 与可本地化 presentation，不让 presentation 覆盖 facts。

## 5. 用户故事

### 5.1 普通用户：我想知道任务到底在做什么

作为使用 Lime 的用户，
当我提交一个复杂任务时，
我希望看到系统处于 `preparing / running / waiting_permission / blocked / completed / failed` 中哪个状态，
这样我不需要猜测 agent 是卡住了、在等审批，还是已经完成。

验收：Workspace 读取 `ThreadReadModel`，展示 active turn、pending action、last outcome 和 incidents。

### 5.2 开发者：我想复现一次失败

作为 Lime 开发者，
当用户报告一次失败 turn 时，
我希望 evidence pack 能带上 `sessionId / threadId / turnId / taskId / runId / toolCallId / traceId`，
这样我能从同一份事实重建 timeline、tool failure 和 request telemetry。

验收：`agent_runtime_export_evidence_pack` 导出 runtime correlation section，review/replay/analysis 不再重新拼 observability summary。

### 5.3 产品负责人：我想停止盲目迭代

作为产品负责人，
当团队新增任务、模型、证据或 GUI 能力时，
我希望每个改动都能标注它写入或读取 AgentRuntime Profile 的哪个事实，
这样 roadmap 可以围绕主链推进，而不是继续堆独立功能。

验收：新 runtime 相关文档必须说明 current/compat/deprecated/dead 分类，以及 profile event/read model 映射。

### 5.4 测试负责人：我想有稳定的主链验收

作为测试负责人，
当 runtime 主路径变化时，
我希望用 fixtures 和结构测试验证 submit turn、tool approval、task retry、routing single candidate、evidence export，
这样不用只靠 GUI 手工点验。

验收：新增 `agentruntime` fixture 校验与 Lime command mapping 测试。

### 5.5 AI Agent / 子代理：我需要稳定的上下文边界

作为子代理或后台 job，
当我被父任务委派时，
我需要明确 parent session/thread/turn/task/run 关系，
这样我的输出、失败、关闭、证据都能回挂到父任务。

验收：subagent/job 事件必须包含 parent correlation ids，不能只在消息正文里说明来源。

## 6. 核心需求

### 6.1 Identity profile

Lime current runtime 必须稳定产出：

| Identity | 作用 |
| --- | --- |
| `runtimeId` | Lime runtime 实例或安装归因。 |
| `sessionId` | 用户可见 durable work container。 |
| `threadId` | 有序执行上下文。 |
| `turnId` | 一次输入执行周期。 |
| `taskId` | 目标工作单元。 |
| `runId / attemptId` | 某个 task 的一次执行尝试。 |
| `stepId` | 有序 runtime item。 |
| `toolCallId` | 一次工具或命令调用。 |
| `actionId` | 一次 pending human/policy decision。 |
| `subagentId` | 子代理执行上下文。 |
| `evidenceId` | evidence/replay/review ref。 |

### 6.2 Runtime event profile

首期必须覆盖这些事件：

1. `turn.submitted / turn.started / turn.completed / turn.failed`
2. `task.created / task.started / task.attempt.failed / task.completed / task.failed`
3. `model.requested / model.completed / model.failed`
4. `tool.started / tool.result / tool.failed`
5. `action.required / action.resolved`
6. `permission.evaluated / sandbox.applied`
7. `task.profile.resolved / routing.single_candidate / routing.decided`
8. `cost.estimated / rate_limit.hit / quota.blocked`
9. `evidence.changed / snapshot.updated`

### 6.3 Read model profile

首期必须提供：

1. `ThreadReadModel`
   - `threadId`
   - `status`
   - `activeTurnId`
   - `pendingRequests`
   - `queuedTurns`
   - `incidents`
   - `toolCalls`
   - `modelRouting`
   - `limitState`
   - `evidenceSummary`
2. `TaskSnapshot`
   - `taskId`
   - `objective`
   - `status`
   - `currentRunId`
   - `attempts`
   - `relationships`
   - `progress`
   - `evidenceRefs`
3. `EvidenceSummary`
   - `evidenceRefs`
   - `replayRefs`
   - `reviewRefs`
   - `verificationOutcomes`
   - `knownGaps`，只允许包含适用且已证明缺失的 gap。

### 6.4 Control plane profile

Lime 命令不需要改名，但必须能映射：

| Profile 语义 | Lime 主链 |
| --- | --- |
| `submit_turn` | `agent_runtime_submit_turn` |
| `interrupt_turn` | runtime interrupt / queue cleanup |
| `resume_thread` | thread resume / history reconstruction |
| `respond_action` | permission / prompt / structured input response |
| `get_thread_read` | `AgentRuntimeThreadReadModel` |
| `export_evidence` | `agent_runtime_export_evidence_pack` |
| `export_replay` | `agent_runtime_export_replay_case` |
| `export_review` | review template / saved decision |

## 7. 收益

### 7.1 对用户

- 更清楚地知道 agent 当前在做什么、卡在哪里、需要什么输入。
- 更少遇到“看起来完成但其实没证据”的假完成。
- 更容易从 GUI 看到模型路由、审批、失败和恢复原因。

### 7.2 对产品

- roadmap 可以围绕运行主链推进，而不是围绕孤立功能堆叠。
- 新标准协议能回挂到 Lime current 实现，减少空转。
- 可以用 evidence/replay/review 支撑更可信的产品体验。

### 7.3 对工程

- 降低 GUI / evidence / telemetry / runtime 之间的事实漂移。
- 更容易写结构测试和 fixture。
- 更容易定位旧路径：`current / compat / deprecated / dead`。

## 8. 成功指标

| 指标 | 目标 |
| --- | --- |
| Profile fixture 覆盖 | 首期 6 个核心 fixtures 通过结构测试。 |
| 主链可追踪 | 任一 turn 能 join `session/thread/turn/task/run/evidence`。 |
| GUI 事实源 | Workspace/Harness 不再直接拼 evidence/routing/task truth。 |
| Evidence 一致性 | replay/review/analysis 消费 evidence pack 或同源 summary。 |
| 回归验证 | runtime 主路径改动至少跑 contract + GUI smoke。 |

## 9. MVP 范围

MVP 只做一条最小闭环：

```text
用户提交 turn
  -> 生成 AgentRuntime profile ids
  -> 发出 turn/model/tool/action/routing/evidence 核心事件
  -> 更新 ThreadReadModel
  -> 导出 evidence pack
  -> GUI 只读展示同一份事实
```

MVP 不要求覆盖所有 subagent/job/remote channel，但新设计必须预留 owner 与关联键。

## 10. 主要风险

| 风险 | 缓解 |
| --- | --- |
| Profile 变成新协议空转 | 每个 profile 字段都必须映射 Lime current 主链或标记为未来扩展。 |
| 一次性重构过大 | 分阶段先收 submit turn/evidence，再收 task/subagent/job。 |
| GUI 迁移不彻底 | 增加反漂移扫描，禁止 UI-only runtime truth。 |
| Schema 过严卡住演进 | 公开 schema 保持宽松，Lime profile schema 只约束 current core。 |

## 11. 验收摘要

1. 文档层：本 roadmap 与 PRD 已落地。
2. 标准层：`agentruntime v0.4.0` 已有 Lime Profile 与 fixtures。
3. 实现层：后续 PR 必须把 Lime current 主链映射到 profile。
4. 测试层：必须补 schema fixture、command mapping、evidence consistency 和 GUI smoke。

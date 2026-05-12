# Lime AgentRuntime Profile 测试用例

> 状态：implementation-audited
> 更新时间：2026-05-12
> 作用：把 AgentRuntime Profile 的 PRD、架构和落地计划翻译成可执行测试矩阵，避免 Lime 继续靠局部测试或 GUI 观感判断运行主链是否正确。

## 1. 测试目标

本测试文档只服务一条主链：

```text
agent_runtime_submit_turn
  -> RuntimeEvent
  -> ThreadReadModel / TaskSnapshot
  -> EvidencePack / Replay / Review
  -> Workspace / Harness GUI projection
```

测试目标：

1. 证明每个 current runtime turn 都有稳定 `session/thread/turn/task/run/evidence` 关联键。
2. 证明 GUI、evidence、review、replay、analysis 消费同一组 runtime facts。
3. 证明 tool approval、task retry、routing single candidate、evidence export 都能用 fixture 或结构测试复现。
4. 证明 compat 只做委托映射，deprecated/dead 路径不能重新成为事实源。
5. 证明主路径不仅类型正确，而且用户能在 GUI 看到同一份 read model 投影。
6. 证明全球本地化只发生在 presentation 层，runtime profile facts 不随 locale 改变。

## 2. 测试分层

| 层级 | 目的 | 主要对象 | 推荐执行时机 |
| --- | --- | --- | --- |
| Schema / Fixture | 验证 Lime Profile 事件和 snapshot 形状 | AgentRuntime profile fixtures | 改 schema、事件字段、snapshot 字段时 |
| Runtime Unit | 验证 ids、事件 envelope、状态转换 | `runtime_turn`、runtime queue、read model builder | 改 submit turn、事件构造、状态机时 |
| Contract | 验证 Tauri command、frontend gateway、catalog、mock 同步 | `agent_runtime_*` commands | 改命令或 bridge 时 |
| Replay / Projection | 验证 event stream 可重建 read model | `ThreadReadModel`、`TaskSnapshot` | 改 projection 或恢复逻辑时 |
| Evidence Consistency | 验证 evidence/replay/review 同源 | `agent_runtime_export_evidence_pack` | 改 evidence、review、analysis 时 |
| GUI Smoke | 验证用户真实看到 runtime facts | Workspace、Harness、Dashboard | 改 GUI 主路径时 |
| Localization | 验证 stable facts 与本地化 presentation 分层 | i18n resources、presentation mapper、Evidence Markdown | 新增用户可见 runtime 文案或导出摘要时 |
| Governance Guard | 阻止 UI-only truth 和平行事实源回流 | legacy catalog、文本扫描、结构断言 | 每个 runtime 主线 PR |

## 3. 测试数据与 fixtures

首期用例对齐 AgentRuntime 标准项目中的 Lime Profile fixtures：

| Fixture | 覆盖场景 | Lime 对应能力 |
| --- | --- | --- |
| `submit-turn-event.json` | 用户提交 turn，生成核心 ids 与事件 envelope | `agent_runtime_submit_turn` |
| `tool-approval-action-required-event.json` | 工具调用触发权限审批等待点 | tool approval / `respond_action` |
| `task-retry-attempt-failed-event.json` | task attempt 失败并保留 retry 历史 | TaskSnapshot attempts |
| `routing-single-candidate-event.json` | 模型路由只有一个候选并给出解释 | `TaskProfile / RoutingDecision / LimitState` |
| `routing-not-possible-event.json` | 模型路由没有可用候选并阻止假执行 | `TaskProfile / RoutingDecision / CapabilityGap` |
| `routing-decided-multi-candidate-event.json` | 多候选路由选中目标模型并保留候选数 | `TaskProfile / RoutingDecision / LimitState` |
| `evidence-export-event.json` | evidence pack 导出并关联 replay/review refs | `agent_runtime_export_evidence_pack` |
| `thread-read-snapshot.json` | GUI 可消费的 thread read snapshot | `AgentRuntimeThreadReadModel` |
| `subagent-parent-child-event.json` | 子代理会话回挂 parent session/thread/turn | `Subagent / TaskSnapshot / EvidenceSummary` |
| `job-owner-run-event.json` | automation owner run 与 job item 进入 job profile event | `AgentRun / CompletionAudit / EvidenceSummary` |
| `remote-channel-resume-event.json` | remote channel 断开、恢复与 snapshot repair 可审计 | `AgentRun.source_metadata.remote_task / EvidenceSummary` |

Lime 仓库落地实现时，真实 runtime 输出可以不直接复制 fixture 内容，但必须满足同一结构约束和语义断言。

相邻标准 linkage 额外使用这些结构样例：

Owner 侧对应测试文档：

- `/Users/coso/Documents/dev/ai/limecloud/agentcontext/docs/zh/authoring/runtime-profile-test-cases.md`
- `/Users/coso/Documents/dev/ai/limecloud/agentevidence/docs/zh/authoring/runtime-profile-test-cases.md`
- `/Users/coso/Documents/dev/ai/limecloud/agentpolicy/docs/zh/authoring/runtime-profile-test-cases.md`

| 样例 | 覆盖场景 | Owner |
| --- | --- | --- |
| `context-resolved-linkage.json` | Runtime event 引用 context envelope、selection、budget 与 missing context refs | AgentContext |
| `policy-ask-action-required-linkage.json` | Policy `ask` 决策转成 runtime `action.required` | AgentPolicy |
| `policy-deny-tool-blocked-linkage.json` | Policy `deny/indeterminate` 阻断工具执行并进入 incidents | AgentPolicy |
| `evidence-runtime-completeness-linkage.json` | evidence pack 引用 runtime timeline/context/policy refs 并声明 completeness | AgentEvidence |
| `agentui-profile-event-compat.json` | AgentUI 接收 Lime Profile dotted event，不告警、不创建 UI-owned truth | AgentUI |

## 4. P0 文档与标准冻结用例

| ID | 用例 | 前置条件 | 操作 | 期望结果 |
| --- | --- | --- | --- | --- |
| AR-P0-DOC-001 | roadmap 文档入口完整 | `docs/roadmap/agentruntime/` 存在 | 检查 README 链接 | PRD、architecture、diagrams、implementation-plan、test-cases 全部可达 |
| AR-P0-DOC-002 | current 主链声明一致 | 读取 5 份 roadmap 文档 | 搜索 `RuntimeEvent + ThreadReadModel + TaskSnapshot + EvidencePack` | 文档统一把它声明为 AgentRuntime 事实源 |
| AR-P0-DOC-003 | 分类语言完整 | 读取 README / PRD / implementation plan | 搜索 `current / compat / deprecated / dead` | 旧路径有分类和退出口径，不出现“临时双主链”表述 |
| AR-P0-DOC-004 | 图纸没有表达平行事实源 | 读取 `./diagrams.md` | 检查 Mermaid 节点方向 | GUI、review、replay、analysis 均从 read model 或 evidence 消费，不反向写 facts |
| AR-P0-I18N-001 | 本地化边界写入文档 | 读取 roadmap 文档 | 搜索 `全球本地化` / `stable facts` / `i18n` | PRD、architecture、implementation-plan、test-cases 都声明 facts 不本地化、presentation 本地化 |

## 5. Schema / Fixture 用例

| ID | 用例 | 输入 | 断言 |
| --- | --- | --- | --- |
| AR-SCHEMA-001 | submit turn event 符合 Lime Profile | `submit-turn-event.json` | 必含 `eventId/schemaVersion/runtimeId/sessionId/threadId/turnId/type/timestamp/sequence/payload` |
| AR-SCHEMA-002 | action.required 事件包含审批等待点 | `tool-approval-action-required-event.json` | 必含 `actionId/toolCallId/actionType/decisionKind/scope`，并可 join 到 `turnId` |
| AR-SCHEMA-003 | task retry 事件保留 attempt 历史 | `task-retry-attempt-failed-event.json` | 必含 `taskId/runId/attemptId/retryable/failureCategory` |
| AR-SCHEMA-004 | routing single candidate 事件可解释 | `routing-single-candidate-event.json` | 必含 `taskKind/candidateCount/selectedModel/decisionSource`，`candidateCount` 必须为 1 |
| AR-SCHEMA-008 | routing not possible 事件不能伪造执行 | `routing-not-possible-event.json` | 必含 `taskKind/candidateCount/reasonCode/status`，`candidateCount` 必须为 0，`status` 必须为 `blocked` |
| AR-SCHEMA-009 | multi candidate routing decided 事件保留选择上下文 | `routing-decided-multi-candidate-event.json` | 必含 `taskKind/routingMode/candidateCount/selectedModel/decisionSource`，`candidateCount` 必须大于 1 |
| AR-SCHEMA-005 | evidence export 事件带导出引用 | `evidence-export-event.json` | 必含 `evidenceId/packRef`，可选 `replayRef/reviewRef/verificationOutcomes` |
| AR-SCHEMA-006 | thread read snapshot 可供 GUI 直接消费 | `thread-read-snapshot.json` | 必含 `threadId/status/profileStatus/turns/pendingRequests/incidents/toolCalls/modelRouting/limitState/evidenceSummary/telemetrySummary/contextSummary` |
| AR-SCHEMA-007 | 缺失核心关联键会失败 | 删掉 `sessionId` 或 `turnId` 的 fixture | schema 或结构测试必须失败，不能 silently default |
| AR-SCHEMA-I18N-001 | profile stable fields 不含 locale 文案 | 所有 profile fixtures | `type/status/taskKind/source/failureCategory/reasonCode` 仅包含 stable value | 切换 locale 不改变 facts JSON；本地化只改变 presentation |

## 6. Runtime identity 与事件用例

| ID | 用例 | 前置条件 | 操作 | 期望结果 |
| --- | --- | --- | --- | --- |
| AR-ID-001 | submit turn 生成核心关联键 | 空 thread 或已有 thread | 调用 `agent_runtime_submit_turn` | 返回或持久化的事件能 join `runtimeId/sessionId/threadId/turnId` |
| AR-ID-002 | task turn 生成 task/run 关联 | 输入被识别为 managed task | 提交 turn 并启动执行 | `taskId/runId/attemptId` 写入 task 事件和 read model |
| AR-ID-003 | 事件 sequence 单调递增 | 单个 thread 连续产生多个事件 | 读取 event stream | 同一 `threadId` 下 `sequence` 单调递增且可排序 |
| AR-ID-004 | restart/resume 不丢 ids | 模拟 runtime 重启后恢复 thread | resume thread | 恢复后的 read model 仍引用原 `sessionId/threadId/turnId` |
| AR-EVENT-001 | submit turn 最小事件闭环 | 正常模型返回文本 | 提交 turn 并等待完成 | 至少产生 `turn.submitted/turn.started/model.requested/model.completed/turn.completed/snapshot.updated` |
| AR-EVENT-002 | 失败 turn 有失败分类 | 模拟 provider failure | 提交 turn | 产生 `model.failed/turn.failed`，payload 含 failure category 和 retryable |

## 7. ThreadReadModel / TaskSnapshot 用例

| ID | 用例 | 输入事件 | 期望 projection |
| --- | --- | --- | --- |
| AR-READ-001 | preparing/running/completed 状态转换 | `turn.submitted -> turn.started -> turn.completed` | `ThreadReadModel.status` 依次进入 preparing/running/completed |
| AR-READ-002 | waiting_permission 状态来自 action.required | `permission.evaluated -> action.required` | `pendingRequests[]` 出现 `actionId`，thread status 为 waiting_permission |
| AR-READ-003 | denied permission 不伪装成功 | `action.resolved(deny) -> tool.failed` | incidents 记录 denied，turn 不能显示为成功工具执行 |
| AR-READ-004 | tool result 可回挂 toolCallId | `tool.started -> tool.result` | `toolCalls[]` 中同一个 `toolCallId` 状态从 running 到 completed |
| AR-TASK-001 | attempt failed 保留历史 | `task.attempt.started -> task.attempt.failed` | `TaskSnapshot.attempts[]` 保留失败 attempt，`currentRunId` 不被误覆盖 |
| AR-TASK-002 | retry 后 currentRunId 更新 | failed attempt 后 `task.retrying -> task.attempt.started(run_2)` | `currentRunId = run_2`，attempts 同时包含 run_1/run_2 |
| AR-TASK-003 | parent-child graph 可追踪 | `subagent.spawned` 或 job item event | child task/subagent 能回挂 parent task/turn |
| AR-SUB-001 | 子代理 profile event 保留 parent-child 关联 | `subagent-parent-child-event.json` | 必含 `subagentSessionId/parentSessionId/parentThreadId/parentTaskId/createdFromTurnId/runtimeStatus`，终态输出 `subagent.completed/failed/closed` |
| AR-JOB-001 | owner run 进入 job profile event | `job-owner-run-event.json` | 必含 `jobId/source/sourceRef/runtimeStatus`，终态输出 `job.completed` 或 `job.failed` |
| AR-JOB-002 | owner run metadata 进入 job item event | `job-owner-run-event.json` | 必含 `jobId/itemId/itemKind/sourceRef`，失败时输出 `job.item.failed` 且保留 `failureCategory/errorCode/retryable` |
| AR-REMOTE-001 | remote channel resume / repair 进入 profile event | `remote-channel-resume-event.json` | 必含 `remoteTaskId/channel/accountId/runId`，断开输出 `channel.disconnected`，恢复输出 `channel.resumed`，修复输出 `snapshot.repaired` |

## 8. Model routing / limit 用例

| ID | 用例 | 前置条件 | 操作 | 期望结果 |
| --- | --- | --- | --- | --- |
| AR-ROUTE-001 | 单候选路由有解释 | CandidateModelSet 只有一个可用模型 | 提交需要模型的 turn | 产生 `routing.single_candidate`，read model 展示 selected model 和 decision source |
| AR-ROUTE-002 | 无候选不进入假执行 | CandidateModelSet 为空 | 提交 turn | 产生 `routing.not_possible` 或等价 blocked event，turn status 为 blocked/failed |
| AR-ROUTE-003 | quota block 是 runtime fact | 设置 quota 已耗尽 | 提交 turn | 产生 `quota.blocked`，read model limitState 有阻塞原因 |
| AR-ROUTE-004 | cost estimate 可进入 evidence | 正常模型请求 | 导出 evidence pack | evidence timeline 包含 cost estimate 或明确标记 unavailable |

## 9. Tool approval / action 用例

| ID | 用例 | 前置条件 | 操作 | 期望结果 |
| --- | --- | --- | --- | --- |
| AR-ACTION-001 | 工具调用需要审批 | 高风险工具或 sandbox policy 命中 | 模型请求工具 | 产生 `permission.evaluated/action.required`，GUI 出现 pending action |
| AR-ACTION-002 | 审批通过后执行工具 | 已有 `action.required` | 调用 `respond_action(approve)` | 产生 `action.resolved/tool.started/tool.result` |
| AR-ACTION-003 | 审批拒绝后不执行工具 | 已有 `action.required` | 调用 `respond_action(deny)` | 产生 `action.resolved/tool.failed` 或 denied event，不能产生成功 result |
| AR-ACTION-004 | actionId 幂等 | 同一个 action 重复提交 response | 重复调用 `respond_action` | 第二次调用返回已处理或 no-op，不新增第二条成功工具事实 |
| AR-ACTION-005 | 真实工具执行流产出 Profile facts | `RuntimeAgentEvent::ToolStart -> ToolEnd` | 经过 `record_runtime_stream_event` | 实时输出 `tool.started -> tool.result`，`toolName/toolCallId/success/status` 为 stable facts |
| AR-ACTION-006 | ToolCall item fallback 不重复 | 同一工具同时出现 `ToolStart` 与 `ItemStarted/ItemCompleted(ToolCall)` | 经过同一 turn stream | Profile 按 `toolCallId` 去重；若只有 item fallback，仍输出 `tool.started/tool.failed` |

## 10. Evidence / Replay / Review 用例

| ID | 用例 | 前置条件 | 操作 | 期望结果 |
| --- | --- | --- | --- | --- |
| AR-EVID-001 | evidence pack 包含 correlation spine | 已完成或失败 turn | 调用 `agent_runtime_export_evidence_pack` | pack 含 `sessionId/threadId/turnId/taskId/runId/evidenceId/traceId` 中适用字段 |
| AR-EVID-002 | replay 复用 evidence facts | 已导出 evidence pack | 调用 replay export | replay refs 指向同一 evidence pack 或同源 event refs |
| AR-EVID-003 | review 不重建 observability summary | 已导出 evidence pack | 生成 review template | review 读取 evidence summary，不新增独立 status/routing/gap truth |
| AR-EVID-004 | known gaps 只包含适用缺口 | 当前 turn 无 request telemetry | 导出 evidence pack | telemetry summary 为空或 unavailable，不输出伪 `unlinked` 会话证据 |
| AR-EVID-005 | failed tool 进入 evidence timeline | tool failed 的 turn | 导出 evidence pack | timeline 里有 `toolCallId`、failure category、stderr/result refs 中适用字段 |

## 11. 相邻标准 linkage 用例

| ID | 用例 | 输入 | 断言 |
| --- | --- | --- | --- |
| AR-CTX-001 | context.resolved 只引用 AgentContext facts | `context-resolved-linkage.json` | event 有 `sessionId/threadId/turnId/contextId`，payload 只保留 refs/summary，不复制大 context item content |
| AR-CTX-002 | omitted context 是一等事实 | context selection 含 omitted item | read model 或 evidence summary 能看到 omitted reason，不能静默丢弃 |
| AR-CTX-003 | compaction 保留 source coverage | `context.compaction.completed` | payload 含 compactionId、source refs、summary ref、loss notes 或明确 unavailable |
| AR-CTX-004 | assembly 与 injection 不被混淆 | context envelope 含 assemblyRefs/injectionRefs | read model 只展示目标与摘要，evidence 保留 owner refs，不把 prompt 文本复制为 runtime truth |
| AR-POL-001 | policy ask 触发 action.required | policy decision result=`ask` | 产生 `permission.evaluated/action.required`，`actionId` 可 join `decisionId/approvalRequestId` |
| AR-POL-002 | policy deny 不执行工具 | policy decision result=`deny` | 不产生成功 `tool.result`，read model incidents 标记 policy blocked |
| AR-POL-003 | indeterminate fail closed | policy decision result=`indeterminate` | 默认 blocked/failed，除非 profile 明确声明安全 fallback |
| AR-POL-004 | allow/waive 保留义务和 scope | policy decision result=`allow` 或 `waive` | Runtime 后续 action/tool facts 可 join obligations、constraints、waiver scope |
| AR-EVID-LINK-001 | evidence pack 引用 runtime/context/policy refs | evidence export | pack scope/provenance/completeness 含 runtime refs、context refs、policy refs |
| AR-EVID-LINK-002 | completeness 不伪造缺失事实 | 缺 telemetry/source/replay 中任一类事实 | completeness 标记 `unknown/unavailable/not_collected/not_applicable`，不能推断 success |
| AR-EVID-LINK-003 | completeness 按分类声明 | evidence export | 至少按 `runtime/telemetry/sources/claims/artifacts/verification/privacy/replay` 中适用分类输出状态 |
| AR-UI-LINK-001 | AgentUI 静默兼容 P1 profile event | `schemaVersion=lime-profile-0.4.0` 且 `type=turn.submitted` | unknown event controller 不告警，保持 stream 活跃 |
| AR-UI-LINK-002 | AgentUI 不把 profile event 写成 UI truth | dotted profile event stream | 只进入 runtime/read-model 投影或忽略；不得创建 `agentui_profile_store` / UI-only runtime status |
| AR-UI-LINK-003 | AgentUI projection presentation 使用 i18n key | Team Workbench / Harness / Reliability / Artifact timeline 的 projection event、phase、control、source、surface | `buildAgentUiTeamWorkbenchViewModel(..., { t })` 与 current projection 组件能输出 locale 文案；`type/status/phase/control/sourceType` stable facts 不被翻译回写 |

## 12. Contract / command mapping 用例

| ID | 用例 | 检查对象 | 期望结果 |
| --- | --- | --- | --- |
| AR-CONTRACT-001 | submit command 同步 | frontend `safeInvoke`、Rust handler、catalog、mock | `agent_runtime_submit_turn` 四侧一致 |
| AR-CONTRACT-002 | evidence command 同步 | frontend gateway、Rust handler、catalog、mock | `agent_runtime_export_evidence_pack` 四侧一致 |
| AR-CONTRACT-003 | action response command 同步 | permission/action gateway、Rust handler、catalog、mock | `respond_action` 或现有等价 command 不漂移 |
| AR-CONTRACT-004 | compat 命令只委托 current | 旧 evidence/replay command | 只调用 `agent_runtime_export_*`，不重建第二套导出逻辑 |
| AR-CONTRACT-005 | mock 与真实 contract 同形 | `mockPriorityCommands` / `defaultMocks` | mock 返回字段不缺 current read model required fields |

最低验证入口：

```bash
npm run test:contracts
```

## 13. GUI smoke 用例

| ID | 用例 | 用户操作 | 期望 GUI 结果 |
| --- | --- | --- | --- |
| AR-GUI-001 | submit turn 状态可见 | 在 Workspace 提交普通任务 | 状态从 preparing/running 到 completed，展示 active turn 和 last outcome |
| AR-GUI-002 | tool approval 可见 | 触发需要审批的工具 | Workspace 出现 pending action，不靠消息文本推断 |
| AR-GUI-003 | denied permission 可解释 | 拒绝工具审批 | GUI 显示 denied / blocked 事件，evidence summary 能回到同一 actionId |
| AR-GUI-004 | routing single candidate 可解释 | 触发单候选模型路由 | GUI 显示 selected model、decision source、limit/cost 摘要 |
| AR-GUI-005 | evidence export 可见 | 在 Harness 导出 evidence | Harness 展示 evidence pack ref、replay/review refs 和 known gaps |

最低验证入口：

```bash
npm run verify:gui-smoke
```

## 14. Governance guard 用例

| ID | 用例 | 检查方式 | 期望结果 |
| --- | --- | --- | --- |
| AR-GOV-001 | 禁止 UI-only runtime truth | 搜索 `agentruntime_ui_state`、`runtime_dashboard_state` 等 dead 名称 | 不允许新增 current 引用 |
| AR-GOV-002 | 禁止 evidence 平行 builder | 搜索 `evidence_summary_builder_v2` 或新建 observability summary builder | 只能存在明确 deprecated/dead 记录，不能接入主链 |
| AR-GOV-003 | GUI 不反向写 facts | 检查 Workspace/Harness 改动 | GUI 只能读 read model/evidence summary，不写 runtime facts |
| AR-GOV-004 | compat 有退出条件 | 检查新增 compat mapping | 每条 compat 必须写明迁移完哪些调用后删除 |
| AR-GOV-005 | request telemetry 必须有关联键 | 检查 telemetry 导出 | 无 `session/thread/turn` 匹配时导出空摘要，不生成伪 evidence |
| AR-GOV-006 | 禁止相邻标准平行 runtime truth | 搜索 `agentcontext_runtime_state`、`agentpolicy_runtime_state`、`agentevidence_timeline_v2`、`agentui_profile_store` | 不允许进入 current 引用 |

最低验证入口：

```bash
npm run governance:legacy-report
```

## 15. 阶段验收矩阵

| 阶段 | 必须通过的用例 |
| --- | --- |
| P0 | AR-P0-DOC-001 到 AR-P0-DOC-004 |
| P1 | AR-SCHEMA-001、AR-ID-001、AR-ID-003、AR-EVENT-001、AR-CONTRACT-001、AR-UI-LINK-001 |
| P2 | AR-SCHEMA-006、AR-READ-001 到 AR-READ-004、AR-CTX-001 到 AR-CTX-003、AR-GUI-001 |
| P3 | AR-EVID-001 到 AR-EVID-005、AR-EVID-LINK-001、AR-EVID-LINK-002、AR-CONTRACT-002、AR-GUI-005 |
| P4 | AR-SCHEMA-002 到 AR-SCHEMA-005、AR-SCHEMA-008、AR-SCHEMA-009、AR-TASK-001、AR-TASK-002、AR-ROUTE-001 到 AR-ROUTE-004、AR-ACTION-001 到 AR-ACTION-006、AR-POL-001 到 AR-POL-003 |
| P5 | AR-TASK-003、AR-SUB-001、AR-JOB-001、AR-JOB-002、AR-REMOTE-001、remote/subagent 恢复相关扩展用例 |

## 16. 每轮改动的最小测试选择

| 改动类型 | 最小测试 |
| --- | --- |
| 只改 roadmap 文档 | 链接检查、代码围栏检查、待办标记扫描 |
| 改 AgentRuntime schema 或 fixture | Schema / Fixture 用例 |
| 改 `agent_runtime_*` command | `npm run test:contracts` + 相关 Runtime Unit 用例 |
| 改 evidence/replay/review | Evidence Consistency 用例 + `npm run test:contracts` |
| 改 Workspace/Harness runtime 展示 | GUI smoke + ReadModel 用例 |
| 改 AgentContext / AgentPolicy / AgentEvidence linkage | 对应 AR-CTX / AR-POL / AR-EVID-LINK 用例 + 定向 owner ref 测试 |
| 改 AgentUI profile event 兼容 / presentation mapper | `agentStreamUnknownEventController` / `agentStreamListenerReadinessController` / `agentUiTeamWorkbenchViewModel` / `AgentUiTeamWorkbenchSurfaceView` / `TeamWorkbenchSummaryPanel` / `HarnessStatusPanel` / `AgentThreadReliabilityPanel` / `AgentThreadTimelineArtifactCard` 定向单测 |
| 改 deprecated/compat 路径 | Governance guard + 相关 contract 用例 |
| 改 Rust runtime 主链 | 定向 Rust 测试 + Runtime identity / Event 用例 + 必要时 `npm run verify:local` |

## 17. 不通过判定

出现任一情况，即视为本阶段测试不通过：

1. Runtime event 缺少可 join 的 `sessionId/threadId/turnId`。
2. GUI 状态与 ThreadReadModel 状态不一致，且 GUI 自己拼状态。
3. Evidence pack、replay、review 产生互相矛盾的 timeline 或 known gaps。
4. compat 层新增业务逻辑或独立存储。
5. deprecated/dead 路径重新进入 current 入口。
6. 无关联键 telemetry 被导出为会话证据。
7. AgentContext / AgentPolicy / AgentEvidence / AgentUI 任一相邻标准创建了 runtime 平行事实源。
8. AgentUI 对 P1 profile events 告警刷屏，或把 profile event 直接写成 UI-owned truth。

## 18. 下一刀测试落地建议

P1 实现时先落三类测试：

1. `AR-SCHEMA-001`：用真实 submit turn 输出对齐 `submit-turn-event.json`。
2. `AR-ID-001` / `AR-ID-003`：验证核心 ids 和 sequence。
3. `AR-CONTRACT-001`：验证 `agent_runtime_submit_turn` 四侧 contract 不漂移。

这三类测试能最快证明 AgentRuntime 不是新文档，而是 Lime current runtime 的可执行主链。

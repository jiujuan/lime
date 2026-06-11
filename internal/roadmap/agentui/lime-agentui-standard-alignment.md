# Lime AgentUI 标准对齐与缺口追踪

> 状态：v0.6.0 标准对齐完成；后续只跟踪 future boundary 与 v0.5 尾项增强
> 更新时间：2026-05-11
> 标准版本：Agent UI `v0.6.0`，commit `dcf4bc5`
> 范围：对齐 `/Users/coso/Documents/dev/ai/limecloud/agentui` v0.6.0、Claude Code、Vercel AI SDK、assistant-ui、LangGraph、OpenAI ChatKit/Apps SDK 等调研结论，并回挂 Lime 当前实现缺口。

## 1. 主目标

Lime AgentUI 的主目标不是只修复 thinking 样式，而是把对话工作台全流程收敛到一个可观察、可控制、可交付、可追溯的 projection 主链。v0.6.0 之后，主链范围从 `Conversation + Process + Task + Artifact + Evidence` 扩展到 `Subagents`，但 Lime 不因此新增第四类 runtime taxonomy。

事实源声明：

```text
Agent runtime event / subagent runtime event / automation job event / remote task event
  -> Agent UI envelope projection
  -> conversationProjectionStore.agentUi
  -> Conversation / Inline Process / Task Capsule / Artifact / Evidence / Diagnostics / Subagents UI
```

固定规则：

1. 后续不新增第二套 AgentUI runtime，也不把 UI 本地状态变成 runtime fact source。
2. Lime execution taxonomy 仍只承认 `agent turn`、`subagent turn`、`automation job` 三类一等执行实体。
3. Agent UI `runtimeEntity` 映射只能落到：`agent_turn`、`subagent_turn`、`automation_job`，以及 adapter 层的 `external_task`、`work_item`。
4. `scheduler tick`、`execution run`、worker notification、review lane、remote heartbeat 都不能反向定义新的 Lime runtime taxonomy。
5. Subagents 是 projection surface，不是新的执行引擎。

## 2. 标准引用与追溯页

Agent UI 标准引用统一落到专门页面，便于后续追溯，不在 Lime 文档里复制长篇标准原文。

| 类型 | 路径 / URL | 用途 |
| --- | --- | --- |
| v0.6.0 版本说明 | `/Users/coso/Documents/dev/ai/limecloud/agentui/docs/zh/versions/v0.6.0/overview.md` | 确认 Subagents、team event、runtime alignment 的版本边界。 |
| v0.6.0 changelog | `/Users/coso/Documents/dev/ai/limecloud/agentui/docs/zh/versions/v0.6.0/changelog.md` | 追踪新增 surfaces、controls、event classes 与 schema 字段。 |
| v0.6.0 specification | `/Users/coso/Documents/dev/ai/limecloud/agentui/docs/zh/versions/v0.6.0/specification.md` | 规范级字段、事件与投影规则。 |
| 全流程 taxonomy | `/Users/coso/Documents/dev/ai/limecloud/agentui/docs/zh/reference/flow-and-taxonomy.md` | Conversation、Process、Task、Team、Artifact、Evidence、Diagnostics 的全流程分类。 |
| 来源索引 | `/Users/coso/Documents/dev/ai/limecloud/agentui/docs/zh/reference/source-index.md` | Claude Code、AI SDK、assistant-ui、LangGraph、ChatKit 等来源追溯。 |
| Runtime projection contract | `/Users/coso/Documents/dev/ai/limecloud/agentui/docs/zh/contracts/runtime-event-projection.md` | runtime source event 到 Agent UI envelope 的投影约束。 |
| AgentRuntime Profile | `/Users/coso/Documents/dev/ai/limecloud/agentruntime/docs/zh/specification.md`、`internal/roadmap/agentruntime/README.md` | Lime runtime facts 主链与 `lime-profile-0.4.0` profile event 边界。 |
| AgentContext | `/Users/coso/Documents/dev/ai/limecloud/agentcontext/docs/zh/specification.md` | context envelope、selection、budget、compaction、missing context 的 owner 边界。 |
| AgentPolicy | `/Users/coso/Documents/dev/ai/limecloud/agentpolicy/docs/zh/specification.md` | permission、approval、grant、risk 与 policy trace 的 owner 边界。 |
| AgentEvidence | `/Users/coso/Documents/dev/ai/limecloud/agentevidence/docs/zh/specification.md` | evidence pack、claim/source/provenance、review、replay 与 completeness 的 owner 边界。 |
| JSON Schema | `https://limecloud.github.io/agentui/schemas/agentui-event.schema.json` | Lime adapter / contract test 对齐的公开 schema。 |
| 线上规范页 | `https://limecloud.github.io/agentui/zh/reference/flow-and-taxonomy` | 对外可引用的标准说明。 |

## 3. v0.6.0 标准更新结论

Agent UI 标准已经从“thinking/progressive rendering 局部规则”扩展为全流程 taxonomy。v0.6.0 的关键变化是：多 agent 不采用 Paperclip 式 AI company 隐喻，而采用 `team / teammate / workbench` 模型；Paperclip 只作为 background teammate / heartbeat pattern 的参考。

| 标准区域 | 关键规则 | Lime 对齐口径 |
| --- | --- | --- |
| Event envelope | `type`、`sequence`、稳定 id、`owner`、`scope`、`phase`、`surface`、`persistence`、`control`。 | `agentUiEventProjection.ts` 是 current adapter 边界。 |
| Ordered message parts | active run 按 typed event / part order 穿插渲染；thinking、tool、text、action 不集中堆到头部。 | `contentParts` / `StreamingRenderer.tsx` 已作为 current。 |
| Running process visibility | running reasoning / tool / action 默认可见，完成后折叠归档。 | inline process running 展开；completed timeline 折叠。 |
| Tool lifecycle | input streaming、input available、running、progress、output available、output error 分阶段。 | 真实 source event 投影为 `tool.args.delta`、`tool.progress`、`tool.output.delta`、`tool.result`、`tool.failed`。 |
| HITL / action | approval、plan decision、structured input、clarification、permission grant 保持结构化，不从 assistant 文本反推。 | `action.required` / `action.resolved` 已进入 projection；delegated approval 已补 plan approval 请求方 / 目标 session / 权限 / plan ref 结构化显示。 |
| Task / queue | foreground turn、queued steer、task capsule、background job 独立分类。 | queue/steer、`agent_turn/subagent_turn/automation_job` 已进入 projection；`work_item` 通过 team formation / review fix / TaskUpdate owner change 接入；`external_task` 通过 remote task metadata 接入。 |
| Subagents surfaces | `team_roster`、`work_board`、`delegation_graph`、`handoff_lane`、`worker_notifications`、`review_lane`、`teammate_transcript`、`background_teammate`、`remote_teammate`、`team_policy`。 | 10 个标准 surface 已进入 summary、lane、surface detail、操作视图与 action target 定位；后续只补更深 teammate drilldown 和 future command boundary。 |
| Team topology | `coordinator_team`、`parallel_workers`、`specialist_handoff`、`review_team`、`human_agent_board`、`background_teammate`、`remote_teammate`。 | coordinator / parallel / specialist handoff / review / background / remote / human board 均已有 projection baseline；直接 board/team 写回、原生 A2A ingress、remote control callback 归入 future product boundary。 |
| Team events | `agent.spawned`、`agent.completed`、`agent.handoff`、`team.changed`、`worker.notification`、`review.requested`、`review.completed`。 | 标准 event class 与 subagent/handoff/review 基线已接入；reviewer teammate baseline 已进 roster；handoff bundle / analysis handoff 导出已作为 runtime handoff source 以 `handoff_requested` 写入 `handoff_lane`；accepted/returned/resumed 的 phase mapping 已在 adapter 层就绪，并已接入最小真实 source：`subagent_status_changed` 证明 accepted/returned，`team_control_projection(action=resume)` 证明 resumed；reassignment 与 surface 消费继续收口。 |
| Team controls | `delegate`、`assign`、`continue_agent`、`wait`、`stop`、`close`、`request_review`。 | 标准 controls 已有 source projection 与 UI 定位；本地 child session control 走真实 handler，非本地 target 只定位或回填 prompt，不伪造完成态。 |
| Runtime execution alignment | `runtimeEntity=agent_turn/subagent_turn/automation_job/external_task/work_item`，保留 parent/child、runtime status、team phase、queue/parallelism facts。 | Lime taxonomy 已吻合；本地三类 runtime 为一等实体，`external_task/work_item` 只作为 adapter surface，不反向新增 runtime taxonomy。 |
| Worker notification separation | worker result / failure / kill / usage / transcript ref 不能冒充用户消息或 final answer。 | terminal subagent status 与 archived subagent activity 已独立投影 `worker.notification`；usage / duration / tool count / transcriptRef / result_ref 均来自结构化 source。 |
| Artifact / evidence | artifact body 离开 transcript，evidence/replay/review 走 durable refs。 | artifact/evidence/review/requested-fix execution metadata 已接入；artifact body 继续留在 artifact service/workbench。 |
| Context / permission / diagnostics | context budget、missing、compaction、policy、sandbox、safe diagnostics 独立分类。 | runtime context、permission、metrics 已有 projection；memory budget / missing context 等细分 source event 属于 v0.5 尾项增强，不阻塞 v0.6 Subagents baseline。 |

### 3.1 AgentRuntime Profile 与相邻标准增补

2026-05-11 起，AgentUI 与 AgentRuntime 的关系进一步收紧为：

```text
AgentRuntimeProfileEvent / ThreadReadModel / EvidenceSummary
  -> Agent UI envelope projection
  -> Workspace / Harness / Timeline / Task Capsule / Subagents
```

固定规则：

1. `schemaVersion = lime-profile-0.4.0` 的 dotted runtime profile event 是 runtime fact，不是未知产品噪声；P1 只要求前端保持 stream 活跃且不告警。
2. AgentUI 不直接拥有 `turn.submitted`、`model.requested`、`snapshot.updated` 等 execution truth；P2 后必须从 `ThreadReadModel` 或 profile projection 读取。
3. AgentContext facts 只能作为 context refs、budget、missing context、compaction summary 显示，不能成为 turn/task 状态。
4. AgentPolicy facts 只能作为 permission/action/risk/obligation 显示，不能绕过 runtime action response 写回。
5. AgentEvidence facts 只能作为 evidence/replay/review/completeness 显示，不能在 UI 里重新生成 verdict。

本增补对应 AgentRuntime 路线图的 [相邻标准边界](../agentruntime/adjacent-protocols.md)，属于 `current` 主链约束；旧的 UI-only runtime truth builder 继续归入 `deprecated/dead`。

## 4. Lime current 对齐情况

### 4.1 已对齐主链

| 标准要求 | Lime current 状态 | 主要入口 | 结论 |
| --- | --- | --- | --- |
| Active run typed part order | `contentParts` 中 thinking/tool/text/action 可按顺序穿插渲染。 | `src/components/agent/chat/components/StreamingRenderer.tsx` | `current` |
| Running process 展开，完成后折叠 | running thinking/tool/process group 默认展开，completed 自动折叠。 | `StreamingRenderer.tsx`、`AgentThreadTimeline.tsx` | `current` |
| Inline process 与 timeline 去重 | 存在 inline process 时隐藏 leading timeline，避免双重展开。 | `MessageList.tsx`、`AgentThreadTimeline.tsx` | `current` |
| Streaming 碎片不抢摘要 | 工具/稳定摘要优先，半截 token 不做 process group 标题。 | `agentThreadGrouping.ts` | `current` |
| 历史 reasoning 降噪 | completed 单条 reasoning 默认摘要，展开后显示完整正文。 | `AgentThreadTimeline.tsx` | `current` |
| 标准 envelope adapter | runtime events 归一化为 `owner/scope/phase/surface/persistence/control` 并写入 projection store。 | `agentUiEventProjection.ts`、`conversationProjectionStore.ts`、`agentStreamRuntimeHandler.ts` | `current` |
| Final answer 与 reasoning/tool 分离 | `text.delta`、`reasoning.delta`、`tool.*`、`action.required`、`run.finished` 已进入标准 envelope。 | `agentStreamRuntimeHandler.ts`、`agentStreamCompletionController.ts` | `current` |
| Tool lifecycle 全状态 | MCP/tool notification 与 provider tool input delta 已按真实 source event 投影。 | `agentUiEventProjection.ts`、`agentProtocol.ts`、`event_converter.rs`、`openai.rs`、`openai_responses.rs`、`anthropic.rs`、`InlineToolProcessStep.tsx` | `current` + 待增强 |
| HITL/action | `action_required`、tool confirmation、ask/elicitation、plan approval request/response 已结构化投影。 | `agentUiEventProjection.ts`、`agentProtocol.ts`、`subagent_runtime.rs`、`agent_control.rs`、`runtimeEventSubscriptions.ts` | `current` |
| Queue/steer/task capsule | queue 事件投影为 `queue.changed`；busy input 投影为 `task.changed/control=steer`。 | `agentUiEventProjection.ts`、`TaskCenterTabStrip.tsx`、`QueuedTurnsPanel.tsx`、`agentUiProjectionSummary.ts` | `current` |
| Artifact workspace | `artifact_snapshot` / `file_artifact` 投影为 artifact 事件，正文仍在 artifact service/workbench。 | `agentUiEventProjection.ts`、`AgentThreadTimelineArtifactCard.tsx`、`useWorkspaceArtifactPreviewActions.ts`、`agentUiProjectionSummary.ts` | `current` |
| Evidence/review/replay 基线 | evidence pack、replay case、analysis handoff、review decision 导出 / 保存写入 `evidence.changed`。 | `agentUiEventProjection.ts`、`conversationProjectionStore.ts`、`useConversationProjectionStore.ts`、`HarnessStatusPanel.tsx` | `current` + 待增强 |
| Session hydration | 旧会话 hydration 输出 `session.hydrated`、`messages.snapshot` 与 stale-safe `diagnostic.changed`。 | `historicalMessageHydrationProjection.ts`、`MessageList.tsx` | `current` + 待增强 |
| Context/memory/compaction | `context_trace`、`turn_context`、`context_compaction` 已投影；memory budget / missing context 待结构化。 | `agentUiEventProjection.ts`、memory runtime、thread items | `current` + 待增强 |
| Permission/security/policy | `runtime_status.metadata` 的 permission / confirmation / profile / decision 投影为 `permission.changed`。 | `agentUiEventProjection.ts`、runtime action、permission UI | `current` + 待增强 |
| Diagnostics/metrics | warning/error/thread diagnostics、runtime cost/performance/routing/limit/quota 写入标准投影。 | `agentUiEventProjection.ts`、`conversationProjectionStore.ts`、`agentUiProjectionSummary.ts`、`HarnessStatusPanel.tsx`、`AgentThreadReliabilityPanel.tsx`、`agentStreamPerformanceMetrics.ts` | `current` |

### 4.2 v0.6.0 Subagents 再审计

| v0.6.0 要求 | Lime 当前事实 | 主要入口 | 结论 / 缺口 |
| --- | --- | --- | --- |
| `runtimeEntity` 映射 | Lime taxonomy 已定义 `agent turn` / `subagent turn` / `automation job`；projection type 已显式携带 `runtimeEntity`。 | `internal/aiprompts/task-agent-taxonomy.md`、`agentUiEventProjection.ts`、`session_store.rs`、`subagent_runtime.rs`、`automation_service/*`、`remoteTaskAgentUiProjection.ts` | `current` + 待增强：本地 `agent_turn/subagent_turn/automation_job` 已接入；`work_item` 已通过 team formation -> work board baseline 写入；`external_task` 已从 gateway provenance -> `agent_runs.metadata` -> Subagents session-scoped projection baseline 接入。 |
| Team queue / parallelism facts | 数据源存在：`team_phase`、`team_parallel_budget`、`team_active_count`、`team_queued_count`、`provider_concurrency_group`、`queue_reason`。 | `session_store.rs`、`teamWorkspaceRuntime.ts`、`hooks/useTeamWorkspaceRuntime.ts`、`liveRuntimeProjector.ts` | `current`：已进入 `run.status`、`team.changed`、`agent.changed`、`task.changed` envelope；surface 详情消费继续收口。 |
| Subagents surfaces | Lime 已把 10 个标准 surface 收敛到 `AgentUiProjectionState.subagents`、`buildAgentUiSubagentsModel`、`agentUiSubagentsViewModel.ts` 和 `SubagentsView`；projection summary selector 继续提供 surface / lane / latest event 聚合，产品侧只能消费这些读模型和 action callback。 | `packages/agent-ui-contracts/src/projection.ts`、`packages/agent-runtime-projection/src/subagents.ts`、`packages/agent-runtime-ui/src/subagents.tsx`、`src/components/agent/chat/projection/agentUiSubagentsViewModel.ts`、`agentUiProjectionSummary.ts`、`teamWorkspaceRuntime.ts`、`team-workspace-runtime/*` | `current` + 待增强：标准包已经承接 threads、delegation calls、activities、active/completed/failed thread ids 与 isolation 摘要；产品侧旧本地 panel / board 入口已退出 current 标准面。更直接的 board/team API 写回仍是 future command boundary；后续只在新增 current 命令 / shared task board service 后接入，不在 UI 本地伪造完成态。 |
| `agent.spawned` / `agent.completed` | subagent spawn/status/activity 和 child session 存储存在，标准 projection 已从 `subagent_status_changed` 派生 lifecycle。 | `subagent_runtime.rs`、`runtimeEventSubscriptions.ts`、`agentUiEventProjection.ts` | `current`：`agent.changed` 继续保留为 summary 兼容事件。 |
| `team.changed` | team phase、membership、queue/concurrency facts 在 runtime UI 有聚合；发送前 team formation state 已作为结构化 source 写入 Agent UI projection。 | `session_store.rs`、`teamWorkspaceRuntime.ts`、`liveRuntimeProjector.ts`、`agentUiEventProjection.ts`、`teamFormationAgentUiProjection.ts`、`useWorkspaceSendActions.ts` | `current` + 待增强：runtime status、subagent status 与 team formation 已派生 `team.changed`；merging/done 的更细 source event 仍待增强。 |
| `worker.notification` | subagent activity、tool/task/action 事件已进入 projection store，terminal subagent status 与 archived subagent activity 已独立投影 worker notification；`subagent_status_changed` parser / projection 已支持 `usage`、`duration_ms`、`tool_count`、`result_ref`，terminal notification 顶层携带 `transcriptRef` 与 `workerUsage`；Rust status emitter 已在 terminal status 输出 session usage、latest turn duration、tool count 与 latest AgentMessage runtime item `result_ref`；Subagents view model 已把 worker usage / duration / tool count / result ref 展示到 subtitle / chips。 | `runtimeEventSubscriptions.ts`、`liveRuntimeProjector.ts`、`agentProtocol.ts`、`agentUiEventProjection.ts`、`agentUiSubagentsViewModel.ts`、`subagent_control.rs`、`subagent_runtime.rs` | `current` + 待增强：usage/duration/tool count 与 terminal `result_ref` 都已有真实 source；`result_ref` 来自 latest turn 的 durable Agent runtime item ref，后续如需 artifact 级结果可再接 artifact source。 |
| `agent.handoff` | analysis handoff 与 runtime handoff bundle 导出已通过 evidence helper 以 `handoff_requested` 投影到 `handoff_lane`，Subagents 已展示 status、from/to、resume target 与 context boundary；`buildAgentUiHandoffProjectionEvents` 已按 source-provided status 映射 `accepted/acting/reconciling/completed/failed/cancelled/waiting` phase，plan approval、send input、wait/resume/close 有结构化控制。 | `HarnessStatusPanel.tsx`、`agentUiEventProjection.ts`、`agentUiProjectionSummary.ts`、`agentUiSubagentsViewModel.ts`、`subagent_runtime.rs`、`useWorkspaceTeamSessionControlRuntime.ts` | `current` + 待增强：runtime handoff bundle / analysis handoff 已有真实 `handoff_requested` source event；`subagent_status_changed` 现在会把 child running/completed/failed/cancelled 映射为 specialist handoff accepted/returned/failed/cancelled；`team_control_projection(action=resume)` 会在真实 affected session 返回后映射为 resumed；仍缺更独立的 handoff protocol callback 与外部 specialist lifecycle。 |
| `review.requested` / `review.completed` | Harness review decision 导出/保存已通过 review helper 投影到 `review_lane`；导出 review template 时也会记录 `team_control_projection(control=request_review)`，把人工审核请求作为 review work item 暴露给 Subagents；surface detail 已展示 decision、reviewer、risk、checklist、followup、regression counts、requested fixes 与 regression requirement preview；review completed 的 reviewer 已额外进入 team roster；`verification_summary` 的 failure/recovered facts 已回写到 review payload 和 requested-fix work item；`team_control_projection(action=reassign)` 已能表达 work item reassignment source；`TaskUpdate` owner 变更已输出结构化 `owner_change` 并由 `item_completed` 投影到 `work_board` assign/reassign。 | `HarnessStatusPanel.tsx`、`agentUiEventProjection.ts`、`teamControlAgentUiProjection.ts`、`agentUiProjectionSummary.ts`、evidence/review runtime | `current` + 待增强：reassignment adapter baseline 与 TaskUpdate owner_change board source 已有；requested fix execution 已能从 `artifact_snapshot` metadata 即时回写 `work_board`，并从 evidence artifact metadata 进入 verification summary 与 review decision；前端 reassignment selector/callback 已接入为 TaskUpdate owner 更新指令回填，负责人变化仍以真实 `owner_change` source 确认；requested fix 可回填输入框作为人工确认后的执行发起入口；board 完成态按 source-provided executionStatus 可见化，后台无确认自动执行仍不伪造。 |
| `background_teammate` | durable automation job 是 current 执行实体；automation 创建/加载/更新/删除/立即运行已投影为 `runtimeEntity=automation_job`、`background_teammate`、`task_capsule` 与 terminal `worker.notification`。 | `lime-rs/src/services/automation_service/*`、`lime-rs/src/commands/automation_cmd.rs`、`src/lib/api/automation.ts`、`automationJobAgentUiProjection.ts`、`settings-v2/system/automation/index.tsx`、`WorkspaceRegisteredSkillsPanel.tsx` | `current` + 待增强：settings automation 与 capability drafts managed automation 入口已接持续刷新；仍可继续把 skills automation 等其它消费入口接入同一 helper。 |
| `remote_teammate` | current gateway ingress（Telegram / Feishu / Discord / Wechat）已在 `agent.run` 传入 `source_metadata.remote_task`，包含 channel、account、remote task id、inbound message identity 与 Agent Card；`rpc_handler.rs` 会把 snake/camel 两种 source metadata 持久化到 `agent_runs.metadata`，terminal metadata 合并时保留 provenance；`remoteTaskAgentUiProjection.ts` 已能从 `AgentRun.metadata.source_metadata.remote_task` 构造 `runtimeEntity=external_task` projection，并写入 `conversationProjectionStore.agentUi`。 | `internal/aiprompts/remote-runtime.md`、`channelsRuntime.ts`、`gateway_channel_cmd.rs`、`lime-rs/crates/gateway/src/*`、`rpc_handler.rs`、`remoteTaskAgentUiProjection.ts`、`useRemoteTaskExecutionRunProjection.ts` | `current` + `partial`：gateway remote ingress 已成为 Agent UI `remote_task_projection` actual source baseline；terminal `AgentRun.status` 仍优先，且 `remote_task.event/taskStatus/status/state/phase` 已可驱动 A2A lifecycle，不从 heartbeat、gateway 日志文本、assistant prose 或普通 session message 猜测；远端 artifact 指针继续保留为 refs；真正原生 A2A ingress 与 remote artifact store/content 回流已审计为 future product boundary。 |
| `work_board` / `assign` | Team board canvas 和 task capsule 有 UI 基础；发送前 `TeamWorkspaceRuntimeFormationState` 已记录 `team_formation_projection`，输出 `agent.changed(surface=team_roster/control=assign)` 与 `task.changed(surface=work_board/control=assign)`；`TaskUpdate` owner 变更会输出 `owner_change` metadata，`item_completed` projection 会把初次 owner 写入映射为 `assign`，把 owner 切换映射为 `reassign`。 | `team-workspace-board/*`、`TaskCenterTabStrip.tsx`、`teamWorkspaceRuntime.ts`、`teamFormationAgentUiProjection.ts`、`useWorkspaceSendActions.ts` | `current` + 待增强：assignment / TaskUpdate owner_change reassignment baseline 不再依赖 runtime status hack 或 peer message 文本；已提供可见 reassignment selector/callback 的 TaskUpdate 指令回填；后续若要做到无 prompt 的直接 live board update，需先新增 current board/team 命令边界或 shared task board service；当前不从 UI 本地写状态，review work item 与完成态继续只认 source fact。 |
| Team controls | spawn/send/wait/resume/close 已有；stop 通过前台 stopSending；subagent task projection 已把 `idle/queued/running/terminal` 映射为 `continue_agent/wait/stop/close`；`agent.spawned` 已携带 `delegate`；`team_control_projection` adapter 已覆盖 `delegate/assign/continue_agent/wait/stop/close/request_review` 标准 control，并可用 `action=reassign` + `control=assign` 表达 work item reassignment；当 source 提供 `resolvedStatus` 时会优先映射为 top-level `phase/runtimeStatus`，避免已知完成/失败/assigned 状态被固定显示成 queued/completed；Team formation 已作为 actual assignment source 投影 `assign/work_item`；Harness review template 导出已作为 actual review request source 投影 `request_review/work_item`。 | `useWorkspaceTeamSessionControlRuntime.ts`、`teamControlAgentUiProjection.ts`、`teamFormationAgentUiProjection.ts`、`HarnessStatusPanel.tsx`、`agentUiEventProjection.ts`、`subagent_runtime.rs`、`agent_control.rs` | `current` + 待增强：现有 control 均已有实际来源；reviewer teammate baseline 已进入 roster；requested fix execution artifact metadata 已进入 `work_board` 即时投影与 review decision source；reassignment adapter、TaskUpdate owner_change source 与 source-provided `resolvedStatus` 映射已有；前端可见 reassignment selector/callback 已接入为 TaskUpdate 指令回填，真实负责人变化仍等 `owner_change` source；requested fixes 已可回填输入框作为人工确认后的执行发起入口，也可在用户显式点击后直接提交 runtime turn，且 prompt 已声明 `requestedFixExecutionResults` metadata contract；board 完成态已按 source-provided executionStatus 可见化，后台无确认自动执行仍不伪造。 |
| Delegated approval identity | team lead / teammate plan approval 已结构化，能发出 `action_resolved`；direct `action_resolved(plan_approval)` projection 已保留 `targetSessionId`、`planFile`、`planId` 与 `awaitingLeaderApproval`，summary/detail 已显示请求方、目标 session、权限模式、leader 审批等待与 plan ref，不只剩 metadata keys。 | `subagent_runtime.rs`、`agent_control.rs`、`runtimeEventSubscriptions.ts`、`agentUiEventProjection.ts`、`agentUiProjectionSummary.ts` | `current` + 待增强：后续如 runtime 提供更细 policy / transcript ref，可继续进入同一结构化详情，不从 prose 反推。 |
| Teammate transcript | child session / parent context 存在；`subagent_status_changed` 已派生 `agent.changed(surface=teammate_transcript, control=open_detail, transcriptRef=...)`；summary selector 与 Subagents view model 已能把 transcript ref 作为 action target 定位；本地 child session 焦点、live activity preview、历史 activity snapshot fallback 与 queued turn / thread item drilldown 均只消费结构化 fact，不从正文合成状态。 | `agentUiEventProjection.ts`、`agentUiSubagentsViewModel.ts`、`useWorkspaceCanvasSceneRuntime.tsx`、`teamWorkspaceRuntime.ts` | `current` + 待增强：transcript ref 事实源、target 定位、本地 child session 焦点、live activity preview、历史 activity snapshot fallback、queued turn / thread item 结构化 drilldown 与 related projection chain 已接入；仍需真实 pending input 操作 handler / 更深 transcript drilldown，且继续避免把 teammate 内部输出直接混进主 final answer。 |

## 5. Current / compat / deprecated / dead 分类

| Surface | 分类 | 说明 | 退出条件 |
| --- | --- | --- | --- |
| `contentParts` ordered rendering | `current` | active message parts 的主要 UI 投影事实源。 | 无。继续演进。 |
| `conversationProjectionStore.agentUi` | `current` | Agent UI envelope 的前端 projection store，后续 Task / Team / Artifact / Evidence / Diagnostics 消费都应走这里。 | 无。继续演进。 |
| `agentUiEventProjection.ts` | `current` | source event -> Agent UI envelope 的 current adapter。 | 补齐 v0.6 `runtimeEntity`、team event classes、team surfaces 后继续作为唯一 adapter。 |
| `threadItems` / `threadTurns` / `thread_read` timeline | `current` | 完成态过程归档、历史恢复、evidence 链路的主事实源。 | 无。继续演进。 |
| Inline active process | `current` | active turn 的首要过程投影；running 时优先于 timeline detail。 | 无。继续演进。 |
| Historical timeline archive | `current` | completed process 的归档投影；默认折叠。 | 无。继续演进。 |
| Subagents runtime cards / live runtime projector | `current` | subagent/team runtime 的 current UI 读模型。 | 标准 surfaces 补齐后，作为 Subagents projection consumer。 |
| Subagent runtime controls `spawn/send_input/wait/resume/close` | `current` | Lime teammate / child session 的 current 控制入口。 | 对齐标准 control 名称，补 `delegate/assign/continue_agent/wait/stop/close/request_review` 的 adapter。 |
| Automation job | `current` | durable background execution 的 current 执行实体；创建、更新、删除、立即运行、列表 / 状态 / run history 刷新已投影为 `runtimeEntity=automation_job`、`background_teammate`、`task_capsule` 与 terminal `worker.notification`。 | 后续其它 automation 消费入口继续接同一 projection helper；不得拆出新 runtime taxonomy。 |
| Remote task projection | `current` + actual source `partial` | `remoteTaskAgentUiProjection.ts` 是 `remote_task_projection` 的唯一 current builder；它输出 `agent.changed/task.changed(surface=remote_teammate, runtimeEntity=external_task)`、artifact refs 与 terminal `worker.notification`，`agentUiEventProjection.ts` 只保留兼容 wrapper。2026-05-10 已接入 gateway provenance：渠道 runtime 在 `agent.run` 写入 `source_metadata.remote_task`，RPC terminal metadata 合并保留该 source，前端按 terminal `AgentRun.status`、结构化 remote task status 与 metadata 投影当前 session remote teammate。 | terminal `AgentRun.status` 仍优先；非 terminal run 可消费 `remote_task.event/taskStatus/status/state/phase` 这类结构化 remote task source，不得用 heartbeat、gateway 日志、assistant prose、普通 session message 或 teammate XML/JSON 文本反推。真正原生 A2A ingress、remote artifact store/content 回流与更完整远端任务详情归入 future product boundary；current baseline 继续只消费结构化 remote_task source。 |
| `subagent_status_changed -> agent.changed` 单一投影 | `current` + 旧语义 `compat` 退出中 | 已补 `agent.spawned`、`agent.completed`、`team.changed`、`worker.notification`、queue/team/provider facts；`agent.changed` 继续作为 summary 兼容事件。 | 后续 UI 消费全部改读 v0.6 event classes 后，`agent.changed` 只保留通用状态摘要。 |
| `thinkingContent` fallback | `compat` | 仅作为 contentParts/reasoning 持久化不完整时的兜底。 | 历史 session 均能从 `contentParts` 或 `threadItems.reasoning` 恢复后删除。 |
| Scheduler tick 作为产品级 task taxonomy | `compat` -> `deprecated` | 只能作为“发现到期任务并触发 automation job”的兼容触发壳。 | 后续若保留 scheduler，也只能做触发器；新后台能力一律落 `automation job`。 |
| Active turn leading timeline duplicate | `deprecated` | 与 inline process 同屏重复时必须被抑制。 | 保持只在没有 inline process fact 时作为 fallback。 |
| 从 assistant prose 推断 tool/artifact/success | `dead` | 与标准冲突；后续不得新增。 | 现有必要解析只能停留在 migration/fallback，并登记退出条件。 |
| 从 teammate XML/JSON 文本反推 worker result / approval | `dead` | v0.6 要求 worker notification 与 delegated approval 是结构化 fact。 | 只能保留在历史迁移或外部兼容边界；current 不再新增。 |
| `execution run` 作为 coordinator / task taxonomy | `dead` | `ExecutionTracker` 只能做观测层，不定义分工、调度或 parent/child 编排。 | 新设计不得把 `agent_runs` 当成 Subagents coordinator。 |
| Remote heartbeat 作为 terminal completion | `dead` | remote teammate 需要 remote truth / task status / artifact update，不得用 idle tick 猜完成。 | future remote adapter 必须保留 remote task id 和真实 terminal state。 |

## 6. 后续增强 / future boundary 清单

当前 Lime 的 v0.6.0 projection baseline 已完成；本节保留的是后续增强 / future boundary，不再作为 v0.6.0 完成阻塞项。

| 后续优先级 | 后续项 | 影响 | 期望收口 |
| --- | --- | --- | --- |
| P0 | `runtimeEntity` 显式字段 / 类型 | 已可机械证明 `agent_turn/subagent_turn/automation_job` 进入 Agent UI envelope；`work_item` 已有 team formation -> work board baseline；`external_task` 已有 remote task projection helper。 | 继续禁止新建第四类 runtime taxonomy；remote helper 只能消费真实 remote source。 |
| P0 | team queue / parallelism facts 进入标准 envelope | Team UI 与 Agent UI projection 已共享 team/provider queue facts。 | 继续补 surface 详情消费，避免各 UI 局部重算。 |
| P0 | `agent.spawned` / `agent.completed` 独立于 `agent.changed` | 已表达 teammate lifecycle、worker terminal result 与 parent/child lineage。 | 后续补更精确的 spawn source 与 transcript refs。 |
| P0 | `worker.notification` 独立 surface | terminal subagent status 与 archived subagent activity 已进入 `worker_notifications`，不进入主 transcript/final answer；terminal status projection 已保留 `transcriptRef`，Rust status emitter 已提供 usage / duration / tool count / result_ref，Subagents 操作视图已显示这些 worker result facts。 | 已补 latest turn AgentMessage 的 durable runtime item `result_ref` source；后续如需 artifact 级结果再接 artifact source，仍不从 teammate 文本反推。 |
| P1 | Subagents surfaces consumer 基线已接入 | summary panel 已展示 roster、board、delegation、handoff、notifications、review、transcript、background、remote、policy 的 scoped counts、latest events、`Team 拓扑 / Worker 流 / Review-Handoff` lanes、可展开 surface detail 与 `工作台操作视图`；独立 view model 已保留 action target 与 attention 状态，并把 `review_requested_fix` work item 显式展示为可指派 Review fix，且能展示结构化 regression outcome；`team_reassignment` work item 已显示重新指派目标、负责人流转、原因与 action label；panel 已能把 action item 回传并在右侧定位标准 target；subagent status 已提供 teammate transcript ref target；`teammate_transcript/open_detail` 已有 Transcript Zoom 定位面，解析 child session / latest turn，并展示本地 child session 概览、live activity preview、历史 activity snapshot fallback、同目标 related projection chain 与 requested fix / worker result 的 artifact/evidence/result ref 追溯。 | 已补非本地 target route taxonomy、可见状态、requested fix 显式点击后的 runtime turn 提交与重指派 selector/callback 的 TaskUpdate 指令回填；直接 board/team API 写回已审计为 future command boundary，当前不作为 v0.6 projection 对齐阻塞项；后台无确认策略和更完整 teammate drilldown 排后。 |
| P1 | `agent.handoff` 基线已建模 | analysis handoff helper 与 handoff bundle 导出都已保留 from/to/reason/resume target/context boundary，并写入 `handoff_lane`；Subagents surface detail / 操作视图已能显示 handoff status、from/to、resume target 与 context boundary；handoff projection adapter 已把真实 source status 映射到标准 phase。 | 最小真实 source 已接：accepted/returned 来自 `subagent_status_changed`，resumed 来自真实 resume control response；后续补更独立的 handoff protocol callback，不从 review decision 或 prose 合成。 |
| P1 | Review lane 基线已与 evidence 合流 | `review.requested` / `review.completed` 已进入 `review_lane` 并关联 evidence refs；review template 导出也会同步记录 `request_review/work_item` team control projection；surface detail 已展示 reviewer、risk、checklist、followup、regression、requested fixes 与 regression requirement preview；`review.completed` 已把 reviewer 投影为 `team_roster` reviewer teammate；requested fixes 已派生为 `work_board` work item，并在工作台操作视图中显示修复正文、pending 状态、regression outcome 和 assign target；`team_control_projection(action=reassign)` 已能表达 reassignment source。 | requested fix execution artifact metadata 已进入 evidence / review decision 链路；TaskUpdate owner_change source 已接入 work_board；前端 reassignment selector/callback 已以 TaskUpdate 指令回填方式接入；当前已支持把 pending fix 回填输入框，由用户确认发送后执行，也支持用户显式点击后直接提交主线程 runtime turn，并要求后续写入 `requestedFixExecutionResults` metadata；artifact snapshot 一旦带回该 metadata，会即时把 board 完成状态按 source-provided executionStatus 展示为“待执行修复 / 修复完成”等可见状态。 |
| P1 | Control 接线尾项 | `team_control_projection` adapter 已能表达 `delegate/assign/reassign/continue_agent/wait/stop/close/request_review`；现有 wait/resume/send_input/close/stop 已接 UI 操作且带 session scope；`agent.spawned` 已作为 delegation source 携带 `delegate`；Team formation 已把 actual assignment source 投影为 `assign/work_item`；Harness review template 导出已把 actual request_review source 投影为 review work item；Subagents action click 已只做标准 target 定位；无本地 child session 时会明确返回并显示 located_only / remote_task_source_located / unsupported_review / unsupported_handoff / unsupported_work_item / seeded_work_item；pending requested fix 可回填输入框，也可在用户显式点击后提交 runtime turn；两条路径都不伪造运行时完成。 | 当前 control 来源已覆盖主路径；更细 review teammate 状态、无人工确认后台执行策略与无 prompt board/team API 写回都属于后续产品增强，直接写回需先补 current 命令边界。 |
| P2 | Background teammate 持续刷新 | settings automation 页刷新、创建、更新、删除、立即运行，以及 capability drafts managed automation 列表/开关已记录 `automation_job_projection`，并持续投影到 `background_teammate` / `task_capsule` / `worker_notifications`。 | 保持 automation job 为 current 执行实体；后续只需补 skills automation 等其它消费入口，不新增 runtime taxonomy。 |
| P2 | Remote teammate adapter | `remoteTaskAgentUiProjection.ts` 已提供 `external_task -> remote_teammate` adapter baseline，保留 Agent Card、remote task id、input/auth、artifact updates 与 terminal worker notification；gateway current ingress 已把真实 channel provenance / remote task id / Agent Card 通过 `agent_runs.metadata` 接入该 helper。 | 真正原生 A2A ingress、remote artifact store/content 回流、远端详情与控制 callback 已登记为 future product boundary；current baseline 不用假 remote surface、heartbeat completion 或普通文本反推状态。 |
| P2 | Context/memory 细分事件 | v0.5 尾项仍存在。 | memory budget、missing context、retrieval refs 结构化 source event。 |
| P2 | 其他 provider tool input streaming | 只有支持真实 streaming input 的 provider 才能补。 | Bedrock / Databricks / Snowflake 等不得从最终 arguments 反推。 |

## 7. 下一刀排序

按对整体目标完成度的增量排序；若隔壁进程正在改 v0.6 Subagents / controls 文件，本进程只选择已确认非重叠的低冲突 projection 接线，不抢 Rust 高冲突实现文件或同一批 Team UI patch。

1. **深化 Subagents 专门视图**：summary consumer、scoped lane selector、native collapsible surface detail、view model、可见 `工作台操作视图`、action target 定位、requested fixes work item + regression outcome 展示、local child session action routing、`teammate_transcript` source / Transcript Zoom / live activity + 历史 activity snapshot preview，以及 related teammate projection chain 已接入；非本地 target route taxonomy 与可见状态已补（含 work_board work item 未接入态、requested fix submitted_work_item、reassignment source fact 已定位态与 seeded_reassignment），直接 board/team API 写回已审计为 future command boundary；统一门禁已于 2026-05-10 fresh green；原生 A2A artifact content 已登记为 future product boundary，后台无确认策略和更完整 teammate drilldown 排后。
2. **补 Review lane 余量**：review request 已有 actual source，surface detail 已展示 reviewer、risk、checklist、followup、regression、requested fixes 与 regression requirement preview；review 保存后的 `verification_summary` failure/recovered facts 已进入 review payload 与 requested-fix work item；`team_control_projection(action=reassign)` 已能表达 reassignment source，TaskUpdate owner_change 已作为真实 board source 投影到 work_board；pending requested fix 已支持显式点击后提交 runtime turn；无 prompt 的直接 board/team API 写回已降级为 future command boundary；统一门禁已收敛，后续只在新增 current board/team command 或 specialist handoff protocol 后继续接入；原生 A2A artifact content 已登记为 future product boundary。
3. **补其它 automation 消费入口**：settings automation 与 capability drafts managed automation 已接持续刷新；后续如 skills automation 列表需要展示 background teammate，也接 `recordAutomationJobsAgentUiProjection`，不新增 runtime taxonomy。
4. **remote teammate / A2A source 接线**：gateway actual source、remote task status/input/auth/artifact refs baseline 已有；真正原生 A2A ingress、remote artifact store/content 回流与远端控制 callback 已登记为 future product boundary，不用假 remote surface。
5. **v0.5 尾项回补**：Context/memory 细分 source event、其他 provider tool input streaming、HITL/action 历史重放归档，排在 v0.6 Subagents 主缺口之后。

## 8. 2026-05-09 v0.6.0 再审计记录

- 已确认 Agent UI 标准版本为 `v0.6.0`，local commit 为 `dcf4bc5`，公开 schema 为 `https://limecloud.github.io/agentui/schemas/agentui-event.schema.json`。
- 已确认 Lime current taxonomy 只承认 `agent turn`、`subagent turn`、`automation job`，与 Agent UI `runtimeEntity` 的三类本地映射一致。
- 已确认 Lime 已有 subagent runtime、child session、team phase、queue/provider concurrency 数据源，主要缺口在标准 projection envelope 和 Subagents surface 消费。
- 已确认 projection type 已补 v0.6 `runtimeEntity`、team controls 枚举与 `agent.spawned/agent.completed/team.changed/worker.notification/agent.handoff/review.*` event class；未完成项集中在 surface 详情消费、controls adapter、background/remote/board adapter。
- 已将旧下一刀从 Context/memory、provider tool streaming、HITL replay 调整为 v0.6 P0：先补 `runtimeEntity`、queue/parallelism facts、Subagents event classes。
- 已推进 Lime 实现增量：`runtime_status.metadata` 会投影 `runtimeEntity` 与 team queue/provider facts；`subagent_status_changed` 会派生 `agent.spawned`、`agent.completed`、`team.changed`、`worker.notification`；analysis handoff、runtime handoff bundle 与 review decision 已通过 helper 投影到 `agent.handoff`、`review.requested`、`review.completed`；handoff 导出只标记 `handoff_requested`，表示交接包已生成但尚未被 specialist 接受。`agent.handoff` adapter 已按 source-provided status 映射 `accepted/acting/reconciling/completed/failed/cancelled/waiting` phase；accepted/returned/resumed 已有最小 runtime/control source，仍不从 review decision、assistant prose、teammate transcript 或 heartbeat 合成。
- 已补 automation job projection 增量：SceneApp / Service Skill 创建自动化任务时记录 `automation_job_projection`，同时输出 `task.changed`、`agent.changed(surface=background_teammate)`，terminal 结构化记录可输出 `worker.notification`；surface selector 已支持按 `AgentUiSurface` 从 `conversationProjectionStore.agentUi` 读取。
- 已补 background teammate 持续刷新增量：`recordAutomationJobsAgentUiProjection` 支持批量记录 automation job 列表刷新；settings automation 页在刷新、创建、更新、删除、立即运行后会把 automation job 结构化记录到 Agent UI projection。
- 已补 capability drafts managed automation 增量：`WorkspaceRegisteredSkillsPanel` 加载 / 开关 managed automation job 时会记录 automation job projection，让 workspace skill 绑定视图里的后台 teammate 与 settings automation 共享同一事实源。
- 已补 Subagents surface consumer 增量：`agentUiSubagentsViewModel.ts` 通过 `useAgentUiProjectionEvents` 读取当前 session 的 Agent UI projection，并支持展示 `team_roster/work_board/delegation_graph/handoff_lane/worker_notifications/review_lane/teammate_transcript/background_teammate/remote_teammate/team_policy` 全量 surface 的计数与 latest events；对应回归覆盖 10 个 surface。
- 已补 Subagents scoped lane 增量：`agentUiProjectionSummary.ts` 现在提供可复用 lane selector，同一 summary consumer 按 `Team 拓扑`、`Worker 流`、`Review / Handoff` 三类聚合 latest events，避免 10 个 surface 只停留在扁平计数。
- 已补 Subagents surface detail 增量：`agentUiProjectionSummary.ts` 现在提供 10 个标准 surface 的 detail selector，`SubagentsView` 展示 native collapsible `Surface 专门视图`，让每个 surface 可直接查看 latest events、phase 与 detail，而不是只能看总数。
- 已补 Subagents action 定位闭环：`agentUiSubagentsViewModel.ts` 将 10 个标准 surface 归一成 section / item / action / target / attention 模型，`SubagentsView` 将其渲染为 `工作台操作视图`；产品侧 action callback 点击后会回传 item 并在右侧展示标准 target 明细，但不会从文本推断状态或伪造 remote / review / handoff 运行时调用。
- 已补 teammate transcript source 增量：`subagent_status_changed` 现在额外派生 `agent.changed(surface=teammate_transcript, control=open_detail)`，携带 `transcriptRef`；`agentUiSubagentsViewModel.ts` 对 `teammate_transcript` 优先使用 `transcriptRef` 作为 action target，保证 Subagents 可以定位队友 transcript，而不是把队友内部输出混入主 final answer。
- 已补 teammate transcript zoom 定位基线：`SubagentsView` 点击 `teammate_transcript/open_detail` 后展示 Transcript Zoom，显式列出 `transcriptRef`、父会话、子会话与最新回合；`useWorkspaceCanvasSceneRuntime.tsx` 的 action routing 会从 `childSessionId:turnId` 或 `parent/childSessionId` ref 解析本地 child session 焦点。该面板只做定位，不读取或复制 child transcript 正文到主 final answer。
- 已补 teammate transcript live activity 预览基线：Transcript Zoom 在命中本地 child session 时展示子会话名称、状态、回合状态、角色、任务摘要，并读取 `liveActivityBySessionId[childSessionId]` 的最近进展；这不是从主 assistant prose 反推，也不会把 teammate 输出写入主 final answer。
- 已补 teammate transcript 历史正文 fallback：当 Transcript Zoom 命中本地 child session 但没有 live activity 时，`SubagentsView` 会用 `getAgentRuntimeSession(childSessionId, { historyLimit: 20 })` 读取子会话详情，并复用 `extractSessionActivitySnapshot` 生成最近 3 条历史 activity preview；该 preview 仍只展示在 teammate_transcript zoom 内，不写入主 final answer。
- 已补 selected teammate related projection chain：`SubagentsView` 点击任一工作台 action 后，会按 agent / task / work item / review / handoff / remote task / transcript ref 精确匹配并展示同一目标的相关 projection 事件，用于把 roster、board、transcript、worker notification 串起来；该链路只读取结构化 Agent UI projection，不合成新的 runtime fact。
- 已补 worker notification result facts 前端 adapter：`agentProtocol.ts` 会解析 `subagent_status_changed` 的 `usage`、`duration_ms`、`tool_count`、`result_ref`；`agentUiEventProjection.ts` 在 terminal `worker.notification` 上保留 `transcriptRef`、`workerUsage` 和 payload 中的 duration / tool count / result ref。该增量只透传 source event 真值，不从 assistant prose 或 teammate transcript 反推。
- 已补 worker notification Rust source 增量：`SubagentRuntimeStatus` 只在 terminal status 上解析 session token usage、latest turn duration、latest turn tool count 与 latest AgentMessage runtime item `result_ref`，`SubagentStatusChangedEvent` 输出 `usage`、`duration_ms`、`tool_count`、`result_ref` 给前端 adapter；`result_ref` 来自 runtime snapshot item，不从 teammate 文本反推。
- 已补 worker notification GUI baseline：`agentUiSubagentsViewModel.ts` 会把 worker `transcriptRef`、`workerUsage`、duration、tool count 与 result ref 展示到操作视图 subtitle / chips；该展示仍只消费结构化 projection payload，不把 teammate 输出当作 worker result。
- 已补 Review lane 细状态展示：`formatAgentUiProjectionEventAuxiliaryDetail` 会把 review payload 中的 `decisionStatus`、`reviewer`、`riskLevel`、`checklistCount`、`followupActionCount`、`regressionRequirementCount` 转成 lane 辅助详情，并在 Subagents surface detail 中展示。
- 已补 Review requested fixes 明细：`buildAgentUiReviewProjectionEvents` 会保留 `requestedFixes`、`followupActions`、`regressionRequirements` 预览列表；`HarnessStatusPanel` 导出 / 保存 review decision 时把人工审核 followup actions 与 regression requirements 写入 projection；Subagents surface detail 展示首条修复与回归要求。
- 已补 Review requested fixes work item 可见基线：`review.completed` 派生的 `task.changed(surface=work_board, runtimeEntity=work_item)` 现在会在 Subagents view model 中以修复正文作为 title，显示 `Review fix` / `pending` chip，并保留 `assign` control 与 review/work item target；这仍不代表修复已执行或已回写完成。
- 已补 Review requested fix regression facts 基线：`HarnessStatusPanel` 会把 review template / save 结果里的 `verification_summary.focus_verification_failure_outcomes`、`focus_verification_recovered_outcomes` 与 artifact validator outcome 转为 `regressionOutcome`，写入 `review.requested` / `review.completed` payload 和 requested-fix work item；Subagents view model 会在修复项 subtitle / chip 显示 `回归：recovered|blocking_failure`。该增量只消费结构化 review/evidence fact，不把 pending fix 标成已执行。
- 已补 requested fix execution source：`agentUiEventProjection.ts` 会从真实 `artifact_snapshot.metadata.requestedFixExecutionResults` 即时派生 `task.changed(surface=work_board, taskEvent=review_requested_fix)`，同时 `runtime_evidence_pack_service.rs` 从 `FileArtifact.metadata.requestedFixExecutionResults` / `requested_fix_execution_results` 收集执行结果，`runtime_review_decision_service.rs` 会把该结果带入 `verificationSummary.requestedFixExecutionResults` 并在 review decision Markdown 中显示 completed / recovered / blocked 统计与 `result_ref`；该链路只消费 artifact/evidence metadata，不从 review prose 或 teammate transcript 推断完成态。
- 已完成 requested fix regression facts 定向复验：3 个相关测试文件 / 64 个测试通过，相关 ESLint 通过，`npm run typecheck` 通过；`npm run verify:local` 与 `npm run verify:gui-smoke` 被隔壁 v0.6 Rust/protocol 并行变更阻断，失败点是 `AgentTokenUsage` 尚未实现 `PartialEq/Eq`，本轮为避免冲突未修改 Rust 高冲突文件。
- 已补 Review reviewer teammate 基线：`review.completed` 里存在 `reviewer` 时，`buildAgentUiReviewProjectionEvents` 会额外输出 `agent.changed(surface=team_roster, topology=review_team, runtimeEntity=work_item)`，保留 reviewer 名称、review id、decision/risk 与 `open_detail` target；该事件来自 review evidence fact，不从 prose 反推。
- 已完成 reviewer teammate 基线复验：`npm run verify:local` 通过，覆盖 app-version、lint、typecheck、Vitest smart 52 批、contracts、Rust `cargo test --manifest-path lime-rs/Cargo.toml` 与 GUI smoke。
- 已完成 requested fixes work item 展示增量复验：`npm run verify:local` 通过，覆盖 app-version、lint、typecheck、Vitest smart 52 批、contracts、Rust `cargo test --manifest-path lime-rs/Cargo.toml` 与 GUI smoke；GUI smoke 跑通 workspace-ready、browser-runtime、site-adapters、agent-service-skill-entry、agent-runtime-tool-surface、agent-runtime-tool-surface-page、knowledge-gui、design-canvas。
- 已补 Team controls projection 基线：`subagent_status_changed -> task.changed` 会按 teammate status 给出 `continue_agent/wait/stop/close` 标准 control，`agent.spawned` 会给出 `delegate`；`teamControlAgentUiProjection.ts` 已把 wait/resume/send_input/close/stop 等实际 Team 操作记录为 `team_control_projection`，输出 `team.changed(surface=team_policy)` 与 `task.changed(surface=work_board)`；adapter 同时已支持 `delegate/assign/request_review`，分别落到 `delegation_graph/work_board/review_lane`，并优先消费 source-provided `resolvedStatus` 作为 top-level phase/runtimeStatus。
- 已补 Subagents 非本地 target route taxonomy 与可见状态：产品侧 Subagents action callback 在命中本地 child session 时继续接 `continue_agent/wait/close/stop` 真实 handler；没有本地 child session 时按标准 target 返回 `located_only`、`remote_task_source_located`、`unsupported_review`、`unsupported_handoff`、`unsupported_work_item`，pending requested fix 可返回 `seeded_work_item` 并回填输入框，`team_reassignment` source fact 可返回 `work_item_source_located`，负责人 selector/callback 可返回 `seeded_reassignment` 并回填 TaskUpdate 指令；`SubagentsView` 会展示“只定位 / 远端任务已定位 / 审核未接入 / 交接未接入 / 工作项未接入 / 已回填输入 / 重指派已回填”等状态，让 UI 保持定位可追溯，同时不伪造 remote / review / handoff runtime 调用，也不伪造 work_board 完成态。
- 已补 requested fix work board 状态可见化：`agentUiSubagentsViewModel.ts` 会把 source-provided `executionStatus` 显示为“待执行修复 / 修复完成 / 修复失败”等状态，并把 pending assign 标为“指派修复”、completed open_detail 标为“查看修复结果”；该增量只消费 review/evidence fact，不伪造修复执行。
- 已补 requested fix 执行发起入口 baseline：产品侧 Subagents action callback 对 pending `review_requested_fix` work item 可生成修复 prompt 并回填输入框，返回 `seeded_work_item`；发送仍由用户确认触发，不自动伪造执行中或完成态。
- 已补 requested fix seed prompt 的 execution result metadata contract：pending fix 回填输入框时会要求后续执行把 `requestedFixExecutionResults` 写入 evidence/artifact metadata，字段覆盖 requestedFix、executionStatus、regressionOutcome、resultRef 与 artifactIds/artifactPaths；`artifact_snapshot` 带回该 metadata 后会即时进入 `work_board`，该增量只消费真实 source 回写契约，不伪造完成态。
- 已补 Team formation assignment source：发送前生成本地 Team formation 时，会通过 `teamFormationAgentUiProjection.ts` 记录 `team.changed(surface=team_roster)`、`agent.changed(surface=team_roster/control=assign)` 与 `task.changed(surface=work_board/control=assign)`；Team control 操作也已携带当前 `sessionId`，避免 summary panel 过滤不到 wait/resume/close/stop 事件。
- 已补 TaskUpdate owner_change reassignment source：`TaskUpdateTool` 在 owner 真正变化时输出结构化 `ownerChange` / `owner_change`；`agentUiEventProjection.ts` 只从 `item_completed + tool_call(TaskUpdate) + metadata.updated_fields includes owner` 派生 `work_board` assign/reassign，保留 previous/next assignee 与 source tool/task list id，不从 `task_assignment` peer message、assistant prose 或 teammate transcript 反推负责人变化。
- 已补 Review request actual source：`HarnessStatusPanel` 导出人工审核模板时，除了 `review.requested` evidence event，还会记录 `team_control_projection(control=request_review)`，以 `review_relative_root` 作为 review work item，落到 `review_lane` 并保留 `sessionId/threadId` scope。
- 已补 Remote teammate actual source baseline：`remoteTaskAgentUiProjection.ts` 提供 `remote_task_projection`，将结构化 remote task 映射为 `agent.changed/task.changed(surface=remote_teammate, runtimeEntity=external_task)`，保留 Agent Card、remote task id、input/auth、artifact refs，并且只在真实 terminal status 下输出 `worker.notification`，避免 heartbeat 猜完成；input/auth need 会额外输出 `action.required(surface=remote_teammate, control=answer)`，让远端待输入 / 待鉴权成为结构化 HITL fact；当 `remote_task` provenance 提供 `event/taskStatus/status/state/phase` 或嵌套 `task/a2aTask` artifact updates 时也会进入同一 projection，terminal `AgentRun.status` 仍优先压过 stale remote/input/auth source；`agentUiEventProjection.ts` 内的旧 remote teammate builder 已改为兼容 wrapper，统一委托该 helper。2026-05-10 已把 `gateway_channel_*` / gateway crate 接到 current source：渠道 runtime 写入 `source_metadata.remote_task`，`agent_runs.metadata` 保留 provenance，`useRemoteTaskExecutionRunProjection` 再按当前 session 投影到 Subagents；剩余原生 A2A ingress 与 remote artifact store/content 回流已登记为 future product boundary。
- 已补 active stream overlay 收口：`text_delta` 继续走低频 overlay 实时显示，`final_done` 后回填到 message content/contentParts；失败态保留已有 tool/process contentParts 并追加失败正文，避免“无最终正文”错误把工具过程清空。
- 已完成 2026-05-10 final gate fresh 复验：`npm run verify:local` 统一门禁通过，覆盖 app-version、lint、typecheck、Vitest smart 52 批、contracts、Rust 全量与 GUI smoke；此前旧 stale gate / DevBridge 不可用问题已由 fresh unified gate 证据替代，不再阻塞 v0.6.0 标准对齐完成判定。

## 8.1 2026-05-10 final gate green

- 统一门禁：`npm run verify:local` fresh 通过；local-ci smart 模式在无 source 改动下执行全量兜底，覆盖一致性校验、前端校验、bridge/contracts、GUI smoke 与 Rust 校验。
- 前端与契约门禁：`npm run verify:app-version` 通过（版本 `1.32.0`），`npm run lint` 通过，`npm run typecheck` 通过，`npm test` 通过（Vitest smart 52 批），`npm run test:contracts` 通过，`npm run check:agent-runtime-clients` 通过，`npm run harness:doc-freshness` clean。
- Rust 门禁：`npm run verify:local` 内的 `cargo test --manifest-path lime-rs/Cargo.toml` 通过；修复本地 `lime-rs/target` 构建缓存后，单独复核 `cargo test --manifest-path "lime-rs/Cargo.toml"` 也通过：`lime` root unit tests 1295 passed，`src/main.rs` 0 passed，integration tests 2 passed，真实联网测试 2 ignored。
- GUI 门禁：`npm run verify:local` 内的 `npm run verify:gui-smoke` 通过；覆盖 DevBridge health、前端壳、workspace-ready、browser-runtime、site-adapters、agent-service-skill-entry、agent-runtime-tool-surface、agent-runtime-tool-surface-page、knowledge-gui、design-canvas，并完成本轮 smoke Chrome profile 清理。
- 完成判定：Agent UI v0.6.0 projection / Subagents / review lane / work_board / worker notification / remote teammate baseline 已达到可交付门槛。`direct board/team write-back`、`native A2A ingress`、`remote artifact store/content bytes`、`remote control callback`、无人工确认后台执行策略与更深 teammate drilldown 均保持 future product / command boundary，不作为 v0.6.0 完成阻塞项。

## 8.2 2026-05-10 Board/team 直接写回命令边界审计

- 已审计 current 命令边界：`src/lib/api`、App Server / Electron Desktop Host 命令边界、`agentCommandCatalog.json`、`mockPriorityCommands.ts` 与 `defaultMocks` 均没有可复用的 board/team 直接写回命令；`TaskCreate/TaskList/TaskGet/TaskUpdate` 当前是 aster runtime tool / inventory，不是 legacy desktop facade command。
- 已确认真实可写事实源仍是 `TaskUpdateTool`：它通过 `resolve_task_board_state` / `persist_task_board_state` 读写 session task board，并在 owner 变化时输出 `ownerChange` / `owner_change` metadata；Agent UI 只消费该结构化 metadata 派生 `work_board` assign/reassign。
- 已明确不新增临时 UI 本地写回或平行 legacy desktop command。若未来要做无 prompt direct board/team write-back，必须先新增 App Server current method 或 shared task board service，并同步前端网关、Electron / App Server 命令边界、治理目录册与测试 mock，同时解决 runtime `shared_task_list_storage` 与 session `extension_data` 的一致性。
- 因此 v0.6 标准对齐口径调整为：`work_board` / reassignment 的合规 baseline 是 `Subagents selector -> TaskUpdate prompt/runtime turn -> TaskUpdateTool owner_change source -> Agent UI projection`；无 prompt 直接写回归入 future product command boundary，不再作为本轮 projection 对齐阻塞项。

## 8.3 2026-05-10 Playwright E2E 与真实 child context 复验

- 已补浏览器 DevBridge subagent control 命令族：`agent_runtime_spawn_subagent`、`agent_runtime_send_subagent_input`、`agent_runtime_wait_subagents`、`agent_runtime_resume_subagent`、`agent_runtime_close_subagent` 已接入 dispatcher 与 HTTP cooldown bypass，契约仍落在现有 `agent_runtime_*` current 主链；后续不得在 `lime-rs/src/commands/**` 追加新业务逻辑。
- 已补 session store limited history 空会话探测：`get_runtime_session_detail_with_history_page` 不再因为 persisted empty fast path 跳过 runtime overlay / subagent context；`agent_runtime_get_session(parent, { historyLimit })` 能返回 `child_subagent_sessions`，空 child detail 也能返回 `subagent_parent_context`。
- Playwright E2E 复验已覆盖：普通会话 tab 不显示 `AgentUI N` 内部 badge；Subagents `Agent UI v0.6 / 10 events`、10 个 surface、三类 lane、`工作台操作视图`、`Surface 专门视图`、Harness AgentUI 投影、真实 child context 与 console `0 error / 0 warning` 均有证据。
- 证据索引：`internal/exec-plans/agentui-playwright-e2e-2026-05-10.md`；截图与 JSON 位于 `internal/exec-plans/evidence/agentui-e2e-2026-05-10/`，覆盖 session store subagent context、真实 child context、transcript detail focus 与 console final check。
- 复验命令：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent should_probe -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" dev_bridge --lib -- --nocapture`、相关 Vitest / ESLint、`npm run typecheck`、`npm run test:contracts`、`npm run verify:gui-smoke -- --reuse-running` 均通过。
- 已补 child focus `返回主助手` 点击稳定性：embedded Team board sticky header 提升到 `z-40`，返回按钮增加独立可点击层级与 `data-testid`；Playwright harness 证据位于 `internal/exec-plans/evidence/product-backend-ux-e2e-2026-05-10/01-child-focus-return-parent-before-click.png`、`02-return-parent-after-click.png`、`02-return-parent-hit-target.json`、`02-console-errors-return-parent.txt`，点击前命中目标为 `BUTTON`，点击后返回按钮消失，console `0 error / 0 warning`。
- 剩余项继续降级为 E2E 深度增强：让真实 child turn 产出最小 activity preview、避免 requested-fix action 在测试中误触发真实 runtime turn、在 DevBridge `3030` 恢复后用真实 child session 再复跑同一返回路径；这些不阻塞 v0.6.0 标准 baseline 完成判定。

## 8.4 2026-05-10 产品 / 后端 / UI-UX 复测补充

- DevBridge 恢复后已补真实主路径复测：`npm run bridge:health -- --timeout-ms 30000` 通过，`npm run verify:gui-smoke -- --reuse-running --timeout-ms 120000` 通过，覆盖 workspace-ready、browser-runtime、site-adapters、agent-service-skill-entry、agent-runtime-tool-surface、agent-runtime-tool-surface-page、knowledge-gui、design-canvas。
- 契约与类型门禁已补当前轮次复核：`npm run test:contracts` 通过，`npm run typecheck` 通过。
- 项目资料 PRD v3 产品闭环已补真实 E2E：`npm run knowledge:product-e2e -- --timeout-ms 120000` 通过，覆盖首页、状态说明、确认资料、选择创作资料、Agent 结果保存到项目资料、整理新资料，`consoleErrors=0`；仅 memory / hint 读取保留浏览器 mock 噪音，不阻塞项目资料主链。
- Playwright MCP 真实 DevBridge 页面证据已归档：`internal/exec-plans/evidence/product-backend-ux-e2e-2026-05-10/04-home-real-bridge.png`、`05-project-knowledge-real-bridge.png`、`06-claw-new-task-real-bridge.png`、`07-settings-ai-provider-real-bridge.png`、`08-skills-real-bridge.png`；对应 console 文件均为 `Errors: 0, Warnings: 0`。
- 早期 `03-home-bridge-unavailable.png` / `03-console-errors-home-bridge-unavailable.txt` 保留为环境阻塞证据，说明 DevBridge 未监听时首页会产生 bridge 连接错误；该问题已由后续真实 bridge green gate 替代，不再作为当前完成判定阻塞。
- 已补运营级测试审计增量：`npm run agent-qc:check` 通过，manifest `12` 场景 / `8` 个 P0，`issueCount=0`；`npm run agent-qc:qcloop-job -- --risk P0 --check --format json` 可生成 `8` 个 P0 item payload；真实 qcloop job `1778390726823769000` 已跑完并导出 `.lime/qc/agent-qc-evidence.json`，结果为 `status=fail`、`8` 个 P0 中 `2` pass / `6` fail；`npm run harness:eval` 与 `npm run harness:eval:trend` 通过，但 trend 仅有 1 个样本，不能作为长期退化完成证据。
- 已补 Skill Forge / sandbox 边界点检：`node scripts/prompt-to-artifact-smoke.mjs --timeout-ms 120000 --json` 通过，覆盖 Capability Draft create -> verify -> register -> discovery -> workspace binding readiness，结果为 `ready_for_manual_enable` / `manual_runtime_enable`；`cd lime-rs && cargo test test_build_workspace_shell_allow_pattern -- --nocapture` 通过 3 tests，覆盖 workspace shell allowlist / strict mode 拒绝高风险命令。
- 已补 Claw 流式 / 中断 / 恢复手工 Playwright transcript：`internal/exec-plans/evidence/product-backend-ux-e2e-2026-05-10/11-claw-streaming-*.png`、`11-claw-streaming-console-2026-05-10.txt`、`11-claw-streaming-runtime-session.json`、`11-claw-streaming-thread-read.json`、`11-claw-streaming-summary.json`。结论不是 pass：UI stop 可点击且 follow-up 最终 `恢复成功`，但被停止的长 turn `a9220dae-54d1-48bc-a83a-fe6b33a034dc` 仍以 `completed` 落盘并完整包含 80 条输出，follow-up 曾短暂 `queuedTurnsCount=1`；这把 `claw-chat-ready-streaming` 明确归类为 runtime cancel 语义阻塞，而不是单纯证据不足。
- 完成度审计结论：本文件的 v0.6.0 Agent UI baseline 与本轮产品主路径可交付；active goal 仍不能标记 complete，因为 qcloop Evidence Pack 仍非 pass，且 release package artifact、Claw runtime cancel 语义、approval runtime transcript、Skill Forge runtime enable + SkillTool 执行 transcript 与真实远端 A2A / artifact content 仍未被完整证据覆盖。

## 9. 既有实施记录摘要

- 已新增标准 adapter：`agentUiEventProjection.ts` 负责 source event -> Agent UI envelope，覆盖 text、reasoning、runtime、tool、action、artifact、context、queue、subagent、evidence helper 与 timeline item。
- 已接入 reducer 边界：`agentStreamRuntimeHandler.ts` 在处理事件前记录标准 projection，不改变现有 `contentParts` 顺序与 UI 渲染行为。
- 已扩展 projection store：`conversationProjectionStore.ts` 增加 `agentUi` slice，并按 run/tool/action/artifact/evidence 建最新索引。
- 已补 tool lifecycle：MCP progress/log/custom notification、OpenAI compatible、OpenAI Responses、Anthropic provider tool input delta 均保留为真实 source event，再投影为 `tool.*`。
- 已补 HITL/action：plan approval request/response、tool confirmation、ask/elicitation、runtime `action_resolved` 均进入结构化 projection，不从 assistant prose 或 peer message XML/JSON 文本反推。
- 已补 queue/steer/task capsule：`queue_added/started/removed/cleared` 映射为 `queue.changed` 与 `task.changed/control=steer|remove`。
- 已补 subagent stream 投影入口：`runtimeEventSubscriptions.ts` 将 team workspace 的 `subagent_status_changed` 与 `agent_subagent_stream:<session>` 写入 `conversationProjectionStore.agentUi`。
- 已补 automation job 投影入口：`buildAgentUiAutomationJobProjectionEvents` 与 `recordAutomationJobAgentUiProjection` 将结构化 automation job record 投影为 `automation_job` runtime entity，并接入 SceneApp / Service Skill 自动化创建路径。
- 已补 projection 消费收口：`agentUiProjectionSummary.ts`、`useConversationProjectionStore.ts`、`TaskCenterTabStrip`、`AgentThreadTimelineArtifactCard`、`AgentThreadReliabilityPanel`、`HarnessStatusPanel` 已开始按 scoped selector 消费标准投影。
- 已补相关回归测试：adapter、store、runtime handler、provider tool delta、MCP notification、hydration、metrics、Harness evidence、TaskCenter、Artifact、Diagnostics、team runtime subscription、v0.6 Subagents surface summary 均已有定向覆盖；下一步重点补 controls adapter 与 richer lane 级 UI 回归。

## 10. 与路线图主线关系

这份文件继续服务 `internal/roadmap/agentui/README.md` 的主目标：AgentUI 不是聊天页，而是 `Conversation + Process + Task + Artifact + Evidence + Subagents` 工作台。Thinking UI 的修复只是 P0 体感缺口；v0.6.0 的 flow/taxonomy 用于约束后续每一刀都回到同一条 current projection 主链。

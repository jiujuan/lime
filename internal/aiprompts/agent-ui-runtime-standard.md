# Agent UI / Runtime 标准边界

本文是 Lime 仓库内 Agent UI / Agent Runtime 前后端标准化的集中事实源。它约束四个标准包、App Server current 主链、宿主接入方式和主聊天旧 projection 的迁移分类。

外部项目只能作为参考。Lime 的标准实现必须以本仓库 current 主链、现有 App Server JSON-RPC、React 宿主和实际业务对象为准。

## 事实源声明

后续新增 Agent UI / Runtime 能力默认收敛到：

```text
App Server JSON-RPC current methods
  -> @limecloud/agent-runtime-client
  -> execution events / Agent UI adapter events
  -> @limecloud/agent-ui-contracts
  -> @limecloud/agent-runtime-projection
  -> @limecloud/agent-runtime-ui 或宿主 presentation adapter
```

不得新增第二套 runtime fact source，不得让 React 组件本地树、宿主页面状态、legacy desktop facade、renderer mock 或业务卡片成为 runtime 事实源。

## 四包职责

| 包 | 分类 | 拥有的事实 | 禁止承接 |
| --- | --- | --- | --- |
| `@limecloud/agent-runtime-client` | current runtime facade | `agentSession/turn/start`、`agentSession/turn/cancel`、`agentSession/action/respond`、`agentSession/read`、`evidence/export`、`agentSession/event` 的 TypeScript facade；browser-safe 子路径 `@limecloud/agent-runtime-client/sessionGateway` 提供 `createAgentRuntimeClientFromSessionGateway(...)`，把已有 App Server session gateway 适配为标准 lifecycle client | 新 JSON-RPC method、Electron IPC、legacy command、mock fallback、独立 `readTask` 协议、宿主业务 session 创建 |
| `@limecloud/agent-ui-contracts` | current 类型事实源 | execution event、Agent UI adapter event、message parts、process timeline、execution graph、Subagents、projection state、projector interface | 投影逻辑、React 组件、JSON-RPC client、session store、业务对象 |
| `@limecloud/agent-runtime-projection` | current headless projection | event store index、scope selector、latest selector、summary selector、read model、`projectAgentUiState`、`createAgentUiProjector`、`buildAgentUiSubagentsModel` | React、DOM、i18n hook、App Server client、Electron bridge、mock、宿主业务路径 |
| `@limecloud/agent-runtime-ui` | current React primitives | `AgentUiProjectionState` 的标准渲染组件、message parts、timeline、execution graph、Subagents、tool/action/artifact/evidence 事实展示、action intent callbacks | JSON-RPC 订阅、session 持久化、业务路由、全局主题、Prompt/知识库/素材/审核业务壳 |

`@limecloud/app-server-client` 仍是底层 App Server JSON-RPC 与 sidecar lifecycle client；`@limecloud/agent-runtime-client` 是对外标准 facade，不是第二套协议。

## Canonical 包命名决策

当前标准包名以仓库已落地的四包为准：

```text
@limecloud/agent-runtime-client
@limecloud/agent-ui-contracts
@limecloud/agent-runtime-projection
@limecloud/agent-runtime-ui
```

早期讨论中出现过的 `@limecloud/agent-ui-projection`、`@limecloud/agent-ui-react` 只代表职责草案，不再作为物理包名、workspace alias、发布包或过渡别名。后续不得新增这些平行包，否则会让 projection 与 React primitives 出现两套 API 面。

命名理由：

1. `agent-runtime-projection` 表示输入是 runtime execution events，输出是跨宿主 UI projection state；它不属于某个 UI 宿主。
2. `agent-runtime-ui` 表示组件只消费 runtime projection state，不订阅 runtime、不持有 session store。
3. `agent-ui-contracts` 保留 UI 合同命名，因为它定义的是 adapter event、message parts、timeline、graph 和 projection state 的共享类型。
4. `agent-runtime-client` 保留 runtime client 命名，因为它只封装 App Server current runtime facade，不定义 UI 合同。

契约守卫必须扫描 `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts` 和 `packages/*/package.json`，确保不会新增 `@limecloud/agent-ui-projection` 或 `@limecloud/agent-ui-react`。

## 标准包实现结构

`@limecloud/agent-runtime-projection` 必须按职责拆分：

```text
src/actions.ts     -> HITL action.required / action.resolved projection helpers
src/artifactEvents.ts -> artifact_snapshot projection helpers
src/contextEvents.ts -> context_trace / turn_context projection helpers
src/conversationEvents.ts -> message / text delta / reasoning delta projection helpers
src/contracts.ts   -> contracts 类型转导
src/diagnosticEvents.ts -> warning / cost metric projection helpers
src/envelope.ts    -> Agent UI event base fields / runtime entity envelope / sequence helper
src/eventStore.ts  -> Agent UI event store / scope / latest selectors
src/hydrationEvents.ts -> historical hydration projection helpers
src/lifecycle.ts   -> session.opened / run lifecycle / runtime team / model routing / task profile projection helpers
src/normalization.ts -> 字段读取、文本预览、ID 列表与 payload compact
src/planApproval.ts -> plan approval metadata parser / action projection builders
src/permissionEvents.ts -> runtime_status permission.changed projection helpers
src/queueEvents.ts -> queue_added / queue lifecycle projection helpers
src/refs.ts        -> artifact refs 等跨宿主引用提取
src/routing.ts     -> routing run.status / decision payload projection helpers
src/runtimeFacts.ts -> runtime entity/status/phase/topology 标准事实解释
src/summary.ts     -> host-neutral summary / surface / lane selectors
src/subagents.ts   -> AgentUiSubagentsModel 标准模型 selector
src/threadItems.ts -> thread item -> AgentUiProjectionEvent builders / action item builders / subagent activity builders / task owner metadata parser
src/toolEvents.ts  -> tool_start / tool_end / tool_progress / tool delta -> AgentUiProjectionEvent builders
src/readModel.ts   -> execution events -> read model
src/uiState.ts     -> execution events -> AgentUiProjectionState / projector
src/index.ts       -> barrel exports only
```

`src/index.ts`、历史残留的 `src/index.js` 和 `src/index.d.ts` 只能做转导。它们不得重新承接实现、类型定义或旧生成物。

`@limecloud/agent-runtime-ui` 必须按 React primitive 职责拆分：

```text
src/types.ts            -> 公共 props / callback / message 类型
src/labels.ts           -> 默认 label、status 和 meta formatter
src/messages.tsx        -> AgentTimeline / UIMessagePartsView
src/processTimeline.tsx -> ProcessTimelineView
src/executionGraph.tsx  -> ExecutionGraphView
src/refs.tsx            -> ArtifactRefList / EvidenceRefList / AgentUiRefList
src/runtimeFacts.tsx    -> RuntimeFactsPanel / RuntimeFactCard / action/tool lists
src/subagents.tsx       -> SubagentsView / SubagentThreadList / SubagentDelegationList / SubagentActivityList
src/projectionView.tsx  -> AgentUiProjectionView 标准组合入口
src/index.ts            -> barrel exports only
```

`src/index.ts` 只能转导。新增 primitive 必须落在对应职责文件，或先新增职责明确的小模块；不得把实现重新合并回单文件。

`@limecloud/agent-runtime-client`、`@limecloud/agent-ui-contracts`、`@limecloud/agent-runtime-projection` 只能依赖同包相邻模块、底层协议/client 类型和标准 contracts；它们禁止依赖 React、DOM、宿主业务路径、桥接、mock 或网络传输。

`@limecloud/agent-runtime-ui` 是唯一允许依赖 React peer dependency 的标准 UI 包。它只能消费 `AgentUiProjectionState` 并通过 props / callback 与宿主交互，不能持有运行时连接、session store、全局 i18n hook 或业务路由。

标准包源码共同禁止依赖：

- `@/` alias
- `src/components/**`
- `src/features/**`
- i18n hook / host store / business route
- `safeInvoke` / Electron bridge
- `mockPriorityCommands` / `defaultMocks` / `invokeMockOnly`
- `fetch` / `EventSource` / WebSocket / model provider HTTP

## 宿主接入标准

新 Agent UI 页面默认按以下顺序接入：

1. 宿主通过 `AgentRuntimeClient` 或 current App Server client 获取 runtime events / read model。
2. 宿主把 App Server 事件投影为标准 `AgentRuntimeExecutionEvent` 或 `AgentUiProjectionEvent`。
3. 宿主调用 `projectAgentUiState(...)` 或标准 event store / summary selector。
4. 标准 UI 走 `AgentUiProjectionView`；业务页面可使用自己的 presentation adapter。
5. 用户 action 只通过 callback 返回宿主，由宿主调用 current action respond / business route。

宿主可以保留：

- 本地化 label、文案 formatter、aria/title 文案。
- 业务对象卡片，例如 Prompt 草稿、文章版本、素材、审核任务。
- 页面布局、导航、抽屉、弹窗、快捷操作。
- 对 App Server snapshot 的业务物化和去重策略。

宿主不得保留：

- scope 匹配、latest event index、artifact / evidence / action lookup 的本地重写。
- action / task / artifact / evidence / diagnostics 分组的本地重写。
- Subagents 线程、委派调用、活动摘要、隔离摘要聚合的本地重写。
- 从 UI 状态反推 runtime fact 的逻辑。
- mock fallback 或 legacy command fallback。

## 主聊天迁移分类

`src/components/agent/chat/projection/**` 不是新的公共标准层。当前分类如下：

| 路径 / 能力 | 分类 | 说明 | 退出条件 |
| --- | --- | --- | --- |
| `projectionBase.ts` | compat adapter | 只允许把主聊天 `AgentEvent` 的 `type` / `item.type` 映射到标准 `buildAgentUiProjectionBase` 与 `sequenceAgentUiProjectionEvents` | 周边投影模块改为直接消费标准 helper 后删除 |
| `actionProjection.ts` | compat adapter | 只允许把主聊天 `action_required` / `action_resolved` 字段映射到标准 `buildAgentUiActionRequiredEvent` 与 `buildAgentUiActionResolvedEvent` | 周边投影模块改为直接消费标准 action helper 后删除 |
| `conversationEventProjection.ts` | compat adapter | 只允许把主聊天 `message` / `text_delta` / `text_delta_batch` / `thinking_delta` 字段映射到标准 `buildAgentUiMessageSnapshotEvent` / `buildAgentUiTextDeltaEvent` / `buildAgentUiReasoningDeltaEvent`；message snapshot、文本 delta 和 reasoning delta 的 owner/scope/phase/surface/persistence/payload 已由标准 helper 接管 | 周边投影模块改为直接消费标准 conversation helper 后删除 |
| `contextProjection.ts` | compat adapter | 只允许把主聊天 `turn_context` 字段映射到标准 `buildAgentUiTurnContextEvents`；context.changed 与 turn-context 来源 permission.changed 的 owner/scope/phase/surface/persistence/payload/refs 已由标准 helper 接管 | 周边投影模块改为直接消费标准 turn context helper 后删除 |
| `artifactProjection.ts` | compat adapter | 只允许把主聊天 `artifact_snapshot` / `context_trace` 字段映射到标准 `buildAgentUiArtifactSnapshotEvent` / `buildAgentUiContextTraceEvent`；artifact.preview.ready / artifact.updated 与 context.changed 的 owner/scope/phase/surface/persistence/payload/refs 已由标准 helper 接管 | 周边投影模块改为直接消费标准 artifact / context helper 后删除 |
| `diagnosticProjection.ts` | compat adapter | 只允许把主聊天 `warning` / `cost_estimated` / `cost_recorded` 字段映射到标准 `buildAgentUiWarningEvent` / `buildAgentUiCostMetricEvent`；diagnostic.changed 与 metric.changed 的 owner/scope/phase/surface/persistence/payload 已由标准 helper 接管 | 周边投影模块改为直接消费标准 diagnostic helper 后删除 |
| `historicalMessageHydrationProjection.ts` | compat adapter | 只允许保留主聊天 MessageList 候选筛选、延迟计数和结构内容判断；`session.hydrated` / `messages.snapshot` / stale `diagnostic.changed` 的 owner/scope/phase/surface/persistence/payload/refs 必须委托标准 `buildAgentUiHistoricalHydrationEvents` | 周边投影模块改为直接消费标准 hydration helper 后删除通用事件构建 adapter |
| `planApprovalProjection.ts` | compat adapter | 只允许薄转导标准 `buildAgentUiPlanApprovalRequiredEvent` / `buildAgentUiPlanApprovalResolvedEvent` / `extractAgentUiPlanApprovalProjection` / `extractAgentUiPlanApprovalResponseProjection`，不得保留本地 metadata parser 或 action event builder | 周边投影模块改为直接消费标准 plan approval helper 后删除 |
| `permissionProjection.ts` | compat adapter | 只允许把主聊天 `runtime_status.status.metadata` 映射到标准 `buildAgentUiRuntimePermissionChangedEvent`；runtime status 来源 permission.changed 的 actionId/control/phase/surface/persistence/payload 已由标准 helper 接管 | 周边投影模块改为直接消费标准 permission helper 后删除 |
| `queueProjection.ts` | compat adapter | 只允许把主聊天 `queue_added` / `queue_removed` / `queue_started` / `queue_cleared` 字段映射到标准 `buildAgentUiQueueAddedEvents` / `buildAgentUiQueueLifecycleEvents`；queue.changed 与 task.changed 的 owner/scope/phase/control/runtimeStatus/payload 已由标准 helper 接管 | 周边投影模块改为直接消费标准 queue helper 后删除 |
| `routingProjection.ts` | compat adapter | 只允许把主聊天 routing decision / limit state / limit event 字段映射到标准 `buildAgentUiRoutingStatusEvent`；run.status 的 owner/scope/phase/surface/persistence 与 routing / limit payload 已由标准 helper 接管 | 周边投影模块改为直接消费标准 routing helper 后删除 |
| `runtimeLifecycleProjection.ts` 中 lifecycle / model / task profile 构建 | compat adapter | 只允许把主聊天 `thread_started` / `turn_started` / `turn_completed` / `turn_failed` / `runtime_status` / `model_change` / `task_profile_resolved` 字段映射到标准 `buildAgentUiThreadStartedEvent` / `buildAgentUiRunStartedEvent` / `buildAgentUiRunFinishedEvent` / `buildAgentUiRunFailedEvent` / `buildAgentUiRuntimeStatusEvent` / `buildAgentUiRuntimeTeamChangedEvent` / `buildAgentUiModelChangeEvent` / `buildAgentUiTaskProfileResolvedEvent` | 周边投影模块改为直接消费标准 lifecycle helper 后删除通用兼容构建 |
| `threadItemProjection.ts` 中 thread item 主事件构建 | compat adapter | 只允许把主聊天 `AgentThreadItem` 映射到标准 `buildAgentUiThreadItemEvent` / `buildAgentUiThreadItemBase`，并通过 `extractAgentUiTaskOwnerChangeProjection` 读取 TaskUpdate owner metadata；审批、用户输入、subagent activity、worker notification 和计划审批 metadata 已由标准 helper 接管；旧协作视图附加事件只能作为主聊天 presentation residual 暂留 | 周边投影模块改为直接消费标准 thread item helper 后删除通用兼容构建 |
| `toolEventProjection.ts` | compat adapter | 只允许把主聊天 `tool_start` / `tool_end` / `tool_progress` / `tool_output_delta` / `tool_input_delta` 字段映射到标准 `buildAgentUiTool*` helper；tool lifecycle、artifact refs、diagnostic keys 和 plan approval 附加 action 已由标准 helper 接管 | 周边投影模块改为直接消费标准 tool helper 后删除 |
| `agentUiEventProjection.ts` 中从主聊天事件构建 `AgentUiProjectionEvent` 的代码 | compat adapter | 仍依赖主聊天 `agentProtocol` 和历史事件形状，是迁移输入适配层；通用 envelope / sequence 规则已迁入标准 projection 包 | host-neutral 构建规则继续分批迁入标准 projection 包或 App Server event adapter 后收缩 |
| `conversationProjectionStore.ts` | current host store adapter | 只保留 external store、订阅、stream diagnostics 和兼容导出名，selector 委托标准包 | 标准 store adapter 被两个宿主复用后继续收缩 |
| `agentUiProjectionSummary.ts` 中本地化 label / formatter | current presentation adapter | 只负责中文/本地化展示和主聊天 UI 细节 | 标准 UI package 提供可配置 formatter 后再迁 |
| `agentUiProjectionSummary.ts` 中 selector / event type set / surface lane | moved current | 已迁到 `@limecloud/agent-runtime-projection` | 守卫阻止回流 |
| `agentUiSubagentsViewModel.ts` | compat presentation residual | 只允许消费标准 projection / `state.subagents` / summary selector 后生成主聊天本地 item / chip / action / target 展示模型；不得作为 SDK 类型、组件、state 字段或新宿主 API；旧协作命名文件已退出 projection adapter 命名 | host-neutral selector 下沉到 `@limecloud/agent-runtime-projection` 后，只保留宿主业务 action route；剩余 workspace / 产品测试参数名随产品侧迁移删除 |
| `*.js` / `*.d.ts` 旧生成物残留 | deprecated | 只能做薄转导或待删除，不得保留旧实现 | 删除需要独立确认并同步守卫 |

任何新增 Agent UI 标准 selector 必须先进入 `@limecloud/agent-runtime-projection`；主聊天目录只能做适配、展示和业务交互。

## 第二宿主复用基线

Plugin Runtime 是当前第二个真实宿主基线：

```text
AgentRuntimeClient -> projectAgentUiState -> AgentUiProjectionView

Plugin host run state
  -> buildPluginStandardRuntimeEvents(...)
  -> projectAgentUiState(...)
  -> AgentUiProjectionView
  -> Plugin presentation adapter / action callback
```

`src/features/plugin/runtime/agentRunProjectionState.ts` 负责把 Plugin host run state 经 `buildPluginStandardRuntimeEvents(...)` 投影成标准 execution events，并调用 `projectAgentUiState(...)` 生成标准 `AgentUiProjectionState`。`src/features/plugin/ui/AgentRunHostDrawer.tsx` 必须生成 `standardProjectionState` 并传入 `AgentRunProjectionPanel`；`src/features/plugin/ui/AgentRunProjectionPanel.tsx` 必须接收必填 `standardState` 并直接渲染 `AgentUiProjectionView`，不能只拼装 `UIMessagePartsView`、`ProcessTimelineView`、`ToolGroup`、`ExecutionGraphView` 等内部 primitives 来冒充标准入口，也不能继续渲染旧的 ordered parts / actions / artifacts / evidence / diagnostics 私有 DOM。

Plugin 可以继续保留自己的 summary、运行抽屉、业务对象 presentation adapter 和 `onAction` 回调；这些属于宿主 presentation，不是 runtime fact source。宿主 action 仍必须经 callback 交还宿主，由宿主调用 current action respond 或业务 route，不得让 UI package 直接调用 App Server。

标准 UI 必须支持多 action controls。`AgentRuntimeEventProjection.action` 保持兼容单按钮读取，`AgentRuntimeEventProjection.actions` 承接 approve / reject / answer / retry / stop 等多按钮 intent；`agent-runtime-ui` 只能渲染这些 intent 并回调宿主，不得自行解释业务结果。

Plugin 第二宿主的 runtime client 接入以 `src/features/plugin/runtime/agentRuntimeClientApi.ts` 为 current adapter。`AgentRuntimeCapabilityHost` 可以直接注入 `AgentRuntimeClient`，由该 adapter 把 `lime.agent.startTask/getTask/cancelTask/submitHostResponse` 分别投影到 `startTurn/readThread/cancelTurn/respondAction`。`startTask` 必须携带已经存在的 `sessionId`，缺失时 fail closed，不在前端伪造 session 或独立 `readTask` 协议。adapter 只写入 typed `runtimeOptions.runtimeRequest`；provider、权限、sandbox、system prompt 与 metadata 在该结构内保持唯一事实源。`readThread` 返回的 `detail.thread_read` / `detail.threadRead` 是 Plugin host replay artifact、tool call 和 evidence 的 read model 事实源。

Plugin 默认运行页必须通过 `src/features/plugin/runtime/agentRuntimeAppServerClient.ts` 先调用 App Server current `agentSession/start` 创建或绑定 session，再把该 sessionId 交给 `agentRuntimeClientApi.ts` 进入 `startTurn/readThread/cancelTurn/respondAction`。`readSession -> readThread` 的通用 lifecycle 适配必须复用 `@limecloud/agent-runtime-client/sessionGateway` 的 `createAgentRuntimeClientFromSessionGateway(...)`；Plugin feature 只保留 `plugin.task` business object session resolver 与默认页面装配，不得重新实现私有 session gateway。renderer 运行时代码不得为了取 session gateway 适配器而从 `@limecloud/agent-runtime-client` 根入口导入运行时值，否则会把 Node 侧 App Server client 打进前端包。`src/features/plugin/ui/PluginRuntimePage.tsx` 默认注入 `createDefaultPluginRuntimeHostOptions()`；这条默认宿主链路不得在标准 client 失败后回退 `plugin_runtime_*`、renderer mock 或 desktop-host default mock，而应 fail closed。

`AgentRuntimeCapabilityHost` 默认不再隐式回退 `plugin_runtime_*` compat facade：没有注入标准 `AgentRuntimeClient`，也没有显式传入 compat `api` 时必须 fail closed。`src/lib/api/pluginRuntime.ts` 与 `plugin_runtime_*` 只保留为显式兼容入口和迁移期守卫，服务尚未迁完的既有桌面路径；新增第二宿主能力必须优先走 `AgentRuntimeClient` adapter。compat facade 只能委托、适配和退场，不得复制运行时提交、read model 拼装、tool replay 或 mock fallback。

DevBridge policy 中 `plugin_runtime_*` 必须归类为 no-mock compat：它们可以 fail closed、走真实 Electron Desktop Host / App Server current 通道或作为迁移期显式兼容入口，但不得继续放在 `bridgeTruthCommands` 里充当后续演进事实源，也不得进入 `mockPriorityCommands`、desktop-host default mock 或 renderer mock fallback。

## App Server 与 Runtime 配合

Agent Runtime 后端事实源是 App Server JSON-RPC current 主链：

- turn lifecycle：`agentSession/turn/start`、`agentSession/turn/cancel`
- action lifecycle：`agentSession/action/respond`
- read model：`agentSession/read`
- events：`agentSession/event`
- evidence：`evidence/export`

Electron 只作为 Desktop Host bridge 和 sidecar lifecycle host。新增 runtime 能力不得落到 legacy desktop facade；旧 `agent_runtime_*` 只允许作为 retired guard、历史 evidence、test-only fixture 或退场对象。

`readThread` 当前映射 `agentSession/read`。独立 `readTask` 只能等 App Server current method 出现后再接入，不得在前端 client 包中伪造。

## UI 文案与本地化归属

标准 projection 层输出 semantic facts、status key、action decision、refs 和结构化 state。`agent-runtime-ui` 默认只提供稳定英文 fallback，宿主必须通过 labels / formatter props 注入自己的 aria、标题、按钮和状态文案。展示文案归属：

| 内容 | 归属 |
| --- | --- |
| semantic status / label key | contracts / projection |
| 中文、英文、日文、韩文等展示文本 | 宿主 i18n 注入；UI package 仅提供英文 fallback |
| 业务对象标题、摘要、错误补充说明 | 宿主业务 adapter |
| CSS class contract | `@limecloud/agent-runtime-ui` |
| Lime 桌面具体样式 | Lime GUI 宿主 |

新增用户可见文案必须覆盖 Lime current 五语言资源；标准包不得把某个宿主语言写死为 runtime fact，也不得在 `agent-runtime-ui` 中硬编码 Lime 桌面中文文案。

## 守卫要求

以下规则必须由契约测试或治理脚本守住：

1. projection package `index` 只能做 barrel exports。
2. projection package 不得依赖宿主、React、bridge、mock 或直接网络传输。
3. 主聊天 projection store 必须委托标准 event store selector。
4. 主聊天 summary 必须委托标准 summary selector。
5. 主聊天 projection base 必须委托标准 `buildAgentUiProjectionBase` / `sequenceAgentUiProjectionEvents`，不得重新实现 scope 字段规整、runtime entity 推断或 sequence map。
6. 主聊天 action projection 必须委托标准 `buildAgentUiActionRequiredEvent` / `buildAgentUiActionResolvedEvent`，不得重新实现 HITL control、prompt preview、plan approval response metadata 或 action payload 规则。
7. 主聊天 conversation event projection 必须委托标准 `buildAgentUiMessageSnapshotEvent` / `buildAgentUiTextDeltaEvent` / `buildAgentUiReasoningDeltaEvent`，不得重新实现 `messages.snapshot` / `text.delta` / `reasoning.delta` 的 payload、owner、scope、phase、surface 或 persistence。
8. 主聊天 historical hydration projection 必须委托标准 `buildAgentUiHistoricalHydrationEvents`，不得重新实现 `session.hydrated` / `messages.snapshot` / stale `diagnostic.changed` 的 payload、refs、owner、scope、phase、surface 或 persistence。
9. 主聊天 turn context projection 必须委托标准 `buildAgentUiTurnContextEvents`，不得重新实现 `context.changed` 或 turn-context 来源 `permission.changed` 的 payload、refs、owner、scope、phase、surface 或 persistence。
10. 主聊天 artifact / context trace projection 必须委托标准 `buildAgentUiArtifactSnapshotEvent` / `buildAgentUiContextTraceEvent`，不得重新实现 `artifact.preview.ready` / `artifact.updated` / `context.changed` 的 payload、refs、owner、scope、phase、surface 或 persistence。
11. 主聊天 plan approval projection 必须委托标准 `buildAgentUiPlanApprovalRequiredEvent` / `buildAgentUiPlanApprovalResolvedEvent` / `extractAgentUiPlanApprovalProjection` / `extractAgentUiPlanApprovalResponseProjection`，不得重新实现 plan approval metadata parser 或 action event builder。
12. 主聊天 permission projection 必须委托标准 `buildAgentUiRuntimePermissionChangedEvent`，不得重新实现 runtime status 来源 `permission.changed` 的 metadata detection、phase、control、payload、owner、scope、surface 或 persistence。
13. 主聊天 queue projection 必须委托标准 `buildAgentUiQueueAddedEvents` / `buildAgentUiQueueLifecycleEvents`，不得重新实现 `queue.changed` / `task.changed` 的 payload、owner、scope、phase、control、runtimeStatus 或 queued turn 计数规则。
14. 主聊天 routing projection 必须委托标准 `buildAgentUiRoutingStatusEvent`，不得重新实现 routing / limit `run.status` 的 payload、owner、scope、phase、surface 或 persistence。
15. 主聊天 runtime lifecycle projection 必须委托标准 `buildAgentUiThreadStartedEvent` / `buildAgentUiRunStartedEvent` / `buildAgentUiRunFinishedEvent` / `buildAgentUiRunFailedEvent` / `buildAgentUiRuntimeStatusEvent` / `buildAgentUiRuntimeTeamChangedEvent` / `buildAgentUiModelChangeEvent` / `buildAgentUiTaskProfileResolvedEvent`，不得重新实现 `session.opened` / `run.started` / `run.finished` / `run.failed` / `run.status` / runtime status 来源 `team.changed` / `task.changed` 的 payload、status、phase、model routing、Team runtime metadata / topology 或 task profile 规则。
16. 主聊天 thread item projection 必须委托标准 `buildAgentUiThreadItemEvent` / `buildAgentUiThreadItemBase` / `buildAgentUiThreadItemActionEvent` / `buildAgentUiThreadItemSubagentActivityEvent` / `buildAgentUiThreadItemSubagentWorkerNotificationEvent` / `extractAgentUiTaskOwnerChangeProjection`，不得重新实现 approval request、request user input、subagent activity、worker notification、plan、reasoning、tool、command、web search、artifact、context compaction、turn summary、diagnostics 或 TaskUpdate owner metadata 的通用构造与解析。
17. 主聊天 tool event projection 必须委托标准 `buildAgentUiToolStartEvents` / `buildAgentUiToolEndEvents` / `buildAgentUiToolProgressEvent` / `buildAgentUiToolOutputDeltaEvent` / `buildAgentUiToolInputDeltaEvent`，不得重新实现 `tool.started` / `tool.args` / `tool.result` / `tool.failed` / `tool.progress` / tool delta 的 payload、refs、phase、persistence 或 plan approval 附加 action。
18. 标准包源码不得重新合并为单文件实现。
19. `agent_runtime_*` 不得作为新增 current 能力证据。
20. mock fallback 只能在测试夹具中显式使用。
21. 文档与路线图不得引导新能力回到旧命令或旧 projection 事实源。
22. Plugin Runtime 的标准 projection panel 必须渲染 `AgentUiProjectionView`，证明第二宿主消费同一个 UI 入口。
23. `agent-runtime-ui` 的 `index.ts` 必须保持 barrel exports，React primitives 必须按 messages / processTimeline / executionGraph / runtimeFacts / projectionView 等职责拆分。
25. `agent-ui-contracts` 的 `index.ts` 只能做 barrel exports，events / runtime / projection / messages / timeline / graph 必须按职责拆分。
26. 标准 UI 不得恢复旧私有 tree 命名或旧 Plugin `data-agent-run-projection-*` DOM；过程结构以 message parts、process timeline、execution graph 和 runtime facts 为标准 surface。
27. `agent-runtime-ui` 用户可见文案必须可由 labels / formatter props 注入；默认 fallback 不得替代宿主五语言 i18n。
28. Plugin 第二宿主必须支持注入标准 `AgentRuntimeClient`，并通过 `startTurn/readThread/cancelTurn/respondAction` 进入 App Server current 主链；没有标准 client 或显式 compat `api` 时必须 fail closed。
29. Plugin 标准 client adapter 不得依赖 `safeInvoke`、legacy task command string、renderer mock、desktop-host default mock 或独立 task read protocol。
30. `@limecloud/agent-runtime-client/sessionGateway` 必须提供 browser-safe 的 `createAgentRuntimeClientFromSessionGateway(...)`，把已有 App Server session gateway 适配成 `startTurn/readThread/cancelTurn/respondAction` lifecycle client；宿主 feature 不得复制这段通用映射，也不得从根入口导入该运行时值。
31. Plugin 默认运行页必须注入 App Server-backed 标准 runtime host options，通过 `agentSession/start` 创建 session，再进入标准 client adapter；页面回归必须证明默认 Host Bridge 调用 App Server current methods，且未调用 `plugin_runtime_*` compat facade。
32. `plugin_runtime_*` 不得停留在 DevBridge `bridgeTruthCommands`；只允许作为 no-mock compat residual 和显式兼容入口，且退出条件是所有既有桌面路径迁到标准 `AgentRuntimeClient` / App Server lifecycle 后删除 `src/lib/api/pluginRuntime.ts`。

最低验证入口：

```bash
npm --prefix packages/agent-runtime-projection run test
npm --prefix packages/agent-runtime-ui run test
npm run test:contracts
```

`agentUiSubagentsViewModel.ts` 仍是主聊天 presentation residual 时，可额外跑对应产品侧定向测试；它只能证明 presentation residual 没退化，不能替代标准包验证：

```bash
npx vitest run "src/components/agent/chat/projection/agentUiProjectionSummary.test.ts" "src/components/agent/chat/projection/conversationProjectionStore.test.ts" --silent=passed-only --disableConsoleIntercept
npm run test:contracts
```

如果改动影响 GUI 主路径，还需要按 `quality-workflow.md` 跑对应 GUI smoke 或 Playwright 续测。

## 下一步收缩顺序

1. 给 `agent-ui-contracts` 增加更清晰的 event taxonomy / schema fixture，减少 string-only 事件漂移。
2. 给第二宿主补 Plugin 专项 Electron fixture，直接证明 `AgentRuntimeClient -> Plugin host run state -> projectAgentUiState -> AgentUiProjectionView` 的完整链路；聚合 `verify:gui-smoke` 已作为桌面壳不回归证据，但不能替代第二宿主专项闭环。
3. 继续收缩默认 `plugin_runtime_*` compat facade；当前 DevBridge 已降为 no-mock compat residual，下一刀应删除或替换未注入标准 client 时的默认 fallback。
4. 收缩主聊天旧 projection 的兼容导出名和旧生成物。
5. 将 `agentUiSubagentsViewModel.ts` 的 host-neutral selector 分批下沉为标准 Subagents selector，保留宿主业务 action route，并删除 workspace / 产品测试里的旧命名 residual。

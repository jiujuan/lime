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
| `@limecloud/agent-runtime-client` | current runtime facade | `agentSession/turn/start`、`agentSession/turn/cancel`、`agentSession/action/respond`、`agentSession/read`、`evidence/export`、`agentSession/event` 的 TypeScript facade | 新 JSON-RPC method、Electron IPC、legacy command、mock fallback、独立 `readTask` 协议 |
| `@limecloud/agent-ui-contracts` | current 类型事实源 | execution event、Agent UI adapter event、message parts、process timeline、execution graph、projection state、projector interface | 投影逻辑、React 组件、JSON-RPC client、session store、业务对象 |
| `@limecloud/agent-runtime-projection` | current headless projection | event store index、scope selector、latest selector、summary selector、read model、`projectAgentUiState`、`createAgentUiProjector` | React、DOM、i18n hook、App Server client、Electron bridge、mock、宿主业务路径 |
| `@limecloud/agent-runtime-ui` | current React primitives | `AgentUiProjectionState` 的标准渲染组件、message parts、timeline、execution graph、tool/action/artifact/evidence 事实展示、action intent callbacks | JSON-RPC 订阅、session 持久化、业务路由、全局主题、Prompt/知识库/素材/审核业务壳 |

`app-server-client` 仍是底层 App Server JSON-RPC 与 sidecar lifecycle client；`agent-runtime-client` 是对外标准 facade，不是第二套协议。

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
src/contracts.ts   -> contracts 类型转导
src/envelope.ts    -> Agent UI event base fields / runtime entity envelope / sequence helper
src/eventStore.ts  -> Agent UI event store / scope / latest selectors
src/normalization.ts -> 字段读取、文本预览、ID 列表与 payload compact
src/refs.ts        -> artifact refs 等跨宿主引用提取
src/routing.ts     -> routing decision payload 标准化
src/runtimeFacts.ts -> runtime entity/status/phase/topology 标准事实解释
src/summary.ts     -> host-neutral summary / surface / lane selectors
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
src/runtimeFacts.tsx    -> RuntimeFactsPanel / RuntimeFactCard / action/tool lists
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
- Team Workbench surface / lane 聚合的本地重写。
- 从 UI 状态反推 runtime fact 的逻辑。
- mock fallback 或 legacy command fallback。

## 主聊天迁移分类

`src/components/agent/chat/projection/**` 不是新的公共标准层。当前分类如下：

| 路径 / 能力 | 分类 | 说明 | 退出条件 |
| --- | --- | --- | --- |
| `projectionBase.ts` | compat adapter | 只允许把主聊天 `AgentEvent` 的 `type` / `item.type` 映射到标准 `buildAgentUiProjectionBase` 与 `sequenceAgentUiProjectionEvents` | 周边投影模块改为直接消费标准 helper 后删除 |
| `actionProjection.ts` | compat adapter | 只允许把主聊天 `action_required` / `action_resolved` 字段映射到标准 `buildAgentUiActionRequiredEvent` 与 `buildAgentUiActionResolvedEvent` | 周边投影模块改为直接消费标准 action helper 后删除 |
| `agentUiEventProjection.ts` 中从主聊天事件构建 `AgentUiProjectionEvent` 的代码 | compat adapter | 仍依赖主聊天 `agentProtocol` 和历史事件形状，是迁移输入适配层；通用 envelope / sequence 规则已迁入标准 projection 包 | host-neutral 构建规则继续分批迁入标准 projection 包或 App Server event adapter 后收缩 |
| `conversationProjectionStore.ts` | current host store adapter | 只保留 external store、订阅、stream diagnostics 和兼容导出名，selector 委托标准包 | 标准 store adapter 被两个宿主复用后继续收缩 |
| `agentUiProjectionSummary.ts` 中本地化 label / formatter | current presentation adapter | 只负责中文/本地化展示和主聊天 UI 细节 | 标准 UI package 提供可配置 formatter 后再迁 |
| `agentUiProjectionSummary.ts` 中 selector / event type set / surface lane | moved current | 已迁到 `@limecloud/agent-runtime-projection` | 守卫阻止回流 |
| `agentUiTeamWorkbenchViewModel.ts` | current host view model | 负责主聊天 Team Workbench 的 item / chip / action / target view model | host-neutral selector 继续下沉后保留 presentation 层 |
| `*.js` / `*.d.ts` 旧生成物残留 | deprecated | 只能做薄转导或待删除，不得保留旧实现 | 删除需要独立确认并同步守卫 |

任何新增 Agent UI 标准 selector 必须先进入 `@limecloud/agent-runtime-projection`；主聊天目录只能做适配、展示和业务交互。

## 第二宿主复用基线

Agent App Runtime 是当前第二个真实宿主基线：

```text
Agent App host run state
  -> buildAgentAppStandardRuntimeEvents(...)
  -> projectAgentUiState(...)
  -> AgentUiProjectionView
  -> Agent App presentation adapter / action callback
```

`src/features/agent-app/runtime/agentRunProjectionState.ts` 负责把 Agent App host run state 投影成标准 `AgentUiProjectionState`。`src/features/agent-app/ui/AgentRunProjectionPanel.tsx` 必须接收必填 `standardState` 并直接渲染 `AgentUiProjectionView`，不能只拼装 `UIMessagePartsView`、`ProcessTimelineView`、`ToolGroup`、`ExecutionGraphView` 等内部 primitives 来冒充标准入口，也不能继续渲染旧的 ordered parts / actions / artifacts / evidence / diagnostics 私有 DOM。

Agent App 可以继续保留自己的 summary、运行抽屉、业务对象 presentation adapter 和 `onAction` 回调；这些属于宿主 presentation，不是 runtime fact source。宿主 action 仍必须经 callback 交还宿主，由宿主调用 current action respond 或业务 route，不得让 UI package 直接调用 App Server。

标准 UI 必须支持多 action controls。`AgentRuntimeEventProjection.action` 保持兼容单按钮读取，`AgentRuntimeEventProjection.actions` 承接 approve / reject / answer / retry / stop 等多按钮 intent；`agent-runtime-ui` 只能渲染这些 intent 并回调宿主，不得自行解释业务结果。

## App Server 与 Runtime 配合

Agent Runtime 后端事实源是 App Server JSON-RPC current 主链：

- turn lifecycle：`agentSession/turn/start`、`agentSession/turn/cancel`
- action lifecycle：`agentSession/action/respond`
- read model：`agentSession/read`
- events：`agentSession/event`
- evidence：`evidence/export`

Electron 只作为 Desktop Host bridge 和 sidecar lifecycle host。新增 runtime 能力不得落到 legacy desktop facade；旧 `agent_runtime_*` 只允许作为兼容委托或退场对象。

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
7. 标准包源码不得重新合并为单文件实现。
8. `agent_runtime_*` 不得作为新增 current 能力证据。
9. mock fallback 只能在测试夹具中显式使用。
10. 文档与路线图不得引导新能力回到旧命令或旧 projection 事实源。
11. Agent App Runtime 的标准 projection panel 必须渲染 `AgentUiProjectionView`，证明第二宿主消费同一个 UI 入口。
12. `agent-runtime-ui` 的 `index.ts` 必须保持 barrel exports，React primitives 必须按 messages / processTimeline / executionGraph / runtimeFacts / projectionView 等职责拆分。
13. `agent-ui-contracts` 的 `index.ts` 只能做 barrel exports，events / runtime / projection / messages / timeline / graph 必须按职责拆分。
14. 标准 UI 不得恢复旧私有 tree 命名或旧 Agent App `data-agent-run-projection-*` DOM；过程结构以 message parts、process timeline、execution graph 和 runtime facts 为标准 surface。
15. `agent-runtime-ui` 用户可见文案必须可由 labels / formatter props 注入；默认 fallback 不得替代宿主五语言 i18n。

最低验证入口：

```bash
npm --prefix packages/agent-runtime-projection run test
npx vitest run "src/components/agent/chat/projection/agentUiProjectionSummary.test.ts" "src/components/agent/chat/projection/conversationProjectionStore.test.ts" "src/components/agent/chat/projection/agentUiTeamWorkbenchViewModel.test.ts" --silent=passed-only --disableConsoleIntercept
npm run test:contracts
```

如果改动影响 GUI 主路径，还需要按 `quality-workflow.md` 跑对应 GUI smoke 或 Playwright 续测。

## 下一步收缩顺序

1. 继续把 `agentUiEventProjection.ts` 中 host-neutral 的事件构建规则迁入标准 projection 包或 App Server event adapter，下一步优先收 thread item / lifecycle / action 的标准 event builder。
2. 给 `agent-ui-contracts` 增加更清晰的 event taxonomy / schema fixture，减少 string-only 事件漂移。
3. 让第二个真实宿主完整消费 `AgentRuntimeClient -> projectAgentUiState -> AgentUiProjectionView`。
4. 收缩主聊天旧 projection 的兼容导出名和旧生成物。
5. 将重复出现的 Team Workbench view model selector 分批下沉，保留宿主业务 action route。
